const assert = require("assert/strict");
const { newBuyerPolicyEnabled, canWaitForSubscriptionIdentity, qualifyNewBuyer, completedBuyerOAuthApproval } = require("../lib/new-buyer-policy");

const locationId = "AbCdEfGhIjKlMnOpQrSt", accountKey = `sc-${locationId.toLowerCase()}`;
const env = { SMARTCOACH_GHL_NEW_BUYER_PLANS: "pro25", SMARTCOACH_GHL_NEW_BUYER_OAUTH_PLANS: "pro25",
  SMARTCOACH_GHL_OAUTH_COMPANY_ID: "company" };
const base = {
  buyer: { accountKey, locationId }, companyId: "company", status: "trialing", subscriptionId: "subscription", priceId: "price",
  account: { accountKey, locationId, productPlan: "pro25", accountOwnerEmail: "coach@example.com", schoolName: "School",
    accountOwnerName: "Coach", subscription: { status: "incomplete" }, coachStaff: [], coachAccessCodes: [] },
  pending: { source: "smartcoach-precheckout", plan: "pro25", cadence: "monthly", productName: "SMARTCoach Pro 25 - Monthly",
    coachEmail: "coach@example.com", schoolName: "School", coachName: "Coach", lastMatchedLocationId: locationId,
    lastLocationCreateEvent: { id: locationId, companyId: "company", email: "coach@example.com", signatureVerified: true } },
  purchase: { purchaseVerified: true, purchasedProductPlan: "pro25", purchasedBillingCadence: "monthly", purchasedAmount: "19.00" },
  inventory: { complete: true, references: [accountKey] },
};
assert(newBuyerPolicyEnabled(env));
for (const value of [undefined, "", "*", "pro100", "pro25,pro100", "pro25 *"]) {
  for (const key of ["SMARTCOACH_GHL_NEW_BUYER_PLANS", "SMARTCOACH_GHL_NEW_BUYER_OAUTH_PLANS"]) {
    assert.equal(newBuyerPolicyEnabled({ ...env, [key]: value }), false);
  }
}
const qualified = qualifyNewBuyer(base);
assert(qualified.qualified);
const annual = structuredClone(base);
Object.assign(annual.purchase, { purchasedBillingCadence: "annual", purchasedAmount: "199.00" });
Object.assign(annual.pending, { cadence: "annual", productName: "SMARTCoach Pro 25 - Annual" });
assert(qualifyNewBuyer(annual).qualified);
assert(canWaitForSubscriptionIdentity(base));
assert(canWaitForSubscriptionIdentity(annual));
for (const mutate of [
  value => { value.buyer.accountKey = "other"; },
  value => { value.account.locationId = "other"; },
  value => { value.account.productPlan = "pro100"; },
  value => { value.pending.cadence = "weekly"; },
  value => { value.pending.productName = "Other"; },
  value => { value.pending.coachEmail = "other@example.com"; },
  value => { value.pending.lastLocationCreateEvent.signatureVerified = false; },
  value => { value.pending.lastLocationCreateEvent.companyId = "other"; },
  value => { value.pending.lastLocationCreateEvent.email = "other@example.com"; },
  value => { value.account.schoolName = "other"; },
  value => { value.account.accountOwnerName = "other"; },
  value => { value.account.token = "manual-token"; },
  value => { value.account.coachStaff = [{ id: "existing" }]; },
  value => { value.account.coachStaff = {}; },
  value => { value.account.coachAccessCodes = ["existing"]; },
  value => { value.account.coachAccessCodes = {}; },
  value => { value.account.accessCode = "existing"; },
  value => { value.account.subscription.status = "active"; },
  value => { value.account.accessStatus = "manual_hold"; },
  value => { value.inventory.complete = false; },
  value => { value.inventory.references.push("alias"); },
]) {
  const changed = structuredClone(base); mutate(changed);
  assert.equal(canWaitForSubscriptionIdentity(changed), false);
}
for (const mutate of [
  value => { value.buyer.accountKey = "school"; },
  value => { value.buyer.locationId = "QxwjWekSyUf7sDOFHPB4"; },
  value => { value.account.locationId = "other"; },
  value => { value.purchase.purchaseVerified = false; },
  value => { value.purchase.purchasedProductPlan = "pro100"; },
  value => { value.purchase.purchasedAmount = "29.00"; },
  value => { value.purchase.purchasedBillingCadence = "weekly"; },
  value => { value.pending.productName = "SMARTCoach Pro 25"; },
  value => { value.pending.coachEmail = "other@example.com"; },
  value => { value.pending.lastLocationCreateEvent.signatureVerified = false; },
  value => { value.pending.lastLocationCreateEvent.companyId = "other"; },
  value => { value.pending.lastLocationCreateEvent.id = "other"; },
  value => { value.account.schoolName = "other"; },
  value => { value.account.accountOwnerName = "other"; },
  value => { value.account.token = "preserve-manual-token"; },
  value => { value.account.coachStaff = [{ id: "existing" }]; },
  value => { value.account.coachAccessCodes = ["existing"]; },
  value => { value.account.accessCode = "existing"; },
  value => { value.account.subscription.status = "active"; },
  value => { value.account.accessStatus = "manual_hold"; },
  value => { value.inventory.complete = false; },
  value => { value.inventory.references.push("alias"); },
  value => { value.status = "canceled"; },
  value => { value.priceId = ""; },
  value => { value.subscriptionId = ""; },
]) {
  const changed = structuredClone(base); mutate(changed);
  assert.equal(qualifyNewBuyer(changed).qualified, false);
}
const proof = { ...qualified.identity, fingerprint: qualified.fingerprint, snapshotVerified: true, status: "complete" };
const account = { ...base.account, subscription: { status: "trialing", billingCadence: "monthly", amount: "19.00" } };
assert(completedBuyerOAuthApproval(env, base.buyer, account, proof));
assert(qualifyNewBuyer({ ...base, account, previous: proof }).qualified);
for (const changed of [{ ...proof, status: "approved" }, { ...proof, snapshotVerified: false },
  { ...proof, priceId: "changed" }, { ...proof, ownerEmail: "changed@example.com" }, { ...proof, companyId: "other" }]) {
  assert.equal(completedBuyerOAuthApproval(env, base.buyer, account, changed), false);
}
assert.equal(completedBuyerOAuthApproval(env, base.buyer, { ...account, schoolName: "other" }, proof), false);
assert.equal(completedBuyerOAuthApproval(env, base.buyer, { ...account, accessStatus: "manual_hold" }, proof), false);
assert.equal(qualifyNewBuyer({ ...base, account, previous: { ...proof, fingerprint: "changed" } }).qualified, false);
console.log("New Pro 25 buyer policy isolation tests passed");
