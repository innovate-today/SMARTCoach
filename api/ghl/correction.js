const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const PERFORMANCE_RECORD_SCHEMA_KEY = "custom_objects.performance_records";
const MEET_RESULT_SCHEMA_KEY = "custom_objects.meet_results";
const RECORD_SCHEMA_KEY = "custom_objects.records";
const { getGhlContext, requireProPlan } = require("../../lib/ghl-account");
const { attachRegistryAccount, setSmartTrakSecurityHeaders } = require("../../lib/smart-trak-request");
const FIELD_IDS = {
  performance_record: ["RCn9Xux9gRK3otwS1QzX"],
  meet_result: ["Khq47asHEk0tRieDVUBg"],
  source_record_id: ["9YD4n4y4aqf3VnkrwLL1", "3HVSAaItyvtLXYNasRAJ"],
  group_name: ["ochf7LkGhgAh5ySys5dA"],
  session_date: ["pl69ao2Pu76zeUKMEWpm"],
  meet_name: ["bCOXXRAtRqmCJnMZFLvB"],
  meet_date: ["rYZUhun2ynmK8MNsYgph"],
  event: ["Qtvff2zJpE2nu8qV6kAU"],
  result_display: ["Cu9h6mq2X6uPSQG6IraM"],
  result_ms: ["tqdu89hWLwfdiylZzxqj"],
  wind: ["sYR9reCyygQaHH3x88DR"],
  is_pr: ["XMvKfEECN6PCcA0TKwzN"],
  is_season_best: ["zO57s50B9sf62EPdoq7J"],
  coach_race_notes: ["84pkqVasLVDNye0XCVaH"],
  workout_type: ["jX0YLlpt08vxNKV3JyM5"],
  surface: ["ZMzx2xPdO3XxuzAvj84"],
  total_time_display: ["z9eZIcIL1B7yaeR5jXHI"],
  total_time_ms: ["tzmjjgk4FwJLfJDZ1KAc"],
  coach_note: ["Afy8b8lAbUoti9cCqa1m"],
};
const RECORD_FIELD_IDS = {
  record: ["ftIsXzZszu3s0cfJ55MU"],
  record_type: ["kFI5EuUMaWNNr1MWCRCC"],
  record_scope: ["csicg5cTEMH2il824CdN"],
  sport: ["NFlleoMtJlvlB1KAOqpR"],
  event: ["tCE1zz6sODLctaBJaBZD"],
  result_display: ["oECaYRLL3M0uczHeLVYC"],
  result_ms: ["WgDubsuUq1Ws9MqXAP4f"],
  athlete_contact: ["lgSfedW35TT44Nxgl7tY"],
  athlete_name_snapshot: ["OjTWebwJU389MGpccJ2b"],
  meet_name: ["8sjv8sNmaTJiCQIIJ952"],
  meet_result_id: ["2oFmwcjJZLPtIqJ5Nf9z"],
  record_date: ["lXHnJHTLrt0njYh0wIRX"],
  season_year: ["VasiHyN6NJt5Q28z15Oq"],
  is_current: ["Lxh59hEN9aOEBgOQCo7A"],
  record_notes: ["nn0km6vLhgz6K7V7lUe"],
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

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { token, locationId } = getGhlContext(req);

  if (!token || !locationId) {
    res.status(500).json({ error: "SMART Trak corrections are not configured on the server." });
    return;
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const action = clean(payload.action).toLowerCase();
    if (action !== "void" && action !== "edit") throw httpError(400, "Unsupported correction action.");

    const contactId = clean(payload.contactId);
    const recordId = clean(payload.recordId);
    const sourceRecordId = clean(payload.sourceRecordId);
    const athleteName = clean(payload.athleteName) || "Athlete";
    const reason = clean(payload.reason) || "No reason provided.";
    const recordType = clean(payload.recordType || payload.objectType).toLowerCase();
    const isMeetResult = recordType === "meet" || recordType === "meet_result";
    const schemaKey = isMeetResult ? MEET_RESULT_SCHEMA_KEY : PERFORMANCE_RECORD_SCHEMA_KEY;

    if (!contactId) throw httpError(400, "Missing athlete contact.");
    if (!recordId && !sourceRecordId) throw httpError(400, isMeetResult ? "Missing meet result." : "Missing performance record.");

    const record = recordId
      ? { id: recordId }
      : await findObjectRecord({ token, locationId, schemaKey, sourceRecordId });

    if (!record || !record.id) throw httpError(404, isMeetResult ? "Meet result was not found." : "Performance record was not found.");

    const props = recordId ? previousProps(payload.previous, isMeetResult ? "meet" : "training") : recordProperties(record);
    if (action === "edit") {
      if (isMeetResult) {
        const result = await editMeetResult({ token, locationId, contactId, athleteName, reason, record, props, payload });
        res.status(200).json(result);
        return;
      }
      const result = await editPerformanceRecord({ token, locationId, contactId, athleteName, reason, record, props, payload });
      res.status(200).json(result);
      return;
    }

    const previousNote = prop(props, isMeetResult ? "coach_race_notes" : "coach_note");
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
      path: objectRecordPath(schemaKey, record.id, locationId),
      method: "PUT",
      body: {
        properties: isMeetResult ? { coach_race_notes: nextNote } : { coach_note: nextNote },
      },
    });

    await addCorrectionNote({
      token,
      contactId,
      body: isMeetResult ? buildMeetVoidNote({
        athleteName,
        reason,
        correctionTime,
        record,
        props,
        sourceRecordId: sourceRecordId || prop(props, "source_record_id"),
      }) : buildVoidNote({
        athleteName,
        reason,
        correctionTime,
        record,
        props,
        sourceRecordId: sourceRecordId || prop(props, "source_record_id"),
      }),
    });

    res.status(200).json({ success: true, action: "voided", recordId: record.id, recordType: isMeetResult ? "meet" : "training" });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Correction failed." });
  }
};

