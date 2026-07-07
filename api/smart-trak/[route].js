const crypto = require("crypto");

const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const GHL_ACCOUNT_KEY_CUSTOM_VALUE_NAME = "account_key";
const athletesApi = require("../ghl/athletes");

const handlers = {
  "athlete-best": require("../ghl/athlete-best"),
  "athlete-calendar": require("../../lib/athlete-calendar"),
  "athlete-profile": require("../ghl/athlete-profile"),
  athletes: athletesApi,
  dashboard: require("../ghl/dashboard"),
  groups: require("../../lib/ghl-groups"),
  "manual-mileage": require("../ghl/manual-mileage"),
  correction: require("../ghl/correction"),
  "meet-result": require("../ghl/meet-result"),
  meets: require("../ghl/meets"),
  "sync-diagnostics": require("../../lib/sync-diagnostics"),
  "sync-session": require("../ghl/sync-session"),
  "training-plan": require("../ghl/training-plan"),
};
const {
  getGhlContext,
  requireProPlan,
  coachCodeAllowed,
  createCoachSession,
  coachSessionFromRequest,
  coachSessionSecretSource,
  coachSessionTtlSeconds,
  subscriptionAccessAllowed,
  subscriptionBlockedMessage,
} = require("../../lib/ghl-account");
const { registryConfigured, registryHealth, saveAccountRecord, loadAccountRecord, listAccountRecords, recordCoachDeviceSession, loadCoachDeviceUsage, saveAttendanceRecords, loadAttendanceRecords, saveKeepTrakNotes, loadKeepTrakNotes, saveBugTrakReport, loadBugTrakReports, savePartnerTimingSession, loadPartnerTimingSessions } = require("../../lib/account-registry");
const { checkSessionAttempt, recordSessionFailure, clearSessionFailures, requestIp } = require("../../lib/session-rate-limit");
const {
  normalizeProductPlan: normalizePlanKey,
  planDefinition,
  isProPlan,
  suggestedSubscriptionAmount: planSubscriptionAmount,
} = require("../../lib/smartcoach-plans");

module.exports = async function handler(req, res) {
  setSmartTrakSecurityHeaders(res);
  const route = Array.isArray(req.query.route) ? req.query.route[0] : req.query.route;
  const selected = handlers[route];

  if (route === "account-status") {
    return accountStatus(req, res);
  }

  if (route === "account-setup") {
    return accountSetup(req, res);
  }

  if (route === "account-automation") {
    return accountAutomation(req, res);
  }

  if (route === "account-automation-dry-run") {
    return accountAutomationDryRun(req, res);
  }

  if (route === "account-automation-health") {
    return accountAutomationHealth(req, res);
  }

  if (route === "account-stripe-webhook") {
    return accountStripeWebhook(req, res);
  }

  if (route === "account-registry") {
    return accountRegistry(req, res);
  }

  if (route === "account-cleanup") {
    return accountCleanup(req, res);
  }

  if (route === "account-session") {
    return accountSession(req, res);
  }

  if (route === "account-code-reset") {
    return accountCodeReset(req, res);
  }

  if (route === "account-code-recovery") {
    return accountCodeRecovery(req, res);
  }

  if (route === "account-staff") {
    return accountStaff(req, res);
  }

  if (route === "training-customization") {
    await attachRegistryAccount(req);
    if (!requireProPlan(req, res)) return;
    return accountTrainingCustomization(req, res);
  }

  if (route === "athlete-calendar-questions") {
    await attachRegistryAccount(req);
    if (!requireProPlan(req, res)) return;
    return accountAthleteCalendarQuestions(req, res);
  }

  if (route === "dashboard-preferences") {
    await attachRegistryAccount(req);
    if (!requireProPlan(req, res)) return;
    return accountDashboardPreferences(req, res);
  }

  if (route === "miles-board-sharing") {
    await attachRegistryAccount(req);
    if (!requireProPlan(req, res)) return;
    return accountMilesBoardSharing(req, res);
  }

  if (route === "miles-board-link") {
    await attachRegistryAccount(req);
    if (!requireProPlan(req, res)) return;
    return accountMilesBoardLink(req, res);
  }

  if (route === "miles-board") {
    await attachRegistryAccount(req);
    return accountMilesBoard(req, res);
  }

  if (route === "speed-board-sharing") {
    await attachRegistryAccount(req);
    if (!requireProPlan(req, res)) return;
    return accountSpeedBoardSharing(req, res);
  }

  if (route === "speed-board-link") {
    await attachRegistryAccount(req);
    if (!requireProPlan(req, res)) return;
    return accountSpeedBoardLink(req, res);
  }

  if (route === "speed-board") {
    await attachRegistryAccount(req);
    return accountSpeedBoard(req, res);
  }

  if (route === "attendance") {
    await attachRegistryAccount(req);
    if (!requireProPlan(req, res)) return;
    await recordRequestCoachDevice(req).catch(() => {});
    return accountAttendance(req, res);
  }

  if (route === "keep-trak") {
    await attachRegistryAccount(req);
    if (!requireProPlan(req, res)) return;
    await recordRequestCoachDevice(req).catch(() => {});
    return accountKeepTrak(req, res);
  }

  if (route === "partner-timing") {
    await attachRegistryAccount(req);
    if (!requireProPlan(req, res)) return;
    await recordRequestCoachDevice(req).catch(() => {});
    return accountPartnerTiming(req, res);
  }

  if (route === "field-practice") {
    await attachRegistryAccount(req);
    if (!requireProPlan(req, res)) return;
    await recordRequestCoachDevice(req).catch(() => {});
    return accountFieldPractice(req, res);
  }

  if (route === "bug-trak") {
    await attachRegistryAccount(req);
    if (!requireProPlan(req, res)) return;
    await recordRequestCoachDevice(req).catch(() => {});
    return accountBugTrak(req, res);
  }

  if (route === "docu-trak") {
    await attachRegistryAccount(req);
    if (!requireProPlan(req, res)) return;
    return accountDocuTrak(req, res);
  }

  if (route === "equipment-trak") {
    await attachRegistryAccount(req);
    if (!requireProPlan(req, res)) return;
    return accountEquipmentTrak(req, res);
  }

  if (route === "weather-locations") {
    await attachRegistryAccount(req);
    if (!requireProPlan(req, res)) return;
    return accountWeatherLocations(req, res);
  }

  if (!selected) {
    res.status(404).json({ error: "SMART Trak endpoint not found." });
    return;
  }

  if (route === "athlete-calendar") {
    return selected(req, res);
  }

  await attachRegistryAccount(req);
  if (!requireProPlan(req, res)) return;
  if (["sync-session", "meet-result", "manual-mileage", "correction"].includes(route)) {
    await recordRequestCoachDevice(req).catch(() => {});
  }

  return selected(req, res);
};

async function recordRequestCoachDevice(req) {
  const { accountKey, coachCodeVersion } = getGhlContext(req);
  const deviceId = cleanSetupText(headerValue(req, "x-smartcoach-device-id"));
  if (!deviceId) return;
  const session = coachSessionFromRequest(req, accountKey);
  const validSession = coachSessionVersionAllowed(session, coachCodeVersion) ? session : null;
  await recordCoachDeviceSession(accountKey, {
    deviceId,
    deviceLabel: cleanSetupText(headerValue(req, "x-smartcoach-device-label")),
    deviceSource: cleanSetupText(headerValue(req, "x-smartcoach-device-source")) || "app",
    coachId: cleanSetupText(headerValue(req, "x-smartcoach-coach-id")),
    coachName: cleanSetupText(headerValue(req, "x-smartcoach-coach-name")),
    userAgent: headerValue(req, "user-agent"),
    coachIndex: validSession && Number(validSession.coachIndex) || 0,
  });
}

async function accountAttendance(req, res) {
  setAttendanceCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const { accountKey, token, locationId } = getGhlContext(req);

  try {
    if (req.method === "GET") {
      const attendance = await loadAttendanceRecords(accountKey, {
        start: firstQueryValue(req.query && req.query.start),
        end: firstQueryValue(req.query && req.query.end),
        group: firstQueryValue(req.query && req.query.group),
        groupId: firstQueryValue(req.query && req.query.groupId),
        sport: firstQueryValue(req.query && req.query.sport),
        season: firstQueryValue(req.query && req.query.season),
        athleteId: firstQueryValue(req.query && (req.query.athleteId || req.query.contactId)),
        athleteName: firstQueryValue(req.query && req.query.athleteName),
        status: firstQueryValue(req.query && req.query.status),
      });
      const activeAttendance = await activeAttendanceRecords({ attendance, token, locationId });
      res.status(200).json({ success: true, attendance: activeAttendance, count: activeAttendance.length });
      return;
    }

    if (req.method === "POST" || req.method === "PATCH") {
      const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const records = attendanceRecordsFromPayload(payload);
      const deleteIds = Array.isArray(payload.deleteIds) ? payload.deleteIds.map(cleanSetupText).filter(Boolean) : [];
      if (!records.length && !deleteIds.length) {
        res.status(400).json({ error: "No attendance records were provided." });
        return;
      }
      const saved = await saveAttendanceRecords(accountKey, records, { deleteIds });
      res.status(200).json({ success: !!saved.saved, attendance: records, ...saved });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Attendance save failed." });
  }
}

async function activeAttendanceRecords({ attendance, token, locationId }) {
  const rows = Array.isArray(attendance) ? attendance : [];
  if (!token || !locationId || !rows.length) return rows;
  const athletes = await athletesApi.listSmartCoachAthletes({ token, locationId, includeContacts: false });
  const activeKeys = new Set();
  athletes.filter((athlete) => athlete && athlete.smartcoachActive).forEach((athlete) => {
    [athlete.id, athlete.contactId, athlete.smartcoachAthleteId, athlete.name].map(cleanSetupText).filter(Boolean).forEach((value) => {
      activeKeys.add(value.toLowerCase());
    });
  });
  return rows.filter((row) => {
    const keys = [row && row.athleteId, row && row.contactId, row && row.smartcoachAthleteId, row && row.athleteName].map(cleanSetupText).filter(Boolean);
    return keys.some((value) => activeKeys.has(value.toLowerCase()));
  });
}

function attendanceRecordsFromPayload(payload) {
  if (Array.isArray(payload && payload.records)) return payload.records;
  const date = cleanSetupText(payload && payload.date).slice(0, 10);
  const groupId = cleanSetupText(payload && payload.groupId);
  const groupName = cleanSetupText(payload && payload.groupName);
  const sport = cleanSetupText(payload && payload.sport);
  const season = cleanSetupText(payload && payload.season);
  const seasonYear = Number(payload && payload.seasonYear) || null;
  const runners = Array.isArray(payload && payload.runners) ? payload.runners : [];
  const runnerByKey = {};
  runners.forEach((runner) => {
    const item = runner || {};
    [item.runnerId, item.id, item.contactId, item.smartcoachAthleteId, item.name].map(cleanSetupText).filter(Boolean).forEach((key) => {
      runnerByKey[String(key)] = item;
    });
  });
  const out = [];
  (Array.isArray(payload && payload.checkpoints) ? payload.checkpoints : []).forEach((checkpoint, cpIndex) => {
    const cp = checkpoint || {};
    const checkpointId = cleanSetupText(cp.id) || `checkpoint_${cpIndex + 1}`;
    const checkpointName = cleanSetupText(cp.name) || (cpIndex ? `Checkpoint ${cpIndex + 1}` : "Practice Start");
    const records = cp.records && typeof cp.records === "object" ? cp.records : {};
    Object.keys(records).forEach((runnerKey) => {
      const row = records[runnerKey] || {};
      const runner = runnerByKey[runnerKey] || row || {};
      const status = cleanSetupText(row.status).toLowerCase();
      if (!status) return;
      out.push({
        date,
        groupId,
        groupName,
        sport,
        season,
        seasonYear,
        checkpointId,
        checkpointName,
        athleteId: cleanSetupText(runner.contactId || runner.smartcoachAthleteId || runner.id || runner.runnerId || runnerKey),
        contactId: cleanSetupText(runner.contactId),
        smartcoachAthleteId: cleanSetupText(runner.smartcoachAthleteId),
        athleteName: cleanSetupText(runner.name || row.athleteName),
        status,
        note: cleanSetupText(row.note),
        source: cleanSetupText(row.source) || "coach",
        coachId: cleanSetupText(row.coachId || payload.coachId),
        coachName: cleanSetupText(row.coachName || payload.coachName),
        updatedAt: cleanSetupText(row.updatedAt) || new Date().toISOString(),
      });
    });
  });
  return out;
}

function setAttendanceCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-SMARTCoach-Account, X-SMARTCoach-Session, X-SMARTCoach-Access-Code, X-SMARTCoach-Device-Id, X-SMARTCoach-Device-Label");
}

async function accountKeepTrak(req, res) {
  setKeepTrakCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const { accountKey } = getGhlContext(req);

  try {
    if (req.method === "GET") {
      const notes = await loadKeepTrakNotes(accountKey, {
        date: firstQueryValue(req.query && req.query.date),
        start: firstQueryValue(req.query && req.query.start),
        end: firstQueryValue(req.query && req.query.end),
        includeCompleted: firstQueryValue(req.query && req.query.includeCompleted),
        includeArchived: firstQueryValue(req.query && req.query.includeArchived),
      });
      res.status(200).json({ success: true, notes, count: notes.length });
      return;
    }

    if (req.method === "POST" || req.method === "PATCH") {
      const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const notes = Array.isArray(payload.notes) ? payload.notes : payload.note ? [payload.note] : [];
      const deleteIds = Array.isArray(payload.deleteIds) ? payload.deleteIds.map(cleanSetupText).filter(Boolean) : [];
      if (!notes.length && !deleteIds.length) {
        res.status(400).json({ error: "No Keep Trak notes were provided." });
        return;
      }
      const saved = await saveKeepTrakNotes(accountKey, notes, { deleteIds });
      res.status(200).json({ success: !!saved.saved, ...saved });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Keep Trak save failed." });
  }
}

function setKeepTrakCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-SMARTCoach-Account, X-SMARTCoach-Session, X-SMARTCoach-Access-Code, X-SMARTCoach-Device-Id, X-SMARTCoach-Device-Label, X-SMARTCoach-Coach-Id, X-SMARTCoach-Coach-Name");
}

