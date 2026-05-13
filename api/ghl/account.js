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
  };
}

function defaultAccount() {
  return {
    token: process.env.GHL_PRIVATE_INTEGRATION_TOKEN,
    locationId: process.env.GHL_LOCATION_ID,
  };
}

function accountFromKey(accountKey) {
  const fromJson = accountFromJson(accountKey);
  if (fromJson) return fromJson;

  const suffix = accountKey.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  return {
    token: process.env[`GHL_PRIVATE_INTEGRATION_TOKEN_${suffix}`],
    locationId: process.env[`GHL_LOCATION_ID_${suffix}`],
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

module.exports = {
  getGhlContext,
};
