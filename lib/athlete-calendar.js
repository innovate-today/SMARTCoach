const crypto = require("crypto");
const { getGhlContext, coachCodeAllowed, coachSessionFromRequest, subscriptionAccessAllowed, subscriptionBlockedMessage } = require("./ghl-account");
const { attachRegistryAccount, setSmartTrakSecurityHeaders } = require("./smart-trak-request");

const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const TRAINING_PLAN_DAY_SCHEMA_KEY = "custom_objects.training_plan_days";
const SMARTCOACH_ACTIVE_FIELD_ID = "xepTMFvtaTwFdLVrOeQH";
const SMARTCOACH_ATHLETE_ID_FIELD_ID = "Vi7fmpkblrGZqZFyNBI2";
const DAY_FIELD_IDS = {
  training_plan_days: ["XhD36I8Z805YGdGZpQWy"],
  training_plan_id: ["IBFftNR0WSnH9Jqs1M3A"],
  date: ["6q19e2FwmyEBsnR36FOb"],
  day_type: ["nnU4navT4X42RmarQEMi"],
  group_name: ["52CgNzqxeSkCNB9JapQH"],
  athlete_contact: ["X7OV4qThdvmNTZTukHRj"],
  athlete_name_snapshot: ["dHhOi4g4nyOWTBUK9Huq"],
  workout_title: ["9AUuS96TYVKaZb5CwojP"],
  workout_details: ["HDkxzLyHwS7UYfzWULdX"],
  workout_type: ["JeJSK2v1i6hr5j5JWvnb"],
  energy_system: ["w9CkbegIX3HfeZIkJeKR"],
  target_splits__paces: ["SU6YdLenqSayX2Aa6EsV"],
  planned_volume: ["QuuQJG8PsE3WbeNtgYTf"],
  status: ["AewprcRcLKYVJY54KWPd"],
  linked_meet_id: ["T6HHd6GVO24DY1iOKxln"],
  linked_performance_record_ids: ["CFhffn65Dq4j5PzR6C7G"],
  coach_notes: ["HMK0dChJi5Q0wN1vgm9b"],
  source_system: ["m9uiJIeFwx8yyqZ3pPX5"],
  source_record_id: ["sBcjXM5l5LytSQZWVV13"],
};

module.exports = async function handler(req, res) {
  setSmartTrakSecurityHeaders(res);
  setCorsHeaders(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    await attachRegistryAccount(req);
    const context = getGhlContext(req);
    if (context.productPlan === "essential") {
      res.status(403).json({ error: "SMARTCoach Pro with SMART Trak is required for athlete calendar access." });
      return;
    }
    if (!subscriptionAccessAllowed(context.subscription)) {
      res.status(402).json({ error: subscriptionBlockedMessage(context.subscription), subscriptionAccessRequired: true });
      return;
    }
    if (!context.token || !context.locationId) {
      res.status(500).json({ error: "SMART Trak athlete calendar is not configured on the server." });
      return;
    }
    if (req.method === "GET" && clean(req.query && req.query.action) === "link") {
      return athleteLink(req, res, context);
    }
    if (req.method === "GET") {
      return athleteCalendar(req, res, context);
    }
    if (req.method === "POST") {
      return submitAthleteWorkout(req, res, context);
    }
    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Athlete calendar request failed." });
  }
};

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-SMARTCoach-Account, X-SMARTCoach-Access-Code, X-SMARTCoach-Session");
}

async function athleteLink(req, res, context) {
  const provided = clean(headerValue(req, "x-smartcoach-access-code") || queryValue(req, "access"));
  const session = coachSessionFromRequest(req, context.accountKey);
  const access = session ? { allowed: true } : coachCodeAllowed(req, provided);
  if (!access.allowed) {
    res.status(access.statusCode || 401).json({ error: access.error || "SMART Trak coach access code is required.", accessCodeRequired: true });
    return;
  }
  const athleteId = clean(queryValue(req, "athleteId") || queryValue(req, "contactId"));
  const athlete = await findAthleteById(context, athleteId);
  const code = athleteAccessCode(context.accountKey, athlete.id);
  res.status(200).json({
    success: true,
    athlete: publicAthlete(athlete),
    code,
    url: `/athlete-calendar.html?account=${encodeURIComponent(context.accountKey)}&athlete=${encodeURIComponent(athlete.id)}&code=${encodeURIComponent(code)}`,
  });
}

