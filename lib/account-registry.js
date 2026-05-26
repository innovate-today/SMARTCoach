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

async function registryHealth() {
  const config = registryConfig();
  if (!config.url || !config.token) {
    return { configured: false, reachable: false, error: "Account registry is not configured." };
  }
  try {
    await registryRequest(config, ["ping"]);
    return { configured: true, reachable: true };
  } catch (error) {
    return {
      configured: true,
      reachable: false,
      error: error.message || "Account registry could not be reached.",
    };
  }
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

async function mirrorTrainingRecords(accountKey, records) {
  const items = Array.isArray(records) ? records.map(normalizeTrainingMirrorRecord).filter(Boolean) : [];
  if (!items.length) return { saved: false, count: 0, reason: "No training records to mirror." };

  const existing = await loadAccountRecord(accountKey);
  if (!existing.configured || !existing.found || !existing.record) {
    return { saved: false, count: 0, reason: "Account registry record was not found." };
  }

  const previous = Array.isArray(existing.record.trainingMirror) ? existing.record.trainingMirror : [];
  const byKey = new Map();
  previous.concat(items).forEach((item) => {
    const key = clean(item.sourceRecordId || item.recordId || item.id);
    if (!key) return;
    byKey.set(key, item);
  });

  const trainingMirror = Array.from(byKey.values())
    .sort((a, b) => clean(a.syncedAt || a.updatedAt || a.createdAt).localeCompare(clean(b.syncedAt || b.updatedAt || b.createdAt)))
    .slice(-500);
  const savedAt = new Date().toISOString();
  const lastTrainingMirrorSync = {
    savedAt,
    count: items.length,
    total: trainingMirror.length,
    latest: items.slice(-5).map((item) => ({
      athlete: clean(item.properties && (item.properties.athlete_name_snapshot || item.properties.athlete_name)),
      workout: clean(item.properties && (item.properties.group_name || item.properties.workout_type || item.properties.workout_name)),
      volume: completedVolumeFromCoachNote(clean(item.properties && item.properties.coach_note)) || clean(item.properties && item.properties.completed_volume),
      recordId: clean(item.recordId),
      sourceRecordId: clean(item.sourceRecordId),
    })),
  };

  await saveAccountRecord(accountKey, {
    ...existing.record,
    trainingMirror,
    lastTrainingMirrorSync,
  });

  return { saved: true, count: items.length, total: trainingMirror.length, savedAt };
}

async function loadTrainingMirror(accountKey) {
  const existing = await loadAccountRecord(accountKey);
  if (!existing.configured || !existing.found || !existing.record) return [];
  const items = Array.isArray(existing.record.trainingMirror) ? existing.record.trainingMirror : [];
  return items.map((item, index) => {
    const props = (item && item.properties) || {};
    return {
      id: clean(item && (item.recordId || item.sourceRecordId || item.id)) || `mirror_${index}`,
      createdAt: clean(item && (item.createdAt || item.syncedAt)),
      updatedAt: clean(item && (item.updatedAt || item.syncedAt)),
      properties: props,
    };
  });
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

function normalizeTrainingMirrorRecord(record) {
  if (!record || typeof record !== "object") return null;
  const properties = record.properties && typeof record.properties === "object" ? record.properties : {};
  const sourceRecordId = clean(record.sourceRecordId || properties.source_record_id);
  const recordId = clean(record.recordId || record.id);
  if (!sourceRecordId && !recordId) return null;
  return {
    id: recordId || sourceRecordId,
    recordId,
    sourceRecordId,
    createdAt: clean(record.createdAt),
    updatedAt: clean(record.updatedAt),
    syncedAt: clean(record.syncedAt) || new Date().toISOString(),
    properties,
  };
}

function completedVolumeFromCoachNote(note) {
  const line = clean(note).split(/\r?\n/).find((item) => item.trim().toLowerCase().startsWith("completed volume:"));
  return line ? clean(line.slice("completed volume:".length)) : "";
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
  registryHealth,
  saveAccountRecord,
  loadAccountRecord,
  mirrorTrainingRecords,
  loadTrainingMirror,
};
