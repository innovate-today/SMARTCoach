const assert = require("assert/strict");
const { createBuyerReadiness } = require("../lib/buyer-readiness");

const buyer = { accountKey: "sc-abcdefghijklmnopqrst", locationId: "AbCdEfGhIjKlMnOpQrSt" };
const event = { type: "INSTALL", appId: "connector", locationId: buyer.locationId, companyId: "agency" };

function fixture() {
  let time = 1000, job, enabled = true, locked = false, readiness = { status: "waiting_for_mapping" };
  let executions = 0, inspections = 0, reads = 0, writes = 0, failExecution = false, corruptReadback = false, revokeOnInspect = false;
  const deps = { now: () => time, allowed: () => enabled,
    load: async () => { reads++; return structuredClone(corruptReadback && job ? { ...job, attempts: 99 } : job); },
    save: async (_, record) => { writes++; job = { ...structuredClone(record), accountKey: "ghlconnector", updatedAt: `storage-${writes}` }; },
    lock: async () => { assert(!locked); locked = true; return async () => { locked = false; }; },
    inspect: async () => { inspections++; if (revokeOnInspect) enabled = false; return readiness; },
    execute: async () => { executions++; if (failExecution) throw new Error("private provider error"); return { status: "complete", emailAccepted: true }; },
  };
  return { deps, run: (options) => createBuyerReadiness(deps).run(buyer, options),
    advance: ms => { time += ms; }, enabled: value => { enabled = value; }, ready: value => { readiness = value; },
    job: () => job, setJob: value => { job = value; }, counts: () => ({ executions, inspections, reads, writes }),
    fail: () => { failExecution = true; }, corrupt: () => { corruptReadback = true; }, revoke: () => { revokeOnInspect = true; },
    locked: () => locked };
}

