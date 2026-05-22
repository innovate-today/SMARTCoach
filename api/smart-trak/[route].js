const handlers = {
  "athlete-best": require("../ghl/athlete-best"),
  "athlete-profile": require("../ghl/athlete-profile"),
  athletes: require("../ghl/athletes"),
  dashboard: require("../ghl/dashboard"),
  groups: require("../../lib/ghl-groups"),
  "manual-mileage": require("../ghl/manual-mileage"),
  correction: require("../ghl/correction"),
  "meet-result": require("../ghl/meet-result"),
  meets: require("../ghl/meets"),
  "sync-session": require("../ghl/sync-session"),
  "training-plan": require("../ghl/training-plan"),
};
const { getGhlContext, requireProPlan, coachCodeAllowed, createCoachSession, subscriptionAccessAllowed } = require("../../lib/ghl-account");
const { registryConfigured, saveAccountRecord, loadAccountRecord } = require("../../lib/account-registry");

module.exports = async function handler(req, res) {
  const route = Array.isArray(req.query.route) ? req.query.route[0] : req.query.route;
  const selected = handlers[route];

  if (route === "account-status") {
    return accountStatus(req, res);
  }

  if (route === "account-setup") {
    return accountSetup(req, res);
  }

  if (route === "account-automation") {
    return accountAutomation(req, res);
  }

  if (route === "account-registry") {
    return accountRegistry(req, res);
  }

  if (route === "account-session") {
    return accountSession(req, res);
  }

  if (!selected) {
    res.status(404).json({ error: "SMART Trak endpoint not found." });
    return;
  }

  if (!requireProPlan(req, res)) return;

  return selected(req, res);
};

