const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const ATHLETE_BEST_SCHEMA_KEY = "custom_objects.athlete_bests";

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const token = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;

  if (!token || !locationId) {
    res.status(500).json({ error: "GHL athlete bests are not configured on the server." });
    return;
  }

  try {
    if (req.method === "POST") {
      const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const rows = Array.isArray(payload && payload.rows) ? payload.rows : [payload];
      const results = [];
      for (const row of rows) {
        try {
          results.push(await upsertAthleteBest({ token, locationId, payload: row || {} }));
        } catch (error) {
          results.push({
            action: "skipped",
            athleteName: clean(row && row.athleteName),
            event: clean(row && row.event),
            reason: error.message || "Could not save current fitness.",
          });
        }
      }
      res.status(200).json({ success: true, results });
      return;
    }

    const contactId = clean(req.query && req.query.contactId);
    const event = clean(req.query && req.query.event);
    const season = clean(req.query && req.query.season);
    const seasonYear = Number(req.query && req.query.seasonYear) || new Date().getFullYear();

    if (!contactId) throw httpError(400, "Athlete contact is required.");
    if (!event) throw httpError(400, "Event is required.");

    const sourceRecordId = buildAthleteBestSourceRecordId({ contactId, event });
    const record = await findAthleteBest({ token, locationId, sourceRecordId });
    const best = normalizeAthleteBest({ record, season, seasonYear, sourceRecordId });
    res.status(200).json({ success: true, best });
  } catch (error) {
    if (req.method === "GET" && error.statusCode && error.statusCode < 500) {
      res.status(200).json({ success: true, best: null, warning: error.message });
      return;
    }
    res.status(error.statusCode || 500).json({ error: error.message || "Athlete Best lookup failed." });
  }
};

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function upsertAthleteBest({ token, locationId, payload }) {
  const contactId = clean(payload.contactId);
  const athleteName = clean(payload.athleteName);
  const event = clean(payload.event);
  const display = clean(payload.resultDisplay || payload.currentFitnessTime || payload.time);
  const resultMs = parseTimeToMs(display);
  const date = dateOnly(payload.resultDate || payload.date || new Date());
  const season = clean(payload.season) || currentSeason();
  const seasonYear = Number(payload.seasonYear) || new Date(`${date}T00:00:00`).getFullYear();

  if (!contactId) throw httpError(400, "Athlete contact is required.");
  if (!event) throw httpError(400, "Fitness distance is required.");
  if (!display || !resultMs) throw httpError(400, "Fitness time is required.");

  const sourceRecordId = buildAthleteBestSourceRecordId({ contactId, event });
  const existing = await findAthleteBest({ token, locationId, sourceRecordId });
  const props = buildAthleteBestProperties({
    contactId,
    athleteName,
    event,
    display,
    resultMs,
    date,
    season,
    seasonYear,
    existing,
    sourceRecordId,
  });

  if (existing && existing.id) {
    const updated = await saveObjectRecordWithOptionFallback({
      token,
      locationId,
      schemaKey: ATHLETE_BEST_SCHEMA_KEY,
      recordId: existing.id,
      method: "PUT",
      properties: props,
      optionKeys: ["season"],
    });
    return { action: "updated", recordId: existing.id || updated.id || "", sourceRecordId, event, resultDisplay: display };
  }

  const created = await saveObjectRecordWithOptionFallback({
    token,
    locationId,
    schemaKey: ATHLETE_BEST_SCHEMA_KEY,
    method: "POST",
    properties: props,
    optionKeys: ["season"],
  });
  return { action: "created", recordId: created.id || (created.record && created.record.id) || "", sourceRecordId, event, resultDisplay: display };
}

