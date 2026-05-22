const crypto = require("crypto");

function getGhlContext(req) {
  const accountKey = normalizeAccountKey(
    headerValue(req, "x-smartcoach-account") ||
    queryValue(req, "account") ||
    queryValue(req, "tenant")
  ) || "default";
  const registryAccount = req && req.smartcoachRegistryAccount;
  const account = registryAccount || (accountKey === "default" ? defaultAccount() : accountFromKey(accountKey));

  return {
    accountKey,
    token: account && account.token,
    locationId: account && account.locationId,
    productPlan: normalizeProductPlan(account && account.productPlan),
    accessCode: account && account.accessCode,
    coachSeats: normalizeCoachSeats(account && account.coachSeats),
    coachAccessCodes: normalizeCoachAccessCodes(account && account.coachAccessCodes, account && account.accessCode, account && account.coachSeats),
    requireCoachAccess: normalizeBoolean(account && account.requireCoachAccess),
    subscription: normalizeSubscription(account),
    logoUrl: account && account.logoUrl,
  };
}

function defaultAccount() {
  return {
    token: process.env.GHL_PRIVATE_INTEGRATION_TOKEN,
    locationId: process.env.GHL_LOCATION_ID,
    productPlan: process.env.SMARTCOACH_PRODUCT_PLAN,
    accessCode: process.env.SMARTCOACH_ACCESS_CODE,
    coachSeats: process.env.SMARTCOACH_COACH_SEATS,
    coachAccessCodes: process.env.SMARTCOACH_COACH_ACCESS_CODES,
    requireCoachAccess: process.env.SMARTCOACH_REQUIRE_COACH_ACCESS,
    subscriptionStatus: process.env.SMARTCOACH_SUBSCRIPTION_STATUS,
    billingCadence: process.env.SMARTCOACH_BILLING_CADENCE,
    subscriptionAmount: process.env.SMARTCOACH_SUBSCRIPTION_AMOUNT,
    renewalDate: process.env.SMARTCOACH_RENEWAL_DATE,
    stripeCustomerId: process.env.SMARTCOACH_STRIPE_CUSTOMER_ID,
    stripeSubscriptionId: process.env.SMARTCOACH_STRIPE_SUBSCRIPTION_ID,
    subscriptionNotes: process.env.SMARTCOACH_SUBSCRIPTION_NOTES,
    logoUrl: process.env.SMARTCOACH_LOGO_URL,
  };
}

function accountFromKey(accountKey) {
  const fromJson = accountFromJson(accountKey);
  if (fromJson) return fromJson;

  const suffix = accountKey.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  return {
    token: process.env[`GHL_PRIVATE_INTEGRATION_TOKEN_${suffix}`],
    locationId: process.env[`GHL_LOCATION_ID_${suffix}`],
    productPlan: process.env[`SMARTCOACH_PRODUCT_PLAN_${suffix}`],
    accessCode: process.env[`SMARTCOACH_ACCESS_CODE_${suffix}`],
    coachSeats: process.env[`SMARTCOACH_COACH_SEATS_${suffix}`],
    coachAccessCodes: process.env[`SMARTCOACH_COACH_ACCESS_CODES_${suffix}`],
    requireCoachAccess: process.env[`SMARTCOACH_REQUIRE_COACH_ACCESS_${suffix}`] || process.env.SMARTCOACH_REQUIRE_COACH_ACCESS,
    subscriptionStatus: process.env[`SMARTCOACH_SUBSCRIPTION_STATUS_${suffix}`],
    billingCadence: process.env[`SMARTCOACH_BILLING_CADENCE_${suffix}`],
    subscriptionAmount: process.env[`SMARTCOACH_SUBSCRIPTION_AMOUNT_${suffix}`],
    renewalDate: process.env[`SMARTCOACH_RENEWAL_DATE_${suffix}`],
    stripeCustomerId: process.env[`SMARTCOACH_STRIPE_CUSTOMER_ID_${suffix}`],
    stripeSubscriptionId: process.env[`SMARTCOACH_STRIPE_SUBSCRIPTION_ID_${suffix}`],
    subscriptionNotes: process.env[`SMARTCOACH_SUBSCRIPTION_NOTES_${suffix}`],
    logoUrl: process.env[`SMARTCOACH_LOGO_URL_${suffix}`],
  };
}