async function accountPartnerTiming(req, res) {
  setKeepTrakCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const { accountKey } = getGhlContext(req);

  try {
    if (req.method === "GET") {
      const sessions = await loadPartnerTimingSessions(accountKey, {
        id: firstQueryValue(req.query && (req.query.id || req.query.sessionId)),
      });
      res.status(200).json({ success: true, sessions, count: sessions.length });
      return;
    }

    if (req.method === "POST" || req.method === "PATCH") {
      const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const session = payload.session || payload;
      const saved = await savePartnerTimingSession(accountKey, session);
      res.status(saved.saved ? 200 : 400).json({ success: !!saved.saved, ...saved });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Partner Timing sync failed." });
  }
}

async function accountFieldPractice(req, res) {
  setKeepTrakCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const { accountKey } = getGhlContext(req);

  try {
    if (req.method === "GET") {
      const existing = await loadAccountRecord(accountKey);
      const practices = normalizeFieldPractices(existing && existing.record && existing.record.fieldPracticeSessions);
      const start = firstQueryValue(req.query && req.query.start);
      const end = firstQueryValue(req.query && req.query.end);
      const event = cleanSetupText(firstQueryValue(req.query && req.query.event)).toLowerCase();
      const filtered = practices.filter((item) => {
        if (start && item.date < start) return false;
        if (end && item.date > end) return false;
        if (event && event !== "all" && cleanSetupText(item.event).toLowerCase() !== event) return false;
        return true;
      });
      res.status(200).json({ success: true, practices: filtered, count: filtered.length });
      return;
    }

    if (req.method === "POST" || req.method === "PATCH") {
      const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const practices = normalizeFieldPractices(Array.isArray(payload.practices) ? payload.practices : payload.practice ? [payload.practice] : [payload]);
      const deleteIds = Array.isArray(payload.deleteIds) ? payload.deleteIds.map(cleanSetupText).filter(Boolean) : [];
      if (!practices.length && !deleteIds.length) throw httpError(400, "No field practice records were provided.");
      const existing = await loadAccountRecord(accountKey);
      if (!existing.configured || !existing.found || !existing.record) throw httpError(404, "Account registry record was not found.");
      const byId = new Map();
      normalizeFieldPractices(existing.record.fieldPracticeSessions).forEach((item) => byId.set(item.id, item));
      deleteIds.forEach((id) => byId.delete(id));
      practices.forEach((item) => byId.set(item.id, item));
      const fieldPracticeSessions = Array.from(byId.values())
        .sort((a, b) => cleanSetupText(b.date).localeCompare(cleanSetupText(a.date)) || cleanSetupText(b.updatedAt).localeCompare(cleanSetupText(a.updatedAt)))
        .slice(0, 1000);
      const savedAt = new Date().toISOString();
      await saveAccountRecord(accountKey, {
        ...existing.record,
        fieldPracticeSessions,
        lastFieldPracticeSync: { savedAt, count: practices.length, total: fieldPracticeSessions.length },
      });
      res.status(200).json({ success: true, saved: true, practices: fieldPracticeSessions, count: fieldPracticeSessions.length, savedAt });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Field Practice save failed." });
  }
}

function normalizeFieldPractices(items) {
  return (Array.isArray(items) ? items : []).map(normalizeFieldPractice).filter(Boolean);
}

function normalizeFieldPractice(item) {
  const source = item && typeof item === "object" ? item : {};
  const date = cleanSetupText(source.date).slice(0, 10);
  const event = cleanSetupText(source.event || "Pole Vault").slice(0, 80) || "Pole Vault";
  const id = cleanSetupText(source.id) || `field_${date || new Date().toISOString().slice(0, 10)}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  if (!date) return null;
  return {
    id,
    date,
    event,
    groupId: cleanSetupText(source.groupId),
    groupName: cleanSetupText(source.groupName).slice(0, 120),
    athleteId: cleanSetupText(source.athleteId),
    athleteName: cleanSetupText(source.athleteName).slice(0, 120),
    coachName: cleanSetupText(source.coachName).slice(0, 120),
    focus: cleanSetupText(source.focus).slice(0, 120),
    routineKey: cleanSetupText(source.routineKey).slice(0, 80),
    routineName: cleanSetupText(source.routineName).slice(0, 120),
    setupType: normalizeFieldSetupType(source.setupType),
    height: normalizeFieldPracticeHeight(source.height),
    drills: normalizeFieldPracticeDrills(source.drills),
    athleteSummaries: normalizeFieldPracticeAthleteSummaries(source.athleteSummaries),
    speedMetrics: normalizeFieldPracticeSpeedMetrics(source.speedMetrics),
    attempts: normalizeFieldPracticeAttempts(source.attempts),
    attemptSummary: cleanSetupText(source.attemptSummary).slice(0, 500),
    planNotes: cleanSetupText(source.planNotes).slice(0, 2000),
    coachNotes: cleanSetupText(source.coachNotes).slice(0, 2000),
    createdAt: cleanSetupText(source.createdAt) || new Date().toISOString(),
    updatedAt: cleanSetupText(source.updatedAt) || new Date().toISOString(),
  };
}

function normalizeFieldSetupType(value) {
  const raw = cleanSetupText(value).toLowerCase();
  if (raw === "crossbar" || raw === "cross bar" || raw === "bar") return "Crossbar";
  if (raw === "bungee") return "Bungee";
  return raw ? cleanSetupText(value).slice(0, 40) : "";
}

function normalizeFieldPracticeHeight(value) {
  const original = cleanSetupText(value).slice(0, 40);
  let text = original.toLowerCase().replace(/\s+/g, "");
  text = text.replace(/[′’]/g, "'").replace(/[″"]/g, "").replace(/'/g, "-").replace(/[^\d.\-]/g, "");
  if (!text) return "";
  const parts = text.split("-").filter((part, index) => index === 0 || part !== "");
  let feet = 0;
  let inches = 0;
  if (parts.length > 1) {
    feet = parseInt(parts[0], 10);
    inches = parseFloat(parts.slice(1).join("."));
  } else {
    feet = parseInt(parts[0], 10);
    inches = 0;
  }
  if (!Number.isFinite(feet) || feet < 0 || !Number.isFinite(inches) || inches < 0) return original;
  inches = Math.round(inches * 4) / 4;
  while (inches >= 12) {
    feet += 1;
    inches -= 12;
  }
  let inchText = String(Math.floor(inches));
  const fraction = Number((inches - Math.floor(inches)).toFixed(2));
  if (fraction) inchText += fraction === 0.25 ? ".25" : fraction === 0.5 ? ".5" : fraction === 0.75 ? ".75" : "";
  return `${feet}-${inchText}`;
}

function normalizeFieldPracticeDrills(items) {
  return (Array.isArray(items) ? items : []).map((item, index) => {
    const source = item && typeof item === "object" ? item : { name: item };
    const name = cleanSetupText(source.name || source.label).slice(0, 120);
    if (!name) return null;
    return {
      id: cleanSetupText(source.id) || `drill_${index + 1}`,
      name,
      completed: source.completed === true,
      note: cleanSetupText(source.note).slice(0, 500),
    };
  }).filter(Boolean).slice(0, 40);
}

function normalizeFieldPracticeAthleteSummaries(items) {
  return (Array.isArray(items) ? items : []).map((item, index) => {
    const source = item && typeof item === "object" ? item : {};
    const athleteId = cleanSetupText(source.athleteId);
    const athleteName = cleanSetupText(source.athleteName || source.name).slice(0, 120);
    const focus = cleanSetupText(source.focus).slice(0, 120);
    const summary = cleanSetupText(source.summary || source.note || source.coachSummary).slice(0, 1000);
    const bestMark = cleanSetupText(source.bestMark || source.best || source.mark).slice(0, 80);
    if (!athleteId && !athleteName && !focus && !summary && !bestMark) return null;
    return {
      id: cleanSetupText(source.id) || `athlete_summary_${index + 1}`,
      athleteId,
      athleteName,
      focus,
      summary,
      bestMark,
      updatedAt: cleanSetupText(source.updatedAt) || new Date().toISOString(),
    };
  }).filter(Boolean).slice(0, 120);
}

function normalizeFieldPracticeDate(value) {
  const text = cleanSetupText(value).slice(0, 20);
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (match) {
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    return `${year}-${String(Number(match[1])).padStart(2, "0")}-${String(Number(match[2])).padStart(2, "0")}`;
  }
  return "";
}

function parseFieldPracticeSeconds(value) {
  const text = cleanSetupText(value).toLowerCase().replace(/sec(?:onds?)?$/i, "").replace(/s$/i, "").trim();
  if (!text) return 0;
  if (text.includes(":")) {
    const parts = text.split(":").map((part) => Number(part));
    if (parts.some((part) => !Number.isFinite(part) || part < 0)) return 0;
    return parts.reduce((total, part) => total * 60 + part, 0);
  }
  const seconds = Number(text);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

function roundedMetric(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Number(number.toFixed(3)) : 0;
}

function normalizeFieldPracticeSpeedMetrics(items) {
  return (Array.isArray(items) ? items : []).map((item, index) => {
    const source = item && typeof item === "object" ? item : {};
    const athleteId = cleanSetupText(source.athleteId);
    const athleteName = cleanSetupText(source.athleteName || source.name).slice(0, 120);
    const zone = cleanSetupText(source.zone || source.focus).slice(0, 120);
    const unit = cleanSetupText(source.unit).toLowerCase() === "yd" ? "yd" : "m";
    const rawDistance = Number(source.distance);
    const rawMeters = Number(source.meters);
    const distance = Number.isFinite(rawDistance) && rawDistance > 0
      ? rawDistance
      : Number.isFinite(rawMeters) && rawMeters > 0
        ? unit === "yd" ? rawMeters / 0.9144 : rawMeters
        : 0;
    const meters = Number.isFinite(rawMeters) && rawMeters > 0 ? rawMeters : unit === "yd" ? distance * 0.9144 : distance;
    const time = cleanSetupText(source.time).slice(0, 40);
    const rawSeconds = Number(source.seconds);
    const seconds = Number.isFinite(rawSeconds) && rawSeconds > 0 ? rawSeconds : parseFieldPracticeSeconds(time);
    const rawStrides = Number(source.strides);
    const strides = Number.isFinite(rawStrides) && rawStrides > 0 ? rawStrides : 0;
    const velocity = meters && seconds ? meters / seconds : Number(source.velocity) || 0;
    const strideLength = meters && strides ? meters / strides : Number(source.strideLength) || 0;
    const strideFrequency = strides && seconds ? strides / seconds : Number(source.strideFrequency) || 0;
    const note = cleanSetupText(source.note).slice(0, 500);
    if (!athleteId && !athleteName && !zone && !time && !strides && !note && !velocity) return null;
    return {
      id: cleanSetupText(source.id) || `speed_metric_${index + 1}`,
      athleteId,
      athleteName,
      gender: cleanSetupText(source.gender).slice(0, 40),
      year: cleanSetupText(source.year).slice(0, 20),
      grade: cleanSetupText(source.grade).slice(0, 20),
      date: normalizeFieldPracticeDate(source.date),
      metric: cleanSetupText(source.metric).slice(0, 80),
      rep: Math.max(1, parseInt(source.rep || index + 1, 10) || 1),
      zone,
      distance: roundedMetric(distance),
      unit,
      time,
      strides: roundedMetric(strides),
      note,
      meters: roundedMetric(meters),
      seconds: roundedMetric(seconds),
      velocity: roundedMetric(velocity),
      strideLength: roundedMetric(strideLength),
      strideFrequency: roundedMetric(strideFrequency),
      updatedAt: cleanSetupText(source.updatedAt) || new Date().toISOString(),
    };
  }).filter(Boolean).slice(0, 500);
}

function normalizeFieldPracticeAttempts(items) {
  return (Array.isArray(items) ? items : []).map((item, index) => {
    const source = item && typeof item === "object" ? item : {};
    const result = normalizeAttemptResult(source.result);
    const height = normalizeFieldPracticeHeight(source.height);
    if (!result && !height && !cleanSetupText(source.note)) return null;
    return {
      id: cleanSetupText(source.id) || `attempt_${index + 1}`,
      result,
      setupType: normalizeFieldSetupType(source.setupType),
      height,
      note: cleanSetupText(source.note).slice(0, 500),
    };
  }).filter(Boolean).slice(0, 80);
}

function normalizeAttemptResult(value) {
  const raw = cleanSetupText(value).toUpperCase();
  if (raw === "O" || raw === "MAKE" || raw === "MADE") return "O";
  if (raw === "X" || raw === "MISS" || raw === "MISSED") return "X";
  if (raw === "-" || raw === "PASS" || raw === "SKIP") return "-";
  return "";
}

async function accountBugTrak(req, res) {
  setBugTrakCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const { accountKey } = getGhlContext(req);

  try {
    if (req.method === "GET") {
      const reports = await loadBugTrakReports(accountKey, {
        status: firstQueryValue(req.query && req.query.status),
      });
      res.status(200).json({ success: true, reports, count: reports.length });
      return;
    }

    if (req.method === "POST") {
      const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const report = normalizeBugTrakPayload(payload, req, accountKey);
      if (!report) {
        res.status(400).json({ error: "Feedback summary or details are required." });
        return;
      }
      const saved = await saveBugTrakReport(accountKey, report);
      const savedReport = saved.report || report;
      const notification = savedReport.type === "idea"
        ? { sent: false, configured: !!bugTrakWebhookUrl(), reason: "Idea Trak is saved for beta review without immediate notification." }
        : await notifyBugTrak(savedReport, accountKey).catch((error) => ({
          sent: false,
          configured: !!bugTrakWebhookUrl(),
          error: error.message || "Bug Trak notification failed.",
        }));
      res.status(200).json({ success: !!saved.saved, notification, ...saved });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Bug Trak report failed." });
  }
}

function normalizeBugTrakPayload(payload, req, accountKey) {
  const source = payload || {};
  const type = cleanSetupText(source.type).toLowerCase() === "idea" ? "idea" : "bug";
  const summary = cleanSetupText(source.summary || source.title).slice(0, 180);
  const details = cleanSetupText(source.details || source.description || source.body).slice(0, 4000);
  if (!summary && !details) return null;
  return {
    id: cleanSetupText(source.id),
    type,
    accountKey,
    area: cleanSetupText(source.area),
    urgency: type === "idea" ? "Low" : cleanSetupText(source.urgency) || "Medium",
    summary,
    details,
    expected: cleanSetupText(source.expected),
    page: cleanSetupText(source.page),
    pageTitle: cleanSetupText(source.pageTitle),
    coachName: cleanSetupText(source.coachName || headerValue(req, "x-smartcoach-coach-name")),
    coachEmail: cleanSetupText(source.coachEmail),
    deviceLabel: cleanSetupText(source.deviceLabel || headerValue(req, "x-smartcoach-device-label")),
    userAgent: cleanSetupText(source.userAgent || headerValue(req, "user-agent")),
    createdAt: new Date().toISOString(),
  };
}

function bugTrakWebhookUrl() {
  return cleanSetupText(process.env.SMARTCOACH_BUGTRAK_WEBHOOK_URL || process.env.BUGTRAK_WEBHOOK_URL);
}

async function notifyBugTrak(report, accountKey) {
  const url = bugTrakWebhookUrl();
  if (!url) return { sent: false, configured: false, reason: "Bug Trak webhook is not configured." };
  const payload = bugTrakWebhookPayload(report, accountKey);
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  if (!response.ok) throw httpError(response.status, text || `Bug Trak webhook failed with ${response.status}.`);
  return { sent: true, configured: true, status: response.status };
}

function bugTrakWebhookPayload(report, accountKey) {
  const item = report || {};
  const submittedAt = new Date().toISOString();
  const type = cleanSetupText(item.type).toLowerCase() === "idea" ? "idea" : "bug";
  const label = type === "idea" ? "Idea Trak" : "Bug Trak";
  const feedbackTags = ["smartcoach-feedback", type === "idea" ? "smartcoach-idea-trak" : "smartcoach-bug-trak"];
  const title = `${label}: ${cleanSetupText(item.urgency) || "New"} - ${cleanSetupText(item.area) || "SMART Trak"}`;
  const body = [
    `Account: ${accountKey}`,
    `Coach: ${[cleanSetupText(item.coachName), cleanSetupText(item.coachEmail)].filter(Boolean).join(" ") || "Not provided"}`,
    "",
    `Page: ${cleanSetupText(item.pageTitle) || "Not provided"}`,
    `URL: ${cleanSetupText(item.page) || "Not provided"}`,
    "",
    type === "idea" ? "Idea:" : "Issue:",
    cleanSetupText(item.summary) || "Not provided",
    "",
    "Details:",
    cleanSetupText(item.details) || "Not provided",
    "",
    type === "idea" ? "Why it helps:" : "Expected:",
    cleanSetupText(item.expected) || "Not provided",
    "",
    `Submitted: ${submittedAt}`,
  ].join("\n");
  return {
    source: type === "idea" ? "SMARTCoach Idea Trak" : "SMARTCoach Bug Trak",
    accountKey,
    contactTags: feedbackTags,
    feedbackTags,
    feedbackContactType: type === "idea" ? "idea feedback" : "bug feedback",
    excludeFromAthletes: true,
    title,
    message: body,
    text: `${title}\n\n${body}`,
    notificationTitle: title,
    notificationBody: body,
    notificationText: `${title}\n\n${body}`,
    bugTrakTitle: title,
    bugTrakMessage: body,
    bugTrakText: `${title}\n\n${body}`,
    bugNotificationTitle: title,
    bugNotificationBody: body,
    bugNotificationText: `${title}\n\n${body}`,
    bugAccountKey: accountKey,
    bugReportId: cleanSetupText(item.id),
    bugType: type,
    bugStatus: cleanSetupText(item.status) || "New",
    bugUrgency: cleanSetupText(item.urgency),
    bugArea: cleanSetupText(item.area),
    bugSummary: cleanSetupText(item.summary),
    bugDetails: cleanSetupText(item.details),
    bugExpected: cleanSetupText(item.expected),
    bugPage: cleanSetupText(item.page),
    bugPageTitle: cleanSetupText(item.pageTitle),
    bugCoachName: cleanSetupText(item.coachName),
    bugCoachEmail: cleanSetupText(item.coachEmail),
    bugDeviceLabel: cleanSetupText(item.deviceLabel),
    bugUserAgent: cleanSetupText(item.userAgent),
    bugCreatedAt: cleanSetupText(item.createdAt),
    bugSubmittedAt: submittedAt,
    submittedAt,
    report: item,
  };
}

function setBugTrakCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-SMARTCoach-Account, X-SMARTCoach-Session, X-SMARTCoach-Access-Code, X-SMARTCoach-Device-Id, X-SMARTCoach-Device-Label, X-SMARTCoach-Coach-Id, X-SMARTCoach-Coach-Name");
}

async function accountDocuTrak(req, res) {
  setDocuTrakCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const { accountKey } = getGhlContext(req);

  try {
    if (req.method === "GET") {
      const existing = await loadAccountRecord(accountKey);
      res.status(200).json({ success: true, ...normalizeDocuTrak(existing && existing.record && existing.record.docuTrak) });
      return;
    }

    if (req.method !== "POST" && req.method !== "PATCH") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const existing = await loadAccountRecord(accountKey);
    if (!existing.configured || !existing.found || !existing.record) {
      res.status(404).json({ error: "Account registry record was not found." });
      return;
    }

    const current = normalizeDocuTrak(existing.record.docuTrak);
    const action = cleanSetupText(payload.action || payload.mode).toLowerCase();
    if (action === "save-items") {
      current.items = normalizeDocuItems(payload.items);
      setActiveDocuSeason(current, {
        items: current.items,
        records: current.records,
      });
    } else if (action === "save-athlete") {
      const athleteId = cleanSetupText(payload.athleteId || payload.contactId);
      const athleteName = cleanSetupText(payload.athleteName || payload.name);
      const athleteKey = docuAthleteKey(athleteId, athleteName);
      if (!athleteKey) throw httpError(400, "Athlete is required.");
      current.records[athleteKey] = {
        athleteId,
        athleteName,
        updatedAt: new Date().toISOString(),
        items: normalizeDocuAthleteItems(payload.items || payload.records),
      };
      setActiveDocuSeason(current, {
        items: current.items,
        records: current.records,
      });
    } else if (action === "start-season") {
      const nextSeason = normalizeDocuSeason({
        id: payload.seasonId,
        name: payload.seasonName || payload.name,
        sport: payload.sport,
        seasonYear: payload.seasonYear || payload.year,
        items: selectedDocuItems(current.items, payload.copyItemIds),
        records: {},
        active: true,
        archived: false,
        createdAt: new Date().toISOString(),
      }, current.seasons.length + 1);
      if (!nextSeason.id) throw httpError(400, "Season name is required.");
      current.seasons = current.seasons.map((season) => ({ ...season, active: false, archived: true }));
      current.seasons.push(nextSeason);
      current.activeSeasonId = nextSeason.id;
      current.items = nextSeason.items;
      current.records = {};
    } else if (action === "update-season") {
      updateActiveDocuSeason(current, {
        name: payload.seasonName || payload.name,
        sport: payload.sport,
        seasonYear: payload.seasonYear || payload.year,
      });
    } else {
      throw httpError(400, "Docu Trak action is required.");
    }

    await saveAccountRecord(accountKey, {
      ...existing.record,
      docuTrak: current,
      lastDocuTrakSync: { savedAt: new Date().toISOString(), action },
    });
    res.status(200).json({ success: true, ...current });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Docu Trak save failed." });
  }
}

function normalizeDocuTrak(source) {
  const value = source && typeof source === "object" ? source : {};
  const legacyItems = normalizeDocuItems(value.items);
  const legacyRecords = normalizeDocuRecords(value.records);
  let seasons = normalizeDocuSeasons(value.seasons);
  let activeSeasonId = normalizeDocuItemId(value.activeSeasonId || value.currentSeasonId);
  if (!seasons.length) {
    const fallback = defaultDocuSeason(legacyItems, legacyRecords);
    seasons = [fallback];
    activeSeasonId = fallback.id;
  }
  let activeSeason = seasons.find((season) => season.id === activeSeasonId) || seasons.find((season) => season.active) || seasons[0];
  activeSeasonId = activeSeason && activeSeason.id ? activeSeason.id : "";
  seasons = seasons.map((season) => ({ ...season, active: season.id === activeSeasonId, archived: season.id === activeSeasonId ? false : !!season.archived }));
  activeSeason = seasons.find((season) => season.id === activeSeasonId) || seasons[0] || defaultDocuSeason(legacyItems, legacyRecords);
  return {
    activeSeasonId,
    seasons,
    items: activeSeason.items,
    records: activeSeason.records,
  };
}

function normalizeDocuSeasons(seasons) {
  const source = Array.isArray(seasons) ? seasons : [];
  const seen = new Set();
  return source.map((season, index) => normalizeDocuSeason(season, index + 1)).filter((season) => {
    if (!season.id || seen.has(season.id)) return false;
    seen.add(season.id);
    return true;
  });
}

function normalizeDocuSeason(season, index) {
  const raw = season && typeof season === "object" ? season : {};
  const sport = cleanSetupText(raw.sport || "General").slice(0, 80);
  const seasonYear = cleanSetupText(raw.seasonYear || raw.year).slice(0, 10);
  const name = cleanSetupText(raw.name || [seasonYear, sport].filter(Boolean).join(" ") || `Season ${index}`).slice(0, 120);
  const id = normalizeDocuItemId(raw.id || name || `season_${index}`);
  return {
    id,
    name,
    sport,
    seasonYear,
    active: raw.active === true,
    archived: raw.archived === true,
    createdAt: cleanSetupText(raw.createdAt),
    items: normalizeDocuItems(raw.items),
    records: normalizeDocuRecords(raw.records),
  };
}

function defaultDocuSeason(items, records) {
  const year = new Date().getFullYear();
  return {
    id: `season_${year}_general`,
    name: `${year} General`,
    sport: "General",
    seasonYear: String(year),
    active: true,
    archived: false,
    createdAt: "",
    items,
    records,
  };
}

function setActiveDocuSeason(current, changes) {
  const id = current.activeSeasonId || (current.seasons[0] && current.seasons[0].id);
  current.seasons = current.seasons.map((season) => (
    season.id === id ? { ...season, ...changes, active: true, archived: false } : season
  ));
  current.activeSeasonId = id;
}

function selectedDocuItems(items, ids) {
  const source = normalizeDocuItems(items);
  const selected = Array.isArray(ids) ? ids.map(normalizeDocuItemId).filter(Boolean) : [];
  if (!selected.length) return source;
  const keep = new Set(selected);
  return source.filter((item) => keep.has(item.id));
}

function updateActiveDocuSeason(current, changes) {
  const id = current.activeSeasonId || (current.seasons[0] && current.seasons[0].id);
  const name = cleanSetupText(changes.name).slice(0, 120);
  if (!id || !name) throw httpError(400, "Season name is required.");
  const sport = cleanSetupText(changes.sport || "General").slice(0, 80);
  const seasonYear = cleanSetupText(changes.seasonYear).slice(0, 10);
  current.seasons = current.seasons.map((season) => (
    season.id === id
      ? { ...season, name, sport, seasonYear, active: true, archived: false }
      : season
  ));
  current.activeSeasonId = id;
  const activeSeason = current.seasons.find((season) => season.id === id);
  if (activeSeason) {
    current.items = activeSeason.items;
    current.records = activeSeason.records;
  }
}

function normalizeDocuItems(items) {
  const source = Array.isArray(items) && items.length ? items : defaultDocuItems();
  const seen = new Set();
  return source.map((item, index) => {
    const raw = typeof item === "string" ? { name: item } : item || {};
    const name = cleanSetupText(raw.name || raw.label || raw.title);
    if (!name) return null;
    const id = normalizeDocuItemId(raw.id || name || `item_${index + 1}`);
    if (!id || seen.has(id)) return null;
    seen.add(id);
    return {
      id,
      name,
      required: raw.required === false ? false : true,
      active: raw.active === false ? false : true,
      dueDate: cleanSetupText(raw.dueDate).slice(0, 10),
    };
  }).filter(Boolean);
}

function defaultDocuItems() {
  return [
    { id: "physical", name: "Physical", required: true, active: true },
    { id: "goals_form", name: "Goals Form", required: true, active: true },
    { id: "guidelines_expectations", name: "Guidelines / Expectations", required: true, active: true },
  ];
}

function normalizeDocuRecords(records) {
  const out = {};
  const source = records && typeof records === "object" ? records : {};
  Object.keys(source).forEach((key) => {
    const row = source[key] || {};
    const athleteKey = normalizeDocuRecordKey(key);
    if (!athleteKey) return;
    out[athleteKey] = {
      athleteId: cleanSetupText(row.athleteId),
      athleteName: cleanSetupText(row.athleteName),
      updatedAt: cleanSetupText(row.updatedAt),
      items: normalizeDocuAthleteItems(row.items),
    };
  });
  return out;
}

function normalizeDocuAthleteItems(items) {
  const out = {};
  const source = items && typeof items === "object" ? items : {};
  Object.keys(source).forEach((id) => {
    const itemId = normalizeDocuItemId(id);
    if (!itemId) return;
    const item = source[id] || {};
    out[itemId] = {
      status: normalizeDocuStatus(item.status),
      receivedDate: cleanSetupText(item.receivedDate || item.date).slice(0, 10),
      note: cleanSetupText(item.note || item.notes).slice(0, 800),
      updatedAt: cleanSetupText(item.updatedAt) || new Date().toISOString(),
    };
  });
  return out;
}

function normalizeDocuStatus(value) {
  const status = cleanSetupText(value).toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_+|_+$/g, "");
  if (["complete", "missing", "waived", "not_required"].includes(status)) return status;
  return "missing";
}

function docuAthleteKey(athleteId, athleteName) {
  return normalizeDocuRecordKey(athleteId || athleteName);
}

function normalizeDocuRecordKey(value) {
  return cleanSetupText(value).toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120);
}

function normalizeDocuItemId(value) {
  return cleanSetupText(value).toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
}

function setDocuTrakCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-SMARTCoach-Account, X-SMARTCoach-Session, X-SMARTCoach-Access-Code");
}

async function accountWeatherLocations(req, res) {
  setDocuTrakCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const { accountKey } = getGhlContext(req);

  try {
    if (req.method === "GET") {
      const existing = await loadAccountRecord(accountKey);
      const weatherLocations = normalizeWeatherLocations(existing && existing.record && existing.record.weatherLocations);
      res.status(200).json({ success: true, locations: weatherLocations });
      return;
    }

    if (req.method !== "POST" && req.method !== "PATCH") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const existing = await loadAccountRecord(accountKey);
    const weatherLocations = normalizeWeatherLocations(payload.locations);
    if (!existing.configured || !existing.found || !existing.record) {
      res.status(200).json({ success: true, saved: false, warning: "Account registry record was not found.", locations: weatherLocations });
      return;
    }

    await saveAccountRecord(accountKey, {
      ...existing.record,
      weatherLocations,
      lastWeatherLocationSync: { savedAt: new Date().toISOString(), count: weatherLocations.length },
    });
    res.status(200).json({ success: true, saved: true, locations: weatherLocations });
  } catch (error) {
    if (req.method === "POST" || req.method === "PATCH") {
      try {
        const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
        res.status(200).json({ success: true, saved: false, warning: error.message || "Weather locations could not be saved to the account.", locations: normalizeWeatherLocations(payload.locations) });
        return;
      } catch (parseError) {
        // Fall through to the normal error response for malformed payloads.
      }
    }
    res.status(error.statusCode || 500).json({ error: error.message || "Weather locations could not be saved." });
  }
}

function normalizeWeatherLocations(locations) {
  const seen = new Set();
  return (Array.isArray(locations) ? locations : []).map((location) => {
    const row = location || {};
    const name = cleanSetupText(row.name).slice(0, 120);
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    const key = `${name.toLowerCase()}|${latitude.toFixed(4)}|${longitude.toFixed(4)}`;
    if (seen.has(key)) return null;
    seen.add(key);
    return {
      name,
      latitude,
      longitude,
      timezone: cleanSetupText(row.timezone || "auto").slice(0, 80) || "auto",
    };
  }).filter(Boolean).slice(0, 10);
}

async function accountEquipmentTrak(req, res) {
  setDocuTrakCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const { accountKey } = getGhlContext(req);

  try {
    if (req.method === "GET") {
      const existing = await loadAccountRecord(accountKey);
      res.status(200).json({ success: true, ...normalizeEquipmentTrak(existing && existing.record && existing.record.equipmentTrak) });
      return;
    }

    if (req.method !== "POST" && req.method !== "PATCH") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const existing = await loadAccountRecord(accountKey);
    if (!existing.configured || !existing.found || !existing.record) {
      res.status(404).json({ error: "Account registry record was not found." });
      return;
    }

    const current = normalizeEquipmentTrak(existing.record.equipmentTrak);
    const action = cleanSetupText(payload.action || payload.mode).toLowerCase();
    if (action === "save-items") {
      current.items = normalizeEquipmentItems(payload.items);
      setActiveEquipmentSeason(current, { items: current.items, records: current.records, coachRecords: current.coachRecords, inventory: current.inventory });
    } else if (action === "save-inventory") {
      current.inventory = normalizeEquipmentInventory(payload.inventory || payload.items);
      setActiveEquipmentSeason(current, { items: current.items, records: current.records, coachRecords: current.coachRecords, inventory: current.inventory });
    } else if (action === "save-athlete") {
      const athleteId = cleanSetupText(payload.athleteId || payload.contactId);
      const contactId = cleanSetupText(payload.contactId);
      const smartcoachAthleteId = cleanSetupText(payload.smartcoachAthleteId);
      const athleteName = cleanSetupText(payload.athleteName || payload.name);
      const athleteKey = docuAthleteKey(athleteId, athleteName);
      if (!athleteKey) throw httpError(400, "Athlete is required.");
      const previous = current.records[athleteKey];
      equipmentAthleteAliasKeys({ athleteId, contactId, smartcoachAthleteId, athleteName }).forEach((key) => {
        if (key && key !== athleteKey) delete current.records[key];
      });
      current.records[athleteKey] = {
        athleteId,
        contactId,
        smartcoachAthleteId,
        athleteName,
        updatedAt: new Date().toISOString(),
        items: normalizeEquipmentAthleteItems(payload.items || payload.records),
      };
      const duplicate = duplicateIssuedEquipment(current.records, current.inventory, current.coachRecords);
      if (duplicate) {
        if (previous) current.records[athleteKey] = previous;
        else delete current.records[athleteKey];
        throw httpError(409, equipmentDuplicateMessage(duplicate));
      }
      setActiveEquipmentSeason(current, { items: current.items, records: current.records, coachRecords: current.coachRecords, inventory: current.inventory });
    } else if (action === "save-coach") {
      const coachName = cleanSetupText(payload.coachName || payload.name).slice(0, 120);
      const coachKey = normalizeDocuRecordKey(payload.coachId || coachName);
      if (!coachKey || !coachName) throw httpError(400, "Coach name is required.");
      const previous = current.coachRecords[coachKey];
      current.coachRecords[coachKey] = {
        coachId: coachKey,
        coachName,
        updatedAt: new Date().toISOString(),
        items: normalizeEquipmentAthleteItems(payload.items || payload.records),
      };
      const duplicate = duplicateIssuedEquipment(current.records, current.inventory, current.coachRecords);
      if (duplicate) {
        if (previous) current.coachRecords[coachKey] = previous;
        else delete current.coachRecords[coachKey];
        throw httpError(409, equipmentDuplicateMessage(duplicate));
      }
      setActiveEquipmentSeason(current, { items: current.items, records: current.records, coachRecords: current.coachRecords, inventory: current.inventory });
    } else if (action === "start-season") {
      const pool = normalizeEquipmentPool(payload.inventoryPool || payload.pool || payload.sport);
      const nextSeason = normalizeEquipmentSeason({
        id: payload.seasonId,
        name: payload.seasonName || payload.name,
        sport: payload.sport,
        seasonYear: payload.seasonYear || payload.year,
        inventoryPool: pool,
        items: selectedEquipmentItems(current.items, payload.copyItemIds),
        inventory: selectedEquipmentInventory(current.inventory, payload.copyInventory),
        records: outstandingEquipmentRecordsForPool(current.seasons, pool),
        coachRecords: outstandingCoachEquipmentRecordsForPool(current.seasons, pool),
        active: true,
        archived: false,
        createdAt: new Date().toISOString(),
      }, current.seasons.length + 1);
      if (!nextSeason.id) throw httpError(400, "Season name is required.");
      current.seasons = current.seasons.map((season) => ({ ...season, active: false, archived: true }));
      current.seasons.push(nextSeason);
      current.activeSeasonId = nextSeason.id;
      current.items = nextSeason.items;
      current.records = nextSeason.records;
      current.inventory = nextSeason.inventory;
    } else if (action === "update-season") {
      updateActiveEquipmentSeason(current, {
        name: payload.seasonName || payload.name,
        sport: payload.sport,
        seasonYear: payload.seasonYear || payload.year,
        inventoryPool: payload.inventoryPool || payload.pool,
      });
    } else if (action === "activate-season") {
      activateEquipmentSeason(current, payload.seasonId || payload.id);
    } else {
      throw httpError(400, "Equipment Trak action is required.");
    }

    await saveAccountRecord(accountKey, {
      ...existing.record,
      equipmentTrak: current,
      lastEquipmentTrakSync: { savedAt: new Date().toISOString(), action },
    });
    res.status(200).json({ success: true, ...normalizeEquipmentTrak(current) });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Equipment Trak save failed." });
  }
}

function normalizeEquipmentTrak(source) {
  const value = source && typeof source === "object" ? source : {};
  const legacyItems = normalizeEquipmentItems(value.items);
  const legacyRecords = normalizeEquipmentRecords(value.records);
  const legacyCoachRecords = normalizeEquipmentCoachRecords(value.coachRecords);
  const legacyInventory = normalizeEquipmentInventory(value.inventory);
  let seasons = normalizeEquipmentSeasons(value.seasons);
  let activeSeasonId = normalizeDocuItemId(value.activeSeasonId || value.currentSeasonId);
  if (!seasons.length) {
    const fallback = defaultEquipmentSeason(legacyItems, legacyRecords, legacyInventory, legacyCoachRecords);
    seasons = [fallback];
    activeSeasonId = fallback.id;
  }
  let activeSeason = seasons.find((season) => season.id === activeSeasonId) || seasons.find((season) => season.active) || seasons[0];
  activeSeasonId = activeSeason && activeSeason.id ? activeSeason.id : "";
  seasons = seasons.map((season) => ({ ...season, active: season.id === activeSeasonId, archived: season.id === activeSeasonId ? false : !!season.archived }));
  activeSeason = seasons.find((season) => season.id === activeSeasonId) || seasons[0] || defaultEquipmentSeason(legacyItems, legacyRecords, legacyInventory);
  const fallbackItems = legacyItems.length ? legacyItems : firstNonEmptyEquipmentItems(seasons);
  const fallbackRecords = Object.keys(legacyRecords).length ? legacyRecords : firstNonEmptyEquipmentRecords(seasons);
  const fallbackCoachRecords = Object.keys(legacyCoachRecords).length ? legacyCoachRecords : firstNonEmptyEquipmentCoachRecords(seasons);
  const fallbackInventory = legacyInventory.length ? legacyInventory : firstNonEmptyEquipmentInventory(seasons);
  if ((!activeSeason.items || !activeSeason.items.length) && fallbackItems.length) {
    activeSeason = { ...activeSeason, items: fallbackItems };
  }
  if ((!activeSeason.records || !Object.keys(activeSeason.records).length) && Object.keys(fallbackRecords).length) {
    activeSeason = { ...activeSeason, records: fallbackRecords };
  }
  if ((!activeSeason.coachRecords || !Object.keys(activeSeason.coachRecords).length) && Object.keys(fallbackCoachRecords).length) {
    activeSeason = { ...activeSeason, coachRecords: fallbackCoachRecords };
  }
  if ((!activeSeason.inventory || !activeSeason.inventory.length) && fallbackInventory.length) {
    activeSeason = { ...activeSeason, inventory: fallbackInventory };
  }
  seasons = seasons.map((season) => (season.id === activeSeason.id ? activeSeason : season));
  return {
    activeSeasonId,
    seasons,
    items: activeSeason.items,
    records: activeSeason.records,
    coachRecords: activeSeason.coachRecords || {},
    inventory: activeSeason.inventory,
  };
}

function firstNonEmptyEquipmentItems(seasons) {
  const found = (Array.isArray(seasons) ? seasons : []).find((season) => Array.isArray(season.items) && season.items.length);
  return found ? normalizeEquipmentItems(found.items) : [];
}

function firstNonEmptyEquipmentRecords(seasons) {
  const found = (Array.isArray(seasons) ? seasons : []).find((season) => season.records && Object.keys(season.records).length);
  return found ? normalizeEquipmentRecords(found.records) : {};
}

function firstNonEmptyEquipmentCoachRecords(seasons) {
  const found = (Array.isArray(seasons) ? seasons : []).find((season) => season.coachRecords && Object.keys(season.coachRecords).length);
  return found ? normalizeEquipmentCoachRecords(found.coachRecords) : {};
}

function firstNonEmptyEquipmentInventory(seasons) {
  const found = (Array.isArray(seasons) ? seasons : []).find((season) => Array.isArray(season.inventory) && season.inventory.length);
  return found ? normalizeEquipmentInventory(found.inventory) : [];
}

function normalizeEquipmentSeasons(seasons) {
  const source = Array.isArray(seasons) ? seasons : [];
  const seen = new Set();
  return source.map((season, index) => normalizeEquipmentSeason(season, index + 1)).filter((season) => {
    if (!season.id || seen.has(season.id)) return false;
    seen.add(season.id);
    return true;
  });
}

function normalizeEquipmentSeason(season, index) {
  const raw = season && typeof season === "object" ? season : {};
  const sport = cleanSetupText(raw.sport || "General").slice(0, 80);
  const seasonYear = cleanSetupText(raw.seasonYear || raw.year).slice(0, 10);
  const inventoryPool = normalizeEquipmentPool(raw.inventoryPool || raw.pool || sport);
  const name = cleanSetupText(raw.name || [seasonYear, sport].filter(Boolean).join(" ") || `Season ${index}`).slice(0, 120);
  const id = normalizeDocuItemId(raw.id || name || `season_${index}`);
  return {
    id,
    name,
    sport,
    seasonYear,
    inventoryPool,
    active: raw.active === true,
    archived: raw.archived === true,
    createdAt: cleanSetupText(raw.createdAt),
    items: normalizeEquipmentItems(raw.items),
    records: normalizeEquipmentRecords(raw.records),
    coachRecords: normalizeEquipmentCoachRecords(raw.coachRecords),
    inventory: normalizeEquipmentInventory(raw.inventory),
  };
}

function defaultEquipmentSeason(items, records, inventory, coachRecords = {}) {
  const year = new Date().getFullYear();
  return {
    id: `season_${year}_general`,
    name: `${year} General`,
    sport: "General",
    seasonYear: String(year),
    inventoryPool: "General",
    active: true,
    archived: false,
    createdAt: "",
    items,
    records,
    coachRecords,
    inventory,
  };
}

function normalizeEquipmentPool(value) {
  const text = cleanSetupText(value || "General").toLowerCase();
  if (text.includes("cross")) return "Cross Country";
  if (text.includes("track")) return "Track";
  return "General";
}

function setActiveEquipmentSeason(current, changes) {
  const id = current.activeSeasonId || (current.seasons[0] && current.seasons[0].id);
  current.seasons = current.seasons.map((season) => (
    season.id === id ? { ...season, ...changes, active: true, archived: false } : season
  ));
  current.activeSeasonId = id;
}

function updateActiveEquipmentSeason(current, changes) {
  const id = current.activeSeasonId || (current.seasons[0] && current.seasons[0].id);
  const name = cleanSetupText(changes.name).slice(0, 120);
  if (!id || !name) throw httpError(400, "Season name is required.");
  const sport = cleanSetupText(changes.sport || "General").slice(0, 80);
  const seasonYear = cleanSetupText(changes.seasonYear).slice(0, 10);
  const inventoryPool = normalizeEquipmentPool(changes.inventoryPool || sport);
  current.seasons = current.seasons.map((season) => (
    season.id === id ? { ...season, name, sport, seasonYear, inventoryPool, active: true, archived: false } : season
  ));
  current.activeSeasonId = id;
  const activeSeason = current.seasons.find((season) => season.id === id);
  if (activeSeason) {
    current.items = activeSeason.items;
    current.records = activeSeason.records;
    current.coachRecords = activeSeason.coachRecords || {};
    current.inventory = activeSeason.inventory;
  }
}

function activateEquipmentSeason(current, seasonId) {
  const id = normalizeDocuItemId(seasonId);
  if (!id || !(current.seasons || []).some((season) => season.id === id)) {
    throw httpError(404, "Equipment season was not found.");
  }
  current.seasons = current.seasons.map((season) => (
    season.id === id ? { ...season, active: true, archived: false } : { ...season, active: false, archived: true }
  ));
  current.activeSeasonId = id;
  const activeSeason = current.seasons.find((season) => season.id === id);
  current.items = activeSeason.items;
  current.records = activeSeason.records;
  current.coachRecords = activeSeason.coachRecords || {};
  current.inventory = activeSeason.inventory;
}

function selectedEquipmentItems(items, ids) {
  const source = normalizeEquipmentItems(items);
  const selected = Array.isArray(ids) ? ids.map(normalizeDocuItemId).filter(Boolean) : [];
  if (!selected.length) return source;
  const keep = new Set(selected);
  return source.filter((item) => keep.has(item.id));
}

function selectedEquipmentInventory(inventory, copyInventory) {
  if (copyInventory === false) return [];
  return normalizeEquipmentInventory(inventory);
}

function outstandingEquipmentRecordsForPool(seasons, pool) {
  const out = {};
  (Array.isArray(seasons) ? seasons : []).forEach((season) => {
    if (normalizeEquipmentPool(season.inventoryPool || season.sport) !== pool) return;
    Object.keys(season.records || {}).forEach((athleteKey) => {
      const record = season.records[athleteKey] || {};
      const items = {};
      Object.keys(record.items || {}).forEach((itemId) => {
        const item = record.items[itemId] || {};
        if (item.status === "issued" || item.status === "lost_damaged") items[itemId] = item;
      });
      if (Object.keys(items).length) {
        out[athleteKey] = { ...record, items, updatedAt: record.updatedAt || new Date().toISOString() };
      }
    });
  });
  return out;
}

function outstandingCoachEquipmentRecordsForPool(seasons, pool) {
  const out = {};
  (Array.isArray(seasons) ? seasons : []).forEach((season) => {
    if (normalizeEquipmentPool(season.inventoryPool || season.sport) !== pool) return;
    Object.keys(season.coachRecords || {}).forEach((coachKey) => {
      const record = season.coachRecords[coachKey] || {};
      const items = {};
      Object.keys(record.items || {}).forEach((itemId) => {
        const item = record.items[itemId] || {};
        if (item.status === "issued" || item.status === "lost_damaged") items[itemId] = item;
      });
      if (Object.keys(items).length) {
        out[coachKey] = { ...record, items, updatedAt: record.updatedAt || new Date().toISOString() };
      }
    });
  });
  return out;
}

function normalizeEquipmentItems(items) {
  const source = Array.isArray(items) && items.length ? items : defaultEquipmentItems();
  const seen = new Set();
  return source.map((item, index) => {
    const raw = typeof item === "string" ? { name: item } : item || {};
    const name = cleanSetupText(raw.name || raw.label || raw.title);
    if (!name) return null;
    const id = normalizeDocuItemId(raw.id || name || `item_${index + 1}`);
    if (!id || seen.has(id)) return null;
    seen.add(id);
    return {
      id,
      name,
      active: raw.active === false ? false : true,
      trackSize: raw.trackSize === false ? false : true,
      trackNumber: raw.trackNumber === false ? false : true,
    };
  }).filter(Boolean);
}

function defaultEquipmentItems() {
  return [
    { id: "uniform_top", name: "Uniform Top", active: true, trackSize: true, trackNumber: false },
    { id: "uniform_shorts", name: "Uniform Shorts", active: true, trackSize: true, trackNumber: false },
    { id: "warmup", name: "Warmup", active: true, trackSize: true, trackNumber: true },
    { id: "watch", name: "Watch", active: true, trackSize: false, trackNumber: true },
    { id: "stretch_strap", name: "Stretch Strap", active: true, trackSize: false, trackNumber: false },
  ];
}

function equipmentAthleteAliasKeys(row) {
  const source = row || {};
  return [
    source.athleteId,
    source.contactId,
    source.smartcoachAthleteId,
    source.athleteName,
    source.name,
  ].map(normalizeDocuRecordKey).filter(Boolean);
}

function normalizeEquipmentRecords(records) {
  const out = {};
  const source = records && typeof records === "object" ? records : {};
  Object.keys(source).forEach((key) => {
    const row = source[key] || {};
    const athleteKey = normalizeDocuRecordKey(key);
    if (!athleteKey) return;
    out[athleteKey] = {
      athleteId: cleanSetupText(row.athleteId),
      contactId: cleanSetupText(row.contactId),
      smartcoachAthleteId: cleanSetupText(row.smartcoachAthleteId),
      athleteName: cleanSetupText(row.athleteName),
      updatedAt: cleanSetupText(row.updatedAt),
      items: normalizeEquipmentAthleteItems(row.items),
    };
  });
  return out;
}

function normalizeEquipmentCoachRecords(records) {
  const out = {};
  const source = records && typeof records === "object" ? records : {};
  Object.keys(source).forEach((key) => {
    const row = source[key] || {};
    const coachName = cleanSetupText(row.coachName || row.name).slice(0, 120);
    const coachKey = normalizeDocuRecordKey(row.coachId || key || coachName);
    if (!coachKey || !coachName) return;
    out[coachKey] = {
      coachId: coachKey,
      coachName,
      updatedAt: cleanSetupText(row.updatedAt),
      items: normalizeEquipmentAthleteItems(row.items),
    };
  });
  return out;
}

function normalizeEquipmentAthleteItems(items) {
  const out = {};
  const source = items && typeof items === "object" ? items : {};
  Object.keys(source).forEach((id) => {
    const itemId = normalizeDocuItemId(id);
    if (!itemId) return;
    const item = source[id] || {};
    out[itemId] = {
      status: normalizeEquipmentStatus(item.status),
      size: cleanSetupText(item.size).slice(0, 80),
      number: cleanSetupText(item.number || item.itemNumber || item.inventoryId).slice(0, 80),
      program: normalizeEquipmentPool(item.program || item.sport || item.inventoryPool),
      group: normalizeEquipmentGroup(item.group || item.gender || item.team),
      issuedDate: cleanSetupText(item.issuedDate || item.date).slice(0, 10),
      returnedDate: cleanSetupText(item.returnedDate || item.returnDate).slice(0, 10),
      note: cleanSetupText(item.note || item.notes).slice(0, 800),
      updatedAt: cleanSetupText(item.updatedAt) || new Date().toISOString(),
    };
  });
  return out;
}

function normalizeEquipmentInventory(inventory) {
  const source = Array.isArray(inventory) ? inventory : [];
  return source.map((entry, index) => {
    const raw = entry || {};
    const itemId = normalizeDocuItemId(raw.itemId || raw.equipmentItemId || raw.item || raw.itemName);
    const itemName = cleanSetupText(raw.itemName || raw.name || raw.item).slice(0, 120);
    if (!itemId && !itemName) return null;
    const trackingType = normalizeInventoryTrackingType(raw.trackingType || raw.type);
    const quantity = Math.max(0, parseInt(raw.quantity, 10) || 0);
    const startNumber = cleanSetupText(raw.startNumber || raw.start || raw.from).slice(0, 40);
    const endNumber = cleanSetupText(raw.endNumber || raw.end || raw.to).slice(0, 40);
    return {
      id: normalizeDocuItemId(raw.id || `${itemId || itemName}_${index + 1}`) || `inventory_${index + 1}`,
      program: cleanSetupText(raw.program || raw.sport || raw.season).slice(0, 80),
      group: cleanSetupText(raw.group || raw.team || raw.gender).slice(0, 80),
      programScope: normalizeInventoryScope(raw.programScope || raw.sportScope),
      groupScope: normalizeInventoryScope(raw.groupScope || raw.genderScope),
      itemId,
      itemName,
      trackingType,
      size: cleanSetupText(raw.size).slice(0, 80),
      startNumber,
      endNumber,
      quantity: trackingType === "numbered" ? inventoryRangeCount(startNumber, endNumber) : quantity,
      model: cleanSetupText(raw.model || raw.modelNumber).slice(0, 80),
      serialNumber: cleanSetupText(raw.serialNumber || raw.serial).slice(0, 120),
      availability: normalizeEquipmentInventoryAvailability(raw.availability || raw.inventoryStatus || raw.status),
      lostNumbers: cleanSetupText(raw.lostNumbers || raw.lostNumber || raw.unavailableNumbers).slice(0, 240),
      lostQuantity: Math.max(0, parseInt(raw.lostQuantity || raw.unavailableQuantity, 10) || 0),
      note: cleanSetupText(raw.note || raw.notes).slice(0, 800),
      active: raw.active === false ? false : true,
      updatedAt: cleanSetupText(raw.updatedAt) || new Date().toISOString(),
    };
  }).filter(Boolean);
}

function normalizeInventoryTrackingType(value) {
  const type = cleanSetupText(value).toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_+|_+$/g, "");
  if (["numbered", "size_quantity", "count"].includes(type)) return type;
  return "numbered";
}

function normalizeInventoryScope(value) {
  const text = cleanSetupText(value || "separate").toLowerCase();
  return text.includes("shared") ? "shared" : "separate";
}

function normalizeEquipmentInventoryAvailability(value) {
  const text = cleanSetupText(value || "available").toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_+|_+$/g, "");
  return text === "lost_damaged" || text === "unavailable" ? "lost_damaged" : "available";
}

function normalizeEquipmentGroup(value) {
  const text = cleanSetupText(value || "General").toLowerCase();
  if (text.includes("girl") || text.includes("female")) return "Girls";
  if (text.includes("boy") || text.includes("male")) return "Boys";
  return "General";
}

function inventoryRangeCount(start, end) {
  const a = parseInt(cleanSetupText(start), 10);
  const b = parseInt(cleanSetupText(end), 10);
  if (Number.isFinite(a) && Number.isFinite(b) && b >= a) return b - a + 1;
  return start ? 1 : 0;
}

function duplicateIssuedEquipment(records, inventory, coachRecords = {}) {
  const seenScoped = {};
  const seenGlobal = {};
  const seenCoachGlobal = {};
  const seenUnavailableGlobal = {};
  const allRecords = [
    ...Object.keys(records || {}).map((key) => ({ key, type: "athlete", label: (records[key] && records[key].athleteName) || key, record: records[key] || {} })),
    ...Object.keys(coachRecords || {}).map((key) => ({ key: `coach_${key}`, type: "coach", label: (coachRecords[key] && coachRecords[key].coachName) || key, record: coachRecords[key] || {} })),
  ];
  let duplicate = null;
  allRecords.forEach((entry) => {
    const record = entry.record || {};
    Object.keys(record.items || {}).forEach((itemId) => {
      const item = record.items[itemId] || {};
      if ((item.status !== "issued" && item.status !== "lost_damaged") || !item.number) return;
      const globalKey = equipmentDuplicateGlobalKey(itemId, item);
      if (item.status === "lost_damaged" && globalKey) {
        if (!seenUnavailableGlobal[globalKey]) seenUnavailableGlobal[globalKey] = entry.label;
        return;
      }
      if (entry.type === "coach" && globalKey && seenGlobal[globalKey] && !duplicate) {
        duplicate = { itemId, number: item.number, firstRecipient: seenGlobal[globalKey] };
      }
      if (entry.type !== "coach" && globalKey && seenCoachGlobal[globalKey] && !duplicate) {
        duplicate = { itemId, number: item.number, firstRecipient: seenCoachGlobal[globalKey] };
      }
      equipmentDuplicateKeys(itemId, item, inventory).forEach((key) => {
        if (seenScoped[key] && !duplicate) {
          duplicate = { itemId, number: item.number, firstRecipient: seenScoped[key] };
        }
        if (!seenScoped[key]) seenScoped[key] = entry.label;
      });
      if (globalKey) {
        if (!seenGlobal[globalKey]) seenGlobal[globalKey] = entry.label;
        if (entry.type === "coach" && !seenCoachGlobal[globalKey]) seenCoachGlobal[globalKey] = entry.label;
      }
    });
  });
  const inventoryUnavailable = duplicateInventoryUnavailableEquipment(records, inventory, coachRecords);
  if (inventoryUnavailable) return inventoryUnavailable;
  if (!duplicate) {
    allRecords.forEach((entry) => {
      const record = entry.record || {};
      Object.keys(record.items || {}).forEach((itemId) => {
        const item = record.items[itemId] || {};
        if (item.status !== "issued" || !item.number) return;
        const globalKey = equipmentDuplicateGlobalKey(itemId, item);
        if (globalKey && seenUnavailableGlobal[globalKey] && !duplicate) {
          duplicate = { itemId, number: item.number, firstRecipient: `${seenUnavailableGlobal[globalKey]} as lost/damaged` };
        }
      });
    });
  }
  return duplicate;
}

function equipmentDuplicateMessage(duplicate) {
  if (!duplicate) return "Equipment could not be saved.";
  if (!duplicate.number) return `${duplicate.itemId} is not available to issue because of current Lost / Damaged or available inventory counts.`;
  if (String(duplicate.firstRecipient || "").toLowerCase().includes("lost/damaged") || String(duplicate.firstRecipient || "").toLowerCase().includes("lost / damaged")) return `${duplicate.itemId} #${duplicate.number} is marked Lost / Damaged. Update inventory before issuing it again.`;
  return `${duplicate.itemId} #${duplicate.number} is already issued to ${duplicate.firstRecipient}.`;
}

function duplicateInventoryUnavailableEquipment(records, inventory, coachRecords = {}) {
  const rows = normalizeEquipmentInventory(inventory);
  const allRecords = [
    ...Object.keys(records || {}).map((key) => ({ record: records[key] || {} })),
    ...Object.keys(coachRecords || {}).map((key) => ({ record: coachRecords[key] || {} })),
  ];
  for (const entry of allRecords) {
    const items = (entry.record && entry.record.items) || {};
    for (const itemId of Object.keys(items)) {
      const item = items[itemId] || {};
      if (item.status !== "issued") continue;
      const blocked = rows.find((row) => equipmentInventoryRowBlocksItem(row, itemId, item));
      if (blocked) return { itemId, number: item.number || "", firstRecipient: "Lost / Damaged inventory" };
    }
  }
  const capacityIssue = duplicateInventoryCapacityIssue(records, rows, coachRecords);
  if (capacityIssue) return capacityIssue;
  return null;
}

function duplicateInventoryCapacityIssue(records, inventory, coachRecords = {}) {
  const counts = {};
  const capacities = {};
  (inventory || []).filter((row) => row.trackingType !== "numbered").forEach((row) => {
    const key = equipmentInventoryCapacityKey(row.itemId, row);
    const total = row.trackingType === "numbered" ? inventoryRangeCount(row.startNumber, row.endNumber) : (Number(row.quantity) || 0);
    const lost = row.availability === "lost_damaged" ? total : Math.min(total, Math.max(0, Number(row.lostQuantity) || 0));
    capacities[key] = (capacities[key] || 0) + Math.max(0, total - lost);
  });
  const allRecords = [
    ...Object.keys(records || {}).map((key) => ({ record: records[key] || {} })),
    ...Object.keys(coachRecords || {}).map((key) => ({ record: coachRecords[key] || {} })),
  ];
  allRecords.forEach((entry) => {
    const items = (entry.record && entry.record.items) || {};
    Object.keys(items).forEach((itemId) => {
      const item = items[itemId] || {};
      if (item.status !== "issued" || item.number) return;
      const matchingRows = (inventory || []).filter((row) => row.trackingType !== "numbered" && equipmentInventoryRowMatchesItem(row, itemId, item));
      matchingRows.forEach((row) => {
        const key = equipmentInventoryCapacityKey(row.itemId, row);
        counts[key] = (counts[key] || 0) + 1;
      });
    });
  });
  const overKey = Object.keys(counts).find((key) => capacities[key] !== undefined && counts[key] > capacities[key]);
  return overKey ? { itemId: overKey.split("::")[0], number: "", firstRecipient: "available inventory" } : null;
}

function equipmentDuplicateKeys(itemId, item, inventory) {
  const normalizedItemId = normalizeDocuItemId(itemId);
  const number = normalizeEquipmentNumber(item.number);
  if (!normalizedItemId || !number) return [];
  const matches = normalizeEquipmentInventory(inventory).filter((row) => (
    row.itemId === normalizedItemId
    && row.trackingType === "numbered"
    && inventoryNumberInRange(item.number, row)
  ));
  if (!matches.length) return [`${normalizedItemId}::global::all::all::${number}`];
  return matches.map((row) => {
    const program = row.programScope === "shared" ? "all" : cleanSetupText(item.program || row.program || "General").toLowerCase();
    const group = row.groupScope === "shared" ? "all" : cleanSetupText(item.group || row.group || "General").toLowerCase();
    return `${normalizedItemId}::${program}::${group}::${number}`;
  });
}

function equipmentDuplicateGlobalKey(itemId, item) {
  const normalizedItemId = normalizeDocuItemId(itemId);
  const number = normalizeEquipmentNumber(item && item.number);
  return normalizedItemId && number ? `${normalizedItemId}::staff-global::${number}` : "";
}

function equipmentInventoryRowBlocksItem(row, itemId, item) {
  if (!equipmentInventoryRowMatchesItem(row, itemId, item)) return false;
  if (row.availability === "lost_damaged") return true;
  if (row.trackingType === "numbered" && item && item.number) {
    return equipmentLostNumberTokens(row.lostNumbers).some((number) => normalizeEquipmentNumber(number) === normalizeEquipmentNumber(item.number));
  }
  return false;
}

function equipmentInventoryRowMatchesItem(row, itemId, item) {
  if (!row || row.itemId !== normalizeDocuItemId(itemId)) return false;
  if (row.size && cleanSetupText(item && item.size).toLowerCase() !== cleanSetupText(row.size).toLowerCase()) return false;
  if (row.programScope !== "shared" && cleanSetupText(item && item.program).toLowerCase() !== cleanSetupText(row.program || "General").toLowerCase()) return false;
  if (row.groupScope !== "shared" && cleanSetupText(item && item.group).toLowerCase() !== cleanSetupText(row.group || "General").toLowerCase()) return false;
  return true;
}

function equipmentInventoryCapacityKey(itemId, row) {
  const program = row.programScope === "shared" ? "all" : cleanSetupText(row.program || "General").toLowerCase();
  const group = row.groupScope === "shared" ? "all" : cleanSetupText(row.group || "General").toLowerCase();
  return `${normalizeDocuItemId(itemId)}::${cleanSetupText(row.size).toLowerCase()}::${program}::${group}`;
}

function equipmentLostNumberTokens(value) {
  return cleanSetupText(value).split(/[,\s;]+/).map((part) => part.trim()).filter(Boolean);
}

function normalizeEquipmentNumber(value) {
  return cleanSetupText(value).toLowerCase().replace(/^0+([0-9]+)$/, "$1");
}

function inventoryNumberInRange(number, row) {
  const n = parseInt(cleanSetupText(number), 10);
  const a = parseInt(cleanSetupText(row && row.startNumber), 10);
  const b = parseInt(cleanSetupText(row && row.endNumber), 10);
  if (Number.isFinite(n) && Number.isFinite(a)) {
    if (!Number.isFinite(b)) return n === a;
    return n >= a && n <= b;
  }
  const parsed = inventoryAlphaNumber(number);
  const start = inventoryAlphaNumber(row && row.startNumber);
  const end = inventoryAlphaNumber(row && row.endNumber);
  if (parsed && start && parsed.prefix === start.prefix) {
    if (!end || end.prefix !== start.prefix) return parsed.num === start.num;
    return parsed.num >= start.num && parsed.num <= end.num;
  }
  return normalizeEquipmentNumber(number) === normalizeEquipmentNumber(row && row.startNumber);
}

function inventoryAlphaNumber(value) {
  const match = cleanSetupText(value).toLowerCase().match(/^([a-z]+)[\s-]*(\d+)$/);
  return match ? { prefix: match[1], num: parseInt(match[2], 10) } : null;
}

function normalizeEquipmentStatus(value) {
  const status = cleanSetupText(value).toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_+|_+$/g, "");
  if (["not_issued", "issued", "returned", "lost_damaged", "not_required"].includes(status)) return status;
  return "not_issued";
}

async function accountStatus(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const registry = await attachRegistryAccount(req);
  const { accountKey, token, locationId, productPlan, productPlanLabel, activeAthleteLimit, accessCode, coachSeats, coachAccessCodes, coachCodeVersion, requireCoachAccess, subscription, logoUrl } = getGhlContext(req);
  const coachSession = coachSessionFromRequest(req, accountKey);
  const currentCoachSession = coachSessionVersionAllowed(coachSession, coachCodeVersion) ? coachSession : null;
  const proPlan = isProPlan(productPlan);
  const essentialSessionActive = productPlan === "essential" ? essentialSessionMatches(coachSession, registry.record) : false;
  const suffix = accountKey.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const tokenKey = accountKey === "default" ? "GHL_PRIVATE_INTEGRATION_TOKEN" : `GHL_PRIVATE_INTEGRATION_TOKEN_${suffix}`;
  const locationKey = accountKey === "default" ? "GHL_LOCATION_ID" : `GHL_LOCATION_ID_${suffix}`;
  const coachAccessKey = accountKey === "default" ? "SMARTCOACH_COACH_ACCESS_CODES" : `SMARTCOACH_COACH_ACCESS_CODES_${suffix}`;
  const configuredCoachCodes = coachAccessCodes && coachAccessCodes.length ? coachAccessCodes.length : accessCode ? 1 : 0;
  const allowedCodes = coachAccessCodes && coachAccessCodes.length ? coachAccessCodes : accessCode ? [accessCode] : [];
  const providedAccessCode = String(headerValue(req, "x-smartcoach-access-code") || "").trim();
  const accessCodeAccepted = !!(providedAccessCode && allowedCodes.some((code) => safeEqual(providedAccessCode, code)));
  const expectedLocationId = cleanSetupText(firstQueryValue(req.query && (req.query.expectedLocationId || req.query.locationId)) || headerValue(req, "x-smartcoach-expected-location"));
  const resolvedLocationId = cleanSetupText(locationId);
  const crmConfigured = !!(token && locationId);
  const coachAccessConfigured = (!requireCoachAccess && proPlan) || configuredCoachCodes > 0;
  const configured = proPlan ? (crmConfigured && coachAccessConfigured) : coachAccessConfigured;
  const subscriptionAllowed = subscriptionAccessAllowed(subscription);
  const subscriptionBlockedReason = subscriptionAllowed ? "" : subscriptionBlockedMessage(subscription);
  const coachAccessRequired = !proPlan || configuredCoachCodes > 0 || !!requireCoachAccess;
  const coachAccessUnlocked = !coachAccessRequired || (proPlan ? !!currentCoachSession : essentialSessionActive) || accessCodeAccepted;
  const deviceAccessReady = configured && subscriptionAllowed && coachAccessUnlocked;
  const refreshedSession = currentCoachSession
    ? createCoachSession(accountKey, {
      coachIndex: Number(currentCoachSession.coachIndex) || 0,
      parentEmailAllowed: !!currentCoachSession.parentEmailAllowed,
      sessionId: cleanSetupText(currentCoachSession.sessionId),
      coachCodeVersion,
    })
    : null;
  if (refreshedSession && productPlan === "essential" && essentialSessionActive && registry.record) {
    await saveAccountRecord(accountKey, {
      ...registry.record,
      essentialActiveSession: {
        ...(registry.record.essentialActiveSession || {}),
        sessionId: cleanSetupText(currentCoachSession.sessionId),
        coachIndex: Number(currentCoachSession.coachIndex) || 0,
        expiresAt: refreshedSession.expiresAt,
        expiresAtIso: refreshedSession.expiresAtIso,
        refreshedAt: new Date().toISOString(),
      },
    }).catch(() => {});
  }
  if (deviceAccessReady) await recordRequestCoachDevice(req).catch(() => {});
  const coachDeviceUsage = configured ? await loadCoachDeviceUsage(accountKey) : undefined;
  const coachStaff = normalizeCoachStaff(registry.record && registry.record.coachStaff);
  const staffAdminAllowed = !!currentCoachSession && staffAccessAdminAllowed(currentCoachSession, coachStaff);
  const currentStaff = currentCoachSession ? coachStaff[Number(currentCoachSession.coachIndex) || 0] || null : null;
  const missing = [];
  if (proPlan && !token) missing.push({ label: "Private integration token", key: tokenKey });
  if (proPlan && !locationId) missing.push({ label: "Location ID", key: locationKey });
  if (requireCoachAccess && configuredCoachCodes < 1) missing.push({ label: "Coach access codes", key: coachAccessKey });
  res.status(configured ? 200 : 404).json({
    success: configured && subscriptionAllowed,
    accountKey,
    productPlan,
    productPlanLabel,
    activeAthleteLimit,
    configured,
    setupReady: configured,
    accessReady: configured && subscriptionAllowed,
    deviceAccessReady,
    crmConfigured,
    coachSeats,
    coachAccessCodesConfigured: configuredCoachCodes,
    coach: currentCoachSession ? {
      index: Number(currentCoachSession.coachIndex) || 0,
      label: currentStaff && currentStaff.name || `Coach ${(Number(currentCoachSession.coachIndex) || 0) + 1}`,
      role: currentStaff && currentStaff.role || "",
      staffAdminAllowed,
      parentEmailAllowed: parentEmailFeatureReleased() && !!currentCoachSession.parentEmailAllowed,
    } : null,
    coachSessionActive: proPlan ? !!currentCoachSession : essentialSessionActive,
    sessionToken: refreshedSession && refreshedSession.token || undefined,
    expiresAt: refreshedSession && refreshedSession.expiresAt || undefined,
    expiresAtIso: refreshedSession && refreshedSession.expiresAtIso || undefined,
    sessionRefreshed: !!refreshedSession,
    coachDeviceUsage,
    coachStaff: publicCoachStaff(coachStaff, coachAccessUnlocked),
    trainingCustomization: normalizeTrainingCustomization(registry.record && registry.record.trainingCustomization),
    dashboardPreferences: normalizeDashboardPreferences(registry.record && registry.record.dashboardPreferences),
    milesBoardSharing: normalizeMilesBoardSharing(registry.record && registry.record.milesBoardSharing),
    coachAccessUnlocked,
    staffAdminAllowed,
    coachAccessCodeAccepted: accessCodeAccepted,
    parentEmailToolsAllowed: parentEmailFeatureReleased() && !!(currentCoachSession && currentCoachSession.parentEmailAllowed),
    accessCodeRequired: coachAccessRequired,
    coachAccessRequired,
    accessCodeMissing: !!requireCoachAccess && configuredCoachCodes < 1,
    subscription: publicSubscriptionSummary(subscription),
    subscriptionAccessAllowed: subscriptionAllowed,
    subscriptionBlockedReason,
    registry: {
      configured: !!registry.configured,
      found: !!registry.found,
      source: registry.found ? "registry" : "environment",
      updatedAt: registry.record && registry.record.updatedAt || "",
      error: registry.error || undefined,
    },
    locationCheck: expectedLocationId ? {
      expected: maskLocationId(expectedLocationId),
      resolved: maskLocationId(resolvedLocationId),
      matches: !!resolvedLocationId && safeEqual(resolvedLocationId, expectedLocationId),
    } : undefined,
    logoUrl: logoUrl || "",
    missingVariables: configured ? [] : missing.map((item) => item.key),
    missingSetupFields: configured ? [] : missing,
    error: configured ? subscriptionBlockedReason || (!coachAccessUnlocked ? "Active coach code needed." : undefined) : `SMARTCoach account "${accountKey}" is not configured.`,
  });
}

async function accountDashboardPreferences(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const accountKey = normalizeSetupAccountKey(
    firstQueryValue(req.query && (req.query.account || req.query.tenant || req.query.key))
  ) || normalizeSetupAccountKey(headerValue(req, "x-smartcoach-account")) || "default";

  try {
    const existing = await loadAccountRecord(accountKey);
    if (!existing.configured || !existing.found || !existing.record) {
      throw httpError(404, "Account registry record was not found.");
    }

    if (req.method === "GET") {
      res.status(200).json({
        success: true,
        accountKey,
        dashboardPreferences: normalizeDashboardPreferences(existing.record.dashboardPreferences),
      });
      return;
    }

    if (req.method !== "POST" && req.method !== "PATCH") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    await attachRegistryAccountForKey(req, accountKey);
    const { coachCodeVersion, coachAccessCodes, accessCode } = getGhlContext(req);
    const session = coachSessionFromRequest(req, accountKey);
    const sessionAllowed = coachSessionVersionAllowed(session, coachCodeVersion);
    const providedAccessCode = cleanSetupText(headerValue(req, "x-smartcoach-access-code"));
    const allowedCodes = coachAccessCodes && coachAccessCodes.length ? coachAccessCodes : accessCode ? [accessCode] : [];
    const codeAllowed = providedAccessCode && allowedCodes.some((code) => safeEqual(providedAccessCode, code));
    if (!sessionAllowed && !codeAllowed) {
      throw httpError(401, "Active coach access is required to update dashboard preferences.");
    }

    const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const dashboardPreferences = normalizeDashboardPreferences(payload.dashboardPreferences || payload);
    await saveAccountRecord(accountKey, {
      ...existing.record,
      dashboardPreferences,
      lastDashboardPreferencesSync: {
        savedAt: new Date().toISOString(),
        visibleTools: Object.keys(dashboardPreferences.visibleTools).filter((key) => dashboardPreferences.visibleTools[key]),
      },
    });
    res.status(200).json({ success: true, accountKey, dashboardPreferences });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Dashboard preferences save failed." });
  }
}

async function accountMilesBoardLink(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const accountKey = normalizeSetupAccountKey(firstQueryValue(req.query && req.query.account) || accountKeyFromRequest(req));
  const existing = await loadAccountRecord(accountKey);
  const sharing = normalizeMilesBoardSharing(existing.record && existing.record.milesBoardSharing);
  if (!sharing.active) {
    res.status(403).json({ error: "Miles Board sharing is turned off." });
    return;
  }
  const token = milesBoardToken(accountKey, sharing.tokenVersion);
  const start = cleanSetupText(firstQueryValue(req.query && req.query.start));
  const end = cleanSetupText(firstQueryValue(req.query && req.query.end));
  const params = new URLSearchParams({ account: accountKey, token });
  if (/^\d{4}-\d{2}-\d{2}$/.test(start)) params.set("start", start);
  if (/^\d{4}-\d{2}-\d{2}$/.test(end)) params.set("end", end);
  params.set("challenge", sharing.challengeType);
  if (sharing.challengeTypes.length) params.set("challenges", sharing.challengeTypes.join(","));
  const compactParams = new URLSearchParams({
    k: milesBoardShareKey({
      account: accountKey,
      token,
      start: params.get("start"),
      end: params.get("end"),
      challenge: params.get("challenge"),
      challenges: params.get("challenges"),
    }),
  });
  res.status(200).json({
    success: true,
    token,
    milesBoardSharing: sharing,
    url: `/miles-board.html?${compactParams.toString()}`,
    legacyUrl: `/miles-board.html?${params.toString()}`,
  });
}

async function accountMilesBoard(req, res) {
  const share = milesBoardShareFromKey(firstQueryValue(req.query && req.query.k));
  const accountKey = normalizeSetupAccountKey(share.account || firstQueryValue(req.query && req.query.account) || accountKeyFromRequest(req));
  const provided = cleanSetupText(share.token || firstQueryValue(req.query && req.query.token));
  const existing = await loadAccountRecord(accountKey);
  const hasSavedSharing = !!(existing.record && existing.record.milesBoardSharing);
  const sharing = normalizeMilesBoardSharing(existing.record && existing.record.milesBoardSharing);
  if (!sharing.active) {
    res.status(403).json({ error: "Miles Board sharing is turned off." });
    return;
  }
  const expected = milesBoardToken(accountKey, sharing.tokenVersion);
  const legacyExpected = !hasSavedSharing ? legacyMilesBoardToken(accountKey) : "";
  if (!provided || (!safeEqual(provided, expected) && !safeEqual(provided, legacyExpected))) {
    res.status(403).json({ error: "Miles Board link is invalid or expired." });
    return;
  }
  if (!handlers.dashboard || typeof handlers.dashboard.publicMilesBoard !== "function") {
    res.status(500).json({ error: "Miles Board is not available." });
    return;
  }
  req.milesBoardSharing = sharing;
  req.milesBoardSnapshots = normalizeMilesBoardSnapshots(existing.record && existing.record.milesBoardSnapshots);
  if (share.start && req.query && !firstQueryValue(req.query.start)) req.query.start = share.start;
  if (share.end && req.query && !firstQueryValue(req.query.end)) req.query.end = share.end;
  if (share.challenge && req.query && !firstQueryValue(req.query.challenge)) req.query.challenge = share.challenge;
  if (share.challenges && req.query && !firstQueryValue(req.query.challenges)) req.query.challenges = share.challenges;
  return handlers.dashboard.publicMilesBoard(req, res);
}

async function accountMilesBoardSharing(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const accountKey = normalizeSetupAccountKey(
    firstQueryValue(req.query && (req.query.account || req.query.tenant || req.query.key))
  ) || normalizeSetupAccountKey(headerValue(req, "x-smartcoach-account")) || "default";

  try {
    const existing = await loadAccountRecord(accountKey);
    if (!existing.configured || !existing.found || !existing.record) {
      throw httpError(404, "Account registry record was not found.");
    }

    if (req.method === "GET") {
      res.status(200).json({
        success: true,
        accountKey,
        milesBoardSharing: normalizeMilesBoardSharing(existing.record.milesBoardSharing),
      });
      return;
    }

    if (req.method !== "POST" && req.method !== "PATCH") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    await attachRegistryAccountForKey(req, accountKey);
    const { coachCodeVersion, coachAccessCodes, accessCode } = getGhlContext(req);
    const session = coachSessionFromRequest(req, accountKey);
    const sessionAllowed = coachSessionVersionAllowed(session, coachCodeVersion);
    const providedAccessCode = cleanSetupText(headerValue(req, "x-smartcoach-access-code"));
    const allowedCodes = coachAccessCodes && coachAccessCodes.length ? coachAccessCodes : accessCode ? [accessCode] : [];
    const codeAllowed = providedAccessCode && allowedCodes.some((code) => safeEqual(providedAccessCode, code));
    if (!sessionAllowed && !codeAllowed) {
      throw httpError(401, "Active coach access is required to update Miles Board sharing.");
    }

    const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const current = normalizeMilesBoardSharing(existing.record.milesBoardSharing);
    const input = payload.milesBoardSharing && typeof payload.milesBoardSharing === "object" ? payload.milesBoardSharing : payload;
    const action = cleanSetupText(payload.action || input.action).toLowerCase();
    const next = normalizeMilesBoardSharing({ ...current, ...input });
    let milesBoardSnapshots = normalizeMilesBoardSnapshots(existing.record.milesBoardSnapshots);
    if (action === "reset") {
      next.active = true;
      next.tokenVersion = milesBoardTokenVersion();
      next.resetAt = new Date().toISOString();
    }
    if (action === "snapshot") {
      const snapshot = normalizeMilesBoardSnapshot(payload.snapshot || input.snapshot);
      if (!snapshot) throw httpError(400, "Miles Board snapshot was empty.");
      milesBoardSnapshots = [snapshot, ...milesBoardSnapshots.filter((item) => item.id !== snapshot.id && item.rangeLabel !== snapshot.rangeLabel)].slice(0, 12);
    }
    next.updatedAt = new Date().toISOString();
    await saveAccountRecord(accountKey, {
      ...existing.record,
      milesBoardSharing: next,
      milesBoardSnapshots,
      lastMilesBoardSharingSync: {
        savedAt: next.updatedAt,
        active: next.active,
        challengeType: next.challengeType,
        challengeTypes: next.challengeTypes,
        resetAt: next.resetAt || "",
        snapshotSaved: action === "snapshot",
      },
    });
    res.status(200).json({ success: true, accountKey, milesBoardSharing: next, milesBoardSnapshots });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Miles Board sharing save failed." });
  }
}

async function accountSpeedBoardLink(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const accountKey = normalizeSetupAccountKey(firstQueryValue(req.query && req.query.account) || accountKeyFromRequest(req));
  const existing = await loadAccountRecord(accountKey);
  const sharing = normalizeSpeedBoardSharing(existing.record && existing.record.speedBoardSharing);
  if (!sharing.active) {
    res.status(403).json({ error: "Speed Trak Board sharing is turned off." });
    return;
  }
  const token = speedBoardToken(accountKey, sharing.tokenVersion);
  const metric = cleanSetupText(firstQueryValue(req.query && req.query.metric)).slice(0, 80);
  const gender = normalizeSpeedBoardGender(firstQueryValue(req.query && req.query.gender));
  const year = cleanSetupText(firstQueryValue(req.query && req.query.year)).slice(0, 20);
  const params = new URLSearchParams({ account: accountKey, token });
  if (metric) params.set("metric", metric);
  if (gender) params.set("gender", gender);
  if (year) params.set("year", year);
  params.set("challenge", sharing.challengeType);
  if (sharing.challengeTypes.length) params.set("challenges", sharing.challengeTypes.join(","));
  const compactParams = new URLSearchParams({
    k: speedBoardShareKey({
      account: accountKey,
      token,
      metric: params.get("metric"),
      gender: params.get("gender"),
      year: params.get("year"),
      challenge: params.get("challenge"),
      challenges: params.get("challenges"),
    }),
  });
  res.status(200).json({
    success: true,
    token,
    speedBoardSharing: sharing,
    url: `/speed-board.html?${compactParams.toString()}`,
    legacyUrl: `/speed-board.html?${params.toString()}`,
  });
}

async function accountSpeedBoard(req, res) {
  const share = speedBoardShareFromKey(firstQueryValue(req.query && req.query.k));
  const accountKey = normalizeSetupAccountKey(share.account || firstQueryValue(req.query && req.query.account) || accountKeyFromRequest(req));
  const provided = cleanSetupText(share.token || firstQueryValue(req.query && req.query.token));
  const existing = await loadAccountRecord(accountKey);
  const sharing = normalizeSpeedBoardSharing(existing.record && existing.record.speedBoardSharing);
  if (!sharing.active) {
    res.status(403).json({ error: "Speed Trak Board sharing is turned off." });
    return;
  }
  const expected = speedBoardToken(accountKey, sharing.tokenVersion);
  if (!provided || !safeEqual(provided, expected)) {
    res.status(403).json({ error: "Speed Trak Board link is invalid or expired." });
    return;
  }
  try {
    const metric = cleanSetupText(share.metric || firstQueryValue(req.query && req.query.metric)).slice(0, 80);
    const gender = normalizeSpeedBoardGender(share.gender || firstQueryValue(req.query && req.query.gender));
    const year = cleanSetupText(share.year || firstQueryValue(req.query && req.query.year)).slice(0, 20);
    const practices = normalizeFieldPractices(existing.record && existing.record.fieldPracticeSessions);
    const gameSettings = normalizeSpeedBoardGameSettings(sharing.gameSettings);
    const challengeTypes = normalizeSpeedBoardChallenges(share.challenges || firstQueryValue(req.query && req.query.challenges) || sharing.challengeTypes);
    const rows = buildSpeedBoardRows({ practices, metric, gender, year, gameSettings });
    const totalReps = rows.reduce((sum, row) => sum + row.reps, 0);
    res.status(200).json({
      success: true,
      accountKey,
      generatedAt: new Date().toISOString(),
      challengeType: challengeTypes[0] || sharing.challengeType,
      challengeTypes,
      gameSettings,
      filters: {
        metric: metric || "All metrics",
        gender: gender || "",
        year: year || "",
        label: speedBoardFilterLabel({ metric, gender, year }),
      },
      totals: {
        athletes: rows.length,
        reps: totalReps,
        averageReps: rows.length ? Math.round((totalReps / rows.length) * 10) / 10 : 0,
        bestMark: rows[0] && rows[0].bestSeconds ? rows[0].bestSeconds : 0,
        bestVelocity: rows.reduce((best, row) => Math.max(best, Number(row.bestVelocity) || 0), 0),
      },
      highlights: speedBoardHighlights(rows),
      weeklyWinners: speedBoardWeeklyWinners(rows),
      rows,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Speed Trak Board lookup failed." });
  }
}

async function accountSpeedBoardSharing(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const accountKey = normalizeSetupAccountKey(
    firstQueryValue(req.query && (req.query.account || req.query.tenant || req.query.key))
  ) || normalizeSetupAccountKey(headerValue(req, "x-smartcoach-account")) || "default";

  try {
    const existing = await loadAccountRecord(accountKey);
    if (!existing.configured || !existing.found || !existing.record) {
      throw httpError(404, "Account registry record was not found.");
    }

    if (req.method === "GET") {
      res.status(200).json({
        success: true,
        accountKey,
        speedBoardSharing: normalizeSpeedBoardSharing(existing.record.speedBoardSharing),
      });
      return;
    }

    if (req.method !== "POST" && req.method !== "PATCH") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    await attachRegistryAccountForKey(req, accountKey);
    const { coachCodeVersion, coachAccessCodes, accessCode } = getGhlContext(req);
    const session = coachSessionFromRequest(req, accountKey);
    const sessionAllowed = coachSessionVersionAllowed(session, coachCodeVersion);
    const providedAccessCode = cleanSetupText(headerValue(req, "x-smartcoach-access-code"));
    const allowedCodes = coachAccessCodes && coachAccessCodes.length ? coachAccessCodes : accessCode ? [accessCode] : [];
    const codeAllowed = providedAccessCode && allowedCodes.some((code) => safeEqual(providedAccessCode, code));
    if (!sessionAllowed && !codeAllowed) {
      throw httpError(401, "Active coach access is required to update Speed Trak Board sharing.");
    }

    const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const current = normalizeSpeedBoardSharing(existing.record.speedBoardSharing);
    const input = payload.speedBoardSharing && typeof payload.speedBoardSharing === "object" ? payload.speedBoardSharing : payload;
    const action = cleanSetupText(payload.action || input.action).toLowerCase();
    const next = normalizeSpeedBoardSharing({ ...current, ...input });
    if (action === "reset") {
      next.active = true;
      next.tokenVersion = speedBoardTokenVersion();
      next.resetAt = new Date().toISOString();
    }
    next.updatedAt = new Date().toISOString();
    await saveAccountRecord(accountKey, {
      ...existing.record,
      speedBoardSharing: next,
      lastSpeedBoardSharingSync: {
        savedAt: next.updatedAt,
        active: next.active,
        challengeType: next.challengeType,
        challengeTypes: next.challengeTypes,
        resetAt: next.resetAt || "",
      },
    });
    res.status(200).json({ success: true, accountKey, speedBoardSharing: next });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Speed Trak Board sharing save failed." });
  }
}

function defaultDashboardVisibleTools() {
  return {
    keepTrak: true,
    attendanceTrak: true,
    equipmentTrak: true,
    docuTrak: true,
    weather: true,
    records: true,
    simulators: true,
  };
}

function normalizeDashboardPreferences(source) {
  const input = source && typeof source === "object" ? source : {};
  const raw = input.visibleTools && typeof input.visibleTools === "object" ? input.visibleTools : input;
  const visibleTools = defaultDashboardVisibleTools();
  Object.keys(visibleTools).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(raw, key)) visibleTools[key] = raw[key] !== false;
  });
  return {
    version: 1,
    updatedAt: cleanSetupText(input.updatedAt) || new Date().toISOString(),
    visibleTools,
  };
}

