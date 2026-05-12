const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const SMARTCOACH_ACTIVE_FIELD_ID = "xepTMFvtaTwFdLVrOeQH";
const SMARTCOACH_ATHLETE_ID_FIELD_ID = "Vi7fmpkblrGZqZFyNBI2";
const ATHLETE_BEST_SCHEMA_KEY = "custom_objects.athlete_bests";
const MEET_RESULT_SCHEMA_KEY = "custom_objects.meet_results";
const PERFORMANCE_RECORD_SCHEMA_KEY = "custom_objects.performance_records";

const FIELD_IDS = {
  athlete_contact: ["JNGhbB93E0xRao1jAm47", "ZBi4Oj4pmCQs8ekqaNr2", "q9xmnPdCBRL1NuomFuOo"],
  athlete_name_snapshot: ["m20bSENWaEB4jBMtXgMD", "NxKoU2l9QohpmzRt2gin", "0lX15xSvQP77xhNH45q1"],
  source_session_id: ["3Mfs6tIpL4KXx8UeNGBU"],
  source_record_id: ["9YD4n4y4aqf3VnkrwLL1"],
  event: ["0zkuDc0aDTpw5hPOKADa", "Qtvff2zJpE2nu8qV6kAU"],
  personal_best_display: ["h1rwv5B4JSLfNnsTL7qJ"],
  personal_best_meet: ["mRbdhzawlZ0Q386Zv3X2"],
  personal_best_date: ["tOWqZJ9HUKMtE6THTOfZ"],
  season_best_display: ["6Xc5844e5EwfqBltPYU9"],
  season_best_meet: ["rRAorB4W8yNzZiIyWeV8"],
  season_best_date: ["AffLPRbHGOzMUgKaALwi"],
  last_result_display: ["JlPshYvArSOfoUTP7Gn6"],
  last_result_date: ["LLzkfQDCtloVaUzEWQxE"],
  meet_name: ["bCOXXRAtRqmCJnMZFLvB"],
  result_display: ["Cu9h6mq2X6uPSQG6IraM"],
  meet_date: ["rYZUhun2ynmK8MNsYgph"],
  is_pr: ["XMvKfEECN6PCcA0TKwzN"],
  is_season_best: ["zO57s50B9sf62EPdoq7J"],
  group_name: ["ochf7LkGhgAh5ySys5dA"],
  workout_type: ["jX0YLlpt08vxNKV3JyM5"],
  total_time_display: ["z9eZIcIL1B7yaeR5jXHI"],
  session_date: ["pl69ao2Pu76zeUKMEWpm"],
  rep_number: ["J0SJxcm3yeraYzoYgjXe"],
  splits_json: ["bIjfXwW7mDCkkjGS4LL5"],
  coach_note: ["Afy8b8lAbUoti9cCqa1m"],
};

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
    res.status(500).json({ error: "SMARTCoach Pro dashboard is not configured on the server." });
    return;
  }

  try {
    const [athletes, bestRecords, meetRecords, performanceRecords] = await Promise.all([
      listActiveAthletes({ token, locationId }),
      searchObjectRecords({ token, locationId, schemaKey: ATHLETE_BEST_SCHEMA_KEY }),
      searchObjectRecords({ token, locationId, schemaKey: MEET_RESULT_SCHEMA_KEY }),
      searchObjectRecords({ token, locationId, schemaKey: PERFORMANCE_RECORD_SCHEMA_KEY }),
    ]);

    const rows = athletes.map((athlete) => buildAthleteRow({
      athlete,
      bestRecords,
      meetRecords,
      performanceRecords,
    }));
    const recentMeetResults = buildRecentMeetResults({ athletes, meetRecords }).slice(0, 100);
    const recentTrainingSyncs = buildRecentTrainingSyncs({ athletes, performanceRecords }).slice(0, 100);

    res.status(200).json({
      success: true,
      generatedAt: new Date().toISOString(),
      totals: {
        athletes: rows.length,
        currentWeekRuns: rows.reduce((sum, row) => sum + row.currentWeekRuns, 0),
        previousWeekRuns: rows.reduce((sum, row) => sum + row.previousWeekRuns, 0),
      },
      athletes: rows,
      recentMeetResults,
      recentTrainingSyncs,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Dashboard lookup failed." });
  }
};

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function listActiveAthletes({ token, locationId }) {
  const result = await ghlFetch({
    token,
    path: `/contacts/?locationId=${encodeURIComponent(locationId)}&limit=100`,
    method: "GET",
  });

  return (result.contacts || [])
    .map(normalizeContact)
    .filter((athlete) => athlete.smartcoachActive || (athlete.smartcoachAthleteId && athlete.tags.indexOf("smartcoach-athlete") >= 0))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function searchObjectRecords({ token, locationId, schemaKey }) {
  try {
    const result = await ghlFetch({
      token,
      path: `/objects/${encodeURIComponent(schemaKey)}/records/search`,
      method: "POST",
      body: { locationId, page: 1, pageLimit: 100 },
    });
    return recordsFromResult(result);
  } catch (error) {
    if (error.statusCode && error.statusCode >= 500) throw error;
    return [];
  }
}

function buildRecentTrainingSyncs({ athletes, performanceRecords }) {
  const rows = [];
  athletes.forEach((athlete) => {
    performanceRecords.forEach((record) => {
      if (!recordMatchesAthlete(record, athlete)) return;
      const training = normalizePerformanceRecord(record);
      if (!training.groupName && !training.totalTimeDisplay) return;
      rows.push({
        athleteName: athlete.name,
        contactId: athlete.id,
        ...training,
      });
    });
  });
  return rows.sort(sortTrainingSyncDesc);
}

function buildRecentMeetResults({ athletes, meetRecords }) {
  const rows = [];
  athletes.forEach((athlete) => {
    meetRecords.forEach((record) => {
      if (!recordMatchesAthlete(record, athlete)) return;
      const result = normalizeMeetResult(record);
      if (!result.event && !result.resultDisplay) return;
      rows.push({
        athleteName: athlete.name,
        contactId: athlete.id,
        ...result,
      });
    });
  });
  return rows.sort(sortMeetSyncDesc);
}

function buildAthleteRow({ athlete, bestRecords, meetRecords, performanceRecords }) {
  const bests = bestRecords.filter((record) => recordMatchesAthlete(record, athlete)).map(normalizeBest).filter((item) => item.event);
  const meets = meetRecords.filter((record) => recordMatchesAthlete(record, athlete)).map(normalizeMeetResult).filter((item) => item.event || item.resultDisplay).sort(sortByDateDesc);
  const training = performanceRecords.filter((record) => recordMatchesAthlete(record, athlete)).map(normalizePerformanceRecord).filter((item) => item.groupName || item.totalTimeDisplay).sort(sortByDateDesc);
  const currentFitness = chooseCurrentFitness(bests);
  const latestMeet = meets[0] || {};
  const latestTraining = training[0] || {};

  return {
    contactId: athlete.id,
    name: athlete.name,
    smartcoachAthleteId: athlete.smartcoachAthleteId,
    currentFitness,
    latestMeet,
    latestTraining,
    currentWeekRuns: countRunsBetween(training, startOfCurrentWeek(), addDays(startOfCurrentWeek(), 7)),
    previousWeekRuns: countRunsBetween(training, addDays(startOfCurrentWeek(), -7), startOfCurrentWeek()),
    meetResultCount: meets.length,
    trainingRecordCount: training.length,
    status: athlete.smartcoachActive ? "Active" : "Tagged",
  };
}

function chooseCurrentFitness(bests) {
  const sorted = bests.slice().sort((a, b) => String(b.lastResultDate || b.seasonBestDate || b.personalBestDate || "").localeCompare(String(a.lastResultDate || a.seasonBestDate || a.personalBestDate || "")));
  const best = sorted[0] || {};
  const display = best.lastResultDisplay || best.seasonBestDisplay || best.personalBestDisplay || "";
  const date = best.lastResultDate || best.seasonBestDate || best.personalBestDate || "";
  return {
    event: best.event || "",
    display,
    date,
    label: [best.event, display].filter(Boolean).join(" "),
  };
}

function normalizeContact(contact) {
  const smartcoachActiveValue = existingCustomFieldValue(contact, SMARTCOACH_ACTIVE_FIELD_ID);
  return {
    id: contact.id,
    name: contactName(contact),
    smartcoachActive: isActiveValue(smartcoachActiveValue),
    smartcoachAthleteId: existingCustomFieldValue(contact, SMARTCOACH_ATHLETE_ID_FIELD_ID),
    tags: Array.isArray(contact.tags) ? contact.tags : [],
  };
}

function normalizeBest(record) {
  const props = recordProperties(record);
  return {
    event: prop(props, "event"),
    personalBestDisplay: prop(props, "personal_best_display"),
    personalBestDate: prop(props, "personal_best_date"),
    personalBestMeet: prop(props, "personal_best_meet"),
    seasonBestDisplay: prop(props, "season_best_display"),
    seasonBestDate: prop(props, "season_best_date"),
    seasonBestMeet: prop(props, "season_best_meet"),
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
    syncedAt: recordTimestamp(record),
  };
}

function normalizePerformanceRecord(record) {
  const props = recordProperties(record);
  const coachNote = prop(props, "coach_note");
  return {
    sourceSessionId: prop(props, "source_session_id"),
    sourceRecordId: prop(props, "source_record_id"),
    groupName: prop(props, "group_name"),
    workoutType: labelValue(prop(props, "workout_type")),
    repNumber: Number(prop(props, "rep_number")) || null,
    totalTimeDisplay: prop(props, "total_time_display"),
    sessionDate: prop(props, "session_date"),
    splitsText: prop(props, "splits_json"),
    coachNote,
    workoutPrescription: noteValue(coachNote, "Workout"),
    plannedTarget: noteValue(coachNote, "Planned target"),
    actual: noteValue(coachNote, "Actual"),
    targetDifference: noteValue(coachNote, "Difference"),
    plannedEffort: noteValue(coachNote, "Planned effort"),
    currentFitnessSnapshot: noteValue(coachNote, "Current fitness"),
    weather: noteValue(coachNote, "Weather"),
    syncedAt: recordTimestamp(record),
  };
}

function noteValue(note, label) {
  const prefix = `${label}:`;
  const line = clean(note).split(/\r?\n/).find((item) => item.trim().toLowerCase().startsWith(prefix.toLowerCase()));
  return line ? clean(line.slice(prefix.length)) : "";
}

function recordMatchesAthlete(record, athlete) {
  const props = recordProperties(record);
  const contactValue = prop(props, "athlete_contact");
  if (contactValue && contactValue === athlete.id) return true;
  const nameValue = prop(props, "athlete_name_snapshot").toLowerCase();
  return !!nameValue && !!athlete.name && nameValue === athlete.name.toLowerCase();
}

function countRunsBetween(training, start, end) {
  return training.filter((item) => {
    const date = parseDate(item.sessionDate);
    return date && date >= start && date < end;
  }).length;
}

function startOfCurrentWeek() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseDate(value) {
  const text = clean(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sortByDateDesc(a, b) {
  const ad = a.meetDate || a.sessionDate || a.lastResultDate || a.seasonBestDate || a.personalBestDate || "";
  const bd = b.meetDate || b.sessionDate || b.lastResultDate || b.seasonBestDate || b.personalBestDate || "";
  return String(bd).localeCompare(String(ad));
}

function sortMeetSyncDesc(a, b) {
  const ad = a.syncedAt || a.meetDate || "";
  const bd = b.syncedAt || b.meetDate || "";
  return String(bd).localeCompare(String(ad));
}

function sortTrainingSyncDesc(a, b) {
  const ad = a.syncedAt || a.sessionDate || "";
  const bd = b.syncedAt || b.sessionDate || "";
  return String(bd).localeCompare(String(ad));
}

function recordTimestamp(record) {
  return clean(record && (record.createdAt || record.dateAdded || record.dateCreated || record.updatedAt || record.dateUpdated));
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
    ...(Array.isArray(result && result.data && result.data.records) ? result.data.records : []),
    ...(Array.isArray(result && result.data && result.data.items) ? result.data.items : []),
  ];
}

function recordProperties(record) {
  return (record && (record.properties || record.fields || record.customFields)) || {};
}

function prop(props, key) {
  const keys = [
    key,
    `custom_objects.athlete_bests.${key}`,
    `custom_objects.meet_results.${key}`,
    `custom_objects.performance_records.${key}`,
  ].concat(FIELD_IDS[key] || []);
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

function existingCustomFieldValue(contact, fieldId) {
  const field = customFieldList(contact).find((item) => item && (item.id === fieldId || item.fieldId === fieldId || item.field_id === fieldId || item.customFieldId === fieldId));
  if (!field) return "";
  return fieldValue(field);
}

function customFieldList(contact) {
  if (!contact) return [];
  if (Array.isArray(contact.customFields)) return contact.customFields;
  if (Array.isArray(contact.customField)) return contact.customField;
  if (Array.isArray(contact.customFieldsData)) return contact.customFieldsData;
  if (contact.customFields && typeof contact.customFields === "object") {
    return Object.keys(contact.customFields).map((key) => ({ id: key, value: contact.customFields[key] }));
  }
  return [];
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

function contactName(contact) {
  return clean(contact.name) || `${clean(contact.firstName)} ${clean(contact.lastName)}`.trim();
}

function isActiveValue(value) {
  return /^(yes|y|true|active|1|on)$/i.test(clean(value));
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
