const crypto = require("crypto");

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

  if (route === "account-automation-health") {
    return accountAutomationHealth(req, res);
  }

  if (route === "account-stripe-webhook") {
    return accountStripeWebhook(req, res);
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

  await attachRegistryAccount(req);
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

  const registry = await attachRegistryAccount(req);
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
      source: registry.found ? "registry" : "environment",
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
    const result = await saveAutomationAccount(payload, { source: "automation" });
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message || "Could not process automation payload." });
  }
}

function accountAutomationHealth(req, res) {
  setAutomationHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
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

  const automationSecretConfigured = !!cleanSetupText(process.env.SMARTCOACH_AUTOMATION_SECRET);
  const registryReady = registryConfigured();
  const stripeWebhookReady = !!cleanSetupText(process.env.SMARTCOACH_STRIPE_WEBHOOK_SECRET);
  const sessionSigningReady = !!cleanSetupText(process.env.SMARTCOACH_SESSION_SECRET || process.env.SMARTCOACH_AUTOMATION_SECRET || process.env.SMARTCOACH_ADMIN_SETUP_CODE);
  res.status(200).json({
    success: true,
    automationSecretConfigured,
    registryConfigured: registryReady,
    stripeWebhookConfigured: stripeWebhookReady,
    sessionSigningConfigured: sessionSigningReady,
    readyForManualRegistryUpdates: automationSecretConfigured && registryReady,
    readyForStripeWebhooks: automationSecretConfigured && registryReady && stripeWebhookReady,
    readyForSignedCoachSessions: sessionSigningReady,
    checks: [
      { key: "automationSecret", label: "Automation secret", configured: automationSecretConfigured },
      { key: "registry", label: "Durable account registry", configured: registryReady },
      { key: "stripeWebhook", label: "Stripe webhook signing secret", configured: stripeWebhookReady },
      { key: "sessionSigning", label: "Coach session signing", configured: sessionSigningReady },
    ],
  });
}

async function accountStripeWebhook(req, res) {
  setAutomationHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const secret = cleanSetupText(process.env.SMARTCOACH_STRIPE_WEBHOOK_SECRET);
    if (!secret) throw httpError(500, "Stripe webhook signing secret is not configured.");
    const signature = headerValue(req, "stripe-signature");
    if (!signature) throw httpError(401, "Stripe signature is required.");
    const rawBody = await requestBodyText(req);
    verifyStripeSignature(rawBody, signature, secret);
    const payload = JSON.parse(rawBody || "{}");
    const result = await saveAutomationAccount(payload, { source: "stripe-webhook" });
    res.status(200).json({
      success: true,
      stripeWebhookVerified: true,
      ...result,
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message || "Could not process Stripe webhook." });
  }
}

