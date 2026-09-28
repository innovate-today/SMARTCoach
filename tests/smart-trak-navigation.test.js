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
calendarNodes.stravaTrainingLink.hidden = true;
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
assert.strictEqual(calendarNodes.stravaTrainingLink.hidden, true, 'navigation keeps the existing beta visibility state');
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
const fieldIds = ['newBtn', 'dashboardLink', 'calendarLink', 'athletesLink', 'refreshBtn'];
const fieldNodes = Object.fromEntries(fieldIds.map(id => [id, element('button')]));
const fieldHeader = element('header');
fieldHeader.querySelector = () => element('div');
const fieldDocument = {
  querySelector: selector => selector === '.top' ? fieldHeader : null,
  getElementById: id => fieldNodes[id],
  createElement: element,
  addEventListener() {}
};
let fieldRedirect = '';
const fieldWindow = { location: { replace: path => { fieldRedirect = path; } } };
vm.runInNewContext(source, {
  document: fieldDocument, window: fieldWindow, localStorage: storage,
  sessionStorage: storage, smartCoachAccountKey: () => 'school-a',
  pageUrl: path => path + '?account=school-a'
});
const fieldNav = fieldHeader.children.find(child => child.tag === 'nav');
assert.ok(fieldNav, 'Field Practice navigation mounted');
assert.strictEqual(menuByName(fieldNav, 'Training').children[0].attributes['aria-current'], 'page');
assert.strictEqual(menuByName(fieldNav, 'Training').children[1].children[0], fieldNodes.calendarLink);
assert.ok(menuByName(fieldNav, 'Quick Add').children[1].children.includes(fieldNodes.newBtn));
assert.ok(fieldNav.children.includes(fieldNodes.refreshBtn));
const fieldStaff = menuByName(fieldNav, 'Account').children[1].children.find(child => child.textContent === 'Staff Access');
assert.strictEqual(fieldStaff.hidden, true);
fieldWindow.smartTrakNavigationUpdateAccess({ staffAdminAllowed: true, coach: { index: 1, role: 'Head Coach' } });
assert.strictEqual(fieldStaff.hidden, false);
menuByName(fieldNav, 'Account').children[1].children.find(child => child.textContent === 'Sign Out').handlers.click();
assert.strictEqual(fieldRedirect, '/field-practice.html?account=school-a');
const fieldSource = fs.readFileSync('field-practice.html', 'utf8');
assert.ok(fieldSource.includes('/assets/smart-trak-navigation.js'));
assert.ok(fieldSource.includes('window.smartTrakNavigationUpdateAccess(status)'));
const speedIds = ['addResultBtn', 'dashboardLink', 'trainingLink', 'fieldPracticeLink', 'refreshBtn', 'shareSpeedBoardBtn', 'exportSpeedDataBtn'];
const speedNodes = Object.fromEntries(speedIds.map(id => [id, element('button')]));
const speedHeader = element('header');
const speedActions = element('div');
speedHeader.querySelector = selector => selector === '.top-actions' ? speedActions : null;
const speedDocument = {
  querySelector: selector => selector === '.top' ? speedHeader : null,
  getElementById: id => speedNodes[id],
  createElement: element,
  addEventListener() {}
};
let speedRedirect = '';
const speedWindow = { location: { replace: path => { speedRedirect = path; } } };
vm.runInNewContext(source, {
  document: speedDocument, window: speedWindow, localStorage: storage,
  sessionStorage: storage, smartCoachAccountKey: () => 'school-a',
  pageUrl: path => path + '?account=school-a'
});
const speedNav = speedHeader.children.find(child => child.tag === 'nav');
assert.ok(speedNav, 'Speed Trak navigation mounted');
assert.ok(speedActions.classList, 'original Speed Trak actions remain available for moving');
assert.strictEqual(speedNav.children.find(child => child.textContent === 'Speed Trak').attributes['aria-current'], 'page');
assert.strictEqual(menuByName(speedNav, 'Training').children[1].children[0], speedNodes.trainingLink);
assert.ok(menuByName(speedNav, 'Training').children[1].children.includes(speedNodes.fieldPracticeLink));
assert.ok(menuByName(speedNav, 'Quick Add').children[1].children.includes(speedNodes.addResultBtn));
for (const id of ['shareSpeedBoardBtn', 'exportSpeedDataBtn', 'refreshBtn']) assert.ok(speedNav.children.includes(speedNodes[id]), id + ' remains visible');
const speedStaff = menuByName(speedNav, 'Account').children[1].children.find(child => child.textContent === 'Staff Access');
assert.strictEqual(speedStaff.hidden, true);
speedWindow.smartTrakNavigationUpdateAccess({ staffAdminAllowed: true, coach: { index: 1, role: 'Head Coach' } });
assert.strictEqual(speedStaff.hidden, false);
menuByName(speedNav, 'Account').children[1].children.find(child => child.textContent === 'Sign Out').handlers.click();
assert.strictEqual(speedRedirect, '/speed-trak.html?account=school-a');
const speedSource = fs.readFileSync('speed-trak.html', 'utf8');
assert.ok(speedSource.includes('/assets/smart-trak-navigation.js'));
assert.ok(speedSource.includes('window.smartTrakNavigationUpdateAccess(data)'));
const powerIds = ['rackPwaLink', 'dashboardLink', 'trainingLink', 'downloadCsvBtn', 'deleteSessionBtn', 'refreshBtn'];
const powerNodes = Object.fromEntries(powerIds.map(id => [id, element('button')]));
const powerHeader = element('header');
const powerActions = element('div');
powerHeader.querySelector = selector => selector === '.top-actions' ? powerActions : null;
const powerDocument = {
  body: { classList: { contains: () => false } },
  querySelector: selector => selector === '.top' ? powerHeader : null,
  getElementById: id => powerNodes[id],
  createElement: element, addEventListener() {}
};
let powerRedirect = '';
const powerWindow = { location: { replace: path => { powerRedirect = path; } } };
vm.runInNewContext(source, {
  document: powerDocument, window: powerWindow, localStorage: storage,
  sessionStorage: storage, smartCoachAccountKey: () => 'school-a',
  pageUrl: path => path + '?account=school-a'
});
const powerNav = powerHeader.children.find(child => child.tag === 'nav');
assert.ok(powerNav, 'Power Trak coach navigation mounted');
assert.strictEqual(powerNav.children.find(child => child.textContent === 'Power Trak').attributes['aria-current'], 'page');
assert.ok(menuByName(powerNav, 'Training').children[1].children.includes(powerNodes.trainingLink));
for (const id of ['rackPwaLink', 'downloadCsvBtn', 'deleteSessionBtn', 'refreshBtn']) assert.ok(powerNav.children.includes(powerNodes[id]), id + ' remains available');
const powerStaff = menuByName(powerNav, 'Account').children[1].children.find(child => child.textContent === 'Staff Access');
assert.strictEqual(powerStaff.hidden, true);
powerWindow.smartTrakNavigationUpdateAccess({ staffAdminAllowed: true, coach: { index: 1, role: 'Head Coach' } });
assert.strictEqual(powerStaff.hidden, false);
menuByName(powerNav, 'Account').children[1].children.find(child => child.textContent === 'Sign Out').handlers.click();
assert.strictEqual(powerRedirect, '/power-trak.html?account=school-a');
const kioskHeader = element('header');
kioskHeader.querySelector = () => element('div');
vm.runInNewContext(source, {
  document: { ...powerDocument, body: { classList: { contains: name => name === 'rack-kiosk' } }, querySelector: () => kioskHeader },
  window: {}, smartCoachAccountKey: () => 'school-a', pageUrl: path => path
});
assert.strictEqual(kioskHeader.children.length, 0, 'Rack iPad mode keeps its existing navigation');
const powerSource = fs.readFileSync('power-trak.html', 'utf8');
assert.ok(powerSource.includes('/assets/smart-trak-navigation.css'));
assert.ok(powerSource.includes('/assets/smart-trak-navigation.js'));
assert.ok(powerSource.includes('window.smartTrakNavigationUpdateAccess(data)'));
const meetIds = ['dashboardLink', 'recordsLink', 'trackSimulatorLink', 'xcSimulatorLink', 'openImportTopBtn', 'openQuickEntryBtn', 'refreshBtn'];
const meetNodes = Object.fromEntries(meetIds.map(id => [id, element('button')]));
const meetHeader = element('header');
meetHeader.querySelector = selector => selector === '.actions' ? element('div') : null;
const meetDocument = {
  querySelector: selector => selector === '.top' ? meetHeader : null,
  getElementById: id => meetNodes[id], createElement: element, addEventListener() {}
};
let meetRedirect = '';
const meetWindow = { location: { replace: path => { meetRedirect = path; } } };
vm.runInNewContext(source, {
  document: meetDocument, window: meetWindow, localStorage: storage,
  sessionStorage: storage, accountKey: () => 'school-a', pageUrl: path => path + '?account=school-a'
});
const meetNav = meetHeader.children.find(child => child.tag === 'nav');
assert.ok(meetNav, 'Meet History navigation mounted');
assert.strictEqual(menuByName(meetNav, 'Meets & Results').children[0].attributes['aria-current'], 'page');
for (const id of ['recordsLink', 'trackSimulatorLink', 'xcSimulatorLink']) assert.ok(menuByName(meetNav, 'Meets & Results').children[1].children.includes(meetNodes[id]));
for (const id of ['openImportTopBtn', 'openQuickEntryBtn']) assert.ok(menuByName(meetNav, 'Quick Add').children[1].children.includes(meetNodes[id]));
assert.ok(meetNav.children.includes(meetNodes.refreshBtn));
const meetStaff = menuByName(meetNav, 'Account').children[1].children.find(child => child.textContent === 'Staff Access');
assert.strictEqual(meetStaff.hidden, true);
meetWindow.smartTrakNavigationUpdateAccess({ staffAdminAllowed: true, coach: { index: 1, role: 'Head Coach' } });
assert.strictEqual(meetStaff.hidden, false);
menuByName(meetNav, 'Account').children[1].children.find(child => child.textContent === 'Sign Out').handlers.click();
assert.strictEqual(meetRedirect, '/meet-history.html?account=school-a');
const meetSource = fs.readFileSync('meet-history.html', 'utf8');
assert.ok(meetSource.includes('/assets/smart-trak-navigation.css'));
assert.ok(meetSource.includes('/assets/smart-trak-navigation.js'));
assert.ok(meetSource.includes('window.smartTrakNavigationUpdateAccess(result.ok?result.data:null)'));
const recordIds = ['dashboardLink', 'meetHistoryLink', 'xcAddListBtn', 'refreshBtn'];
const recordNodes = Object.fromEntries(recordIds.map(id => [id, element('button')]));
const recordHeader = element('header');
recordHeader.querySelector = selector => selector === '.actions' ? element('div') : null;
let recordRedirect = '';
const recordWindow = { location: { replace: path => { recordRedirect = path; } } };
vm.runInNewContext(source, {
  document: {
    querySelector: selector => selector === '.top' ? recordHeader : null,
    getElementById: id => recordNodes[id], createElement: element, addEventListener() {}
  },
  window: recordWindow, localStorage: storage, sessionStorage: storage,
  accountKey: () => 'school-a', pageUrl: path => path + '?account=school-a'
});
const recordNav = recordHeader.children.find(child => child.tag === 'nav');
assert.ok(recordNav, 'Records navigation mounted');
assert.strictEqual(menuByName(recordNav, 'Meets & Results').children[0].attributes['aria-current'], 'page');
assert.ok(menuByName(recordNav, 'Meets & Results').children[1].children.includes(recordNodes.meetHistoryLink));
assert.ok(recordNav.children.includes(recordNodes.refreshBtn));
assert.ok(!recordNav.children.includes(recordNodes.xcAddListBtn), 'XC Top 20 controls stay in the page');
const recordStaff = menuByName(recordNav, 'Account').children[1].children.find(child => child.textContent === 'Staff Access');
assert.strictEqual(recordStaff.hidden, true);
recordWindow.smartTrakNavigationUpdateAccess({ staffAdminAllowed: true, coach: { index: 1, role: 'Head Coach' } });
assert.strictEqual(recordStaff.hidden, false);
menuByName(recordNav, 'Account').children[1].children.find(child => child.textContent === 'Sign Out').handlers.click();
assert.strictEqual(recordRedirect, '/records.html?account=school-a');
const recordsSource = fs.readFileSync('records.html', 'utf8');
assert.ok(recordsSource.includes('/assets/smart-trak-navigation.css'));
assert.ok(recordsSource.includes('/assets/smart-trak-navigation.js'));
assert.ok(recordsSource.includes('window.smartTrakNavigationUpdateAccess(result.ok?result.data:null)'));
for (const [simulator, peer, path] of [
  ['track', 'xcSimulatorLink', '/track-simulator.html'],
  ['xc', 'trackSimulatorLink', '/xc-simulator.html']
]) {
  const simNodes = Object.fromEntries(['dashboardLink', 'meetHistoryLink', 'recordsLink', peer, 'resetBtn'].map(id => [id, element('button')]));
  const simHeader = element('header');
  simHeader.querySelector = selector => selector === '.actions' ? element('div') : null;
  let simRedirect = '';
  const simWindow = { location: { replace: target => { simRedirect = target; } } };
  vm.runInNewContext(source, {
    document: {
      querySelector: selector => selector === '.top' ? simHeader : null,
      getElementById: id => simNodes[id], createElement: element, addEventListener() {}
    },
    window: simWindow, localStorage: storage, sessionStorage: storage,
    accountKey: () => 'school-a', pageUrl: target => target + '?account=school-a'
  });
  const simNav = simHeader.children.find(child => child.tag === 'nav');
  assert.ok(simNav, simulator + ' simulator navigation mounted');
  assert.strictEqual(menuByName(simNav, 'Meets & Results').children[0].attributes['aria-current'], 'page');
  for (const id of ['meetHistoryLink', 'recordsLink', peer]) assert.ok(menuByName(simNav, 'Meets & Results').children[1].children.includes(simNodes[id]));
  assert.ok(simNav.children.includes(simNodes.resetBtn), 'Reset remains directly available');
  const simStaff = menuByName(simNav, 'Account').children[1].children.find(child => child.textContent === 'Staff Access');
  assert.strictEqual(simStaff.hidden, true);
  simWindow.smartTrakNavigationUpdateAccess({ staffAdminAllowed: true, coach: { index: 1, role: 'Head Coach' } });
  assert.strictEqual(simStaff.hidden, false);
  menuByName(simNav, 'Account').children[1].children.find(child => child.textContent === 'Sign Out').handlers.click();
  assert.strictEqual(simRedirect, path + '?account=school-a');
  const simSource = fs.readFileSync(simulator + '-simulator.html', 'utf8');
  assert.ok(simSource.includes('/assets/smart-trak-navigation.css'));
  assert.ok(simSource.includes('/assets/smart-trak-navigation.js'));
  assert.ok(simSource.includes('window.smartTrakNavigationUpdateAccess(result.ok?result.data:null)'));
}
for (const [hash, handler] of [
  ['#log-miles', 'openManualMileage'],
  ['#log-single-result', 'openRaceResult'],
  ['#manage-meets', 'openMeetManager']
]) assert.ok(dashboardSource.includes("location.hash==='" + hash + "')setTimeout(" + handler), hash + ' opens existing dashboard modal');
assert.ok(athletesSource.includes("if(rows)openQuickAddFromHash()"), 'athlete deep link waits for roster access');
assert.ok(athletesSource.includes("location.hash==='#add-athlete')openAthleteModal(null)"));
assert.ok(athletesSource.includes("location.hash==='#import-athletes')openImportModal()"));
console.log('SMART Trak shared navigation tests passed.');
