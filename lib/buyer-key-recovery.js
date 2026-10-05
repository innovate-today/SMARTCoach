const crypto = require("crypto");
const { validBuyerIdentity, isSupportedNewBuyerPlan } = require("./new-buyer-policy");
const reject = message => { throw Object.assign(new Error(message), { statusCode: 409 }); };
const digest = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const matches = (saved, expected) => saved && Object.keys(expected).filter(key => !["accountKey", "updatedAt"].includes(key))
  .every(key => JSON.stringify(saved[key]) === JSON.stringify(expected[key]));

function createBuyerKeyRecovery(deps) {
  const now = deps.now || Date.now;
  async function run(buyer, options = {}) {
    if (!deps.enabled() || !validBuyerIdentity(buyer)) reject("Reviewed buyer-key recovery is not enabled.");
    const release = await deps.lock(buyer);
    let approved = false;
    try {
      const evidence = await deps.load(buyer);
      const { readiness: job, recovery, policy, fulfillment } = evidence;
      const original = recovery?.originalJob;
      const owns = record => record?.buyerAccountKey === buyer.accountKey && record.locationId === buyer.locationId;
      if (!owns(job) || !owns(recovery) || !owns(original) || !owns(policy) || !owns(fulfillment)
        || recovery.status !== "approved" || !/^[a-f0-9]{64}$/.test(recovery.fingerprint)
        || !Number.isFinite(recovery.approvedAt) || original.status !== "support_review_required"
        || original.signatureVerified !== true || !deps.eventValid(original.event, buyer)
        || job.signatureVerified !== true || JSON.stringify(job.event) !== JSON.stringify(original.event)
        || job.status !== "support_review_required" || job.recovery?.fingerprint !== recovery.fingerprint
        || job.recovery?.approvedAt !== recovery.approvedAt || job.recovery?.originalAttempts !== original.attempts
        || job.recovery?.originalStatus !== original.status || job.createdAt !== original.createdAt
        || job.expiresAt !== original.expiresAt || !Number.isFinite(job.createdAt)
        || job.expiresAt !== job.createdAt + 86400000 || job.expiresAt <= now()
        || !Number.isInteger(original.attempts) || original.attempts < 1
        || !Number.isInteger(job.attempts) || job.attempts < original.attempts || job.attempts >= 6
        || policy.status !== "approved" || policy.snapshotVerified !== true
        || fulfillment.status !== "pending" || fulfillment.steps?.verify_buyer_setup?.status !== "confirmed"
        || fulfillment.steps?.ensure_buyer_account_key?.status !== "attempted"
        || Object.keys(fulfillment.steps).some(step => !["verify_buyer_setup", "ensure_buyer_account_key"].includes(step))
        || evidence.keyReview || job.keyReview || evidence.access || evidence.welcome || evidence.checkoutIdentity) {
        reject("Buyer-key recovery history is not eligible. No write or resumption performed.");
      }
      const inspection = await deps.inspect(buyer, policy);
      const qualification = inspection.qualification;
      const plan = qualification?.identity?.productPlan;
      if (inspection.verified !== true || qualification?.qualified !== true || qualification.previousPreserved !== true
        || qualification.fingerprint !== policy.fingerprint || inspection.snapshot?.verified !== true
        || inspection.existingAccessAbsent !== true || inspection.fulfillmentFingerprint !== fulfillment.fingerprint
        || !/^[a-f0-9]{64}$/.test(inspection.configurationFingerprint)
        || inspection.keyReadback?.readVerified !== true || inspection.keyReadback.exactMatch !== true
        || inspection.keyReadback.matchCount !== 1 || inspection.keyReadback.providerWritePerformed !== false
        || qualification.identity?.buyerAccountKey !== buyer.accountKey || qualification.identity?.locationId !== buyer.locationId
        || !isSupportedNewBuyerPlan(plan) || !deps.enabled(plan)) {
        reject("Exact buyer-key recovery prerequisites could not be verified. No write or resumption performed.");
      }
      const fingerprint = digest({ job, recovery, policy, fulfillment, qualification: qualification.fingerprint,
        snapshot: inspection.snapshot, configuration: inspection.configurationFingerprint, keyReadback: inspection.keyReadback });
      const preview = { keyRecoveryReady: true, fingerprint, buyer: qualification.identity,
        originalAttempts: original.attempts, currentAttempts: job.attempts, providerWritePerformed: false,
        accountUnchanged: true, emailSent: false, jobHistoryPreserved: true };
      if (options.dryRun !== false) return preview;
      if (options.confirmRecovery !== true || options.expectedFingerprint !== fingerprint || !deps.enabled(plan) || job.expiresAt <= now()) {
        reject("Explicit unchanged-evidence buyer-key recovery confirmation is required.");
      }
      // Audit the uncertain states before confirming a read-back outcome, never repeating the provider write.
      const audit = { buyerAccountKey: buyer.accountKey, locationId: buyer.locationId, fingerprint,
        status: "approved", approvedAt: now(), originalReadiness: job, originalFulfillment: fulfillment,
        providerKeyReadbackVerified: true, providerWritePerformed: false };
      await deps.saveReview(buyer, audit);
      if (!matches((await deps.load(buyer)).keyReview, audit)) reject("Key-review audit readback failed. Do not retry.");
      if (!deps.enabled(plan) || job.expiresAt <= now()) reject("Buyer-key recovery disabled or expired. Do not retry.");
      const reviewed = { ...fulfillment, steps: { ...fulfillment.steps,
        ensure_buyer_account_key: { ...fulfillment.steps.ensure_buyer_account_key, status: "confirmed",
          confirmedAt: audit.approvedAt, reviewedAt: audit.approvedAt, recovery: "exact_provider_readback" } } };
      await deps.saveFulfillment(buyer, reviewed);
      if (!matches((await deps.load(buyer)).fulfillment, reviewed)) reject("Verified key-step readback failed. Do not retry.");
      if (!deps.enabled(plan) || job.expiresAt <= now()) reject("Buyer-key recovery disabled or expired before resumption. Do not retry.");
      const pending = { ...job, status: "pending", nextAttemptAt: null,
        keyReview: { fingerprint, approvedAt: audit.approvedAt } };
      await deps.saveReadiness(buyer, pending);
      if (!matches((await deps.load(buyer)).readiness, pending)) reject("Reviewed readiness readback failed. Do not retry.");
      approved = true;
    } finally { await release(); }
    if (approved) return { ...await deps.resume(buyer), keyRecoveryApproved: true,
      providerWritePerformed: false, jobHistoryPreserved: true };
  }
  return { run };
}

module.exports = { createBuyerKeyRecovery };
