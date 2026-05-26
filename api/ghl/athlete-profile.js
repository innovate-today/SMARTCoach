const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const ATHLETE_BEST_SCHEMA_KEY = "custom_objects.athlete_bests";
const MEET_RESULT_SCHEMA_KEY = "custom_objects.meet_results";
const PERFORMANCE_RECORD_SCHEMA_KEY = "custom_objects.performance_records";
const RECORD_SCHEMA_KEY = "custom_objects.records";
const { getGhlContext, requireProPlan } = require("../../lib/ghl-account");
const { attachRegistryAccount, setSmartTrakSecurityHeaders } = require("../../lib/smart-trak-request");
const FIELD_IDS = {
  athlete_contact: ["JNGhbB93E0xRao1jAm47", "ZBi4Oj4pmCQs8ekqaNr2", "q9xmnPdCBRL1NuomFuOo", "lgSfedW35TT44Nxgl7tY"],
  athlete_name_snapshot: ["m20bSENWaEB4jBMtXgMD", "NxKoU2l9QohpmzRt2gin", "0lX15xSvQP77xhNH45q1", "OjTWebwJU389MGpccJ2b"],
  event: ["0zkuDc0aDTpw5hPOKADa", "Qtvff2zJpE2nu8qV6kAU", "tCE1zz6sODLctaBJaBZD"],
  personal_best_display: ["h1rwv5B4JSLfNnsTL7qJ"],
  personal_best_meet: ["mRbdhzawlZ0Q386Zv3X2"],
  personal_best_date: ["tOWqZJ9HUKMtE6THTOfZ"],
  season_best_display: ["6Xc5844e5EwfqBltPYU9"],
  season_best_meet: ["rRAorB4W8yNzZiIyWeV8"],
  season_best_date: ["AffLPRbHGOzMUgKaALwi"],
  last_result_display: ["JlPshYvArSOfoUTP7Gn6"],
  last_result_date: ["LLzkfQDCtloVaUzEWQxE"],
  meet_name: ["bCOXXRAtRqmCJnMZFLvB", "8sjv8sNmaTJiCQIIJ952"],
  result_display: ["Cu9h6mq2X6uPSQG6IraM", "oECaYRLL3M0uczHeLVYC"],
  meet_date: ["rYZUhun2ynmK8MNsYgph"],
  is_pr: ["XMvKfEECN6PCcA0TKwzN"],
  is_season_best: ["zO57s50B9sf62EPdoq7J"],
  group_name: ["ochf7LkGhgAh5ySys5dA"],
  workout_type: ["jX0YLlpt08vxNKV3JyM5"],
  total_time_display: ["z9eZIcIL1B7yaeR5jXHI"],
  session_date: ["pl69ao2Pu76zeUKMEWpm"],
  record_type: ["kFI5EuUMaWNNr1MWCRCC"],
  record_date: ["lXHnJHTLrt0njYh0wIRX"],
};

