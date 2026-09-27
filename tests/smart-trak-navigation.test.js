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

const athleteIds = [
  'addAthleteBtn', 'dashboardLink', 'trainingCalendarLink', 'attendanceLink',
  'importAthletesBtn', 'equipmentLookupBtn', 'emailCalendarLinksBtn',
  'calendarQuestionsBtn', 'emailToolsToggleBtn', 'emailParentsBtn',
  'copyParentsBtn', 'refreshBtn'
];
const athleteNodes = Object.fromEntries(athleteIds.map(id => [id, element('button')]));
const athleteHeader = element('header');
athleteHeader.querySelector = () => element('div');
const athleteDocument = {
  querySelector: selector => selector === '.top' ? athleteHeader : null,
  getElementById: id => athleteNodes[id],
  createElement: element,
  addEventListener() {}
};
let athleteRedirect = '';
const athleteWindow = { location: { replace: path => { athleteRedirect = path; } } };
vm.runInNewContext(source, {
  document: athleteDocument, window: athleteWindow, localStorage: storage,
  sessionStorage: storage, smartCoachAccountKey: () => 'school-a',
  pageUrl: path => path + '?account=school-a'
});
const athleteNav = athleteHeader.children.find(child => child.tag === 'nav');
assert.ok(athleteNav, 'athlete navigation mounted');
const athleteAccount = athleteNav.children.find(child => child.children[0] && child.children[0].textContent === 'Account');
const staffLink = athleteAccount.children[1].children.find(child => child.textContent === 'Staff Access');
assert.strictEqual(staffLink.href, '/dashboard.html?account=school-a#staff-access');
assert.strictEqual(staffLink.hidden, true);
athleteWindow.smartTrakNavigationUpdateAccess({ staffAdminAllowed: true, coach: { index: 1, role: 'Head Coach' } });
assert.strictEqual(staffLink.hidden, false);
athleteWindow.smartTrakNavigationUpdateAccess({ staffAdminAllowed: false, coach: { index: 1, role: 'Coach' } });
assert.strictEqual(staffLink.hidden, true);
const athleteSignOut = athleteAccount.children[1].children.find(child => child.textContent === 'Sign Out');
athleteSignOut.handlers.click();
assert.strictEqual(athleteRedirect, '/athletes.html?account=school-a');
for (const id of athleteIds) assert.ok(source.includes("'" + id + "'"), id + ' remains mapped');
console.log('SMART Trak shared navigation tests passed.');