(async () => {
  const disabled = fixture(); disabled.enabled(false);
  assert.equal((await disabled.run({ event })).status, "disabled");
  assert.deepEqual(disabled.counts(), { executions: 0, inspections: 0, reads: 0, writes: 0 });
  assert.equal(disabled.locked(), false);

  const deferred = fixture(); deferred.ready({ status: "ready" });
  const queued = await deferred.run({ event, deferFirstInspection: true });
  assert.equal(queued.status, "waiting_for_provisioning");
  assert.equal(queued.attempts, 0); assert.equal(queued.nextAttemptAt, 61000);
  const queuedJob = structuredClone(deferred.job());
  for (const options of [{ event }, {}, { inspectOnly: true }]) {
    assert.equal((await deferred.run(options)).status, "waiting_for_provisioning");
    assert.deepEqual(deferred.job(), queuedJob);
  }
  assert.equal(deferred.counts().inspections, 0); assert.equal(deferred.counts().executions, 0);
  deferred.advance(59999);
  assert.equal((await deferred.run({ event })).status, "waiting_for_provisioning");
  deferred.advance(1);
  assert.equal((await deferred.run()).status, "complete");
  assert.equal(deferred.job().attempts, 1); assert.equal(deferred.job().expiresAt, queuedJob.expiresAt);
  assert.equal((await deferred.run({ event, deferFirstInspection: true })).status, "existing_access_preserved");
  assert.equal(deferred.counts().executions, 1);
  const deferredConflict = fixture();
  deferredConflict.ready({ status: "support_review_required", failure: {
    stage: "purchase_subscription_identity", kind: "exception", identityReason: "conflicting_identity"
  } });
  await deferredConflict.run({ event, deferFirstInspection: true }); deferredConflict.advance(60000);
  assert.equal((await deferredConflict.run()).status, "support_review_required");
  const stoppedDeferred = structuredClone(deferredConflict.job());
  deferredConflict.ready({ status: "ready" });
  await deferredConflict.run({ event, deferFirstInspection: true });
  assert.deepEqual(deferredConflict.job(), stoppedDeferred);
  assert.equal(deferredConflict.counts().executions, 0);

  const f = fixture();
  assert.equal((await f.run({ inspectOnly: true })).status, "not_queued");
  assert.equal(f.counts().writes, 0);
  const waiting = await f.run({ event });
  assert.equal(waiting.status, "waiting_for_mapping");
  assert.equal(waiting.attempts, 1); assert.equal(waiting.nextAttemptAt, 61000);
  const counts = f.counts();
  assert.equal((await f.run()).status, "waiting_for_mapping");
  assert.equal(f.counts().inspections, counts.inspections);
  f.advance(60000); f.ready({ status: "waiting_for_installation" });
  const installedWait = await f.run();
  assert.equal(installedWait.status, "waiting_for_installation"); assert.equal(installedWait.attempts, 2);
  assert.equal(installedWait.nextAttemptAt, 181000);
  const expiry = f.job().expiresAt;
  f.ready({ status: "ready", fingerprint: "exact-purchase" });
  const complete = await f.run({ event });
  assert.equal(complete.status, "complete"); assert.equal(complete.emailAccepted, true);
  assert.equal(f.job().expiresAt, expiry);
  assert.equal((await f.run({ event })).status, "existing_access_preserved");
  assert.equal(f.counts().executions, 1);

  const failed = fixture(); failed.ready({ status: "ready" }); failed.fail();
  const uncertain = await failed.run({ event });
  assert.equal(uncertain.status, "support_review_required");
  assert(!JSON.stringify(uncertain).includes("private"));
  failed.advance(60000);
  assert.equal((await failed.run({ event })).status, "support_review_required");
  assert.equal(failed.counts().executions, 1);
  assert.deepEqual(uncertain.failure, { stage: "fulfillment_execution", kind: "exception" });
  const keyFailure = fixture(); keyFailure.ready({ status: "ready" });
  keyFailure.deps.execute = async () => {
    throw Object.assign(new Error("private provider response"), { readinessFailure: {
      stage: "key_provider_write", kind: "exception", token: "private-secret", message: "private response"
    } });
  };
  assert.deepEqual((await keyFailure.run({ event })).failure, { stage: "key_provider_write", kind: "exception" });
  assert(!JSON.stringify(keyFailure.job()).includes("private"));

  for (const stage of ["setup_grant", "setup_snapshot", "setup_lock", "setup_evidence", "setup_name_permission",
    "school_validation", "school_history", "school_location_read", "school_intent_save", "school_intent_readback",
    "school_prewrite_read", "school_provider_write", "school_provider_readback", "school_identity_readback",
    "school_name_readback", "school_completion_save", "school_completion_readback",
    "setup_account_save", "setup_account_readback", "setup_account_notification"]) {
    const setupFailure = fixture(); setupFailure.ready({ status: "ready" });
    setupFailure.deps.execute = async () => {
      throw Object.assign(new Error("private provider response"), { readinessFailure: {
        stage, kind: "exception", token: "private-secret", message: "private response",
        identityReason: "conflicting_identity", identityChecks: { locationId: "mismatched" }
      } });
    };
    assert.deepEqual((await setupFailure.run({ event })).failure, { stage, kind: "exception" });
    assert(!JSON.stringify(setupFailure.job()).includes("private"));
    const history = structuredClone(setupFailure.job());
    await setupFailure.run({ event });
    assert.deepEqual(setupFailure.job(), history);
    assert.deepEqual((await setupFailure.run({ inspectOnly: true })).failure, { stage, kind: "exception" });
  }

  const diagnostic = fixture();
  diagnostic.deps.inspect = async (_, __, reportStage) => {
    reportStage("fulfillment_preview");
    reportStage("secret-token-should-not-be-stored");
    throw new Error("private provider credentials and payload");
  };
  const stopped = await diagnostic.run({ event });
  assert.deepEqual(stopped.failure, { stage: "fulfillment_preview", kind: "exception" });
  assert(!JSON.stringify(diagnostic.job()).includes("private"));
  assert(!JSON.stringify(diagnostic.job()).includes("secret-token"));
  const stoppedHistory = structuredClone(diagnostic.job());
  await diagnostic.run({ event });
  assert.deepEqual(diagnostic.job(), stoppedHistory);
  assert.equal(diagnostic.counts().executions, 0);
  diagnostic.setJob({ ...stoppedHistory, failure: { stage: "private-token", kind: "exception", message: "secret" } });
  assert.equal((await diagnostic.run({ inspectOnly: true })).failure, null);
  diagnostic.setJob({ ...stoppedHistory, failure: undefined });
  assert.equal((await diagnostic.run({ inspectOnly: true })).failure, null);

  const interrupted = fixture(); await interrupted.run({ event });
  interrupted.setJob({ ...interrupted.job(), status: "executing" });
  assert.equal((await interrupted.run()).status, "support_review_required");
  assert.equal(interrupted.counts().executions, 0);

  const exhausted = fixture();
  for (let i = 1; i <= 6; i++) {
    const result = await exhausted.run({ event });
    assert.equal(result.attempts, i);
    assert.equal(result.status, i === 6 ? "expired" : "waiting_for_mapping");
  }
  assert.equal((await exhausted.run({ event })).status, "expired");
  assert.equal(exhausted.counts().inspections, 6);

  const expired = fixture(); await expired.run({ event }); expired.advance(24 * 60 * 60 * 1000);
  assert.equal((await expired.run()).status, "expired"); assert.equal(expired.counts().inspections, 1);

  const rejected = fixture(); rejected.ready({ status: "checkout_review_required" });
  assert.equal((await rejected.run({ event })).status, "checkout_review_required");
  rejected.ready({ status: "ready" });
  assert.equal((await rejected.run({ event })).status, "checkout_review_required");
  assert.equal(rejected.counts().executions, 0);

  const corrupt = fixture(); corrupt.corrupt();
  await assert.rejects(corrupt.run({ event }), /readback/);
  assert.equal(corrupt.counts().executions, 0); assert.equal(corrupt.locked(), false);

  const wrongBuyer = fixture(); await wrongBuyer.run({ event });
  wrongBuyer.setJob({ ...wrongBuyer.job(), buyerAccountKey: "sc-other" });
  await assert.rejects(wrongBuyer.run(), /identity or history/);
  assert.equal(wrongBuyer.counts().executions, 0);

  const revoked = fixture(); revoked.ready({ status: "ready" }); revoked.revoke();
  assert.equal((await revoked.run({ event })).status, "disabled");
  assert.equal(revoked.counts().executions, 0);
  const subscription = fixture();
  let subscriptionReady = false;
  subscription.deps.inspect = async (_, __, reportStage) => {
    reportStage("purchase_subscription_details");
    if (!subscriptionReady) throw Object.assign(new Error("private details"), { readinessPending: "subscription" });
    return { status: "ready", fingerprint: "verified" };
  };
  assert.equal((await subscription.run({ event })).status, "waiting_for_subscription");
  const subscriptionExpiry = subscription.job().expiresAt;
  assert.equal(subscription.counts().executions, 0);
  subscriptionReady = true;
  assert.equal((await subscription.run()).status, "waiting_for_subscription");
  subscription.advance(60000);
  assert.equal((await subscription.run()).status, "complete");
  assert.equal(subscription.job().attempts, 2);
  assert.equal(subscription.job().expiresAt, subscriptionExpiry);
  const unavailable = fixture(); unavailable.ready({ status: "waiting_for_subscription" });
  for (let i = 1; i <= 6; i++) assert.equal((await unavailable.run({ event })).status,
    i === 6 ? "expired" : "waiting_for_subscription");
  assert.equal(unavailable.counts().executions, 0);
  const identityUnavailable = fixture(); identityUnavailable.ready({ status: "waiting_for_subscription_identity" });
  for (let i = 1; i <= 6; i++) assert.equal((await identityUnavailable.run({ event })).status,
    i === 6 ? "expired" : "waiting_for_subscription_identity");
  assert.equal(identityUnavailable.counts().executions, 0);
  const wrongStage = fixture();
  wrongStage.deps.inspect = async () => { throw Object.assign(new Error("not a verified purchase"), { readinessPending: "subscription" }); };
  assert.equal((await wrongStage.run({ event })).status, "support_review_required");
  const snapshotFixture = () => {
    const test = fixture();
    let schemaCalls = 0;
    test.schemaCalls = () => schemaCalls;
    test.deps.inspect = async (_, __, reportStage) => {
      schemaCalls++;
      reportStage("fulfillment_preview");
      throw Object.assign(new Error("private provider payload"), { readinessPending: "snapshot" });
    };
    return test;
  };
  const snapshot = snapshotFixture();
  assert.equal((await snapshot.run({ event })).status, "waiting_for_snapshot");
  const firstSnapshot = structuredClone(snapshot.job());
  assert.equal(firstSnapshot.snapshotWaitStartedAt, 1000);
  assert.equal(firstSnapshot.snapshotDeadlineAt, 1801000);
  assert.equal(firstSnapshot.snapshotMissingCount, 1);
  assert.equal(firstSnapshot.nextAttemptAt, 61000);
  for (const options of [{ event }, {}, { inspectOnly: true }]) {
    assert.equal((await snapshot.run(options)).status, "waiting_for_snapshot");
    assert.deepEqual(snapshot.job(), firstSnapshot);
  }
  snapshot.advance(59999); await snapshot.run({ event });
  assert.equal(snapshot.job().attempts, 1);
  snapshot.advance(1); snapshot.deps.inspect = async () => ({ status: "ready" });
  assert.equal((await snapshot.run()).status, "complete");
  assert.equal(snapshot.job().attempts, 2);
  assert.equal(snapshot.job().snapshotDeadlineAt, firstSnapshot.snapshotDeadlineAt);
  assert.equal((await snapshot.run({ event })).status, "existing_access_preserved");
  assert.equal(snapshot.counts().executions, 1);

  const missingSnapshot = snapshotFixture();
  await missingSnapshot.run({ event });
  for (const [index, minutes] of [1, 2, 4, 8, 8].entries()) {
    missingSnapshot.advance(minutes * 60000);
    const result = await missingSnapshot.run({ event });
    assert.equal(result.status, "waiting_for_snapshot");
    assert.equal(result.snapshotMissingCount, index + 2);
    assert.equal(result.snapshotDeadlineAt, 1801000);
  }
  assert.equal(missingSnapshot.job().attempts, 6);
  assert.equal(missingSnapshot.job().nextAttemptAt, 1801000);
  assert.equal(missingSnapshot.counts().executions, 0);
  const beforeDeadline = structuredClone(missingSnapshot.job());
  await missingSnapshot.run({ event });
  assert.deepEqual(missingSnapshot.job(), beforeDeadline);
  missingSnapshot.advance(7 * 60000 - 1); await missingSnapshot.run({ event });
  assert.equal(missingSnapshot.schemaCalls(), 6);
  const callsBeforeDeadline = missingSnapshot.job().attempts;
  missingSnapshot.advance(1);
  missingSnapshot.deps.inspect = async () => { throw new Error("must not call provider after deadline"); };
  const deadline = await missingSnapshot.run();
  assert.equal(deadline.status, "support_review_required");
  assert.equal(deadline.attempts, callsBeforeDeadline);
  assert.deepEqual(deadline.failure, { stage: "fulfillment_preview", kind: "blocked", snapshotReason: "availability_deadline" });
  const terminal = structuredClone(missingSnapshot.job());
  await missingSnapshot.run({ event }); assert.deepEqual(missingSnapshot.job(), terminal);
  assert(!JSON.stringify(terminal).includes("private"));

  const delayedWorker = snapshotFixture(); await delayedWorker.run({ event });
  delayedWorker.advance(31 * 60000);
  delayedWorker.deps.inspect = async () => { throw new Error("deadline must be checked locally"); };
  assert.equal((await delayedWorker.run()).status, "support_review_required");
  assert.equal(delayedWorker.job().attempts, 1);
  for (const outcome of ["ready", "snapshot-missing"]) {
    const crossing = snapshotFixture(); await crossing.run({ event });
    crossing.advance(30 * 60000 - 1);
    crossing.deps.inspect = async (_, __, reportStage, deadlineAt) => {
      assert.equal(deadlineAt, crossing.job().snapshotDeadlineAt);
      reportStage("fulfillment_preview"); crossing.advance(1);
      if (outcome === "snapshot-missing") throw Object.assign(new Error("private"), { readinessPending: "snapshot" });
      return { status: "ready" };
    };
    const result = await crossing.run();
    assert.equal(result.status, "support_review_required");
    assert.equal(result.failure.snapshotReason, "availability_deadline");
    assert.equal(result.snapshotMissingCount, 1);
    assert.equal(crossing.counts().executions, 0);
  }
  const crossingSave = snapshotFixture(); await crossingSave.run({ event });
  crossingSave.advance(30 * 60000 - 1);
  crossingSave.deps.inspect = async () => ({ status: "ready" });
  const realCrossingSave = crossingSave.deps.save;
  crossingSave.deps.save = async (buyer, record) => {
    await realCrossingSave(buyer, record);
    if (record.status === "executing") crossingSave.advance(1);
  };
  assert.equal((await crossingSave.run()).failure.snapshotReason, "availability_deadline");
  assert.equal(crossingSave.counts().executions, 0);
  const priorWaits = fixture();
  for (let i = 0; i < 5; i++) await priorWaits.run({ event });
  priorWaits.deps.inspect = snapshotFixture().deps.inspect;
  assert.equal((await priorWaits.run({ event })).status, "waiting_for_snapshot");
  assert.equal(priorWaits.job().attempts, 6);
  priorWaits.advance(60000); priorWaits.deps.inspect = async () => ({ status: "ready" });
  assert.equal((await priorWaits.run()).status, "complete");
  assert.equal(priorWaits.job().attempts, 7);
  const concurrent = snapshotFixture();
  let releasePrevious = Promise.resolve();
  concurrent.deps.lock = async () => {
    const previous = releasePrevious;
    let release;
    releasePrevious = new Promise(resolve => { release = resolve; });
    await previous;
    return release;
  };
  const overlapping = await Promise.all([concurrent.run({ event }), concurrent.run({ event })]);
  assert(overlapping.every(result => result.status === "waiting_for_snapshot"));
  assert.equal(concurrent.schemaCalls(), 1);
  assert.equal(concurrent.job().snapshotMissingCount, 1);
  assert.equal(concurrent.counts().executions, 0);
  for (const stage of ["connector_installation", "setup_snapshot", "purchase_catalog_read"]) {
    const otherStage = fixture();
    otherStage.deps.inspect = async (_, __, reportStage) => {
      reportStage(stage); throw Object.assign(new Error("private"), { readinessPending: "snapshot" });
    };
    assert.equal((await otherStage.run({ event })).status, "support_review_required");
  }
  const executionSnapshot = fixture(); executionSnapshot.ready({ status: "ready" });
  executionSnapshot.deps.execute = async () => { throw Object.assign(new Error("private"), { readinessPending: "snapshot" }); };
  assert.equal((await executionSnapshot.run({ event })).status, "support_review_required");
  assert.equal(executionSnapshot.job().snapshotDeadlineAt, undefined);
  for (const mutation of [{ snapshotDeadlineAt: 2 }, { snapshotMissingCount: 0 },
    { snapshotWaitStartedAt: undefined }, { snapshotMissingCount: 7 }]) {
    const corruptSnapshot = snapshotFixture(); await corruptSnapshot.run({ event });
    corruptSnapshot.setJob({ ...corruptSnapshot.job(), ...mutation });
    await assert.rejects(corruptSnapshot.run(), /identity or history/);
  }
  for (const identityReason of ["missing_response", "malformed_response", "ambiguous_envelope", "missing_identity", "conflicting_identity", "private-provider-secret"]) {
    const identity = fixture();
    identity.deps.inspect = async (_, __, reportStage) => {
      reportStage("purchase_subscription_identity");
      throw Object.assign(new Error("private payload"), { readinessFailure: {
        stage: "purchase_subscription_identity", kind: "exception", identityReason, token: "private-token"
      } });
    };
    const result = await identity.run({ event });
    assert.equal(result.status, "support_review_required");
    assert.deepEqual(result.failure, { stage: "purchase_subscription_identity", kind: "exception",
      ...(identityReason === "private-provider-secret" ? {} : { identityReason }) });
    assert(!JSON.stringify(identity.job()).includes("private"));
    const saved = structuredClone(identity.job());
    await identity.run({ event });
    assert.deepEqual(identity.job(), saved);
    assert.equal(identity.counts().executions, 0);
  }
  const unrelatedIdentity = fixture();
  for (const field of ["locationId", "companyId", "isSaaSV2"]) {
    const identity = fixture();
    const identityChecks = { locationId: "matched", companyId: "matched", isSaaSV2: "matched", token: "private-token" };
    identityChecks[field] = "mismatched";
    identity.deps.inspect = async (_, __, reportStage) => {
      reportStage("purchase_subscription_identity");
      throw Object.assign(new Error("private response"), { readinessFailure: {
        stage: "purchase_subscription_identity", kind: "exception", identityReason: "conflicting_identity", identityChecks
      } });
    };
    const expected = { locationId: identityChecks.locationId, companyId: identityChecks.companyId, isSaaSV2: identityChecks.isSaaSV2 };
    assert.deepEqual((await identity.run({ event })).failure.identityChecks, expected);
    assert.deepEqual((await identity.run({ inspectOnly: true })).failure.identityChecks, expected);
    assert(!JSON.stringify(identity.job()).includes("private"));
    const saved = structuredClone(identity.job());
    await identity.run({ event });
    assert.deepEqual(identity.job(), saved);
    assert.equal(identity.counts().executions, 0);
  }
  for (const identityChecks of [null, [], { locationId: "matched" },
    { locationId: "private-location", companyId: "matched", isSaaSV2: "matched" }]) {
    const identity = fixture();
    identity.deps.inspect = async (_, __, reportStage) => {
      reportStage("purchase_subscription_identity");
      throw Object.assign(new Error("private response"), { readinessFailure: {
        stage: "purchase_subscription_identity", kind: "exception", identityReason: "conflicting_identity", identityChecks
      } });
    };
    assert.deepEqual((await identity.run({ event })).failure,
      { stage: "purchase_subscription_identity", kind: "exception", identityReason: "conflicting_identity" });
    assert(!JSON.stringify(identity.job()).includes("private"));
  }
  unrelatedIdentity.deps.inspect = async (_, __, reportStage) => {
    reportStage("purchase_catalog_read");
    throw Object.assign(new Error("private"), { readinessFailure: {
      stage: "purchase_subscription_identity", kind: "exception", identityReason: "missing_identity",
      identityChecks: { locationId: "matched", companyId: "missing", isSaaSV2: "matched" }
    } });
  };
  assert.deepEqual((await unrelatedIdentity.run({ event })).failure, { stage: "purchase_catalog_read", kind: "exception" });
  for (const stage of ["purchase_grant", "purchase_subscription_read", "purchase_subscription_identity",
    "purchase_catalog_read", "purchase_catalog_verification", "purchase_mapping_readback"]) {
    const purchaseFailure = fixture();
    purchaseFailure.deps.inspect = async (_, __, reportStage) => {
      reportStage(stage);
      throw Object.assign(new Error("private provider response"), { readinessPending: "subscription" });
    };
    const result = await purchaseFailure.run({ event });
    assert.equal(result.status, "support_review_required");
    assert.deepEqual(result.failure, { stage, kind: "exception" });
    assert(!JSON.stringify(purchaseFailure.job()).includes("private"));
    const saved = structuredClone(purchaseFailure.job());
    await purchaseFailure.run({ event });
    assert.deepEqual(purchaseFailure.job(), saved);
    assert.equal(purchaseFailure.counts().executions, 0);
  }
  console.log("Buyer readiness persistence and retry safety tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
