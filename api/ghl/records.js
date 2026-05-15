const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const RECORD_SCHEMA_KEY = "custom_objects.records";
const { getGhlContext, requireProPlan } = require("../../lib/ghl-account");

const FIELD_IDS = {
  record: ["ftIsXzZszu3s0cfJ55MU"],
  record_type: ["kFI5EuUMaWNNr1MWCRCC"],
  record_scope: ["csicg5cTEMH2il824CdN"],
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
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (!requireProPlan(req, res)) return;

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { token, locationId } = getGhlContext(req);

  if (!token || !locationId) {
    res.status(500).json({ error: "SMART Trak records are not configured on the server." });
    return;
  }

  try {
    const records = await listRecords({ token, locationId });
    res.status(200).json({
      success: true,
      generatedAt: new Date().toISOString(),
      records,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Records lookup failed." });
  }
};

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-SMARTCoach-Account, X-SMARTCoach-Access-Code");
}

async function listRecords({ token, locationId }) {
  const records = [];
  for (let page = 1; page <= 10; page += 1) {
    const result = await ghlFetch({
      token,
      path: `/objects/${encodeURIComponent(RECORD_SCHEMA_KEY)}/records/search`,
      method: "POST",
      body: { locationId, page, pageLimit: 100 },
    });
    const batch = recordsFromResult(result);
    records.push(...batch);
    if (batch.length < 100) break;
  }
  return uniqueRecords(records).map(normalizeRecord).sort(sortRecords);
}

function normalizeRecord(record) {
  const props = recordProperties(record);
  return {
    recordId: record && record.id ? record.id : "",
    recordName: prop(props, "record") || recordName(record),
    recordType: labelValue(prop(props, "record_type")),
    recordScope: labelValue(prop(props, "record_scope")),
    sport: labelValue(prop(props, "sport")),
    event: prop(props, "event"),
    resultDisplay: prop(props, "result_display"),
    resultMs: Number(prop(props, "result_ms")) || 0,
    resultMark: prop(props, "result_mark"),
    athleteContact: prop(props, "athlete_contact"),
    athleteName: prop(props, "athlete_name_snapshot"),
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

function recordsFromResult(result) {
  return [
    ...(Array.isArray(result && result.records) ? result.records : []),
    ...(Array.isArray(result && result.items) ? result.items : []),
    ...(Array.isArray(result && result.data) ? result.data : []),
    ...(Array.isArray(result && result.data && result.data.records) ? result.data.records : []),
    ...(Array.isArray(result && result.data && result.data.items) ? result.data.items : []),
  ];
}

function uniqueRecords(records) {
  const seen = {};
  return records.filter((record) => {
    const props = recordProperties(record);
    const key = (record && record.id) || prop(props, "source_record_id") || JSON.stringify(props);
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function recordProperties(record) {
  return (record && (record.properties || record.fields || record.customFields)) || {};
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
    const field = props.find((item) => item && (item.key === key || item.id === key || item.fieldKey === key || item.fieldId === key || item.customFieldId === key));
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
