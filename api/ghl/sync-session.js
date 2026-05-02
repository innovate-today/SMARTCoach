const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const PERFORMANCE_RECORD_SCHEMA_KEY = "custom_objects.performance_records";
const SEASON_RECORD_SCHEMA_KEY = "custom_objects.season_records";
const SMARTCOACH_ACTIVE_FIELD_ID = "xepTMFvtaTwFdLVrOeQH";
const SMARTCOACH_ATHLETE_ID_FIELD_ID = "Vi7fmpkblrGZqZFyNBI2";

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
    res.status(500).json({ error: "GHL sync is not configured on the server." });
    return;
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const session = normalizeSession(payload);
    const synced = [];

    for (const athlete of session.athletes) {
      const contact = await findOrCreateContact({ token, locationId, athlete, session });
      await addSessionNote({ token, contactId: contact.id, body: buildNoteBody(session, athlete) });
      const performanceRecords = await addPerformanceRecords({
        token,
        locationId,
        contactId: contact.id,
        athlete,
        session,
      });
      const seasonRecord = await upsertSeasonRecord({
        token,
        locationId,
        contactId: contact.id,
        athlete,
        session,
        performanceRecords,
      });
      synced.push({ athlete: athlete.name, contactId: contact.id, performanceRecords, seasonRecord });
    }

    res.status(200).json({ success: true, synced });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "GHL sync failed." });
  }
};

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function normalizeSession(payload) {
  if (!payload || typeof payload !== "object") {
    throw httpError(400, "Missing sync payload.");
  }

  const athletes = Array.isArray(payload.athletes)
    ? payload.athletes
        .map(normalizeAthlete)
        .filter((athlete) => athlete.name && athlete.runs.length)
    : [];

  if (!athletes.length) {
    throw httpError(400, "No athletes with saved runs were provided.");
  }

  return {
    groupName: clean(payload.groupName) || "SMARTCoach Workout",
    season: clean(payload.season) || "Unspecified",
    phase: clean(payload.phase) || "Unspecified",
    workoutType: clean(payload.workoutType) || "Unspecified",
    energySystem: clean(payload.energySystem) || "Unspecified",
    surface: clean(payload.surface) || "Unspecified",
    sessionDate: payload.sessionDate ? new Date(payload.sessionDate) : new Date(),
    athletes,
  };
}

function normalizeAthlete(raw) {
  return {
    name: clean(raw && raw.name),
    contactId: clean(raw && raw.contactId),
    smartcoachAthleteId: clean(raw && raw.smartcoachAthleteId),
    runs: Array.isArray(raw && raw.runs)
      ? raw.runs.map(normalizeRun).filter((run) => run.total)
      : [],
  };
}

function normalizeRun(raw, index) {
  return {
    runNumber: Number(raw && raw.runNumber) || index + 1,
    total: clean(raw && raw.total),
    totalMs: Number(raw && raw.totalMs) || null,
    laps: Array.isArray(raw && raw.laps)
      ? raw.laps.map((lap) => ({
          time: clean(lap && lap.time),
          ms: Number(lap && lap.ms) || null,
        })).filter((lap) => lap.time)
      : [],
    note: clean(raw && raw.note),
    timestamp: raw && raw.timestamp ? new Date(raw.timestamp) : null,
  };
}

async function findOrCreateContact({ token, locationId, athlete, session }) {
  if (athlete.contactId) {
    const contact = await getContact({ token, contactId: athlete.contactId });
    if (contact && contact.id) {
      await addTags({ token, contactId: contact.id, tags: buildTags(session) });
      await markContactAsSmartCoachAthlete({ token, contact, athlete });
      return contact;
    }
  }

  const existing = await findExistingContact({ token, locationId, athleteName: athlete.name });
  if (existing) {
    await addTags({ token, contactId: existing.id, tags: buildTags(session) });
    await markContactAsSmartCoachAthlete({ token, contact: existing, athlete });
    return existing;
  }

  const nameParts = athlete.name.split(/\s+/);
  const firstName = nameParts.shift() || athlete.name;
  const lastName = nameParts.join(" ");

  const created = await ghlFetch({
    token,
    path: "/contacts/",
    method: "POST",
    body: {
      firstName,
      lastName,
      locationId,
      source: "SMARTCoach",
      tags: buildTags(session),
    },
  });

  const contact = created.contact || created;
  if (!contact || !contact.id) {
    throw httpError(502, `GHL did not return a contact for ${athlete.name}.`);
  }
  await markContactAsSmartCoachAthlete({ token, contact, athlete });
  return contact;
}

