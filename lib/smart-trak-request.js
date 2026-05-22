const { registryConfigured, loadAccountRecord } = require("./account-registry");

async function attachRegistryAccount(req) {
  const accountKey = accountKeyFromRequest(req);
  return attachRegistryAccountForKey(req, accountKey);
}

async function attachRegistryAccountForKey(req, accountKeyValue) {
  const accountKey = normalizeAccountKey(accountKeyValue) || "default";
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

function setSmartTrakSecurityHeaders(res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}

function accountKeyFromRequest(req) {
  return (
    headerValue(req, "x-smartcoach-account") ||
    firstQueryValue(req && req.query && (req.query.account || req.query.tenant || req.query.key)) ||
    "default"
  );
}

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function headerValue(req, name) {
  const headers = (req && req.headers) || {};
  return headers[name] || headers[name.toLowerCase()] || "";
}

function normalizeAccountKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

module.exports = {
  attachRegistryAccount,
  attachRegistryAccountForKey,
  setSmartTrakSecurityHeaders,
};
