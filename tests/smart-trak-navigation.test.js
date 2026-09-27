const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const source = fs.readFileSync('assets/smart-trak-navigation.js', 'utf8');
const ids = [
  'dashboardLink', 'athletesLink', 'trainingCalendarLink', 'fitnessCleanupBtn',
  'powerTrakLink', 'meetHistoryLink', 'manageMeetsBtn', 'shareResultsBoardBtn',
  'recordsLink', 'simulatorBtn', 'shareMilesBoardBtn', 'keepTrakLink',
  'weatherLink', 'manualMileageBtn', 'raceResultBtn', 'changeCodeBtn', 'refreshBtn'
];
function element(tag) {
  return {
    tag, children: [], handlers: {}, attributes: {}, classList: { add() {} },
    appendChild(child) { this.children.push(child); return child; },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, callback) { this.handlers[name] = callback; },
    querySelectorAll() { return []; }
  };
}
const oldActions = element('div');
const header = element('header');
header.querySelector = () => oldActions;
const nodes = Object.fromEntries(ids.map(id => [id, element('button')]));
const document = {
  querySelector: selector => selector === '.top' ? header : null,
  getElementById: id => nodes[id],
  createElement: element,
  addEventListener() {}
};
const removed = [];
const storage = { removeItem(key) { removed.push(key); } };
let redirected = '';
const context = {
  document, localStorage: storage, sessionStorage: storage,
  productPlan: () => 'pro', smartCoachPageUrl: path => path,
  smartCoachAccountKey: () => 'school-a',
  accessCodeStorageKey: () => 'sc_access_school-a',
  rememberedSessionStorageKey: () => 'sc_session_remembered_school-a',
  sessionStorageKey: () => 'sc_session_school-a',
  dashboardBrowserSnapshotKey: () => 'smarttrak_dashboard_snapshot_school-a',
  dashboardSecondaryBrowserSnapshotKey: () => 'smarttrak_dashboard_secondary_school-a',
  dashboardAccountStatusCacheKey: () => 'smarttrak_account_status_school-a',
  accountStatus: null,
  window: { location: { replace: path => { redirected = path; } } }
};
vm.runInNewContext(source, context);
const nav = header.children.find(child => child.tag === 'nav');
assert.ok(nav, 'navigation mounted');
assert.strictEqual(nav.attributes['aria-label'], 'SMART Trak navigation');
for (const id of ids) {
  assert.ok(source.includes("'" + id + "'"), id + ' remains mapped');
}
assert.strictEqual(nodes.changeCodeBtn.hidden, true, 'Staff Access hidden without Head Coach session');
context.window.smartTrakNavigationUpdateAccess({ staffAdminAllowed: true, coach: { index: 1, role: 'Head Coach' } });
assert.strictEqual(nodes.changeCodeBtn.hidden, false);
context.window.smartTrakNavigationUpdateAccess({ staffAdminAllowed: false, coach: { index: 1, role: 'Coach' } });
assert.strictEqual(nodes.changeCodeBtn.hidden, true);
const account = nav.children.find(child => child.children[0] && child.children[0].textContent === 'Account');
const signOut = account.children[1].children.find(child => child.textContent === 'Sign Out');
signOut.handlers.click();
assert.deepStrictEqual(removed.sort(), [
  'sc_access_school-a', 'sc_session_remembered_school-a', 'sc_session_school-a',
  'smarttrak_dashboard_snapshot_school-a', 'smarttrak_dashboard_secondary_school-a',
  'smarttrak_account_status_school-a', 'sc_admin_tools'
].sort());
assert.strictEqual(redirected, '/dashboard.html?account=school-a');
console.log('SMART Trak dashboard navigation tests passed.');