async function saveAutomationAccount(payload, options = {}) {
  const accountKey = automationAccountKey(payload);
  if (!accountKey) throw httpError(400, "Account key is required.");
  const existing = await loadExistingAccountRecord(accountKey);
  const account = accountAutomationRecord(payload, existing, options);
  const suffix = account.accountKey.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const environment = accountEnvironmentRows({ suffix, account, includeCrm: account.productPlan === "pro" });
  const registryResult = await saveAccountRecord(account.accountKey, account);
  return {
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
  };
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

async function accountSession(req, res) {
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
    await attachRegistryAccountForKey(req, accountKey);
    const access = coachCodeAllowed({ query: { account: accountKey }, headers: req.headers || {}, smartcoachRegistryAccount: req.smartcoachRegistryAccount }, accessCode);
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

async function attachRegistryAccount(req) {
  const accountKey = accountKeyFromRequest(req);
  return attachRegistryAccountForKey(req, accountKey);
}

async function attachRegistryAccountForKey(req, accountKeyValue) {
  const accountKey = normalizeSetupAccountKey(accountKeyValue) || "default";
  let result = { configured: registryConfigured(), found: false, record: null };
  try {
    result = await loadAccountRecord(accountKey);
    if (result && result.found && result.record) {
      req.smartcoachRegistryAccount = result.record;
    }
  } catch (error) {
    result = { configured: true, found: false, record: null, error: error.message || "Registry could not be checked." };
  }
  return result;
}

function accountKeyFromRequest(req) {
  return (
    headerValue(req, "x-smartcoach-account") ||
    firstQueryValue(req.query && (req.query.account || req.query.tenant || req.query.key)) ||
    "default"
  );
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

async function loadExistingAccountRecord(accountKey) {
  try {
    const result = await loadAccountRecord(accountKey);
    return result && result.found && result.record ? result.record : null;
  } catch (error) {
    return null;
  }
}

function accountAutomationRecord(payload, existingRecord, options = {}) {
  const existing = existingRecord || {};
  const existingSubscription = existing.subscription || {};
  const accountKey = automationAccountKey(payload);
  if (!accountKey) throw httpError(400, "Account key is required.");
  const productPlanValue = firstAutomationValue(payload, ["productPlan", "plan", "subscriptionPlan"]);
  const productPlan = productPlanValue ? normalizeSetupProductPlan(productPlanValue) : normalizeSetupProductPlan(existing.productPlan || "pro");
  const coachSeatsValue = firstAutomationValue(payload, ["coachSeats", "coaches", "seats"]);
  const coachSeats = coachSeatsValue ? normalizeSetupCoachSeats(coachSeatsValue) : normalizeSetupCoachSeats(existing.coachSeats || 1);
  const statusValue = firstAutomationValue(payload, ["subscriptionStatus", "status"]);
  const billingValue = firstAutomationValue(payload, ["billingCadence", "billingInterval", "cadence", "interval"]);
  const amountValue = firstAutomationValue(payload, ["subscriptionAmount", "amount", "price", "unitAmount", "unit_amount"]);
  const renewalValue = firstAutomationValue(payload, ["renewalDate", "renewsOn", "nextBillingDate", "currentPeriodEnd", "current_period_end"]);
  const stripeCustomerValue = firstAutomationValue(payload, ["stripeCustomerId", "customerId", "customer"]);
  const stripeSubscriptionValue = firstAutomationValue(payload, ["stripeSubscriptionId", "subscriptionId", "subscription"]);
  const notesValue = firstAutomationValue(payload, ["subscriptionNotes", "notes"]);
  const subscription = {
    status: statusValue ? normalizeSetupSubscriptionStatus(statusValue) : existingSubscription.status || "active",
    billingCadence: billingValue ? normalizeSetupBillingCadence(billingValue) : existingSubscription.billingCadence || "monthly",
    amount: amountValue ? normalizeMoneyAmount(amountValue) : existingSubscription.amount || suggestedSubscriptionAmount(productPlan, coachSeats),
    renewalDate: renewalValue ? normalizeDateValue(renewalValue) : existingSubscription.renewalDate || "",
    stripeCustomerId: cleanSetupText(stripeCustomerValue || existingSubscription.stripeCustomerId),
    stripeSubscriptionId: cleanSetupText(stripeSubscriptionValue || existingSubscription.stripeSubscriptionId),
    notes: cleanSetupText(notesValue || existingSubscription.notes),
  };
  const coachCodesValue = firstAutomationValue(payload, ["coachAccessCodes", "coachCodes", "accessCodes"]);
  const coachCodes = coachCodesValue ? normalizeSetupCoachCodes(coachCodesValue, accountKey, coachSeats) : normalizeSetupCoachCodes(existing.coachAccessCodes || [], accountKey, coachSeats);
  const tokenValue = firstAutomationValue(payload, ["ghlToken", "privateIntegrationToken", "token"]);
  const locationValue = firstAutomationValue(payload, ["locationId", "ghlLocationId"]);
  const logoValue = firstAutomationValue(payload, ["logoUrl", "brandLogoUrl", "schoolLogoUrl"]);
  const event = automationEventSummary(payload, options);
  return {
    accountKey,
    productPlan,
    token: cleanSetupText(tokenValue || existing.token),
    locationId: cleanSetupText(locationValue || existing.locationId),
    coachSeats: productPlan === "pro" ? coachSeats : 0,
    coachAccessCodes: productPlan === "pro" ? coachCodes : [],
    subscription,
    logoUrl: cleanSetupText(logoValue || existing.logoUrl),
    lastAutomationEvent: event,
  };
}

function automationAccountKey(payload) {
  return normalizeSetupAccountKey(
    firstAutomationValue(payload, ["accountKey", "account", "tenant", "key", "locationName", "companyName", "client_reference_id"])
  );
}

function automationEventSummary(payload, options = {}) {
  const root = payload || {};
  const object = root.data && root.data.object || {};
  const sourceValue = firstAutomationValue(payload, ["updateSource", "source", "automationSource"]);
  const source = cleanSetupText(sourceValue || options.source || "automation");
  return {
    source,
    eventType: cleanSetupText(root.type || firstAutomationValue(payload, ["eventType", "event", "trigger"]) || object.object || "account_update"),
    stripeEventId: cleanSetupText(root.id && String(root.id).startsWith("evt_") ? root.id : ""),
    stripeObjectId: cleanSetupText(object.id || ""),
    receivedAt: new Date().toISOString(),
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
  return cadence === "annual" || cadence === "year" || cadence === "yearly" ? "annual" : "monthly";
}

function normalizeMoneyAmount(value) {
  const raw = cleanSetupText(value);
  if (!raw) return "";
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && Math.abs(numeric) >= 100 && !raw.includes(".")) {
    return (numeric / 100).toFixed(2);
  }
  return raw;
}

function normalizeDateValue(value) {
  const raw = cleanSetupText(value);
  if (!raw) return "";
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 1000000000) {
    const milliseconds = numeric > 100000000000 ? numeric : numeric * 1000;
    return new Date(milliseconds).toISOString().slice(0, 10);
  }
  return raw;
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
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Stripe-Signature, X-SMARTCoach-Automation-Secret");
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

function firstAutomationValue(payload, keys) {
  const candidates = automationPayloadCandidates(payload);
  for (const source of candidates) {
    for (const key of keys) {
      const value = source && source[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") return value;
    }
  }
  const stripeObject = payload && payload.data && payload.data.object;
  for (const key of keys) {
    const value = stripeNestedValue(stripeObject, key);
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function automationPayloadCandidates(payload) {
  const root = payload || {};
  const object = root.data && root.data.object || {};
  return [
    root,
    root.account,
    root.customer,
    root.subscription,
    root.metadata,
    object,
    object.metadata,
    object.customer_details,
    object.subscription_details && object.subscription_details.metadata,
    object.price,
    object.plan,
    object.recurring,
  ].filter(Boolean);
}

function stripeNestedValue(object, key) {
  const source = object || {};
  if (key === "billingCadence" || key === "billingInterval" || key === "cadence" || key === "interval") {
    return source.items && source.items.data && source.items.data[0] && source.items.data[0].price && source.items.data[0].price.recurring && source.items.data[0].price.recurring.interval ||
      source.plan && source.plan.interval ||
      source.price && source.price.recurring && source.price.recurring.interval;
  }
  if (key === "subscriptionAmount" || key === "amount" || key === "price" || key === "unitAmount" || key === "unit_amount") {
    return source.amount_total || source.amount_paid || source.unit_amount ||
      source.items && source.items.data && source.items.data[0] && source.items.data[0].price && source.items.data[0].price.unit_amount ||
      source.plan && source.plan.amount ||
      source.price && source.price.unit_amount;
  }
  if (key === "renewalDate" || key === "renewsOn" || key === "nextBillingDate" || key === "currentPeriodEnd" || key === "current_period_end") {
    return source.current_period_end || source.currentPeriodEnd;
  }
  if (key === "stripeSubscriptionId" || key === "subscriptionId" || key === "subscription") {
    return typeof source.subscription === "string" ? source.subscription : source.id && String(source.object || "").includes("subscription") ? source.id : "";
  }
  return "";
}

async function requestBodyText(req) {
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  if (req.rawBody) return Buffer.isBuffer(req.rawBody) ? req.rawBody.toString("utf8") : String(req.rawBody);
  if (req.body && typeof req.body === "object") return JSON.stringify(req.body);
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function verifyStripeSignature(rawBody, signatureHeader, secret) {
  const parts = stripeSignatureParts(signatureHeader);
  const timestamp = parts.t && parts.t[0];
  const signatures = parts.v1 || [];
  if (!timestamp || !signatures.length) throw httpError(401, "Stripe signature is invalid.");
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) throw httpError(401, "Stripe signature timestamp is invalid.");
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds);
  if (ageSeconds > 5 * 60) throw httpError(401, "Stripe signature is too old.");
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  if (!signatures.some((signature) => safeEqual(signature, expected))) {
    throw httpError(401, "Stripe signature could not be verified.");
  }
}

function stripeSignatureParts(header) {
  return String(header || "").split(",").reduce((parts, item) => {
    const index = item.indexOf("=");
    if (index < 1) return parts;
    const key = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();
    if (!parts[key]) parts[key] = [];
    parts[key].push(value);
    return parts;
  }, {});
}

function headerValue(req, name) {
  const headers = (req && req.headers) || {};
  return headers[name] || headers[name.toLowerCase()] || "";
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