function accountFromJson(accountKey) {
  const raw = process.env.SMARTCOACH_ACCOUNTS;
  if (!raw) return null;
  try {
    const accounts = JSON.parse(raw);
    const account = accounts && accounts[accountKey];
    if (!account) return null;
    return {
      token: account.token || account.ghlToken || account.privateIntegrationToken,
      locationId: account.locationId || account.ghlLocationId,
      productPlan: account.productPlan || account.plan || account.subscriptionPlan,
      accessCode: account.accessCode || account.dashboardAccessCode,
      coachSeats: account.coachSeats || account.coaches || account.maxCoaches || account.coachSeatLimit,
      coachAccessCodes: account.coachAccessCodes || account.coachCodes || account.allowedCoachCodes,
      requireCoachAccess:
        account.requireCoachAccess !== undefined
          ? account.requireCoachAccess
          : account.coachAccessRequired !== undefined
            ? account.coachAccessRequired
            : account.requireAccessCode,
      subscriptionStatus: account.subscriptionStatus || account.status,
      billingCadence: account.billingCadence || account.billingInterval || account.cadence,
      subscriptionAmount: account.subscriptionAmount || account.amount || account.price,
      renewalDate: account.renewalDate || account.renewsOn || account.nextBillingDate,
      stripeCustomerId: account.stripeCustomerId || account.customerId,
      stripeSubscriptionId: account.stripeSubscriptionId || account.subscriptionId,
      subscriptionNotes: account.subscriptionNotes || account.notes,
      logoUrl: account.logoUrl || account.brandLogoUrl || account.schoolLogoUrl,
    };
  } catch (error) {
    return null;
  }
}

function headerValue(req, name) {
  const headers = (req && req.headers) || {};
  return headers[name] || headers[name.toLowerCase()] || "";
}

function queryValue(req, name) {
  return req && req.query ? req.query[name] : "";
}

function normalizeAccountKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function normalizeProductPlan(value) {
  return String(value || "").trim().toLowerCase() === "essential" ? "essential" : "pro";
}

function normalizeCoachSeats(value) {
  const seats = Number(String(value || "").trim());
  return seats === 3 ? 3 : 1;
}

function normalizeCoachAccessCodes(value, fallbackAccessCode, seatsValue) {
  const seats = normalizeCoachSeats(seatsValue);
  const codes = [];
  const add = (item) => {
    const code = String(item || "").trim();
    if (code && !codes.includes(code)) codes.push(code);
  };
  if (value) {
    if (Array.isArray(value)) {
      value.forEach(add);
    } else {
      const raw = String(value || "").trim();
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) parsed.forEach(add);
          else add(raw);
        } catch (error) {
          raw.split(/[\n,]+/).forEach(add);
        }
      }
    }
  }
  add(fallbackAccessCode);
  return codes.slice(0, seats);
}

function normalizeSubscription(account) {
  const source = account || {};
  const subscription = source.subscription || {};
  return {
    status: normalizeSubscriptionStatus(source.subscriptionStatus || subscription.status),
    billingCadence: normalizeBillingCadence(source.billingCadence || subscription.billingCadence),
    amount: cleanText(source.subscriptionAmount || subscription.amount),
    renewalDate: cleanText(source.renewalDate || subscription.renewalDate),
    stripeCustomerId: cleanText(source.stripeCustomerId || subscription.stripeCustomerId),
    stripeSubscriptionId: cleanText(source.stripeSubscriptionId || subscription.stripeSubscriptionId),
    notes: cleanText(source.subscriptionNotes || subscription.notes),
  };
}

function normalizeSubscriptionStatus(value) {
  const status = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  return ["active", "trialing", "past_due", "paused", "canceled", "incomplete"].includes(status) ? status : "";
}

function normalizeBillingCadence(value) {
  const cadence = String(value || "").trim().toLowerCase();
  return ["monthly", "annual"].includes(cadence) ? cadence : "";
}