async function editMeetResult({ token, locationId, contactId, athleteName, reason, record, props, payload }) {
  const updates = payload.updates && typeof payload.updates === "object" ? payload.updates : {};
  const previousNote = prop(props, "coach_race_notes");
  const previousValues = {
    meetName: prop(props, "meet_name"),
    meetDate: prop(props, "meet_date"),
    event: prop(props, "event"),
    resultDisplay: prop(props, "result_display"),
    wind: prop(props, "wind"),
    isPr: yesText(prop(props, "is_pr")) ? "Yes" : "No",
    isSeasonBest: yesText(prop(props, "is_season_best")) ? "Yes" : "No",
    notes: stripMeetSystemNoteLines(previousNote),
  };
  const nextValues = {
    meetName: clean(updates.meetName) || previousValues.meetName,
    meetDate: clean(updates.meetDate) || previousValues.meetDate,
    event: clean(updates.event) || previousValues.event,
    resultDisplay: clean(updates.resultDisplay) || previousValues.resultDisplay,
    wind: clean(updates.wind),
    isPr: clean(updates.isPr) ? yesText(updates.isPr) ? "Yes" : "No" : previousValues.isPr,
    isSeasonBest: clean(updates.isSeasonBest) ? yesText(updates.isSeasonBest) ? "Yes" : "No" : previousValues.isSeasonBest,
    notes: clean(updates.notes),
  };
  const changes = changedValues(previousValues, nextValues, {
    meetName: "Meet",
    meetDate: "Date",
    event: "Event",
    resultDisplay: "Result",
    wind: "Wind",
    isPr: "PB",
    isSeasonBest: "SB",
    notes: "Notes",
  });
  if (!changes.length) throw httpError(400, "No correction changes were provided.");

  const resultMs = nextValues.resultDisplay ? parseTimeToMs(nextValues.resultDisplay) : null;
  if (nextValues.resultDisplay && !resultMs) throw httpError(400, "Enter result like 58.2, 4:52.3, or 18:04.5.");

  const correctionTime = new Date().toISOString();
  const nextNote = replaceMeetNoteLines(previousNote, {
    Wind: nextValues.wind,
  }, nextValues.notes, correctionTime, reason);

  await ghlFetch({
    token,
    path: objectRecordPath(MEET_RESULT_SCHEMA_KEY, record.id, locationId),
    method: "PUT",
    body: {
      properties: {
        meet_name: nextValues.meetName,
        meet_date: nextValues.meetDate,
        event: nextValues.event,
        result_display: nextValues.resultDisplay,
        ...(resultMs ? { result_ms: resultMs } : {}),
        wind: nextValues.wind,
        is_pr: nextValues.isPr,
        is_season_best: nextValues.isSeasonBest,
        coach_race_notes: nextNote,
      },
    },
  });

  const linkedRecords = await updateLinkedMeetRecords({
    token,
    locationId,
    contactId,
    athleteName,
    record,
    props,
    nextValues,
    resultMs,
    correctionTime,
    reason,
  });

  await addCorrectionNote({
    token,
    contactId,
    body: buildMeetEditNote({
      athleteName,
      reason,
      correctionTime,
      record,
      props,
      sourceRecordId: clean(payload.sourceRecordId) || prop(props, "source_record_id"),
      changes,
    }),
  });

  return { success: true, action: "edited", recordType: "meet", recordId: record.id, changes, linkedRecords };
}