async function saveObjectRecordWithOptionFallback({ token, locationId, schemaKey, recordId, method, properties, optionKeys }) {
  const path = recordId
    ? `/objects/${encodeURIComponent(schemaKey)}/records/${encodeURIComponent(recordId)}`
    : `/objects/${encodeURIComponent(schemaKey)}/records`;
  try {
    return await ghlFetch({
      token,
      path,
      method,
      body: { locationId, properties },
    });
  } catch (error) {
    if (!/allowed option|isn't an allowed option|not an allowed/i.test(error.message || "")) throw error;
    const fallback = { ...properties };
    (optionKeys || []).forEach((key) => delete fallback[key]);
    return ghlFetch({
      token,
      path,
      method,
      body: { locationId, properties: fallback },
    });
  }
}

function buildAthleteBestProperties({ contactId, athleteName, event, display, resultMs, date, season, seasonYear, existing, sourceRecordId }) {
  const existingProperties = recordProperties(existing);
  const recordName = `${athleteName || contactId} - ${event} Bests`;
  return compactProperties({
    athlete_best: recordName,
    record_name: recordName,
    athlete_contact: contactId,
    athlete_name_snapshot: athleteName,
    event,
    personal_best_display: display,
    personal_best_ms: resultMs,
    personal_best_meet: clean(existingProperties.personal_best_meet) || "Current Fitness Setup",
    personal_best_date: date,
    personal_best_source_record_id: clean(existingProperties.personal_best_source_record_id) || `manual_${sourceRecordId}_${date.replace(/-/g, "")}`,
    season: optionValue(season),
    season_year: seasonYear,
    season_best_display: display,
    season_best_ms: resultMs,
    season_best_meet: "Current Fitness Setup",
    season_best_date: date,
    season_best_source_record_id: `manual_${sourceRecordId}_${date.replace(/-/g, "")}`,
    last_result_display: display,
    last_result_date: date,
    pb_updated_at: date,
    sb_updated_at: date,
    source_system: "smartcoach_pro",
    source_record_id: sourceRecordId,
  });
}

async function findAthleteBest({ token, locationId, sourceRecordId }) {
  const result = await ghlFetch({
    token,
    path: `/objects/${encodeURIComponent(ATHLETE_BEST_SCHEMA_KEY)}/records/search`,
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

function normalizeAthleteBest({ record, season, seasonYear, sourceRecordId }) {
  if (!record) {
    return { exists: false, sourceRecordId };
  }

  const props = recordProperties(record);
  const sameSeason = optionValue(props.season) === optionValue(season) && Number(props.season_year) === Number(seasonYear);
  return {
    exists: true,
    recordId: record.id || "",
    sourceRecordId,
    personalBestDisplay: clean(props.personal_best_display),
    personalBestMs: numberValue(props.personal_best_ms),
    personalBestMeet: clean(props.personal_best_meet),
    personalBestDate: clean(props.personal_best_date),
    seasonBestDisplay: sameSeason ? clean(props.season_best_display) : "",
    seasonBestMs: sameSeason ? numberValue(props.season_best_ms) : 0,
    seasonBestMeet: sameSeason ? clean(props.season_best_meet) : "",
    seasonBestDate: sameSeason ? clean(props.season_best_date) : "",
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

function firstRecord(result) {
  return recordsFromResult(result)[0] || null;
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

function buildAthleteBestSourceRecordId({ contactId, event }) {
  return `ab_${slugValue(contactId)}_${slugValue(event) || "event"}`;
}

function optionValue(value) {
  return clean(value).toLowerCase().replace(/&/g, "and").replace(/\+/g, "plus").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function parseTimeToMs(value) {
  const text = clean(value);
  if (!text) return 0;
  const parts = text.split(":").map((part) => part.trim());
  let seconds = 0;
  if (parts.length === 1) seconds = Number(parts[0]);
  else if (parts.length === 2) seconds = Number(parts[0]) * 60 + Number(parts[1]);
  else if (parts.length === 3) seconds = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : 0;
}

function dateOnly(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function currentSeason() {
  const month = new Date().getMonth() + 1;
  if (month === 12 || month <= 2) return "Winter";
  if (month >= 3 && month <= 5) return "Spring";
  if (month >= 6 && month <= 8) return "Summer";
  return "Fall";
}

function compactProperties(properties) {
  return Object.keys(properties).reduce((cleaned, key) => {
    const value = properties[key];
    if (value === "" || value === null || typeof value === "undefined") return cleaned;
    cleaned[key] = value;
    return cleaned;
  }, {});
}

function slugValue(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function numberValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
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
