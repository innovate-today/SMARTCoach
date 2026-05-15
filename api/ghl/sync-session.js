const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const PERFORMANCE_RECORD_SCHEMA_KEY = "custom_objects.performance_records";
const SEASON_RECORD_SCHEMA_KEY = "custom_objects.season_records";
const TRAINING_PLAN_DAY_SCHEMA_KEY = "custom_objects.training_plan_days";
const SMARTCOACH_ACTIVE_FIELD_ID = "xepTMFvtaTwFdLVrOeQH";
const SMARTCOACH_ATHLETE_ID_FIELD_ID = "Vi7fmpkblrGZqZFyNBI2";
const { getGhlContext, requireProPlan } = require("../../lib/ghl-account");

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (!requireProPlan(req, res)) return;

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { token, locationId } = getGhlContext(req);

  if (!token || !locationId) {
    res.status(500).json({ error: "GHL sync is not configured on the server." });
    return;
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const session = normalizeSession(payload);
    const synced = [];
    const linkedPerformanceRecords = [];

    for (const athlete of session.athletes) {
      const contact = await findOrCreateContact({ token, locationId, athlete, session });
      if (!session.forceDuplicateSync) {
        const duplicates = await findDuplicatePerformanceRecords({ token, locationId, contactId: contact.id, athlete, session });
        if (duplicates.length) {
          throw httpError(409, "This workout appears to have already been synced.", {
            code: "DUPLICATE_SYNC",
            duplicates,
          });
        }
      }
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
      performanceRecords.forEach((record) => {
        linkedPerformanceRecords.push({
          athlete: athlete.name,
          runNumber: record.runNumber,
          recordId: record.recordId,
          sourceRecordId: record.sourceRecordId,
          trainingPlanId: athlete.trainingPlanId || session.trainingPlanId,
          trainingPlanTitle: athlete.trainingPlanTitle || session.trainingPlanTitle,
          trainingPlanDayId: athlete.trainingPlanDayId || session.trainingPlanDayId,
          trainingPlanDayTitle: athlete.trainingPlanDayTitle || session.trainingPlanDayTitle,
        });
      });
      synced.push({ runnerId: athlete.runnerId, athlete: athlete.name, contactId: contact.id, performanceRecords, seasonRecord });
    }

    const planDayUpdate = await updateLinkedTrainingPlanDay({
      token,
      locationId,
      session,
      linkedPerformanceRecords,
    });

    res.status(200).json({ success: true, synced, planDayUpdate });
  } catch (error) {
    const body = { error: error.message || "GHL sync failed." };
    if (error.code) body.code = error.code;
    if (error.duplicates) body.duplicates = error.duplicates;
    res.status(error.statusCode || 500).json(body);
  }
};

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-SMARTCoach-Account");
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
    energySystem: clean(payload.energySystem),
    surface: clean(payload.surface) || "Unspecified",
    weather: clean(payload.weather),
    completedVolume: clean(payload.completedVolume),
    sessionDate: payload.sessionDate ? new Date(payload.sessionDate) : new Date(),
    forceDuplicateSync: payload.forceDuplicateSync === true,
    trainingPlanId: clean(payload.trainingPlanId),
    trainingPlanSourceId: clean(payload.trainingPlanSourceId),
    trainingPlanTitle: clean(payload.trainingPlanTitle),
    trainingPlanDayId: clean(payload.trainingPlanDayId),
    trainingPlanDaySourceId: clean(payload.trainingPlanDaySourceId),
    trainingPlanDayTitle: clean(payload.trainingPlanDayTitle),
    athletes,
  };
}