const FIELD_LABELS = {
  athlete_contact: ["athlete contact", "athlete"],
  athlete_name_snapshot: ["athlete name snapshot", "athlete name", "name snapshot"],
  event: ["event"],
  personal_best_display: ["personal best display", "personal best"],
  personal_best_meet: ["personal best meet"],
  personal_best_date: ["personal best date"],
  season_best_display: ["season best display", "season best"],
  season_best_meet: ["season best meet"],
  season_best_date: ["season best date"],
  last_result_display: ["last result display", "last result"],
  last_result_date: ["last result date"],
  meet_name: ["meet name", "meet"],
  result_display: ["result display", "result"],
  meet_date: ["meet date", "date"],
  is_pr: ["is pr", "pr"],
  is_season_best: ["is season best", "season best"],
  group_name: ["group name", "group"],
  workout_type: ["workout type", "type"],
  total_time_display: ["total time display", "total time"],
  session_date: ["session date", "workout date", "date"],
  record_type: ["record type"],
  record_date: ["record date"],
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

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { token, locationId } = getGhlContext(req);

  if (!token || !locationId) {
    res.status(500).json({ error: "SMART Trak athlete profile is not configured on the server." });
    return;
  }

  try {
    const contactId = clean(req.query && req.query.contactId);
    const athleteName = clean(req.query && req.query.athleteName);

    if (!contactId) throw httpError(400, "Athlete contact is required.");

    const [bestRecords, meetRecords, performanceRecords, recordEntries] = await Promise.all([
      searchByAthlete({ token, locationId, schemaKey: ATHLETE_BEST_SCHEMA_KEY, limit: 50 }),
      searchByAthlete({ token, locationId, schemaKey: MEET_RESULT_SCHEMA_KEY, limit: 25 }),
      searchByAthlete({ token, locationId, schemaKey: PERFORMANCE_RECORD_SCHEMA_KEY, limit: 25 }),
      searchByAthlete({ token, locationId, schemaKey: RECORD_SCHEMA_KEY, limit: 25 }),
    ]);

    const profile = {
      contactId,
      athleteName,
      bests: bestRecords.map(normalizeBest).filter((item) => item.event),
      meetResults: meetRecords.map(normalizeMeetResult).filter((item) => item.event || item.resultDisplay).sort(sortByDateDesc).slice(0, 5),
      training: performanceRecords.map(normalizePerformanceRecord).filter((item) => item.groupName || item.totalTimeDisplay).sort(sortByDateDesc).slice(0, 5),
      records: recordEntries.map(normalizeRecordEntry).filter((item) => item.recordType || item.resultDisplay).sort(sortByDateDesc).slice(0, 5),
    };

    res.status(200).json({ success: true, profile });

    async function searchByAthlete({ token, locationId, schemaKey, limit }) {
      try {
        const result = await ghlFetch({
          token,
          path: `/objects/${encodeURIComponent(schemaKey)}/records/search`,
          method: "POST",
          body: {
            locationId,
            page: 1,
            pageLimit: 100,
          },
        });
        return recordsFromResult(result).filter((record) => recordMatchesAthlete(record, { contactId, athleteName })).slice(0, limit || 25);
      } catch (error) {
        if (error.statusCode && error.statusCode >= 500) throw error;
        return [];
      }
    }
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Athlete profile lookup failed." });
  }
};

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-SMARTCoach-Account");
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

function normalizeBest(record) {
  const props = recordProperties(record);
  return {
    event: prop(props, "event"),
    personalBestDisplay: prop(props, "personal_best_display"),
    personalBestMeet: prop(props, "personal_best_meet"),
    personalBestDate: prop(props, "personal_best_date"),
    seasonBestDisplay: prop(props, "season_best_display"),
    seasonBestMeet: prop(props, "season_best_meet"),
    seasonBestDate: prop(props, "season_best_date"),
    lastResultDisplay: prop(props, "last_result_display"),
    lastResultDate: prop(props, "last_result_date"),
  };
}

function normalizeMeetResult(record) {
  const props = recordProperties(record);
  return {
    meetName: prop(props, "meet_name"),
    event: prop(props, "event"),
    resultDisplay: prop(props, "result_display"),
    meetDate: prop(props, "meet_date"),
    isPr: yes(prop(props, "is_pr")),
    isSeasonBest: yes(prop(props, "is_season_best")),
  };
}

function normalizePerformanceRecord(record) {
  const props = recordProperties(record);
  return {
    groupName: prop(props, "group_name"),
    workoutType: labelValue(prop(props, "workout_type")),
    totalTimeDisplay: prop(props, "total_time_display"),
    sessionDate: prop(props, "session_date"),
  };
}

function normalizeRecordEntry(record) {
  const props = recordProperties(record);
  return {
    recordType: labelValue(prop(props, "record_type")),
    event: prop(props, "event"),
    resultDisplay: prop(props, "result_display"),
    meetName: prop(props, "meet_name"),
    recordDate: prop(props, "record_date"),
  };
}

