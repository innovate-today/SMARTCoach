const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const PERFORMANCE_RECORD_SCHEMA_KEY = "custom_objects.performance_records";
const FIELD_IDS = {
  performance_record: ["RCn9Xux9gRK3otwS1QzX"],
  source_record_id: ["9YD4n4y4aqf3VnkrwLL1"],
  group_name: ["ochf7LkGhgAh5ySys5dA"],
  session_date: ["pl69ao2Pu76zeUKMEWpm"],
  workout_type: ["jX0YLlpt08vxNKV3JyM5"],
  total_time_display: ["z9eZIcIL1B7yaeR5jXHI"],
  coach_note: ["Afy8b8lAbUoti9cCqa1m"],
};

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const token = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;

  if (!token || !locationId) {
    res.status(500).json({ error: "SMARTCoach Pro corrections are not configured on the server." });
    return;
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const action = clean(payload.action).toLowerCase();
    if (action !== "void") throw httpError(400, "Unsupported correction action.");

    const contactId = clean(payload.contactId);
    const recordId = clean(payload.recordId);
    const sourceRecordId = clean(payload.sourceRecordId);
    const athleteName = clean(payload.athleteName) || "Athlete";
    const reason = clean(payload.reason) || "No reason provided.";

    if (!contactId) throw httpError(400, "Missing athlete contact.");
    if (!recordId && !sourceRecordId) throw httpError(400, "Missing performance record.");

    const record = recordId
      ? await getObjectRecord({ token, schemaKey: PERFORMANCE_RECORD_SCHEMA_KEY, recordId })
      : await findObjectRecord({ token, locationId, schemaKey: PERFORMANCE_RECORD_SCHEMA_KEY, sourceRecordId });

    if (!record || !record.id) throw httpError(404, "Performance record was not found.");

    const props = recordProperties(record);
    const previousNote = prop(props, "coach_note");
    const correctionTime = new Date().toISOString();
    const correctionBlock = [
      "",
      "SMARTCoach Status: Voided",
      `Correction Date: ${correctionTime}`,
      `Correction Reason: ${reason}`,
    ].join("\n");
    const nextNote = previousNote.indexOf("SMARTCoach Status: Voided") >= 0
      ? previousNote
      : `${previousNote}${correctionBlock}`;

    await ghlFetch({
      token,
      path: `/objects/${encodeURIComponent(PERFORMANCE_RECORD_SCHEMA_KEY)}/records/${encodeURIComponent(record.id)}`,
      method: "PUT",
      body: {
        locationId,
        properties: {
          coach_note: nextNote,
        },
      },
    });

    await addCorrectionNote({
      token,
      contactId,
      body: buildVoidNote({
        athleteName,
        reason,
        correctionTime,
        record,
        props,
        sourceRecordId: sourceRecordId || prop(props, "source_record_id"),
      }),
    });

    res.status(200).json({ success: true, action: "voided", recordId: record.id });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Correction failed." });
  }
};

async function addCorrectionNote({ token, contactId, body }) {
  await ghlFetch({
    token,
    path: `/contacts/${encodeURIComponent(contactId)}/notes`,
    method: "POST",
    body: { body },
  });
}

function buildVoidNote({ athleteName, reason, correctionTime, record, props, sourceRecordId }) {
  return [
    `SMARTCoach Pro Correction - ${dateLabel(correctionTime)}`,
    "",
    `Athlete: ${athleteName}`,
    `Record: ${prop(props, "performance_record") || prop(props, "group_name") || record.id}`,
    "Action: Voided",
    "",
    `Workout: ${prop(props, "group_name") || ""} ${prop(props, "workout_type") || ""}`.trim(),
    `Date: ${prop(props, "session_date") || ""}`,
    `Result: ${prop(props, "total_time_display") || ""}`,
    sourceRecordId ? `Source Record ID: ${sourceRecordId}` : "",
    "",
    "Reason:",
    reason,
  ].filter((line) => line !== "").join("\n");
}

async function getObjectRecord({ token, schemaKey, recordId }) {
  const result = await ghlFetch({
    token,
    path: `/objects/${encodeURIComponent(schemaKey)}/records/${encodeURIComponent(recordId)}`,
    method: "GET",
  });
  return result.record || result;
}

async function findObjectRecord({ token, locationId, schemaKey, sourceRecordId }) {
  const result = await ghlFetch({
    token,
    path: `/objects/${encodeURIComponent(schemaKey)}/records/search`,
    method: "POST",
    body: {
      locationId,
      page: 1,
      pageLimit: 1,
      filters: [
        {
          field: "source_record_id",
          operator: "eq",
          value: sourceRecordId,
        },
      ],
    },
  });
  return firstRecord(result);
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

function firstRecord(result) {
  return [
    result && result.record,
    result && Array.isArray(result.records) && result.records[0],
    result && Array.isArray(result.items) && result.items[0],
    result && result.data && Array.isArray(result.data.records) && result.data.records[0],
    result && result.data && Array.isArray(result.data.items) && result.data.items[0],
  ].find(Boolean) || null;
}

function recordProperties(record) {
  return (record && (record.properties || record.fields || record.customFields)) || {};
}

function prop(props, key) {
  const keys = [key, `custom_objects.performance_records.${key}`].concat(FIELD_IDS[key] || []);
  for (const item of keys) {
    const value = readPropValue(props, item);
    if (value !== "") return value;
  }
  return "";
}

function readPropValue(props, key) {
  const raw = props && props[key];
  if (raw === undefined || raw === null) return "";
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return clean(raw.value || raw.fieldValue || raw.field_value || raw.name || raw.label);
  }
  return clean(raw);
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function dateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return {};
  }
}

function clean(value) {
  return String(value || "").trim();
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
