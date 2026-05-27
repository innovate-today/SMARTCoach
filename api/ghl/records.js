const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const RECORD_SCHEMA_KEY = "custom_objects.records";
const { getGhlContext, requireProPlan } = require("../../lib/ghl-account");
const { attachRegistryAccount, setSmartTrakSecurityHeaders } = require("../../lib/smart-trak-request");
const { mirrorSchoolRecords, loadSchoolRecordsMirror, schoolRecordsMirrorStatus } = require("../../lib/account-registry");

const FIELD_IDS = {
  record: ["ftIsXzZszu3s0cfJ55MU"],
  record_type: ["kFI5EuUMaWNNr1MWCRCC"],
  record_scope: ["csicg5cTEMH2il824CdN"],
  gender: [],
  sport: ["NFlleoMtJlvlB1KAOqpR"],
  event: ["tCE1zz6sODLctaBJaBZD"],
  result_display: ["oECaYRLL3M0uczHeLVYC"],
  result_ms: ["WgDubsuUq1Ws9MqXAP4f"],
  result_mark: ["5DLRSYC15cAiFPWnUEt2"],
  athlete_contact: ["lgSfedW35TT44Nxgl7tY"],
  athlete_name_snapshot: ["OjTWebwJU389MGpccJ2b"],
  meet_name: ["8sjv8sNmaTJiCQIIJ952"],
  meet_record_id: ["KXbl4VsRWz9KvTBsUdvI"],
  meet_result_id: ["2oFmwcjJZLPtIqJ5Nf9z"],
  record_date: ["lXHnJHTLrt0njYh0wIRX"],
  season: ["iMNFBo9WoJhJvHI1sdP0"],
  season_year: ["VasiHyN6NJt5Q28z15Oq"],
  is_current: ["Lxh59hEN9aOEBgOQCo7A"],
  previous_record_display: ["dxbcu3xfwRmcw5pFm5o9"],
  previous_record_holder: ["vgp96xCWvxPovRoC3HTf"],
  record_notes: ["nn0km6vLhgz6K7V7lUe"],
  source_system: ["P7whQtB5LxBtJ8qZHBRC"],
  source_record_id: ["r3wIXtI98pc4XX8ciJ3f"],
};

