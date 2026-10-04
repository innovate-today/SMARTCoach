const assert = require("assert/strict");
const { planBuyerFulfillment, createBuyerFulfillment, controlledBuyerExecutionAllowed, automaticBuyerExecutionAllowed } = require("../lib/buyer-fulfillment");

const locationId = "AbCdEfGhIjKlMnOpQrSt";
const buyer = { accountKey: `sc-${locationId.toLowerCase()}`, locationId };
const verified = { ...buyer, purchaseVerified: true, savedConfigurationMatches: true, pendingCheckoutMatched: true,
  providerSubscriptionStatus: "trialing", subscriptionStatusMatched: true, buyerOAuthVerified: true,
  coreOAuthWriteRolloutEnabled: true, sellerSenderVerified: true, accountAccessAllowed: true,
  existingAccessAbsent: true, existingAccessPreserved: false, ownerEmail: "buyer@example.com", coachName: "Buyer Coach",
  schoolName: "School", productPlan: "pro100", productName: "SMARTCoach Pro 100 - Monthly", billingCadence: "monthly",
  amount: "29.00", subscriptionId: "subscription", priceId: "price", checkoutFingerprint: "verified-checkout" };

function fixture() {
  let evidence = structuredClone(verified), job, locked = false;
  const writes = [], actions = [];
  let failStep, wrongSender = false, saveFailure = false;
  const deps = { executionEnabled: true, now: () => 1000,
    inspect: async () => structuredClone(evidence), load: async () => structuredClone(job),
    save: async (_, value) => { if (saveFailure) throw new Error("Storage unavailable"); job = structuredClone(value); writes.push(structuredClone(value)); },
    lock: async () => { if (locked) throw new Error("Busy"); locked = true; return async () => { locked = false; }; },
    actions: Object.fromEntries(planBuyerFulfillment(verified).steps.map(step => [step, async () => {
      actions.push(step);
      if (failStep === step) throw new Error("Provider timeout");
      return { ...buyer, confirmed: true, senderLocationId: wrongSender ? locationId : "QxwjWekSyUf7sDOFHPB4",
        emailFrom: "info@smartcoach-pro.com", messageId: "accepted-message" };
    }])) };
  return { deps, api: createBuyerFulfillment(deps), writes, actions, setEvidence: e => { evidence = e; },
    fail: step => { failStep = step; }, wrongSender: () => { wrongSender = true; }, failSave: () => { saveFailure = true; },
    job: () => structuredClone(job), isLocked: () => locked };
}