function normalizeMilesBoardSharing(source) {
  const input = source && typeof source === "object" ? source : {};
  const challengeTypes = normalizeMilesBoardChallenges(input.challengeTypes || input.challengeType || input.challenge || "total");
  return {
    version: 1,
    active: input.active !== false,
    challengeType: challengeTypes[0],
    challengeTypes,
    displayOptions: normalizeMilesBoardDisplayOptions(input.displayOptions),
    gameSettings: normalizeMilesBoardGameSettings(input.gameSettings),
    tokenVersion: cleanSetupText(input.tokenVersion) || "1",
    updatedAt: cleanSetupText(input.updatedAt) || new Date().toISOString(),
    resetAt: cleanSetupText(input.resetAt),
  };
}

function normalizeMilesBoardDisplayOptions(source) {
  const input = source && typeof source === "object" ? source : {};
  return {
    teamAttendance: input.teamAttendance === true,
    athleteAttendance: input.athleteAttendance === true,
  };
}

function normalizeMilesBoardGameSettings(source) {
  const input = source && typeof source === "object" ? source : {};
  return {
    challengeName: cleanSetupText(input.challengeName).slice(0, 80) || "Summer Mileage Challenge",
    coachMessage: cleanSetupText(input.coachMessage).slice(0, 240),
    teamGoalMiles: milesBoardNumber(input.teamGoalMiles, 0, 10000),
    athleteGoalMiles: milesBoardNumber(input.athleteGoalMiles, 0, 1000),
    pointsPerMile: milesBoardNumber(input.pointsPerMile, 1, 100),
    pointsPerWorkout: milesBoardNumber(input.pointsPerWorkout, 3, 100),
    pointsPerCurrentWeekMile: milesBoardNumber(input.pointsPerCurrentWeekMile, 1, 100),
    pointsPerImprovementMile: milesBoardNumber(input.pointsPerImprovementMile, 2, 100),
    consistencyDays: Math.round(milesBoardNumber(input.consistencyDays, 3, 14)),
    consistencyBonus: milesBoardNumber(input.consistencyBonus, 5, 500),
  };
}

