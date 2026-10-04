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
  console.log("Buyer readiness persistence and retry safety tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
