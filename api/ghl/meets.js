const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const MEET_SCHEMA_KEY = "custom_objects.meets";
const FIELD_IDS = {
  meet: ["L6DjPWvVI13p6C1tgUz2"],
  record_name: ["aq2AIr5tjrIOefUfJmrQ"],
  meet_name: ["xYzq7SSQkqe1NnvzfHtJ"],
  meet_date: ["8dcV6Nl25E96qicqRWUg"],
  season: ["hn7WBWhxhzmC0s0jX0L3"],
  season_year: ["80OM54D71FEC7hTA9hYU"],
  status: ["pUNXAtbGgzxDJMRFMxL5"],
  source_system: ["1Gex3TInpKsIRyWgo7X1"],
  source_record_id: ["izSDCpgddfd0b8G9BPvls"],
};

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const token = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;

  if (!token || !locationId) {
    res.status(500).json({ error: "GHL meets are not configured on the server." });
    return;
  }

  try {
    if (req.method === "GET") {
      const result = await listMeets({ token, locationId });
      res.status(200).json({ success: true, meets: result.meets, objectAvailable: true, diagnostics: result.diagnostics });
      return;
    }

    if (req.method === "POST") {
      const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const meet = await createMeet({ token, locationId, payload });
      res.status(200).json({ success: true, meet });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    if (error.statusCode && error.statusCode < 500) {
      res.status(200).json({ success: true, meets: [], objectAvailable: false, warning: error.message });
      return;
    }
    res.status(error.statusCode || 500).json({ error: error.message || "Meet request failed." });
  }
};

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function listMeets({ token, locationId }) {
  const records = [];
  for (let page = 1; page <= 10; page += 1) {
    const result = await optionalGhlFetch({
      token,
      path: `/objects/${encodeURIComponent(MEET_SCHEMA_KEY)}/records/search`,
      method: "POST",
      body: { locationId, page, pageLimit: 100 },
    });
    if (!result) break;
    const batch = recordsFromResult(result);
    records.push(...batch);
    if (batch.length < 100) break;
  }

  const direct = await optionalGhlFetch({
    token,
    path: `/objects/${encodeURIComponent(MEET_SCHEMA_KEY)}/records?locationId=${encodeURIComponent(locationId)}&page=1&pageLimit=100`,
    method: "GET",
  });
  if (direct) records.push(...recordsFromResult(direct));

  const unique = uniqueRecords(records);
  const normalized = unique.map(normalizeMeet);
  const meets = normalized.filter((meet) => meet.name).sort((a, b) => {
    return String(a.date || "").localeCompare(String(b.date || "")) || a.name.localeCompare(b.name);
  });
  return {
    meets,
    diagnostics: {
      rawRecords: records.length,
      uniqueRecords: unique.length,
      namedMeets: meets.length,
      unnamedRecords: normalized.filter((meet) => !meet.name).length,
      recordSamples: unique.slice(0, 5).map((record) => summarizeRecordShape(record)),
    },
  };
}

async function createMeet({ token, locationId, payload }) {
  const name = clean(payload && payload.meetName);
  const date = clean(payload && payload.meetDate);
  const season = clean(payload && payload.season) || currentSeason().season;
  const seasonYear = Number(payload && payload.seasonYear) || (date ? new Date(`${date}T00:00:00`).getFullYear() : currentSeason().year);

  if (!name) throw httpError(400, "Meet name is required.");

  const properties = {
    meet: name,
    record_name: name,
    meet_name: name,
    meet_date: date || "",
    season: optionValue(season),
    season_year: seasonYear,
    status: "scheduled",
    source_system: "smartcoach_pro",
    source_record_id: `meet_${date ? date.replace(/-/g, "") : seasonYear}_${slugValue(name)}`,
  };

  const record = await ghlFetch({
    token,
    path: `/objects/${encodeURIComponent(MEET_SCHEMA_KEY)}/records`,
    method: "POST",
    body: { locationId, properties },
  });

  return normalizeMeet(record.record || record, properties);
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

function normalizeMeet(record, fallbackProperties) {
  const props = fallbackProperties || recordProperties(record);
  const date = clean(prop(props, "meet_date") || prop(props, "date"));
  return {
    id: record && record.id ? record.id : clean(prop(props, "source_record_id")),
    name: clean(prop(props, "meet") || prop(props, "meet_name") || prop(props, "record_name") || recordName(record)),
    date,
    season: labelValue(prop(props, "season")) || (date ? seasonForDate(date).season : ""),
    seasonYear: Number(prop(props, "season_year")) || (date ? new Date(`${date}T00:00:00`).getFullYear() : null),
    location: clean(prop(props, "location")),
    status: labelValue(prop(props, "status")) || "Scheduled",
  };
}

function recordName(record) {
  return clean(record && (record.name || record.title || record.displayName || record.display_name));
}

function summarizeRecordShape(record) {
  const props = recordProperties(record);
  if (Array.isArray(props)) {
    return {
      id: record && record.id,
      propertyShape: "array",
      fields: props.slice(0, 12).map((field) => ({
        id: clean(field && (field.id || field.fieldId || field.customFieldId)),
        key: clean(field && (field.key || field.fieldKey)),
        name: clean(field && (field.name || field.label)),
        value: clean(field && (field.value || field.fieldValue || field.field_value)),
      })),
    };
  }
  return {
    id: record && record.id,
    propertyShape: props && typeof props === "object" ? "object" : typeof props,
    keys: props && typeof props === "object" ? Object.keys(props).slice(0, 30) : [],
    topLevelKeys: record && typeof record === "object" ? Object.keys(record).slice(0, 30) : [],
  };
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
    const key = (record && record.id) || prop(props, "source_record_id") || [prop(props, "meet"), prop(props, "meet_date")].join("|");
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function recordProperties(record) {
  return (record && (record.properties || record.fields || record.customFields)) || {};
}

function prop(props, key) {
  const keys = [key, `custom_objects.meets.${key}`].concat(FIELD_IDS[key] || []);
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
    return field ? clean(field.value || field.fieldValue || field.field_value) : "";
  }
  return clean(props[key]);
}

function currentSeason() {
  return seasonForDate(new Date().toISOString().slice(0, 10));
}

function seasonForDate(dateText) {
  const d = new Date(`${dateText}T00:00:00`);
  const m = d.getMonth() + 1;
  const y = d.getFullYear();
  if (m === 12 || m <= 2) return { season: "Winter", year: y };
  if (m >= 3 && m <= 5) return { season: "Spring", year: y };
  if (m >= 6 && m <= 8) return { season: "Summer", year: y };
  return { season: "Fall", year: y };
}

function labelValue(value) {
  const text = clean(value);
  if (!text) return "";
  return text.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function optionValue(value) {
  return clean(value).toLowerCase().replace(/&/g, "and").replace(/\+/g, "plus").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function slugValue(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function clean(value) {
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
