const crypto = require("crypto");
const { validBuyerIdentity } = require("./new-buyer-policy");

const reject = message => { throw Object.assign(new Error(message), { statusCode: 409 }); };
const digest = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

function createBuyerReadinessRecovery(deps) {
  const now = deps.now || Date.now;
  async function run(buyer, options = {}) {
    if (!deps.enabled() || !validBuyerIdentity(buyer)) reject("Reviewed new-buyer recovery is not enabled for this buyer.");
    const release = await deps.lock(buyer);
    let approved = false;
    try {
      const evidence = await deps.load(buyer);
      const job = evidence.readiness;
      if (!job || job.buyerAccountKey !== buyer.accountKey || job.locationId !== buyer.locationId
        || job.signatureVerified !== true || !deps.eventValid(job.event, buyer)
        || job.status !== "support_review_required" || job.recovery
        || !Number.isInteger(job.attempts) || job.attempts < 1 || job.attempts >= 6
        || !Number.isFinite(job.createdAt) || job.expiresAt !== job.createdAt + 86400000 || job.expiresAt <= now()
        || evidence.recovery || evidence.policy || evidence.fulfillment || evidence.access
        || evidence.welcome || evidence.checkoutIdentity) {
        reject("Recovery requires an unexpired stopped preflight job with no approval, setup, access or email history. No retry performed.");
      }
      const prerequisite = await deps.inspect(buyer);
      if (prerequisite.verified !== true || prerequisite.qualification?.qualified !== true
        || prerequisite.qualification.previousPreserved || prerequisite.snapshot?.verified !== true) {
        reject("Recovery prerequisites could not be verified. No retry performed.");
      }
      const identity = prerequisite.qualification.identity;
      if (identity.buyerAccountKey !== buyer.accountKey || identity.locationId !== buyer.locationId || identity.productPlan !== "pro25") {
        reject("Recovery buyer identity does not match.");
      }
      const fingerprint = digest({ job, qualification: prerequisite.qualification.fingerprint, snapshot: prerequisite.snapshot });
      const preview = { recoveryReady: true, fingerprint, buyer: identity, originalStatus: job.status,
        originalAttempts: job.attempts, jobHistoryPreserved: true, accountUnchanged: true, emailSent: false };
      if (options.dryRun !== false) return preview;
      if (options.confirmRecovery !== true || options.expectedFingerprint !== fingerprint || !deps.enabled()) {
        reject("Explicit unchanged-evidence recovery approval is required. No retry performed.");
      }
      // Persist one-use approval and the original job before making it eligible for processing.
      const audit = { buyerAccountKey: buyer.accountKey, locationId: buyer.locationId, fingerprint,
        status: "approved", approvedAt: now(), originalJob: job };
      await deps.saveRecovery(buyer, audit);
      const approval = (await deps.load(buyer)).recovery;
      if (!approval || Object.keys(audit).some(key => JSON.stringify(approval[key]) !== JSON.stringify(audit[key]))) {
        reject("Recovery approval readback failed. Support review required; do not retry.");
      }
      if (!deps.enabled()) reject("Recovery was disabled before resumption. Support review required.");
      const pending = { ...job, status: "pending", nextAttemptAt: null,
        recovery: { fingerprint, approvedAt: audit.approvedAt, originalStatus: job.status, originalAttempts: job.attempts } };
      await deps.saveReadiness(buyer, pending);
      const saved = (await deps.load(buyer)).readiness;
      if (!saved || Object.keys(pending).some(key => JSON.stringify(saved[key]) !== JSON.stringify(pending[key]))) {
        reject("Recovery job readback failed. Support review required; do not retry.");
      }
      approved = true;
    } finally { await release(); }
    if (approved) return { ...await deps.resume(buyer), recoveryApproved: true, jobHistoryPreserved: true };
  }
  return { run };
}

module.exports = { createBuyerReadinessRecovery };
