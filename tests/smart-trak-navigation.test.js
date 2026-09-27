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
function menuByName(nav, name) {
  return nav.children.find(child => child.tag === 'details' && child.children[0].textContent === name);
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
const dashboardDistance = menuByName(nav, 'Distance Trak');
const dashboardAthletes = menuByName(nav, 'Athletes');
assert.strictEqual(dashboardDistance.children[0].attributes['aria-current'], 'page');
assert.strictEqual(dashboardDistance.children[1].children[0], nodes.dashboardLink);
assert.strictEqual(dashboardDistance.children[1].children[1], nodes.shareMilesBoardBtn);
assert.strictEqual(dashboardAthletes.children[1].children[0], nodes.athletesLink);
assert.strictEqual(dashboardAthletes.children[1].children[1].href, '/attendance.html');
const dashboardQuick = menuByName(nav, 'Quick Add').children[1].children;
assert.strictEqual(dashboardQuick.find(child => child.textContent === 'Add Athlete').href, '/athletes.html#add-athlete');
assert.strictEqual(dashboardQuick.find(child => child.textContent === 'Import Athletes').href, '/athletes.html#import-athletes');
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
const athleteDistance = menuByName(athleteNav, 'Distance Trak');
const athleteRoster = menuByName(athleteNav, 'Athletes');
assert.strictEqual(athleteDistance.children[1].children[0], athleteNodes.dashboardLink);
assert.strictEqual(athleteDistance.children[1].children[1].href, '/dashboard.html?account=school-a#share-miles-board');
assert.strictEqual(athleteRoster.children[0].attributes['aria-current'], 'page');
assert.strictEqual(athleteRoster.children[1].children[0].href, '/athletes.html?account=school-a');
assert.strictEqual(athleteRoster.children[1].children[1], athleteNodes.attendanceLink);
const athleteQuick = menuByName(athleteNav, 'Quick Add').children[1].children;
assert.strictEqual(athleteQuick.find(child => child.textContent === 'Log Miles').href, '/dashboard.html?account=school-a#log-miles');
assert.strictEqual(athleteQuick.find(child => child.textContent === 'Log Single Result').href, '/dashboard.html?account=school-a#log-single-result');
assert.strictEqual(athleteQuick.find(child => child.textContent === 'Manage Meets').href, '/dashboard.html?account=school-a#manage-meets');
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
const attendanceNodes = Object.fromEntries(['dashboardLink', 'athletesLink', 'trainingCalendarLink', 'refreshBtn', 'exportBtn'].map(id => [id, element('button')]));
attendanceNodes.exportBtn.textContent = 'Export CSV';
const attendanceHeader = element('header');
const attendanceActions = element('div');
attendanceHeader.querySelector = () => attendanceActions;
const attendanceDocument = {
  querySelector: selector => selector === '.top' ? attendanceHeader : null,
  getElementById: id => attendanceNodes[id],
  createElement: element,
  addEventListener() {}
};
let attendanceRedirect = '';
const attendanceWindow = { location: { replace: path => { attendanceRedirect = path; } } };
vm.runInNewContext(source, {
  document: attendanceDocument, window: attendanceWindow, localStorage: storage,
  sessionStorage: storage, smartCoachAccountKey: () => 'school-a',
  pageUrl: path => path + '?account=school-a'
});
const attendanceNav = attendanceHeader.children.find(child => child.tag === 'nav');
assert.ok(attendanceNav, 'attendance navigation mounted');
assert.strictEqual(menuByName(attendanceNav, 'Athletes').children[0].attributes['aria-current'], 'page');
assert.strictEqual(menuByName(attendanceNav, 'Athletes').children[1].children[0], attendanceNodes.athletesLink);
assert.strictEqual(menuByName(attendanceNav, 'Athletes').children[1].children[1].href, '/attendance.html?account=school-a');
assert.ok(attendanceNav.children.includes(attendanceNodes.exportBtn), 'Export CSV remains visible');
assert.strictEqual(attendanceNodes.exportBtn.textContent, 'Export CSV', 'Export CSV label is preserved');
const attendanceStaff = menuByName(attendanceNav, 'Account').children[1].children.find(child => child.textContent === 'Staff Access');
assert.strictEqual(attendanceStaff.hidden, true);
attendanceWindow.smartTrakNavigationUpdateAccess({ staffAdminAllowed: true, coach: { index: 1, role: 'Head Coach' } });
assert.strictEqual(attendanceStaff.hidden, false);
menuByName(attendanceNav, 'Account').children[1].children.find(child => child.textContent === 'Sign Out').handlers.click();
assert.strictEqual(attendanceRedirect, '/attendance.html?account=school-a');
const dashboardSource = fs.readFileSync('dashboard.html', 'utf8');
const athletesSource = fs.readFileSync('athletes.html', 'utf8');
const attendanceSource = fs.readFileSync('attendance.html', 'utf8');
assert.ok(attendanceSource.includes('/assets/smart-trak-navigation.js'));
assert.ok(attendanceSource.includes('window.smartTrakNavigationUpdateAccess(result.ok?result.data:null)'));
const calendarIds = [
  'approveDraftsBtn', 'scheduleApprovedBtn', 'dashboardLink', 'milesTrakLink',
  'speedTrakLink', 'fieldPracticeLink', 'planSetupLink', 'planImportLink',
  'planBuilderLink', 'trainingCustomBtn', 'stravaTrainingLink', 'manageMeetsBtn',
  'keepTrakLink', 'weatherLink', 'manualMileageBtn', 'raceResultBtn', 'refreshBtn'
];
const calendarNodes = Object.fromEntries(calendarIds.map(id => [id, element('button')]));
const calendarHeader = element('header');
calendarHeader.querySelector = () => element('div');
const calendarDocument = {
  querySelector: selector => selector === '.top' ? calendarHeader : null,
  getElementById: id => calendarNodes[id],
  createElement: element,
  addEventListener() {}
};
let calendarRedirect = '';
const calendarWindow = { location: { replace: path => { calendarRedirect = path; } } };
vm.runInNewContext(source, {
  document: calendarDocument, window: calendarWindow, localStorage: storage,
  sessionStorage: storage, accountKey: () => 'school-a',
  pageUrl: path => path + '?account=school-a'
});
const calendarNav = calendarHeader.children.find(child => child.tag === 'nav');
assert.ok(calendarNav, 'Training Calendar navigation mounted');
assert.strictEqual(menuByName(calendarNav, 'Training').children[0].attributes['aria-current'], 'page');
const calendarTraining = menuByName(calendarNav, 'Training').children[1].children;
for (const id of ['fieldPracticeLink', 'planSetupLink', 'planImportLink', 'planBuilderLink', 'trainingCustomBtn', 'stravaTrainingLink']) {
  assert.ok(calendarTraining.includes(calendarNodes[id]), id + ' remains in Training menu');
}
assert.ok(calendarNav.children.includes(calendarNodes.approveDraftsBtn));
assert.ok(calendarNav.children.includes(calendarNodes.scheduleApprovedBtn));
assert.ok(calendarNav.children.includes(calendarNodes.refreshBtn));
assert.ok(menuByName(calendarNav, 'Quick Add').children[1].children.includes(calendarNodes.manualMileageBtn));
assert.ok(menuByName(calendarNav, 'Quick Add').children[1].children.includes(calendarNodes.raceResultBtn));
const calendarStaff = menuByName(calendarNav, 'Account').children[1].children.find(child => child.textContent === 'Staff Access');
assert.strictEqual(calendarStaff.hidden, true);
calendarWindow.smartTrakNavigationUpdateAccess({ staffAdminAllowed: true, coach: { index: 1, role: 'Head Coach' } });
assert.strictEqual(calendarStaff.hidden, false);
menuByName(calendarNav, 'Account').children[1].children.find(child => child.textContent === 'Sign Out').handlers.click();
assert.strictEqual(calendarRedirect, '/training-calendar.html?account=school-a');
const calendarSource = fs.readFileSync('training-calendar.html', 'utf8');
assert.ok(calendarSource.includes('/assets/smart-trak-navigation.js'));
assert.ok(calendarSource.includes('window.smartTrakNavigationUpdateAccess(result.ok?accountStatus:null)'));
for (const [hash, handler] of [
  ['#log-miles', 'openManualMileage'],
  ['#log-single-result', 'openRaceResult'],
  ['#manage-meets', 'openMeetManager']
]) assert.ok(dashboardSource.includes("location.hash==='" + hash + "')setTimeout(" + handler), hash + ' opens existing dashboard modal');
assert.ok(athletesSource.includes("if(rows)openQuickAddFromHash()"), 'athlete deep link waits for roster access');
assert.ok(athletesSource.includes("location.hash==='#add-athlete')openAthleteModal(null)"));
assert.ok(athletesSource.includes("location.hash==='#import-athletes')openImportModal()"));
console.log('SMART Trak shared navigation tests passed.');
