const crypto = require("crypto");

const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const GHL_ACCOUNT_KEY_CUSTOM_VALUE_NAME = "account_key";

const handlers = {
  "athlete-best": require("../ghl/athlete-best"),
  "athlete-calendar": require("../ghl/athlete-calendar"),
  "athlete-profile": require("../ghl/athlete-profile"),
  athletes: require("../ghl/athletes"),
  dashboard: require("../ghl/dashboard"),
  groups: require("../../lib/ghl-groups"),
  "manual-mileage": require("../ghl/manual-mileage"),
  correction: require("../ghl/correction"),
  "meet-result": require("../ghl/meet-result"),
  meets: require("../ghl/meets"),
  "sync-diagnostics": require("../../lib/sync-diagnostics"),
  "sync-session": require("../ghl/sync-session"),
  "training-plan": require("../ghl/training-plan"),
};
const {
  getGhlContext,
  requireProPlan,
  coachCodeAllowed,
  createCoachSession,
  coachSessionFromRequest,
  coachSessionSecretSource,
  coachSessionTtlSeconds,
  subscriptionAccessAllowed,
  subscriptionBlockedMessage,
} = require("../../lib/ghl-account");
const { registryConfigured, registryHealth, saveAccountRecord, loadAccountRecord } = require("../../lib/account-registry");
const { checkSessionAttempt, recordSessionFailure, clearSessionFailures, requestIp } = require("../../lib/session-rate-limit");

