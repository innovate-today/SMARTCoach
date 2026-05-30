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

async function listAccountRecords(options = {}) {
  const config = registryConfig();
  if (!config.url || !config.token) {
    return { configured: false, accounts: [], count: 0 };
  }
  const limit = Math.max(1, Math.min(Number(options.limit) || 250, 500));
  const pattern = `${config.prefix}*`;
  const accounts = [];
  const seen = new Set();
  let cursor = "0";
  for (let page = 0; page < 20 && accounts.length < limit; page += 1) {
    const result = await registryRequest(config, ["scan", cursor, "match", pattern, "count", "100"]);
    if (!result || !Array.isArray(result.result)) break;
    cursor = clean(result.result[0] || "0") || "0";
    const keys = Array.isArray(result.result[1]) ? result.result[1] : [];
    for (const key of keys) {
      const cleanKey = clean(key);
      if (!cleanKey || seen.has(cleanKey) || cleanKey.includes(":records:")) continue;
      seen.add(cleanKey);
      const accountKey = cleanKey.slice(config.prefix.length);
      if (!accountKey || accountKey.includes(":")) continue;
      const loaded = await loadAccountRecord(accountKey);
      if (loaded && loaded.found && loaded.record) {
        accounts.push(accountListItem(loaded.record, accountKey));
      }
      if (accounts.length >= limit) break;
    }
    if (cursor === "0") break;
  }
  accounts.sort((a, b) => clean(b.updatedAt).localeCompare(clean(a.updatedAt)));
  return { configured: true, count: accounts.length, accounts };
}

function accountListItem(record, fallbackKey) {
  const source = record || {};
  const subscription = source.subscription || {};
  return {
    accountKey: clean(source.accountKey || fallbackKey),
    productPlan: clean(source.productPlan),
    coachSeats: Number(source.coachSeats) || 0,
    coachAccessCodesConfigured: Array.isArray(source.coachAccessCodes) ? source.coachAccessCodes.filter(Boolean).length : source.accessCode ? 1 : 0,
    subscriptionStatus: clean(subscription.status),
    billingCadence: clean(subscription.billingCadence),
    subscriptionAmount: clean(subscription.amount),
    renewalDate: clean(subscription.renewalDate),
    setupReady: accountListSetupReady(source),
    updatedAt: clean(source.updatedAt),
    lastUpdateSource: clean(source.lastAutomationEvent && source.lastAutomationEvent.source),
  };
}

function accountListSetupReady(record) {
  const source = record || {};
  const codes = Array.isArray(source.coachAccessCodes) ? source.coachAccessCodes : [];
  const coachAccessReady = source.requireCoachAccess === false || codes.length > 0 || !!source.accessCode;
  const plan = clean(source.productPlan).toLowerCase();
  if (plan === "essential") return coachAccessReady;
  return !!(source.token && source.locationId && coachAccessReady);
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
  const config = registryConfig();
  if (!config.url || !config.token) {
    return { saved: false, configured: false, reason: "Account registry is not configured." };
  }
  const items = Array.isArray(records) ? records.map(normalizeSchoolRecordMirror).filter(Boolean) : [];
  const deleteIds = Array.isArray(options.deleteIds) ? options.deleteIds.map(clean).filter(Boolean) : [];
  if (!items.length && !deleteIds.length) return { saved: false, count: 0, reason: "No school records to mirror." };

  const indexKey = recordsMirrorIndexKey(config, accountKey);
  const savedIds = [];
  const indexErrors = [];
  for (const item of items) {
    const key = recordMirrorId(item);
    if (!key) continue;
    await registryRequest(config, ["set", recordsMirrorItemKey(config, accountKey, key), JSON.stringify(item)]);
    savedIds.push(key);
    await registryRequest(config, ["sadd", indexKey, key]).catch((error) => {
      indexErrors.push(error.message || "Records index update failed.");
    });
  }
  for (const id of deleteIds) {
    await registryRequest(config, ["del", recordsMirrorItemKey(config, accountKey, id)]);
    await registryRequest(config, ["srem", indexKey, id]).catch((error) => {
      indexErrors.push(error.message || "Records index delete failed.");
    });
  }
  await updateRecordsMirrorManifest(config, accountKey, savedIds, deleteIds);

  return { saved: true, configured: true, count: items.length, deleted: deleteIds.length, indexErrors, savedAt: new Date().toISOString() };
}

