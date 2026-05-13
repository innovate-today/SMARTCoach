const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const PERFORMANCE_RECORD_SCHEMA_KEY = "custom_objects.performance_records";
const { getGhlContext } = require("./account");
const FIELD_IDS = {
  performance_record: ["RCn9Xux9gRK3otwS1QzX"],
  source_record_id: ["9YD4n4y4aqf3VnkrwLL1"],
  group_name: ["ochf7LkGhgAh5ySys5dA"],
  session_date: ["pl69ao2Pu76zeUKMEWpm"],
  workout_type: ["jX0YLlpt08vxNKV3JyM5"],
  surface: ["ZMzx2xPdO3XxuzAvj84"],
  total_time_display: ["z9eZIcIL1B7yaeR5jXHI"],
  total_time_ms: ["tzmjjgk4FwJLfJDZ1KAc"],
  coach_note: ["Afy8b8lAbUoti9cCqa1m"],
};

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

  const { token, locationId } = getGhlContext(req);

  if (!token || !locationId) {
    res.status(500).json({ error: "SMARTCoach Pro corrections are not configured on the server." });
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

    if (!contactId) throw httpError(400, "Missing athlete contact.");
    if (!recordId && !sourceRecordId) throw httpError(400, "Missing performance record.");

    const record = recordId
      ? { id: recordId }
      : await findObjectRecord({ token, locationId, schemaKey: PERFORMANCE_RECORD_SCHEMA_KEY, sourceRecordId });

    if (!record || !record.id) throw httpError(404, "Performance record was not found.");

    const props = recordId ? previousProps(payload.previous) : recordProperties(record);
    if (action === "edit") {
      const result = await editPerformanceRecord({ token, locationId, contactId, athleteName, reason, record, props, payload });
      res.status(200).json(result);
      return;
    }

    const previousNote = prop(props, "coach_note");
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
      path: objectRecordPath(PERFORMANCE_RECORD_SCHEMA_KEY, record.id, locationId),
      method: "PUT",
      body: {
        properties: {
          coach_note: nextNote,
        },
      },
    });

    await addCorrectionNote({
      token,
      contactId,
      body: buildVoidNote({
        athleteName,
        reason,
        correctionTime,
        record,
        props,
        sourceRecordId: sourceRecordId || prop(props, "source_record_id"),
      }),
    });

    res.status(200).json({ success: true, action: "voided", recordId: record.id });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Correction failed." });
  }
};

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

function previousProps(previous) {
  const data = previous && typeof previous === "object" ? previous : {};
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
    `SMARTCoach Pro Correction - ${dateLabel(correctionTime)}`,
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

function buildEditNote({ athleteName, reason, correctionTime, record, props, sourceRecordId, changes }) {
  const lines = [
    `SMARTCoach Pro Correction - ${dateLabel(correctionTime)}`,
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

function changedValues(previousValues, nextValues) {
  const labels = {
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

function stripSystemNoteLines(note) {
  return clean(note).split(/\r?\n/).filter((line) => {
    if (isCorrectionLine(line)) return false;
    return !/^(Completed volume|Weather):/i.test(line.trim());
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
  const fields = ["9YD4n4y4aqf3VnkrwLL1", "custom_objects.performance_records.source_record_id", "source_record_id"];
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

function recordProperties(record) {
  return (record && (record.properties || record.fields || record.customFields)) || {};
}

function prop(props, key) {
  const keys = [key, `custom_objects.performance_records.${key}`].concat(FIELD_IDS[key] || []);
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

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
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