function normalizeBoolean(value) {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function cleanText(value) {
  return String(value || "").trim();
}

function requireProPlan(req, res) {
  const { accountKey, productPlan, accessCode, coachSeats, coachAccessCodes, requireCoachAccess, subscription } = getGhlContext(req);
  if (productPlan === "essential") {
    res.status(403).json({
      error: "SMARTCoach Pro with SMART Trak is required for this feature.",
      productPlan,
    });
    return false;
  }
  if (!subscriptionAccessAllowed(subscription)) {
    res.status(402).json({
      error: subscriptionBlockedMessage(subscription),
      accountKey,
      productPlan,
      subscriptionStatus: subscription && subscription.status,
      subscriptionAccessRequired: true,
    });
    return false;
  }
  const allowedCodes = coachAccessCodes && coachAccessCodes.length ? coachAccessCodes : accessCode ? [accessCode] : [];
  if (!allowedCodes.length) {
    if (requireCoachAccess) {
      res.status(503).json({
        error: "SMART Trak coach access is required, but no coach access code is configured for this account.",
        accountKey,
        productPlan,
        coachAccessRequired: true,
        accessCodeMissing: true,
      });
      return false;
    }
    return true;
  }
  const session = coachSessionFromRequest(req, accountKey);
  if (session) return true;
  const provided = String(headerValue(req, "x-smartcoach-access-code") || queryValue(req, "access") || "").trim();
  if (provided && allowedCodes.some((code) => safeEqual(provided, code))) return true;
  res.status(401).json({
    error: "SMART Trak coach access code is required.",
    accountKey,
    productPlan,
    coachSeats,
    accessCodeRequired: true,
    coachAccessRequired: true,
  });
  return false;
}

function coachCodeAllowed(req, providedCode) {
  const { accountKey, productPlan, accessCode, coachSeats, coachAccessCodes, requireCoachAccess, subscription } = getGhlContext(req);
  if (productPlan === "essential") {
    return { allowed: false, statusCode: 403, error: "SMARTCoach Pro with SMART Trak is required for this feature.", accountKey, productPlan };
  }
  if (!subscriptionAccessAllowed(subscription)) {
    return {
      allowed: false,
      statusCode: 402,
      error: subscriptionBlockedMessage(subscription),
      accountKey,
      productPlan,
      subscriptionStatus: subscription && subscription.status,
      subscriptionAccessRequired: true,
    };
  }
  const allowedCodes = coachAccessCodes && coachAccessCodes.length ? coachAccessCodes : accessCode ? [accessCode] : [];
  if (!allowedCodes.length) {
    if (requireCoachAccess) {
      return {
        allowed: false,
        statusCode: 503,
        error: "SMART Trak coach access is required, but no coach access code is configured for this account.",
        accountKey,
        productPlan,
        coachAccessRequired: true,
        accessCodeMissing: true,
      };
    }
    return { allowed: true, accountKey, productPlan, coachSeats };
  }
  const provided = cleanText(providedCode);
  if (provided && allowedCodes.some((code) => safeEqual(provided, code))) return { allowed: true, accountKey, productPlan, coachSeats };
  return {
    allowed: false,
    statusCode: 401,
    error: "SMART Trak coach access code is required.",
    accountKey,
    productPlan,
    coachSeats,
    accessCodeRequired: true,
    coachAccessRequired: true,
  };
}

function createCoachSession(accountKey, options = {}) {
  const secret = coachSessionSecret();
  if (!secret) return null;
  const ttlSeconds = coachSessionTtlSeconds(options.ttlSeconds);
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = {
    accountKey: normalizeAccountKey(accountKey) || "default",
    exp: expiresAt,
    iat: Math.floor(Date.now() / 1000),
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signSessionPayload(encodedPayload, secret);
  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt,
    expiresAtIso: new Date(expiresAt * 1000).toISOString(),
  };
}

function verifyCoachSession(token, accountKey) {
  const secret = coachSessionSecret();
  if (!secret) return null;
  const parts = String(token || "").split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const expected = signSessionPayload(parts[0], secret);
  if (!safeEqual(parts[1], expected)) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(parts[0]));
    const expectedAccount = normalizeAccountKey(accountKey) || "default";
    if (normalizeAccountKey(payload.accountKey) !== expectedAccount) return null;
    if (!payload.exp || Number(payload.exp) < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (error) {
    return null;
  }
}

function coachSessionFromRequest(req, accountKey) {
  const token = headerValue(req, "x-smartcoach-session") || queryValue(req, "session");
  return verifyCoachSession(token, accountKey);
}

function coachSessionSecret() {
  return cleanText(process.env.SMARTCOACH_SESSION_SECRET || process.env.SMARTCOACH_AUTOMATION_SECRET || process.env.SMARTCOACH_ADMIN_SETUP_CODE);
}

function coachSessionSecretSource() {
  if (cleanText(process.env.SMARTCOACH_SESSION_SECRET)) return "session-secret";
  if (cleanText(process.env.SMARTCOACH_AUTOMATION_SECRET)) return "automation-secret-fallback";
  if (cleanText(process.env.SMARTCOACH_ADMIN_SETUP_CODE)) return "admin-setup-code-fallback";
  return "";
}

function coachSessionTtlSeconds(value) {
  const raw = Number(value || process.env.SMARTCOACH_SESSION_TTL_SECONDS);
  const fallback = 12 * 60 * 60;
  const seconds = Number.isFinite(raw) && raw > 0 ? raw : fallback;
  return Math.max(15 * 60, Math.min(seconds, 7 * 24 * 60 * 60));
}

function signSessionPayload(encodedPayload, secret) {
  return crypto.createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function base64UrlEncode(value) {
  return Buffer.from(String(value), "utf8").toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(String(value), "base64url").toString("utf8");
}

function subscriptionAccessAllowed(subscription) {
  const status = subscription && subscription.status;
  if (!status) return true;
  return status === "active" || status === "trialing";
}

function subscriptionBlockedMessage(subscription) {
  const status = subscription && subscription.status ? subscription.status.replace("_", " ") : "inactive";
  return `SMART Trak access is blocked because this subscription is ${status}.`;
}

function safeEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

module.exports = {
  getGhlContext,
  requireProPlan,
  coachCodeAllowed,
  createCoachSession,
  verifyCoachSession,
  coachSessionSecretSource,
  coachSessionTtlSeconds,
  subscriptionAccessAllowed,
};
