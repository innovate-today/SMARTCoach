const assert = require("assert/strict");
const fs = require("fs");
const vm = require("vm");

const html = fs.readFileSync("onboarding.html", "utf8");
const source = html.slice(html.indexOf("async function approveHighLevelCheckoutIdentity(){"), html.indexOf("async function reconcileHighLevelBuyerTrial(){"));
assert(source.startsWith("async function approveHighLevelCheckoutIdentity(){"));

async function run(mode) {
  const fields = { accountKey: "sc-buyer", locationId: "buyer", originalCheckoutEmail: "Original@example.com",
    checkoutReviewer: mode === "missing-reviewer" ? "" : "Owner reviewer", checkoutReviewReason: "Owner approved the verified email correction." };
  const elements = Object.fromEntries(Object.entries(fields).map(([id, value]) => [id, { value }]));
  elements.ghlOAuthCheckoutApproveBtn = { disabled: false };
  const calls = [];
  let status;
  const context = vm.createContext({ document: { getElementById: id => elements[id] },
    window: { confirm: () => mode !== "canceled" }, setStatus: text => { status = text; },
    highLevelConnectionRequest: async (route, method, body) => {
      calls.push({ route, method, body });
      if (body.preview) return { preview: true, fingerprint: "fresh-evidence", buyerAccountKey: mode === "wrong-account" ? "other" : "sc-buyer",
        locationId: "buyer", originalEmail: "original@example.com", ownerEmail: "corrected@example.com", productName: "SMARTCoach Pro 100 - Monthly", amount: "29.00" };
      if (mode === "stale") throw new Error("Evidence changed. No approval recorded.");
      return { reconciliationApproved: true, accountUnchanged: true, pendingCheckoutUnchanged: true,
        emailSent: mode === "incomplete-response" ? undefined : false, automaticFulfillmentReady: false };
    } });
  vm.runInContext(source, context);
  await context.approveHighLevelCheckoutIdentity();
  assert.equal(elements.ghlOAuthCheckoutApproveBtn.disabled, false);
  assert.equal(calls.length, mode === "missing-reviewer" ? 0 : ["canceled", "wrong-account"].includes(mode) ? 1 : 2);
  for (const call of calls) {
    assert.equal(call.route, "ghl-oauth-reconcile-checkout");
    assert.equal(call.method, "POST");
  }
  if (calls.length === 2) {
    assert.equal(calls[1].body.confirmReconciliation, true);
    assert.equal(calls[1].body.expectedFingerprint, "fresh-evidence");
    assert.equal(calls[1].body.originalEmail, "original@example.com");
    assert.equal(calls[1].body.reviewedBy, fields.checkoutReviewer);
    assert.equal(calls[1].body.reason, fields.checkoutReviewReason);
  }
  if (mode === "success") assert.match(status, /Separate checkout identity approval recorded/);
  if (mode === "stale") assert.match(status, /Evidence changed/);
  if (mode === "incomplete-response") assert.match(status, /response is incomplete/);
}

(async () => {
  for (const mode of ["success", "missing-reviewer", "canceled", "wrong-account", "stale", "incomplete-response"]) await run(mode);
  console.log("Onboarding checkout approval controls passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