async function athleteCalendar(req, res, context) {
  const athlete = await authorizedAthlete(req, context);
  const groups = await loadGroups(context);
  const days = await listTrainingPlanDays(context);
  const visible = mergeVisibleDays(days.filter((day) => athleteCanSeeDay(athlete, groups, day))).map(publicDay);
  res.status(200).json({
    success: true,
    athlete: publicAthlete(athlete),
    days: visible,
    groups: groupsForAthlete(athlete, groups).map((group) => group.name),
  });
}

async function submitAthleteWorkout(req, res, context) {
  const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  const athlete = await authorizedAthlete({ ...req, query: { ...(req.query || {}), athlete: payload.athleteId || payload.athlete, code: payload.code } }, context);
  const days = await listTrainingPlanDays(context);
  const groups = await loadGroups(context);
  const dayId = clean(payload.dayId || payload.id);
  const day = days.find((item) => clean(item.id) === dayId || clean(item.sourceRecordId) === dayId);
  if (!day || !athleteCanSeeDay(athlete, groups, day)) throw httpError(404, "Workout was not found for this athlete.");

  const status = actionStatus(payload.status || payload.action);
  const notes = clean(payload.notes);
  const actualVolume = clean(payload.actualVolume || payload.completedVolume || payload.distance);
  const totalTime = clean(payload.totalTime || payload.time);
  if (status === "skipped" && !notes) throw httpError(400, "Notes are required when skipping a workout.");
  if (status === "modified" && !actualVolume) throw httpError(400, "Enter the completed distance or volume for a modified workout.");

  req.smartcoachAthleteAccess = true;
  req.body = buildSyncPayload({ athlete, day, status, actualVolume, totalTime, notes });
  const syncSession = require("../api/ghl/sync-session");
  return syncSession(req, res);
}

function buildSyncPayload({ athlete, day, status, actualVolume, totalTime, notes }) {
  const completedVolume = status === "skipped" ? "0 mi" : actualVolume || day.plannedVolume || "Completed as planned";
  const displayStatus = status === "completed" ? "Completed" : status === "modified" ? "Modified / correction" : "Skipped";
  return {
    groupName: day.groupName || "Athlete Calendar",
    season: seasonForDate(day.date),
    phase: "Athlete Submitted",
    workoutType: day.workoutType || day.title || "Training",
    energySystem: day.energySystem || "Mixed",
    surface: "Track",
    completedVolume,
    sessionDate: day.date || new Date().toISOString(),
    forceDuplicateSync: true,
    trainingPlanDayId: day.id,
    trainingPlanDaySourceId: day.sourceRecordId,
    trainingPlanDayTitle: day.title,
    athleteSubmittedStatus: status,
    athleteSubmittedNote: notes,
    athletes: [{
      name: athlete.name,
      contactId: athlete.id,
      smartcoachAthleteId: athlete.smartcoachAthleteId,
      trainingPlanDayId: day.id,
      trainingPlanDaySourceId: day.sourceRecordId,
      plannedVolume: day.plannedVolume,
      trainingPlanDayTitle: day.title,
      athleteSubmittedStatus: status,
      athleteSubmittedNote: notes,
      runs: [{
        runNumber: 1,
        total: totalTime || displayStatus,
        totalMs: parseTimeToMs(totalTime),
        laps: [],
        note: [
          "Athlete Calendar submission",
          `Status: ${displayStatus}`,
          day.plannedVolume ? `Planned volume: ${day.plannedVolume}` : "",
          completedVolume ? `Completed volume: ${completedVolume}` : "",
          day.title ? `Workout: ${day.title}` : "",
          day.details ? `Workout details: ${day.details}` : "",
          notes ? `Athlete notes: ${notes}` : "",
        ].filter(Boolean).join("\n"),
        timestamp: day.date || new Date().toISOString(),
      }],
    }],
  };
}

