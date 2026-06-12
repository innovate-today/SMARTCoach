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

async function saveAttendanceRecords(accountKey, records, options = {}) {
  const items = Array.isArray(records) ? records.map(normalizeAttendanceRecord).filter(Boolean) : [];
  const deleteIds = Array.isArray(options.deleteIds) ? options.deleteIds.map(clean).filter(Boolean) : [];
  if (!items.length && !deleteIds.length) return { saved: false, count: 0, reason: "No attendance records to save." };

  const existing = await loadAccountRecord(accountKey);
  if (!existing.configured || !existing.found || !existing.record) {
    return { saved: false, count: 0, reason: "Account registry record was not found." };
  }

  const previous = Array.isArray(existing.record.attendanceMirror) ? existing.record.attendanceMirror : [];
  const byKey = new Map();
  previous.forEach((item) => {
    const key = attendanceRecordId(item);
    if (!key) return;
    byKey.set(key, { ...item, id: key });
  });
  deleteIds.forEach((id) => byKey.delete(id));
  items.forEach((item) => {
    const key = attendanceRecordId(item);
    if (!key) return;
    byKey.set(key, { ...item, id: key });
  });

  const attendanceMirror = Array.from(byKey.values())
    .sort((a, b) => clean(a.date).localeCompare(clean(b.date)) || clean(a.updatedAt).localeCompare(clean(b.updatedAt)))
    .slice(-5000);
  const savedAt = new Date().toISOString();
  const lastAttendanceSync = {
    savedAt,
    count: items.length,
    total: attendanceMirror.length,
    latest: items.slice(-8).map((item) => ({
      athlete: item.athleteName,
      group: item.groupName,
      date: item.date,
      checkpoint: item.checkpointName,
      status: item.status,
    })),
  };

  await saveAccountRecord(accountKey, {
    ...existing.record,
    attendanceMirror,
    lastAttendanceSync,
  });

  return { saved: true, count: items.length, total: attendanceMirror.length, savedAt };
}

async function loadAttendanceRecords(accountKey, filters = {}) {
  const existing = await loadAccountRecord(accountKey);
  if (!existing.configured || !existing.found || !existing.record) return [];
  const start = clean(filters.start);
  const end = clean(filters.end);
  const group = clean(filters.group || filters.groupId).toLowerCase();
  const sport = clean(filters.sport).toLowerCase();
  const season = clean(filters.season).toLowerCase();
  const athleteId = clean(filters.athleteId || filters.contactId).toLowerCase();
  const athleteName = clean(filters.athleteName).toLowerCase();
  const status = clean(filters.status).toLowerCase();
  return (Array.isArray(existing.record.attendanceMirror) ? existing.record.attendanceMirror : [])
    .map(normalizeAttendanceRecord)
    .filter(Boolean)
    .filter((item) => {
      if (start && item.date < start) return false;
      if (end && item.date > end) return false;
      if (group && clean(item.groupId).toLowerCase() !== group && clean(item.groupName).toLowerCase() !== group) return false;
      if (sport && sport !== "all" && clean(item.sport).toLowerCase() !== sport) return false;
      if (season && season !== "all" && clean(item.season).toLowerCase() !== season && String(item.seasonYear || "") !== season) return false;
      if (athleteId || athleteName) {
        const idMatch = athleteId && (clean(item.athleteId).toLowerCase() === athleteId || clean(item.contactId).toLowerCase() === athleteId || clean(item.smartcoachAthleteId).toLowerCase() === athleteId);
        const nameMatch = athleteName && clean(item.athleteName).toLowerCase() === athleteName;
        if (!idMatch && !nameMatch) return false;
      }
      if (status && status !== "all" && item.status !== status) return false;
      return true;
    })
    .sort((a, b) => clean(b.date).localeCompare(clean(a.date)) || clean(a.groupName).localeCompare(clean(b.groupName)) || clean(a.athleteName).localeCompare(clean(b.athleteName)));
}

