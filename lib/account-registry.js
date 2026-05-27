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
      athlete: clean(item.properties && item.properties.athlete_name),
      workout: clean(item.properties && item.properties.workout_name),
      volume: clean(item.properties && item.properties.completed_volume),
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

async function mirrorSchoolRecords(accountKey, records, options = {}) {
  const items = Array.isArray(records) ? records.map(normalizeSchoolRecordMirror).filter(Boolean) : [];
  const deleteIds = Array.isArray(options.deleteIds) ? options.deleteIds.map(clean).filter(Boolean) : [];
  if (!items.length && !deleteIds.length) return { saved: false, count: 0, reason: "No school records to mirror." };

  const existing = await loadAccountRecord(accountKey);
  if (!existing.configured || !existing.found || !existing.record) {
    return { saved: false, count: 0, reason: "Account registry record was not found." };
  }

  const deleted = new Set(deleteIds);
  const byKey = new Map();
  const previous = Array.isArray(existing.record.recordsMirror) ? existing.record.recordsMirror : [];
  previous.concat(items).forEach((item) => {
    const key = clean(item.recordId || item.sourceRecordId || item.id);
    if (!key || deleted.has(key)) return;
    byKey.set(key, item);
  });

  const recordsMirror = Array.from(byKey.values()).slice(-500);
  const savedAt = new Date().toISOString();
  await saveAccountRecord(accountKey, {
    ...existing.record,
    recordsMirror,
    lastRecordsMirrorSync: {
      savedAt,
      count: items.length,
      deleted: deleteIds.length,
      total: recordsMirror.length,
    },
  });

  return { saved: true, count: items.length, deleted: deleteIds.length, total: recordsMirror.length, savedAt };
}

async function loadSchoolRecordsMirror(accountKey) {
  const existing = await loadAccountRecord(accountKey);
  if (!existing.configured || !existing.found || !existing.record) return [];
  const items = Array.isArray(existing.record.recordsMirror) ? existing.record.recordsMirror : [];
  return items.map(normalizeSchoolRecordMirror).filter(Boolean);
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

function normalizeSchoolRecordMirror(record) {
  if (!record || typeof record !== "object") return null;
  const recordId = clean(record.recordId || record.id);
  const sourceRecordId = clean(record.sourceRecordId);
  if (!recordId && !sourceRecordId) return null;
  return {
    id: recordId || sourceRecordId,
    recordId,
    sourceRecordId,
    recordName: clean(record.recordName),
    recordType: clean(record.recordType) || "School Record",
    recordScope: clean(record.recordScope) || "School",
    gender: clean(record.gender) || "Unlisted",
    sport: clean(record.sport) || "Track",
    event: clean(record.event),
    resultDisplay: clean(record.resultDisplay),
    resultMs: Number(record.resultMs) || 0,
    resultMark: clean(record.resultMark),
    athleteContact: clean(record.athleteContact),
    athleteName: clean(record.athleteName),
    meetName: clean(record.meetName),
    meetRecordId: clean(record.meetRecordId),
    meetResultId: clean(record.meetResultId),
    recordDate: clean(record.recordDate),
    season: clean(record.season),
    seasonYear: Number(record.seasonYear) || null,
    isCurrent: !!record.isCurrent,
    previousRecordDisplay: clean(record.previousRecordDisplay),
    previousRecordHolder: clean(record.previousRecordHolder),
    recordNotes: clean(record.recordNotes),
    sourceSystem: clean(record.sourceSystem),
    syncedAt: clean(record.syncedAt) || new Date().toISOString(),
  };
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
  mirrorSchoolRecords,
  loadSchoolRecordsMirror,
};