async function loadSchoolRecordsMirror(accountKey) {
  const config = registryConfig();
  if (!config.url || !config.token) return [];
  const index = await registryRequest(config, ["smembers", recordsMirrorIndexKey(config, accountKey)]).catch(() => ({ result: [] }));
  const indexedIds = Array.isArray(index && index.result) ? index.result.map(clean).filter(Boolean) : [];
  const manifestIds = await loadRecordsMirrorManifest(config, accountKey);
  const scannedIds = await scanRecordMirrorIds(config, accountKey);
  const ids = Array.from(new Set(indexedIds.concat(manifestIds, scannedIds)));
  const keyedItems = [];
  for (const id of ids) {
    const item = await registryRequest(config, ["get", recordsMirrorItemKey(config, accountKey, id)]);
    const raw = item && item.result;
    if (!raw) continue;
    try {
      keyedItems.push(JSON.parse(raw));
    } catch (error) {}
  }
  const existing = await loadAccountRecord(accountKey);
  const legacyItems = existing.found && existing.record && Array.isArray(existing.record.recordsMirror) ? existing.record.recordsMirror : [];
  const byKey = new Map();
  legacyItems.concat(keyedItems).map(normalizeSchoolRecordMirror).filter(Boolean).forEach((item) => {
    const key = recordMirrorId(item);
    if (key) byKey.set(key, item);
  });
  return Array.from(byKey.values());
}

async function schoolRecordsMirrorStatus(accountKey) {
  const config = registryConfig();
  if (!config.url || !config.token) return { configured: false, indexCount: 0, scanCount: 0, loadCount: 0 };
  const index = await registryRequest(config, ["smembers", recordsMirrorIndexKey(config, accountKey)]).catch(() => ({ result: [] }));
  const indexedIds = Array.isArray(index && index.result) ? index.result.map(clean).filter(Boolean) : [];
  const manifestIds = await loadRecordsMirrorManifest(config, accountKey);
  const scannedIds = await scanRecordMirrorIds(config, accountKey);
  const loaded = await loadSchoolRecordsMirror(accountKey);
  return {
    configured: true,
    indexCount: indexedIds.length,
    manifestCount: manifestIds.length,
    scanCount: scannedIds.length,
    loadCount: loaded.length,
  };
}

async function updateRecordsMirrorManifest(config, accountKey, savedIds, deleteIds) {
  const manifestKey = recordsMirrorManifestKey(config, accountKey);
  const existing = await loadRecordsMirrorManifest(config, accountKey);
  const index = await registryRequest(config, ["smembers", recordsMirrorIndexKey(config, accountKey)]).catch(() => ({ result: [] }));
  const indexedIds = Array.isArray(index && index.result) ? index.result.map(clean).filter(Boolean) : [];
  const scannedIds = await scanRecordMirrorIds(config, accountKey);
  const ids = new Set(existing);
  indexedIds.concat(scannedIds).forEach((id) => ids.add(id));
  (savedIds || []).map(clean).filter(Boolean).forEach((id) => ids.add(id));
  (deleteIds || []).map(clean).filter(Boolean).forEach((id) => ids.delete(id));
  await registryRequest(config, ["set", manifestKey, JSON.stringify(Array.from(ids))]);
}

async function loadRecordsMirrorManifest(config, accountKey) {
  const item = await registryRequest(config, ["get", recordsMirrorManifestKey(config, accountKey)]).catch(() => ({ result: "" }));
  const raw = item && item.result;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(clean).filter(Boolean) : [];
  } catch (error) {
    return [];
  }
}

async function scanRecordMirrorIds(config, accountKey) {
  const pattern = `${registryKey(config, accountKey)}:records:item:*`;
  const ids = [];
  let cursor = "0";
  for (let page = 0; page < 10; page += 1) {
    const result = await registryRequest(config, ["scan", cursor, "match", pattern, "count", "100"]).catch(() => null);
    if (!result || !Array.isArray(result.result)) break;
    cursor = clean(result.result[0] || "0") || "0";
    const keys = Array.isArray(result.result[1]) ? result.result[1] : [];
    keys.forEach((key) => {
      const id = clean(key).slice(`${registryKey(config, accountKey)}:records:item:`.length);
      if (id) ids.push(id);
    });
    if (cursor === "0") break;
  }
  return ids;
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

function recordsMirrorIndexKey(config, accountKey) {
  return `${registryKey(config, accountKey)}:records:index`;
}

function recordsMirrorManifestKey(config, accountKey) {
  return `${registryKey(config, accountKey)}:records:manifest`;
}

function recordsMirrorItemKey(config, accountKey, id) {
  return `${registryKey(config, accountKey)}:records:item:${clean(id).toLowerCase().replace(/[^a-z0-9_-]/g, "_")}`;
}

function recordMirrorId(record) {
  return clean(record && (record.recordId || record.sourceRecordId || record.id));
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
    relayLeg1: clean(record.relayLeg1),
    relayLeg2: clean(record.relayLeg2),
    relayLeg3: clean(record.relayLeg3),
    relayLeg4: clean(record.relayLeg4),
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
  listAccountRecords,
  mirrorTrainingRecords,
  loadTrainingMirror,
  mirrorSchoolRecords,
  loadSchoolRecordsMirror,
  schoolRecordsMirrorStatus,
};
