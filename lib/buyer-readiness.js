const WAITING = new Set(["waiting_for_mapping", "waiting_for_installation"]);
const TERMINAL = new Set(["complete", "existing_access_preserved", "support_review_required", "checkout_review_required", "expired"]);
const MAX_ATTEMPTS = 6;
const TTL_MS = 24 * 60 * 60 * 1000;
const FAILURE_STAGES = new Set(["readiness_inspection", "buyer_mapping", "purchase_verification", "buyer_qualification",
  "connector_installation", "fulfillment_preview", "policy_readback", "fulfillment_execution", "completed_policy_readback"]);
const FAILURE_KINDS = new Set(["exception", "blocked", "interrupted"]);
const safeFailure = value => value && FAILURE_STAGES.has(value.stage) && FAILURE_KINDS.has(value.kind)
  ? { stage: value.stage, kind: value.kind } : null;

function createBuyerReadiness(deps) {
  const now = deps.now || Date.now;
  const summary = job => ({ status: job.status, attempts: job.attempts,
    nextAttemptAt: job.nextAttemptAt || null, expiresAt: job.expiresAt,
    automaticFulfillmentReady: false, emailAccepted: job.emailAccepted === true, deliveryVerified: false,
    outcomeRequiresReview: ["support_review_required", "checkout_review_required", "expired"].includes(job.status),
    failure: safeFailure(job.failure) });
  const disabled = { status: "disabled", automaticFulfillmentReady: false, emailAccepted: false, deliveryVerified: false };
  const valid = (job, buyer) => job && job.buyerAccountKey === buyer.accountKey && job.locationId === buyer.locationId
    && job.signatureVerified === true && Number.isInteger(job.attempts) && job.attempts >= 0 && job.attempts <= MAX_ATTEMPTS
    && Number.isFinite(job.createdAt) && Number.isFinite(job.expiresAt) && job.expiresAt === job.createdAt + TTL_MS
    && (WAITING.has(job.status) || TERMINAL.has(job.status) || ["pending", "checking", "executing"].includes(job.status));

  async function persist(buyer, job) {
    await deps.save(buyer, job);
    const confirmed = await deps.load(buyer);
    // Scoped registry storage owns accountKey, so compare only the logical buyer fields.
    if (!valid(confirmed, buyer) || Object.keys(job).filter(key => !["accountKey", "updatedAt"].includes(key))
      .some(key => JSON.stringify(confirmed[key]) !== JSON.stringify(job[key]))) {
      throw new Error("Buyer readiness readback failed.");
    }
  }

  async function run(buyer, options = {}) {
    if (!deps.allowed(buyer)) return disabled;
    const release = await deps.lock(buyer);
    try {
      let job = await deps.load(buyer);
      if (!job && !options.event) return { ...disabled, status: "not_queued" };
      if (job && !valid(job, buyer)) throw new Error("Buyer readiness identity or history is invalid.");
      if (!job) {
        const createdAt = now();
        job = { buyerAccountKey: buyer.accountKey, locationId: buyer.locationId, signatureVerified: true,
          event: options.event, createdAt, expiresAt: createdAt + TTL_MS, attempts: 0, status: "pending", nextAttemptAt: null };
        await persist(buyer, job);
      }
      if (options.inspectOnly === true) return summary(job);
      if (job.status === "executing") {
        // An execution interrupted after persisted intent must never be automatically replayed.
        job = { ...job, status: "support_review_required", nextAttemptAt: null,
          failure: { stage: "fulfillment_execution", kind: "interrupted" } };
        await persist(buyer, job);
      }
      if (TERMINAL.has(job.status)) return summary({ ...job,
        status: job.status === "complete" ? "existing_access_preserved" : job.status, emailAccepted: false });
      if (job.expiresAt <= now() || job.attempts >= MAX_ATTEMPTS) {
        job = { ...job, status: "expired", nextAttemptAt: null };
        await persist(buyer, job);
        return summary(job);
      }
      if (!options.event && job.nextAttemptAt > now()) return summary(job);
      // A fresh verified event may wake a waiting buyer, but cannot reset the budget or deadline.
      job = { ...job, event: options.event || job.event, status: "checking", attempts: job.attempts + 1, nextAttemptAt: null, failure: null };
      await persist(buyer, job);
      let readiness;
      let stage = "readiness_inspection";
      // Only fixed stage labels survive; provider messages, payloads and credentials never do.
      const reportStage = value => { if (FAILURE_STAGES.has(value)) stage = value; };
      try { readiness = await deps.inspect(buyer, job.event, reportStage); }
      catch (_) { readiness = { status: "support_review_required", failure: { stage, kind: "exception" } }; }
      if (!deps.allowed(buyer)) return disabled;
      if (WAITING.has(readiness.status)) {
        job = { ...job, status: job.attempts >= MAX_ATTEMPTS ? "expired" : readiness.status,
          nextAttemptAt: job.attempts >= MAX_ATTEMPTS ? null : now() + Math.min(60000 * 2 ** (job.attempts - 1), 30 * 60000) };
        await persist(buyer, job);
        return summary(job);
      }
      if (readiness.status !== "ready") {
        job = { ...job, status: TERMINAL.has(readiness.status) ? readiness.status : "support_review_required",
          failure: safeFailure(readiness.failure) || { stage, kind: "blocked" } };
        await persist(buyer, job);
        return summary(job);
      }
      job = { ...job, status: "executing" };
      await persist(buyer, job);
      if (!deps.allowed(buyer)) return disabled;
      let result;
      stage = "fulfillment_execution";
      try { result = await deps.execute(buyer, readiness, reportStage); }
      catch (_) { result = { status: "support_review_required", failure: { stage, kind: "exception" } }; }
      job = { ...job, status: result.status === "complete" ? "complete" : "support_review_required",
        failure: result.status === "complete" ? null : safeFailure(result.failure) || { stage, kind: "blocked" },
        emailAccepted: result.status === "complete" && result.emailAccepted === true };
      await persist(buyer, job);
      return summary(job);
    } finally { await release(); }
  }
  return { run };
}

module.exports = { createBuyerReadiness };