function normalizeMilesBoardSnapshots(source) {
  const list = Array.isArray(source) ? source : [];
  return list.map(normalizeMilesBoardSnapshot).filter(Boolean).slice(0, 12);
}

function normalizeMilesBoardSnapshot(source) {
  const input = source && typeof source === "object" ? source : {};
  const rangeLabel = cleanSetupText(input.rangeLabel).slice(0, 60);
  if (!rangeLabel) return null;
  const savedAt = cleanSetupText(input.savedAt) || new Date().toISOString();
  return {
    id: cleanSetupText(input.id).slice(0, 80) || `miles_${Date.now()}`,
    rangeLabel,
    savedAt,
    challengeName: cleanSetupText(input.challengeName).slice(0, 80),
    coachMessage: cleanSetupText(input.coachMessage).slice(0, 240),
    totalMiles: milesBoardNumber(input.totalMiles, 0, 100000),
    workouts: Math.round(milesBoardNumber(input.workouts, 0, 100000)),
    athletesActive: Math.round(milesBoardNumber(input.athletesActive, 0, 10000)),
    packLeader: cleanSetupText(input.packLeader).slice(0, 80),
    mileageWinner: cleanSetupText(input.mileageWinner).slice(0, 80),
    gameWinner: cleanSetupText(input.gameWinner).slice(0, 80),
    consistencyWinner: cleanSetupText(input.consistencyWinner).slice(0, 80),
    bigMover: cleanSetupText(input.bigMover).slice(0, 80),
  };
}

function milesBoardNumber(value, fallback, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.min(number, max);
}

function uniqueStrings(values) {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).map(cleanSetupText).filter(Boolean).filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeMilesBoardChallenges(values) {
  const list = Array.isArray(values) ? values : cleanSetupText(values).split(",");
  const seen = new Set();
  const normalized = list.map(normalizeMilesBoardChallenge).filter(Boolean).filter((value) => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
  return normalized.length ? normalized : ["total"];
}

function normalizeMilesBoardChallenge(value) {
  const text = cleanSetupText(value).toLowerCase().replace(/[^a-z]/g, "");
  if (text === "game" || text === "gamescore" || text === "points" || text === "score") return "game";
  if (text === "weekly" || text === "week" || text === "thisweek") return "weekly";
  if (text === "consistency" || text === "workouts" || text === "logs") return "consistency";
  if (text === "mover" || text === "bigmover" || text === "weekchange") return "mover";
  return "total";
}

function normalizeSpeedBoardSharing(source) {
  const input = source && typeof source === "object" ? source : {};
  const challengeTypes = normalizeSpeedBoardChallenges(input.challengeTypes || input.challengeType || input.challenge || "velocity");
  return {
    active: input.active !== false,
    challengeType: challengeTypes[0],
    challengeTypes,
    gameSettings: normalizeSpeedBoardGameSettings(input.gameSettings),
    tokenVersion: cleanSetupText(input.tokenVersion) || "1",
    updatedAt: cleanSetupText(input.updatedAt) || new Date().toISOString(),
    resetAt: cleanSetupText(input.resetAt),
  };
}

function normalizeSpeedBoardGameSettings(source) {
  const input = source && typeof source === "object" ? source : {};
  return {
    challengeName: cleanSetupText(input.challengeName).slice(0, 80) || "Speed Trak Leaderboard",
    coachMessage: cleanSetupText(input.coachMessage).slice(0, 240),
    pointsPerVelocity: milesBoardNumber(input.pointsPerVelocity, 10, 500),
    pointsPerRep: milesBoardNumber(input.pointsPerRep, 2, 100),
    pointsPerImprovement: milesBoardNumber(input.pointsPerImprovement, 5, 500),
  };
}

function normalizeSpeedBoardChallenges(values) {
  const list = Array.isArray(values) ? values : cleanSetupText(values).split(",");
  const seen = new Set();
  const normalized = list.map(normalizeSpeedBoardChallenge).filter(Boolean).filter((value) => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
  return normalized.length ? normalized : ["velocity"];
}

function normalizeSpeedBoardChallenge(value) {
  const text = cleanSetupText(value).toLowerCase().replace(/[^a-z]/g, "");
  if (text === "fastest" || text === "time" || text === "mark") return "fastest";
  if (text === "consistency" || text === "reps" || text === "logs") return "consistency";
  if (text === "improvement" || text === "mover" || text === "bigmover") return "improvement";
  if (text === "game" || text === "points" || text === "score") return "game";
  return "velocity";
}

function normalizeSpeedBoardGender(value) {
  const text = cleanSetupText(value).toLowerCase();
  if (text === "boy" || text === "boys" || text === "male" || text === "m") return "boy";
  if (text === "girl" || text === "girls" || text === "female" || text === "f") return "girl";
  return "";
}

function buildSpeedBoardRows({ practices, metric, gender, year, gameSettings }) {
  const rowsByAthlete = new Map();
  normalizeSpeedBoardReps(practices).filter((rep) => {
    if (metric && rep.metric !== metric) return false;
    if (gender && rep.gender !== gender) return false;
    if (year && String(rep.year) !== String(year)) return false;
    return true;
  }).forEach((rep) => {
    const key = cleanSetupText(rep.athleteName).toLowerCase();
    if (!key) return;
    if (!rowsByAthlete.has(key)) rowsByAthlete.set(key, []);
    rowsByAthlete.get(key).push(rep);
  });
  const rows = Array.from(rowsByAthlete.values()).map((reps) => speedBoardAthleteRow(reps, gameSettings));
  return speedBoardCompetitionBadges(rows).sort((a, b) => (Number(b.bestVelocity) || 0) - (Number(a.bestVelocity) || 0) || (Number(a.bestSeconds) || 999999) - (Number(b.bestSeconds) || 999999) || a.athleteName.localeCompare(b.athleteName));
}

function normalizeSpeedBoardReps(practices) {
  const out = [];
  (Array.isArray(practices) ? practices : []).forEach((practice) => {
    const metrics = Array.isArray(practice.speedMetrics) ? practice.speedMetrics : [];
    metrics.forEach((rep) => {
      const seconds = speedBoardSeconds(rep.seconds || rep.time);
      const meters = speedBoardMeters(rep, practice);
      const athleteName = cleanSetupText(rep.athleteName || rep.name || [rep.firstName, rep.lastName].filter(Boolean).join(" "));
      if (!athleteName || !seconds || !meters) return;
      const strides = Number(rep.strides || rep.strideCount) || 0;
      const date = cleanSetupText(rep.date || practice.date).slice(0, 10);
      out.push({
        athleteName,
        gender: normalizeSpeedBoardGender(rep.gender),
        year: cleanSetupText(rep.year || practice.year || date.slice(0, 4)),
        grade: cleanSetupText(rep.grade),
        metric: cleanSetupText(rep.metric) || speedBoardMetricLabel(rep, practice),
        seconds,
        meters,
        velocity: speedBoardRound(rep.velocity || meters / seconds, 2),
        strideLength: speedBoardRound(rep.strideLength || (strides ? meters / strides : 0), 2),
        strideFrequency: speedBoardRound(rep.strideFrequency || (strides ? strides / seconds : 0), 2),
        strides,
        date,
      });
    });
  });
  return out;
}

function speedBoardAthleteRow(reps, gameSettings) {
  const sortedByTime = reps.slice().sort((a, b) => a.seconds - b.seconds || String(b.date).localeCompare(String(a.date)));
  const sortedByVelocity = reps.slice().sort((a, b) => b.velocity - a.velocity || a.seconds - b.seconds);
  const best = sortedByTime[0] || sortedByVelocity[0] || {};
  const velocityBest = sortedByVelocity[0] || best;
  const latest = reps.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || {};
  const first = reps.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)))[0] || {};
  const improvement = first.seconds && best.seconds && first.seconds > best.seconds ? speedBoardRound(first.seconds - best.seconds, 2) : 0;
  const row = {
    athleteName: best.athleteName || "Athlete",
    gender: best.gender || "",
    year: best.year || "",
    grade: best.grade || "",
    metric: best.metric || velocityBest.metric || "Speed Metrics",
    bestSeconds: speedBoardRound(best.seconds, 2),
    bestVelocity: speedBoardRound(velocityBest.velocity, 2),
    strideLength: speedBoardRound(velocityBest.strideLength, 2),
    strideFrequency: speedBoardRound(velocityBest.strideFrequency, 2),
    reps: reps.length,
    latestDate: latest.date || "",
    improvementSeconds: improvement,
  };
  return {
    ...row,
    gameScore: speedBoardGameScore(row, gameSettings),
    badges: speedBoardBadges(row),
  };
}

function speedBoardGameScore(row, settings) {
  const gameSettings = normalizeSpeedBoardGameSettings(settings);
  return Math.round((Number(row.bestVelocity) || 0) * gameSettings.pointsPerVelocity)
    + Math.round((Number(row.reps) || 0) * gameSettings.pointsPerRep)
    + Math.round((Number(row.improvementSeconds) || 0) * gameSettings.pointsPerImprovement);
}

function speedBoardBadges(row) {
  const badges = [];
  if ((Number(row.bestVelocity) || 0) >= 9) badges.push("Velocity Club");
  if ((Number(row.reps) || 0) >= 5) badges.push("Consistent Sprinter");
  if ((Number(row.improvementSeconds) || 0) > 0) badges.push("Big Mover");
  if ((Number(row.strideFrequency) || 0) >= 5) badges.push("Quick Turnover");
  return badges;
}

function speedBoardCompetitionBadges(rows) {
  const velocityLeader = rows.slice().sort((a, b) => (Number(b.bestVelocity) || 0) - (Number(a.bestVelocity) || 0))[0];
  const repsLeader = rows.slice().sort((a, b) => (Number(b.reps) || 0) - (Number(a.reps) || 0))[0];
  return rows.map((row) => {
    const badges = Array.isArray(row.badges) ? row.badges.slice() : [];
    if (velocityLeader && row.athleteName === velocityLeader.athleteName && Number(row.bestVelocity) > 0) badges.push("Velocity Leader");
    if (repsLeader && row.athleteName === repsLeader.athleteName && Number(row.reps) > 1) badges.push("Rep Leader");
    return { ...row, badges: uniqueStrings(badges) };
  });
}

function speedBoardHighlights(rows) {
  return {
    velocityLeader: speedBoardWinner(rows, "bestVelocity", "m/s"),
    fastest: speedBoardFastestWinner(rows),
    consistencyLeader: speedBoardWinner(rows, "reps", "reps"),
    improvementLeader: speedBoardWinner(rows.filter((row) => row.improvementSeconds > 0), "improvementSeconds", "sec drop"),
    gameLeader: speedBoardWinner(rows, "gameScore", "pts"),
  };
}

function speedBoardWeeklyWinners(rows) {
  const weekStart = startOfBoardWeek(new Date());
  const weeklyRows = rows.filter((row) => {
    const date = publicBoardDate(row.latestDate);
    return date && date >= weekStart && date < addDays(weekStart, 7);
  });
  return {
    velocity: speedBoardWinner(weeklyRows, "bestVelocity", "m/s this week"),
    fastest: speedBoardFastestWinner(weeklyRows),
    consistency: speedBoardWinner(weeklyRows, "reps", "reps this week"),
  };
}

function speedBoardWinner(rows, key, suffix) {
  const winner = (rows || []).filter((row) => Number(row[key]) > 0).sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0) || a.athleteName.localeCompare(b.athleteName))[0];
  if (!winner) return { name: "", value: 0, label: "No winner yet" };
  const value = Number(winner[key]) || 0;
  return { name: winner.athleteName, value, label: `${key === "reps" || key === "gameScore" ? Math.round(value) : speedBoardRound(value, 2)} ${suffix}` };
}

