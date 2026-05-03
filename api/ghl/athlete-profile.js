const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const ATHLETE_BEST_SCHEMA_KEY = "custom_objects.athlete_bests";
const MEET_RESULT_SCHEMA_KEY = "custom_objects.meet_results";
const PERFORMANCE_RECORD_SCHEMA_KEY = "custom_objects.performance_records";
const RECORD_SCHEMA_KEY = "custom_objects.records";

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
    res.status(500).json({ error: "GHL athlete profile is not configured on the server." });
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
            pageLimit: limit || 25,
            filters: [
              {
                field: "athlete_contact",
                operator: "eq",
                value: contactId,
              },
            ],
          },
        });
        return recordsFromResult(result);
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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
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
    event: clean(props.event),
    personalBestDisplay: clean(props.personal_best_display),
    personalBestMeet: clean(props.personal_best_meet),
    personalBestDate: clean(props.personal_best_date),
    seasonBestDisplay: clean(props.season_best_display),
    seasonBestMeet: clean(props.season_best_meet),
    seasonBestDate: clean(props.season_best_date),
    lastResultDisplay: clean(props.last_result_display),
    lastResultDate: clean(props.last_result_date),
  };
}

function normalizeMeetResult(record) {
  const props = recordProperties(record);
  return {
    meetName: clean(props.meet_name),
    event: clean(props.event),
    resultDisplay: clean(props.result_display),
    meetDate: clean(props.meet_date),
    isPr: yes(props.is_pr),
    isSeasonBest: yes(props.is_season_best),
  };
}

function normalizePerformanceRecord(record) {
  const props = recordProperties(record);
  return {
    groupName: clean(props.group_name),
    workoutType: labelValue(props.workout_type),
    totalTimeDisplay: clean(props.total_time_display),
    sessionDate: clean(props.session_date),
  };
}

function normalizeRecordEntry(record) {
  const props = recordProperties(record);
  return {
    recordType: labelValue(props.record_type),
    event: clean(props.event),
    resultDisplay: clean(props.result_display),
    meetName: clean(props.meet_name),
    recordDate: clean(props.record_date),
  };
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
