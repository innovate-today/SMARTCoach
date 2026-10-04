const crypto = require("node:crypto");

function reject(message, statusCode = 409) {
  throw Object.assign(new Error(message), { statusCode, code: "PARTNER_RESULT_REVIEW" });
}

function text(value) { return String(value || "").trim(); }
function eventKey(value) { return text(value).toLowerCase().replace(/\s+/g, ""); }
function partnerResultId(sessionId, finishId) {
  return "pt_v1_" + crypto.createHash("sha256").update(JSON.stringify([sessionId, finishId])).digest("hex");
}

function verifyPartnerFinish(session, result) {
  if (!session || session.id !== result.partnerTimingSessionId) reject("Shared Partner Timing race was not found. Load Partner Taps before saving.");
  if (result.resultType !== "individual") reject("Partner Timing finishes require individual results.");
  const finish = (session.records || []).find(item => item.id === result.partnerFinishRecordId);
  if (!finish || (finish.kind || finish.stationId) !== "finish") reject("Shared finish tap was not found. Load Partner Taps before saving.");
  if (!finish.raceEvent || !finish.raceStartAt || !finish.raceMeetDate || !finish.raceMeetName) reject("This finish predates shared race validation. Review its race distance before saving.");
  if (eventKey(finish.raceEvent) !== eventKey(result.event)) {
    reject(`Shared race event is ${text(finish.raceEvent)}. Use that race distance before saving.`, 422);
  }
  if (finish.raceMeetName !== result.meetName || finish.raceMeetDate !== result.meetDate.toISOString().slice(0, 10)) {
    reject("Meet name or date does not match the shared Partner Timing race.", 422);
  }
  const sameAthlete = finish.contactId ? finish.contactId === result.contactId
    : finish.smartcoachAthleteId ? finish.smartcoachAthleteId === result.smartcoachAthleteId
      : text(finish.athleteName).toLowerCase() === text(result.athleteName).toLowerCase();
  if (!sameAthlete) reject("Athlete does not match the shared finish tap.", 422);
  const elapsed = Date.parse(finish.tapAt) - Date.parse(finish.raceStartAt);
  if (!Number.isFinite(elapsed) || elapsed <= 0 || elapsed !== result.resultMs) reject("Time does not match the shared finish tap. Load Partner Taps before saving.", 422);
  return finish;
}

async function savePartnerMeetResult(deps, result, saveResult) {
  if (!result.partnerTimingSessionId || !result.partnerFinishRecordId) reject("Shared race and finish identifiers are both required.", 400);
  const sourceRecordId = partnerResultId(result.partnerTimingSessionId, result.partnerFinishRecordId);
  const namespace = "partnerresult-" + sourceRecordId;
  const release = await deps.lock(namespace);
  try {
    const session = await deps.loadSession(result.partnerTimingSessionId);
    const finish = verifyPartnerFinish(session, result);
    const evidence = JSON.stringify([session.id, finish.id, finish.contactId || finish.smartcoachAthleteId || text(finish.athleteName).toLowerCase(), finish.raceStartAt, finish.tapAt, finish.raceMeetName, finish.raceMeetDate, eventKey(finish.raceEvent)]);
    const fingerprint = crypto.createHash("sha256").update(evidence).digest("hex");
    const prior = await deps.load(namespace);
    if (prior) {
      if (prior.fingerprint !== fingerprint) reject("Shared finish changed after its result save. Review the existing result before correcting it.");
      if (prior.status === "confirmed" && prior.response && prior.response.success) return { ...prior.response, alreadySaved: true };
      reject("This shared finish has an interrupted save. Review the existing result; do not save another copy.");
    }
    const intent = { status: "attempted", fingerprint, sourceRecordId, attemptedAt: new Date().toISOString() };
    await deps.save(namespace, intent);
    const savedIntent = await deps.load(namespace);
    if (!savedIntent || savedIntent.status !== "attempted" || savedIntent.fingerprint !== fingerprint) reject("Shared finish save history could not be confirmed.", 503);
    result.sourceRecordId = sourceRecordId;
    result.forceDuplicateSync = false;
    const response = await saveResult();
    if (!response || !response.success || !response.recordId) reject("Shared finish result could not be confirmed. Review required.", 503);
    await deps.save(namespace, { ...intent, status: "confirmed", response, confirmedAt: new Date().toISOString() });
    const confirmed = await deps.load(namespace);
    if (!confirmed || confirmed.status !== "confirmed" || confirmed.fingerprint !== fingerprint || confirmed.response?.recordId !== response.recordId) reject("Shared finish completion could not be confirmed. Review required.", 503);
    return response;
  } finally {
    await release();
  }
}

module.exports = { savePartnerMeetResult, partnerResultId, verifyPartnerFinish };
