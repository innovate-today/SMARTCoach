function getGhlContext(req) {
  const accountKey = normalizeAccountKey(
    headerValue(req, "x-smartcoach-account") ||
    queryValue(req, "account") ||
    queryValue(req, "tenant")
  ) || "default";
  const account = accountKey === "default" ? defaultAccount() : accountFromKey(accountKey);

  return {
    accountKey,
    token: account && account.token,
    locationId: account && account.locationId,
    productPlan: normalizeProductPlan(account && account.productPlan),
    accessCode: account && account.accessCode,
    coachSeats: normalizeCoachSeats(account && account.coachSeats),
    coachAccessCodes: normalizeCoachAccessCodes(account && account.coachAccessCodes, account && account.accessCode, account && account.coachSeats),
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
  return {
    status: normalizeSubscriptionStatus(source.subscriptionStatus),
    billingCadence: normalizeBillingCadence(source.billingCadence),
    amount: cleanText(source.subscriptionAmount),
    renewalDate: cleanText(source.renewalDate),
    stripeCustomerId: cleanText(source.stripeCustomerId),
    stripeSubscriptionId: cleanText(source.stripeSubscriptionId),
    notes: cleanText(source.subscriptionNotes),
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

function cleanText(value) {
  return String(value || "").trim();
}

function requireProPlan(req, res) {
  const { accountKey, productPlan, accessCode, coachSeats, coachAccessCodes } = getGhlContext(req);
  if (productPlan === "essential") {
    res.status(403).json({
      error: "SMARTCoach Pro with SMART Trak is required for this feature.",
      productPlan,
    });
    return false;
  }
  const allowedCodes = coachAccessCodes && coachAccessCodes.length ? coachAccessCodes : accessCode ? [accessCode] : [];
  if (!allowedCodes.length) return true;
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
};
