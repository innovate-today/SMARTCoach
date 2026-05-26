const { getGhlContext, requireProPlan } = require("../../lib/ghl-account");
const { loadAccountRecord, loadTrainingMirror } = require("../../lib/account-registry");
const { attachRegistryAccount, setSmartTrakSecurityHeaders } = require("../../lib/smart-trak-request");

module.exports = async function handler(req, res) {
  setSmartTrakSecurityHeaders(res);
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  await attachRegistryAccount(req);

  if (!requireProPlan(req, res)) return;

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { accountKey, token, locationId, productPlan, coachSeats, subscription } = getGhlContext(req);
  const registry = await loadAccountRecord(accountKey);
  const trainingMirror = await loadTrainingMirror(accountKey);
  const lastTrainingMirrorSync = registry.record && registry.record.lastTrainingMirrorSync
    ? registry.record.lastTrainingMirrorSync
    : null;

  res.status(200).json({
    success: true,
    accountKey,
    productPlan,
    coachSeats,
    subscription,
    setupReady: !!(token && locationId),
    registryFound: !!registry.found,
    locationIdSaved: !!locationId,
    tokenSaved: !!token,
    trainingMirrorCount: trainingMirror.length,
    lastTrainingMirrorSync,
    latestTrainingMirror: trainingMirror.slice(-5).map((item) => {
      const props = item.properties || {};
      const coachNote = clean(props.coach_note);
      return {
        recordId: item.id,
        athlete: clean(props.athlete_name_snapshot || props.athlete_name),
        workout: clean(props.group_name || props.workout_type || props.workout_name),
        volume: noteValue(coachNote, "Completed volume") || clean(props.completed_volume),
        date: clean(props.session_date || props.workout_date),
        savedAt: clean(item.updatedAt || item.createdAt),
      };
    }),
  });
};

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-SMARTCoach-Account, X-SMARTCoach-Session, X-SMARTCoach-Access-Code");
}

function clean(value) {
  return String(value == null ? "" : value).trim();
}

function noteValue(note, label) {
  const prefix = `${label}:`;
  const line = clean(note).split(/\r?\n/).find((item) => item.trim().toLowerCase().startsWith(prefix.toLowerCase()));
  return line ? clean(line.slice(prefix.length)) : "";
}
