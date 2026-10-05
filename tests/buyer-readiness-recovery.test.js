const assert = require("assert/strict");
const { createBuyerReadinessRecovery } = require("../lib/buyer-readiness-recovery");
const buyer = { accountKey: "sc-abcdefghijklmnopqrst", locationId: "AbCdEfGhIjKlMnOpQrSt" };
function fixture() {
  const evidence = { readiness: { buyerAccountKey: buyer.accountKey, locationId: buyer.locationId, signatureVerified: true,
    event: { type: "LocationCreate", id: buyer.locationId }, status: "support_review_required",
    attempts: 1, createdAt: 1000, expiresAt: 86401000, accountKey: "ghlconnector", updatedAt: "original-storage-time" } };
  let enabled = true, locked = false, inspections = 0, writes = 0, resumes = 0, failAudit = false, failJob = false;
  const prerequisite = { verified: true, snapshot: { verified: true, objectCount: 5 }, qualification: { qualified: true,
    fingerprint: "current-purchase", identity: { buyerAccountKey: buyer.accountKey, locationId: buyer.locationId,
      productPlan: "pro25", ownerEmail: "buyer@example.com" } } };
  const deps = { now: () => 2000, enabled: () => enabled, eventValid: event => event?.id === buyer.locationId,
    lock: async () => { assert(!locked); locked = true; return async () => { locked = false; }; },
    load: async () => structuredClone(evidence), inspect: async () => { inspections++; return prerequisite; },
    saveRecovery: async (_, record) => { writes++; if (!failAudit) evidence.recovery = { ...structuredClone(record), accountKey: "ghlconnector", updatedAt: `storage-${writes}` }; },
    saveReadiness: async (_, record) => { writes++; if (!failJob) evidence.readiness = { ...structuredClone(record), accountKey: "ghlconnector", updatedAt: `storage-${writes}` }; },
    resume: async () => { assert(!locked); resumes++; return { status: "complete", emailAccepted: true }; } };
  return { evidence, prerequisite, api: createBuyerReadinessRecovery(deps), counts: () => ({ inspections, writes, resumes }),
    disable: () => { enabled = false; }, failAudit: () => { failAudit = true; }, failJob: () => { failJob = true; } };
}
(async () => {
  const f = fixture(), before = structuredClone(f.evidence);
  const preview = await f.api.run(buyer, { dryRun: true });
  assert.equal(preview.recoveryReady, true); assert.equal(preview.emailSent, false);
  assert.deepEqual(f.evidence, before); assert.deepEqual(f.counts(), { inspections: 1, writes: 0, resumes: 0 });
  for (const options of [{ dryRun: false }, { dryRun: false, confirmRecovery: true, expectedFingerprint: "stale" }]) {
    await assert.rejects(f.api.run(buyer, options), /approval/);
    assert.deepEqual(f.evidence, before);
  }
  const result = await f.api.run(buyer, { dryRun: false, confirmRecovery: true, expectedFingerprint: preview.fingerprint });
  assert.equal(result.recoveryApproved, true); assert.equal(result.emailAccepted, true);
  assert.deepEqual(f.evidence.recovery.originalJob, before.readiness);
  assert.equal(f.evidence.readiness.attempts, before.readiness.attempts);
  assert.equal(f.evidence.readiness.createdAt, before.readiness.createdAt);
  assert.equal(f.evidence.readiness.expiresAt, before.readiness.expiresAt);
  assert.equal(f.counts().resumes, 1);
  await assert.rejects(f.api.run(buyer, { dryRun: true }), /no approval, setup/);
  assert.equal(f.counts().resumes, 1);
  for (const field of ["recovery", "policy", "fulfillment", "access", "welcome", "checkoutIdentity"]) {
    const blocked = fixture(); blocked.evidence[field] = { status: "attempted" };
    await assert.rejects(blocked.api.run(buyer), /no approval, setup/);
    assert.equal(blocked.counts().writes, 0); assert.equal(blocked.counts().inspections, 0);
  }
  for (const mutate of [job => { job.signatureVerified = false; }, job => { job.buyerAccountKey = "other"; },
    job => { job.status = "expired"; }, job => { job.attempts = 6; }, job => { job.expiresAt = 2000; },
    job => { job.event.id = "other"; }, job => { job.recovery = {}; }]) {
    const blocked = fixture(); mutate(blocked.evidence.readiness);
    await assert.rejects(blocked.api.run(buyer), /no approval, setup/); assert.equal(blocked.counts().writes, 0);
  }
  for (const mutation of [p => { p.verified = false; }, p => { p.snapshot.verified = false; },
    p => { p.qualification.previousPreserved = true; }, p => { p.qualification.identity.productPlan = "essential"; }]) {
    const blocked = fixture(); mutation(blocked.prerequisite);
    await assert.rejects(blocked.api.run(buyer)); assert.equal(blocked.counts().writes, 0);
  }
  for (const mode of ["failAudit", "failJob"]) {
    const blocked = fixture(); const p = await blocked.api.run(buyer); blocked[mode]();
    await assert.rejects(blocked.api.run(buyer, { dryRun: false, confirmRecovery: true, expectedFingerprint: p.fingerprint }), /readback/);
    assert.equal(blocked.counts().resumes, 0);
  }
  const disabled = fixture(); disabled.disable();
  await assert.rejects(disabled.api.run(buyer), /not enabled/); assert.equal(disabled.counts().inspections, 0);
  await assert.rejects(fixture().api.run({ ...buyer, accountKey: "other" }), /not enabled/);
  for (const change of [f => { f.prerequisite.qualification.fingerprint = "changed-purchase"; },
    f => { f.prerequisite.snapshot.objectCount++; }, f => { f.evidence.readiness.attempts++; }]) {
    const stale = fixture(); const preview = await stale.api.run(buyer); change(stale);
    await assert.rejects(stale.api.run(buyer, { dryRun: false, confirmRecovery: true, expectedFingerprint: preview.fingerprint }), /approval/);
    assert.equal(stale.counts().writes, 0); assert.equal(stale.counts().resumes, 0);
  }
  console.log("Reviewed readiness recovery safety tests passed");
})().catch(error => { console.error(error); process.exit(1); });
