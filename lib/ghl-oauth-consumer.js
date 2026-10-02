const { getGhlContext, requireProPlan } = require("./ghl-account");
const { createGhlOAuth } = require("./ghl-oauth");

const READ_ROUTES = new Set(["athletes", "dashboard", "groups", "meets", "training-plan", "athlete-best", "athlete-profile"]);

async function attachBuyerOAuthReadContext(req, res, route, deps = {}) {
  const env = deps.env || process.env;
  if (req.method !== "GET" || !READ_ROUTES.has(route)) return true;
  const context = getGhlContext(req);
  const allowed = String(env.SMARTCOACH_GHL_OAUTH_READ_ACCOUNTS || "").split(/[,\s]+/).filter(Boolean);
  if (!allowed.includes(context.accountKey)) return true;
  if (!(deps.authorize || requireProPlan)(req, res)) return false;
  try {
    const grant = await (deps.oauth || createGhlOAuth()).readConsumerGrant(context.accountKey, context.locationId);
    if (grant.locationId !== context.locationId || !grant.access_token) throw new Error("Identity mismatch");
    req.smartcoachOAuthContext = { accountKey: context.accountKey, locationId: context.locationId, token: grant.access_token };
    res.setHeader("X-SMARTCoach-CRM-Auth", "oauth");
    return true;
  } catch (_) {
    // An enabled OAuth account must not silently bypass revoked installation with its PIT.
    res.status(503).json({ error: "Buyer OAuth CRM connection could not be verified. Contact support.", buyerOAuthRequired: true });
    return false;
  }
}

module.exports = { attachBuyerOAuthReadContext };