async function accountStatus(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { accountKey, token, locationId, productPlan, accessCode, coachSeats, coachAccessCodes, subscription, logoUrl } = getGhlContext(req);
  const suffix = accountKey.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const tokenKey = accountKey === "default" ? "GHL_PRIVATE_INTEGRATION_TOKEN" : `GHL_PRIVATE_INTEGRATION_TOKEN_${suffix}`;
  const locationKey = accountKey === "default" ? "GHL_LOCATION_ID" : `GHL_LOCATION_ID_${suffix}`;
  const configuredCoachCodes = coachAccessCodes && coachAccessCodes.length ? coachAccessCodes.length : accessCode ? 1 : 0;
  const crmConfigured = !!(token && locationId);
  const configured = productPlan === "essential" || crmConfigured;
  const subscriptionAllowed = subscriptionAccessAllowed(subscription);
  const missing = [];
  if (productPlan !== "essential" && !token) missing.push({ label: "Private integration token", key: tokenKey });
  if (productPlan !== "essential" && !locationId) missing.push({ label: "Location ID", key: locationKey });
  let registry = { configured: registryConfigured(), found: false };
  try {
    registry = await loadAccountRecord(accountKey);
  } catch (error) {
    registry = { configured: true, found: false, error: error.message || "Registry could not be checked." };
  }
  res.status(configured ? 200 : 404).json({
    success: configured,
    accountKey,
    productPlan,
    configured,
    crmConfigured,
    coachSeats,
    coachAccessCodesConfigured: configuredCoachCodes,
    accessCodeRequired: configuredCoachCodes > 0,
    coachAccessRequired: configuredCoachCodes > 0,
    subscription: publicSubscriptionSummary(subscription),
    subscriptionAccessAllowed: subscriptionAllowed,
    registry: {
      configured: !!registry.configured,
      found: !!registry.found,
      updatedAt: registry.record && registry.record.updatedAt || "",
      error: registry.error || undefined,
    },
    logoUrl: logoUrl || "",
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
  const requestedCoachSeats = firstQueryValue(req.query && (req.query.coachSeats || req.query.coaches || req.query.seats)) || "1";
  const coachSeats = normalizeSetupCoachSeats(requestedCoachSeats);
  const subscription = setupSubscriptionFromQuery(req.query || {}, productPlan);
  const suffix = accountKey.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const { token, locationId } = getGhlContext({ query: { account: accountKey }, headers: {} });
  const configured = !!(token && locationId);

  const env = [
    {
      key: `SMARTCOACH_PRODUCT_PLAN_${suffix}`,
      value: productPlan,
      required: true,
      label: "Plan",
      description: "Controls whether this account is Essential or Pro.",
    },
    {
      key: `SMARTCOACH_SUBSCRIPTION_STATUS_${suffix}`,
      value: subscription.status,
      required: false,
      recommended: true,
      label: "Subscription status",
      description: "Internal customer subscription status: active, trialing, past_due, paused, canceled, or incomplete.",
    },
    {
      key: `SMARTCOACH_BILLING_CADENCE_${suffix}`,
      value: subscription.billingCadence,
      required: false,
      recommended: true,
      label: "Billing cadence",
      description: "Internal billing cadence for this customer: monthly or annual.",
    },
    {
      key: `SMARTCOACH_SUBSCRIPTION_AMOUNT_${suffix}`,
      value: subscription.amount,
      required: false,
      recommended: true,
      label: "Subscription amount",
      description: "Internal monthly or annual subscription amount. Athlete limits remain controlled in GHL.",
    },
    {
      key: `SMARTCOACH_RENEWAL_DATE_${suffix}`,
      value: subscription.renewalDate,
      required: false,
      recommended: true,
      label: "Renewal date",
      description: "Internal next renewal or billing date in YYYY-MM-DD format.",
    },
    {
      key: `SMARTCOACH_STRIPE_CUSTOMER_ID_${suffix}`,
      value: subscription.stripeCustomerId,
      required: false,
      label: "Stripe customer ID",
      description: "Optional internal billing reference. This is not shown in the coach-facing app.",
    },
    {
      key: `SMARTCOACH_STRIPE_SUBSCRIPTION_ID_${suffix}`,
      value: subscription.stripeSubscriptionId,
      required: false,
      label: "Stripe subscription ID",
      description: "Optional internal subscription reference. This is not shown in the coach-facing app.",
    },
    {
      key: `SMARTCOACH_SUBSCRIPTION_NOTES_${suffix}`,
      value: subscription.notes,
      required: false,
      label: "Subscription notes",
      description: "Optional internal notes about this customer subscription.",
    },
  ];
  if (productPlan === "pro") {
    env.push(
      {
        key: `GHL_PRIVATE_INTEGRATION_TOKEN_${suffix}`,
        value: "paste_customer_private_integration_token",
        required: true,
        label: "Private integration token",
        description: "Customer SMART Trak private integration token.",
      },
      {
        key: `GHL_LOCATION_ID_${suffix}`,
        value: "paste_customer_location_id",
        required: true,
        label: "Location ID",
        description: "Customer SMART Trak sub-account location ID.",
      }
    );
    env.push(
      {
        key: `SMARTCOACH_COACH_SEATS_${suffix}`,
        value: String(coachSeats),
        required: true,
        label: "Coach seats",
        description: "Controls whether this Pro account allows 1 coach or 3 coach access codes. Athlete count stays controlled by GHL.",
      },
      {
        key: `SMARTCOACH_COACH_ACCESS_CODES_${suffix}`,
        value: suggestedCoachAccessCodes(accountKey, coachSeats).join(","),
        required: true,
        label: "Coach access codes",
        description: `Give one code to each coach. This account is set for ${coachSeats} coach${coachSeats === 1 ? "" : "es"}.`,
      }
    );
  }

  res.status(200).json({
    success: true,
    accountKey,
    productPlan,
    coachSeats: productPlan === "pro" ? coachSeats : 0,
    coachAccessCodesConfigured: productPlan === "pro" ? coachSeats : 0,
    subscription: publicSubscriptionSummary(subscription),
    configured,
    setupState: productPlan === "essential" ? "essential-ready" : configured ? "pro-ready" : "pro-setup-needed",
    environment: env,
    accountUrl: `/?account=${encodeURIComponent(accountKey)}`,
    dashboardUrl: `/dashboard.html?account=${encodeURIComponent(accountKey)}`,
    ghlCustomLinkUrl: `/dashboard.html?account=${encodeURIComponent(accountKey)}&embed=1`,
    planBuilderUrl: `/plan-builder.html?account=${encodeURIComponent(accountKey)}`,
  });
}

async function accountAutomation(req, res) {
  setAutomationHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!automationAllowed(req)) {
    res.status(401).json({
      error: "Automation secret is required.",
      automationSecretRequired: true,
    });
    return;
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const account = accountAutomationRecord(payload);
    const suffix = account.accountKey.toUpperCase().replace(/[^A-Z0-9]/g, "_");
    const environment = accountEnvironmentRows({ suffix, account, includeCrm: account.productPlan === "pro" });
    const registryResult = await saveAccountRecord(account.accountKey, account);
    res.status(200).json({
      success: true,
      accountKey: account.accountKey,
      productPlan: account.productPlan,
      coachSeats: account.productPlan === "pro" ? account.coachSeats : 0,
      subscription: publicSubscriptionSummary(account.subscription),
      subscriptionAccessAllowed: account.subscription.status === "active" || account.subscription.status === "trialing" || !account.subscription.status,
      registry: registryResult,
      accountRegistryRecord: account,
      environment,
      dashboardUrl: `/dashboard.html?account=${encodeURIComponent(account.accountKey)}`,
      ghlCustomLinkUrl: `/dashboard.html?account=${encodeURIComponent(account.accountKey)}&embed=1`,
      accountUrl: `/?account=${encodeURIComponent(account.accountKey)}`,
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message || "Could not process automation payload." });
  }
}

async function accountRegistry(req, res) {
  setAutomationHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (!automationAllowed(req)) {
    res.status(401).json({
      error: "Automation secret is required.",
      automationSecretRequired: true,
    });
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const accountKey = normalizeSetupAccountKey(firstQueryValue(req.query && (req.query.account || req.query.tenant || req.query.key)));
    if (!accountKey) throw httpError(400, "Account key is required.");
    const result = await loadAccountRecord(accountKey);
    res.status(result.found ? 200 : 404).json({
      success: !!result.found,
      accountKey,
      registry: {
        configured: !!result.configured,
        found: !!result.found,
        key: result.key || "",
        error: result.error || undefined,
      },
      accountRegistryRecord: result.record || null,
      error: result.found ? undefined : result.configured ? "Account registry record was not found." : "Account registry is not configured.",
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message || "Could not load account registry record." });
  }
}

function accountSession(req, res) {
  setSessionHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const accountKey = normalizeSetupAccountKey(
      firstPayloadValue(payload, ["accountKey", "account", "tenant", "key"]) ||
        firstQueryValue(req.query && (req.query.account || req.query.tenant || req.query.key))
    ) || "default";
    const accessCode = cleanSetupText(firstPayloadValue(payload, ["accessCode", "coachAccessCode", "code"]));
    const access = coachCodeAllowed({ query: { account: accountKey }, headers: req.headers || {} }, accessCode);
    if (!access.allowed) {
      res.status(access.statusCode || 401).json(access);
      return;
    }
    const session = createCoachSession(accountKey, { ttlSeconds: 12 * 60 * 60 });
    if (!session) {
      res.status(500).json({
        error: "SMART Trak session signing is not configured.",
        sessionSecretRequired: true,
      });
      return;
    }
    res.status(200).json({
      success: true,
      accountKey,
      productPlan: access.productPlan,
      coachSeats: access.coachSeats,
      sessionToken: session.token,
      expiresAt: session.expiresAt,
      expiresAtIso: session.expiresAtIso,
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message || "Could not create coach session." });
  }
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

function normalizeSetupCoachSeats(value) {
  const seats = Number(String(value || "").trim());
  return seats === 3 ? 3 : 1;
}

function setupSubscriptionFromQuery(query, productPlan) {
  return {
    status: normalizeSetupSubscriptionStatus(firstQueryValue(query.subscriptionStatus || query.status) || "active"),
    billingCadence: normalizeSetupBillingCadence(firstQueryValue(query.billingCadence || query.cadence) || "monthly"),
    amount: cleanSetupText(firstQueryValue(query.subscriptionAmount || query.amount) || suggestedSubscriptionAmount(productPlan, query.coachSeats || query.coaches || query.seats)),
    renewalDate: cleanSetupText(firstQueryValue(query.renewalDate || query.renewsOn || query.nextBillingDate)),
    stripeCustomerId: cleanSetupText(firstQueryValue(query.stripeCustomerId || query.customerId)),
    stripeSubscriptionId: cleanSetupText(firstQueryValue(query.stripeSubscriptionId || query.subscriptionId)),
    notes: cleanSetupText(firstQueryValue(query.subscriptionNotes || query.notes)),
  };
}

function accountAutomationRecord(payload) {
  const accountKey = normalizeSetupAccountKey(
    firstPayloadValue(payload, ["accountKey", "account", "tenant", "key", "locationName", "companyName"])
  );
  if (!accountKey) throw httpError(400, "Account key is required.");
  const productPlan = normalizeSetupProductPlan(firstPayloadValue(payload, ["productPlan", "plan", "subscriptionPlan"]));
  const coachSeats = normalizeSetupCoachSeats(firstPayloadValue(payload, ["coachSeats", "coaches", "seats"]));
  const subscription = {
    status: normalizeSetupSubscriptionStatus(firstPayloadValue(payload, ["subscriptionStatus", "status"]) || "active"),
    billingCadence: normalizeSetupBillingCadence(firstPayloadValue(payload, ["billingCadence", "billingInterval", "cadence"]) || "monthly"),
    amount: cleanSetupText(firstPayloadValue(payload, ["subscriptionAmount", "amount", "price"]) || suggestedSubscriptionAmount(productPlan, coachSeats)),
    renewalDate: cleanSetupText(firstPayloadValue(payload, ["renewalDate", "renewsOn", "nextBillingDate"])),
    stripeCustomerId: cleanSetupText(firstPayloadValue(payload, ["stripeCustomerId", "customerId"])),
    stripeSubscriptionId: cleanSetupText(firstPayloadValue(payload, ["stripeSubscriptionId", "subscriptionId"])),
    notes: cleanSetupText(firstPayloadValue(payload, ["subscriptionNotes", "notes"])),
  };
  const coachCodes = normalizeSetupCoachCodes(firstPayloadValue(payload, ["coachAccessCodes", "coachCodes", "accessCodes"]), accountKey, coachSeats);
  return {
    accountKey,
    productPlan,
    token: cleanSetupText(firstPayloadValue(payload, ["ghlToken", "privateIntegrationToken", "token"])),
    locationId: cleanSetupText(firstPayloadValue(payload, ["locationId", "ghlLocationId"])),
    coachSeats: productPlan === "pro" ? coachSeats : 0,
    coachAccessCodes: productPlan === "pro" ? coachCodes : [],
    subscription,
    logoUrl: cleanSetupText(firstPayloadValue(payload, ["logoUrl", "brandLogoUrl", "schoolLogoUrl"])),
  };
}

function accountEnvironmentRows({ suffix, account, includeCrm }) {
  const rows = [
    {
      key: `SMARTCOACH_PRODUCT_PLAN_${suffix}`,
      value: account.productPlan,
      required: true,
      label: "Plan",
      description: "Controls whether this account is Essential or Pro.",
    },
    {
      key: `SMARTCOACH_SUBSCRIPTION_STATUS_${suffix}`,
      value: account.subscription.status,
      required: false,
      recommended: true,
      label: "Subscription status",
      description: "Internal customer subscription status: active, trialing, past_due, paused, canceled, or incomplete.",
    },
    {
      key: `SMARTCOACH_BILLING_CADENCE_${suffix}`,
      value: account.subscription.billingCadence,
      required: false,
      recommended: true,
      label: "Billing cadence",
      description: "Internal billing cadence for this customer: monthly or annual.",
    },
    {
      key: `SMARTCOACH_SUBSCRIPTION_AMOUNT_${suffix}`,
      value: account.subscription.amount,
      required: false,
      recommended: true,
      label: "Subscription amount",
      description: "Internal monthly or annual subscription amount. Athlete limits remain controlled in GHL.",
    },
    {
      key: `SMARTCOACH_RENEWAL_DATE_${suffix}`,
      value: account.subscription.renewalDate,
      required: false,
      recommended: true,
      label: "Renewal date",
      description: "Internal next renewal or billing date in YYYY-MM-DD format.",
    },
    {
      key: `SMARTCOACH_STRIPE_CUSTOMER_ID_${suffix}`,
      value: account.subscription.stripeCustomerId,
      required: false,
      label: "Stripe customer ID",
      description: "Optional internal billing reference. This is not shown in the coach-facing app.",
    },
    {
      key: `SMARTCOACH_STRIPE_SUBSCRIPTION_ID_${suffix}`,
      value: account.subscription.stripeSubscriptionId,
      required: false,
      label: "Stripe subscription ID",
      description: "Optional internal subscription reference. This is not shown in the coach-facing app.",
    },
    {
      key: `SMARTCOACH_SUBSCRIPTION_NOTES_${suffix}`,
      value: account.subscription.notes,
      required: false,
      label: "Subscription notes",
      description: "Optional internal notes about this customer subscription.",
    },
  ];
  if (includeCrm) {
    rows.push(
      {
        key: `GHL_PRIVATE_INTEGRATION_TOKEN_${suffix}`,
        value: account.token || "paste_customer_private_integration_token",
        required: true,
        label: "Private integration token",
        description: "Customer SMART Trak private integration token.",
      },
      {
        key: `GHL_LOCATION_ID_${suffix}`,
        value: account.locationId || "paste_customer_location_id",
        required: true,
        label: "Location ID",
        description: "Customer SMART Trak sub-account location ID.",
      },
      {
        key: `SMARTCOACH_COACH_SEATS_${suffix}`,
        value: String(account.coachSeats || 1),
        required: true,
        label: "Coach seats",
        description: "Controls whether this Pro account allows 1 coach or 3 coach access codes. Athlete count stays controlled by GHL.",
      },
      {
        key: `SMARTCOACH_COACH_ACCESS_CODES_${suffix}`,
        value: (account.coachAccessCodes || []).join(","),
        required: true,
        label: "Coach access codes",
        description: `Give one code to each coach. This account is set for ${account.coachSeats || 1} coach${(account.coachSeats || 1) === 1 ? "" : "es"}.`,
      }
    );
  }
  return rows;
}

function publicSubscriptionSummary(subscription) {
  const source = subscription || {};
  return {
    status: source.status || "",
    billingCadence: source.billingCadence || "",
    amount: source.amount || "",
    renewalDate: source.renewalDate || "",
  };
}

function normalizeSetupSubscriptionStatus(value) {
  const status = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  return ["active", "trialing", "past_due", "paused", "canceled", "incomplete"].includes(status) ? status : "active";
}

function normalizeSetupBillingCadence(value) {
  const cadence = String(value || "").trim().toLowerCase();
  return cadence === "annual" ? "annual" : "monthly";
}

function cleanSetupText(value) {
  return String(value || "").trim();
}

function normalizeSetupCoachCodes(value, accountKey, coachSeats) {
  const codes = [];
  const add = (item) => {
    const code = cleanSetupText(item);
    if (code && !codes.includes(code)) codes.push(code);
  };
  if (Array.isArray(value)) value.forEach(add);
  else if (value) cleanSetupText(value).split(/[\n,]+/).forEach(add);
  while (codes.length < normalizeSetupCoachSeats(coachSeats)) {
    codes.push(`${suggestedAccessCode(accountKey)}-c${codes.length + 1}`);
  }
  return codes.slice(0, normalizeSetupCoachSeats(coachSeats));
}

function suggestedSubscriptionAmount(productPlan, coachSeatsValue) {
  if (productPlan === "essential") return "9.99";
  return normalizeSetupCoachSeats(firstQueryValue(coachSeatsValue)) === 3 ? "39.99" : "29.99";
}

function setupAdminAllowed(req) {
  const expected = String(process.env.SMARTCOACH_ADMIN_SETUP_CODE || "").trim();
  if (!expected) return true;
  const provided = String((req.headers && (req.headers["x-smartcoach-setup-code"] || req.headers["X-SMARTCoach-Setup-Code"])) || firstQueryValue(req.query && req.query.setupCode) || "").trim();
  return provided && safeEqual(provided, expected);
}

function automationAllowed(req) {
  const expected = cleanSetupText(process.env.SMARTCOACH_AUTOMATION_SECRET);
  if (!expected) return false;
  const auth = cleanSetupText(req.headers && (req.headers.authorization || req.headers.Authorization));
  const bearer = auth.replace(/^Bearer\s+/i, "");
  const provided = cleanSetupText(
    (req.headers && (req.headers["x-smartcoach-automation-secret"] || req.headers["X-SMARTCoach-Automation-Secret"])) ||
      bearer ||
      firstQueryValue(req.query && req.query.automationSecret)
  );
  return provided && safeEqual(provided, expected);
}

function setAutomationHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-SMARTCoach-Automation-Secret");
}

function setSessionHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-SMARTCoach-Account, X-SMARTCoach-Access-Code, X-SMARTCoach-Session");
}

function firstPayloadValue(payload, keys) {
  for (const key of keys) {
    const value = payload && payload[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
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

function suggestedCoachAccessCodes(accountKey, coachSeats) {
  const count = normalizeSetupCoachSeats(coachSeats);
  return Array.from({ length: count }, (_, index) => `${suggestedAccessCode(accountKey)}-c${index + 1}`);
}
