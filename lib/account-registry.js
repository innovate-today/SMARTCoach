const DEFAULT_PREFIX = "smartcoach:account:";

function registryConfig() {
  const url = clean(
    process.env.SMARTCOACH_REGISTRY_REST_URL ||
      process.env.KV_REST_API_URL ||
      process.env.UPSTASH_REDIS_REST_URL
  ).replace(/\/+$/, "");
  const token = clean(
    process.env.SMARTCOACH_REGISTRY_REST_TOKEN ||
      process.env.KV_REST_API_TOKEN ||
      process.env.UPSTASH_REDIS_REST_TOKEN
  );
  return {
    url,
    token,
    prefix: clean(process.env.SMARTCOACH_REGISTRY_PREFIX) || DEFAULT_PREFIX,
  };
}

function registryConfigured() {
  const config = registryConfig();
  return !!(config.url && config.token);
}

async function saveAccountRecord(accountKey, record) {
  const config = registryConfig();
  if (!config.url || !config.token) {
    return { saved: false, configured: false, reason: "Account registry is not configured." };
  }
  const key = registryKey(config, accountKey);
  const payload = JSON.stringify({
    ...record,
    accountKey,
    updatedAt: new Date().toISOString(),
  });
  await registryRequest(config, ["set", key, payload]);
  return { saved: true, configured: true, key };
}

async function loadAccountRecord(accountKey) {
  const config = registryConfig();
  if (!config.url || !config.token) {
    return { found: false, configured: false, record: null };
  }
  const key = registryKey(config, accountKey);
  const result = await registryRequest(config, ["get", key]);
  const raw = result && result.result;
  if (!raw) return { found: false, configured: true, record: null, key };
  try {
    return { found: true, configured: true, record: JSON.parse(raw), key };
  } catch (error) {
    return { found: false, configured: true, record: null, key, error: "Registry record could not be parsed." };
  }
}

async function registryRequest(config, parts) {
  const path = parts.map((part) => encodeURIComponent(String(part))).join("/");
  const response = await fetch(`${config.url}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
    },
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    data = { result: text };
  }
  if (!response.ok || data.error) {
    throw httpError(response.status || 502, data.error || data.message || "Account registry request failed.");
  }
  return data;
}

function registryKey(config, accountKey) {
  return `${config.prefix}${clean(accountKey).toLowerCase().replace(/[^a-z0-9_-]/g, "") || "default"}`;
}

function clean(value) {
  return String(value || "").trim();
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

module.exports = {
  registryConfigured,
  saveAccountRecord,
  loadAccountRecord,
};
