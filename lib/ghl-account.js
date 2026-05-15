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
    logoUrl: account && account.logoUrl,
  };
}

function defaultAccount() {
  return {
    token: process.env.GHL_PRIVATE_INTEGRATION_TOKEN,
    locationId: process.env.GHL_LOCATION_ID,
    productPlan: process.env.SMARTCOACH_PRODUCT_PLAN,
    accessCode: process.env.SMARTCOACH_ACCESS_CODE,
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

function requireProPlan(req, res) {
  const { accountKey, productPlan, accessCode } = getGhlContext(req);
  if (productPlan === "essential") {
    res.status(403).json({
      error: "SMARTCoach Pro is required for this feature.",
      productPlan,
    });
    return false;
  }
  if (!accessCode) return true;
  const provided = String(headerValue(req, "x-smartcoach-access-code") || queryValue(req, "access") || "").trim();
  if (provided && safeEqual(provided, accessCode)) return true;
  res.status(401).json({
    error: "SMARTCoach Pro access code is required.",
    accountKey,
    productPlan,
    accessCodeRequired: true,
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