module.exports = async function handler(req, res) {
  setSmartTrakSecurityHeaders(res);
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

  if (route === "account-automation-dry-run") {
    return accountAutomationDryRun(req, res);
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

  if (route === "athlete-calendar") {
    return selected(req, res);
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
  const { accountKey, token, locationId, productPlan, accessCode, coachSeats, coachAccessCodes, requireCoachAccess, subscription, logoUrl } = getGhlContext(req);
  const coachSession = coachSessionFromRequest(req, accountKey);
  const suffix = accountKey.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const tokenKey = accountKey === "default" ? "GHL_PRIVATE_INTEGRATION_TOKEN" : `GHL_PRIVATE_INTEGRATION_TOKEN_${suffix}`;
  const locationKey = accountKey === "default" ? "GHL_LOCATION_ID" : `GHL_LOCATION_ID_${suffix}`;
  const coachAccessKey = accountKey === "default" ? "SMARTCOACH_COACH_ACCESS_CODES" : `SMARTCOACH_COACH_ACCESS_CODES_${suffix}`;
  const configuredCoachCodes = coachAccessCodes && coachAccessCodes.length ? coachAccessCodes.length : accessCode ? 1 : 0;
  const allowedCodes = coachAccessCodes && coachAccessCodes.length ? coachAccessCodes : accessCode ? [accessCode] : [];
  const providedAccessCode = String(headerValue(req, "x-smartcoach-access-code") || "").trim();
  const accessCodeAccepted = !!(providedAccessCode && allowedCodes.some((code) => safeEqual(providedAccessCode, code)));
  const crmConfigured = !!(token && locationId);
  const coachAccessConfigured = !requireCoachAccess || configuredCoachCodes > 0;
  const configured = productPlan === "essential" || (crmConfigured && coachAccessConfigured);
  const subscriptionAllowed = subscriptionAccessAllowed(subscription);
  const subscriptionBlockedReason = subscriptionAllowed ? "" : subscriptionBlockedMessage(subscription);
  const coachAccessRequired = configuredCoachCodes > 0 || !!requireCoachAccess;
  const coachAccessUnlocked = productPlan === "essential" || !coachAccessRequired || !!coachSession || accessCodeAccepted;
  const deviceAccessReady = configured && subscriptionAllowed && coachAccessUnlocked;
  const missing = [];
  if (productPlan !== "essential" && !token) missing.push({ label: "Private integration token", key: tokenKey });
  if (productPlan !== "essential" && !locationId) missing.push({ label: "Location ID", key: locationKey });
  if (productPlan !== "essential" && requireCoachAccess && configuredCoachCodes < 1) missing.push({ label: "Coach access codes", key: coachAccessKey });
  res.status(configured ? 200 : 404).json({
    success: configured && subscriptionAllowed,
    accountKey,
    productPlan,
    configured,
    setupReady: configured,
    accessReady: configured && subscriptionAllowed,
    deviceAccessReady,
    crmConfigured,
    coachSeats,
    coachAccessCodesConfigured: configuredCoachCodes,
    coach: coachSession ? {
      index: Number(coachSession.coachIndex) || 0,
      label: `Coach ${(Number(coachSession.coachIndex) || 0) + 1}`,
      parentEmailAllowed: parentEmailFeatureReleased() && !!coachSession.parentEmailAllowed,
    } : null,
    coachSessionActive: !!coachSession,
    coachAccessUnlocked,
    coachAccessCodeAccepted: accessCodeAccepted,
    parentEmailToolsAllowed: parentEmailFeatureReleased() && !!(coachSession && coachSession.parentEmailAllowed),
    accessCodeRequired: coachAccessRequired,
    coachAccessRequired,
    accessCodeMissing: !!requireCoachAccess && configuredCoachCodes < 1,
    subscription: publicSubscriptionSummary(subscription),
    subscriptionAccessAllowed: subscriptionAllowed,
    subscriptionBlockedReason,
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
    error: configured ? subscriptionBlockedReason || undefined : `SMARTCoach account "${accountKey}" is not configured.`,
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
      description: "Internal customer subscription status: active, trialing, past_due, paused, canceled, incomplete, incomplete_expired, or unpaid.",
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
      },
      {
        key: `SMARTCOACH_REQUIRE_COACH_ACCESS_${suffix}`,
        value: "true",
        required: true,
        label: "Require coach access",
        description: "Blocks SMART Trak if this account does not have coach access codes configured.",
      },
      {
        key: `SMARTCOACH_PARENT_EMAIL_COACH_ACCESS_${suffix}`,
        value: "",
        required: false,
        label: "Future parent email coaches",
        description: "Optional future release only. Use coach numbers like 1 or 1,3; tools stay hidden until the global parent email release flag is turned on.",
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
      automationDebug: automationSecretDebug(req),
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

async function accountAutomationDryRun(req, res) {
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
    const result = await previewAutomationAccount(payload, { source: "automation-dry-run" });
    res.status(200).json({
      success: true,
      dryRun: true,
      ...result,
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message || "Could not test automation payload." });
  }
}

async function accountAutomationHealth(req, res) {
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
  const setupCodeConfigured = !!cleanSetupText(process.env.SMARTCOACH_ADMIN_SETUP_CODE);
  const registryStatus = await registryHealth();
  const registryReady = !!(registryStatus.configured && registryStatus.reachable);
  const stripeWebhookReady = !!cleanSetupText(process.env.SMARTCOACH_STRIPE_WEBHOOK_SECRET);
  const dedicatedSessionSecretConfigured = !!cleanSetupText(process.env.SMARTCOACH_SESSION_SECRET);
  const sessionSigningSource = coachSessionSecretSource();
  const sessionSigningReady = !!sessionSigningSource;
  const coachAccessEnforcementConfigured = normalizeSetupBoolean(process.env.SMARTCOACH_REQUIRE_COACH_ACCESS, false);
  const parentEmailReleased = parentEmailFeatureReleased();
  const launchChecks = [
    {
      key: "automationSecret",
      label: "Automation secret",
      ready: automationSecretConfigured,
      detail: automationSecretConfigured ? "Protected setup endpoints can accept trusted automation calls." : "Set SMARTCOACH_AUTOMATION_SECRET before connecting setup automation.",
    },
    {
      key: "setupCode",
      label: "Setup page protection",
      ready: setupCodeConfigured,
      detail: setupCodeConfigured ? "Internal setup field generation requires the setup code." : "Set SMARTCOACH_ADMIN_SETUP_CODE so customer setup fields are not casually available.",
    },
    {
      key: "registry",
      label: "Durable account registry",
      ready: registryReady,
      detail: registryReady ? "Customer account records can survive deployments and be updated by automation." : registryStatus.configured ? "Registry is configured but cannot be reached." : "Connect Vercel KV or Upstash Redis registry variables.",
    },
    {
      key: "stripeWebhook",
      label: "Stripe webhook",
      ready: stripeWebhookReady,
      detail: stripeWebhookReady ? "Stripe signatures can be verified before subscription updates are accepted." : "Set SMARTCOACH_STRIPE_WEBHOOK_SECRET from the Stripe webhook endpoint.",
    },
    {
      key: "sessionSecret",
      label: "Coach sessions",
      ready: dedicatedSessionSecretConfigured,
      detail: dedicatedSessionSecretConfigured ? "Coach sessions use a dedicated signing secret." : "Set SMARTCOACH_SESSION_SECRET so sessions do not reuse setup secrets.",
    },
    {
      key: "coachAccess",
      label: "Coach access enforcement",
      ready: coachAccessEnforcementConfigured,
      detail: coachAccessEnforcementConfigured ? "Pro accounts require a coach access code or signed coach session." : "Set SMARTCOACH_REQUIRE_COACH_ACCESS=true before launch.",
    },
    {
      key: "parentEmail",
      label: "Parent email release",
      ready: !parentEmailReleased,
      detail: parentEmailReleased ? "Parent email tools are globally enabled before the first rollout." : "Parent email tools remain hidden until intentionally released.",
    },
  ];
  const launchBlockers = [];
  const productionWarnings = [];
  if (!automationSecretConfigured) launchBlockers.push("Automation secret is missing.");
  if (!setupCodeConfigured) launchBlockers.push("Internal setup code is missing.");
  if (!registryReady) launchBlockers.push(registryStatus.configured ? "Account registry is not reachable." : "Durable account registry is not connected.");
  if (!stripeWebhookReady) launchBlockers.push("Stripe webhook signing secret is missing.");
  if (!dedicatedSessionSecretConfigured) launchBlockers.push("Dedicated coach session secret is missing.");
  if (!coachAccessEnforcementConfigured) launchBlockers.push("Coach access enforcement is not turned on.");
  if (parentEmailReleased) launchBlockers.push("Parent email tools are globally enabled before initial rollout.");
  if (!dedicatedSessionSecretConfigured) {
    productionWarnings.push("Set SMARTCOACH_SESSION_SECRET so coach sessions do not reuse automation or setup secrets.");
  }
  if (!setupCodeConfigured) {
    productionWarnings.push("Set SMARTCOACH_ADMIN_SETUP_CODE so internal customer setup field generation requires a setup code.");
  }
  if (!coachAccessEnforcementConfigured) {
    productionWarnings.push("Set SMARTCOACH_REQUIRE_COACH_ACCESS=true after Pro accounts have coach access codes.");
  }
  if (!registryStatus.configured) {
    productionWarnings.push("Connect the durable account registry so Stripe and setup automation survive deployments.");
  } else if (!registryStatus.reachable) {
    productionWarnings.push("Fix the durable account registry connection so Stripe and setup automation can save customer updates.");
  }
  if (parentEmailReleased) {
    productionWarnings.push("Parent email tools are globally enabled. Keep SMARTCOACH_PARENT_EMAIL_FEATURE_ENABLED off until parent communication is ready for rollout.");
  }
  res.status(200).json({
    success: true,
    launchReady: launchBlockers.length === 0,
    launchBlockers,
    launchChecks,
    automationSecretConfigured,
    setupCodeConfigured,
    registryConfigured: !!registryStatus.configured,
    registryReachable: !!registryStatus.reachable,
    registryError: registryStatus.error || "",
    stripeWebhookConfigured: stripeWebhookReady,
    dedicatedSessionSecretConfigured,
    sessionSigningConfigured: sessionSigningReady,
    sessionSigningSource,
    sessionTtlSeconds: coachSessionTtlSeconds(),
    coachAccessEnforcementConfigured,
    parentEmailFeatureReleased: parentEmailReleased,
    productionWarnings,
    readyForManualRegistryUpdates: automationSecretConfigured && registryReady,
    readyForStripeWebhooks: automationSecretConfigured && registryReady && stripeWebhookReady,
    readyForSignedCoachSessions: sessionSigningReady,
    checks: [
      { key: "automationSecret", label: "Automation secret", configured: automationSecretConfigured },
      { key: "setupCode", label: "Internal setup code", configured: setupCodeConfigured },
      { key: "registry", label: "Durable account registry", configured: !!registryStatus.configured },
      { key: "registryConnection", label: "Registry connection", configured: registryReady },
      { key: "stripeWebhook", label: "Stripe webhook signing secret", configured: stripeWebhookReady },
      { key: "sessionSigning", label: "Coach session signing", configured: sessionSigningReady },
      { key: "dedicatedSessionSecret", label: "Dedicated session secret", configured: dedicatedSessionSecretConfigured },
      { key: "coachAccessEnforcement", label: "Coach access enforcement", configured: coachAccessEnforcementConfigured },
      { key: "parentEmailReleaseGate", label: "Parent email release gate off", configured: !parentEmailReleased },
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
    const result = await saveAutomationAccount(payload, { source: "stripe-webhook", skipDuplicateEvents: true });
    if (!result.duplicateAutomationEvent && (!result.registry || !result.registry.saved)) {
      throw httpError(
        503,
        (result.registry && (result.registry.reason || result.registry.error)) ||
          "Stripe webhook could not save the account registry update."
      );
    }
    res.status(200).json({
      success: true,
      stripeWebhookVerified: true,
      stripeWebhookDuplicate: !!result.duplicateAutomationEvent,
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
  if (options.skipDuplicateEvents && automationEventAlreadyRecorded(existing, account.lastAutomationEvent)) {
    return automationAccountResult(account, {
      configured: registryConfigured(),
      saved: false,
      duplicate: true,
      reason: "Duplicate automation event. Registry record was already updated.",
    }, {
      duplicateAutomationEvent: true,
      environment,
    });
  }
  const registryResult = await saveAccountRecord(account.accountKey, account);
  const customValueSync = await syncAccountKeyCustomValue(account);
  return automationAccountResult(account, registryResult, { environment, customValueSync });
}

function automationAccountResult(account, registryResult, extra = {}) {
  const subscriptionAllowed = subscriptionAccessAllowed(account.subscription);
  const setupReady = accountSetupReady(account);
  const subscriptionBlockedReason = subscriptionAllowed ? "" : subscriptionBlockedMessage(account.subscription);
  return {
    ...extra,
    accountKey: account.accountKey,
    productPlan: account.productPlan,
    coachSeats: account.productPlan === "pro" ? account.coachSeats : 0,
    subscription: publicSubscriptionSummary(account.subscription),
    subscriptionAccessAllowed: subscriptionAllowed,
    subscriptionBlockedReason,
    setupReady,
    accessReady: setupReady && subscriptionAllowed,
    registry: registryResult,
    ghlCustomValueSync: extra.customValueSync || customValueSyncSkipped("Not attempted."),
    accountRegistryRecord: publicAccountRecord(account),
    environment: publicEnvironmentRows(extra.environment || accountEnvironmentRows({
      suffix: account.accountKey.toUpperCase().replace(/[^A-Z0-9]/g, "_"),
      account,
      includeCrm: account.productPlan === "pro",
    })),
    dashboardUrl: `/dashboard.html?account=${encodeURIComponent(account.accountKey)}`,
    ghlCustomLinkUrl: `/dashboard.html?account=${encodeURIComponent(account.accountKey)}&embed=1`,
    accountUrl: `/?account=${encodeURIComponent(account.accountKey)}`,
  };
}

async function syncAccountKeyCustomValue(account) {
  if (!account || account.productPlan === "essential") return customValueSyncSkipped("Essential accounts do not need a SMART Trak custom value.");
  if (!account.token || !account.locationId) return customValueSyncSkipped("Missing Location ID or Private Integration Token.");
  try {
    const existing = await findGhlCustomValue({
      token: account.token,
      locationId: account.locationId,
      name: GHL_ACCOUNT_KEY_CUSTOM_VALUE_NAME,
    });
    if (existing && existing.id) {
      const updated = await ghlRequest({
        token: account.token,
        path: `/locations/${encodeURIComponent(account.locationId)}/customValues/${encodeURIComponent(existing.id)}`,
        method: "PUT",
        body: { name: existing.name || GHL_ACCOUNT_KEY_CUSTOM_VALUE_NAME, value: account.accountKey },
      });
      return customValueSyncSuccess("updated", updated, account.accountKey);
    }
    const created = await ghlRequest({
      token: account.token,
      path: `/locations/${encodeURIComponent(account.locationId)}/customValues`,
      method: "POST",
      body: { name: GHL_ACCOUNT_KEY_CUSTOM_VALUE_NAME, value: account.accountKey },
    });
    return customValueSyncSuccess("created", created, account.accountKey);
  } catch (error) {
    return {
      attempted: true,
      success: false,
      name: GHL_ACCOUNT_KEY_CUSTOM_VALUE_NAME,
      fieldKey: `{{custom_values.${GHL_ACCOUNT_KEY_CUSTOM_VALUE_NAME}}}`,
      value: account.accountKey || "",
      error: error.message || "Could not sync GHL account key custom value.",
    };
  }
}

async function findGhlCustomValue({ token, locationId, name }) {
  const data = await ghlRequest({
    token,
    path: `/locations/${encodeURIComponent(locationId)}/customValues`,
    method: "GET",
  });
  const values = Array.isArray(data && data.customValues) ? data.customValues :
    Array.isArray(data && data.custom_values) ? data.custom_values :
    Array.isArray(data && data.values) ? data.values :
    Array.isArray(data) ? data : [];
  const target = normalizeCustomValueName(name);
  return values.find((item) => {
    const fieldKey = String(item && (item.fieldKey || item.field_key || item.key) || "");
    return normalizeCustomValueName(item && item.name) === target ||
      normalizeCustomValueName(fieldKey.replace(/^.*custom_values\.?/i, "")) === target ||
      fieldKey.includes(`custom_values.${name}`) ||
      fieldKey.includes(`custom_values_${name}`);
  }) || null;
}

function normalizeCustomValueName(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function customValueSyncSuccess(action, data, accountKey) {
  const customValue = data && (data.customValue || data.custom_value || data);
  return {
    attempted: true,
    success: true,
    action,
    id: String(customValue && (customValue.id || customValue._id) || ""),
    name: String(customValue && customValue.name || GHL_ACCOUNT_KEY_CUSTOM_VALUE_NAME),
    fieldKey: String(customValue && (customValue.fieldKey || customValue.field_key || customValue.key) || `{{custom_values.${GHL_ACCOUNT_KEY_CUSTOM_VALUE_NAME}}}`),
    value: accountKey || "",
  };
}

function customValueSyncSkipped(reason) {
  return {
    attempted: false,
    success: false,
    name: GHL_ACCOUNT_KEY_CUSTOM_VALUE_NAME,
    fieldKey: `{{custom_values.${GHL_ACCOUNT_KEY_CUSTOM_VALUE_NAME}}}`,
    value: "",
    reason,
  };
}

async function previewAutomationAccount(payload, options = {}) {
  const accountKey = automationAccountKey(payload);
  if (!accountKey) throw httpError(400, "Account key is required.");
  const existing = await loadExistingAccountRecord(accountKey);
  const account = accountAutomationRecord(payload, existing, options);
  const suffix = account.accountKey.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const environment = accountEnvironmentRows({ suffix, account, includeCrm: account.productPlan === "pro" });
  const subscriptionAllowed = subscriptionAccessAllowed(account.subscription);
  const setupReady = accountSetupReady(account);
  const subscriptionBlockedReason = subscriptionAllowed ? "" : subscriptionBlockedMessage(account.subscription);
  return {
    accountKey: account.accountKey,
    productPlan: account.productPlan,
    coachSeats: account.productPlan === "pro" ? account.coachSeats : 0,
    subscription: publicSubscriptionSummary(account.subscription),
    subscriptionAccessAllowed: subscriptionAllowed,
    subscriptionBlockedReason,
    setupReady,
    accessReady: setupReady && subscriptionAllowed,
    registry: {
      configured: registryConfigured(),
      saved: false,
      dryRun: true,
      reason: "Dry run only. No registry record was saved.",
    },
    accountRegistryRecord: publicAccountRecord(account),
    environment: publicEnvironmentRows(environment),
    dashboardUrl: `/dashboard.html?account=${encodeURIComponent(account.accountKey)}`,
    ghlCustomLinkUrl: `/dashboard.html?account=${encodeURIComponent(account.accountKey)}&embed=1`,
    accountUrl: `/?account=${encodeURIComponent(account.accountKey)}`,
  };
}

function accountSetupReady(account) {
  const source = account || {};
  if (source.productPlan === "essential") return true;
  const codes = Array.isArray(source.coachAccessCodes) ? source.coachAccessCodes : [];
  const coachAccessReady = source.requireCoachAccess === false || codes.length > 0;
  return !!(source.token && source.locationId && coachAccessReady);
}

function publicAccountRecord(account) {
  const source = account || {};
  return {
    ...source,
    token: source.token ? "__hidden__" : "",
    accessCode: source.accessCode ? "__hidden__" : "",
    coachAccessCodes: Array.isArray(source.coachAccessCodes) ? source.coachAccessCodes.map(() => "__hidden__") : [],
    privateIntegrationToken: undefined,
  };
}

function publicEnvironmentRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const key = String(row && row.key || "");
    if (/GHL_PRIVATE_INTEGRATION_TOKEN|SMARTCOACH_COACH_ACCESS_CODES|SMARTCOACH_LEGACY_ACCESS_CODE/i.test(key)) {
      const value = String(row.value || "");
      if (value && !/^paste_/i.test(value)) return { ...row, value: "__hidden__" };
    }
    return row;
  });
}

async function ghlRequest({ token, path, method = "GET", body }) {
  const response = await fetch(`${GHL_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: GHL_VERSION,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    data = { message: text };
  }
  if (!response.ok) {
    throw httpError(response.status, data.message || data.error || `GHL request failed with ${response.status}.`);
  }
  return data;
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
    const record = result.record || null;
    const publicRecord = record ? publicAccountRecord(record) : null;
    const setupReady = result.found ? accountSetupReady(record) : false;
    const subscriptionAllowed = result.found ? subscriptionAccessAllowed(record && record.subscription) : false;
    const subscriptionBlockedReason = result.found && !subscriptionAllowed ? subscriptionBlockedMessage(record && record.subscription) : "";
    res.status(result.found ? 200 : 404).json({
      success: !!result.found,
      accountKey,
      setupReady,
      accessReady: setupReady && subscriptionAllowed,
      subscriptionAccessAllowed: subscriptionAllowed,
      subscriptionBlockedReason,
      registry: {
        configured: !!result.configured,
        found: !!result.found,
        key: result.key || "",
        error: result.error || undefined,
      },
      accountRegistryRecord: publicRecord,
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
    const ip = requestIp(req);
    const attempt = checkSessionAttempt({ accountKey, ip });
    if (!attempt.allowed) {
      res.setHeader("Retry-After", String(attempt.retryAfterSeconds || 900));
      res.status(429).json({
        error: "Too many access attempts. Wait a few minutes, then try again.",
        retryAfterSeconds: attempt.retryAfterSeconds,
      });
      return;
    }
    await attachRegistryAccountForKey(req, accountKey);
    const access = coachCodeAllowed({ query: { account: accountKey }, headers: req.headers || {}, smartcoachRegistryAccount: req.smartcoachRegistryAccount }, accessCode);
    if (!access.allowed) {
      const failure = recordSessionFailure({ accountKey, ip });
      if (failure.blocked) res.setHeader("Retry-After", String(failure.retryAfterSeconds || 900));
      res.status(access.statusCode || 401).json(access);
      return;
    }
    clearSessionFailures({ accountKey, ip });
    const parentEmailAllowed = parentEmailFeatureReleased() && !!access.parentEmailAllowed;
    const session = createCoachSession(accountKey, { coachIndex: access.coachIndex, parentEmailAllowed });
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
      coachIndex: access.coachIndex,
      parentEmailAllowed,
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
  const parentEmailCoachAccessValue = firstAutomationValue(payload, ["parentEmailCoachAccess", "parentEmailCoachIndexes", "parentEmailCoaches"]);
  const parentEmailCoachAccess = parentEmailCoachAccessValue ? normalizeParentEmailCoachAccess(parentEmailCoachAccessValue, coachSeats) : normalizeParentEmailCoachAccess(existing.parentEmailCoachAccess || [], coachSeats);
  const tokenValue = firstAutomationValue(payload, ["ghlToken", "privateIntegrationToken", "token"]);
  const locationValue = firstAutomationValue(payload, ["locationId", "ghlLocationId"]);
  const logoValue = firstAutomationValue(payload, ["logoUrl", "brandLogoUrl", "schoolLogoUrl"]);
  const requireCoachAccessValue = firstAutomationValue(payload, ["requireCoachAccess", "coachAccessRequired", "requireAccessCode"]);
  const requireCoachAccess = productPlan === "pro" ? normalizeSetupBoolean(requireCoachAccessValue, existing.requireCoachAccess !== undefined ? existing.requireCoachAccess : true) : false;
  const event = automationEventSummary(payload, options);
  const automationEventHistory = automationEventHistoryFor(existing.automationEventHistory, event);
  return {
    accountKey,
    productPlan,
    token: cleanSetupText(tokenValue || existing.token),
    locationId: cleanSetupText(locationValue || existing.locationId),
    coachSeats: productPlan === "pro" ? coachSeats : 0,
    coachAccessCodes: productPlan === "pro" ? coachCodes : [],
    parentEmailCoachAccess: productPlan === "pro" ? parentEmailCoachAccess : [],
    requireCoachAccess,
    subscription,
    logoUrl: cleanSetupText(logoValue || existing.logoUrl),
    lastAutomationEvent: event,
    automationEventHistory,
  };
}

function automationAccountKey(payload) {
  return normalizeSetupAccountKey(
    firstAutomationValue(payload, [
      "accountKey",
      "smartcoachAccountKey",
      "smartCoachAccountKey",
      "smarttrakAccountKey",
      "smartTrakAccountKey",
      "smartcoach_account_key",
      "smartcoachAccount",
      "smartcoach_account",
      "smarttrak_account_key",
      "account",
      "tenant",
      "key",
      "locationName",
      "companyName",
      "client_reference_id",
      "clientReferenceId",
    ])
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

function automationEventHistoryFor(existingHistory, event) {
  const history = Array.isArray(existingHistory) ? existingHistory.filter(Boolean) : [];
  const current = event || {};
  const key = automationEventKey(current);
  const withoutDuplicate = key ? history.filter((item) => automationEventKey(item) !== key) : history;
  return [current, ...withoutDuplicate].slice(0, 10);
}

function automationEventAlreadyRecorded(existingRecord, event) {
  const key = automationEventKey(event);
  if (!key || !existingRecord) return false;
  const history = Array.isArray(existingRecord.automationEventHistory) ? existingRecord.automationEventHistory : [];
  const events = [existingRecord.lastAutomationEvent, ...history].filter(Boolean);
  return events.some((item) => automationEventKey(item) === key);
}

function automationEventKey(event) {
  const source = event || {};
  if (source.stripeEventId) return `stripe:${source.stripeEventId}`;
  if (source.stripeObjectId && source.eventType) return `${source.eventType}:${source.stripeObjectId}`;
  if (source.source && source.eventType && source.receivedAt) return `${source.source}:${source.eventType}:${source.receivedAt}`;
  return "";
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
      description: "Internal customer subscription status: active, trialing, past_due, paused, canceled, incomplete, incomplete_expired, or unpaid.",
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
      },
      {
        key: `SMARTCOACH_REQUIRE_COACH_ACCESS_${suffix}`,
        value: account.requireCoachAccess === false ? "false" : "true",
        required: true,
        label: "Require coach access",
        description: "Blocks SMART Trak if this account does not have coach access codes configured.",
      },
      {
        key: `SMARTCOACH_PARENT_EMAIL_COACH_ACCESS_${suffix}`,
        value: parentEmailAccessIndexes(account.parentEmailCoachAccess).join(","),
        required: false,
        label: "Future parent email coaches",
        description: "Optional future release only. Use coach numbers like 1 or 1,3; tools stay hidden until the global parent email release flag is turned on.",
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
  const aliases = {
    paid: "active",
    current: "active",
    subscribed: "active",
    trial: "trialing",
    trial_period: "trialing",
    payment_failed: "past_due",
    failed_payment: "past_due",
    failed: "past_due",
    overdue: "past_due",
    pastdue: "past_due",
    cancelled: "canceled",
    cancel: "canceled",
    stopped: "canceled",
    ended: "canceled",
    pause: "paused",
    suspended: "paused",
    open: "incomplete",
    pending: "incomplete",
    expired: "incomplete_expired",
    not_paid: "unpaid",
    no_payment: "unpaid",
  };
  const normalized = aliases[status] || status;
  return ["active", "trialing", "past_due", "paused", "canceled", "incomplete", "incomplete_expired", "unpaid"].includes(normalized) ? normalized : "incomplete";
}

function normalizeSetupBillingCadence(value) {
  const cadence = String(value || "").trim().toLowerCase();
  return cadence === "annual" || cadence === "year" || cadence === "yearly" ? "annual" : "monthly";
}

function normalizeSetupBoolean(value, fallback) {
  const raw = String(value === undefined || value === null ? "" : value).trim().toLowerCase();
  if (!raw) return !!fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return !!fallback;
}

function parentEmailFeatureReleased() {
  return normalizeSetupBoolean(process.env.SMARTCOACH_PARENT_EMAIL_FEATURE_ENABLED, false);
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
  return codes.slice(0, normalizeSetupCoachSeats(coachSeats));
}

function normalizeParentEmailCoachAccess(value, coachSeats) {
  const seats = normalizeSetupCoachSeats(coachSeats);
  const allowed = Array.from({ length: seats }, () => false);
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const raw = cleanSetupText(item).toLowerCase();
      if (["1", "true", "yes", "on", "allow", "allowed", "enabled"].includes(raw)) allowed[index] = true;
      else {
        const number = Number(raw);
        if (Number.isFinite(number) && number >= 1 && number <= seats) allowed[number - 1] = true;
      }
    });
    return allowed;
  }
  const raw = cleanSetupText(value);
  if (!raw) return allowed;
  if (/^(all|true|yes|on|enabled)$/i.test(raw)) return allowed.map(() => true);
  raw.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean).forEach((item, index) => {
    const key = item.toLowerCase();
    if (["true", "yes", "on", "allow", "allowed", "enabled"].includes(key)) allowed[index] = true;
    const match = key.match(/(?:coach)?\s*([123])/);
    const number = match ? Number(match[1]) : Number(key);
    if (Number.isFinite(number) && number >= 1 && number <= seats) allowed[number - 1] = true;
  });
  return allowed;
}

function parentEmailAccessIndexes(value) {
  return (Array.isArray(value) ? value : []).map((allowed, index) => allowed ? String(index + 1) : "").filter(Boolean);
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
  const payload = requestBodyObject(req);
  const provided = cleanSetupText(
    (req.headers && (req.headers["x-smartcoach-automation-secret"] || req.headers["X-SMARTCoach-Automation-Secret"])) ||
      bearer ||
      firstQueryValue(req.query && req.query.automationSecret) ||
      firstQueryValue(req.query && req.query.secret) ||
      firstQueryValue(req.query && req.query.token) ||
      firstAutomationValue(payload, ["automationSecret", "smartcoachAutomationSecret", "SMARTCOACH_AUTOMATION_SECRET", "secret", "token"])
  );
  return provided && safeEqual(provided, expected);
}

function automationSecretDebug(req) {
  const headers = req && req.headers || {};
  const payload = requestBodyObject(req);
  const customData = payload && (payload.customData || payload.custom_data) || {};
  return {
    expectedConfigured: !!cleanSetupText(process.env.SMARTCOACH_AUTOMATION_SECRET),
    queryKeys: Object.keys(req && req.query || {}).sort(),
    hasQueryAutomationSecret: !!firstQueryValue(req && req.query && req.query.automationSecret),
    hasQuerySecret: !!firstQueryValue(req && req.query && req.query.secret),
    hasQueryToken: !!firstQueryValue(req && req.query && req.query.token),
    hasAutomationHeader: !!(headers["x-smartcoach-automation-secret"] || headers["X-SMARTCoach-Automation-Secret"]),
    hasAuthorizationHeader: !!(headers.authorization || headers.Authorization),
    bodyKeys: Object.keys(payload || {}).sort(),
    customDataKeys: customData && typeof customData === "object" ? Object.keys(customData).sort() : [],
    hasNestedAutomationSecret: !!firstAutomationValue(payload, ["automationSecret", "smartcoachAutomationSecret", "SMARTCOACH_AUTOMATION_SECRET", "secret", "token"]),
  };
}

function requestBodyObject(req) {
  if (!req || !req.body) return {};
  if (typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  try {
    const text = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body || "");
    return text ? JSON.parse(text) : {};
  } catch (error) {
    return {};
  }
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

function setSmartTrakSecurityHeaders(res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
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
  const nestedValue = findNestedAutomationValue(payload, keys);
  if (nestedValue !== undefined && nestedValue !== null && String(nestedValue).trim() !== "") return nestedValue;
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
    root.customData,
    root.custom_data,
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

function findNestedAutomationValue(source, keys, seen = new Set()) {
  if (!source || typeof source !== "object") return "";
  if (seen.has(source)) return "";
  seen.add(source);
  const wanted = new Set(keys.map((key) => normalizeAutomationKey(key)));
  if (Array.isArray(source)) {
    for (const item of source) {
      if (item && typeof item === "object") {
        const pairKey = item.key || item.name || item.field || item.label;
        const pairValue = item.value || item.val || item.text;
        if (pairKey && wanted.has(normalizeAutomationKey(pairKey)) && pairValue !== undefined && pairValue !== null && String(pairValue).trim() !== "") return pairValue;
      }
      const nested = findNestedAutomationValue(item, keys, seen);
      if (nested !== undefined && nested !== null && String(nested).trim() !== "") return nested;
    }
    return "";
  }
  for (const [key, value] of Object.entries(source)) {
    if (wanted.has(normalizeAutomationKey(key)) && value !== undefined && value !== null && String(value).trim() !== "") return value;
    const nested = findNestedAutomationValue(value, keys, seen);
    if (nested !== undefined && nested !== null && String(nested).trim() !== "") return nested;
  }
  return "";
}

function normalizeAutomationKey(key) {
  return String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
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
