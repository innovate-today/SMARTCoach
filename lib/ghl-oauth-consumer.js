const { getGhlContext, requireProPlan } = require("./ghl-account");
const { createGhlOAuth } = require("./ghl-oauth");

const READ_ROUTES = new Set(["athletes", "dashboard", "groups", "meets", "training-plan", "athlete-best", "athlete-profile"]);
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
};

async function attachBuyerOAuthContext(req, res, route, deps = {}) {
  const env = deps.env || process.env;
  const context = getGhlContext(req);
  const accounts = (name) => String(env[name] || "").split(/[,\s]+/).filter(Boolean);
  const writesEnabled = accounts("SMARTCOACH_GHL_OAUTH_WRITE_ACCOUNTS").includes(context.accountKey);
  const readEnabled = writesEnabled || accounts("SMARTCOACH_GHL_OAUTH_READ_ACCOUNTS").includes(context.accountKey);
  const readiness = writesEnabled && route === "account-status" && req.method === "GET";
  const reading = req.method === "GET" && (READ_ROUTES.has(route) || readiness);
  const write = WRITE_ROUTES[route];
  if (!writesEnabled && (!reading || !readEnabled)) return true;
  if (req.method === "OPTIONS") return true;
  if (!readiness && !(deps.authorize || requireProPlan)(req, res)) return false;
  try {
    if (!reading && (!write || !write.methods.includes(req.method))) throw new Error("Unsupported OAuth operation");
    const grant = await (deps.oauth || createGhlOAuth()).readConsumerGrant(context.accountKey, context.locationId);
    if (grant.locationId !== context.locationId || !grant.access_token) throw new Error("Identity mismatch");
    if (!reading) {
      const scopes = new Set(String(grant.scope || "").split(/\s+/));
      if (!write.scopes.every(scope => scopes.has(scope))) throw new Error("Required write scope missing");
    }
    req.smartcoachOAuthContext = { accountKey: context.accountKey, locationId: context.locationId, token: grant.access_token };
    res.setHeader("X-SMARTCoach-CRM-Auth", "oauth");
    return true;
  } catch (_) {
    // Enabled OAuth operations never retry with the saved PIT after any verification failure.
    res.status(503).json({ error: "Buyer OAuth CRM connection could not be verified. Contact support.", buyerOAuthRequired: true });
    return false;
  }
}

module.exports = { attachBuyerOAuthContext, attachBuyerOAuthReadContext: attachBuyerOAuthContext };