async function saveKeepTrakNotes(accountKey, notes, options = {}) {
  const items = Array.isArray(notes) ? notes.map(normalizeKeepTrakNote).filter(Boolean) : [];
  const deleteIds = Array.isArray(options.deleteIds) ? options.deleteIds.map(clean).filter(Boolean) : [];
  if (!items.length && !deleteIds.length) return { saved: false, count: 0, reason: "No Keep Trak notes to save." };

  const existing = await loadAccountRecord(accountKey);
  if (!existing.configured || !existing.found || !existing.record) {
    return { saved: false, count: 0, reason: "Account registry record was not found.", notes: items };
  }

  const previous = Array.isArray(existing.record.keepTrakNotes) ? existing.record.keepTrakNotes : [];
  const byId = new Map();
  previous.map(normalizeKeepTrakNote).filter(Boolean).forEach((item) => byId.set(item.id, item));
  deleteIds.forEach((id) => byId.delete(id));
  items.forEach((item) => {
    const previousItem = byId.get(item.id) || {};
    byId.set(item.id, {
      ...previousItem,
      ...item,
      createdAt: previousItem.createdAt || item.createdAt,
      updatedAt: new Date().toISOString(),
    });
  });

  const keepTrakNotes = Array.from(byId.values())
    .sort((a, b) => clean(a.date).localeCompare(clean(b.date)) || clean(a.createdAt).localeCompare(clean(b.createdAt)))
    .slice(-1500);
  const savedAt = new Date().toISOString();

  await saveAccountRecord(accountKey, {
    ...existing.record,
    keepTrakNotes,
    lastKeepTrakSync: {
      savedAt,
      count: items.length,
      deleted: deleteIds.length,
      total: keepTrakNotes.length,
    },
  });

  return { saved: true, count: items.length, deleted: deleteIds.length, total: keepTrakNotes.length, notes: items, savedAt };
}

async function loadKeepTrakNotes(accountKey, filters = {}) {
  const existing = await loadAccountRecord(accountKey);
  if (!existing.configured || !existing.found || !existing.record) return [];
  const date = clean(filters.date).slice(0, 10);
  const start = clean(filters.start).slice(0, 10);
  const end = clean(filters.end).slice(0, 10);
  const includeCompleted = clean(filters.includeCompleted).toLowerCase() !== "false";
  const includeArchived = clean(filters.includeArchived).toLowerCase() === "true";
  return (Array.isArray(existing.record.keepTrakNotes) ? existing.record.keepTrakNotes : [])
    .map(normalizeKeepTrakNote)
    .filter(Boolean)
    .filter((item) => {
      if (!includeArchived && item.archived) return false;
      if (!includeCompleted && item.completed) return false;
      if (date) return item.date === date || (!item.completed && item.date < date);
      if (start && item.date < start) return false;
      if (end && item.date > end) return false;
      return true;
    })
    .sort((a, b) => {
      if (!!a.completed !== !!b.completed) return a.completed ? 1 : -1;
      return clean(b.date).localeCompare(clean(a.date)) || clean(b.updatedAt).localeCompare(clean(a.updatedAt));
    });
}

async function saveBugTrakReport(accountKey, report) {
  const item = normalizeBugTrakReport(report);
  if (!item) return { saved: false, count: 0, reason: "No bug report was provided." };

  const existing = await loadAccountRecord(accountKey);
  if (!existing.configured || !existing.found || !existing.record) {
    return { saved: false, count: 0, reason: "Account registry record was not found.", report: item };
  }

  const previous = Array.isArray(existing.record.bugTrakReports) ? existing.record.bugTrakReports : [];
  const bugTrakReports = previous
    .map(normalizeBugTrakReport)
    .filter(Boolean)
    .concat([item])
    .sort((a, b) => clean(a.createdAt).localeCompare(clean(b.createdAt)))
    .slice(-500);
  const savedAt = new Date().toISOString();

  await saveAccountRecord(accountKey, {
    ...existing.record,
    bugTrakReports,
    lastBugTrakReport: {
      savedAt,
      reportId: item.id,
      page: item.page,
      urgency: item.urgency,
      summary: item.summary,
    },
  });

  return { saved: true, count: 1, total: bugTrakReports.length, report: item, savedAt };
}