async function editPerformanceRecord({ token, locationId, contactId, athleteName, reason, record, props, payload }) {
  const updates = payload.updates && typeof payload.updates === "object" ? payload.updates : {};
  const previousNote = prop(props, "coach_note");
  const previousValues = {
    sessionDate: prop(props, "session_date"),
    workoutType: labelValue(prop(props, "workout_type")),
    surface: labelValue(prop(props, "surface")),
    time: prop(props, "total_time_display"),
    completedVolume: noteValue(previousNote, "Completed volume"),
    weather: noteValue(previousNote, "Weather"),
    notes: stripSystemNoteLines(previousNote),
  };
  const nextValues = {
    sessionDate: clean(updates.sessionDate) || previousValues.sessionDate,
    workoutType: clean(updates.workoutType) || previousValues.workoutType,
    surface: clean(updates.surface) || previousValues.surface,
    time: clean(updates.time) || previousValues.time,
    completedVolume: clean(updates.completedVolume) || previousValues.completedVolume,
    weather: clean(updates.weather),
    notes: clean(updates.notes),
  };
  const changes = changedValues(previousValues, nextValues);
  if (!changes.length) throw httpError(400, "No correction changes were provided.");
  const totalMs = nextValues.time && nextValues.time.toLowerCase() !== "untimed" ? parseTimeToMs(nextValues.time) : null;
  if (nextValues.time && nextValues.time.toLowerCase() !== "untimed" && !totalMs) {
    throw httpError(400, "Enter time like 36:20, 1:02:15, or 18:04.5.");
  }

  const correctionTime = new Date().toISOString();
  const nextNote = replaceNoteLines(previousNote, {
    "Completed volume": nextValues.completedVolume,
    Weather: nextValues.weather,
  }, nextValues.notes, correctionTime, reason);

  await ghlFetch({
    token,
    path: objectRecordPath(PERFORMANCE_RECORD_SCHEMA_KEY, record.id, locationId),
    method: "PUT",
    body: {
      properties: {
        session_date: nextValues.sessionDate,
        workout_type: workoutTypeValue(nextValues.workoutType),
        surface: optionValue(nextValues.surface),
        total_time_display: nextValues.time,
        ...(totalMs ? { total_time_ms: totalMs } : {}),
        coach_note: nextNote,
      },
    },
  });

  await addCorrectionNote({
    token,
    contactId,
    body: buildEditNote({
      athleteName,
      reason,
      correctionTime,
      record,
      props,
      sourceRecordId: clean(payload.sourceRecordId) || prop(props, "source_record_id"),
      changes,
    }),
  });

  return { success: true, action: "edited", recordId: record.id, changes };
}

async function addCorrectionNote({ token, contactId, body }) {
  await ghlFetch({
    token,
    path: `/contacts/${encodeURIComponent(contactId)}/notes`,
    method: "POST",
    body: { body },
  });
}