async function authorizedAthlete(req, context) {
  const athleteId = clean(queryValue(req, "athlete") || queryValue(req, "athleteId") || queryValue(req, "contactId"));
  const code = clean(queryValue(req, "code") || headerValue(req, "x-smartcoach-athlete-code"));
  const athlete = await findAthleteById(context, athleteId);
  const expected = athleteAccessCode(context.accountKey, athlete.id);
  if (!code || !safeEqual(code, expected)) throw httpError(401, "Athlete calendar access code was not accepted.");
  return athlete;
}

async function findAthleteById(context, athleteId) {
  const id = clean(athleteId);
  if (!id) throw httpError(400, "Athlete ID is required.");
  const athletes = await listAthletes(context);
  const athlete = athletes.find((item) => clean(item.id) === id || clean(item.smartcoachAthleteId) === id);
  if (!athlete) throw httpError(404, "Athlete was not found.");
  if (!athlete.smartcoachActive) throw httpError(403, "This athlete is not active.");
  return athlete;
}

async function listAthletes({ token, locationId }) {
  const result = await ghlFetch({ token, path: `/contacts/?locationId=${encodeURIComponent(locationId)}&limit=100`, method: "GET" });
  return contactsFromResult(result).map(normalizeContact).filter((athlete) => athlete.smartcoachActive || athlete.smartcoachAthleteId);
}

async function listTrainingPlanDays({ token, locationId }) {
  const result = await ghlFetch({
    token,
    path: `/objects/${encodeURIComponent(TRAINING_PLAN_DAY_SCHEMA_KEY)}/records/search`,
    method: "POST",
    body: { locationId, page: 1, pageLimit: 100 },
  });
  return recordsFromResult(result).map(normalizeTrainingPlanDayRecord).filter((day) => day.date && day.title).sort((a, b) => {
    return String(a.date || "").localeCompare(String(b.date || "")) || String(a.title || "").localeCompare(String(b.title || ""));
  });
}

async function loadGroups(context) {
  try {
    const result = await ghlFetch({
      token: context.token,
      path: `/objects/${encodeURIComponent("custom_objects.training_plans")}/records/search`,
      method: "POST",
      body: { locationId: context.locationId, page: 1, pageLimit: 100 },
    });
    const groupsRecord = recordsFromResult(result).find((record) => prop(recordProperties(record), "source_record_id") === "smartcoach_training_groups");
    const parsed = parseGroupsBlock(prop(recordProperties(groupsRecord), "school_constraints"));
    return normalizeGroups(parsed.groups);
  } catch (error) {
    return [];
  }
}

function athleteCanSeeDay(athlete, groups, day) {
  const direct = clean(day.athleteContact) && clean(day.athleteContact) === clean(athlete.id);
  const nameDirect = clean(day.athleteName) && clean(day.athleteName).toLowerCase() === clean(athlete.name).toLowerCase();
  const athleteGroups = groupsForAthlete(athlete, groups).map((group) => clean(group.name).toLowerCase());
  const groupMatch = clean(day.groupName) && athleteGroups.includes(clean(day.groupName).toLowerCase());
  return direct || nameDirect || groupMatch;
}

function mergeVisibleDays(visibleDays) {
  const grouped = {};
  (Array.isArray(visibleDays) ? visibleDays : []).forEach((day) => {
    const key = [
      clean(day.date).slice(0, 10),
      clean(day.title || day.dayType).toLowerCase(),
      clean(day.groupName).toLowerCase(),
      clean(day.athleteContact).toLowerCase(),
      clean(day.athleteName).toLowerCase(),
    ].join("|");
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(day);
  });
  return Object.keys(grouped).map((key) => mergeDuplicateDays(grouped[key])).sort((a, b) => {
    return String(a.date || "").localeCompare(String(b.date || "")) || String(a.title || "").localeCompare(String(b.title || ""));
  });
}