async function loadBugTrakReports(accountKey, filters = {}) {
  const existing = await loadAccountRecord(accountKey);
  if (!existing.configured || !existing.found || !existing.record) return [];
  const status = clean(filters.status).toLowerCase();
  return (Array.isArray(existing.record.bugTrakReports) ? existing.record.bugTrakReports : [])
    .map(normalizeBugTrakReport)
    .filter(Boolean)
    .filter((item) => !status || status === "all" || clean(item.status).toLowerCase() === status)
    .sort((a, b) => clean(b.createdAt).localeCompare(clean(a.createdAt)));
}

async function savePartnerTimingSession(accountKey, session) {
  const item = normalizePartnerTimingSession(session);
  if (!item || !item.id) return { saved: false, reason: "Partner Timing session is required." };

  const existing = await loadAccountRecord(accountKey);
  if (!existing.configured || !existing.found || !existing.record) {
    return { saved: false, reason: "Account registry record was not found.", session: item };
  }

  const previous = Array.isArray(existing.record.partnerTimingSessions) ? existing.record.partnerTimingSessions : [];
  const byId = new Map();
  previous.map(normalizePartnerTimingSession).filter(Boolean).forEach((entry) => byId.set(entry.id, entry));
  const current = byId.get(item.id) || {};
  const mergedRecords = new Map();
  (current.records || []).concat(item.records || []).forEach((record) => {
    if (!record || !record.id) return;
    mergedRecords.set(record.id, record);
  });
  byId.set(item.id, {
    ...current,
    ...item,
    records: Array.from(mergedRecords.values()).sort((a, b) => clean(a.tapAt).localeCompare(clean(b.tapAt))),
    createdAt: current.createdAt || item.createdAt,
    updatedAt: new Date().toISOString(),
  });

  const partnerTimingSessions = Array.from(byId.values())
    .sort((a, b) => clean(a.updatedAt).localeCompare(clean(b.updatedAt)))
    .slice(-300);
  const savedAt = new Date().toISOString();

  await saveAccountRecord(accountKey, {
    ...existing.record,
    partnerTimingSessions,
    lastPartnerTimingSync: {
      savedAt,
      sessionId: item.id,
      meetName: item.meetName,
      recordCount: item.records.length,
    },
  });

  return { saved: true, session: byId.get(item.id), savedAt };
}

async function loadPartnerTimingSessions(accountKey, filters = {}) {
  const existing = await loadAccountRecord(accountKey);
  if (!existing.configured || !existing.found || !existing.record) return [];
  const id = clean(filters.id || filters.sessionId);
  return (Array.isArray(existing.record.partnerTimingSessions) ? existing.record.partnerTimingSessions : [])
    .map(normalizePartnerTimingSession)
    .filter(Boolean)
    .filter((item) => !id || item.id === id)
    .sort((a, b) => clean(b.updatedAt).localeCompare(clean(a.updatedAt)));
}

async function recordCoachDeviceSession(accountKey, device) {
  const config = registryConfig();
  if (!config.url || !config.token) {
    return { saved: false, configured: false, reason: "Account registry is not configured." };
  }
  const item = normalizeCoachDeviceSession(device);
  if (!item.deviceId) return { saved: false, configured: true, reason: "Device ID is required." };
  const key = coachDeviceItemKey(config, accountKey, item.deviceId);
  const existing = await registryRequest(config, ["get", key]).catch(() => ({ result: "" }));
  let previous = {};
  try {
    previous = existing && existing.result ? JSON.parse(existing.result) : {};
  } catch (error) {
    previous = {};
  }
  const now = new Date().toISOString();
  const record = {
    ...previous,
    ...item,
    accountKey: clean(accountKey).toLowerCase() || "default",
    firstSeenAt: clean(previous.firstSeenAt) || now,
    lastSeenAt: now,
    seenCount: (Number(previous.seenCount) || 0) + 1,
  };
  await registryRequest(config, ["set", key, JSON.stringify(record)]);
  await registryRequest(config, ["sadd", coachDeviceIndexKey(config, accountKey), item.deviceId]).catch(() => {});
  return { saved: true, configured: true, deviceId: item.deviceId, lastSeenAt: now };
}