async function updateLinkedMeetRecords({ token, locationId, contactId, athleteName, record, props, nextValues, resultMs, correctionTime, reason }) {
  const linked = await findLinkedRecordEntries({
    token,
    locationId,
    contactId,
    meetResultId: record.id,
    previous: props,
    nextValues,
  });
  if (!linked.length) return { updated: 0, skipped: true };

  let updated = 0;
  for (const item of linked) {
    const recordProps = recordProperties(item);
    const type = labelValue(recordProp(recordProps, "record_type"));
    const normalizedType = optionValue(type);
    const isPersonalBest = normalizedType === "personal_best";
    const isSeasonBest = normalizedType === "season_best";
    const shouldRemainCurrent = isPersonalBest ? nextValues.isPr === "Yes" : isSeasonBest ? nextValues.isSeasonBest === "Yes" : yesText(recordProp(recordProps, "is_current"));
    const recordName = [athleteName, type || "Record", nextValues.event, nextValues.resultDisplay].filter(Boolean).join(" - ");
    const note = appendRecordCorrectionNote(recordProp(recordProps, "record_notes"), correctionTime, reason);

    await ghlFetch({
      token,
      path: objectRecordPath(RECORD_SCHEMA_KEY, item.id, locationId),
      method: "PUT",
      body: {
        properties: compactProperties({
          record: recordName,
          event: nextValues.event,
          result_display: nextValues.resultDisplay,
          ...(resultMs ? { result_ms: resultMs } : {}),
          athlete_contact: contactId,
          athlete_name_snapshot: athleteName,
          meet_name: nextValues.meetName,
          record_date: nextValues.meetDate,
          season_year: nextValues.meetDate ? Number(String(nextValues.meetDate).slice(0, 4)) || "" : "",
          is_current: shouldRemainCurrent ? "Yes" : "No",
          record_notes: note,
        }),
      },
    });
    updated += 1;
  }
  return { updated, skipped: false };
}

async function findLinkedRecordEntries({ token, locationId, contactId, meetResultId, previous, nextValues }) {
  const linked = [];
  for (const field of ["meet_result_id", "custom_objects.records.meet_result_id"].concat(RECORD_FIELD_IDS.meet_result_id || [])) {
    try {
      const result = await ghlFetch({
        token,
        path: `/objects/${encodeURIComponent(RECORD_SCHEMA_KEY)}/records/search`,
        method: "POST",
        body: {
          locationId,
          page: 1,
          pageLimit: 100,
          filters: [{ field, operator: "eq", value: meetResultId }],
        },
      });
      linked.push(...recordsFromResult(result));
    } catch (error) {
      if (error.statusCode && error.statusCode >= 500) throw error;
    }
  }

  if (!linked.length) {
    const all = await listRecordEntries({ token, locationId });
    linked.push(...all.filter((item) => recordMatchesMeetCorrection(item, { contactId, previous, nextValues })));
  }

  return uniqueRecords(linked).filter((item) => item && item.id);
}

async function listRecordEntries({ token, locationId }) {
  const records = [];
  for (let page = 1; page <= 5; page += 1) {
    const result = await ghlFetch({
      token,
      path: `/objects/${encodeURIComponent(RECORD_SCHEMA_KEY)}/records/search`,
      method: "POST",
      body: { locationId, page, pageLimit: 100 },
    });
    const batch = recordsFromResult(result);
    records.push(...batch);
    if (batch.length < 100) break;
  }
  return records;
}

function recordMatchesMeetCorrection(record, { contactId, previous, nextValues }) {
  const props = recordProperties(record);
  const athleteMatches = recordProp(props, "athlete_contact") === contactId;
  const meet = optionValue(recordProp(props, "meet_name"));
  const previousMeet = optionValue(prop(previous, "meet_name"));
  const nextMeet = optionValue(nextValues.meetName);
  const event = optionValue(recordProp(props, "event"));
  const previousEvent = optionValue(prop(previous, "event"));
  const nextEvent = optionValue(nextValues.event);
  const result = clean(recordProp(props, "result_display"));
  const previousResult = clean(prop(previous, "result_display"));
  const nextResult = clean(nextValues.resultDisplay);
  return athleteMatches
    && (!meet || meet === previousMeet || meet === nextMeet)
    && (!event || event === previousEvent || event === nextEvent)
    && (!result || result === previousResult || result === nextResult);
}