function recordMatchesAthlete(record, athlete) {
  const props = recordProperties(record);
  const contactValue = prop(props, "athlete_contact");
  if (contactValue && contactValue === athlete.contactId) return true;
  const nameValue = prop(props, "athlete_name_snapshot").toLowerCase();
  return !!nameValue && !!athlete.athleteName && nameValue === athlete.athleteName.toLowerCase();
}

function sortByDateDesc(a, b) {
  const ad = a.meetDate || a.sessionDate || a.recordDate || a.lastResultDate || "";
  const bd = b.meetDate || b.sessionDate || b.recordDate || b.lastResultDate || "";
  return String(bd).localeCompare(String(ad));
}

function recordsFromResult(result) {
  return [
    ...(Array.isArray(result && result.records) ? result.records : []),
    ...(Array.isArray(result && result.items) ? result.items : []),
    ...(Array.isArray(result && result.data && result.data.records) ? result.data.records : []),
    ...(Array.isArray(result && result.data && result.data.items) ? result.data.items : []),
  ];
}

function recordProperties(record) {
  return (record && (record.properties || record.fields || record.customFields)) || {};
}

function prop(props, key) {
  const keys = [key, `custom_objects.athlete_bests.${key}`, `custom_objects.meet_results.${key}`, `custom_objects.performance_records.${key}`, `custom_objects.records.${key}`].concat(FIELD_IDS[key] || []);
  for (const item of keys) {
    const value = readPropValue(props, item);
    if (value) return value;
  }
  return "";
}

function readPropValue(props, key) {
  if (!props) return "";
  const wanted = propLookupKeys(key);
  if (Array.isArray(props)) {
    const field = props.find((item) => item && fieldLabels(item).some((label) => wanted.includes(normalizeLookupKey(label))));
    return field ? fieldValue(field) : "";
  }
  if (Object.prototype.hasOwnProperty.call(props, key)) return clean(props[key]);
  const match = Object.keys(props).find((item) => wanted.includes(normalizeLookupKey(item)));
  return match ? clean(props[match]) : "";
}

function propLookupKeys(key) {
  const base = [
    key,
    `custom_objects.athlete_bests.${key}`,
    `custom_objects.meet_results.${key}`,
    `custom_objects.performance_records.${key}`,
    `custom_objects.records.${key}`,
  ].concat(FIELD_IDS[key] || [], FIELD_LABELS[key] || []);
  return base.map(normalizeLookupKey).filter(Boolean);
}

function fieldLabels(field) {
  return [
    field.id,
    field.fieldId,
    field.field_id,
    field.customFieldId,
    field.key,
    field.fieldKey,
    field.field_key,
    field.name,
    field.fieldName,
    field.field_name,
    field.label,
    field.displayName,
    field.display_name,
  ].map(clean).filter(Boolean);
}

function fieldValue(field) {
  const value = firstPresent([field.value, field.fieldValue, field.field_value, field.valueString, field.value_string]);
  if (Array.isArray(value)) return value.map(fieldValuePart).filter(Boolean).join(", ");
  return fieldValuePart(value);
}

function fieldValuePart(value) {
  if (value === null || typeof value === "undefined") return "";
  if (typeof value === "object") return clean(value.value || value.name || value.label || value.key || value.id);
  return clean(value);
}

function firstPresent(values) {
  for (const value of values) {
    if (value !== null && typeof value !== "undefined" && value !== "") return value;
  }
  return "";
}

function normalizeLookupKey(value) {
  const text = clean(value).toLowerCase();
  if (!text) return "";
  const suffix = text.split(".").pop();
  return suffix.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function labelValue(value) {
  const text = clean(value);
  if (!text) return "";
  return text.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function yes(value) {
  return /^(yes|true|1|on)$/i.test(clean(value));
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