function mergeDuplicateDays(matches) {
  const days = Array.isArray(matches) ? matches.filter(Boolean) : [];
  if (days.length <= 1) return days[0] || {};
  const contentDay = days.slice().sort((a, b) => dayContentScore(b) - dayContentScore(a))[0] || days[0];
  const statusDay = days.slice().sort((a, b) => statusPriority(b.status) - statusPriority(a.status))[0] || contentDay;
  return {
    ...contentDay,
    status: statusDay.status || contentDay.status,
    linkedPerformanceRecordIds: statusDay.linkedPerformanceRecordIds || contentDay.linkedPerformanceRecordIds,
    coachNotes: [contentDay.coachNotes, statusDay !== contentDay ? statusDay.coachNotes : ""].filter(Boolean).join("\n"),
  };
}

function dayContentScore(day) {
  return [
    day.plannedVolume,
    day.details,
    day.targetSplits,
    day.workoutType,
    day.energySystem,
  ].map((value) => clean(value).length).reduce((total, length) => total + length, 0);
}

function statusPriority(status) {
  const text = clean(status).toLowerCase();
  if (text.indexOf("skipped") >= 0) return 5;
  if (text.indexOf("modified") >= 0 || text.indexOf("correction") >= 0) return 4;
  if (text.indexOf("completed") >= 0) return 3;
  if (text.indexOf("scheduled") >= 0) return 1;
  return 0;
}

function groupsForAthlete(athlete, groups) {
  const athleteId = clean(athlete && athlete.id);
  const athleteName = clean(athlete && athlete.name).toLowerCase();
  return (Array.isArray(groups) ? groups : []).filter((group) => {
    if (group.archived || group.type === "meet") return false;
    return (group.athletes || []).some((item) => clean(item.contactId) === athleteId || clean(item.name).toLowerCase() === athleteName);
  });
}

function athleteAccessCode(accountKey, athleteId) {
  const secret = clean(process.env.SMARTCOACH_ATHLETE_ACCESS_SECRET || process.env.SMARTCOACH_SESSION_SECRET || process.env.SMARTCOACH_AUTOMATION_SECRET || "smartcoach-athlete-calendar");
  return crypto.createHmac("sha256", secret).update(`${clean(accountKey).toLowerCase()}:${clean(athleteId)}`).digest("hex").slice(0, 12);
}

function publicAthlete(athlete) {
  return { id: athlete.id, name: athlete.name, smartcoachAthleteId: athlete.smartcoachAthleteId };
}

function publicDay(day) {
  return {
    id: day.id,
    sourceRecordId: day.sourceRecordId,
    date: day.date,
    dayType: day.dayType,
    groupName: day.groupName,
    title: day.title,
    details: day.details,
    workoutType: day.workoutType,
    energySystem: day.energySystem,
    targetSplits: day.targetSplits,
    plannedVolume: day.plannedVolume,
    status: day.status,
    coachNotes: day.coachNotes,
  };
}

function normalizeTrainingPlanDayRecord(record) {
  const props = recordProperties(record);
  return {
    id: clean(record && record.id) || dayProp(props, "source_record_id"),
    sourceRecordId: dayProp(props, "source_record_id"),
    trainingPlanId: dayProp(props, "training_plan_id"),
    date: dayProp(props, "date"),
    dayType: labelValue(dayProp(props, "day_type")),
    groupName: dayProp(props, "group_name"),
    athleteContact: dayProp(props, "athlete_contact"),
    athleteName: dayProp(props, "athlete_name_snapshot"),
    title: dayProp(props, "workout_title") || dayProp(props, "training_plan_days"),
    details: dayProp(props, "workout_details"),
    workoutType: labelValue(dayProp(props, "workout_type")),
    energySystem: labelValue(dayProp(props, "energy_system")),
    targetSplits: dayProp(props, "target_splits__paces"),
    plannedVolume: dayProp(props, "planned_volume"),
    status: labelValue(dayProp(props, "status")),
    linkedMeetId: dayProp(props, "linked_meet_id"),
    linkedPerformanceRecordIds: dayProp(props, "linked_performance_record_ids"),
    coachNotes: dayProp(props, "coach_notes"),
  };
}