function speedBoardFastestWinner(rows) {
  const winner = (rows || []).filter((row) => Number(row.bestSeconds) > 0).sort((a, b) => (Number(a.bestSeconds) || 999999) - (Number(b.bestSeconds) || 999999) || a.athleteName.localeCompare(b.athleteName))[0];
  if (!winner) return { name: "", value: 0, label: "No winner yet" };
  return { name: winner.athleteName, value: winner.bestSeconds, label: `${speedBoardRound(winner.bestSeconds, 2)} sec` };
}

function speedBoardFilterLabel({ metric, gender, year }) {
  return [metric || "All metrics", gender === "boy" ? "Boys" : gender === "girl" ? "Girls" : "", year].filter(Boolean).join(" · ");
}

function speedBoardSeconds(value) {
  const text = cleanSetupText(value);
  if (!text) return 0;
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
  const parts = text.split(":").map(Number);
  if (parts.some((number) => !Number.isFinite(number))) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function speedBoardMeters(rep, practice) {
  const unit = cleanSetupText(rep.unit || "m").toLowerCase();
  const distance = Number(rep.meters || rep.distance || practice.timedDistance || practice.distance || speedBoardMetersFromLabel(rep.metric));
  if (!Number.isFinite(distance) || distance <= 0) return 0;
  return unit === "yd" ? distance * 0.9144 : distance;
}

function speedBoardMetricLabel(rep, practice) {
  const meters = Math.round(speedBoardMeters(rep, practice));
  const text = [rep.zone, practice.zone, practice.focus, practice.routineName, practice.details, practice.notes].join(" ").toLowerCase();
  const type = /fly|max velocity|max/.test(text) ? "Fly" : /start|accel/.test(text) ? "Start" : "Start";
  return meters ? `${meters}m ${type}` : cleanSetupText(practice.focus || rep.zone) || "Speed Metrics";
}

function speedBoardMetersFromLabel(label) {
  const match = cleanSetupText(label).match(/(\d+(?:\.\d+)?)\s*m/i);
  return match ? Number(match[1]) : 0;
}

function speedBoardRound(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return 0;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

async function accountTrainingCustomization(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const accountKey = normalizeSetupAccountKey(
    firstQueryValue(req.query && (req.query.account || req.query.tenant || req.query.key))
  ) || normalizeSetupAccountKey(headerValue(req, "x-smartcoach-account")) || "default";

  try {
    const existing = await loadAccountRecord(accountKey);
    if (!existing.configured || !existing.found || !existing.record) {
      throw httpError(404, "Account registry record was not found.");
    }

    if (req.method === "GET") {
      res.status(200).json({
        success: true,
        accountKey,
        trainingCustomization: normalizeTrainingCustomization(existing.record.trainingCustomization),
      });
      return;
    }

    if (req.method !== "POST" && req.method !== "PATCH") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    await attachRegistryAccountForKey(req, accountKey);
    const { coachCodeVersion, coachAccessCodes, accessCode } = getGhlContext(req);
    const session = coachSessionFromRequest(req, accountKey);
    const sessionAllowed = coachSessionVersionAllowed(session, coachCodeVersion);
    const providedAccessCode = cleanSetupText(headerValue(req, "x-smartcoach-access-code"));
    const allowedCodes = coachAccessCodes && coachAccessCodes.length ? coachAccessCodes : accessCode ? [accessCode] : [];
    const codeAllowed = providedAccessCode && allowedCodes.some((code) => safeEqual(providedAccessCode, code));
    if (!sessionAllowed && !codeAllowed) {
      throw httpError(401, "Active coach access is required to update training customization.");
    }

    const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const customization = normalizeTrainingCustomization(payload.trainingCustomization || payload);
    await saveAccountRecord(accountKey, {
      ...existing.record,
      trainingCustomization: customization,
      lastTrainingCustomizationSync: {
        savedAt: new Date().toISOString(),
        count: customization.rules.length,
      },
    });
    res.status(200).json({ success: true, accountKey, trainingCustomization: customization });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Training customization save failed." });
  }
}

async function accountAthleteCalendarQuestions(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const accountKey = normalizeSetupAccountKey(
    firstQueryValue(req.query && (req.query.account || req.query.tenant || req.query.key))
  ) || normalizeSetupAccountKey(headerValue(req, "x-smartcoach-account")) || "default";

  try {
    const existing = await loadAccountRecord(accountKey);
    if (!existing.configured || !existing.found || !existing.record) {
      throw httpError(404, "Account registry record was not found.");
    }

    if (req.method === "GET") {
      res.status(200).json({
        success: true,
        accountKey,
        athleteCalendarQuestions: normalizeAthleteCalendarQuestions(existing.record.athleteCalendarQuestions),
      });
      return;
    }

    if (req.method !== "POST" && req.method !== "PATCH") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    await attachRegistryAccountForKey(req, accountKey);
    const { coachCodeVersion, coachAccessCodes, accessCode } = getGhlContext(req);
    const session = coachSessionFromRequest(req, accountKey);
    const sessionAllowed = coachSessionVersionAllowed(session, coachCodeVersion);
    const providedAccessCode = cleanSetupText(headerValue(req, "x-smartcoach-access-code"));
    const allowedCodes = coachAccessCodes && coachAccessCodes.length ? coachAccessCodes : accessCode ? [accessCode] : [];
    const codeAllowed = providedAccessCode && allowedCodes.some((code) => safeEqual(providedAccessCode, code));
    if (!sessionAllowed && !codeAllowed) {
      throw httpError(401, "Active coach access is required to update Athlete Calendar questions.");
    }

    const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const questions = normalizeAthleteCalendarQuestions(payload.athleteCalendarQuestions || payload.questions || payload);
    await saveAccountRecord(accountKey, {
      ...existing.record,
      athleteCalendarQuestions: questions,
      lastAthleteCalendarQuestionsSync: {
        savedAt: new Date().toISOString(),
        count: questions.questions.length,
      },
    });
    res.status(200).json({ success: true, accountKey, athleteCalendarQuestions: questions });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Athlete Calendar questions save failed." });
  }
}

function defaultTrainingCustomizationRules() {
  return [
    { key: "Easy/Recovery Run", label: "Easy / Recovery Run", repMeters: 1609.34, low: 60, high: 70, suffix: "/mi" },
    { key: "Long Run", label: "Long Run", repMeters: 1609.34, low: 60, high: 72, suffix: "/mi" },
    { key: "Threshold", label: "Threshold", repMeters: 1000, low: 82, high: 88 },
    { key: "Lactate Threshold", label: "Lactate Threshold", repMeters: 1000, low: 82, high: 88 },
    { key: "Interval", label: "Interval", repMeters: 400, low: 88, high: 95 },
    { key: "Repetition", label: "Repetition", repMeters: 200, low: 93, high: 100 },
    { key: "Fast Reps", label: "Fast Reps", repMeters: 150, low: 93, high: 100 },
    { key: "Intensive Tempo", label: "Intensive Tempo", repMeters: 400, low: 75, high: 82 },
    { key: "Extensive Tempo", label: "Extensive Tempo", repMeters: 400, low: 65, high: 75 },
    { key: "Acceleration", label: "Acceleration", repMeters: 30, low: 95, high: 100 },
    { key: "Max Velocity", label: "Max Velocity", repMeters: 60, low: 95, high: 100 },
    { key: "Speed Endurance I", label: "Speed Endurance I", repMeters: 150, low: 88, high: 95 },
    { key: "Special Endurance I", label: "Special Endurance I", repMeters: 300, low: 85, high: 90 },
    { key: "Special Endurance II", label: "Special Endurance II", repMeters: 500, low: 80, high: 88 },
    { key: "Lactate Tolerance", label: "Lactate Tolerance", repMeters: 300, low: 82, high: 88 },
    { key: "Aerobic Power", label: "Aerobic Power", repMeters: 800, low: 78, high: 86 },
    { key: "Hills", label: "Hills", repMeters: 60, low: 90, high: 98 },
    { key: "Hill Sprints", label: "Hill Sprints", repMeters: 60, low: 90, high: 98 },
  ];
}

function normalizeTrainingCustomization(source) {
  const input = source && typeof source === "object" ? source : {};
  const incoming = Array.isArray(input.rules) ? input.rules : [];
  const byKey = new Map();
  incoming.forEach((rule) => {
    const item = normalizeTrainingCustomizationRule(rule);
    if (item) byKey.set(item.key, item);
  });
  const rules = defaultTrainingCustomizationRules().map((base) => {
    const saved = byKey.get(base.key);
    return saved ? { ...base, ...saved, key: base.key, label: base.label, suffix: base.suffix || saved.suffix || "" } : base;
  });
  return {
    version: 1,
    updatedAt: cleanSetupText(input.updatedAt) || new Date().toISOString(),
    rules,
  };
}

function normalizeAthleteCalendarQuestions(source) {
  const input = source && typeof source === "object" ? source : {};
  const rawQuestions = Array.isArray(input.questions) ? input.questions : Array.isArray(source) ? source : [];
  const questions = rawQuestions.map((item, index) => normalizeAthleteCalendarQuestion(item, index)).filter(Boolean).slice(0, 5);
  return {
    version: 1,
    updatedAt: cleanSetupText(input.updatedAt) || new Date().toISOString(),
    questions,
  };
}

function normalizeAthleteCalendarQuestion(item, index) {
  const source = item && typeof item === "object" ? item : { text: item };
  const text = cleanSetupText(source.text || source.question || source.label).slice(0, 160);
  if (!text) return null;
  const id = cleanSetupText(source.id || source.key || `q${index + 1}`).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || `q${index + 1}`;
  return {
    id,
    text,
    required: normalizeSetupBoolean(source.required, false),
    active: source.active === false ? false : true,
  };
}

function normalizeTrainingCustomizationRule(rule) {
  if (!rule || typeof rule !== "object") return null;
  const key = cleanSetupText(rule.key || rule.label);
  if (!key) return null;
  const low = clampPercent(rule.lowPercent || rule.low || rule.min || rule.minPercent);
  const high = clampPercent(rule.highPercent || rule.high || rule.max || rule.maxPercent);
  if (!low || !high) return null;
  const orderedLow = Math.min(low, high);
  const orderedHigh = Math.max(low, high);
  return {
    key,
    label: cleanSetupText(rule.label) || key,
    repMeters: Number(rule.repMeters || rule.distance || rule.distanceMeters) || 400,
    low: orderedLow,
    high: orderedHigh,
    suffix: cleanSetupText(rule.suffix),
  };
}

function clampPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(1, Math.min(150, Math.round(number)));
}

async function accountStaff(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const accountKey = normalizeSetupAccountKey(
    firstQueryValue(req.query && (req.query.account || req.query.tenant || req.query.key))
  ) || normalizeSetupAccountKey(headerValue(req, "x-smartcoach-account")) || "default";

  try {
    const existing = await loadAccountRecord(accountKey);
    if (!existing.configured || !existing.found || !existing.record) {
      throw httpError(404, "Account registry record was not found.");
    }

    if (req.method === "GET") {
      res.status(200).json({ success: true, accountKey, coachStaff: publicCoachStaff(normalizeCoachStaff(existing.record.coachStaff), false) });
      return;
    }

    if (req.method !== "POST" && req.method !== "PATCH") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    await attachRegistryAccountForKey(req, accountKey);
    const { coachCodeVersion, coachAccessCodes, accessCode } = getGhlContext(req);
    const session = coachSessionFromRequest(req, accountKey);
    const sessionAllowed = coachSessionVersionAllowed(session, coachCodeVersion);
    const providedAccessCode = cleanSetupText(headerValue(req, "x-smartcoach-access-code"));
    const allowedCodes = coachAccessCodes && coachAccessCodes.length ? coachAccessCodes : accessCode ? [accessCode] : [];
    const codeIndex = providedAccessCode ? allowedCodes.findIndex((code) => safeEqual(providedAccessCode, code)) : -1;
    const codeAllowed = codeIndex >= 0;
    if (!sessionAllowed && !codeAllowed) {
      throw httpError(401, "Active coach access is required to update staff.");
    }
    const staffAdmin = staffAccessAdminAllowed(sessionAllowed ? session : { coachIndex: codeIndex }, existing.record.coachStaff);
    if (!staffAdmin) {
      throw httpError(403, "Head coach access is required to manage Staff Access.");
    }

    const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const coachStaff = normalizeCoachStaffForSave(
      payload.coachStaff || payload.staff || payload.coaches,
      accountKey,
      existing.record.coachStaff,
      allowedCodes
    );
    const sessionRefreshNeeded = staffAccessChangeRequiresSessionBump(existing.record.coachStaff, coachStaff);
    const nextCoachCodeVersion = sessionRefreshNeeded ? (Number(existing.record.coachCodeVersion) || 0) + 1 : Number(existing.record.coachCodeVersion) || 0;
    const refreshedSession = sessionRefreshNeeded && sessionAllowed
      ? createCoachSession(accountKey, {
        coachIndex: Number(session.coachIndex) || 0,
        parentEmailAllowed: !!session.parentEmailAllowed,
        sessionId: cleanSetupText(session.sessionId) || crypto.randomBytes(12).toString("hex"),
        coachCodeVersion: nextCoachCodeVersion,
      })
      : null;
    await saveAccountRecord(accountKey, {
      ...existing.record,
      coachStaff,
      coachCodeVersion: nextCoachCodeVersion,
      lastStaffSync: { savedAt: new Date().toISOString(), count: coachStaff.length },
    });
    res.status(200).json({
      success: true,
      accountKey,
      coachStaff: publicCoachStaff(coachStaff, true),
      coachCodeVersion: nextCoachCodeVersion,
      sessionToken: refreshedSession && refreshedSession.token || undefined,
      expiresAt: refreshedSession && refreshedSession.expiresAt || undefined,
      expiresAtIso: refreshedSession && refreshedSession.expiresAtIso || undefined,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Staff save failed." });
  }
}

function normalizeCoachStaff(items) {
  const source = Array.isArray(items) ? items : [];
  const seen = new Set();
  return source.map((item, index) => {
    const raw = typeof item === "string" ? { name: item } : item || {};
    const name = cleanSetupText(raw.name || raw.coachName || raw.label).slice(0, 120);
    if (!name) return null;
    const id = normalizeDocuRecordKey(raw.id || raw.coachId || name || `coach_${index + 1}`) || `coach_${index + 1}`;
    if (seen.has(id)) return null;
    seen.add(id);
    return {
      id,
      name,
      email: cleanSetupText(raw.email || raw.coachEmail).slice(0, 160),
      active: raw.active === false ? false : true,
      role: cleanSetupText(raw.role).slice(0, 80),
      accessType: normalizeStaffAccessType(raw.accessType || raw.staffAccessType),
      coachCodeHash: normalizeStaffCoachCodeHash(raw.coachCodeHash || raw.staffCodeHash || raw.personalCodeHash),
      coachCodeCreatedAt: cleanSetupText(raw.coachCodeCreatedAt || raw.staffCodeCreatedAt),
      coachCodeLastCopiedAt: cleanSetupText(raw.coachCodeLastCopiedAt || raw.staffCodeLastCopiedAt),
      coachCodeUpdatedAt: cleanSetupText(raw.coachCodeUpdatedAt || raw.staffCodeUpdatedAt),
      inviteToken: cleanSetupText(raw.inviteToken || raw.staffInviteToken).slice(0, 120),
      inviteCreatedAt: cleanSetupText(raw.inviteCreatedAt),
      inviteLastCopiedAt: cleanSetupText(raw.inviteLastCopiedAt),
      inviteLastUsedAt: cleanSetupText(raw.inviteLastUsedAt),
      inviteLastUsedSource: cleanSetupText(raw.inviteLastUsedSource).slice(0, 40),
      inviteRevokedAt: cleanSetupText(raw.inviteRevokedAt),
      updatedAt: cleanSetupText(raw.updatedAt) || new Date().toISOString(),
    };
  }).filter(Boolean).slice(0, 25);
}

function normalizeCoachStaffForSave(items, accountKey, existingItems, legacyCodes = []) {
  const source = Array.isArray(items) ? items : [];
  const existingById = new Map(normalizeCoachStaff(existingItems).map((item) => [item.id, item]));
  const staff = normalizeCoachStaff(source).map((item, index) => {
    const raw = typeof source[index] === "string" ? { name: source[index] } : source[index] || {};
    const existing = existingById.get(item.id) || {};
    const newCode = cleanSetupText(raw.newCoachCode || raw.coachCode || raw.staffCode || raw.personalCode);
    const next = {
      ...item,
      coachCodeHash: item.coachCodeHash || existing.coachCodeHash || "",
      coachCodeCreatedAt: item.coachCodeCreatedAt || existing.coachCodeCreatedAt || "",
      coachCodeLastCopiedAt: item.coachCodeLastCopiedAt || existing.coachCodeLastCopiedAt || "",
      coachCodeUpdatedAt: item.coachCodeUpdatedAt || existing.coachCodeUpdatedAt || "",
    };
    if (newCode) {
      validateNewCoachCode(newCode, accountKey);
      if ((Array.isArray(legacyCodes) ? legacyCodes : []).some((code) => safeEqual(code, newCode))) {
        throw httpError(400, "Personal code must be different from the shared fallback code.");
      }
      const now = new Date().toISOString();
      next.coachCodeHash = staffCoachCodeHash(accountKey, newCode);
      next.coachCodeCreatedAt = next.coachCodeCreatedAt || now;
      next.coachCodeLastCopiedAt = now;
      next.coachCodeUpdatedAt = now;
    }
    return next;
  });
  const codeHashes = new Set();
  for (const item of staff) {
    if (!item.coachCodeHash) continue;
    if (codeHashes.has(item.coachCodeHash)) throw httpError(400, "Personal coach codes must be unique.");
    codeHashes.add(item.coachCodeHash);
  }
  return staff;
}

function staffAccessChangeRequiresSessionBump(existingItems, nextItems) {
  const existing = new Map(normalizeCoachStaff(existingItems).map((item) => [item.id, item]));
  return normalizeCoachStaff(nextItems).some((item) => {
    const prev = existing.get(item.id) || {};
    return prev.active !== item.active ||
      normalizeStaffAccessType(prev.accessType) !== normalizeStaffAccessType(item.accessType) ||
      cleanSetupText(prev.coachCodeHash) !== cleanSetupText(item.coachCodeHash);
  });
}

function normalizeStaffAccessType(value) {
  const text = cleanSetupText(value).toLowerCase().replace(/[\s_-]+/g, "-");
  if (text === "app" || text === "app-only" || text === "phone" || text === "phone-app") return "app-only";
  return "full";
}

function publicCoachStaff(items, includeInviteSecrets = false) {
  const staff = normalizeCoachStaff(items);
  if (includeInviteSecrets) {
    return staff.map(({ coachCodeHash, ...item }) => ({
      ...item,
      hasCoachCode: !!coachCodeHash,
    }));
  }
  return staff.map((item) => ({
    id: item.id,
    name: item.name,
    email: item.email,
    active: item.active,
    role: item.role,
    accessType: item.accessType,
    hasCoachCode: !!item.coachCodeHash,
    coachCodeCreatedAt: item.coachCodeCreatedAt,
    coachCodeLastCopiedAt: item.coachCodeLastCopiedAt,
    coachCodeUpdatedAt: item.coachCodeUpdatedAt,
    inviteCreatedAt: item.inviteCreatedAt,
    inviteLastCopiedAt: item.inviteLastCopiedAt,
    inviteLastUsedAt: item.inviteLastUsedAt,
    inviteLastUsedSource: item.inviteLastUsedSource,
    inviteRevokedAt: item.inviteRevokedAt,
    updatedAt: item.updatedAt,
  }));
}

function normalizeStaffCoachCodeHash(value) {
  const text = cleanSetupText(value).toLowerCase();
  return /^[a-f0-9]{64}$/.test(text) ? text : "";
}

function staffCoachCodeHash(accountKey, code) {
  const secret = cleanSetupText(process.env.SMARTCOACH_SESSION_SECRET || process.env.SMARTCOACH_ADMIN_SETUP_CODE || "smartcoach-staff-code");
  return crypto.createHash("sha256").update(`${secret}:staff:${normalizeSetupAccountKey(accountKey) || "default"}:${cleanSetupText(code).toUpperCase()}`).digest("hex");
}

function staffCoachCodeAllowed(account, accountKey, providedCode) {
  const provided = cleanSetupText(providedCode);
  if (!provided || !account) return { allowed: false };
  const productPlan = normalizeSetupProductPlan(account.productPlan);
  const subscription = account.subscription || {};
  if (!subscriptionAccessAllowed(subscription)) {
    return {
      allowed: false,
      statusCode: 402,
      error: subscriptionBlockedMessage(subscription),
      accountKey,
      productPlan,
      subscriptionStatus: subscription && subscription.status,
      subscriptionAccessRequired: true,
    };
  }
  const hash = staffCoachCodeHash(accountKey, provided);
  const staff = normalizeCoachStaff(account.coachStaff);
  const index = staff.findIndex((item) => item.active !== false && item.coachCodeHash && safeEqual(item.coachCodeHash, hash));
  if (index < 0) return { allowed: false };
  return {
    allowed: true,
    accountKey,
    productPlan,
    coachSeats: Number(account.coachSeats) || 10,
    coachIndex: index,
    parentEmailAllowed: false,
    coachCodeVersion: Number(account.coachCodeVersion) || 0,
    staffCoachCode: true,
    staffCoachId: staff[index].id,
    coachName: staff[index].name,
    accessType: staff[index].accessType,
  };
}

function staffAccessAdminAllowed(sessionOrAccess, staffItems) {
  const index = Number(sessionOrAccess && sessionOrAccess.coachIndex) || 0;
  if (index === 0) return true;
  const staff = normalizeCoachStaff(staffItems);
  const item = staff[index] || null;
  return !!(item && item.active !== false && /^head coach$/i.test(cleanSetupText(item.role)));
}

function coachInviteAllowed(account, accountKey, inviteToken) {
  const token = cleanSetupText(inviteToken);
  const productPlan = normalizeSetupProductPlan(account && account.productPlan);
  if (!token) {
    return { allowed: false, statusCode: 401, error: "Staff invite link is required.", coachAccessRequired: true };
  }
  if (!account || !isProPlan(productPlan)) {
    return { allowed: false, statusCode: 404, error: "SMART Trak account was not found.", coachAccessRequired: true };
  }
  const subscription = account.subscription || {};
  if (!subscriptionAccessAllowed(subscription)) {
    return { allowed: false, statusCode: 403, error: subscriptionBlockedMessage(subscription), accessReady: false, coachAccessRequired: true };
  }
  const staff = normalizeCoachStaff(account.coachStaff);
  const index = staff.findIndex((item) => item.active !== false && normalizeStaffAccessType(item.accessType) !== "app-only" && item.inviteToken && !item.inviteRevokedAt && safeEqual(item.inviteToken, token));
  if (index < 0) {
    return { allowed: false, statusCode: 401, error: "Staff invite link is invalid or revoked.", coachAccessRequired: true };
  }
  return {
    allowed: true,
    accountKey,
    productPlan,
    coachSeats: Number(account.coachSeats) || 10,
    coachIndex: index,
    parentEmailAllowed: false,
    coachCodeVersion: Number(account.coachCodeVersion) || 0,
    staffInvite: true,
    staffInviteId: staff[index].id,
    coachName: staff[index].name,
    accessType: staff[index].accessType,
  };
}

function desktopSessionAllowedForStaff(access, account, deviceSource) {
  if (cleanSetupText(deviceSource).toLowerCase() === "app") return true;
  const staff = normalizeCoachStaff(account && account.coachStaff);
  const item = staff[Number(access && access.coachIndex) || 0] || null;
  return !(item && item.active !== false && normalizeStaffAccessType(item.accessType) === "app-only");
}

async function markStaffInviteUsed({ accountKey, accountRecord, staffInviteId, deviceSource }) {
  const id = cleanSetupText(staffInviteId);
  if (!id) return null;
  const existing = (await loadExistingAccountRecord(accountKey)) || accountRecord || {};
  const now = new Date().toISOString();
  const staff = normalizeCoachStaff(existing.coachStaff).map((item) => {
    if (item.id !== id) return item;
    return {
      ...item,
      inviteLastUsedAt: now,
      inviteLastUsedSource: cleanSetupText(deviceSource || "desktop").slice(0, 40) || "desktop",
      updatedAt: now,
    };
  });
  await saveAccountRecord(accountKey, {
    ...existing,
    coachStaff: staff,
    lastStaffInviteUse: { usedAt: now, coachId: id },
  });
  return now;
}

function essentialSessionMatches(session, accountRecord) {
  if (!session || !accountRecord || accountRecord.productPlan !== "essential") return false;
  const active = accountRecord.essentialActiveSession || {};
  if (!active.sessionId || !session.sessionId || !safeEqual(String(active.sessionId), String(session.sessionId))) return false;
  const expiresAt = Date.parse(active.expiresAtIso || active.expiresAt || "");
  return !Number.isFinite(expiresAt) || expiresAt > Date.now();
}

function coachSessionVersionAllowed(session, expectedVersion) {
  const version = Number(expectedVersion) || 0;
  if (!session) return false;
  if (!version) return true;
  return Number(session.coachCodeVersion) === version;
}

function accountSetup(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!setupAdminAllowed(req)) {
    res.status(401).json({
      error: "Setup code is required.",
      adminSetupCodeRequired: true,
    });
    return;
  }

  const requestedKey = firstQueryValue(req.query && (req.query.account || req.query.tenant || req.query.key)) || "customer";
  const accountKey = normalizeSetupAccountKey(requestedKey) || "customer";
  const requestedPlan = firstQueryValue(req.query && (req.query.plan || req.query.productPlan)) || "pro";
  const productPlan = normalizeSetupProductPlan(requestedPlan);
  const requestedCoachSeats = firstQueryValue(req.query && (req.query.coachSeats || req.query.coaches || req.query.seats)) || "1";
  const coachSeats = normalizeSetupCoachSeats(requestedCoachSeats, productPlan);
  const subscription = setupSubscriptionFromQuery(req.query || {}, productPlan);
  const ownerEmail = cleanEmail(firstQueryValue(req.query && (req.query.accountOwnerEmail || req.query.ownerEmail || req.query.headCoachEmail)));
  const ownerPhone = cleanPhone(firstQueryValue(req.query && (req.query.accountOwnerPhone || req.query.ownerPhone || req.query.headCoachPhone)));
  const suffix = accountKey.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const { token, locationId } = getGhlContext({ query: { account: accountKey }, headers: {} });
  const configured = !!(token && locationId);

  const env = [
    {
      key: `SMARTCOACH_PRODUCT_PLAN_${suffix}`,
      value: productPlan,
      required: true,
      label: "Plan",
      description: "Controls whether this account is Essential or Pro.",
    },
    {
      key: `SMARTCOACH_SUBSCRIPTION_STATUS_${suffix}`,
      value: subscription.status,
      required: false,
      recommended: true,
      label: "Subscription status",
      description: "Internal customer subscription status: active, trialing, past_due, paused, canceled, incomplete, incomplete_expired, or unpaid.",
    },
    {
      key: `SMARTCOACH_BILLING_CADENCE_${suffix}`,
      value: subscription.billingCadence,
      required: false,
      recommended: true,
      label: "Billing cadence",
      description: "Internal billing cadence for this customer: monthly or annual.",
    },
    {
      key: `SMARTCOACH_SUBSCRIPTION_AMOUNT_${suffix}`,
      value: subscription.amount,
      required: false,
      recommended: true,
      label: "Subscription amount",
      description: "Internal monthly or annual subscription amount. Active athlete limits are enforced by SMARTCoach.",
    },
    {
      key: `SMARTCOACH_RENEWAL_DATE_${suffix}`,
      value: subscription.renewalDate,
      required: false,
      recommended: true,
      label: "Renewal date",
      description: "Internal next renewal or billing date in YYYY-MM-DD format.",
    },
    {
      key: `SMARTCOACH_STRIPE_CUSTOMER_ID_${suffix}`,
      value: subscription.stripeCustomerId,
      required: false,
      label: "Stripe customer ID",
      description: "Optional internal billing reference. This is not shown in the coach-facing app.",
    },
    {
      key: `SMARTCOACH_STRIPE_SUBSCRIPTION_ID_${suffix}`,
      value: subscription.stripeSubscriptionId,
      required: false,
      label: "Stripe subscription ID",
      description: "Optional internal subscription reference. This is not shown in the coach-facing app.",
    },
    {
      key: `SMARTCOACH_SUBSCRIPTION_NOTES_${suffix}`,
      value: subscription.notes,
      required: false,
      label: "Subscription notes",
      description: "Optional internal notes about this customer subscription.",
    },
  ];
  if (isProPlan(productPlan)) {
    env.push(
      {
        key: `GHL_PRIVATE_INTEGRATION_TOKEN_${suffix}`,
        value: "paste_customer_private_integration_token",
        required: true,
        label: "Private integration token",
        description: "Customer SMART Trak private integration token.",
      },
      {
        key: `GHL_LOCATION_ID_${suffix}`,
        value: "paste_customer_location_id",
        required: true,
        label: "Location ID",
        description: "Customer SMART Trak sub-account location ID.",
      }
    );
  }
  env.push(
    {
      key: `SMARTCOACH_COACH_SEATS_${suffix}`,
      value: String(coachSeats),
      required: true,
      label: "Coach seats",
      description: isProPlan(productPlan) ? "Pro accounts use named personal coach codes and include up to 10 assistant coach seats. Keep staff access tight to protect clean data." : "Essential allows one active device session at a time.",
    },
    {
      key: `SMARTCOACH_COACH_ACCESS_CODES_${suffix}`,
      value: suggestedCoachAccessCodes(accountKey, coachSeats, productPlan).join(","),
      required: true,
      label: "Coach access codes",
      description: isProPlan(productPlan) ? `Share the coach code only with active staff. This account is set for ${coachSeats} assistant coach seat${coachSeats === 1 ? "" : "s"}.` : "Essential requires an active code and allows one active device at a time.",
    },
    {
      key: `SMARTCOACH_REQUIRE_COACH_ACCESS_${suffix}`,
      value: "true",
      required: true,
      label: "Require coach access",
      description: "Blocks SMARTCoach until this account has an active coach access code configured.",
    },
    {
      key: `SMARTCOACH_ACCOUNT_OWNER_EMAIL_${suffix}`,
      value: ownerEmail,
      required: false,
      recommended: true,
      label: "Account owner email",
      description: "Used to send a temporary recovery code when the fallback coach code is lost.",
    },
    {
      key: `SMARTCOACH_ACCOUNT_OWNER_PHONE_${suffix}`,
      value: ownerPhone,
      required: false,
      label: "Account owner phone",
      description: "Optional future SMS recovery contact for this customer.",
    }
  );
  if (isProPlan(productPlan)) {
    env.push(
      {
        key: `SMARTCOACH_PARENT_EMAIL_COACH_ACCESS_${suffix}`,
        value: "",
        required: false,
        label: "Future parent email coaches",
        description: "Optional future release only. Use coach numbers like 1 or 1,3; tools stay hidden until the global parent email release flag is turned on.",
      }
    );
  }

  res.status(200).json({
    success: true,
    accountKey,
    productPlan,
    productPlanLabel: planDefinition(productPlan).label,
    activeAthleteLimit: planDefinition(productPlan).activeAthleteLimit,
    coachSeats,
    coachAccessCodesConfigured: coachSeats,
    subscription: publicSubscriptionSummary(subscription),
    configured,
    setupState: !isProPlan(productPlan) ? configured ? "essential-ready" : "essential-code-needed" : configured ? "pro-ready" : "pro-setup-needed",
    environment: env,
    accountUrl: `/?account=${encodeURIComponent(accountKey)}`,
    dashboardUrl: `/dashboard.html?account=${encodeURIComponent(accountKey)}`,
    ghlCustomLinkUrl: `/dashboard.html?account=${encodeURIComponent(accountKey)}&embed=1`,
    planBuilderUrl: `/plan-builder.html?account=${encodeURIComponent(accountKey)}`,
  });
}

async function accountAutomation(req, res) {
  setAutomationHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!automationAllowed(req)) {
    res.status(401).json({
      error: "Automation secret is required.",
      automationSecretRequired: true,
      automationDebug: automationSecretDebug(req),
    });
    return;
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const result = await saveAutomationAccount(payload, { source: "automation" });
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message || "Could not process automation payload." });
  }
}