function normalizeAthlete(raw) {
  return {
    runnerId: clean(raw && raw.runnerId),
    name: clean(raw && raw.name),
    contactId: clean(raw && raw.contactId),
    smartcoachAthleteId: clean(raw && raw.smartcoachAthleteId),
    trainingPlanId: clean(raw && raw.trainingPlanId),
    trainingPlanSourceId: clean(raw && raw.trainingPlanSourceId),
    trainingPlanTitle: clean(raw && raw.trainingPlanTitle),
    trainingPlanDayId: clean(raw && raw.trainingPlanDayId),
    trainingPlanDaySourceId: clean(raw && raw.trainingPlanDaySourceId),
    trainingPlanDayTitle: clean(raw && raw.trainingPlanDayTitle),
    trainingPlanPhase: clean(raw && raw.trainingPlanPhase),
    trainingPlanDayWorkoutType: clean(raw && raw.trainingPlanDayWorkoutType),
    plannedTargetRange: clean(raw && raw.plannedTargetRange),
    plannedTargetMinMs: Number(raw && raw.plannedTargetMinMs) || null,
    plannedTargetMaxMs: Number(raw && raw.plannedTargetMaxMs) || null,
    plannedTargetRep: clean(raw && raw.plannedTargetRep),
    plannedVolume: clean(raw && raw.plannedVolume),
    currentFitnessEvent: clean(raw && raw.currentFitnessEvent),
    currentFitnessDisplay: clean(raw && raw.currentFitnessDisplay),
    plannedEffortPercent: clean(raw && raw.plannedEffortPercent),
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
          kind: clean(lap && lap.kind),
          label: clean(lap && lap.label),
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
  const forceSuffix = session.forceDuplicateSync ? `resync_${Date.now()}` : "";

  for (const run of athlete.runs) {
    const properties = preparePerformanceRecordProperties(buildPerformanceRecordProperties({
      locationId,
      contactId,
      athlete,
      session,
      run,
    }), forceSuffix);

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

async function findDuplicatePerformanceRecords({ token, locationId, contactId, athlete, session }) {
  const duplicates = [];

  for (const run of athlete.runs) {
    const properties = buildPerformanceRecordProperties({
      locationId,
      contactId,
      athlete,
      session,
      run,
    });
    const existing = await findObjectRecord({
      token,
      locationId,
      schemaKey: PERFORMANCE_RECORD_SCHEMA_KEY,
      sourceRecordId: properties.source_record_id,
    });

    if (existing) {
      duplicates.push({
        athlete: athlete.name,
        runNumber: run.runNumber,
        sourceRecordId: properties.source_record_id,
        recordId: existing.id || null,
      });
    }
  }

  return duplicates;
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
  return findObjectRecord({
    token,
    locationId,
    schemaKey: SEASON_RECORD_SCHEMA_KEY,
    sourceRecordId,
  });
}

async function updateLinkedTrainingPlanDay({ token, locationId, session, linkedPerformanceRecords }) {
  if (!linkedPerformanceRecords.length) return null;
  const groups = linkedPerformanceRecords.reduce((grouped, record) => {
    const dayId = clean(record.trainingPlanDayId || session.trainingPlanDayId);
    if (!dayId) return grouped;
    if (!grouped[dayId]) grouped[dayId] = [];
    grouped[dayId].push(record);
    return grouped;
  }, {});
  const dayIds = Object.keys(groups);
  if (!dayIds.length) return null;
  const updates = [];

  for (const dayId of dayIds) {
    const records = groups[dayId];
    const first = records[0] || {};
    const linkedText = records.map((record) => {
      return [
        record.athlete,
        `Run ${record.runNumber}`,
        record.recordId || record.sourceRecordId,
      ].filter(Boolean).join(" - ");
    }).join("\n");

    try {
      const updated = await ghlFetch({
        token,
        path: `/objects/${encodeURIComponent(TRAINING_PLAN_DAY_SCHEMA_KEY)}/records/${encodeURIComponent(dayId)}`,
        method: "PUT",
        body: {
          locationId,
          properties: {
            status: "completed",
            linked_performance_record_ids: linkedText,
            coach_notes: [
              `Completed from SMARTCoach on ${dateOnly(validDate(session.sessionDate) || new Date())}.`,
              (first.trainingPlanTitle || session.trainingPlanTitle) ? `Plan: ${first.trainingPlanTitle || session.trainingPlanTitle}` : "",
              (first.trainingPlanDayTitle || session.trainingPlanDayTitle) ? `Workout: ${first.trainingPlanDayTitle || session.trainingPlanDayTitle}` : "",
            ].filter(Boolean).join("\n"),
          },
        },
      });

      updates.push({
        action: "updated",
        recordId: updated.id || (updated.record && updated.record.id) || dayId,
      });
    } catch (error) {
      updates.push({
        action: "skipped",
        recordId: dayId,
        reason: error.message || "Training plan day update failed.",
      });
    }
  }

  if (updates.length === 1) return updates[0];
  return { action: updates.some((item) => item.action === "skipped") ? "partial" : "updated", updates };
}

async function findObjectRecord({ token, locationId, schemaKey, sourceRecordId }) {
  try {
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
  const workoutType = athlete.trainingPlanDayWorkoutType || session.workoutType;
  const phase = athlete.trainingPlanPhase || session.phase;
  const recordName = `${athlete.name} - ${workoutType} - Run ${run.runNumber}`;
  const splits = run.laps.map((lap, index) => ({
    lap: index + 1,
    ms: lap.ms,
    time: lap.time,
    kind: lap.kind,
    label: lap.label,
  }));

  return {
    performance_record: recordName,
    athlete_contact: contactId,
    athlete_name_snapshot: athlete.name,
    source_session_id: sourceSessionId,
    source_record_id: sourceRecordId,
    group_name: session.groupName,
    session_date: dateOnly(sessionDate),
    season: optionValue(session.season),
    phase: phaseValue(phase),
    workout_type: workoutTypeValue(workoutType),
    ...(session.energySystem ? { energy_system: energySystemValue(session.energySystem) } : {}),
    surface: optionValue(session.surface),
    rep_number: run.runNumber,
    total_time_display: run.total,
    ...(run.totalMs ? { total_time_ms: run.totalMs } : {}),
    splits_json: formatLapSplits(splits).join("\n"),
    coach_note: formatCoachNote({ run, session, athlete }),
    synced_at: dateOnly(syncedAt),
  };
}

function formatCoachNote({ run, session, athlete }) {
  const workout = clean(athlete && (athlete.plannedTargetRep || athlete.trainingPlanDayTitle) || session.trainingPlanDayTitle);
  const targetLines = plannedActualLines({ run, athlete });
  return [
    session.weather ? `Weather: ${session.weather}` : "",
    session.completedVolume ? `Completed volume: ${session.completedVolume}` : "",
    athlete && athlete.plannedVolume ? `Planned volume: ${athlete.plannedVolume}` : "",
    workout ? `Workout: ${workout}` : "",
    ...targetLines,
    run.note,
  ].filter(Boolean).join("\n");
}

function plannedActualLines({ run, athlete }) {
  if (!athlete || !athlete.plannedTargetRange) return [];
  const lines = [
    `Planned target: ${athlete.plannedTargetRange}`,
    `Actual: ${run.total}`,
  ];
  const diff = plannedActualDifference(run.totalMs, athlete.plannedTargetMinMs, athlete.plannedTargetMaxMs);
  if (diff) lines.push(`Difference: ${diff}`);
  if (athlete.currentFitnessEvent || athlete.currentFitnessDisplay) {
    lines.push(`Current fitness: ${[athlete.currentFitnessEvent, athlete.currentFitnessDisplay].filter(Boolean).join(" ")}`);
  }
  if (athlete.plannedEffortPercent) lines.push(`Planned effort: ${athlete.plannedEffortPercent}`);
  return lines;
}

function plannedActualDifference(actualMs, minMs, maxMs) {
  if (!actualMs || !minMs || !maxMs) return "";
  if (actualMs < minMs) return `${formatSignedDuration(actualMs - minMs)} faster than target`;
  if (actualMs > maxMs) return `${formatSignedDuration(actualMs - maxMs)} slower than target`;
  return "within target";
}

function formatSignedDuration(ms) {
  const sign = ms > 0 ? "+" : "-";
  const absolute = Math.abs(ms);
  const seconds = absolute / 1000;
  if (seconds < 60) return `${sign}${seconds.toFixed(1)} sec`;
  const minutes = Math.floor(seconds / 60);
  const remainder = (seconds - minutes * 60).toFixed(1).padStart(4, "0");
  return `${sign}${minutes}:${remainder}`;
}

function preparePerformanceRecordProperties(properties, forceSuffix) {
  if (!forceSuffix) return properties;
  return {
    ...properties,
    performance_record: `${properties.performance_record} (Resync)`,
    source_record_id: `${properties.source_record_id}_${forceSuffix}`,
  };
}

function buildSeasonRecordProperties({ contactId, athlete, session, performanceRecordCount, existing, sourceRecordId }) {
  const sessionDate = validDate(session.sessionDate) || new Date();
  const seasonYear = sessionDate.getFullYear();
  const recordName = `${athlete.name} - ${session.season} ${seasonYear}`;
  const existingProperties = recordProperties(existing);
  const seasonBests = updateSeasonBests({
    existingValue: existingProperties.season_bests_json,
    existingProperties,
    athlete,
    session,
    sourceSessionId: buildSourceSessionId(session),
    performanceRecordCount,
  });

  return {
    season_record: recordName,
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
    season_bests_json: formatSeasonBestsForField(seasonBests.summary),
    injury_flag: existingProperties.injury_flag || "No",
    coach_season_notes: existingProperties.coach_season_notes || "",
    last_calculated_at: dateOnly(new Date()),
  };
}

function updateSeasonBests({ existingValue, existingProperties, athlete, session, sourceSessionId, performanceRecordCount }) {
  const parsedSummary = parseJsonObject(existingValue);
  const summary = Object.keys(parsedSummary).length ? parsedSummary : parseReadableSeasonBests(existingValue);
  const sessions = Array.isArray(summary.sessions) ? summary.sessions : [];
  const sessionIds = sessions.map((item) => item && item.sourceSessionId).filter(Boolean);
  const isNewSession = sessionIds.indexOf(sourceSessionId) < 0;
  const previousPerformanceCount = numberValue(existingProperties && existingProperties.performance_record_count) || Number(summary.performanceRecordCount) || 0;
  const previousPracticeSessionCount = numberValue(existingProperties && existingProperties.practice_session_count) || Number(summary.practiceSessionCount) || 0;
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
    surface: session.surface,
    weather: session.weather,
  };
  summary.performanceRecordCount = previousPerformanceCount + performanceRecordCount;
  summary.practiceSessionCount = isNewSession ? previousPracticeSessionCount + 1 : previousPracticeSessionCount || sessions.length || 1;

  return {
    summary,
    performanceRecordCount: summary.performanceRecordCount,
    practiceSessionCount: summary.practiceSessionCount,
  };
}

function formatLapSplits(splits) {
  if (!Array.isArray(splits)) return [];
  return splits
    .map((split, index) => {
      const time = clean(split && split.time);
      if (!time) return "";
      const lap = Number(split && split.lap) || index + 1;
      const label = clean(split && split.label) || `Lap ${lap}`;
      return `${label}: ${time}`;
    })
    .filter(Boolean);
}

function formatSeasonBestsForField(summary) {
  const lines = [
    `Practice Sessions: ${Number(summary && summary.practiceSessionCount) || 0}`,
    `Performance Records: ${Number(summary && summary.performanceRecordCount) || 0}`,
  ];

  if (summary && summary.lastSession) {
    lines.push("");
    lines.push("Last Session:");
    lines.push(`${summary.lastSession.sessionDate || ""} - ${summary.lastSession.groupName || ""} - ${summary.lastSession.workoutType || ""}`.replace(/\s+-\s+$/g, ""));
  }

  const bests = summary && summary.practiceBestsByWorkoutType ? Object.keys(summary.practiceBestsByWorkoutType) : [];
  if (bests.length) {
    lines.push("");
    lines.push("Practice Bests:");
    bests.sort().forEach((key) => {
      const best = summary.practiceBestsByWorkoutType[key] || {};
      lines.push(`${best.workoutType || key}: ${best.display || ""}${best.sessionDate ? ` (${best.sessionDate})` : ""}`);
    });
  }

  const meetBests = summary && summary.meetBestsByEvent ? Object.keys(summary.meetBestsByEvent) : [];
  if (meetBests.length) {
    lines.push("");
    lines.push("Best Meet Results:");
    meetBests.sort().forEach((key) => {
      const best = summary.meetBestsByEvent[key] || {};
      lines.push(`${best.event || key}: ${best.display || ""}${best.meetName ? ` - ${best.meetName}` : ""}${best.meetDate ? ` (${best.meetDate})` : ""}`);
    });
  }

  const sessions = Array.isArray(summary && summary.sessions) ? summary.sessions.slice(-5) : [];
  if (sessions.length) {
    lines.push("");
    lines.push("Recent Sessions:");
    sessions.forEach((session) => {
      lines.push(`${session.sessionDate || ""} - ${session.groupName || ""} - ${session.workoutType || ""} - ${Number(session.performanceRecordCount) || 0} records`);
    });
  }

  const meets = Array.isArray(summary && summary.recentMeets) ? summary.recentMeets.slice(-5) : [];
  if (meets.length) {
    lines.push("");
    lines.push("Recent Meets:");
    meets.forEach((meet) => {
      lines.push(`${meet.meetDate || ""} - ${meet.meetName || ""} - ${meet.event || ""} - ${meet.resultDisplay || ""}`);
    });
  }

  return lines.join("\n");
}

function parseReadableSeasonBests(value) {
  const text = clean(value);
  const summary = {};
  if (!text) return summary;

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let section = "";
  lines.forEach((line) => {
    if (line === "Practice Bests:" || line === "Best Meet Results:" || line === "Recent Sessions:" || line === "Recent Meets:" || line === "Last Session:") {
      section = line.replace(/:$/, "");
      return;
    }

    const countMatch = line.match(/^(Practice Sessions|Performance Records):\s*(\d+)/i);
    if (countMatch) {
      if (/Practice Sessions/i.test(countMatch[1])) summary.practiceSessionCount = Number(countMatch[2]) || 0;
      if (/Performance Records/i.test(countMatch[1])) summary.performanceRecordCount = Number(countMatch[2]) || 0;
      return;
    }

    if (section === "Practice Bests") {
      const bestMatch = line.match(/^(.+?):\s*(.+?)(?:\s*\((\d{4}-\d{2}-\d{2})\))?$/);
      if (!bestMatch) return;
      const workoutType = bestMatch[1].trim();
      const display = bestMatch[2].trim();
      const key = optionValue(workoutType) || "workout";
      if (!summary.practiceBestsByWorkoutType) summary.practiceBestsByWorkoutType = {};
      summary.practiceBestsByWorkoutType[key] = {
        workoutType,
        ms: parseTimeToMs(display),
        display,
        sessionDate: bestMatch[3] || "",
      };
    }

    if (section === "Best Meet Results") {
      const bestMatch = line.match(/^(.+?):\s*(.+?)(?:\s+-\s+(.+?))?(?:\s*\((\d{4}-\d{2}-\d{2})\))?$/);
      if (!bestMatch) return;
      const event = bestMatch[1].trim();
      const display = bestMatch[2].trim();
      const key = optionValue(event) || "event";
      if (!summary.meetBestsByEvent) summary.meetBestsByEvent = {};
      summary.meetBestsByEvent[key] = {
        event,
        display,
        ms: parseTimeToMs(display),
        meetName: (bestMatch[3] || "").trim(),
        meetDate: bestMatch[4] || "",
      };
    }

    if (section === "Recent Meets") {
      const parts = line.split(" - ").map((part) => part.trim());
      if (parts.length < 4) return;
      if (!summary.recentMeets) summary.recentMeets = [];
      summary.recentMeets.push({
        meetDate: parts[0],
        meetName: parts[1],
        event: parts[2],
        resultDisplay: parts.slice(3).join(" - "),
      });
    }
  });

  return summary;
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
  return ["smartcoach-athlete"];
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
    `Type: ${session.workoutType}`,
    `Surface: ${session.surface}${session.weather ? ` | Weather: ${session.weather}` : ""}`,
  ];

  const planTitle = athlete.trainingPlanTitle || session.trainingPlanTitle;
  const planDayTitle = athlete.trainingPlanDayTitle || session.trainingPlanDayTitle;
  if (planTitle || planDayTitle) {
    lines.push(`Plan: ${planTitle || "Selected Training Plan"}`);
    if (planDayTitle) lines.push(`Scheduled Workout: ${planDayTitle}`);
  }
  if (session.completedVolume) lines.push(`Completed volume: ${session.completedVolume}`);
  if (athlete.plannedVolume) lines.push(`Planned volume: ${athlete.plannedVolume}`);

  lines.push("", `Athlete: ${athlete.name}`);

  athlete.runs.forEach((run) => {
    const lapText = run.laps.length
      ? ` | Laps: ${run.laps.map((lap) => lap.time).join(" / ")}`
      : "";
    const noteText = run.note ? ` | ${run.note}` : "";
    lines.push(`  Run ${run.runNumber}: ${run.total}${lapText}${noteText}`);
    const targetLines = plannedActualLines({ run, athlete });
    targetLines.forEach((line) => lines.push(`    ${line}`));
  });

  return lines.join("\n");
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

function parseTimeToMs(value) {
  const text = clean(value).toLowerCase().replace(/s$/, "");
  const parts = text.split(":").map((part) => part.trim());
  if (!parts.length || parts.some((part) => part === "" || Number.isNaN(Number(part)))) return null;
  if (parts.length === 1) return Math.round(Number(parts[0]) * 1000);
  if (parts.length === 2) return Math.round((Number(parts[0]) * 60 + Number(parts[1])) * 1000);
  if (parts.length === 3) return Math.round((Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2])) * 1000);
  return null;
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
  if (normalized.indexOf("glycolytic") === 0) return "glycolytic_anaerobic";
  if (normalized.indexOf("oxidative") === 0) return "oxidative_aerobic";
  if (normalized.indexOf("mixed") === 0) return "mixed";
  return normalized;
}

function phaseValue(value) {
  const normalized = optionValue(value);
  const aliases = {
    general_prep: "gpp",
    gpp: "gpp",
    specific_prep: "spp",
    track_prep: "spp",
    spp: "spp",
    pre_competition: "pre_competition",
    competition: "competition",
    track_season: "competition",
    recovery: "transition",
    transition: "transition",
  };
  return aliases[normalized] || "gpp";
}

function workoutTypeValue(value) {
  const normalized = optionValue(value);
  const aliases = {
    easy_run: "easy_recovery_run",
    recovery_run: "easy_recovery_run",
    tempo_run: "extensive_tempo",
    warmup_cooldown: "easy_recovery_run",
    warm_up_cool_down: "easy_recovery_run",
    speed_endurance_i: "speed_endurance_1",
    speed_endurance_ii: "speed_endurance_2",
    special_endurance_i: "special_endurance_1",
    special_endurance_ii: "special_endurance_2",
  };
  return aliases[normalized] || normalized;
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

function httpError(statusCode, message, details) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (details && details.code) error.code = details.code;
  if (details && details.duplicates) error.duplicates = details.duplicates;
  return error;
}