function normalizeContact(contact) {
  const customFields = customFieldList(contact);
  const smartcoachAthleteId = contactFieldValue(customFields, SMARTCOACH_ATHLETE_ID_FIELD_ID) || fieldByName(customFields, ["smartcoach athlete id", "smartcoach_athlete_id"]);
  const activeFieldValue = contactFieldValue(customFields, SMARTCOACH_ACTIVE_FIELD_ID) || fieldByName(customFields, ["smartcoach active", "smartcoach_active"]);
  const tags = contactTags(contact);
  const hasAthleteTag = tags.some((tag) => clean(tag).toLowerCase() === "smartcoach-athlete");
  const explicitlyInactive = inactiveValue(activeFieldValue);
  return {
    id: clean(contact && contact.id),
    name: contactName(contact),
    smartcoachAthleteId,
    smartcoachActive: activeValue(activeFieldValue) || (!explicitlyInactive && Boolean(smartcoachAthleteId || hasAthleteTag)),
  };
}

function contactName(contact) {
  return clean(contact && (contact.name || contact.contactName || contact.fullName)) || [contact && contact.firstName, contact && contact.lastName].map(clean).filter(Boolean).join(" ");
}

function contactsFromResult(result) {
  return [
    ...(Array.isArray(result && result.contacts) ? result.contacts : []),
    ...(Array.isArray(result && result.items) ? result.items : []),
    ...(Array.isArray(result && result.data && result.data.contacts) ? result.data.contacts : []),
    ...(Array.isArray(result && result.data && result.data.items) ? result.data.items : []),
  ];
}

function normalizeGroups(groups) {
  return (Array.isArray(groups) ? groups : []).map((group) => ({
    id: clean(group && group.id),
    name: clean(group && (group.name || group.groupName)),
    type: clean(group && group.type) === "meet" ? "meet" : "training",
    archived: !!(group && group.archived),
    athletes: Array.isArray(group && group.athletes) ? group.athletes.map((item) => ({ contactId: clean(item && item.contactId), name: clean(item && item.name) })) : [],
  })).filter((group) => group.name);
}

function parseGroupsBlock(text) {
  const match = clean(text).match(/\[SMARTCoach Groups\]\s*([\s\S]*?)\s*\[\/SMARTCoach Groups\]/i);
  if (!match) return { groups: [] };
  try {
    const parsed = JSON.parse(match[1]);
    return { groups: Array.isArray(parsed.groups) ? parsed.groups : [] };
  } catch (error) {
    return { groups: [] };
  }
}

