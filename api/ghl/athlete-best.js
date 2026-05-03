const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const ATHLETE_BEST_SCHEMA_KEY = "custom_objects.athlete_bests";

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
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
    if (error.statusCode && error.statusCode < 500) {
      res.status(200).json({ success: true, best: null, warning: error.message });
      return;
    }
    res.status(error.statusCode || 500).json({ error: error.message || "Athlete Best lookup failed." });
  }
};

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
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