async function getContact({ token, contactId }) {
  const result = await ghlFetch({
    token,
    path: `/contacts/${encodeURIComponent(contactId)}`,
    method: "GET",
  });

  return result.contact || result;
}

async function findExistingContact({ token, locationId, athleteName }) {
  const result = await ghlFetch({
    token,
    path: `/contacts/?locationId=${encodeURIComponent(locationId)}&query=${encodeURIComponent(athleteName)}&limit=10`,
    method: "GET",
  });

  const normalizedName = athleteName.toLowerCase();
  return (result.contacts || []).find((contact) => {
    const contactName = `${contact.firstName || ""} ${contact.lastName || ""}`.trim().toLowerCase();
    return contactName === normalizedName;
  }) || null;
}

async function addTags({ token, contactId, tags }) {
  try {
    await ghlFetch({
      token,
      path: `/contacts/${encodeURIComponent(contactId)}/tags`,
      method: "POST",
      body: { tags },
    });
  } catch (error) {
    if (error.statusCode !== 404) throw error;
  }
}

async function markContactAsSmartCoachAthlete({ token, contact, athlete }) {
  const smartcoachAthleteId = athlete.smartcoachAthleteId || existingCustomFieldValue(contact, SMARTCOACH_ATHLETE_ID_FIELD_ID) || buildAthleteId(athlete.name);

  try {
    await ghlFetch({
      token,
      path: `/contacts/${encodeURIComponent(contact.id)}`,
      method: "PUT",
      body: {
        customFields: [
          { id: SMARTCOACH_ACTIVE_FIELD_ID, value: "Yes" },
          { id: SMARTCOACH_ATHLETE_ID_FIELD_ID, value: smartcoachAthleteId },
        ],
      },
    });
  } catch (error) {
    if (error.statusCode && error.statusCode >= 500) throw error;
  }
}

async function addSessionNote({ token, contactId, body }) {
  await ghlFetch({
    token,
    path: `/contacts/${encodeURIComponent(contactId)}/notes`,
    method: "POST",
    body: { body },
  });
}

async function addPerformanceRecords({ token, locationId, contactId, athlete, session }) {
  const created = [];

  for (const run of athlete.runs) {
    const properties = buildPerformanceRecordProperties({
      locationId,
      contactId,
      athlete,
      session,
      run,
    });

    const record = await ghlFetch({
      token,
      path: `/objects/${encodeURIComponent(PERFORMANCE_RECORD_SCHEMA_KEY)}/records`,
      method: "POST",
      body: {
        locationId,
        properties,
      },
    });

    created.push({
      runNumber: run.runNumber,
      recordId: record.id || (record.record && record.record.id) || null,
      sourceRecordId: properties.source_record_id,
    });
  }

  return created;
}

async function upsertSeasonRecord({ token, locationId, contactId, athlete, session, performanceRecords }) {
  const sourceRecordId = buildSeasonSourceRecordId({ contactId, session });
  const existing = await findSeasonRecord({ token, locationId, sourceRecordId });
  const properties = buildSeasonRecordProperties({
    contactId,
    athlete,
    session,
    performanceRecordCount: performanceRecords.length,
    existing,
    sourceRecordId,
  });

  if (existing && existing.id) {
    const updated = await ghlFetch({
      token,
      path: `/objects/${encodeURIComponent(SEASON_RECORD_SCHEMA_KEY)}/records/${encodeURIComponent(existing.id)}`,
      method: "PUT",
      body: {
        locationId,
        properties,
      },
    });

    return {
      action: "updated",
      recordId: updated.id || (updated.record && updated.record.id) || existing.id,
      sourceRecordId,
    };
  }

  const created = await ghlFetch({
    token,
    path: `/objects/${encodeURIComponent(SEASON_RECORD_SCHEMA_KEY)}/records`,
    method: "POST",
    body: {
      locationId,
      properties,
    },
  });

  return {
    action: "created",
    recordId: created.id || (created.record && created.record.id) || null,
    sourceRecordId,
  };
}

