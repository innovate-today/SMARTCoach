const assert = require("assert/strict");
const { createBuyerKeyRecovery } = require("../lib/buyer-key-recovery");
const buyer = { accountKey: "sc-abcdefghijklmnopqrst", locationId: "AbCdEfGhIjKlMnOpQrSt" };
function fixture() {
  const original = { buyerAccountKey: buyer.accountKey, locationId: buyer.locationId, status: "support_review_required",
    signatureVerified: true, event: { type: "LocationCreate", id: buyer.locationId }, attempts: 1,
    createdAt: 1000, expiresAt: 86401000, accountKey: "ghlconnector", updatedAt: "original" };
  const recovery = { buyerAccountKey: buyer.accountKey, locationId: buyer.locationId, status: "approved",
    fingerprint: "a".repeat(64), approvedAt: 1500, originalJob: structuredClone(original) };
  const evidence = { recovery, readiness: { ...original, attempts: 4,
    recovery: { fingerprint: recovery.fingerprint, approvedAt: 1500, originalStatus: original.status, originalAttempts: 1 } },
    policy: { buyerAccountKey: buyer.accountKey, locationId: buyer.locationId, status: "approved", snapshotVerified: true, fingerprint: "policy-proof" },
    fulfillment: { buyerAccountKey: buyer.accountKey, locationId: buyer.locationId, status: "pending", fingerprint: "fulfillment-proof",
      steps: { verify_buyer_setup: { status: "confirmed" }, ensure_buyer_account_key: { status: "attempted", attemptedAt: 1700 } } } };
  const inspection = { verified: true, snapshot: { verified: true }, existingAccessAbsent: true,
    configurationFingerprint: 'c'.repeat(64),
    fulfillmentFingerprint: "fulfillment-proof", keyReadback: { readVerified: true, exactMatch: true, matchCount: 1, providerWritePerformed: false },
    qualification: { qualified: true, previousPreserved: true, fingerprint: "policy-proof", identity: {
      buyerAccountKey: buyer.accountKey, locationId: buyer.locationId, productPlan: "pro25", ownerEmail: "buyer@example.com" } } };
  let enabled = true, locked = false, writes = 0, resumes = 0, failure = "";
  const persist = async (name, record) => { writes++; if (failure === name) return;
    evidence[name] = { ...structuredClone(record), accountKey: "ghlconnector", updatedAt: `storage-${writes}` }; };
  const deps = { now: () => 2000, enabled: () => enabled, eventValid: event => event?.id === buyer.locationId,
    lock: async () => { assert(!locked); locked = true; return async () => { locked = false; }; },
    load: async () => structuredClone(evidence), inspect: async () => inspection,
    saveReview: (_, record) => persist("keyReview", record), saveFulfillment: (_, record) => persist("fulfillment", record),
    saveReadiness: (_, record) => persist("readiness", record), resume: async () => { assert(!locked); resumes++; return { status: "complete", emailAccepted: true }; } };
  return { evidence, inspection, api: createBuyerKeyRecovery(deps), counts: () => ({ writes, resumes }),
    fail: name => { failure = name; }, disable: () => { enabled = false; } };
}
(async () => {
  const f = fixture(), before = structuredClone(f.evidence);
  const preview = await f.api.run(buyer);
  assert.equal(preview.keyRecoveryReady, true); assert.equal(preview.providerWritePerformed, false);
  assert.deepEqual(f.evidence, before); assert.deepEqual(f.counts(), { writes: 0, resumes: 0 });
  for (const options of [{ dryRun: false }, { dryRun: false, confirmRecovery: true, expectedFingerprint: "stale" }]) {
    await assert.rejects(f.api.run(buyer, options), /confirmation/); assert.equal(f.counts().writes, 0);
  }
  const result = await f.api.run(buyer, { dryRun: false, confirmRecovery: true, expectedFingerprint: preview.fingerprint });
  assert.equal(result.keyRecoveryApproved, true); assert.equal(result.emailAccepted, true);
  assert.deepEqual(f.evidence.keyReview.originalReadiness, before.readiness);
  assert.deepEqual(f.evidence.keyReview.originalFulfillment, before.fulfillment);
  assert.deepEqual(f.evidence.recovery, before.recovery);
  assert.equal(f.evidence.fulfillment.steps.ensure_buyer_account_key.status, "confirmed");
  assert.equal(f.evidence.fulfillment.steps.ensure_buyer_account_key.attemptedAt, 1700);
  for (const key of ["attempts", "createdAt", "expiresAt"]) assert.equal(f.evidence.readiness[key], before.readiness[key]);
  assert.deepEqual(f.counts(), { writes: 3, resumes: 1 });
  await assert.rejects(f.api.run(buyer), /history/);
  for (const change of [e => { e.readiness.signatureVerified = false; }, e => { e.recovery.originalJob.event.id = "other"; },
    e => { e.readiness.attempts = 6; }, e => { e.readiness.expiresAt = 2000; }, e => { e.policy.buyerAccountKey = "other"; },
    e => { e.fulfillment.steps.ensure_buyer_account_key.status = "confirmed"; }, e => { e.fulfillment.steps.create_head_coach_and_send_seller_access = { status: "attempted" }; },
    e => { e.access = { status: "attempted" }; }, e => { e.welcome = {}; }, e => { e.checkoutIdentity = {}; }, e => { e.keyReview = {}; }]) {
    const blocked = fixture(); change(blocked.evidence);
    await assert.rejects(blocked.api.run(buyer), /history/); assert.equal(blocked.counts().writes, 0);
  }
  for (const change of [i => { i.keyReadback.exactMatch = false; }, i => { i.keyReadback.matchCount = 2; },
    i => { i.keyReadback.providerWritePerformed = true; }, i => { i.existingAccessAbsent = false; },
    i => { i.qualification.previousPreserved = false; }, i => { i.qualification.fingerprint = "changed"; },
    i => { i.fulfillmentFingerprint = "changed"; }, i => { i.snapshot.verified = false; }]) {
    const blocked = fixture(); change(blocked.inspection);
    await assert.rejects(blocked.api.run(buyer), /prerequisites/); assert.equal(blocked.counts().writes, 0);
  }
  const stale = fixture(), stalePreview = await stale.api.run(buyer);
  stale.evidence.readiness.attempts++;
  await assert.rejects(stale.api.run(buyer, { dryRun: false, confirmRecovery: true, expectedFingerprint: stalePreview.fingerprint }), /confirmation/);
  assert.equal(stale.counts().writes, 0);
  for (const stage of ["keyReview", "fulfillment", "readiness"]) {
    const broken = fixture(), p = await broken.api.run(buyer); broken.fail(stage);
    await assert.rejects(broken.api.run(buyer, { dryRun: false, confirmRecovery: true, expectedFingerprint: p.fingerprint }), /readback/);
    assert.equal(broken.counts().resumes, 0);
    if (stage !== "keyReview") await assert.rejects(broken.api.run(buyer), /history/);
  }
  const disabled = fixture(); disabled.disable(); await assert.rejects(disabled.api.run(buyer), /not enabled/);
  await assert.rejects(fixture().api.run({ ...buyer, accountKey: "other" }), /not enabled/);
  console.log("Reviewed buyer-key recovery safety tests passed");
})().catch(error => { console.error(error); process.exit(1); });