function appendRecordCorrectionNote(note, correctionTime, reason) {
  const base = clean(note);
  const line = `Correction Date: ${correctionTime}\nCorrection Reason: ${reason}`;
  return base.indexOf(line) >= 0 ? base : [base, line].filter(Boolean).join("\n");
}

function previousProps(previous, recordType) {
  const data = previous && typeof previous === "object" ? previous : {};
  if (recordType === "meet") {
    return {
      meet_result: clean(data.meetResult) || [clean(data.athleteName), clean(data.event), clean(data.resultDisplay)].filter(Boolean).join(" - "),
      source_record_id: clean(data.sourceRecordId),
      meet_name: clean(data.meetName),
      meet_date: clean(data.meetDate),
      event: clean(data.event),
      result_display: clean(data.resultDisplay),
      wind: clean(data.wind),
      is_pr: clean(data.isPr),
      is_season_best: clean(data.isSeasonBest),
      coach_race_notes: clean(data.coachRaceNotes || data.notes),
    };
  }
  return {
    performance_record: clean(data.performanceRecord) || [clean(data.athleteName), clean(data.workoutType)].filter(Boolean).join(" - "),
    source_record_id: clean(data.sourceRecordId),
    group_name: clean(data.groupName),
    session_date: clean(data.sessionDate),
    workout_type: clean(data.workoutType),
    surface: clean(data.surface),
    total_time_display: clean(data.time),
    coach_note: clean(data.coachNote || data.notes),
  };
}

