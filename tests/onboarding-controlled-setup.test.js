const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('onboarding.html', 'utf8');
const source = html.slice(html.indexOf('async function completeHighLevelBuyerSetup(){'), html.indexOf('async function reviewHighLevelCheckoutIdentity(){'));

async function run(mode) {
  const elements = { accountKey: { value: 'sc-buyer' }, locationId: { value: 'buyer' },
    originalCheckoutEmail: { value: mode === 'missing' ? '' : 'Buyer@example.com' },
    buyerHeadCoachName: { value: 'Coach Buyer' }, ghlOAuthControlledSetupBtn: { disabled: false } };
  const calls = [];
  let status;
  const context = vm.createContext({ document: { getElementById: id => elements[id] },
    window: { confirm: () => mode !== 'cancel' }, setStatus: text => { status = text; },
    highLevelConnectionRequest: async (route, method, body) => {
      calls.push({ route, method, body });
      if (body.dryRun) return { dryRun: true, accountUnchanged: true, emailSent: false, automaticFulfillmentReady: false,
        controlledExecutionEnabled: mode !== 'disabled', stagedPlanReady: true, fingerprint: 'fresh',
        snapshot: { verified: mode !== 'snapshot' }, existingAccessPreserved: mode === 'preserve',
        steps: ['verify_buyer_setup', 'ensure_buyer_account_key', 'create_head_coach_and_send_seller_access'],
        buyer: { accountKey: 'sc-buyer', locationId: mode === 'wrong-location' ? 'other' : 'buyer',
          ownerEmail: mode === 'wrong-email' ? 'other@example.com' : 'buyer@example.com', coachName: 'Coach Buyer',
          schoolName: 'School', productName: 'SMARTCoach Pro 25 - Monthly', amount: '19.00', billingCadence: 'monthly', subscriptionStatus: 'trialing' } };
      if (mode === 'stale') throw new Error('Evidence changed');
      return { complete: true, emailAccepted: mode !== 'uncertain', deliveryVerified: false, automaticFulfillmentReady: false };
    } });
  vm.runInContext(source, context);
  await context.completeHighLevelBuyerSetup();
  assert.equal(elements.ghlOAuthControlledSetupBtn.disabled, false);
  const executes = ['success', 'stale', 'uncertain'].includes(mode);
  assert.equal(calls.length, mode === 'missing' ? 0 : executes ? 2 : 1);
  if (executes) {
    assert.equal(calls[1].body.expectedFingerprint, 'fresh');
    assert.equal(calls[1].body.confirmExecution, true);
    assert.equal(calls[1].body.dryRun, false);
    assert.equal(calls[1].route, 'ghl-oauth-fulfill-buyer');
  }
  if (mode === 'success') assert.match(status, /Inbox delivery and Overview sign-in are not yet verified/);
  if (mode === 'preserve') assert.match(status, /No setup or resend needed/);
  if (['stale', 'uncertain'].includes(mode)) assert.match(status, /Do not retry or resend/);
}

(async () => {
  for (const mode of ['success', 'missing', 'disabled', 'snapshot', 'wrong-location', 'wrong-email', 'cancel', 'preserve', 'stale', 'uncertain']) await run(mode);
  console.log('Controlled onboarding UI checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
