const crypto = require("crypto");
const SELLER_LOCATION_ID = "QxwjWekSyUf7sDOFHPB4";

function reject(message) {
  throw Object.assign(new Error(message), { statusCode: 409 });
}

function planBuyerFulfillment(evidence) {
  const e = evidence || {};
  const checks = {
    buyerIdentity: typeof e.locationId === "string" && /^[A-Za-z0-9]{20}$/.test(e.locationId)
      && e.locationId !== SELLER_LOCATION_ID && e.accountKey === `sc-${e.locationId.toLowerCase()}`,
    purchase: e.purchaseVerified === true && e.savedConfigurationMatches === true,
    checkoutIdentity: e.pendingCheckoutMatched === true,
    subscription: ["active", "trialing"].includes(e.providerSubscriptionStatus) && e.subscriptionStatusMatched === true,
    buyerOAuth: e.buyerOAuthVerified === true,
    buyerWriteRollout: e.coreOAuthWriteRolloutEnabled === true,
    sellerSender: e.sellerSenderVerified === true,
    accountAccess: e.accountAccessAllowed === true,
    existingAccess: e.existingAccessPreserved === true || e.existingAccessAbsent === true,
  };
  const blockers = Object.keys(checks).filter(key => !checks[key]);
  const preserve = e.existingAccessPreserved === true;
  return { stagedPlanReady: blockers.length === 0, blockers,
    steps: blockers.length || preserve ? [] : ["verify_buyer_setup", "ensure_buyer_account_key", "create_head_coach_and_send_seller_access"],
    nextAction: blockers.length ? "support_review_required" : preserve ? "preserve_existing_access" : "new_buyer_setup",
    existingAccessPreserved: preserve, automaticFulfillmentReady: false };
}

function evidenceFingerprint(e) {
  // Only verified identity/purchase evidence participates; no tokens, codes or mutable step state.
  const identity = [e.accountKey, e.locationId, e.ownerEmail, e.coachName, e.schoolName, e.productPlan,
    e.productName, e.billingCadence, e.amount, e.subscriptionId, e.priceId, e.checkoutFingerprint];
  if (identity.some(value => typeof value !== "string" || !value.trim())) reject("Fulfillment identity evidence is incomplete.");
  return crypto.createHash("sha256").update(JSON.stringify(identity)).digest("hex");
}

function createBuyerFulfillment(deps) {
  const { inspect, load, save, lock, actions } = deps;
  const now = deps.now || Date.now;
  async function run(buyer, options = {}) {
    const perform = async () => {
      const evidence = await inspect(buyer);
      if (evidence.accountKey !== buyer.accountKey || evidence.locationId !== buyer.locationId) reject("Fulfillment buyer evidence does not match.");
      const plan = planBuyerFulfillment(evidence);
      if (!plan.stagedPlanReady) reject(`Fulfillment checks failed: ${plan.blockers.join(", ")}.`);
      const fingerprint = evidenceFingerprint(evidence);
      if (options.dryRun !== false) return { ...plan, fingerprint, dryRun: true, accountUnchanged: true, emailSent: false };
      if (deps.executionEnabled !== true || options.confirmExecution !== true || options.expectedFingerprint !== fingerprint) {
        reject("Live fulfillment is disabled or explicit unchanged-evidence approval is missing.");
      }
      if (!plan.steps.length) return { ...plan, complete: true, accountUnchanged: true, emailSent: false };
      let job = await load(buyer);
      if (job && (job.fingerprint !== fingerprint || job.accountKey !== buyer.accountKey || job.locationId !== buyer.locationId)) {
        reject("Fulfillment history conflicts with current evidence. Support review required.");
      }
      if (!job) job = { accountKey: buyer.accountKey, locationId: buyer.locationId, fingerprint, steps: {}, status: "pending" };
      if (job.status === "complete") {
        if (plan.steps.some(step => job.steps?.[step]?.status !== "confirmed")) reject("Fulfillment completion history is incomplete.");
        return { complete: true, alreadyCompleted: true, emailSent: false, automaticFulfillmentReady: false };
      }
      for (const step of plan.steps) {
        if (job.steps[step]?.status === "confirmed") continue;
        if (job.steps[step]) reject("A fulfillment step was already attempted. Verify its outcome before retrying.");
        const fresh = await inspect(buyer);
        if (!planBuyerFulfillment(fresh).stagedPlanReady || evidenceFingerprint(fresh) !== fingerprint) reject("Fulfillment evidence changed before the next step.");
        if (typeof actions?.[step] !== "function") reject("Fulfillment step adapter is not installed.");
        // Persist intent before any external write. Uncertain outcomes cannot be automatically replayed.
        job.steps[step] = { status: "attempted", attemptedAt: now() };
        await save(buyer, job);
        const intent = await load(buyer);
        if (intent?.fingerprint !== fingerprint || intent.steps?.[step]?.status !== "attempted") reject("Fulfillment intent readback failed.");
        const result = await actions[step](buyer, fresh);
        if (result?.confirmed !== true || result.accountKey !== buyer.accountKey || result.locationId !== buyer.locationId) reject("Fulfillment step outcome is uncertain. Support review required.");
        if (step === "create_head_coach_and_send_seller_access"
          && (result.senderLocationId !== SELLER_LOCATION_ID || result.emailFrom !== "info@smartcoach-pro.com" || !result.messageId)) {
          reject("Seller access email acceptance is uncertain. Support review required.");
        }
        job.steps[step] = { status: "confirmed", confirmedAt: now() };
        await save(buyer, job);
      }
      job.status = "complete";
      await save(buyer, job);
      const confirmed = await load(buyer);
      if (confirmed?.status !== "complete" || confirmed.fingerprint !== fingerprint
        || plan.steps.some(step => confirmed.steps?.[step]?.status !== "confirmed")) reject("Fulfillment completion readback failed.");
      return { complete: true, emailAccepted: true, deliveryVerified: false, automaticFulfillmentReady: false };
    };
    if (options.dryRun !== false) return perform();
    const release = await lock(buyer);
    try { return await perform(); } finally { await release(); }
  }
  return { run };
}

module.exports = { planBuyerFulfillment, createBuyerFulfillment };