async function loadCoachDeviceUsage(accountKey) {
  const config = registryConfig();
  if (!config.url || !config.token) {
    return coachDeviceUsageSummary([]);
  }
  const index = await registryRequest(config, ["smembers", coachDeviceIndexKey(config, accountKey)]).catch(() => ({ result: [] }));
  const ids = Array.isArray(index && index.result) ? index.result.map(clean).filter(Boolean) : [];
  const devices = [];
  for (const id of ids) {
    const item = await registryRequest(config, ["get", coachDeviceItemKey(config, accountKey, id)]).catch(() => ({ result: "" }));
    if (!item || !item.result) continue;
    try {
      const parsed = normalizeCoachDeviceSession(JSON.parse(item.result));
      if (parsed.deviceId) devices.push(parsed);
    } catch (error) {}
  }
  return coachDeviceUsageSummary(devices);
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
    await registryRequest(config, ["srem", recordsMirrorDeletedKey(config, accountKey), key]).catch(() => {});
  }
  for (const id of deleteIds) {
    await registryRequest(config, ["del", recordsMirrorItemKey(config, accountKey, id)]);
    await registryRequest(config, ["sadd", recordsMirrorDeletedKey(config, accountKey), id]).catch((error) => {
      indexErrors.push(error.message || "Records deleted-index update failed.");
    });
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
  const deletedIds = await loadSchoolRecordsDeletedIds(accountKey);
  const deleted = new Set(deletedIds);
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
    if (key && !deleted.has(key)) byKey.set(key, item);
  });
  return Array.from(byKey.values());
}