module.exports = async function handler(req, res) {
  setSmartTrakSecurityHeaders(res);
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  await attachRegistryAccount(req);

  if (!requireProPlan(req, res)) return;

  if (req.method !== "GET" && req.method !== "POST" && req.method !== "PATCH" && req.method !== "DELETE") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { accountKey, token, locationId } = getGhlContext(req);

  if (!token || !locationId) {
    res.status(500).json({ error: "SMART Trak records are not configured on the server." });
    return;
  }

  try {
    if (req.method === "POST") {
      const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const rows = Array.isArray(payload && payload.records) ? payload.records : [];
      if (!rows.length) throw httpError(400, "Add at least one record before saving.");
      const created = [];
      const mirrorResults = [];
      for (const row of rows) {
        const properties = buildRecordProperties(row);
        const retired = await retireCurrentRecords({ token, locationId, properties });
        if (retired[0]) {
          if (!properties.previous_record_display) properties.previous_record_display = retired[0].resultDisplay || retired[0].resultMark;
          if (!properties.previous_record_holder) properties.previous_record_holder = retired[0].athleteName;
        }
        const result = await ghlFetch({
          token,
          path: `/objects/${encodeURIComponent(RECORD_SCHEMA_KEY)}/records`,
          method: "POST",
          body: { locationId, properties },
        });
        const createdRecord = normalizeRecord({
          id: objectRecordId(result),
          properties,
        }, properties);
        created.push({
          recordId: objectRecordId(result),
          sourceRecordId: properties.source_record_id,
          recordName: properties.record,
        });
        mirrorResults.push(await mirrorRecordsBestEffort(accountKey, [createdRecord]));
      }
      res.status(200).json({
        success: true,
        createdCount: created.length,
        created,
        mirror: summarizeMirrorResults(mirrorResults),
      });
      return;
    }

    if (req.method === "PATCH") {
      const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const record = await updateRecord({ token, locationId, payload });
      const mirror = await mirrorRecordsBestEffort(accountKey, [record]);
      res.status(200).json({ success: true, record, mirror });
      return;
    }

    if (req.method === "DELETE") {
      const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      await deleteRecord({ token, payload });
      const mirror = await mirrorRecordsBestEffort(accountKey, [], { deleteIds: [clean(payload && payload.recordId), clean(payload && payload.sourceRecordId)] });
      res.status(200).json({ success: true, mirror });
      return;
    }

    const ghlRecords = await listRecords({ token, locationId });
    const mirroredRecords = await loadRecordsMirrorBestEffort(accountKey);
    const records = mergeNormalizedRecords(ghlRecords, mirroredRecords);
    res.status(200).json({
      success: true,
      generatedAt: new Date().toISOString(),
      records,
      debug: {
        ghlCount: ghlRecords.length,
        mirrorCount: mirroredRecords.length,
        mergedCount: records.length,
        mirrorStatus: await mirrorStatusBestEffort(accountKey),
      },
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Records lookup failed." });
  }
};

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-SMARTCoach-Account, X-SMARTCoach-Access-Code, X-SMARTCoach-Session");
}

async function mirrorRecordsBestEffort(accountKey, records, options) {
  try {
    return await mirrorSchoolRecords(accountKey, records, options);
  } catch (error) {
    return { saved: false, error: error.message || "Records mirror failed." };
  }
}

async function loadRecordsMirrorBestEffort(accountKey) {
  try {
    return await loadSchoolRecordsMirror(accountKey);
  } catch (error) {
    return [];
  }
}

async function mirrorStatusBestEffort(accountKey) {
  try {
    return await schoolRecordsMirrorStatus(accountKey);
  } catch (error) {
    return { configured: false, error: error.message || "Records mirror status failed." };
  }
}

function summarizeMirrorResults(results) {
  const list = Array.isArray(results) ? results : [];
  return {
    saved: list.some((item) => item && item.saved),
    count: list.reduce((sum, item) => sum + (Number(item && item.count) || 0), 0),
    errors: list.map((item) => item && item.error).filter(Boolean),
  };
}

function mergeNormalizedRecords(primary, secondary) {
  const byKey = new Map();
  (primary || []).concat(secondary || []).forEach((record) => {
    const key = normalizedRecordKey(record);
    if (!key) return;
    byKey.set(key, byKey.has(key) ? mergeRecordDetails(byKey.get(key), record) : record);
  });
  return Array.from(byKey.values()).sort(sortRecords);
}

function mergeRecordDetails(existing, incoming) {
  const merged = { ...(existing || {}) };
  Object.keys(incoming || {}).forEach((key) => {
    if (recordDetailIsMissing(merged[key], key) && !recordDetailIsMissing(incoming[key], key)) {
      merged[key] = incoming[key];
    }
  });
  if (!merged.isCurrent && incoming && incoming.isCurrent && recordDetailIsMissing(existing && existing.event, "event") && recordDetailIsMissing(existing && existing.resultDisplay, "resultDisplay")) {
    merged.isCurrent = true;
  }
  return merged;
}

function recordDetailIsMissing(value, key) {
  if (value === null || typeof value === "undefined") return true;
  if (typeof value === "number") return !Number.isFinite(value) || value === 0;
  const text = clean(value);
  if (!text) return true;
  if (key === "gender" && text.toLowerCase() === "unlisted") return true;
  if (key === "event" && text.toLowerCase() === "unlisted event") return true;
  if ((key === "resultDisplay" || key === "resultMark") && text.toLowerCase() === "no result") return true;
  return false;
}

function normalizedRecordKey(record) {
  if (record && record.recordId) return `id:${clean(record.recordId)}`;
  if (record && record.sourceRecordId) return `source:${clean(record.sourceRecordId)}`;
  return [
    "record",
    clean(record && record.recordName),
    clean(record && record.recordScope),
    clean(record && record.gender),
    clean(record && record.sport),
    clean(record && record.event),
    clean(record && (record.resultDisplay || record.resultMark)),
    clean(record && record.athleteName),
    clean(record && record.recordDate),
  ].map(optionValue).join("|");
}

async function updateRecord({ token, locationId, payload }) {
  const recordId = clean(payload && payload.recordId);
  if (!recordId) throw httpError(400, "Record ID is required.");
  const properties = buildRecordProperties(payload || {});
  const retired = await retireCurrentRecords({ token, locationId, properties, excludeRecordId: recordId });
  if (retired[0]) {
    if (!properties.previous_record_display) properties.previous_record_display = retired[0].resultDisplay || retired[0].resultMark;
    if (!properties.previous_record_holder) properties.previous_record_holder = retired[0].athleteName;
  }
  const record = await ghlFetch({
    token,
    path: `/objects/${encodeURIComponent(RECORD_SCHEMA_KEY)}/records/${encodeURIComponent(recordId)}?locationId=${encodeURIComponent(locationId)}`,
    method: "PUT",
    body: { properties },
  });
  return normalizeRecord(record.record || record, properties);
}

async function retireCurrentRecords({ token, locationId, properties, excludeRecordId }) {
  if (!yes(properties && properties.is_current)) return [];
  const boardKey = recordBoardKeyFromProperties(properties);
  if (!boardKey) return [];
  const existing = await listRecords({ token, locationId });
  const boardRecords = existing.filter((record) => {
    if (!record) return false;
    if (excludeRecordId && record.recordId === excludeRecordId) return false;
    return recordBoardKey(record) === boardKey;
  });
  const currentRecords = boardRecords.filter((record) => record.isCurrent);
  const betterExisting = currentRecords.find((record) => !newRecordIsBetter(properties, record));
  if (betterExisting) {
    properties.is_current = "No";
    properties.record_notes = [clean(properties.record_notes), `Saved as historical on ${new Date().toISOString().slice(0, 10)} because the current record is faster: ${clean(betterExisting.resultDisplay || betterExisting.resultMark)} by ${clean(betterExisting.athleteName)}.`].filter(Boolean).join("\n");
    if (!properties.previous_record_display) properties.previous_record_display = betterExisting.resultDisplay || betterExisting.resultMark;
    if (!properties.previous_record_holder) properties.previous_record_holder = betterExisting.athleteName;
    return [];
  }
  const matches = currentRecords;
  for (const record of matches) {
    if (!record.recordId) continue;
    const retiredProperties = recordPropertiesFromRecord(record);
    retiredProperties.is_current = "No";
    retiredProperties.record_notes = appendRetiredNote(record.recordNotes, properties);
    await ghlFetch({
      token,
      path: `/objects/${encodeURIComponent(RECORD_SCHEMA_KEY)}/records/${encodeURIComponent(record.recordId)}?locationId=${encodeURIComponent(locationId)}`,
      method: "PUT",
      body: { properties: retiredProperties },
    });
  }
  return matches;
}

function recordPropertiesFromRecord(record) {
  return compactProperties({
    record: record.recordName || [
      record.athleteName,
      record.recordType || "School Record",
      record.event,
      record.resultDisplay || record.resultMark,
    ].filter(Boolean).join(" - "),
    record_type: optionValue(record.recordType || "School Record"),
    record_scope: optionValue(record.recordScope || "School"),
    gender: optionValue(record.gender || "Unlisted"),
    sport: optionValue(record.sport || "Track"),
    event: record.event,
    result_display: record.resultDisplay,
    result_ms: recordTimeMs(record),
    result_mark: record.resultMark,
    athlete_contact: record.athleteContact,
    athlete_name_snapshot: record.athleteName,
    meet_name: record.meetName,
    meet_record_id: record.meetRecordId,
    meet_result_id: record.meetResultId,
    record_date: record.recordDate,
    season: optionValue(record.season),
    season_year: record.seasonYear,
    is_current: record.isCurrent ? "Yes" : "No",
    previous_record_display: record.previousRecordDisplay,
    previous_record_holder: record.previousRecordHolder,
    record_notes: record.recordNotes,
    source_system: record.sourceSystem,
    source_record_id: record.sourceRecordId,
  });
}

async function deleteRecord({ token, payload }) {
  const recordId = clean(payload && payload.recordId);
  if (!recordId) throw httpError(400, "Record ID is required.");
  await ghlFetch({
    token,
    path: `/objects/${encodeURIComponent(RECORD_SCHEMA_KEY)}/records/${encodeURIComponent(recordId)}`,
    method: "DELETE",
  });
}

function buildRecordProperties(row) {
  const normalized = normalizeRecordPayload(row);
  const recordName = normalized.recordName || [
    normalized.athleteName,
    normalized.recordType,
    normalized.event,
    normalized.resultDisplay || normalized.resultMark,
  ].filter(Boolean).join(" - ");

  if (!normalized.recordType) throw httpError(400, "Record type is required.");
  if (!normalized.recordScope) throw httpError(400, "Record scope is required.");
  if (!normalized.event) throw httpError(400, "Event is required.");
  if (!normalized.resultDisplay && !normalized.resultMark) throw httpError(400, "Result is required.");
  if (!normalized.recordDate) throw httpError(400, "Date is required.");

  return compactProperties({
    record: recordName,
    record_type: optionValue(normalized.recordType),
    record_scope: optionValue(normalized.recordScope),
    gender: optionValue(normalized.gender),
    sport: optionValue(normalized.sport),
    event: normalized.event,
    result_display: normalized.resultDisplay,
    result_ms: normalized.resultMs,
    result_mark: normalized.resultMark,
    athlete_name_snapshot: normalized.athleteName,
    meet_name: normalized.meetName,
    record_date: normalized.recordDate,
    season: optionValue(normalized.season),
    season_year: normalized.seasonYear,
    is_current: normalized.isCurrent ? "Yes" : "No",
    previous_record_display: normalized.previousRecordDisplay,
    previous_record_holder: normalized.previousRecordHolder,
    record_notes: composeRecordNotes(normalized.recordNotes, normalized),
    source_system: "SMART Trak Manual Record Entry",
    source_record_id: normalized.sourceRecordId || buildManualSourceRecordId(normalized),
  });
}

function normalizeRecordPayload(row) {
  const recordDate = dateOnly(row && (row.recordDate || row.date));
  const resultDisplay = clean(row && (row.resultDisplay || row.result));
  return {
    recordName: clean(row && row.recordName),
    recordType: clean(row && row.recordType) || "School Record",
    recordScope: clean(row && row.recordScope) || "School",
    gender: clean(row && row.gender) || "Unlisted",
    sport: clean(row && row.sport) || "Track",
    event: clean(row && row.event),
    resultDisplay,
    resultMs: Number(row && row.resultMs) || parseTimeToMs(resultDisplay) || null,
    resultMark: clean(row && row.resultMark),
    athleteName: clean(row && row.athleteName),
    meetName: clean(row && row.meetName),
    recordDate,
    season: clean(row && row.season),
    seasonYear: Number(row && row.seasonYear) || (recordDate ? Number(recordDate.slice(0, 4)) : null),
    isCurrent: row && typeof row.isCurrent !== "undefined" ? yes(row.isCurrent) : true,
    previousRecordDisplay: clean(row && row.previousRecordDisplay),
    previousRecordHolder: clean(row && row.previousRecordHolder),
    recordNotes: clean(row && row.recordNotes),
    sourceRecordId: clean(row && row.sourceRecordId),
  };
}

async function listRecords({ token, locationId }) {
  const records = [];
  const seen = {};
  for (let page = 1; page <= 10; page += 1) {
    const result = await optionalGhlFetch({
      token,
      path: `/objects/${encodeURIComponent(RECORD_SCHEMA_KEY)}/records/search`,
      method: "POST",
      body: { locationId, page, pageLimit: 100 },
    });
    if (!result) break;
    const batch = recordsFromResult(result);
    const added = addUniqueRawRecords(records, seen, batch);
    if (!batch.length || !added) break;
  }

  for (let page = 1; page <= 10; page += 1) {
    const direct = await optionalGhlFetch({
      token,
      path: `/objects/${encodeURIComponent(RECORD_SCHEMA_KEY)}/records?locationId=${encodeURIComponent(locationId)}&page=${page}&pageLimit=100`,
      method: "GET",
    });
    if (!direct) break;
    const batch = recordsFromResult(direct);
    const added = addUniqueRawRecords(records, seen, batch);
    if (!batch.length || !added) break;
  }

  return uniqueRecords(records).map(normalizeRecord).sort(sortRecords);
}

function normalizeRecord(record, fallbackProperties) {
  const props = fallbackProperties || recordProperties(record);
  const fallback = deriveRecordFromName(prop(props, "record") || recordName(record));
  return {
    recordId: objectRecordId(record),
    recordName: prop(props, "record") || recordName(record),
    recordType: labelValue(prop(props, "record_type")) || fallback.recordType || "School Record",
    recordScope: labelValue(prop(props, "record_scope")) || "School",
    gender: labelValue(prop(props, "gender")) || extractRecordGender(prop(props, "record_notes")) || "Unlisted",
    sport: labelValue(prop(props, "sport")) || "Track",
    event: prop(props, "event") || fallback.event,
    resultDisplay: prop(props, "result_display") || fallback.resultDisplay,
    resultMs: Number(prop(props, "result_ms")) || 0,
    resultMark: prop(props, "result_mark"),
    athleteContact: prop(props, "athlete_contact"),
    athleteName: prop(props, "athlete_name_snapshot") || fallback.athleteName,
    meetName: prop(props, "meet_name"),
    meetRecordId: prop(props, "meet_record_id"),
    meetResultId: prop(props, "meet_result_id"),
    recordDate: prop(props, "record_date"),
    season: labelValue(prop(props, "season")),
    seasonYear: Number(prop(props, "season_year")) || null,
    isCurrent: yes(prop(props, "is_current")),
    previousRecordDisplay: prop(props, "previous_record_display"),
    previousRecordHolder: prop(props, "previous_record_holder"),
    recordNotes: prop(props, "record_notes"),
    sourceSystem: prop(props, "source_system"),
    sourceRecordId: prop(props, "source_record_id"),
    syncedAt: recordTimestamp(record),
  };
}

function deriveRecordFromName(name) {
  const parts = clean(name).split(" - ").map(clean).filter(Boolean);
  if (parts.length < 4) return {};
  return {
    athleteName: parts[0],
    recordType: parts[1],
    event: parts[2],
    resultDisplay: parts.slice(3).join(" - "),
  };
}

async function ghlFetch({ token, path, method, body }) {
  const response = await fetch(`${GHL_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: GHL_VERSION,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const data = text ? safeJson(text) : {};
  if (!response.ok) throw httpError(response.status, data.message || data.error || `GHL request failed with ${response.status}.`);
  return data;
}

async function optionalGhlFetch(args) {
  try {
    return await ghlFetch(args);
  } catch (error) {
    return null;
  }
}

function recordsFromResult(result) {
  const direct = [
    result && result.record,
    result && result.data && result.data.record,
  ].filter(Boolean);
  return direct.concat(
    arrayValue(result && result.records),
    arrayValue(result && result.items),
    arrayValue(result && result.data),
    arrayValue(result && result.data && result.data.records),
    arrayValue(result && result.data && result.data.items),
    arrayValue(result && result.data && result.data.data),
    arrayValue(result && result.data && result.data.results),
    arrayValue(result && result.results)
  );
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function addUniqueRawRecords(target, seen, batch) {
  let added = 0;
  for (const record of batch || []) {
    const props = recordProperties(record);
    const key = recordUniqueKey(record, props);
    if (!key || seen[key]) continue;
    seen[key] = true;
    target.push(record);
    added += 1;
  }
  return added;
}

function uniqueRecords(records) {
  const seen = {};
  return records.filter((record) => {
    const props = recordProperties(record);
    const key = recordUniqueKey(record, props);
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function recordUniqueKey(record, props) {
  const id = objectRecordId(record);
  if (id) return `id:${id}`;
  const sourceId = prop(props, "source_record_id");
  if (sourceId) return `source:${sourceId}`;
  return [
    "record",
    prop(props, "record") || recordName(record),
    labelValue(prop(props, "record_scope")) || "School",
    labelValue(prop(props, "gender")) || extractRecordGender(prop(props, "record_notes")) || "Unlisted",
    labelValue(prop(props, "sport")) || "Track",
    prop(props, "event"),
    prop(props, "result_display") || prop(props, "result_mark"),
    prop(props, "athlete_name_snapshot"),
    prop(props, "record_date"),
  ].map((part) => optionValue(part)).join("|");
}

function recordProperties(record) {
  return (record && (
    record.properties ||
    record.fields ||
    record.customFields ||
    record.customField ||
    record.customFieldsData ||
    record.fieldValues ||
    record.values
  )) || {};
}

function objectRecordId(record) {
  const candidates = [
    record && record.id,
    record && record._id,
    record && record.recordId,
    record && record.objectRecordId,
    record && record.record && (record.record.id || record.record._id || record.record.recordId),
    record && record.data && (record.data.id || record.data._id || record.data.recordId),
    record && record.data && record.data.record && (record.data.record.id || record.data.record._id || record.data.record.recordId),
  ];
  return candidates.map(clean).find(Boolean) || "";
}

function prop(props, key) {
  const keys = [key, `custom_objects.records.${key}`].concat(FIELD_IDS[key] || []);
  for (const item of keys) {
    const value = readPropValue(props, item);
    if (value) return value;
  }
  return "";
}

function readPropValue(props, key) {
  if (!props) return "";
  if (Array.isArray(props)) {
    const field = props.find((item) => item && (
      item.key === key ||
      item.id === key ||
      item.fieldKey === key ||
      item.fieldId === key ||
      item.customFieldId === key ||
      optionValue(item.name || item.label || item.fieldName) === optionValue(key)
    ));
    return field ? fieldValue(field.value || field.fieldValue || field.field_value) : "";
  }
  return fieldValue(props[key]);
}

function fieldValue(value) {
  if (Array.isArray(value)) return value.map(fieldValue).filter(Boolean).join(", ");
  if (value && typeof value === "object") {
    return clean(value.value || value.fieldValue || value.field_value || value.label || value.name || value.text || value.displayValue || value.display_value);
  }
  return clean(value);
}

function recordName(record) {
  return clean(record && (record.name || record.title || record.displayName || record.display_name));
}

function recordTimestamp(record) {
  return clean(record && (record.createdAt || record.dateAdded || record.dateCreated || record.updatedAt || record.dateUpdated));
}

function labelValue(value) {
  const text = clean(value);
  if (!text) return "";
  return text.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function yes(value) {
  return /^(yes|true|1|on|current)$/i.test(clean(value));
}

function optionValue(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function dateOnly(value) {
  const text = clean(value);
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function parseTimeToMs(value) {
  const text = clean(value).toLowerCase().replace(/s$/, "");
  const parts = text.split(":").map((part) => part.trim());
  if (!parts.length || parts.some((part) => part === "" || Number.isNaN(Number(part)))) return null;
  if (parts.length === 1) return Math.round(Number(parts[0]) * 1000);
  if (parts.length === 2) return Math.round((Number(parts[0]) * 60 + Number(parts[1])) * 1000);
  if (parts.length === 3) return Math.round((Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2])) * 1000);
  return null;
}

function recordTimeMsFromProperties(properties) {
  return Number(properties && properties.result_ms) || parseTimeToMs(properties && properties.result_display) || 0;
}

function recordTimeMs(record) {
  return Number(record && record.resultMs) || parseTimeToMs(record && record.resultDisplay) || 0;
}

function newRecordIsBetter(properties, existingRecord) {
  const newMs = recordTimeMsFromProperties(properties);
  const existingMs = recordTimeMs(existingRecord);
  if (newMs && existingMs) return newMs < existingMs;
  if (newMs && !existingMs) return true;
  if (!newMs && existingMs) return false;
  return true;
}

function compactProperties(properties) {
  return Object.keys(properties).reduce((cleaned, key) => {
    const value = properties[key];
    if (value === "" || value === null || typeof value === "undefined") return cleaned;
    cleaned[key] = value;
    return cleaned;
  }, {});
}

function recordBoardKey(record) {
  const scope = optionValue(record && record.recordScope);
  const gender = scope === "athlete" ? "" : optionValue(record && record.gender);
  return [
    optionValue(record && record.recordType),
    scope,
    optionValue(record && record.sport),
    optionValue(record && record.event),
    scope === "athlete" ? optionValue(record && record.athleteName) : "",
    gender,
  ].join("|");
}

function recordBoardKeyFromProperties(properties) {
  const scope = optionValue(properties && properties.record_scope);
  const gender = scope === "athlete" ? "" : optionValue(properties && properties.gender);
  return [
    optionValue(properties && properties.record_type),
    scope,
    optionValue(properties && properties.sport),
    optionValue(properties && properties.event),
    scope === "athlete" ? optionValue(properties && properties.athlete_name_snapshot) : "",
    gender,
  ].join("|");
}

function appendRetiredNote(note, newProperties) {
  const line = `Moved to historical on ${new Date().toISOString().slice(0, 10)} because a new current record was saved: ${clean(newProperties.result_display || newProperties.result_mark)}.`;
  return [clean(note), line].filter(Boolean).join("\n");
}

function composeRecordNotes(note, row) {
  const gender = clean(row && row.gender);
  const scope = optionValue(row && row.recordScope);
  const lines = clean(note).split("\n").filter((line) => !/^Gender:/i.test(clean(line)));
  if (gender && scope !== "athlete") lines.unshift(`Gender: ${gender}`);
  return lines.join("\n").trim();
}

function extractRecordGender(note) {
  const match = clean(note).match(/^Gender:\s*(Boy|Boys|Girl|Girls|Coed|Unlisted)\s*$/im);
  if (!match) return "";
  return normalizeGenderLabel(match[1]);
}

function normalizeGenderLabel(value) {
  const text = clean(value).toLowerCase();
  if (text === "boy" || text === "boys" || text === "male" || text === "men") return "Boy";
  if (text === "girl" || text === "girls" || text === "female" || text === "women") return "Girl";
  if (text === "coed") return "Coed";
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

function slugValue(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function buildManualSourceRecordId(row) {
  return [
    "manual_record",
    slugValue(row.recordScope),
    slugValue(row.recordType),
    slugValue(row.gender),
    slugValue(row.event),
    slugValue(row.athleteName || row.meetName || "team"),
    slugValue(row.recordDate),
    Date.now().toString(36),
  ].filter(Boolean).join("_");
}

function sortRecords(a, b) {
  return String(a.recordScope || "").localeCompare(String(b.recordScope || "")) ||
    String(a.event || "").localeCompare(String(b.event || "")) ||
    String(b.recordDate || "").localeCompare(String(a.recordDate || ""));
}

function clean(value) {
  if (value && typeof value === "object") return clean(value.value || value.name || value.label || value.id);
  return String(value || "").trim();
}

function safeJson(text) {
  try { return JSON.parse(text); } catch (error) { return { message: text }; }
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