function buildVoidNote({ athleteName, reason, correctionTime, record, props, sourceRecordId }) {
  return [
    `SMART Trak Correction - ${dateLabel(correctionTime)}`,
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

function buildMeetVoidNote({ athleteName, reason, correctionTime, record, props, sourceRecordId }) {
  return [
    `SMART Trak Correction - ${dateLabel(correctionTime)}`,
    "",
    `Athlete: ${athleteName}`,
    `Record: ${prop(props, "meet_result") || prop(props, "meet_name") || record.id}`,
    "Action: Voided",
    "",
    `Meet: ${prop(props, "meet_name") || ""}`,
    `Event: ${prop(props, "event") || ""}`,
    `Result: ${prop(props, "result_display") || ""}`,
    `Date: ${prop(props, "meet_date") || ""}`,
    sourceRecordId ? `Source Record ID: ${sourceRecordId}` : "",
    "",
    "Reason:",
    reason,
  ].filter((line) => line !== "").join("\n");
}

function buildEditNote({ athleteName, reason, correctionTime, record, props, sourceRecordId, changes }) {
  const lines = [
    `SMART Trak Correction - ${dateLabel(correctionTime)}`,
    "",
    `Athlete: ${athleteName}`,
    `Record: ${prop(props, "performance_record") || prop(props, "group_name") || record.id}`,
    "Action: Corrected",
    sourceRecordId ? `Source Record ID: ${sourceRecordId}` : "",
    "",
    "Changes:",
  ];
  changes.forEach((change) => {
    lines.push(`${change.label}:`);
    lines.push(`Previous: ${change.from || "blank"}`);
    lines.push(`New: ${change.to || "blank"}`);
  });
  lines.push("", "Reason:", reason);
  return lines.filter((line) => line !== "").join("\n");
}

function buildMeetEditNote({ athleteName, reason, correctionTime, record, props, sourceRecordId, changes }) {
  const lines = [
    `SMART Trak Correction - ${dateLabel(correctionTime)}`,
    "",
    `Athlete: ${athleteName}`,
    `Record: ${prop(props, "meet_result") || prop(props, "meet_name") || record.id}`,
    "Action: Corrected",
    sourceRecordId ? `Source Record ID: ${sourceRecordId}` : "",
    "",
    "Changes:",
  ];
  changes.forEach((change) => {
    lines.push(`${change.label}:`);
    lines.push(`Previous: ${change.from || "blank"}`);
    lines.push(`New: ${change.to || "blank"}`);
  });
  lines.push("", "Reason:", reason);
  return lines.filter((line) => line !== "").join("\n");
}

function changedValues(previousValues, nextValues, customLabels) {
  const labels = customLabels || {
    sessionDate: "Date",
    workoutType: "Workout Type",
    surface: "Surface",
    time: "Time",
    completedVolume: "Completed Volume",
    weather: "Weather",
    notes: "Notes",
  };
  return Object.keys(labels).reduce((changes, key) => {
    if (clean(previousValues[key]) !== clean(nextValues[key])) {
      changes.push({ key, label: labels[key], from: clean(previousValues[key]), to: clean(nextValues[key]) });
    }
    return changes;
  }, []);
}

function replaceNoteLines(note, labeledValues, notes, correctionTime, reason) {
  const used = {};
  const lines = clean(note).split(/\r?\n/).filter((line) => !isCorrectionLine(line));
  const nextLines = lines.map((line) => {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (!match) return line;
    const key = Object.keys(labeledValues).find((label) => label.toLowerCase() === match[1].trim().toLowerCase());
    if (!key) return line;
    used[key] = true;
    return labeledValues[key] ? `${key}: ${labeledValues[key]}` : "";
  }).filter(Boolean);

  Object.keys(labeledValues).forEach((label) => {
    if (!used[label] && labeledValues[label]) nextLines.unshift(`${label}: ${labeledValues[label]}`);
  });
  if (notes) nextLines.push(notes);
  nextLines.push(`Correction Date: ${correctionTime}`);
  nextLines.push(`Correction Reason: ${reason}`);
  return nextLines.join("\n");
}

function replaceMeetNoteLines(note, labeledValues, notes, correctionTime, reason) {
  const nextLines = clean(note).split(/\r?\n/).filter((line) => {
    if (isCorrectionLine(line)) return false;
    return !/^Wind:/i.test(line.trim());
  });
  Object.keys(labeledValues).forEach((label) => {
    if (labeledValues[label]) nextLines.unshift(`${label}: ${labeledValues[label]}`);
  });
  if (notes) nextLines.push(notes);
  nextLines.push(`Correction Date: ${correctionTime}`);
  nextLines.push(`Correction Reason: ${reason}`);
  return nextLines.filter(Boolean).join("\n");
}

function stripSystemNoteLines(note) {
  return clean(note).split(/\r?\n/).filter((line) => {
    if (isCorrectionLine(line)) return false;
    return !/^(Completed volume|Weather):/i.test(line.trim());
  }).join("\n");
}

function stripMeetSystemNoteLines(note) {
  return clean(note).split(/\r?\n/).filter((line) => {
    if (isCorrectionLine(line)) return false;
    return !/^Wind:/i.test(line.trim());
  }).join("\n");
}

function isCorrectionLine(line) {
  return /^(SMARTCoach Status|Correction Date|Correction Reason):/i.test(clean(line));
}

function noteValue(note, label) {
  const prefix = `${label}:`;
  const line = clean(note).split(/\r?\n/).find((item) => item.trim().toLowerCase().startsWith(prefix.toLowerCase()));
  return line ? clean(line.slice(prefix.length)) : "";
}

function parseTimeToMs(value) {
  const text = clean(value).toLowerCase().replace(/s$/, "");
  const wordMatch = text.match(/(?:(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|hr|h))?\s*(?:(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|min|m))?\s*(?:(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|sec|s))?/);
  if (wordMatch && (wordMatch[1] || wordMatch[2] || wordMatch[3])) {
    const seconds = (Number(wordMatch[1]) || 0) * 3600 + (Number(wordMatch[2]) || 0) * 60 + (Number(wordMatch[3]) || 0);
    return seconds > 0 ? Math.round(seconds * 1000) : null;
  }
  const parts = text.split(":").map((part) => part.trim());
  if (!parts.length || parts.length > 3) return null;
  if (parts.some((part) => part === "" || Number.isNaN(Number(part)))) return null;
  let seconds = 0;
  if (parts.length === 1) seconds = Number(parts[0]);
  if (parts.length === 2) seconds = Number(parts[0]) * 60 + Number(parts[1]);
  if (parts.length === 3) seconds = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.round(seconds * 1000);
}

async function getObjectRecord({ token, locationId, schemaKey, recordId }) {
  const result = await ghlFetch({
    token,
    path: objectRecordPath(schemaKey, recordId, locationId),
    method: "GET",
  });
  return result.record || result;
}

function objectRecordPath(schemaKey, recordId, locationId) {
  return `/objects/${encodeURIComponent(schemaKey)}/records/${encodeURIComponent(recordId)}?locationId=${encodeURIComponent(locationId)}`;
}

async function findObjectRecord({ token, locationId, schemaKey, sourceRecordId }) {
  const fields = schemaKey === MEET_RESULT_SCHEMA_KEY
    ? ["3HVSAaItyvtLXYNasRAJ", "custom_objects.meet_results.source_record_id", "source_record_id"]
    : ["9YD4n4y4aqf3VnkrwLL1", "custom_objects.performance_records.source_record_id", "source_record_id"];
  for (const field of fields) {
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
              field,
              operator: "eq",
              value: sourceRecordId,
            },
          ],
        },
      });
      const record = firstRecord(result);
      if (record) return record;
    } catch (error) {
      if (error.statusCode && error.statusCode >= 500) throw error;
    }
  }
  return null;
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
    const key = (record && record.id) || recordProp(props, "source_record_id") || JSON.stringify(props);
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function recordProperties(record) {
  return (record && (record.properties || record.fields || record.customFields)) || {};
}

