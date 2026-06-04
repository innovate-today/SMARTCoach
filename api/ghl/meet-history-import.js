const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const MEET_RESULT_SCHEMA_KEY = "custom_objects.meet_results";
const { getGhlContext, requireProPlan } = require("../../lib/ghl-account");
const { attachRegistryAccount, setSmartTrakSecurityHeaders } = require("../../lib/smart-trak-request");

module.exports = async function handler(req, res) {
  setSmartTrakSecurityHeaders(res);
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  await attachRegistryAccount(req);

  if (!requireProPlan(req, res)) return;

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { token, locationId } = getGhlContext(req);
  if (!token || !locationId) {
    res.status(500).json({ error: "SMART Trak meet history import is not configured on the server." });
    return;
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const rows = Array.isArray(payload && payload.results) ? payload.results : [];
    if (!rows.length) throw httpError(400, "Preview meet history rows before saving.");

    const created = [];
    const skipped = [];
    for (const raw of rows) {
      const row = normalizeHistoryRow(raw);
      if (!row.athleteName || !row.meetName || !row.event || !row.resultDisplay || !row.meetDate) {
        skipped.push({ rowNumber: row.rowNumber, reason: "Missing required fields." });
        continue;
      }
      const properties = buildMeetHistoryProperties(row);
      const duplicate = await findDuplicateMeetResult({ token, locationId, sourceRecordId: properties.source_record_id });
      if (duplicate) {
        skipped.push({ rowNumber: row.rowNumber, reason: "Duplicate already saved." });
        continue;
      }
      const result = await ghlFetch({
        token,
        path: `/objects/${encodeURIComponent(MEET_RESULT_SCHEMA_KEY)}/records`,
        method: "POST",
        body: { locationId, properties },
      });
      created.push(normalizeCreatedRow({
        id: objectRecordId(result),
        properties,
      }));
    }

    res.status(200).json({
      success: true,
      createdCount: created.length,
      skippedCount: skipped.length,
      created,
      skipped,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Meet history import failed." });
  }
};

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-SMARTCoach-Account, X-SMARTCoach-Access-Code, X-SMARTCoach-Session");
}

function normalizeHistoryRow(row) {
  const year = Number(row && row.seasonYear) || Number(row && row.year) || 0;
  const meetDate = dateOnly(clean(row && (row.meetDate || row.date)), year);
  return {
    rowNumber: Number(row && row.rowNumber) || 0,
    athleteName: clean(row && (row.athleteName || row.athlete)),
    athleteGender: normalizeGender(row && (row.athleteGender || row.gender)),
    grade: clean(row && row.grade),
    meetName: clean(row && (row.meetName || row.meet)),
    meetDate,
    season: clean(row && row.season) || seasonForDate(meetDate),
    seasonYear: year || Number(String(meetDate).slice(0, 4)) || new Date().getFullYear(),
    sport: normalizeSport(row && row.sport),
    event: clean(row && row.event),
    resultDisplay: clean(row && (row.resultDisplay || row.result || row.mark)),
    resultMs: Number(row && row.resultMs) || parseTimeToMs(row && (row.resultDisplay || row.result || row.mark)) || null,
    place: clean(row && row.place),
    isPr: truthy(row && (row.isPr || row.pr)),
    isSeasonBest: truthy(row && (row.isSeasonBest || row.sb)) || true,
    notes: clean(row && row.notes),
    sourceRecordId: clean(row && row.sourceRecordId),
  };
}

function buildMeetHistoryProperties(row) {
  const sourceRecordId = row.sourceRecordId || buildSourceRecordId(row);
  const notes = [
    "Result Type: Historical Import",
    row.grade ? `Grade: ${row.grade}` : "",
    row.athleteGender ? `Gender: ${row.athleteGender}` : "",
    row.place ? `Place: ${row.place}` : "",
    row.notes,
  ].filter(Boolean).join("\n");
  return compactProperties({
    meet_result: `${row.athleteName} - ${row.event} - ${row.resultDisplay} - ${row.meetName}`,
    athlete_contact: "",
    athlete_name_snapshot: row.athleteName,
    meet_name: row.meetName,
    meet_record_id: "",
    meet_date: row.meetDate,
    season: optionValue(row.season),
    season_year: row.seasonYear,
    sport: sportValue(row.sport),
    event: row.event,
    result_display: row.resultDisplay,
    result_ms: row.resultMs,
    wind: "",
    splits_json: "",
    is_pr: row.isPr ? "Yes" : "No",
    is_season_best: row.isSeasonBest ? "Yes" : "No",
    coach_race_notes: notes,
    source_system: "smartcoach_history_import",
    source_record_id: sourceRecordId,
  });
}

function normalizeCreatedRow(record) {
  const props = record.properties || {};
  const notes = clean(props.coach_race_notes);
  return {
    recordId: record.id || "",
    sourceRecordId: props.source_record_id || "",
    athleteName: props.athlete_name_snapshot || "",
    athleteGender: noteValue(notes, "Gender"),
    meetName: props.meet_name || "",
    event: props.event || "",
    resultDisplay: props.result_display || "",
    resultMs: Number(props.result_ms) || 0,
    meetDate: props.meet_date || "",
    sport: labelValue(props.sport) || props.sport || "",
    wind: props.wind || "",
    isPr: props.is_pr === "Yes",
    isSeasonBest: props.is_season_best === "Yes",
    coachRaceNotes: notes,
    syncedAt: new Date().toISOString(),
  };
}

async function findDuplicateMeetResult({ token, locationId, sourceRecordId }) {
  if (!sourceRecordId) return null;
  const result = await optionalGhlFetch({
    token,
    path: `/objects/${encodeURIComponent(MEET_RESULT_SCHEMA_KEY)}/records/search`,
    method: "POST",
    body: {
      locationId,
      page: 1,
      pageLimit: 1,
      filters: [{ field: "source_record_id", operator: "eq", value: sourceRecordId }],
    },
  });
  return firstRecord(result);
}

async function optionalGhlFetch(args) {
  try {
    return await ghlFetch(args);
  } catch (error) {
    if (error.statusCode === 404 || error.statusCode === 400) return null;
    throw error;
  }
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
  if (!response.ok) {
    const message = data && (data.message || data.error || data.msg) || `GHL request failed (${response.status})`;
    throw httpError(response.status, message);
  }
  return data;
}

function parseTimeToMs(value) {
  const text = clean(value);
  if (!text) return 0;
  const parts = text.split(":").map(Number);
  if (parts.some((part) => Number.isNaN(part))) return Number(text) ? Math.round(Number(text) * 1000) : 0;
  let seconds = 0;
  if (parts.length === 1) seconds = parts[0];
  if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
  if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  return Math.round(seconds * 1000);
}

function dateOnly(value, fallbackYear) {
  const text = clean(value);
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const monthDayYear = text.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (monthDayYear) {
    const year = Number(monthDayYear[3] || fallbackYear);
    if (!year) return "";
    return `${fourDigitYear(year)}-${String(monthDayYear[1]).padStart(2, "0")}-${String(monthDayYear[2]).padStart(2, "0")}`;
  }
  const named = text.match(/^([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{2,4}))?$/);
  if (named) {
    const month = monthNumber(named[1]);
    const year = Number(named[3] || fallbackYear);
    if (!month || !year) return "";
    return `${fourDigitYear(year)}-${String(month).padStart(2, "0")}-${String(named[2]).padStart(2, "0")}`;
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function monthNumber(value) {
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const key = clean(value).slice(0, 3).toLowerCase();
  const index = months.indexOf(key);
  return index >= 0 ? index + 1 : 0;
}

function fourDigitYear(year) {
  return year < 100 ? 2000 + year : year;
}

function seasonForDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unspecified";
  const month = date.getMonth() + 1;
  if (month === 12 || month <= 2) return "Winter";
  if (month <= 5) return "Spring";
  if (month <= 7) return "Summer";
  return "Fall";
}

function buildSourceRecordId(row) {
  return [
    "mhi",
    row.seasonYear,
    slugValue(row.athleteName),
    slugValue(row.meetDate),
    slugValue(row.event),
    slugValue(row.meetName),
    slugValue(row.resultDisplay),
  ].filter(Boolean).join("_");
}

function normalizeGender(value) {
  const text = clean(value).toLowerCase();
  if (["f", "female", "girl", "girls", "woman", "women", "womens", "women's"].includes(text)) return "Girls";
  if (["m", "male", "boy", "boys", "man", "men", "mens", "men's"].includes(text)) return "Boys";
  return clean(value);
}

function normalizeSport(value) {
  const text = clean(value);
  if (!text) return "";
  const normalized = text.toLowerCase();
  if (normalized.includes("cross")) return "Cross Country";
  if (normalized.includes("track")) return "Track";
  return text;
}

function sportValue(value) {
  const normalized = optionValue(value);
  if (normalized.indexOf("track") === 0) return "track";
  if (normalized.indexOf("cross") === 0) return "cross_country";
  return normalized || "track";
}

function optionValue(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function labelValue(value) {
  const text = cleanValue(value);
  if (!text) return "";
  if (text.includes("_")) {
    return text.split("_").filter(Boolean).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
  }
  return text;
}

function compactProperties(properties) {
  return Object.keys(properties).reduce((cleaned, key) => {
    const value = properties[key];
    if (value === "" || value === null || typeof value === "undefined") return cleaned;
    cleaned[key] = value;
    return cleaned;
  }, {});
}

function noteValue(notes, label) {
  const pattern = new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*([^\\n]+)`, "i");
  const match = clean(notes).match(pattern);
  return match ? clean(match[1]) : "";
}

function firstRecord(result) {
  const candidates = [
    result && result.record,
    result && Array.isArray(result.records) && result.records[0],
    result && Array.isArray(result.items) && result.items[0],
    result && result.data && Array.isArray(result.data.records) && result.data.records[0],
    result && result.data && Array.isArray(result.data.items) && result.data.items[0],
  ];
  return candidates.find(Boolean) || null;
}

function objectRecordId(result) {
  return clean(result && (result.id || result._id || result.recordId || (result.record && (result.record.id || result.record._id || result.record.recordId))));
}

function slugValue(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function truthy(value) {
  return value === true || /^(yes|true|1|on|pb|pr|sb)$/i.test(clean(value));
}

function clean(value) {
  return String(value || "").trim();
}

function cleanValue(value) {
  if (Array.isArray(value)) return value.map(cleanValue).filter(Boolean).join(", ");
  if (value && typeof value === "object") return cleanValue(value.value || value.name || value.label || value.id);
  return clean(value);
}

function safeJson(text) {
  try { return JSON.parse(text); } catch (error) { return { message: text }; }
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
