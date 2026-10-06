const WAITING = new Set(["waiting_for_provisioning", "waiting_for_snapshot", "waiting_for_mapping", "waiting_for_installation", "waiting_for_subscription", "waiting_for_subscription_identity"]);
const TERMINAL = new Set(["complete", "existing_access_preserved", "support_review_required", "checkout_review_required", "expired"]);
const MAX_ATTEMPTS = 6;
const TTL_MS = 24 * 60 * 60 * 1000;
const SNAPSHOT_WINDOW_MS = 30 * 60000;
const SNAPSHOT_BACKOFF_MS = [1, 2, 4, 8, 8].map(minutes => minutes * 60000);
const MAX_SNAPSHOT_MISSES = SNAPSHOT_BACKOFF_MS.length + 1;
const FAILURE_STAGES = new Set(["readiness_inspection", "buyer_mapping", "purchase_verification", "buyer_qualification",
  "connector_installation", "fulfillment_preview", "policy_readback", "fulfillment_execution", "completed_policy_readback",
  "purchase_grant", "purchase_subscription_read", "purchase_subscription_identity", "purchase_subscription_details",
  "purchase_catalog_read", "purchase_catalog_verification", "purchase_mapping_readback", "purchase_identity_wait_verification",
  "key_grant", "key_preflight", "key_mapping", "key_provider_write", "key_provider_readback", "key_mapping_readback",
  "setup_grant", "setup_snapshot", "setup_lock", "setup_evidence", "setup_name_permission",
  "school_validation", "school_history", "school_location_read", "school_intent_save", "school_intent_readback",
  "school_prewrite_read", "school_provider_write", "school_provider_readback", "school_identity_readback",
  "school_name_readback", "school_completion_save", "school_completion_readback",
  "setup_account_save", "setup_account_readback", "setup_account_notification"]);
const FAILURE_KINDS = new Set(["exception", "blocked", "interrupted"]);
const IDENTITY_FAILURE_REASONS = new Set(["missing_response", "malformed_response", "ambiguous_envelope", "missing_identity", "conflicting_identity"]);
const IDENTITY_CHECK_STATES = new Set(["matched", "missing", "mismatched"]);
const safeIdentityChecks = value => value && typeof value === "object" && !Array.isArray(value)
  && ["locationId", "companyId", "isSaaSV2"].every(field => IDENTITY_CHECK_STATES.has(value[field]))
  ? { locationId: value.locationId, companyId: value.companyId, isSaaSV2: value.isSaaSV2 } : null;
const safeFailure = value => value && FAILURE_STAGES.has(value.stage) && FAILURE_KINDS.has(value.kind)
  ? { stage: value.stage, kind: value.kind,
    ...(value.stage === "fulfillment_preview" && ["schema_mismatch", "availability_deadline"].includes(value.snapshotReason)
      ? { snapshotReason: value.snapshotReason } : {}),
    ...(value.stage === "purchase_subscription_identity" && IDENTITY_FAILURE_REASONS.has(value.identityReason)
      ? { identityReason: value.identityReason,
        ...(["missing_identity", "conflicting_identity"].includes(value.identityReason) && safeIdentityChecks(value.identityChecks)
          ? { identityChecks: safeIdentityChecks(value.identityChecks) } : {}) } : {}) } : null;

