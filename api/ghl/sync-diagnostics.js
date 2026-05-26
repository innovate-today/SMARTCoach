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
      return {
        recordId: item.id,
        athlete: clean(props.athlete_name),
        workout: clean(props.workout_name),
        volume: clean(props.completed_volume),
        date: clean(props.workout_date),
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
