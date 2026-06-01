const { getGhlContext } = require("../../lib/ghl-account");
const { setSmartTrakSecurityHeaders } = require("../../lib/smart-trak-request");
const { saveAttendanceRecords, loadAttendanceRecords } = require("../../lib/account-registry");

module.exports = async function handler(req, res) {
  setSmartTrakSecurityHeaders(res);
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const { accountKey } = getGhlContext(req);

  try {
    if (req.method === "GET") {
      const attendance = await loadAttendanceRecords(accountKey, {
        start: firstQueryValue(req.query && req.query.start),
        end: firstQueryValue(req.query && req.query.end),
        group: firstQueryValue(req.query && req.query.group),
        groupId: firstQueryValue(req.query && req.query.groupId),
        athleteId: firstQueryValue(req.query && (req.query.athleteId || req.query.contactId)),
        athleteName: firstQueryValue(req.query && req.query.athleteName),
        status: firstQueryValue(req.query && req.query.status),
      });
      res.status(200).json({ success: true, attendance, count: attendance.length });
      return;
    }

    if (req.method === "POST" || req.method === "PATCH") {
      const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const records = recordsFromPayload(payload);
      if (!records.length) {
        res.status(400).json({ error: "No attendance records were provided." });
        return;
      }
      const saved = await saveAttendanceRecords(accountKey, records);
      res.status(200).json({ success: !!saved.saved, attendance: records, ...saved });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Attendance save failed." });
  }
};

function recordsFromPayload(payload) {
  if (Array.isArray(payload && payload.records)) return payload.records;
  const date = clean(payload && payload.date).slice(0, 10);
  const groupId = clean(payload && payload.groupId);
  const groupName = clean(payload && payload.groupName);
  const runners = Array.isArray(payload && payload.runners) ? payload.runners : [];
  const runnerByKey = {};
  runners.forEach((runner) => {
    const item = runner || {};
    [item.runnerId, item.id, item.contactId, item.smartcoachAthleteId, item.name].map(clean).filter(Boolean).forEach((key) => {
      runnerByKey[String(key)] = item;
    });
  });
  const out = [];
  (Array.isArray(payload && payload.checkpoints) ? payload.checkpoints : []).forEach((checkpoint, cpIndex) => {
    const cp = checkpoint || {};
    const checkpointId = clean(cp.id) || `checkpoint_${cpIndex + 1}`;
    const checkpointName = clean(cp.name) || (cpIndex ? `Checkpoint ${cpIndex + 1}` : "Practice Start");
    const records = cp.records && typeof cp.records === "object" ? cp.records : {};
    Object.keys(records).forEach((runnerKey) => {
      const row = records[runnerKey] || {};
      const runner = runnerByKey[runnerKey] || row || {};
      const status = clean(row.status).toLowerCase();
      if (!status) return;
      out.push({
        date,
        groupId,
        groupName,
        checkpointId,
        checkpointName,
        athleteId: clean(runner.contactId || runner.smartcoachAthleteId || runner.id || runner.runnerId || runnerKey),
        contactId: clean(runner.contactId),
        smartcoachAthleteId: clean(runner.smartcoachAthleteId),
        athleteName: clean(runner.name || row.athleteName),
        status,
        note: clean(row.note),
        source: clean(row.source) || "coach",
        updatedAt: clean(row.updatedAt) || new Date().toISOString(),
      });
    });
  });
  return out;
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-SMARTCoach-Account, X-SMARTCoach-Session, X-SMARTCoach-Access-Code, X-SMARTCoach-Device-Id, X-SMARTCoach-Device-Label");
}

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function clean(value) {
  return String(value || "").trim();
}