function createBuyerReadiness(deps) {
  const now = deps.now || Date.now;
  const summary = job => ({ status: job.status, attempts: job.attempts,
    nextAttemptAt: job.nextAttemptAt || null, expiresAt: job.expiresAt,
    automaticFulfillmentReady: false, emailAccepted: job.emailAccepted === true, deliveryVerified: false,
    outcomeRequiresReview: ["support_review_required", "checkout_review_required", "expired"].includes(job.status),
    failure: safeFailure(job.failure),
    ...(job.snapshotWaitStartedAt !== undefined ? { snapshotWaitStartedAt: job.snapshotWaitStartedAt,
      snapshotDeadlineAt: job.snapshotDeadlineAt, snapshotMissingCount: job.snapshotMissingCount } : {}) });
  const disabled = { status: "disabled", automaticFulfillmentReady: false, emailAccepted: false, deliveryVerified: false };
  const valid = (job, buyer) => job && job.buyerAccountKey === buyer.accountKey && job.locationId === buyer.locationId
    && job.signatureVerified === true && Number.isInteger(job.attempts) && job.attempts >= 0
    && job.attempts <= MAX_ATTEMPTS + MAX_SNAPSHOT_MISSES
    && (job.snapshotWaitStartedAt === undefined
      ? job.snapshotDeadlineAt === undefined && job.snapshotMissingCount === undefined
        && job.status !== "waiting_for_snapshot" && job.attempts <= MAX_ATTEMPTS
      : Number.isFinite(job.snapshotWaitStartedAt) && job.snapshotWaitStartedAt >= job.createdAt
        && job.snapshotDeadlineAt === job.snapshotWaitStartedAt + SNAPSHOT_WINDOW_MS
        && Number.isInteger(job.snapshotMissingCount) && job.snapshotMissingCount >= 1
        && job.snapshotMissingCount <= MAX_SNAPSHOT_MISSES && job.snapshotMissingCount <= job.attempts
        && job.attempts - job.snapshotMissingCount <= MAX_ATTEMPTS)
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
        if (options.deferFirstInspection === true) {
          job.status = "waiting_for_provisioning";
          job.nextAttemptAt = createdAt + 60000;
        }
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
      const snapshotDeadlineReached = () => job.snapshotDeadlineAt !== undefined && now() >= job.snapshotDeadlineAt;
      const stopAtSnapshotDeadline = async () => {
        job = { ...job, status: "support_review_required", nextAttemptAt: null,
          failure: { stage: "fulfillment_preview", kind: "blocked", snapshotReason: "availability_deadline" } };
        await persist(buyer, job);
        return summary(job);
      };
      if (snapshotDeadlineReached()) return stopAtSnapshotDeadline();
      // Keep total history, but do not spend the prerequisite budget on schema availability waits.
      const ordinaryAttempts = () => job.attempts - (job.snapshotMissingCount || 0);
      if (job.expiresAt <= now() || ordinaryAttempts() >= MAX_ATTEMPTS) {
        job = { ...job, status: "expired", nextAttemptAt: null };
        await persist(buyer, job);
        return summary(job);
      }
      // Duplicate events must not bypass the initial provider-settling window.
      if (job.status === "waiting_for_provisioning" && job.nextAttemptAt > now()) return summary(job);
      if (job.status === "waiting_for_snapshot" && (job.nextAttemptAt > now()
        || job.snapshotMissingCount >= MAX_SNAPSHOT_MISSES)) return summary(job);
      if (!options.event && job.nextAttemptAt > now()) return summary(job);
      // A fresh verified event may wake a waiting buyer, but cannot reset the budget or deadline.
      job = { ...job, event: options.event || job.event, status: "checking", attempts: job.attempts + 1, nextAttemptAt: null, failure: null };
      await persist(buyer, job);
      let readiness;
      let stage = "readiness_inspection";
      // Only fixed stage labels survive; provider messages, payloads and credentials never do.
      const reportStage = value => { if (FAILURE_STAGES.has(value)) stage = value; };
      if (snapshotDeadlineReached()) return stopAtSnapshotDeadline();
      try { readiness = await deps.inspect(buyer, job.event, reportStage, job.snapshotDeadlineAt); }
      catch (error) { readiness = error.readinessPending === "subscription" && stage === "purchase_subscription_details"
        ? { status: "waiting_for_subscription" }
        : error.readinessPending === "snapshot" && stage === "fulfillment_preview"
          ? { status: "waiting_for_snapshot" }
        : { status: "support_review_required", failure: safeFailure({ ...error.readinessFailure, stage, kind: "exception" }) }; }
      if (!deps.allowed(buyer)) return disabled;
      if (snapshotDeadlineReached()) return stopAtSnapshotDeadline();
      if (readiness.status === "waiting_for_snapshot") {
        const startedAt = job.snapshotWaitStartedAt ?? now();
        const missingCount = (job.snapshotMissingCount || 0) + 1;
        const deadlineAt = startedAt + SNAPSHOT_WINDOW_MS;
        // After the five retries, wait for the authoritative cutoff without another schema probe.
        job = { ...job, status: "waiting_for_snapshot", snapshotWaitStartedAt: startedAt,
          snapshotDeadlineAt: deadlineAt, snapshotMissingCount: missingCount,
          nextAttemptAt: Math.min(deadlineAt, now() + (SNAPSHOT_BACKOFF_MS[missingCount - 1] ?? SNAPSHOT_WINDOW_MS)) };
        await persist(buyer, job);
        return summary(job);
      }
      if (WAITING.has(readiness.status)) {
        job = { ...job, status: ordinaryAttempts() >= MAX_ATTEMPTS ? "expired" : readiness.status,
          nextAttemptAt: ordinaryAttempts() >= MAX_ATTEMPTS ? null
            : now() + Math.min(60000 * 2 ** (ordinaryAttempts() - 1), 30 * 60000) };
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
      if (snapshotDeadlineReached()) return stopAtSnapshotDeadline();
      let result;
      stage = "fulfillment_execution";
      try { result = await deps.execute(buyer, readiness, reportStage, job.snapshotDeadlineAt); }
      catch (error) { result = { status: "support_review_required",
        failure: safeFailure(error.readinessFailure) || { stage, kind: "exception" } }; }
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