function recordProp(props, key) {
  const keys = [key, `custom_objects.records.${key}`].concat(RECORD_FIELD_IDS[key] || []);
  if (Array.isArray(props)) {
    for (const item of keys) {
      const field = props.find((fieldItem) => fieldItem && (fieldItem.key === item || fieldItem.id === item || fieldItem.fieldKey === item || fieldItem.fieldId === item || fieldItem.customFieldId === item));
      if (field) {
        const value = readRecordPropValue(field.value || field.fieldValue || field.field_value);
        if (value !== "") return value;
      }
    }
    return "";
  }
  for (const item of keys) {
    const value = readRecordPropValue(props && props[item]);
    if (value !== "") return value;
  }
  return "";
}

function prop(props, key) {
  const keys = [key, `custom_objects.performance_records.${key}`, `custom_objects.meet_results.${key}`].concat(FIELD_IDS[key] || []);
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

function readRecordPropValue(raw) {
  if (raw === undefined || raw === null) return "";
  if (Array.isArray(raw)) return raw.map(readRecordPropValue).filter(Boolean).join(", ");
  if (typeof raw === "object") return clean(raw.value || raw.fieldValue || raw.field_value || raw.name || raw.label || raw.text || raw.displayValue || raw.display_value);
  return clean(raw);
}

function compactProperties(properties) {
  return Object.keys(properties).reduce((cleaned, key) => {
    const value = properties[key];
    if (value === "" || value === null || typeof value === "undefined") return cleaned;
    cleaned[key] = value;
    return cleaned;
  }, {});
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-SMARTCoach-Account, X-SMARTCoach-Access-Code, X-SMARTCoach-Session");
}

function dateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
}

function optionValue(value) {
  return clean(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\+/g, "plus")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function workoutTypeValue(value) {
  const normalized = optionValue(value);
  const aliases = {
    easy: "easy_recovery_run",
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

function labelValue(value) {
  if (!value || typeof value !== "object") return clean(value);
  return clean(value.label || value.name || value.value || value.fieldValue || value.field_value);
}

function yesText(value) {
  return /^(yes|true|1|on|pb|sb)$/i.test(clean(value));
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