async function findSeasonRecord({ token, locationId, sourceRecordId }) {
  try {
    const result = await ghlFetch({
      token,
      path: `/objects/${encodeURIComponent(SEASON_RECORD_SCHEMA_KEY)}/records/search`,
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
  } catch (error) {
    if (error.statusCode && error.statusCode >= 500) throw error;
    return null;
  }
}

function buildPerformanceRecordProperties({ locationId, contactId, athlete, session, run }) {
  const sessionDate = validDate(run.timestamp) || validDate(session.sessionDate) || new Date();
  const syncedAt = new Date();
  const athleteSlug = slugValue(athlete.name);
  const sourceSessionId = buildSourceSessionId(session, sessionDate);
  const sourceRecordId = `${sourceSessionId}_${athleteSlug}_run_${run.runNumber}`;
  const recordName = `${athlete.name} - ${session.workoutType} - Run ${run.runNumber}`;
  const splits = run.laps.map((lap, index) => ({
    lap: index + 1,
    ms: lap.ms,
    time: lap.time,
  }));

  return {
    performance_record: recordName,
    record_name: recordName,
    athlete_contact: contactId,
    athlete_name_snapshot: athlete.name,
    source_session_id: sourceSessionId,
    source_record_id: sourceRecordId,
    group_name: session.groupName,
    session_date: dateOnly(sessionDate),
    season: optionValue(session.season),
    phase: optionValue(session.phase),
    workout_type: optionValue(session.workoutType),
    energy_system: energySystemValue(session.energySystem),
    surface: optionValue(session.surface),
    rep_number: run.runNumber,
    total_time_display: run.total,
    total_time_ms: run.totalMs,
    splits_json: JSON.stringify(splits),
    coach_note: run.note,
    synced_at: dateOnly(syncedAt),
  };
}

function buildSeasonRecordProperties({ contactId, athlete, session, performanceRecordCount, existing, sourceRecordId }) {
  const sessionDate = validDate(session.sessionDate) || new Date();
  const seasonYear = sessionDate.getFullYear();
  const recordName = `${athlete.name} - ${session.season} ${seasonYear}`;
  const existingProperties = recordProperties(existing);
  const seasonBests = updateSeasonBests({
    existingValue: existingProperties.season_bests_json,
    athlete,
    session,
    sourceSessionId: buildSourceSessionId(session),
    performanceRecordCount,
  });

  return {
    season_record: recordName,
    record_name: recordName,
    athlete_contact: contactId,
    athlete_name_snapshot: athlete.name,
    source_record_id: sourceRecordId,
    season: optionValue(session.season),
    season_year: seasonYear,
    sport: "track",
    primary_event: existingProperties.primary_event || "",
    practice_session_count: seasonBests.practiceSessionCount,
    performance_record_count: seasonBests.performanceRecordCount,
    meet_count: numberValue(existingProperties.meet_count),
    season_bests_json: JSON.stringify(seasonBests.summary),
    injury_flag: existingProperties.injury_flag || "No",
    coach_season_notes: existingProperties.coach_season_notes || "",
    last_calculated_at: dateOnly(new Date()),
  };
}

function updateSeasonBests({ existingValue, athlete, session, sourceSessionId, performanceRecordCount }) {
  const summary = parseJsonObject(existingValue);
  const sessions = Array.isArray(summary.sessions) ? summary.sessions : [];
  const sessionIds = sessions.map((item) => item && item.sourceSessionId).filter(Boolean);
  const isNewSession = sessionIds.indexOf(sourceSessionId) < 0;
  const previousPerformanceCount = Number(summary.performanceRecordCount) || 0;
  const fastestRun = fastestSavedRun(athlete.runs);
  const workoutKey = optionValue(session.workoutType) || "workout";
  const workoutBests = summary.practiceBestsByWorkoutType || {};
  const currentBest = workoutBests[workoutKey];

  if (fastestRun && (!currentBest || !Number(currentBest.ms) || fastestRun.totalMs < Number(currentBest.ms))) {
    workoutBests[workoutKey] = {
      workoutType: session.workoutType,
      ms: fastestRun.totalMs,
      display: fastestRun.total,
      sessionDate: dateOnly(validDate(session.sessionDate) || new Date()),
    };
  }

  if (isNewSession) {
    sessions.push({
      sourceSessionId,
      sessionDate: dateOnly(validDate(session.sessionDate) || new Date()),
      groupName: session.groupName,
      workoutType: session.workoutType,
      performanceRecordCount,
    });
  }

  summary.sessions = sessions.slice(-100);
  summary.practiceBestsByWorkoutType = workoutBests;
  summary.lastSession = {
    sourceSessionId,
    sessionDate: dateOnly(validDate(session.sessionDate) || new Date()),
    groupName: session.groupName,
    workoutType: session.workoutType,
    phase: session.phase,
    energySystem: session.energySystem,
    surface: session.surface,
  };
  summary.performanceRecordCount = previousPerformanceCount + performanceRecordCount;
  summary.practiceSessionCount = isNewSession ? sessions.length : sessions.length || 1;

  return {
    summary,
    performanceRecordCount: summary.performanceRecordCount,
    practiceSessionCount: summary.practiceSessionCount,
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

  if (!response.ok) {
    throw httpError(response.status, data.message || data.error || `GHL request failed with ${response.status}.`);
  }

  return data;
}

function buildTags(session) {
  return [
    "smartcoach-athlete",
    slugTag(session.season, "season"),
    slugTag(session.workoutType, "workout"),
    slugTag(session.phase, "phase"),
  ].filter(Boolean);
}

function buildSeasonSourceRecordId({ contactId, session }) {
  const sessionDate = validDate(session.sessionDate) || new Date();
  return `sr_${slugValue(contactId)}_${sessionDate.getFullYear()}_${optionValue(session.season) || "season"}`;
}

function buildSourceSessionId(session, dateValue) {
  const sessionDate = validDate(dateValue) || validDate(session.sessionDate) || new Date();
  const groupSlug = slugValue(session.groupName);
  const dateSlug = sessionDate.toISOString().slice(0, 10).replace(/-/g, "");
  return `sc_${dateSlug}_${groupSlug}`;
}

function buildNoteBody(session, athlete) {
  const dateLabel = Number.isNaN(session.sessionDate.getTime())
    ? new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : session.sessionDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const lines = [
    `SMARTCoach Session - ${dateLabel}`,
    `Group: ${session.groupName} | Season: ${session.season}`,
    `Phase: ${session.phase} | Type: ${session.workoutType}`,
    `Energy System: ${session.energySystem} | Surface: ${session.surface}`,
    "",
    `Athlete: ${athlete.name}`,
  ];

  athlete.runs.forEach((run) => {
    const lapText = run.laps.length
      ? ` | Laps: ${run.laps.map((lap) => lap.time).join(" / ")}`
      : "";
    const noteText = run.note ? ` | ${run.note}` : "";
    lines.push(`  Run ${run.runNumber}: ${run.total}${lapText}${noteText}`);
  });

  return lines.join("\n");
}

function slugTag(value, suffix) {
  const slug = slugValue(value);
  return slug ? `smartcoach-${slug}-${suffix}` : "";
}

function slugValue(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildAthleteId(name) {
  return `sca_${slugValue(name).replace(/-/g, "_") || "athlete"}`;
}

function existingCustomFieldValue(contact, fieldId) {
  const fields = Array.isArray(contact && contact.customFields) ? contact.customFields : [];
  const field = fields.find((item) => {
    if (!item) return false;
    return item.id === fieldId || item.fieldId === fieldId || item.field_id === fieldId;
  });
  if (!field) return "";
  const value = field.value || field.fieldValue || field.field_value;
  return value ? String(value) : "";
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

function recordProperties(record) {
  if (!record) return {};
  return record.properties || record.fields || record.customFields || {};
}

function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    return {};
  }
}

function fastestSavedRun(runs) {
  return runs.reduce((best, run) => {
    if (!run.totalMs) return best;
    if (!best || run.totalMs < best.totalMs) return run;
    return best;
  }, null);
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function optionValue(value) {
  return clean(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\+/g, "plus")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function energySystemValue(value) {
  const normalized = optionValue(value);
  if (normalized.indexOf("atp_pc") === 0) return "atp_pc";
  if (normalized.indexOf("glycolytic") === 0) return "glycolytic";
  if (normalized.indexOf("oxidative") === 0) return "oxidative";
  if (normalized.indexOf("mixed") === 0) return "mixed";
  return normalized;
}

function validDate(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return value;
}

function dateOnly(value) {
  const date = validDate(value) || new Date();
  return date.toISOString().slice(0, 10);
}

function clean(value) {
  return String(value || "").trim();
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return { message: text };
  }
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