async function accountAutomationDryRun(req, res) {
  setAutomationHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!automationAllowed(req)) {
    res.status(401).json({
      error: "Automation secret is required.",
      automationSecretRequired: true,
    });
    return;
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const result = await previewAutomationAccount(payload, { source: "automation-dry-run", dryRun: true });
    res.status(200).json({
      success: true,
      dryRun: true,
      ...result,
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message || "Could not test automation payload." });
  }
}

async function accountAutomationHealth(req, res) {
  setAutomationHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!automationAllowed(req)) {
    res.status(401).json({
      error: "Automation secret is required.",
      automationSecretRequired: true,
    });
    return;
  }

  const automationSecretConfigured = !!cleanSetupText(process.env.SMARTCOACH_AUTOMATION_SECRET);
  const setupCodeConfigured = !!cleanSetupText(process.env.SMARTCOACH_ADMIN_SETUP_CODE);
  const registryStatus = await registryHealth();
  const registryReady = !!(registryStatus.configured && registryStatus.reachable);
  const stripeWebhookReady = !!cleanSetupText(process.env.SMARTCOACH_STRIPE_WEBHOOK_SECRET);
  const dedicatedSessionSecretConfigured = !!cleanSetupText(process.env.SMARTCOACH_SESSION_SECRET);
  const sessionSigningSource = coachSessionSecretSource();
  const sessionSigningReady = !!sessionSigningSource;
  const coachAccessEnforcementConfigured = normalizeSetupBoolean(process.env.SMARTCOACH_REQUIRE_COACH_ACCESS, false);
  const parentEmailReleased = parentEmailFeatureReleased();
  const launchChecks = [
    {
      key: "automationSecret",
      label: "Automation secret",
      ready: automationSecretConfigured,
      detail: automationSecretConfigured ? "Protected setup endpoints can accept trusted automation calls." : "Set SMARTCOACH_AUTOMATION_SECRET before connecting setup automation.",
    },
    {
      key: "setupCode",
      label: "Setup page protection",
      ready: setupCodeConfigured,
      detail: setupCodeConfigured ? "Internal setup field generation requires the setup code." : "Set SMARTCOACH_ADMIN_SETUP_CODE so customer setup fields are not casually available.",
    },
    {
      key: "registry",
      label: "Durable account registry",
      ready: registryReady,
      detail: registryReady ? "Customer account records can survive deployments and be updated by automation." : registryStatus.configured ? "Registry is configured but cannot be reached." : "Connect Vercel KV or Upstash Redis registry variables.",
    },
    {
      key: "stripeWebhook",
      label: "Stripe webhook",
      ready: stripeWebhookReady,
      detail: stripeWebhookReady ? "Stripe signatures can be verified before subscription updates are accepted." : "Set SMARTCOACH_STRIPE_WEBHOOK_SECRET from the Stripe webhook endpoint.",
    },
    {
      key: "sessionSecret",
      label: "Coach sessions",
      ready: dedicatedSessionSecretConfigured,
      detail: dedicatedSessionSecretConfigured ? "Coach sessions use a dedicated signing secret." : "Set SMARTCOACH_SESSION_SECRET so sessions do not reuse setup secrets.",
    },
    {
      key: "coachAccess",
      label: "Coach access enforcement",
      ready: coachAccessEnforcementConfigured,
      detail: coachAccessEnforcementConfigured ? "Pro accounts require a coach access code or signed coach session." : "Set SMARTCOACH_REQUIRE_COACH_ACCESS=true before launch.",
    },
    {
      key: "parentEmail",
      label: "Parent email release",
      ready: !parentEmailReleased,
      detail: parentEmailReleased ? "Parent email tools are globally enabled before the first rollout." : "Parent email tools remain hidden until intentionally released.",
    },
  ];
  const launchBlockers = [];
  const productionWarnings = [];
  if (!automationSecretConfigured) launchBlockers.push("Automation secret is missing.");
  if (!setupCodeConfigured) launchBlockers.push("Internal setup code is missing.");
  if (!registryReady) launchBlockers.push(registryStatus.configured ? "Account registry is not reachable." : "Durable account registry is not connected.");
  if (!stripeWebhookReady) launchBlockers.push("Stripe webhook signing secret is missing.");
  if (!dedicatedSessionSecretConfigured) launchBlockers.push("Dedicated coach session secret is missing.");
  if (!coachAccessEnforcementConfigured) launchBlockers.push("Coach access enforcement is not turned on.");
  if (parentEmailReleased) launchBlockers.push("Parent email tools are globally enabled before initial rollout.");
  if (!dedicatedSessionSecretConfigured) {
    productionWarnings.push("Set SMARTCOACH_SESSION_SECRET so coach sessions do not reuse automation or setup secrets.");
  }
  if (!setupCodeConfigured) {
    productionWarnings.push("Set SMARTCOACH_ADMIN_SETUP_CODE so internal customer setup field generation requires a setup code.");
  }
  if (!coachAccessEnforcementConfigured) {
    productionWarnings.push("Set SMARTCOACH_REQUIRE_COACH_ACCESS=true after Pro accounts have a fallback coach code.");
  }
  if (!registryStatus.configured) {
    productionWarnings.push("Connect the durable account registry so Stripe and setup automation survive deployments.");
  } else if (!registryStatus.reachable) {
    productionWarnings.push("Fix the durable account registry connection so Stripe and setup automation can save customer updates.");
  }
  if (parentEmailReleased) {
    productionWarnings.push("Parent email tools are globally enabled. Keep SMARTCOACH_PARENT_EMAIL_FEATURE_ENABLED off until parent communication is ready for rollout.");
  }
  res.status(200).json({
    success: true,
    launchReady: launchBlockers.length === 0,
    launchBlockers,
    launchChecks,
    automationSecretConfigured,
    setupCodeConfigured,
    registryConfigured: !!registryStatus.configured,
    registryReachable: !!registryStatus.reachable,
    registryError: registryStatus.error || "",
    stripeWebhookConfigured: stripeWebhookReady,
    dedicatedSessionSecretConfigured,
    sessionSigningConfigured: sessionSigningReady,
    sessionSigningSource,
    sessionTtlSeconds: coachSessionTtlSeconds(),
    coachAccessEnforcementConfigured,
    parentEmailFeatureReleased: parentEmailReleased,
    productionWarnings,
    readyForManualRegistryUpdates: automationSecretConfigured && registryReady,
    readyForStripeWebhooks: automationSecretConfigured && registryReady && stripeWebhookReady,
    readyForSignedCoachSessions: sessionSigningReady,
    checks: [
      { key: "automationSecret", label: "Automation secret", configured: automationSecretConfigured },
      { key: "setupCode", label: "Internal setup code", configured: setupCodeConfigured },
      { key: "registry", label: "Durable account registry", configured: !!registryStatus.configured },
      { key: "registryConnection", label: "Registry connection", configured: registryReady },
      { key: "stripeWebhook", label: "Stripe webhook signing secret", configured: stripeWebhookReady },
      { key: "sessionSigning", label: "Coach session signing", configured: sessionSigningReady },
      { key: "dedicatedSessionSecret", label: "Dedicated session secret", configured: dedicatedSessionSecretConfigured },
      { key: "coachAccessEnforcement", label: "Coach access enforcement", configured: coachAccessEnforcementConfigured },
      { key: "parentEmailReleaseGate", label: "Parent email release gate off", configured: !parentEmailReleased },
    ],
  });
}

async function accountStripeWebhook(req, res) {
  setAutomationHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const secret = cleanSetupText(process.env.SMARTCOACH_STRIPE_WEBHOOK_SECRET);
    if (!secret) throw httpError(500, "Stripe webhook signing secret is not configured.");
    const signature = headerValue(req, "stripe-signature");
    if (!signature) throw httpError(401, "Stripe signature is required.");
    const rawBody = await requestBodyText(req);
    verifyStripeSignature(rawBody, signature, secret);
    const payload = JSON.parse(rawBody || "{}");
    const result = await saveAutomationAccount(payload, { source: "stripe-webhook", skipDuplicateEvents: true });
    if (!result.duplicateAutomationEvent && (!result.registry || !result.registry.saved)) {
      throw httpError(
        503,
        (result.registry && (result.registry.reason || result.registry.error)) ||
          "Stripe webhook could not save the account registry update."
      );
    }
    res.status(200).json({
      success: true,
      stripeWebhookVerified: true,
      stripeWebhookDuplicate: !!result.duplicateAutomationEvent,
      ...result,
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message || "Could not process Stripe webhook." });
  }
}

async function saveAutomationAccount(payload, options = {}) {
  const accountKey = automationAccountKey(payload);
  if (!accountKey) throw httpError(400, "Account key is required.");
  const existing = await loadExistingAccountRecord(accountKey);
  const account = accountAutomationRecord(payload, existing, options);
  const suffix = account.accountKey.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const environment = accountEnvironmentRows({ suffix, account, includeCrm: isProPlan(account.productPlan) });
  await enforcePlanDowngradeAthleteLimit({ existing, account });
  if (options.skipDuplicateEvents && automationEventAlreadyRecorded(existing, account.lastAutomationEvent)) {
    return automationAccountResult(account, {
      configured: registryConfigured(),
      saved: false,
      duplicate: true,
      reason: "Duplicate automation event. Registry record was already updated.",
    }, {
      duplicateAutomationEvent: true,
      environment,
    });
  }
  const registryResult = await saveAccountRecord(account.accountKey, account);
  const customValueSync = await syncAccountKeyCustomValue(account);
  return automationAccountResult(account, registryResult, { environment, customValueSync });
}

function automationAccountResult(account, registryResult, extra = {}) {
  const subscriptionAllowed = subscriptionAccessAllowed(account.subscription);
  const setupReady = accountSetupReady(account);
  const subscriptionBlockedReason = subscriptionAllowed ? "" : subscriptionBlockedMessage(account.subscription);
  return {
    ...extra,
    accountKey: account.accountKey,
    productPlan: account.productPlan,
    productPlanLabel: planDefinition(account.productPlan).label,
    activeAthleteLimit: planDefinition(account.productPlan).activeAthleteLimit,
    coachSeats: account.coachSeats || 1,
    subscription: publicSubscriptionSummary(account.subscription),
    subscriptionAccessAllowed: subscriptionAllowed,
    subscriptionBlockedReason,
    setupReady,
    accessReady: setupReady && subscriptionAllowed,
    registry: registryResult,
    ghlCustomValueSync: extra.customValueSync || customValueSyncSkipped("Not attempted."),
    accountRegistryRecord: publicAccountRecord(account),
    environment: publicEnvironmentRows(extra.environment || accountEnvironmentRows({
      suffix: account.accountKey.toUpperCase().replace(/[^A-Z0-9]/g, "_"),
      account,
      includeCrm: isProPlan(account.productPlan),
    })),
    dashboardUrl: `/dashboard.html?account=${encodeURIComponent(account.accountKey)}`,
    ghlCustomLinkUrl: `/dashboard.html?account=${encodeURIComponent(account.accountKey)}&embed=1`,
    accountUrl: `/?account=${encodeURIComponent(account.accountKey)}`,
  };
}

async function enforcePlanDowngradeAthleteLimit({ existing, account }) {
  if (!existing || !account) return;
  const targetPlan = planDefinition(account.productPlan);
  const previousPlan = planDefinition(existing.productPlan || account.productPlan);
  const targetLimit = targetPlan.activeAthleteLimit;
  if (targetLimit === null || typeof targetLimit === "undefined") return;
  const previousLimit = previousPlan.activeAthleteLimit;
  const loweringLimit = previousLimit === null || typeof previousLimit === "undefined" || Number(previousLimit) > Number(targetLimit);
  if (!loweringLimit) return;
  const token = cleanSetupText(account.token || existing.token);
  const locationId = cleanSetupText(account.locationId || existing.locationId);
  if (!token || !locationId) return;
  const activeAthletes = await athletesApi.listSmartCoachAthletes({ token, locationId, includeContacts: false });
  const activeCount = activeAthletes.filter((athlete) => athlete && athlete.smartcoachActive).length;
  if (activeCount <= Number(targetLimit)) return;
  const overBy = activeCount - Number(targetLimit);
  throw httpError(
    409,
    `${targetPlan.label} allows up to ${targetLimit} active athlete${Number(targetLimit) === 1 ? "" : "s"}. This account currently has ${activeCount} active athletes. Mark ${overBy} athlete${overBy === 1 ? "" : "s"} inactive before changing to ${targetPlan.label}.`
  );
}

async function syncAccountKeyCustomValue(account) {
  if (!account || account.productPlan === "essential") return customValueSyncSkipped("Essential accounts do not need a SMART Trak custom value.");
  if (!account.token || !account.locationId) return customValueSyncSkipped("Missing Location ID or Private Integration Token.");
  try {
    const existing = await findGhlCustomValue({
      token: account.token,
      locationId: account.locationId,
      name: GHL_ACCOUNT_KEY_CUSTOM_VALUE_NAME,
    });
    if (existing && existing.id) {
      const updated = await ghlRequest({
        token: account.token,
        path: `/locations/${encodeURIComponent(account.locationId)}/customValues/${encodeURIComponent(existing.id)}`,
        method: "PUT",
        body: { name: existing.name || GHL_ACCOUNT_KEY_CUSTOM_VALUE_NAME, value: account.accountKey },
      });
      return customValueSyncSuccess("updated", updated, account.accountKey);
    }
    const created = await ghlRequest({
      token: account.token,
      path: `/locations/${encodeURIComponent(account.locationId)}/customValues`,
      method: "POST",
      body: { name: GHL_ACCOUNT_KEY_CUSTOM_VALUE_NAME, value: account.accountKey },
    });
    return customValueSyncSuccess("created", created, account.accountKey);
  } catch (error) {
    return {
      attempted: true,
      success: false,
      name: GHL_ACCOUNT_KEY_CUSTOM_VALUE_NAME,
      fieldKey: `{{custom_values.${GHL_ACCOUNT_KEY_CUSTOM_VALUE_NAME}}}`,
      value: account.accountKey || "",
      error: error.message || "Could not sync GHL account key custom value.",
    };
  }
}

async function findGhlCustomValue({ token, locationId, name }) {
  const data = await ghlRequest({
    token,
    path: `/locations/${encodeURIComponent(locationId)}/customValues`,
    method: "GET",
  });
  const values = Array.isArray(data && data.customValues) ? data.customValues :
    Array.isArray(data && data.custom_values) ? data.custom_values :
    Array.isArray(data && data.values) ? data.values :
    Array.isArray(data) ? data : [];
  const target = normalizeCustomValueName(name);
  return values.find((item) => {
    const fieldKey = String(item && (item.fieldKey || item.field_key || item.key) || "");
    return normalizeCustomValueName(item && item.name) === target ||
      normalizeCustomValueName(fieldKey.replace(/^.*custom_values\.?/i, "")) === target ||
      fieldKey.includes(`custom_values.${name}`) ||
      fieldKey.includes(`custom_values_${name}`);
  }) || null;
}

function normalizeCustomValueName(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function customValueSyncSuccess(action, data, accountKey) {
  const customValue = data && (data.customValue || data.custom_value || data);
  return {
    attempted: true,
    success: true,
    action,
    id: String(customValue && (customValue.id || customValue._id) || ""),
    name: String(customValue && customValue.name || GHL_ACCOUNT_KEY_CUSTOM_VALUE_NAME),
    fieldKey: String(customValue && (customValue.fieldKey || customValue.field_key || customValue.key) || `{{custom_values.${GHL_ACCOUNT_KEY_CUSTOM_VALUE_NAME}}}`),
    value: accountKey || "",
  };
}

function customValueSyncSkipped(reason) {
  return {
    attempted: false,
    success: false,
    name: GHL_ACCOUNT_KEY_CUSTOM_VALUE_NAME,
    fieldKey: `{{custom_values.${GHL_ACCOUNT_KEY_CUSTOM_VALUE_NAME}}}`,
    value: "",
    reason,
  };
}

async function previewAutomationAccount(payload, options = {}) {
  const accountKey = automationAccountKey(payload);
  if (!accountKey) throw httpError(400, "Account key is required.");
  const existing = await loadExistingAccountRecord(accountKey);
  const account = accountAutomationRecord(payload, existing, options);
  await enforcePlanDowngradeAthleteLimit({ existing, account });
  const suffix = account.accountKey.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const environment = accountEnvironmentRows({ suffix, account, includeCrm: isProPlan(account.productPlan) });
  const subscriptionAllowed = subscriptionAccessAllowed(account.subscription);
  const setupReady = accountSetupReady(account);
  const subscriptionBlockedReason = subscriptionAllowed ? "" : subscriptionBlockedMessage(account.subscription);
  return {
    accountKey: account.accountKey,
    productPlan: account.productPlan,
    productPlanLabel: planDefinition(account.productPlan).label,
    activeAthleteLimit: planDefinition(account.productPlan).activeAthleteLimit,
    coachSeats: account.coachSeats || 1,
    subscription: publicSubscriptionSummary(account.subscription),
    subscriptionAccessAllowed: subscriptionAllowed,
    subscriptionBlockedReason,
    setupReady,
    accessReady: setupReady && subscriptionAllowed,
    registry: {
      configured: registryConfigured(),
      saved: false,
      dryRun: true,
      reason: "Dry run only. No registry record was saved.",
    },
    accountRegistryRecord: publicAccountRecord(account),
    environment: publicEnvironmentRows(environment),
    dashboardUrl: `/dashboard.html?account=${encodeURIComponent(account.accountKey)}`,
    ghlCustomLinkUrl: `/dashboard.html?account=${encodeURIComponent(account.accountKey)}&embed=1`,
    accountUrl: `/?account=${encodeURIComponent(account.accountKey)}`,
  };
}

function accountSetupReady(account) {
  const source = account || {};
  const codes = Array.isArray(source.coachAccessCodes) ? source.coachAccessCodes : [];
  const coachAccessReady = source.requireCoachAccess === false || codes.length > 0;
  if (!isProPlan(source.productPlan)) return coachAccessReady;
  return !!(source.token && source.locationId && coachAccessReady);
}

function publicAccountRecord(account) {
  const source = account || {};
  return {
    ...source,
    token: source.token ? "__hidden__" : "",
    accessCode: source.accessCode ? "__hidden__" : "",
    coachAccessCodes: Array.isArray(source.coachAccessCodes) ? source.coachAccessCodes.map(() => "__hidden__") : [],
    coachCodeRecovery: source.coachCodeRecovery ? publicCoachCodeRecovery(source.coachCodeRecovery) : undefined,
    essentialActiveSession: source.essentialActiveSession ? { active: true, expiresAtIso: source.essentialActiveSession.expiresAtIso || "" } : undefined,
    privateIntegrationToken: undefined,
  };
}

function publicCoachCodeRecovery(recovery) {
  const source = recovery || {};
  return {
    requestedAt: cleanSetupText(source.requestedAt),
    expiresAt: cleanSetupText(source.expiresAt),
    delivery: cleanSetupText(source.delivery),
    sentTo: maskEmail(cleanSetupText(source.sentTo)),
    status: cleanSetupText(source.status),
    usedAt: cleanSetupText(source.usedAt),
  };
}

function publicEnvironmentRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const key = String(row && row.key || "");
    if (/GHL_PRIVATE_INTEGRATION_TOKEN|SMARTCOACH_COACH_ACCESS_CODES|SMARTCOACH_LEGACY_ACCESS_CODE/i.test(key)) {
      const value = String(row.value || "");
      if (value && !/^paste_/i.test(value)) return { ...row, value: "__hidden__" };
    }
    return row;
  });
}

