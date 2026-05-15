const handlers = {
  "athlete-best": require("../ghl/athlete-best"),
  "athlete-profile": require("../ghl/athlete-profile"),
  athletes: require("../ghl/athletes"),
  dashboard: require("../ghl/dashboard"),
  "manual-mileage": require("../ghl/manual-mileage"),
  correction: require("../ghl/correction"),
  "meet-result": require("../ghl/meet-result"),
  meets: require("../ghl/meets"),
  "sync-session": require("../ghl/sync-session"),
  "training-plan": require("../ghl/training-plan"),
};
const { getGhlContext, requireProPlan } = require("../../lib/ghl-account");

module.exports = async function handler(req, res) {
  const route = Array.isArray(req.query.route) ? req.query.route[0] : req.query.route;
  const selected = handlers[route];

  if (route === "account-status") {
    return accountStatus(req, res);
  }

  if (route === "account-setup") {
    return accountSetup(req, res);
  }

  if (!selected) {
    res.status(404).json({ error: "SMARTCoach Pro endpoint not found." });
    return;
  }

  if (!requireProPlan(req, res)) return;

  return selected(req, res);
};

function accountStatus(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { accountKey, token, locationId, productPlan, accessCode } = getGhlContext(req);
  const suffix = accountKey.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const configured = !!(token && locationId);
  const missing = [];
  if (!token) missing.push({ label: "Private integration token", key: `GHL_PRIVATE_INTEGRATION_TOKEN_${suffix}` });
  if (!locationId) missing.push({ label: "Location ID", key: `GHL_LOCATION_ID_${suffix}` });
  res.status(configured ? 200 : 404).json({
    success: configured,
    accountKey,
    productPlan,
    configured,
    accessCodeRequired: !!accessCode,
    missingVariables: configured ? [] : missing.map((item) => item.key),
    missingSetupFields: configured ? [] : missing,
    error: configured ? undefined : `SMARTCoach account "${accountKey}" is not configured.`,
  });
}

function accountSetup(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!setupAdminAllowed(req)) {
    res.status(401).json({
      error: "Setup code is required.",
      adminSetupCodeRequired: true,
    });
    return;
  }

  const requestedKey = firstQueryValue(req.query && (req.query.account || req.query.tenant || req.query.key)) || "customer";
  const accountKey = normalizeSetupAccountKey(requestedKey) || "customer";
  const requestedPlan = firstQueryValue(req.query && (req.query.plan || req.query.productPlan)) || "pro";
  const productPlan = normalizeSetupProductPlan(requestedPlan);
  const suffix = accountKey.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const { token, locationId } = getGhlContext({ ...req, query: { ...req.query, account: accountKey } });
  const configured = !!(token && locationId);

  const env = [
    {
      key: `SMARTCOACH_PRODUCT_PLAN_${suffix}`,
      value: productPlan,
      required: true,
      label: "Product plan",
      description: "Controls whether this account is Essential or Pro.",
    },
  ];

  if (productPlan === "pro") {
    env.push(
      {
        key: `GHL_PRIVATE_INTEGRATION_TOKEN_${suffix}`,
        value: "paste_customer_private_integration_token",
        required: true,
        label: "Private integration token",
        description: "Customer SMARTCoach Pro private integration token.",
      },
      {
        key: `GHL_LOCATION_ID_${suffix}`,
        value: "paste_customer_location_id",
        required: true,
        label: "Location ID",
        description: "Customer SMARTCoach Pro sub-account location ID.",
      },
      {
        key: `SMARTCOACH_ACCESS_CODE_${suffix}`,
        value: suggestedAccessCode(accountKey),
        required: false,
        label: "Dashboard access code",
        description: "Optional now, but recommended before launch. Protects this customer's Pro dashboard/API data if the dashboard link is copied.",
      }
    );
  }

  res.status(200).json({
    success: true,
    accountKey,
    productPlan,
    configured,
    setupState: productPlan === "essential" ? "essential-ready" : configured ? "pro-ready" : "pro-setup-needed",
    environment: env,
    accountUrl: `/?account=${encodeURIComponent(accountKey)}`,
    dashboardUrl: `/dashboard.html?account=${encodeURIComponent(accountKey)}`,
    ghlCustomLinkUrl: `/dashboard.html?account=${encodeURIComponent(accountKey)}&embed=1`,
    planBuilderUrl: `/plan-builder.html?account=${encodeURIComponent(accountKey)}`,
  });
}

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeSetupAccountKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function normalizeSetupProductPlan(value) {
  return String(value || "").trim().toLowerCase() === "essential" ? "essential" : "pro";
}

function setupAdminAllowed(req) {
  const expected = String(process.env.SMARTCOACH_ADMIN_SETUP_CODE || "").trim();
  if (!expected) return true;
  const provided = String((req.headers && (req.headers["x-smartcoach-setup-code"] || req.headers["X-SMARTCoach-Setup-Code"])) || firstQueryValue(req.query && req.query.setupCode) || "").trim();
  return provided && safeEqual(provided, expected);
}

function safeEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

function suggestedAccessCode(accountKey) {
  const seed = `${accountKey || "customer"}-${Date.now()}-${Math.random()}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `sc-${String(hash >>> 0).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