(async () => {
  const gate = { SMARTCOACH_GHL_CONTROLLED_FULFILLMENT_ACCOUNTS: buyer.accountKey,
    SMARTCOACH_GHL_OAUTH_WRITE_ACCOUNTS: buyer.accountKey };
  assert.equal(controlledBuyerExecutionAllowed(gate, buyer), true);
  const automaticGate = { ...gate, SMARTCOACH_GHL_AUTOMATIC_FULFILLMENT_ACCOUNTS: buyer.accountKey };
  assert.equal(automaticBuyerExecutionAllowed(automaticGate, buyer), true);
  assert.equal(automaticBuyerExecutionAllowed(gate, buyer), false);
  for (const key of Object.keys(automaticGate)) {
    assert.equal(automaticBuyerExecutionAllowed({ ...automaticGate, [key]: "" }, buyer), false);
  }
  for (const value of ["*", "true", "all", "sc-other", `${buyer.accountKey},*`, "sc-12345678901234567890"]) {
    assert.equal(automaticBuyerExecutionAllowed({ ...automaticGate, SMARTCOACH_GHL_AUTOMATIC_FULFILLMENT_ACCOUNTS: value }, buyer), false);
  }
  assert.equal(automaticBuyerExecutionAllowed(automaticGate, { ...buyer, accountKey: "sc-other" }), false);
  assert.equal(controlledBuyerExecutionAllowed({}, buyer), false);
  assert.equal(controlledBuyerExecutionAllowed({ ...gate, SMARTCOACH_GHL_OAUTH_WRITE_ACCOUNTS: '' }, buyer), false);
  for (const value of ['', '*', 'all', 'true', 'sc-other', 'sc-abcdefghijklmnopqrstx',
    `${buyer.accountKey},*`, `${buyer.accountKey},bad`, buyer.accountKey.toUpperCase(), 'sc-12345678901234567890']) {
    assert.equal(controlledBuyerExecutionAllowed({ ...gate, SMARTCOACH_GHL_CONTROLLED_FULFILLMENT_ACCOUNTS: value }, buyer), false, value);
  }
  assert.equal(controlledBuyerExecutionAllowed({ ...gate,
    SMARTCOACH_GHL_CONTROLLED_FULFILLMENT_ACCOUNTS: `sc-12345678901234567890,\n${buyer.accountKey}` }, buyer), true);
  assert.equal(controlledBuyerExecutionAllowed(gate, { ...buyer, locationId: 'other' }), false);
  assert.equal(controlledBuyerExecutionAllowed(gate, { ...buyer, accountKey: 'sc-other' }), false);
  const sellerBuyer = { accountKey: 'sc-qxwjweksyuf7sdofhpb4', locationId: 'QxwjWekSyUf7sDOFHPB4' };
  assert.equal(controlledBuyerExecutionAllowed({ SMARTCOACH_GHL_CONTROLLED_FULFILLMENT_ACCOUNTS: sellerBuyer.accountKey,
    SMARTCOACH_GHL_OAUTH_WRITE_ACCOUNTS: sellerBuyer.accountKey }, sellerBuyer), false);
  assert.equal(planBuyerFulfillment(verified).stagedPlanReady, true);
  for (const change of [{ locationId: "QxwjWekSyUf7sDOFHPB4" }, { accountKey: "sc-other" }, { purchaseVerified: false },
    { savedConfigurationMatches: false }, { pendingCheckoutMatched: false }, { providerSubscriptionStatus: "past_due" },
    { subscriptionStatusMatched: false }, { buyerOAuthVerified: false }, { coreOAuthWriteRolloutEnabled: false },
    { sellerSenderVerified: false }, { accountAccessAllowed: false }, { existingAccessAbsent: false }]) {
    const f = fixture(); f.setEvidence({ ...verified, ...change });
    await assert.rejects(f.api.run(buyer), /checks failed|does not match/);
    assert.equal(f.writes.length, 0); assert.equal(f.actions.length, 0);
  }
  const dry = fixture();
  const preview = await dry.api.run(buyer);
  assert.equal(preview.dryRun, true); assert.equal(preview.automaticFulfillmentReady, false);
  assert.equal(dry.writes.length, 0); assert.equal(dry.actions.length, 0);
  const options = { dryRun: false, confirmExecution: true, expectedFingerprint: preview.fingerprint };
  for (const change of [{ confirmExecution: false }, { expectedFingerprint: "stale" }]) {
    await assert.rejects(dry.api.run(buyer, { ...options, ...change }), /disabled|approval/);
    assert.equal(dry.writes.length, 0);
  }
  dry.deps.executionEnabled = false;
  await assert.rejects(dry.api.run(buyer, options), /disabled/);
  dry.deps.executionEnabled = true;
  const completed = await dry.api.run(buyer, options);
  assert.equal(completed.complete, true); assert.equal(completed.deliveryVerified, false);
  assert.equal(dry.actions.length, 3);
  const snapshot = dry.job();
  assert.equal((await dry.api.run(buyer, options)).alreadyCompleted, true);
  assert.equal(dry.actions.length, 3); assert.deepEqual(dry.job(), snapshot);
  assert.equal(dry.isLocked(), false);
  dry.setEvidence({ ...verified, ownerEmail: "changed@example.com" });
  await assert.rejects(dry.api.run(buyer, options), /approval/);
  const preserved = fixture(); preserved.setEvidence({ ...verified, existingAccessAbsent: false, existingAccessPreserved: true });
  const keep = await preserved.api.run(buyer);
  assert.equal(keep.nextAction, "preserve_existing_access"); assert.deepEqual(keep.steps, []);
  await preserved.api.run(buyer, { ...options, expectedFingerprint: keep.fingerprint });
  assert.equal(preserved.actions.length, 0); assert.equal(preserved.writes.length, 0);
  for (const step of planBuyerFulfillment(verified).steps) {
    const uncertain = fixture(); const p = await uncertain.api.run(buyer); uncertain.fail(step);
    await assert.rejects(uncertain.api.run(buyer, { ...options, expectedFingerprint: p.fingerprint }), /timeout/);
    assert.equal(uncertain.job().steps[step].status, "attempted");
    const count = uncertain.actions.length;
    await assert.rejects(uncertain.api.run(buyer, { ...options, expectedFingerprint: p.fingerprint }), /already attempted/);
    assert.equal(uncertain.actions.length, count); assert.equal(uncertain.isLocked(), false);
  }
  const seller = fixture(); seller.wrongSender();
  await assert.rejects(seller.api.run(buyer, options), /Seller access email/);
  assert.equal(seller.job().steps.create_head_coach_and_send_seller_access.status, "attempted");
  const storage = fixture(); storage.failSave();
  await assert.rejects(storage.api.run(buyer, options), /Storage unavailable/);
  assert.equal(storage.actions.length, 0);
  const missing = fixture(); delete missing.deps.actions.verify_buyer_setup;
  await assert.rejects(missing.api.run(buyer, options), /adapter is not installed/);
  assert.equal(missing.writes.length, 0);
  const concurrent = fixture();
  const results = await Promise.allSettled([concurrent.api.run(buyer, options), concurrent.api.run(buyer, options)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(concurrent.actions.length, 3);
  assert.equal(concurrent.isLocked(), false);
  console.log("Buyer fulfillment dry-run, retry, isolation and preservation tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