async function loadSchoolRecordsDeletedIds(accountKey) {
  const config = registryConfig();
  if (!config.url || !config.token) return [];
  const result = await registryRequest(config, ["smembers", recordsMirrorDeletedKey(config, accountKey)]).catch(() => ({ result: [] }));
  return Array.isArray(result && result.result) ? result.result.map(clean).filter(Boolean) : [];
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

function recordsMirrorDeletedKey(config, accountKey) {
  return `${registryKey(config, accountKey)}:records:deleted`;
}

function recordsMirrorItemKey(config, accountKey, id) {
  return `${registryKey(config, accountKey)}:records:item:${clean(id).toLowerCase().replace(/[^a-z0-9_-]/g, "_")}`;
}

function coachDeviceIndexKey(config, accountKey) {
  return `${registryKey(config, accountKey)}:coach_devices:index`;
}

function coachDeviceItemKey(config, accountKey, id) {
  return `${registryKey(config, accountKey)}:coach_devices:item:${clean(id).toLowerCase().replace(/[^a-z0-9_-]/g, "_")}`;
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
    sport: clean(record.sport),
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

function normalizeAttendanceRecord(record) {
  if (!record || typeof record !== "object") return null;
  const date = clean(record.date || record.attendanceDate).slice(0, 10);
  const athleteName = clean(record.athleteName || record.name);
  const groupName = clean(record.groupName || record.group);
  const checkpointName = clean(record.checkpointName || record.checkpoint) || "Practice Start";
  if (!date || !athleteName || !groupName) return null;
  const status = normalizeAttendanceStatus(record.status);
  return {
    id: clean(record.id),
    date,
    groupId: clean(record.groupId),
    groupName,
    sport: clean(record.sport),
    season: clean(record.season),
    seasonYear: Number(record.seasonYear) || null,
    checkpointId: clean(record.checkpointId) || "practice",
    checkpointName,
    athleteId: clean(record.athleteId || record.contactId || record.smartcoachAthleteId),
    contactId: clean(record.contactId),
    smartcoachAthleteId: clean(record.smartcoachAthleteId),
    athleteName,
    status,
    note: clean(record.note || record.notes).slice(0, 800),
    source: clean(record.source) || "coach",
    coachId: clean(record.coachId).slice(0, 120),
    coachName: clean(record.coachName).slice(0, 120),
    updatedAt: clean(record.updatedAt) || new Date().toISOString(),
  };
}

function normalizeAttendanceStatus(status) {
  const value = clean(status).toLowerCase();
  if (["present", "late", "excused", "absent", "checked_out"].includes(value)) return value;
  if (value === "checked out" || value === "checkout") return "checked_out";
  return "";
}

function attendanceRecordId(record) {
  const item = normalizeAttendanceRecord(record);
  if (!item) return "";
  return [
    item.date,
    item.sport,
    item.season,
    item.seasonYear,
    item.groupId || item.groupName,
    item.checkpointId || item.checkpointName,
    item.athleteId || item.contactId || item.smartcoachAthleteId || item.athleteName,
  ].map((part) => clean(part).toLowerCase().replace(/[^a-z0-9_-]+/g, "_")).filter(Boolean).join("|");
}

function normalizeKeepTrakNote(note, index = 0) {
  const source = note || {};
  const today = new Date().toISOString().slice(0, 10);
  const date = clean(source.date || source.noteDate || today).slice(0, 10) || today;
  const body = clean(source.body || source.note || source.text).slice(0, 4000);
  const title = clean(source.title).slice(0, 140);
  if (!body && !title) return null;
  const createdAt = clean(source.createdAt) || new Date().toISOString();
  const completed = source.completed === true || clean(source.completed).toLowerCase() === "true";
  return {
    id: clean(source.id) || `keep_${date}_${createdAt.replace(/[^0-9a-z]/gi, "").slice(0, 14)}_${index}`,
    date,
    title,
    body,
    coachId: clean(source.coachId).slice(0, 120),
    coachName: clean(source.coachName).slice(0, 120),
    completed,
    completedAt: completed ? clean(source.completedAt) : "",
    completedBy: completed ? clean(source.completedBy).slice(0, 120) : "",
    archived: source.archived === true || clean(source.archived).toLowerCase() === "true",
    createdAt,
    updatedAt: clean(source.updatedAt) || createdAt,
  };
}

function normalizeBugTrakReport(report) {
  const source = report || {};
  const type = clean(source.type).toLowerCase() === "idea" ? "idea" : "bug";
  const summary = clean(source.summary || source.title).slice(0, 180);
  const details = clean(source.details || source.description || source.body).slice(0, 4000);
  if (!summary && !details) return null;
  const now = new Date().toISOString();
  return {
    id: clean(source.id) || `${type}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    status: clean(source.status) || "New",
    urgency: type === "idea" ? "Low" : bugTrakUrgency(source.urgency),
    area: clean(source.area).slice(0, 80),
    summary: summary || details.slice(0, 120),
    details,
    expected: clean(source.expected).slice(0, 2000),
    page: clean(source.page).slice(0, 240),
    pageTitle: clean(source.pageTitle).slice(0, 120),
    accountKey: clean(source.accountKey).slice(0, 120),
    coachName: clean(source.coachName).slice(0, 120),
    coachEmail: clean(source.coachEmail).slice(0, 180),
    deviceLabel: clean(source.deviceLabel).slice(0, 120),
    userAgent: clean(source.userAgent).slice(0, 300),
    createdAt: clean(source.createdAt) || now,
    updatedAt: clean(source.updatedAt) || now,
  };
}

function bugTrakUrgency(value) {
  const text = clean(value).toLowerCase();
  if (text === "blocking") return "Blocking";
  if (text === "high") return "High";
  if (text === "medium") return "Medium";
  return "Low";
}

function normalizeCoachDeviceSession(device) {
  const source = device || {};
  const label = clean(source.deviceLabel).slice(0, 120);
  const explicitSource = clean(source.deviceSource || source.source).toLowerCase().slice(0, 40);
  return {
    deviceId: clean(source.deviceId).toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 80),
    deviceLabel: label,
    deviceSource: explicitSource || inferCoachDeviceSource(label, clean(source.userAgent)),
    coachId: clean(source.coachId).slice(0, 120),
    coachName: clean(source.coachName).slice(0, 120),
    userAgent: clean(source.userAgent).slice(0, 240),
    coachIndex: Number.isFinite(Number(source.coachIndex)) ? Number(source.coachIndex) : 0,
    firstSeenAt: clean(source.firstSeenAt),
    lastSeenAt: clean(source.lastSeenAt),
    expiresAtIso: clean(source.expiresAtIso),
    seenCount: Number(source.seenCount) || 0,
  };
}

function normalizePartnerTimingSession(session) {
  const source = session || {};
  const id = clean(source.id || source.sessionId);
  if (!id) return null;
  const stations = (Array.isArray(source.stations) ? source.stations : [])
    .map((station, index) => ({
      id: clean(station && station.id) || `station_${index + 1}`,
      label: clean(station && (station.label || station.name)) || `Station ${index + 1}`,
      distance: clean(station && station.distance),
    }))
    .filter((station) => station.id && station.label)
    .slice(0, 12);
  const records = (Array.isArray(source.records) ? source.records : [])
    .map(normalizePartnerTimingRecord)
    .filter(Boolean)
    .slice(-5000);
  return {
    id,
    meetName: clean(source.meetName),
    meetDate: clean(source.meetDate).slice(0, 10),
    eventName: clean(source.eventName || source.event),
    groupId: clean(source.groupId),
    season: clean(source.season),
    seasonYear: Number(source.seasonYear) || null,
    startAt: clean(source.startAt),
    startCoach: clean(source.startCoach),
    stations,
    records,
    createdAt: clean(source.createdAt) || new Date().toISOString(),
    updatedAt: clean(source.updatedAt) || new Date().toISOString(),
  };
}

function normalizePartnerTimingRecord(record) {
  const source = record || {};
  const stationId = clean(source.stationId);
  const tapAt = clean(source.tapAt || source.createdAt);
  const athleteName = clean(source.athleteName || source.name);
  if (!stationId || !tapAt || !athleteName) return null;
  return {
    id: clean(source.id) || ["pt", stationId, source.runnerId || athleteName, tapAt].map(clean).join("_").replace(/[^a-zA-Z0-9_:-]+/g, "_"),
    stationId,
    stationLabel: clean(source.stationLabel),
    runnerId: clean(source.runnerId),
    athleteName,
    contactId: clean(source.contactId),
    smartcoachAthleteId: clean(source.smartcoachAthleteId),
    tapAt,
    deviceId: clean(source.deviceId),
    coachName: clean(source.coachName),
  };
}

function inferCoachDeviceSource(label, userAgent) {
  const text = `${label || ""} ${userAgent || ""}`.toLowerCase();
  if (/\b(windows|mac|macintosh|linux|desktop)\b/.test(text) && !/\b(iphone|ipad|android|mobile)\b/.test(text)) return "desktop";
  return "app";
}

function coachDeviceUsageSummary(devices) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const list = (Array.isArray(devices) ? devices : [])
    .filter((item) => item && item.deviceId && clean(item.deviceSource || "app").toLowerCase() === "app")
    .sort((a, b) => clean(b.lastSeenAt).localeCompare(clean(a.lastSeenAt)));
  const withinDays = (item, days) => {
    const time = Date.parse(item && item.lastSeenAt || "");
    return Number.isFinite(time) && now - time <= days * day;
  };
  const activeList = list.filter((item) => withinDays(item, 30));
  const weeklyList = list.filter((item) => withinDays(item, 7));
  const unassignedActive = activeList.filter((item) => !clean(item.coachName));
  return {
    configured: registryConfigured(),
    totalDevices: list.length,
    activeDevices: activeList.length,
    devicesSeenThisWeek: weeklyList.length,
    unassignedDevices: unassignedActive.length,
    unassignedDevicesSeenThisWeek: weeklyList.filter((item) => !clean(item.coachName)).length,
    lastSeenAt: list[0] && list[0].lastSeenAt || "",
    unassignedLastSeenAt: unassignedActive[0] && unassignedActive[0].lastSeenAt || "",
    devices: list.slice(0, 20).map((item) => ({
      deviceId: item.deviceId,
      deviceLabel: item.deviceLabel || "Unknown device",
      deviceSource: item.deviceSource || "app",
      coachId: item.coachId,
      coachName: item.coachName,
      lastSeenAt: item.lastSeenAt,
      firstSeenAt: item.firstSeenAt,
      seenCount: item.seenCount,
    })),
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
  saveAttendanceRecords,
  loadAttendanceRecords,
  saveKeepTrakNotes,
  loadKeepTrakNotes,
  saveBugTrakReport,
  loadBugTrakReports,
  savePartnerTimingSession,
  loadPartnerTimingSessions,
  recordCoachDeviceSession,
  loadCoachDeviceUsage,
  mirrorSchoolRecords,
  loadSchoolRecordsMirror,
  loadSchoolRecordsDeletedIds,
  schoolRecordsMirrorStatus,
};