async function ghlRequest({ token, path, method = "GET", body }) {
  const response = await fetch(`${GHL_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: GHL_VERSION,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    data = { message: text };
  }
  if (!response.ok) {
    throw httpError(response.status, data.message || data.error || `GHL request failed with ${response.status}.`);
  }
  return data;
}

async function accountRegistry(req, res) {
  setAutomationHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (!automationAllowed(req)) {
    res.status(401).json({
      error: "Automation secret is required.",
      automationSecretRequired: true,
    });
    return;
  }

  if (req.method === "POST") {
    return accountRegistryUpdate(req, res);
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const action = cleanSetupText(firstQueryValue(req.query && req.query.action));
    if (action === "list") {
      const result = await listAccountRecords({ limit: firstQueryValue(req.query && req.query.limit) });
      res.status(200).json({
        success: true,
        registry: { configured: !!result.configured },
        accounts: result.accounts || [],
        count: result.count || 0,
      });
      return;
    }
    const accountKey = normalizeSetupAccountKey(firstQueryValue(req.query && (req.query.account || req.query.tenant || req.query.key)));
    if (!accountKey) throw httpError(400, "Account key is required.");
    const result = await loadAccountRecord(accountKey);
    const record = result.record || null;
    const publicRecord = record ? publicAccountRecord(record) : null;
    const setupReady = result.found ? accountSetupReady(record) : false;
    const subscriptionAllowed = result.found ? subscriptionAccessAllowed(record && record.subscription) : false;
    const subscriptionBlockedReason = result.found && !subscriptionAllowed ? subscriptionBlockedMessage(record && record.subscription) : "";
    res.status(result.found ? 200 : 404).json({
      success: !!result.found,
      accountKey,
      setupReady,
      accessReady: setupReady && subscriptionAllowed,
      subscriptionAccessAllowed: subscriptionAllowed,
      subscriptionBlockedReason,
      registry: {
        configured: !!result.configured,
        found: !!result.found,
        key: result.key || "",
        error: result.error || undefined,
      },
      accountRegistryRecord: publicRecord,
      error: result.found ? undefined : result.configured ? "Account registry record was not found." : "Account registry is not configured.",
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message || "Could not load account registry record." });
  }
}

async function accountRegistryUpdate(req, res) {
  try {
    const payload = requestBodyObject(req);
    const action = cleanSetupText(payload.action || firstQueryValue(req.query && req.query.action)).toLowerCase();
    const accountKey = normalizeSetupAccountKey(payload.accountKey || firstQueryValue(req.query && (req.query.account || req.query.tenant || req.query.key)));
    if (action !== "archive" && action !== "restore") throw httpError(400, "Unsupported account registry action.");
    if (!accountKey) throw httpError(400, "Account key is required.");
    const existing = await loadAccountRecord(accountKey);
    if (!existing || !existing.found || !existing.record) throw httpError(404, "Account registry record was not found.");
    const now = new Date().toISOString();
    const updated = action === "archive"
      ? {
          ...existing.record,
          archived: true,
          archivedAt: now,
          archivedReason: cleanSetupText(payload.reason).slice(0, 240),
          lastAutomationEvent: { source: "smartcoach-admin-archive", action, at: now },
        }
      : {
          ...existing.record,
          archived: false,
          archivedAt: "",
          restoredAt: now,
          lastAutomationEvent: { source: "smartcoach-admin-archive", action, at: now },
        };
    if (action === "restore") delete updated.archivedReason;
    await saveAccountRecord(accountKey, updated);
    res.status(200).json({
      success: true,
      action,
      accountKey,
      account: publicAccountRecord(updated),
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message || "Could not update account registry record." });
  }
}

async function accountCleanup(req, res) {
  setAutomationHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (!automationAllowed(req)) {
    res.status(401).json({
      error: "Automation secret is required.",
      automationSecretRequired: true,
    });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const accountKey = normalizeSetupAccountKey(
      firstPayloadValue(payload, ["accountKey", "account", "tenant", "key"]) ||
      firstQueryValue(req.query && (req.query.account || req.query.tenant || req.query.key))
    );
    if (!accountKey) throw httpError(400, "Account key is required.");
    const existing = await loadAccountRecord(accountKey);
    if (!existing.configured || !existing.found || !existing.record) {
      throw httpError(404, "Account registry record was not found.");
    }
    const expectedLocationId = cleanSetupText(firstPayloadValue(payload, ["locationId", "expectedLocationId", "confirmLocationId"]) || firstQueryValue(req.query && (req.query.locationId || req.query.expectedLocationId)));
    if (!expectedLocationId) throw httpError(400, "Location ID confirmation is required.");
    if (!cleanSetupText(existing.record.locationId) || !safeEqual(expectedLocationId, cleanSetupText(existing.record.locationId))) {
      throw httpError(409, "Location ID confirmation does not match this account.");
    }
    const cleanupOptions = normalizeAccountCleanupOptions(payload.cleanupOptions || payload.options || payload);
    if (!Object.keys(cleanupOptions).some((key) => cleanupOptions[key])) {
      throw httpError(400, "Select at least one cleanup option.");
    }
    const cleaned = cleanupAccountRecord(existing.record, cleanupOptions);
    await saveAccountRecord(accountKey, cleaned.record);
    res.status(200).json({
      success: true,
      accountKey,
      cleared: cleaned.cleared,
      clearedCount: cleaned.cleared.length,
      cleanup: cleaned.cleanupEvent,
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message || "Account cleanup failed." });
  }
}

async function accountSession(req, res) {
  setSessionHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const accountKey = normalizeSetupAccountKey(
      firstPayloadValue(payload, ["accountKey", "account", "tenant", "key"]) ||
        firstQueryValue(req.query && (req.query.account || req.query.tenant || req.query.key))
    ) || "default";
    const accessCode = cleanSetupText(firstPayloadValue(payload, ["accessCode", "coachAccessCode", "code"]));
    const inviteToken = cleanSetupText(firstPayloadValue(payload, ["inviteToken", "staffInviteToken", "invite"]));
    const ip = requestIp(req);
    const attempt = checkSessionAttempt({ accountKey, ip });
    if (!attempt.allowed) {
      res.setHeader("Retry-After", String(attempt.retryAfterSeconds || 900));
      res.status(429).json({
        error: "Too many access attempts. Wait a few minutes, then try again.",
        retryAfterSeconds: attempt.retryAfterSeconds,
      });
      return;
    }
    await attachRegistryAccountForKey(req, accountKey);
    const inviteAccess = inviteToken ? coachInviteAllowed(req.smartcoachRegistryAccount, accountKey, inviteToken) : null;
    const staffCodeAccess = accessCode ? staffCoachCodeAllowed(req.smartcoachRegistryAccount, accountKey, accessCode) : null;
    const access = inviteAccess && inviteAccess.allowed
      ? inviteAccess
      : inviteToken && !accessCode
        ? inviteAccess
        : staffCodeAccess && staffCodeAccess.allowed
          ? staffCodeAccess
          : coachCodeAllowed({ query: { account: accountKey }, headers: req.headers || {}, smartcoachRegistryAccount: req.smartcoachRegistryAccount }, accessCode);
    if (!access.allowed) {
      const failure = recordSessionFailure({ accountKey, ip });
      if (failure.blocked) res.setHeader("Retry-After", String(failure.retryAfterSeconds || 900));
      res.status(access.statusCode || 401).json(access);
      return;
    }
    const deviceSource = cleanSetupText(firstPayloadValue(payload, ["deviceSource", "source", "client"])).toLowerCase();
    if (!desktopSessionAllowedForStaff(access, req.smartcoachRegistryAccount, deviceSource)) {
      res.status(403).json({
        allowed: false,
        error: "This coach is set to App Only. Ask the head coach for Full Access before opening SMART Trak.",
        accountKey,
        coachAccessRequired: true,
      });
      return;
    }
    clearSessionFailures({ accountKey, ip });
    const parentEmailAllowed = parentEmailFeatureReleased() && !!access.parentEmailAllowed;
    const sessionId = crypto.randomBytes(12).toString("hex");
    const session = createCoachSession(accountKey, { coachIndex: access.coachIndex, parentEmailAllowed, sessionId, coachCodeVersion: access.coachCodeVersion });
    if (!session) {
      res.status(500).json({
        error: "SMART Trak session signing is not configured.",
        sessionSecretRequired: true,
      });
      return;
    }
    if (access.productPlan === "essential") {
      const existing = (await loadExistingAccountRecord(accountKey)) || req.smartcoachRegistryAccount || {};
      await saveAccountRecord(accountKey, {
        ...existing,
        accountKey,
        productPlan: "essential",
        essentialActiveSession: {
          sessionId,
          coachIndex: access.coachIndex || 0,
          createdAt: new Date().toISOString(),
          expiresAt: session.expiresAt,
          expiresAtIso: session.expiresAtIso,
        },
      });
    }
    const deviceId = deviceSource === "app" ? cleanSetupText(firstPayloadValue(payload, ["deviceId", "clientDeviceId"])) : "";
    const deviceLabel = deviceSource === "app" ? cleanSetupText(firstPayloadValue(payload, ["deviceLabel", "deviceName"])) : "";
    const usage = deviceId
      ? await recordCoachDeviceSession(accountKey, {
        deviceId,
        deviceLabel,
        deviceSource,
        userAgent: headerValue(req, "user-agent"),
        coachIndex: access.coachIndex || 0,
        expiresAtIso: session.expiresAtIso,
      }).catch((error) => ({ saved: false, error: error.message || "Device usage could not be saved." }))
      : { saved: false, skipped: true, reason: "Desktop sessions are not counted as coach devices." };
    const staffInviteUsedAt = access.staffInvite
      ? await markStaffInviteUsed({ accountKey, accountRecord: req.smartcoachRegistryAccount, staffInviteId: access.staffInviteId, deviceSource }).catch(() => "")
      : "";
    res.status(200).json({
      success: true,
      accountKey,
      productPlan: access.productPlan,
      coachSeats: access.coachSeats,
      coachIndex: access.coachIndex,
      coachName: access.coachName,
      coachId: access.staffCoachId || access.staffInviteId || "",
      accessType: access.accessType || "",
      staffCoachCodeAccepted: !!access.staffCoachCode,
      staffInviteAccepted: !!access.staffInvite,
      staffInviteUsedAt,
      parentEmailAllowed,
      sessionToken: session.token,
      expiresAt: session.expiresAt,
      expiresAtIso: session.expiresAtIso,
      coachDeviceUsageUpdated: !!(usage && usage.saved),
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message || "Could not create coach session." });
  }
}

async function accountCodeReset(req, res) {
  setSessionHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const accountKey = normalizeSetupAccountKey(
      firstPayloadValue(payload, ["accountKey", "account", "tenant", "key"]) ||
        firstQueryValue(req.query && (req.query.account || req.query.tenant || req.query.key))
    ) || "default";
    const currentCode = cleanSetupText(firstPayloadValue(payload, ["currentCode", "accessCode", "coachAccessCode", "code"]));
    const recoveryCode = cleanSetupText(firstPayloadValue(payload, ["recoveryCode", "setupCode", "ownerRecoveryCode"]));
    const newCode = cleanSetupText(firstPayloadValue(payload, ["newCode", "newAccessCode", "newCoachAccessCode"]));
    if ((!currentCode && !recoveryCode) || !newCode) throw httpError(400, "Current code or recovery code and new code are required.");
    validateNewCoachCode(newCode, accountKey);

    const result = await attachRegistryAccountForKey(req, accountKey);
    const existing = result && result.found && result.record ? result.record : null;
    if (!existing) throw httpError(404, "Account registry record was not found. Save Account Setup before changing the fallback coach code.");

    const temporaryRecoveryAllowed = !!recoveryCode && coachTemporaryRecoveryCodeAllowed(existing, accountKey, recoveryCode);
    const setupRecoveryAllowed = !!recoveryCode && setupRecoveryCodeAllowed(recoveryCode);
    const recoveryAllowed = temporaryRecoveryAllowed || setupRecoveryAllowed;
    const access = recoveryAllowed
      ? { allowed: true, coachIndex: 0, coachSeats: existing.coachSeats, coachCodeVersion: existing.coachCodeVersion }
      : coachCodeAllowed({ query: { account: accountKey }, headers: req.headers || {}, smartcoachRegistryAccount: existing }, currentCode);
    if (!access.allowed) {
      res.status(access.statusCode || 401).json(access);
      return;
    }
    if (!recoveryAllowed && !staffAccessAdminAllowed(access, existing.coachStaff)) {
      throw httpError(403, "Head coach access is required to change the fallback coach code.");
    }

    const coachSeats = normalizeSetupCoachSeats(existing.coachSeats || access.coachSeats || 1, existing.productPlan);
    const currentCodes = normalizeSetupCoachCodes(existing.coachAccessCodes || [], accountKey, coachSeats, existing.productPlan);
    if (!currentCodes.length) throw httpError(503, "No active coach code is configured for this account.");
    const coachIndex = recoveryAllowed ? 0 : currentCodes.findIndex((code) => safeEqual(code, currentCode));
    if (coachIndex < 0) throw httpError(401, "Current coach code was not accepted.");
    if (currentCodes.some((code) => safeEqual(code, newCode))) {
      throw httpError(400, "New code must be different from the current code.");
    }
    const newStaffCodeHash = staffCoachCodeHash(accountKey, newCode);
    if (normalizeCoachStaff(existing.coachStaff).some((item) => item.coachCodeHash && safeEqual(item.coachCodeHash, newStaffCodeHash))) {
      throw httpError(400, "New fallback code is already assigned to a coach.");
    }
    if (currentCodes.some((code, index) => index !== coachIndex && safeEqual(code, newCode))) {
      throw httpError(400, "New code is already assigned to another coach.");
    }

    const nextCodes = currentCodes.slice();
    nextCodes[coachIndex] = newCode;
    const coachCodeChange = coachCodeChangeState(existing, nextCodes, {
      source: recoveryAllowed ? "coach-recovery" : "coach-self-service",
      bypassMonthlyLimit: recoveryAllowed,
    });
    const nextCoachCodeVersion = (Number(existing.coachCodeVersion) || 0) + 1;
    const sessionId = crypto.randomBytes(12).toString("hex");
    const parentEmailAllowed = parentEmailFeatureReleased() && !!(Array.isArray(existing.parentEmailCoachAccess) && existing.parentEmailCoachAccess[coachIndex]);
    const session = createCoachSession(accountKey, { coachIndex, parentEmailAllowed, sessionId, coachCodeVersion: nextCoachCodeVersion });
    if (!session) {
      res.status(500).json({
        error: "SMART Trak session signing is not configured.",
        sessionSecretRequired: true,
      });
      return;
    }

    const updated = {
      ...existing,
      accountKey,
      coachAccessCodes: nextCodes,
      coachCodeRecovery: temporaryRecoveryAllowed ? { ...(existing.coachCodeRecovery || {}), usedAt: new Date().toISOString(), status: "used" } : existing.coachCodeRecovery || null,
      coachCodeChangeHistory: coachCodeChange.history,
      lastCoachCodeChange: coachCodeChange.latest || existing.lastCoachCodeChange || null,
      coachCodeVersion: nextCoachCodeVersion,
    };
    if (existing.productPlan === "essential") {
      updated.essentialActiveSession = {
        sessionId,
        coachIndex,
        createdAt: new Date().toISOString(),
        expiresAt: session.expiresAt,
        expiresAtIso: session.expiresAtIso,
      };
    }
    const registry = await saveAccountRecord(accountKey, updated);
    res.status(200).json({
      success: true,
      accountKey,
      productPlan: normalizeSetupProductPlan(existing.productPlan),
      coachIndex,
      coachCodeVersion: nextCoachCodeVersion,
      recoveryUsed: recoveryAllowed,
      temporaryRecoveryUsed: temporaryRecoveryAllowed,
      sessionToken: session.token,
      expiresAt: session.expiresAt,
      expiresAtIso: session.expiresAtIso,
      registry,
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message || "Could not change coach code." });
  }
}

async function accountCodeRecovery(req, res) {
  setSessionHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const accountKey = normalizeSetupAccountKey(
      firstPayloadValue(payload, ["accountKey", "account", "tenant", "key"]) ||
        firstQueryValue(req.query && (req.query.account || req.query.tenant || req.query.key))
    ) || "default";
    const result = await attachRegistryAccountForKey(req, accountKey);
    const existing = result && result.found && result.record ? result.record : null;
    if (!existing) throw httpError(404, "Account registry record was not found.");

    const ownerEmail = cleanEmail(existing.accountOwnerEmail);
    if (!ownerEmail) throw httpError(400, "Account owner email is not saved yet. Add it in Account Setup or contact support.");
    if (!existing.token || !existing.locationId) throw httpError(503, "Email recovery is not configured for this account. Contact support to reset the coach code.");
    const lastRequestedAt = Date.parse(existing.coachCodeRecovery && existing.coachCodeRecovery.requestedAt || "");
    if (Number.isFinite(lastRequestedAt) && Date.now() - lastRequestedAt < 60 * 1000) {
      throw httpError(429, "A temporary code was just sent. Wait a minute before requesting another one.");
    }

    const temporaryCode = generateRecoveryCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
    const recovery = {
      requestedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      tokenHash: recoveryCodeHash(accountKey, temporaryCode),
      delivery: "email",
      sentTo: ownerEmail,
      status: "pending",
    };

    const contact = await findOrCreateAccountOwnerContact({
      token: existing.token,
      locationId: existing.locationId,
      ownerEmail,
      ownerPhone: existing.accountOwnerPhone,
      ownerName: existing.accountOwnerName,
      ownerContactId: existing.accountOwnerContactId,
    });
    await saveAccountRecord(accountKey, {
      ...existing,
      accountKey,
      accountOwnerContactId: contact.id || existing.accountOwnerContactId || "",
      coachCodeRecovery: recovery,
    });
    await sendCoachCodeRecoveryEmail({
      token: existing.token,
      accountKey,
      productPlan: existing.productPlan,
      contactId: contact.id,
      ownerEmail,
      temporaryCode,
      expiresAt: recovery.expiresAt,
    });

    recovery.status = "sent";
    const updated = {
      ...existing,
      accountKey,
      accountOwnerContactId: contact.id || existing.accountOwnerContactId || "",
      coachCodeRecovery: recovery,
      lastCoachCodeRecovery: {
        requestedAt: recovery.requestedAt,
        expiresAt: recovery.expiresAt,
        delivery: recovery.delivery,
        sentTo: ownerEmail,
        status: recovery.status,
      },
    };
    const registry = await saveAccountRecord(accountKey, updated);
    res.status(200).json({
      success: true,
      accountKey,
      delivery: "email",
      sentTo: maskEmail(ownerEmail),
      expiresAt: recovery.expiresAt,
      registry,
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message || "Could not send a temporary recovery code." });
  }
}

async function findOrCreateAccountOwnerContact({ token, locationId, ownerEmail, ownerPhone, ownerName, ownerContactId }) {
  if (ownerContactId) {
    try {
      const existing = await ghlRequest({ token, path: `/contacts/${encodeURIComponent(ownerContactId)}` });
      const contact = existing.contact || existing;
      if (contact && contact.id) return contact;
    } catch (error) {
      // Fall through to email lookup when a saved contact id no longer exists.
    }
  }

  const found = await ghlRequest({
    token,
    path: `/contacts/?locationId=${encodeURIComponent(locationId)}&query=${encodeURIComponent(ownerEmail)}&limit=10`,
  });
  const match = (found.contacts || []).find((contact) => {
    const emails = [contact.email, contact.emailLowerCase, contact.primaryEmail].map(cleanEmail).filter(Boolean);
    return emails.some((email) => safeEqual(email, ownerEmail));
  });
  if (match && match.id) return match;

  const names = cleanSetupText(ownerName || ownerEmail.split("@")[0]).split(/\s+/).filter(Boolean);
  const firstName = names.shift() || "SMARTCoach";
  const lastName = names.join(" ") || "Owner";
  const created = await ghlRequest({
    token,
    path: "/contacts/",
    method: "POST",
    body: {
      locationId,
      firstName,
      lastName,
      email: ownerEmail,
      phone: cleanPhone(ownerPhone),
      source: "SMARTCoach",
      tags: ["smartcoach-account-owner"],
    },
  });
  const contact = created.contact || created;
  if (!contact || !contact.id) throw httpError(502, "SMARTCoach could not create an owner contact for recovery email.");
  return contact;
}

async function sendCoachCodeRecoveryEmail({ token, accountKey, productPlan, contactId, ownerEmail, temporaryCode, expiresAt }) {
  if (!contactId) throw httpError(400, "Account owner contact is required for recovery email.");
  const expiration = new Date(expiresAt).toLocaleString("en-US", { timeZone: "America/Chicago" });
  const essential = normalizeSetupProductPlan(productPlan) === "essential";
  const html = [
    `<p>A SMARTCoach ${essential ? "Essential app access code" : "fallback coach code"} reset was requested.</p>`,
    `<p><strong>Account:</strong> ${escapeHtml(accountKey)}<br>`,
    `<strong>Temporary recovery code:</strong> ${escapeHtml(temporaryCode)}<br>`,
    `<strong>Expires:</strong> ${escapeHtml(expiration)} Central</p>`,
    essential
      ? "<p>Enter this temporary code on the SMARTCoach Account Access page, then choose a new app access code you can remember.</p>"
      : "<p>Enter this temporary code in Staff Access, then choose a new fallback coach code.</p>",
    "<p>If you did not request this reset, contact support@smartcoach-pro.com.</p>",
  ].join("");
  await ghlRequest({
    token,
    path: "/conversations/messages",
    method: "POST",
    body: {
      type: "Email",
      contactId,
      emailTo: ownerEmail,
      subject: essential ? "SMARTCoach Essential access code reset" : "SMARTCoach fallback coach code reset",
      html,
    },
  });
}

function escapeHtml(value) {
  return cleanSetupText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function generateRecoveryCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = crypto.randomBytes(8);
  for (const byte of bytes) code += alphabet[byte % alphabet.length];
  return code.slice(0, 8);
}

function recoveryCodeHash(accountKey, code) {
  const secret = cleanSetupText(process.env.SMARTCOACH_SESSION_SECRET || process.env.SMARTCOACH_ADMIN_SETUP_CODE || "smartcoach-recovery");
  return crypto.createHash("sha256").update(`${secret}:${accountKey}:${cleanSetupText(code).toUpperCase()}`).digest("hex");
}

function coachTemporaryRecoveryCodeAllowed(account, accountKey, providedCode) {
  const recovery = account && account.coachCodeRecovery || {};
  const provided = cleanSetupText(providedCode);
  if (!provided || !recovery.tokenHash || recovery.status === "used") return false;
  const expiresAt = Date.parse(recovery.expiresAt || "");
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  return safeEqual(recovery.tokenHash, recoveryCodeHash(accountKey, provided));
}

function validateNewCoachCode(newCode, accountKey) {
  const value = cleanSetupText(newCode);
  if (value.length < 6) throw httpError(400, "New code must be at least 6 characters.");
  const normalized = value.toLowerCase().replace(/\s+/g, "");
  const blocked = new Set(["123456", "password", "coach", "smartcoach", "smarttrak", "track", "xcountry"]);
  if (blocked.has(normalized) || normalized === cleanSetupText(accountKey).toLowerCase()) {
    throw httpError(400, "Choose a more specific coach code.");
  }
}

async function attachRegistryAccount(req) {
  const accountKey = accountKeyFromRequest(req);
  return attachRegistryAccountForKey(req, accountKey);
}

async function attachRegistryAccountForKey(req, accountKeyValue) {
  const accountKey = normalizeSetupAccountKey(accountKeyValue) || "default";
  let result = { configured: registryConfigured(), found: false, record: null };
  try {
    result = await loadAccountRecord(accountKey);
    if (result && result.found && result.record) {
      req.smartcoachRegistryAccount = result.record;
    }
  } catch (error) {
    result = { configured: true, found: false, record: null, error: error.message || "Registry could not be checked." };
  }
  return result;
}

function accountKeyFromRequest(req) {
  return (
    headerValue(req, "x-smartcoach-account") ||
    firstQueryValue(req.query && (req.query.account || req.query.tenant || req.query.key)) ||
    "default"
  );
}

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeSetupAccountKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function normalizeSetupProductPlan(value) {
  return normalizePlanKey(value);
}

function normalizeSetupCoachSeats(value, productPlan) {
  const seats = Number(String(value || "").trim());
  const max = productPlan === "essential" ? 1 : 10;
  if (!Number.isFinite(seats) || seats < 1) return 1;
  return Math.max(1, Math.min(Math.floor(seats), max));
}

function setupSubscriptionFromQuery(query, productPlan) {
  const billingCadence = normalizeSetupBillingCadence(firstQueryValue(query.billingCadence || query.cadence) || "monthly");
  return {
    status: normalizeSetupSubscriptionStatus(firstQueryValue(query.subscriptionStatus || query.status) || "active"),
    billingCadence,
    amount: cleanSetupText(firstQueryValue(query.subscriptionAmount || query.amount) || suggestedSubscriptionAmount(productPlan, query.coachSeats || query.coaches || query.seats, billingCadence)),
    renewalDate: cleanSetupText(firstQueryValue(query.renewalDate || query.renewsOn || query.nextBillingDate)),
    stripeCustomerId: cleanSetupText(firstQueryValue(query.stripeCustomerId || query.customerId)),
    stripeSubscriptionId: cleanSetupText(firstQueryValue(query.stripeSubscriptionId || query.subscriptionId)),
    notes: cleanSetupText(firstQueryValue(query.subscriptionNotes || query.notes)),
  };
}

async function loadExistingAccountRecord(accountKey) {
  try {
    const result = await loadAccountRecord(accountKey);
    return result && result.found && result.record ? result.record : null;
  } catch (error) {
    return null;
  }
}

function accountAutomationRecord(payload, existingRecord, options = {}) {
  const existing = existingRecord || {};
  const existingSubscription = existing.subscription || {};
  const accountKey = automationAccountKey(payload);
  if (!accountKey) throw httpError(400, "Account key is required.");
  const productPlanValue = firstAutomationValue(payload, ["productPlan", "plan", "subscriptionPlan"]);
  const productPlan = productPlanValue ? normalizeSetupProductPlan(productPlanValue) : normalizeSetupProductPlan(existing.productPlan || "pro");
  const coachSeatsValue = firstAutomationValue(payload, ["coachSeats", "coaches", "seats"]);
  const coachSeats = coachSeatsValue ? normalizeSetupCoachSeats(coachSeatsValue, productPlan) : normalizeSetupCoachSeats(existing.coachSeats || 1, productPlan);
  const statusValue = firstAutomationValue(payload, ["subscriptionStatus", "status"]);
  const billingValue = firstAutomationValue(payload, ["billingCadence", "billingInterval", "cadence", "interval"]);
  const amountValue = firstAutomationValue(payload, ["subscriptionAmount", "amount", "price", "unitAmount", "unit_amount"]);
  const renewalValue = firstAutomationValue(payload, ["renewalDate", "renewsOn", "nextBillingDate", "currentPeriodEnd", "current_period_end"]);
  const stripeCustomerValue = firstAutomationValue(payload, ["stripeCustomerId", "customerId", "customer"]);
  const stripeSubscriptionValue = firstAutomationValue(payload, ["stripeSubscriptionId", "subscriptionId", "subscription"]);
  const notesValue = firstAutomationValue(payload, ["subscriptionNotes", "notes"]);
  const billingCadence = billingValue ? normalizeSetupBillingCadence(billingValue) : existingSubscription.billingCadence || "monthly";
  const subscription = {
    status: statusValue ? normalizeSetupSubscriptionStatus(statusValue) : existingSubscription.status || "active",
    billingCadence,
    amount: normalizeSetupSubscriptionAmount(productPlan, billingCadence, amountValue ? normalizeMoneyAmount(amountValue) : existingSubscription.amount),
    renewalDate: renewalValue ? normalizeDateValue(renewalValue) : existingSubscription.renewalDate || "",
    stripeCustomerId: cleanSetupText(stripeCustomerValue || existingSubscription.stripeCustomerId),
    stripeSubscriptionId: cleanSetupText(stripeSubscriptionValue || existingSubscription.stripeSubscriptionId),
    notes: cleanSetupText(notesValue || existingSubscription.notes),
  };
  const coachCodesValue = firstAutomationValue(payload, ["coachAccessCodes", "coachCodes", "accessCodes"]);
  const coachCodes = coachCodesValue ? normalizeSetupCoachCodes(coachCodesValue, accountKey, coachSeats, productPlan) : normalizeSetupCoachCodes(existing.coachAccessCodes || [], accountKey, coachSeats, productPlan);
  const coachCodeChange = coachCodeChangeState(existing, coachCodes, options);
  const parentEmailCoachAccessValue = firstAutomationValue(payload, ["parentEmailCoachAccess", "parentEmailCoachIndexes", "parentEmailCoaches"]);
  const parentEmailCoachAccess = parentEmailCoachAccessValue ? normalizeParentEmailCoachAccess(parentEmailCoachAccessValue, coachSeats, productPlan) : normalizeParentEmailCoachAccess(existing.parentEmailCoachAccess || [], coachSeats, productPlan);
  const tokenValue = firstAutomationValue(payload, ["ghlToken", "privateIntegrationToken", "token"]);
  const locationValue = firstAutomationValue(payload, ["locationId", "ghlLocationId"]);
  const logoValue = firstAutomationValue(payload, ["logoUrl", "brandLogoUrl", "schoolLogoUrl"]);
  const ownerEmailValue = firstAutomationValue(payload, ["accountOwnerEmail", "ownerEmail", "headCoachEmail", "coachEmail", "email"]);
  const ownerPhoneValue = firstAutomationValue(payload, ["accountOwnerPhone", "ownerPhone", "headCoachPhone", "coachPhone", "phone"]);
  const ownerNameValue = firstAutomationValue(payload, ["accountOwnerName", "ownerName", "headCoachName", "coachName", "name"]);
  const ownerContactIdValue = firstAutomationValue(payload, ["accountOwnerContactId", "ownerContactId", "headCoachContactId", "coachContactId"]);
  const requireCoachAccessValue = firstAutomationValue(payload, ["requireCoachAccess", "coachAccessRequired", "requireAccessCode"]);
  const requireCoachAccess = normalizeSetupBoolean(requireCoachAccessValue, existing.requireCoachAccess !== undefined ? existing.requireCoachAccess : true);
  const event = automationEventSummary(payload, options);
  const automationEventHistory = automationEventHistoryFor(existing.automationEventHistory, event);
  return {
    accountKey,
    productPlan,
    token: cleanSetupText(tokenValue || existing.token),
    locationId: cleanSetupText(locationValue || existing.locationId),
    coachSeats,
    coachAccessCodes: coachCodes,
    parentEmailCoachAccess: isProPlan(productPlan) ? parentEmailCoachAccess : [],
    requireCoachAccess,
    subscription,
    logoUrl: cleanSetupText(logoValue || existing.logoUrl),
    accountOwnerEmail: cleanEmail(ownerEmailValue || existing.accountOwnerEmail),
    accountOwnerPhone: cleanPhone(ownerPhoneValue || existing.accountOwnerPhone),
    accountOwnerName: cleanSetupText(ownerNameValue || existing.accountOwnerName),
    accountOwnerContactId: cleanSetupText(ownerContactIdValue || existing.accountOwnerContactId),
    coachCodeRecovery: existing.coachCodeRecovery || null,
    coachStaff: normalizeCoachStaff(existing.coachStaff),
    lastStaffSync: existing.lastStaffSync || null,
    coachCodeChangeHistory: coachCodeChange.history,
    lastCoachCodeChange: coachCodeChange.latest || existing.lastCoachCodeChange || null,
    coachCodeVersion: coachCodeChange.changed && !options.dryRun ? (Number(existing.coachCodeVersion) || 0) + 1 : Number(existing.coachCodeVersion) || 0,
    lastAutomationEvent: event,
    automationEventHistory,
  };
}

const ACCOUNT_CLEANUP_OPTIONS = {
  groups: {
    label: "Shared training groups",
    fields: ["smartcoachGroups", "lastGroupsSync"],
  },
  training: {
    label: "Completed workout mirror",
    fields: ["trainingMirror", "lastTrainingMirrorSync"],
  },
  attendance: {
    label: "Attendance records",
    fields: ["attendanceMirror", "lastAttendanceSync"],
  },
  keep: {
    label: "Keep Trak notes",
    fields: ["keepTrakNotes", "lastKeepTrakSync"],
  },
  equipment: {
    label: "Equipment Trak",
    fields: ["equipmentTrak", "lastEquipmentTrakSync"],
  },
  docu: {
    label: "Docu Trak",
    fields: ["docuTrak", "lastDocuTrakSync"],
  },
  partnerTiming: {
    label: "Partner Timing sessions",
    fields: ["partnerTimingSessions", "lastPartnerTimingSync"],
  },
  fieldPractice: {
    label: "Field Practice sessions",
    fields: ["fieldPracticeSessions", "lastFieldPracticeSync"],
  },
  milesBoard: {
    label: "Miles Board sharing",
    fields: ["milesBoardSharing", "milesBoardSnapshots"],
  },
  speedBoard: {
    label: "Speed Trak Board sharing",
    fields: ["speedBoardSharing", "lastSpeedBoardSharingSync"],
  },
  dashboardPreferences: {
    label: "Dashboard customizations",
    fields: ["dashboardPreferences", "lastDashboardPreferencesSync"],
  },
  weather: {
    label: "Weather locations",
    fields: ["weatherLocations", "lastWeatherLocationSync"],
  },
  feedback: {
    label: "Bug Trak / Idea Trak reports",
    fields: ["bugTrakReports", "lastBugTrakReport"],
  },
};

function normalizeAccountCleanupOptions(source) {
  const input = source && typeof source === "object" ? source : {};
  return Object.keys(ACCOUNT_CLEANUP_OPTIONS).reduce((options, key) => {
    options[key] = normalizeSetupBoolean(input[key], false);
    return options;
  }, {});
}

function cleanupAccountRecord(record, options) {
  const now = new Date().toISOString();
  const next = { ...(record || {}) };
  const cleared = [];
  Object.keys(ACCOUNT_CLEANUP_OPTIONS).forEach((key) => {
    if (!options[key]) return;
    const spec = ACCOUNT_CLEANUP_OPTIONS[key];
    const before = cleanupFieldSummary(next, spec.fields);
    spec.fields.forEach((field) => {
      delete next[field];
    });
    cleared.push({ key, label: spec.label, before });
  });
  const cleanupEvent = {
    cleanedAt: now,
    source: "SMARTCoach Admin Cleanup",
    cleared: cleared.map((item) => item.key),
  };
  next.lastAdminCleanup = cleanupEvent;
  next.adminCleanupHistory = [cleanupEvent, ...(Array.isArray(next.adminCleanupHistory) ? next.adminCleanupHistory : [])].slice(0, 20);
  return { record: next, cleared, cleanupEvent };
}

function cleanupFieldSummary(record, fields) {
  return fields.reduce((summary, field) => {
    const value = record && record[field];
    if (Array.isArray(value)) summary[field] = value.length;
    else if (value && typeof value === "object") summary[field] = Object.keys(value).length;
    else if (value) summary[field] = 1;
    else summary[field] = 0;
    return summary;
  }, {});
}

function coachCodeChangeState(existing, nextCodes, options = {}) {
  const currentCodes = normalizeSetupCoachCodes(existing && existing.coachAccessCodes || [], existing && existing.accountKey || "", existing && existing.coachSeats || 1, existing && existing.productPlan);
  const incomingCodes = Array.isArray(nextCodes) ? nextCodes : [];
  const history = Array.isArray(existing && existing.coachCodeChangeHistory) ? existing.coachCodeChangeHistory.filter(Boolean) : [];
  if (!currentCodes.length || !incomingCodes.length || codesMatch(currentCodes, incomingCodes)) {
    return { changed: false, history, latest: null };
  }
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthlyChanges = history.filter((item) => String(item && item.month || "").slice(0, 7) === monthKey);
  if (!options.bypassMonthlyLimit && monthlyChanges.length >= 2) {
    throw httpError(429, "Coach code reset limit reached for this month. Coach codes can be changed 2 times per month.");
  }
  const latest = {
    changedAt: new Date().toISOString(),
    month: monthKey,
    source: cleanSetupText(options.source || "manual"),
  };
  return {
    changed: true,
    history: options.dryRun ? history : [latest, ...history].slice(0, 24),
    latest: options.dryRun ? null : latest,
  };
}

function codesMatch(left, right) {
  const a = (Array.isArray(left) ? left : []).map(cleanSetupText).filter(Boolean).sort();
  const b = (Array.isArray(right) ? right : []).map(cleanSetupText).filter(Boolean).sort();
  if (a.length !== b.length) return false;
  return a.every((code, index) => safeEqual(code, b[index]));
}

function automationAccountKey(payload) {
  return normalizeSetupAccountKey(
    firstAutomationValue(payload, [
      "accountKey",
      "smartcoachAccountKey",
      "smartCoachAccountKey",
      "smarttrakAccountKey",
      "smartTrakAccountKey",
      "smartcoach_account_key",
      "smartcoachAccount",
      "smartcoach_account",
      "smarttrak_account_key",
      "account",
      "tenant",
      "key",
      "locationName",
      "companyName",
      "client_reference_id",
      "clientReferenceId",
    ])
  );
}

function automationEventSummary(payload, options = {}) {
  const root = payload || {};
  const object = root.data && root.data.object || {};
  const sourceValue = firstAutomationValue(payload, ["updateSource", "source", "automationSource"]);
  const source = cleanSetupText(sourceValue || options.source || "automation");
  return {
    source,
    eventType: cleanSetupText(root.type || firstAutomationValue(payload, ["eventType", "event", "trigger"]) || object.object || "account_update"),
    stripeEventId: cleanSetupText(root.id && String(root.id).startsWith("evt_") ? root.id : ""),
    stripeObjectId: cleanSetupText(object.id || ""),
    receivedAt: new Date().toISOString(),
  };
}

function automationEventHistoryFor(existingHistory, event) {
  const history = Array.isArray(existingHistory) ? existingHistory.filter(Boolean) : [];
  const current = event || {};
  const key = automationEventKey(current);
  const withoutDuplicate = key ? history.filter((item) => automationEventKey(item) !== key) : history;
  return [current, ...withoutDuplicate].slice(0, 10);
}

function automationEventAlreadyRecorded(existingRecord, event) {
  const key = automationEventKey(event);
  if (!key || !existingRecord) return false;
  const history = Array.isArray(existingRecord.automationEventHistory) ? existingRecord.automationEventHistory : [];
  const events = [existingRecord.lastAutomationEvent, ...history].filter(Boolean);
  return events.some((item) => automationEventKey(item) === key);
}

function automationEventKey(event) {
  const source = event || {};
  if (source.stripeEventId) return `stripe:${source.stripeEventId}`;
  if (source.stripeObjectId && source.eventType) return `${source.eventType}:${source.stripeObjectId}`;
  if (source.source && source.eventType && source.receivedAt) return `${source.source}:${source.eventType}:${source.receivedAt}`;
  return "";
}

function accountEnvironmentRows({ suffix, account, includeCrm }) {
  const rows = [
    {
      key: `SMARTCOACH_PRODUCT_PLAN_${suffix}`,
      value: account.productPlan,
      required: true,
      label: "Plan",
      description: "Controls whether this account is Essential or Pro.",
    },
    {
      key: `SMARTCOACH_SUBSCRIPTION_STATUS_${suffix}`,
      value: account.subscription.status,
      required: false,
      recommended: true,
      label: "Subscription status",
      description: "Internal customer subscription status: active, trialing, past_due, paused, canceled, incomplete, incomplete_expired, or unpaid.",
    },
    {
      key: `SMARTCOACH_BILLING_CADENCE_${suffix}`,
      value: account.subscription.billingCadence,
      required: false,
      recommended: true,
      label: "Billing cadence",
      description: "Internal billing cadence for this customer: monthly or annual.",
    },
    {
      key: `SMARTCOACH_SUBSCRIPTION_AMOUNT_${suffix}`,
      value: account.subscription.amount,
      required: false,
      recommended: true,
      label: "Subscription amount",
      description: "Internal monthly or annual subscription amount. Active athlete limits are enforced by SMARTCoach.",
    },
    {
      key: `SMARTCOACH_RENEWAL_DATE_${suffix}`,
      value: account.subscription.renewalDate,
      required: false,
      recommended: true,
      label: "Renewal date",
      description: "Internal next renewal or billing date in YYYY-MM-DD format.",
    },
    {
      key: `SMARTCOACH_STRIPE_CUSTOMER_ID_${suffix}`,
      value: account.subscription.stripeCustomerId,
      required: false,
      label: "Stripe customer ID",
      description: "Optional internal billing reference. This is not shown in the coach-facing app.",
    },
    {
      key: `SMARTCOACH_STRIPE_SUBSCRIPTION_ID_${suffix}`,
      value: account.subscription.stripeSubscriptionId,
      required: false,
      label: "Stripe subscription ID",
      description: "Optional internal subscription reference. This is not shown in the coach-facing app.",
    },
    {
      key: `SMARTCOACH_SUBSCRIPTION_NOTES_${suffix}`,
      value: account.subscription.notes,
      required: false,
      label: "Subscription notes",
      description: "Optional internal notes about this customer subscription.",
    },
  ];
  rows.push(
    {
      key: `SMARTCOACH_COACH_SEATS_${suffix}`,
      value: String(account.coachSeats || 1),
      required: true,
      label: "Coach seats",
      description: isProPlan(account.productPlan) ? "Pro accounts use named personal coach codes and include up to 10 assistant coach seats. Keep staff access tight to protect clean data." : "Essential allows one active device session at a time.",
    },
    {
      key: `SMARTCOACH_COACH_ACCESS_CODES_${suffix}`,
      value: (account.coachAccessCodes || []).join(","),
      required: true,
      label: "Coach access codes",
      description: isProPlan(account.productPlan) ? `Share the code only with active staff. This account is set for ${account.coachSeats || 1} assistant coach seat${(account.coachSeats || 1) === 1 ? "" : "s"}.` : "Essential requires an active code and allows one active device at a time.",
    },
    {
      key: `SMARTCOACH_REQUIRE_COACH_ACCESS_${suffix}`,
      value: account.requireCoachAccess === false ? "false" : "true",
      required: true,
      label: "Require coach access",
      description: "Blocks SMARTCoach until this account has an active coach access code configured.",
    },
    {
      key: `SMARTCOACH_ACCOUNT_OWNER_EMAIL_${suffix}`,
      value: account.accountOwnerEmail || "",
      required: false,
      recommended: true,
      label: "Account owner email",
      description: "Used for fallback code recovery. The old coach code is never shown; the owner receives a temporary reset code.",
    },
    {
      key: `SMARTCOACH_ACCOUNT_OWNER_PHONE_${suffix}`,
      value: account.accountOwnerPhone || "",
      required: false,
      label: "Account owner phone",
      description: "Optional future SMS recovery contact for this customer.",
    }
  );
  if (includeCrm) {
    rows.push(
      {
        key: `GHL_PRIVATE_INTEGRATION_TOKEN_${suffix}`,
        value: account.token || "paste_customer_private_integration_token",
        required: true,
        label: "Private integration token",
        description: "Customer SMART Trak private integration token.",
      },
      {
        key: `GHL_LOCATION_ID_${suffix}`,
        value: account.locationId || "paste_customer_location_id",
        required: true,
        label: "Location ID",
        description: "Customer SMART Trak sub-account location ID.",
      },
      {
        key: `SMARTCOACH_PARENT_EMAIL_COACH_ACCESS_${suffix}`,
        value: parentEmailAccessIndexes(account.parentEmailCoachAccess).join(","),
        required: false,
        label: "Future parent email coaches",
        description: "Optional future release only. Use coach numbers like 1 or 1,3; tools stay hidden until the global parent email release flag is turned on.",
      }
    );
  }
  return rows;
}

function publicSubscriptionSummary(subscription) {
  const source = subscription || {};
  return {
    status: source.status || "",
    billingCadence: source.billingCadence || "",
    amount: source.amount || "",
    renewalDate: source.renewalDate || "",
  };
}

function normalizeSetupSubscriptionStatus(value) {
  const status = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  const aliases = {
    paid: "active",
    current: "active",
    subscribed: "active",
    trial: "trialing",
    trial_period: "trialing",
    payment_failed: "past_due",
    failed_payment: "past_due",
    failed: "past_due",
    overdue: "past_due",
    pastdue: "past_due",
    cancelled: "canceled",
    cancel: "canceled",
    stopped: "canceled",
    ended: "canceled",
    pause: "paused",
    suspended: "paused",
    open: "incomplete",
    pending: "incomplete",
    expired: "incomplete_expired",
    not_paid: "unpaid",
    no_payment: "unpaid",
  };
  const normalized = aliases[status] || status;
  return ["active", "trialing", "past_due", "paused", "canceled", "incomplete", "incomplete_expired", "unpaid"].includes(normalized) ? normalized : "incomplete";
}

function normalizeSetupBillingCadence(value) {
  const cadence = String(value || "").trim().toLowerCase();
  return cadence === "annual" || cadence === "year" || cadence === "yearly" ? "annual" : "monthly";
}

function normalizeSetupBoolean(value, fallback) {
  const raw = String(value === undefined || value === null ? "" : value).trim().toLowerCase();
  if (!raw) return !!fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return !!fallback;
}

function parentEmailFeatureReleased() {
  return normalizeSetupBoolean(process.env.SMARTCOACH_PARENT_EMAIL_FEATURE_ENABLED, false);
}

function normalizeMoneyAmount(value) {
  const raw = cleanSetupText(value);
  if (!raw) return "";
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && Math.abs(numeric) >= 100 && !raw.includes(".")) {
    return (numeric / 100).toFixed(2);
  }
  return raw;
}

function normalizeDateValue(value) {
  const raw = cleanSetupText(value);
  if (!raw) return "";
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 1000000000) {
    const milliseconds = numeric > 100000000000 ? numeric : numeric * 1000;
    return new Date(milliseconds).toISOString().slice(0, 10);
  }
  return raw;
}

function cleanSetupText(value) {
  return String(value || "").trim();
}

function maskLocationId(value) {
  const text = cleanSetupText(value);
  if (!text) return "";
  if (text.length <= 8) return text;
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

function cleanEmail(value) {
  const email = cleanSetupText(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function cleanPhone(value) {
  return cleanSetupText(value).replace(/[^\d+]/g, "").slice(0, 24);
}

function maskEmail(value) {
  const email = cleanEmail(value);
  if (!email) return "";
  const parts = email.split("@");
  const name = parts[0] || "";
  const domain = parts[1] || "";
  if (name.length <= 2) return `${name.slice(0, 1)}***@${domain}`;
  return `${name.slice(0, 2)}***@${domain}`;
}

function normalizeSetupCoachCodes(value, accountKey, coachSeats, productPlan) {
  const codes = [];
  const add = (item) => {
    const code = cleanSetupText(item);
    if (code && !codes.includes(code)) codes.push(code);
  };
  if (Array.isArray(value)) value.forEach(add);
  else if (value) cleanSetupText(value).split(/[\n,]+/).forEach(add);
  return codes.slice(0, normalizeSetupCoachSeats(coachSeats, productPlan));
}

function normalizeParentEmailCoachAccess(value, coachSeats, productPlan) {
  const seats = normalizeSetupCoachSeats(coachSeats, productPlan);
  const allowed = Array.from({ length: seats }, () => false);
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const raw = cleanSetupText(item).toLowerCase();
      if (["1", "true", "yes", "on", "allow", "allowed", "enabled"].includes(raw)) allowed[index] = true;
      else {
        const number = Number(raw);
        if (Number.isFinite(number) && number >= 1 && number <= seats) allowed[number - 1] = true;
      }
    });
    return allowed;
  }
  const raw = cleanSetupText(value);
  if (!raw) return allowed;
  if (/^(all|true|yes|on|enabled)$/i.test(raw)) return allowed.map(() => true);
  raw.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean).forEach((item, index) => {
    const key = item.toLowerCase();
    if (["true", "yes", "on", "allow", "allowed", "enabled"].includes(key)) allowed[index] = true;
    const match = key.match(/(?:coach)?\s*(\d+)/);
    const number = match ? Number(match[1]) : Number(key);
    if (Number.isFinite(number) && number >= 1 && number <= seats) allowed[number - 1] = true;
  });
  return allowed;
}

function parentEmailAccessIndexes(value) {
  return (Array.isArray(value) ? value : []).map((allowed, index) => allowed ? String(index + 1) : "").filter(Boolean);
}

function suggestedSubscriptionAmount(productPlan, coachSeatsValue, billingCadence) {
  return planSubscriptionAmount(productPlan, billingCadence);
}

function normalizeSetupSubscriptionAmount(productPlan, billingCadence, amount) {
  const value = cleanSetupText(amount);
  if (productPlan === "proUnlimited" && (!value || isStandardPlanAmount(value))) {
    return suggestedSubscriptionAmount(productPlan, null, billingCadence);
  }
  return value || suggestedSubscriptionAmount(productPlan, null, billingCadence);
}

function isStandardPlanAmount(value) {
  const amount = cleanSetupText(value).replace(/^\$/, "");
  return ["10", "10.00", "100", "100.00", "45", "45.00", "450", "450.00", "75", "75.00", "750", "750.00", "135", "135.00", "1350", "1350.00"].includes(amount);
}

function setupAdminAllowed(req) {
  const expected = String(process.env.SMARTCOACH_ADMIN_SETUP_CODE || "").trim();
  if (!expected) return true;
  const provided = String((req.headers && (req.headers["x-smartcoach-setup-code"] || req.headers["X-SMARTCoach-Setup-Code"])) || firstQueryValue(req.query && req.query.setupCode) || "").trim();
  return provided && safeEqual(provided, expected);
}

function setupRecoveryCodeAllowed(providedCode) {
  const expected = String(process.env.SMARTCOACH_ADMIN_SETUP_CODE || "").trim();
  const provided = cleanSetupText(providedCode);
  return !!(expected && provided && safeEqual(provided, expected));
}

function automationAllowed(req) {
  const expected = cleanSetupText(process.env.SMARTCOACH_AUTOMATION_SECRET);
  if (!expected) return false;
  const auth = cleanSetupText(req.headers && (req.headers.authorization || req.headers.Authorization));
  const bearer = auth.replace(/^Bearer\s+/i, "");
  const payload = requestBodyObject(req);
  const provided = cleanSetupText(
    (req.headers && (req.headers["x-smartcoach-automation-secret"] || req.headers["X-SMARTCoach-Automation-Secret"])) ||
      bearer ||
      firstQueryValue(req.query && req.query.automationSecret) ||
      firstQueryValue(req.query && req.query.secret) ||
      firstQueryValue(req.query && req.query.token) ||
      firstAutomationValue(payload, ["automationSecret", "smartcoachAutomationSecret", "SMARTCOACH_AUTOMATION_SECRET", "secret", "token"])
  );
  return provided && safeEqual(provided, expected);
}

function automationSecretDebug(req) {
  const headers = req && req.headers || {};
  const payload = requestBodyObject(req);
  const customData = payload && (payload.customData || payload.custom_data) || {};
  return {
    expectedConfigured: !!cleanSetupText(process.env.SMARTCOACH_AUTOMATION_SECRET),
    queryKeys: Object.keys(req && req.query || {}).sort(),
    hasQueryAutomationSecret: !!firstQueryValue(req && req.query && req.query.automationSecret),
    hasQuerySecret: !!firstQueryValue(req && req.query && req.query.secret),
    hasQueryToken: !!firstQueryValue(req && req.query && req.query.token),
    hasAutomationHeader: !!(headers["x-smartcoach-automation-secret"] || headers["X-SMARTCoach-Automation-Secret"]),
    hasAuthorizationHeader: !!(headers.authorization || headers.Authorization),
    bodyKeys: Object.keys(payload || {}).sort(),
    customDataKeys: customData && typeof customData === "object" ? Object.keys(customData).sort() : [],
    hasNestedAutomationSecret: !!firstAutomationValue(payload, ["automationSecret", "smartcoachAutomationSecret", "SMARTCOACH_AUTOMATION_SECRET", "secret", "token"]),
  };
}

function requestBodyObject(req) {
  if (!req || !req.body) return {};
  if (typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  try {
    const text = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body || "");
    return text ? JSON.parse(text) : {};
  } catch (error) {
    return {};
  }
}

function setAutomationHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Stripe-Signature, X-SMARTCoach-Automation-Secret");
}

function setSessionHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-SMARTCoach-Account, X-SMARTCoach-Access-Code, X-SMARTCoach-Session");
}

function setSmartTrakSecurityHeaders(res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}

function firstPayloadValue(payload, keys) {
  for (const key of keys) {
    const value = payload && payload[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function firstAutomationValue(payload, keys) {
  const candidates = automationPayloadCandidates(payload);
  for (const source of candidates) {
    for (const key of keys) {
      const value = source && source[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") return value;
    }
  }
  const nestedValue = findNestedAutomationValue(payload, keys);
  if (nestedValue !== undefined && nestedValue !== null && String(nestedValue).trim() !== "") return nestedValue;
  const stripeObject = payload && payload.data && payload.data.object;
  for (const key of keys) {
    const value = stripeNestedValue(stripeObject, key);
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function automationPayloadCandidates(payload) {
  const root = payload || {};
  const object = root.data && root.data.object || {};
  return [
    root,
    root.account,
    root.customer,
    root.subscription,
    root.customData,
    root.custom_data,
    root.metadata,
    object,
    object.metadata,
    object.customer_details,
    object.subscription_details && object.subscription_details.metadata,
    object.price,
    object.plan,
    object.recurring,
  ].filter(Boolean);
}

function findNestedAutomationValue(source, keys, seen = new Set()) {
  if (!source || typeof source !== "object") return "";
  if (seen.has(source)) return "";
  seen.add(source);
  const wanted = new Set(keys.map((key) => normalizeAutomationKey(key)));
  if (Array.isArray(source)) {
    for (const item of source) {
      if (item && typeof item === "object") {
        const pairKey = item.key || item.name || item.field || item.label;
        const pairValue = item.value || item.val || item.text;
        if (pairKey && wanted.has(normalizeAutomationKey(pairKey)) && pairValue !== undefined && pairValue !== null && String(pairValue).trim() !== "") return pairValue;
      }
      const nested = findNestedAutomationValue(item, keys, seen);
      if (nested !== undefined && nested !== null && String(nested).trim() !== "") return nested;
    }
    return "";
  }
  for (const [key, value] of Object.entries(source)) {
    if (wanted.has(normalizeAutomationKey(key)) && value !== undefined && value !== null && String(value).trim() !== "") return value;
    const nested = findNestedAutomationValue(value, keys, seen);
    if (nested !== undefined && nested !== null && String(nested).trim() !== "") return nested;
  }
  return "";
}

function normalizeAutomationKey(key) {
  return String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function stripeNestedValue(object, key) {
  const source = object || {};
  if (key === "billingCadence" || key === "billingInterval" || key === "cadence" || key === "interval") {
    return source.items && source.items.data && source.items.data[0] && source.items.data[0].price && source.items.data[0].price.recurring && source.items.data[0].price.recurring.interval ||
      source.plan && source.plan.interval ||
      source.price && source.price.recurring && source.price.recurring.interval;
  }
  if (key === "subscriptionAmount" || key === "amount" || key === "price" || key === "unitAmount" || key === "unit_amount") {
    return source.amount_total || source.amount_paid || source.unit_amount ||
      source.items && source.items.data && source.items.data[0] && source.items.data[0].price && source.items.data[0].price.unit_amount ||
      source.plan && source.plan.amount ||
      source.price && source.price.unit_amount;
  }
  if (key === "renewalDate" || key === "renewsOn" || key === "nextBillingDate" || key === "currentPeriodEnd" || key === "current_period_end") {
    return source.current_period_end || source.currentPeriodEnd;
  }
  if (key === "stripeSubscriptionId" || key === "subscriptionId" || key === "subscription") {
    return typeof source.subscription === "string" ? source.subscription : source.id && String(source.object || "").includes("subscription") ? source.id : "";
  }
  return "";
}

async function requestBodyText(req) {
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  if (req.rawBody) return Buffer.isBuffer(req.rawBody) ? req.rawBody.toString("utf8") : String(req.rawBody);
  if (req.body && typeof req.body === "object") return JSON.stringify(req.body);
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function verifyStripeSignature(rawBody, signatureHeader, secret) {
  const parts = stripeSignatureParts(signatureHeader);
  const timestamp = parts.t && parts.t[0];
  const signatures = parts.v1 || [];
  if (!timestamp || !signatures.length) throw httpError(401, "Stripe signature is invalid.");
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) throw httpError(401, "Stripe signature timestamp is invalid.");
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds);
  if (ageSeconds > 5 * 60) throw httpError(401, "Stripe signature is too old.");
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  if (!signatures.some((signature) => safeEqual(signature, expected))) {
    throw httpError(401, "Stripe signature could not be verified.");
  }
}

function stripeSignatureParts(header) {
  return String(header || "").split(",").reduce((parts, item) => {
    const index = item.indexOf("=");
    if (index < 1) return parts;
    const key = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();
    if (!parts[key]) parts[key] = [];
    parts[key].push(value);
    return parts;
  }, {});
}

function headerValue(req, name) {
  const headers = (req && req.headers) || {};
  return headers[name] || headers[name.toLowerCase()] || "";
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function safeEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

function milesBoardToken(accountKey, tokenVersion = "1") {
  const secret = cleanSetupText(process.env.SMARTCOACH_MILES_BOARD_SECRET || process.env.SMARTCOACH_SESSION_SECRET || process.env.SMARTCOACH_AUTOMATION_SECRET || process.env.SMARTCOACH_ADMIN_SETUP_CODE || "smartcoach-miles-board");
  return crypto.createHmac("sha256", secret).update(`miles-board:${normalizeSetupAccountKey(accountKey) || "default"}:${cleanSetupText(tokenVersion) || "1"}`).digest("base64url");
}

function legacyMilesBoardToken(accountKey) {
  const secret = cleanSetupText(process.env.SMARTCOACH_MILES_BOARD_SECRET || process.env.SMARTCOACH_SESSION_SECRET || process.env.SMARTCOACH_AUTOMATION_SECRET || process.env.SMARTCOACH_ADMIN_SETUP_CODE || "smartcoach-miles-board");
  return crypto.createHmac("sha256", secret).update(`miles-board:${normalizeSetupAccountKey(accountKey) || "default"}`).digest("base64url");
}

function milesBoardTokenVersion() {
  return crypto.randomBytes(12).toString("base64url");
}

function milesBoardShareKey(input) {
  const source = input && typeof input === "object" ? input : {};
  const payload = {
    a: normalizeSetupAccountKey(source.account),
    t: cleanSetupText(source.token),
    s: cleanSetupText(source.start),
    e: cleanSetupText(source.end),
    c: cleanSetupText(source.challenge),
    cs: cleanSetupText(source.challenges),
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function milesBoardShareFromKey(value) {
  const key = cleanSetupText(value);
  if (!key) return {};
  try {
    const raw = JSON.parse(Buffer.from(key, "base64url").toString("utf8"));
    return {
      account: normalizeSetupAccountKey(raw.a || raw.account),
      token: cleanSetupText(raw.t || raw.token),
      start: cleanSetupText(raw.s || raw.start),
      end: cleanSetupText(raw.e || raw.end),
      challenge: cleanSetupText(raw.c || raw.challenge),
      challenges: cleanSetupText(raw.cs || raw.challenges),
    };
  } catch (error) {
    return {};
  }
}

function speedBoardToken(accountKey, tokenVersion = "1") {
  const secret = cleanSetupText(process.env.SMARTCOACH_SPEED_BOARD_SECRET || process.env.SMARTCOACH_SESSION_SECRET || process.env.SMARTCOACH_AUTOMATION_SECRET || process.env.SMARTCOACH_ADMIN_SETUP_CODE || "smartcoach-speed-board");
  return crypto.createHmac("sha256", secret).update(`speed-board:${normalizeSetupAccountKey(accountKey) || "default"}:${cleanSetupText(tokenVersion) || "1"}`).digest("base64url");
}

function speedBoardTokenVersion() {
  return crypto.randomBytes(12).toString("base64url");
}

function speedBoardShareKey(input) {
  const source = input && typeof input === "object" ? input : {};
  const payload = {
    a: normalizeSetupAccountKey(source.account),
    t: cleanSetupText(source.token),
    m: cleanSetupText(source.metric),
    g: cleanSetupText(source.gender),
    y: cleanSetupText(source.year),
    c: cleanSetupText(source.challenge),
    cs: cleanSetupText(source.challenges),
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function speedBoardShareFromKey(value) {
  const key = cleanSetupText(value);
  if (!key) return {};
  try {
    const raw = JSON.parse(Buffer.from(key, "base64url").toString("utf8"));
    return {
      account: normalizeSetupAccountKey(raw.a || raw.account),
      token: cleanSetupText(raw.t || raw.token),
      metric: cleanSetupText(raw.m || raw.metric),
      gender: cleanSetupText(raw.g || raw.gender),
      year: cleanSetupText(raw.y || raw.year),
      challenge: cleanSetupText(raw.c || raw.challenge),
      challenges: cleanSetupText(raw.cs || raw.challenges),
    };
  } catch (error) {
    return {};
  }
}

function suggestedAccessCode(accountKey) {
  const seed = `${accountKey || "customer"}-${Date.now()}-${Math.random()}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `sc-${String(hash >>> 0).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function suggestedCoachAccessCodes(accountKey, coachSeats, productPlan) {
  normalizeSetupCoachSeats(coachSeats, productPlan);
  return [suggestedAccessCode(accountKey)];
}