async function ghlFetch({ token, path, method, body }) {
  const response = await fetch(`${GHL_BASE_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Version: GHL_VERSION, "Content-Type": "application/json", Accept: "application/json" },
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
  return (record && (record.properties || record.fields || record.customFields || record.data && record.data.properties)) || {};
}

function prop(props, key) {
  return firstPropValue(props, [key, `custom_objects.training_plans.${key}`]);
}

function dayProp(props, key) {
  return firstPropValue(props, [key, `custom_objects.training_plan_days.${key}`].concat(DAY_FIELD_IDS[key] || []));
}

function firstPropValue(props, keys) {
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
    return field ? fieldValue(field) : "";
  }
  return fieldValuePart(props[key]);
}

function customFieldList(contact) {
  if (!contact) return [];
  if (Array.isArray(contact.customFields)) return contact.customFields;
  if (Array.isArray(contact.customField)) return contact.customField;
  if (Array.isArray(contact.custom_fields)) return contact.custom_fields;
  if (Array.isArray(contact.customFieldsData)) return contact.customFieldsData;
  if (contact.customFields && typeof contact.customFields === "object") {
    return Object.keys(contact.customFields).map((key) => ({
      id: key,
      value: contact.customFields[key],
    }));
  }
  return [];
}

function contactTags(contact) {
  const tags = contact && contact.tags;
  if (Array.isArray(tags)) return tags.map(clean).filter(Boolean);
  return clean(tags).split(",").map(clean).filter(Boolean);
}

function fieldValue(field) {
  const value = firstPresent([
    field && field.value,
    field && field.fieldValue,
    field && field.field_value,
    field && field.valueString,
    field && field.value_string,
  ]);
  if (Array.isArray(value)) return value.map(fieldValuePart).filter(Boolean).join(", ");
  return fieldValuePart(value);
}

function fieldValuePart(value) {
  if (value === null || typeof value === "undefined") return "";
  if (Array.isArray(value)) return value.map(fieldValuePart).filter(Boolean).join(", ");
  if (typeof value === "object") return clean(value.value || value.name || value.label || value.key || value.id);
  return clean(value);
}

function firstPresent(values) {
  for (const value of values) {
    if (value !== null && typeof value !== "undefined" && value !== "") return value;
  }
  return "";
}

function normalizeFieldLabel(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function contactFieldValue(fields, id) {
  const field = (Array.isArray(fields) ? fields : []).find((item) => item && (item.id === id || item.fieldId === id || item.customFieldId === id));
  return field ? fieldValue(field) : "";
}

function fieldByName(fields, names) {
  const wanted = names.map(normalizeFieldLabel).filter(Boolean);
  const field = (Array.isArray(fields) ? fields : []).find((item) => {
    if (!item) return false;
    const labels = [
      item.id,
      item.fieldId,
      item.field_id,
      item.customFieldId,
      item.key,
      item.fieldKey,
      item.field_key,
      item.name,
      item.fieldName,
      item.field_name,
      item.label,
    ].map(normalizeFieldLabel);
    return labels.some((label) => wanted.includes(label) || wanted.includes(label.split(".").pop()));
  });
  return field ? fieldValue(field) : "";
}

function activeValue(value) {
  const text = clean(value).toLowerCase();
  return ["yes", "true", "1", "active", "on"].includes(text);
}

function inactiveValue(value) {
  const text = clean(value).toLowerCase();
  return ["no", "false", "0", "inactive", "off"].includes(text);
}

function actionStatus(value) {
  const text = clean(value).toLowerCase();
  if (text === "skip" || text === "skipped") return "skipped";
  if (text === "modify" || text === "modified" || text === "correction") return "modified";
  return "completed";
}

function parseTimeToMs(value) {
  const text = clean(value);
  if (!text) return null;
  const parts = text.split(":").map((part) => part.trim());
  if (!parts.length || parts.length > 3 || parts.some((part) => part === "" || Number.isNaN(Number(part)))) return null;
  let seconds = 0;
  if (parts.length === 1) seconds = Number(parts[0]);
  if (parts.length === 2) seconds = Number(parts[0]) * 60 + Number(parts[1]);
  if (parts.length === 3) seconds = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  return seconds > 0 ? Math.round(seconds * 1000) : null;
}

function seasonForDate(value) {
  const date = new Date(value);
  const month = Number.isNaN(date.getTime()) ? new Date().getMonth() + 1 : date.getMonth() + 1;
  if (month === 12 || month === 1) return "Winter";
  if (month >= 2 && month <= 5) return "Spring";
  if (month >= 6 && month <= 7) return "Summer";
  return "Fall";
}

function labelValue(value) {
  const text = clean(value);
  return text ? text.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") : "";
}

function safeJson(value) {
  try { return JSON.parse(value); } catch (error) { return {}; }
}

function safeEqual(a, b) {
  const left = Buffer.from(clean(a));
  const right = Buffer.from(clean(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function headerValue(req, name) {
  const headers = req && req.headers || {};
  return headers[name] || headers[name.toLowerCase()] || "";
}

function queryValue(req, name) {
  const value = req && req.query && req.query[name];
  return Array.isArray(value) ? value[0] : value;
}

function clean(value) {
  return String(value || "").trim();
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
