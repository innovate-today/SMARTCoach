const { getGhlContext, requireProPlan } = require("./ghl-account");
const { createGhlOAuth } = require("./ghl-oauth");

const READ_ROUTES = new Set(["athletes", "dashboard", "groups", "meets", "training-plan", "athlete-best", "athlete-profile"]);
const ROLLOUT_READ_ROUTES = new Set(["records", "athlete-calendar", "attendance", "sync-diagnostics"]);
const RECORD_SCOPES = ["locations.readonly", "objects/record.readonly", "objects/record.write"];
const CONTACT_SCOPES = ["locations.readonly", "contacts.readonly", "contacts.write", "locations/customFields.readonly"];
const WRITE_ROUTES = {
  athletes: { methods: ["POST", "PUT", "PATCH"], scopes: [...CONTACT_SCOPES, "objects/record.readonly"] },
  groups: { methods: ["POST"], scopes: RECORD_SCOPES },
  meets: { methods: ["POST", "PATCH", "DELETE"], scopes: RECORD_SCOPES },
  "training-plan": { methods: ["POST"], scopes: RECORD_SCOPES },
  "athlete-best": { methods: ["POST", "DELETE"], scopes: RECORD_SCOPES },
  "sync-session": { methods: ["POST"], scopes: [...RECORD_SCOPES, ...CONTACT_SCOPES] },
  "manual-mileage": { methods: ["POST"], scopes: [...RECORD_SCOPES, ...CONTACT_SCOPES] },
  "meet-result": { methods: ["POST"], scopes: [...RECORD_SCOPES, ...CONTACT_SCOPES] },
  correction: { methods: ["POST"], scopes: [...RECORD_SCOPES, ...CONTACT_SCOPES] },
  records: { methods: ["POST", "PATCH", "DELETE"], scopes: RECORD_SCOPES },
  "athlete-calendar": { methods: ["POST"], scopes: [...RECORD_SCOPES, ...CONTACT_SCOPES] },
};

async function attachBuyerOAuthContext(req, res, route, deps = {}) {
  const env = deps.env || process.env;
  const context = getGhlContext(req);
  const accounts = (name) => String(env[name] || "").split(/[,\s]+/).filter(Boolean);
  const writesEnabled = accounts("SMARTCOACH_GHL_OAUTH_WRITE_ACCOUNTS").includes(context.accountKey);
  const readEnabled = writesEnabled || accounts("SMARTCOACH_GHL_OAUTH_READ_ACCOUNTS").includes(context.accountKey);
  const readiness = writesEnabled && route === "account-status" && req.method === "GET";
  const reading = req.method === "GET" && (READ_ROUTES.has(route) || readiness || writesEnabled && ROLLOUT_READ_ROUTES.has(route));
  const write = WRITE_ROUTES[route];
  if (!writesEnabled && (!reading || !readEnabled)) return true;
  if (req.method === "OPTIONS") return true;
  if (!readiness && !(deps.authorize || requireProPlan)(req, res)) return false;
  try {
    if (!reading && (!write || !write.methods.includes(req.method))) throw new Error("Unsupported OAuth operation");
    const grant = req.smartcoachOAuthContext ? { locationId: req.smartcoachOAuthContext.locationId,
      access_token: req.smartcoachOAuthContext.token, scope: req.smartcoachOAuthContext.scope }
      : await (deps.oauth || createGhlOAuth()).readConsumerGrant(context.accountKey, context.locationId);
    if (grant.locationId !== context.locationId || !grant.access_token) throw new Error("Identity mismatch");
    if (!reading) {
      const scopes = new Set(String(grant.scope || "").split(/\s+/));
      if (!write.scopes.every(scope => scopes.has(scope))) throw new Error("Required write scope missing");
    }
    req.smartcoachOAuthContext = { accountKey: context.accountKey, locationId: context.locationId, token: grant.access_token, scope: grant.scope };
    res.setHeader("X-SMARTCoach-CRM-Auth", "oauth");
    return true;
  } catch (_) {
    // Enabled OAuth operations never retry with the saved PIT after any verification failure.
    res.status(503).json({ error: "Buyer OAuth CRM connection could not be verified. Contact support.", buyerOAuthRequired: true });
    return false;
  }
}

async function buyerCrmToken(account, requiredScopes = [], deps = {}) {
  const env = deps.env || process.env;
  const enabled = String(env.SMARTCOACH_GHL_OAUTH_WRITE_ACCOUNTS || "").split(/[,\s]+/).includes(account && account.accountKey);
  if (!enabled) return account && account.token;
  try {
    const grant = await (deps.oauth || createGhlOAuth()).readConsumerGrant(account.accountKey, account.locationId);
    const scopes = new Set(String(grant.scope || "").split(/\s+/));
    if (!grant.access_token || grant.locationId !== account.locationId || !requiredScopes.every(scope => scopes.has(scope))) throw new Error("Grant mismatch");
    return grant.access_token;
  } catch (_) {
    throw Object.assign(new Error("Buyer OAuth CRM connection could not be verified. Contact support."), { statusCode: 503 });
  }
}

module.exports = { attachBuyerOAuthContext, attachBuyerOAuthReadContext: attachBuyerOAuthContext, buyerCrmToken };
