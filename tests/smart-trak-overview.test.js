const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { dashboardOverviewPayload } = require('../api/ghl/dashboard');

const html = fs.readFileSync('overview.html', 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
const guideContext = {};
guideContext.window = guideContext;
vm.runInNewContext(fs.readFileSync('assets/smart-trak-guide-content.js', 'utf8'), guideContext);
const guide = guideContext.smartTrakGuideContent;
assert.ok(html.includes('/assets/smart-trak-navigation.js?v=20260927-fitness-review'));
const nodes = new Map();
function node(id) {
  if (!nodes.has(id)) nodes.set(id, {
    id, textContent: '', hidden: false, value: '', children: [], handlers: {},
    addEventListener(event, handler) { this.handlers[event] = handler; },
    appendChild(child) { this.children.push(child); },
    replaceChildren() { this.children = []; },
    focus() {}, showModal() { this.open = true; }, close() { this.open = false; }
  });
  return nodes.get(id);
}
const routes = ['/dashboard.html', '/speed-trak.html', '/power-trak.html'].map(route => ({ dataset: { route } }));
const storage = new Map([['sc_session_remembered_school-a', 'valid-session']]);
const browserStorage = {
  getItem(key) { return storage.get(key) || null; },
  setItem(key, value) { storage.set(key, value); },
  removeItem(key) { storage.delete(key); }
};
const requests = [];
const payload = {
  generatedAt: '2026-09-27T15:00:00Z',
  activeAthletes: 2,
  missingFitness: 1,
  totals: { currentWeekRuns: 8, currentWeekVolumeMiles: 32.4 },
  recentMeetResults: [{ athleteName: 'A', event: '5K', resultDisplay: '19:00', meetName: 'Fall Invite', meetDate: new Date(Date.now() - 86400000).toISOString().slice(0, 10) }]
};
const projected = dashboardOverviewPayload({
  ...payload,
  snapshot: true,
  athletes: [
    { name: 'A', currentFitness: { display: '5K 19:00' }, privateDetail: 'not for overview' },
    { name: 'B', currentFitness: { display: '' } }
  ],
  recentTrainingSyncs: [{ privateDetail: 'not for overview' }],
  recentMeetResults: [{ ...payload.recentMeetResults[0], privateDetail: 'not for overview' }]
});
assert.strictEqual(projected.activeAthletes, 2);
assert.strictEqual(projected.missingFitness, 1);
assert.strictEqual(projected.snapshot, true);
assert.strictEqual(projected.recentMeetResults[0].athleteName, 'A');
assert.ok(!('athletes' in projected));
assert.ok(!('recentTrainingSyncs' in projected));
assert.ok(!('privateDetail' in projected.recentMeetResults[0]));
assert.strictEqual(projected.recentMeetResults[0].meetDate, payload.recentMeetResults[0].meetDate);
const olderMeetDate = new Date(Date.now() - 45 * 86400000).toISOString().slice(0, 10);
const newerMeetDate = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
const recentOnly = dashboardOverviewPayload({ ...payload, recentMeetResults: [
  { athleteName: 'Old', meetDate: olderMeetDate, syncedAt: new Date().toISOString() },
  { athleteName: 'Yesterday', meetDate: payload.recentMeetResults[0].meetDate, syncedAt: olderMeetDate },
  { athleteName: 'Earlier', meetDate: newerMeetDate, syncedAt: new Date().toISOString() }
] });
assert.deepStrictEqual(recentOnly.recentMeetResults.map(row => row.athleteName), ['Yesterday', 'Earlier']);
assert.ok(html.includes('id="startHereBtn"') && html.includes('id="whatsNewBtn"'));
assert.ok(html.includes('/assets/smart-trak-guide-content.js'));
const context = {
  URL, URLSearchParams, Date, location: { search: '?account=school-a', origin: 'https://example.test' },
  smartTrakGuideContent: guide,
  localStorage: browserStorage, sessionStorage: browserStorage,
  document: {
    getElementById: node,
    querySelectorAll: () => routes,
    createElement: () => node(Symbol())
  },
  fetch(path, options) {
    requests.push({ path, options });
    const data = path.includes('account-status')
      ? { accessReady: true, accessCodeRequired: true, coachAccessUnlocked: true, staffAdminAllowed: false }
      : payload;
    return Promise.resolve({ ok: true, json: () => Promise.resolve(data) });
  }
};
context.window = context;
vm.runInNewContext(script, context);
assert.strictEqual(node('whatsNewCount').textContent, guide.updates.reduce((sum, group) => sum + group.items.length, 0) + ' New');
node('startHereBtn').handlers.click();
assert.strictEqual(node('startHereDialog').open, true);
assert.strictEqual(node('startHereList').children.length, guide.paths.length);
assert.strictEqual(node('startHereList').children[0].children[3].children[0].href, '/athletes.html?account=school-a');
node('startHereClose').handlers.click();
assert.strictEqual(node('startHereDialog').open, false);
node('whatsNewBtn').handlers.click();
assert.strictEqual(node('whatsNewDialog').open, true);
assert.strictEqual(node('whatsNewList').children.length, guide.updates.length);
node('whatsNewSeenBtn').handlers.click();
assert.strictEqual(storage.get('smartcoachWhatsNewSeen_school-a'), guide.version);
assert.strictEqual(node('whatsNewCount').hidden, true);
node('whatsNewClose').handlers.click();
assert.strictEqual(node('whatsNewDialog').open, false);
const lockedNodes = new Map();
const lockedNode = id => {
  if (!lockedNodes.has(id)) lockedNodes.set(id, {
    textContent: '', hidden: false, value: '', handlers: {},
    addEventListener(event, handler) { this.handlers[event] = handler; }, focus() {}
  });
  return lockedNodes.get(id);
};
const lockedRequests = [];
const lockedContext = {
  URL, URLSearchParams, Date, location: { search: '?account=school-a', origin: 'https://example.test' },
  smartTrakGuideContent: guide,
  localStorage: browserStorage, sessionStorage: browserStorage,
  document: { getElementById: lockedNode, querySelectorAll: () => [], createElement: () => ({}) },
  fetch(path) {
    lockedRequests.push(path);
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ accessReady: true, accessCodeRequired: true, coachAccessUnlocked: false, deviceAccessReady: false }) });
  }
};
lockedContext.window = lockedContext;
vm.runInNewContext(script, lockedContext);
function overviewLoadCase(snapshot, delayRefresh) {
  const caseNodes = new Map(), calls = [], timers = [];
  let resolveRefresh;
  const caseNode = id => {
    if (!caseNodes.has(id)) caseNodes.set(id, {
      textContent: '', hidden: id === 'overviewContent', value: '', children: [], dataset: {},
      addEventListener() {}, appendChild(child) { this.children.push(child); },
      replaceChildren() { this.children = []; }, focus() {}
    });
    return caseNodes.get(id);
  };
  const caseContext = {
    URL, URLSearchParams, Date, setTimeout(callback) { timers.push(callback); },
    smartTrakGuideContent: guide,
    location: { search: '?account=school-a', origin: 'https://example.test' },
    localStorage: browserStorage, sessionStorage: browserStorage,
    document: { getElementById: caseNode, querySelectorAll: () => [], createElement: () => caseNode(Symbol()) },
    fetch(path) {
      calls.push(path);
      if (delayRefresh && path.includes('refresh=1')) return new Promise(resolve => { resolveRefresh = resolve; });
      const status = path.includes('account-status');
      const missing = path.includes('snapshot=1') && !snapshot;
      const data = status ? { accessReady: true, coachAccessUnlocked: true } : missing ? { snapshotMissing: true } : path.includes('snapshot=1') ? snapshot : payload;
      return Promise.resolve({ ok: !missing, json: () => Promise.resolve(data) });
    }
  };
  caseContext.window = caseContext;
  vm.runInNewContext(script, caseContext);
  return { calls, timers, caseNode, resolveRefresh(data) { resolveRefresh({ ok: true, json: () => Promise.resolve(data) }); } };
}
setTimeout(() => {
  assert.strictEqual(node('activeAthletes').textContent, '2');
  assert.strictEqual(node('weekRuns').textContent, '8');
  assert.strictEqual(node('weekMiles').textContent, '32.4 mi');
  assert.strictEqual(node('missingFitness').textContent, '1');
  assert.strictEqual(node('fitnessNotice').hidden, false);
  assert.strictEqual(node('recentResults').children.length, 1);
  assert.strictEqual(node('recentResults').children[0].children[0].textContent, 'A');
  assert.ok(requests.every(request => request.options.headers['X-SMARTCoach-Account'] === 'school-a'));
  assert.ok(requests.every(request => request.options.headers['X-SMARTCoach-Session'] === 'valid-session'));
  assert.strictEqual(context.accountStatus.staffAdminAllowed, false, 'Overview retains the role result for navigation loaded afterward');
  assert.ok(html.includes('window.accountStatus=status;'));
  assert.ok(routes.every(route => route.href.endsWith('?account=school-a')));
  assert.ok(html.includes('data-route="/speed-trak.html"'));
  assert.ok(html.includes('data-route="/power-trak.html"'));
  assert.strictEqual(lockedNode('accessPanel').hidden, false);
  assert.strictEqual(lockedNode('overviewContent').hidden, true);
  assert.strictEqual(lockedRequests.length, 1, 'locked view does not request dashboard data');
  assert.ok(requests.some(request => request.path.includes('snapshot=1')), 'Overview requests the saved snapshot first');
  assert.ok(requests.some(request => request.path.includes('overview=1')), 'Overview requests only its display fields');
  assert.ok(!requests.some(request => request.path.includes('/dashboard?') && !request.path.includes('snapshot=1')), 'fresh snapshot avoids the live aggregation');
  (async () => {
    const fresh = overviewLoadCase({ ...payload, snapshot: true, snapshotSavedAt: new Date().toISOString() });
    const missing = overviewLoadCase(null);
    const stale = overviewLoadCase({ ...payload, totals: { currentWeekRuns: 0, currentWeekVolumeMiles: 0 }, recentMeetResults: [], snapshot: true, snapshotSavedAt: '2020-01-01T00:00:00Z' }, true);
    await new Promise(setImmediate);
    assert.strictEqual(fresh.calls.filter(path => path.includes('/dashboard?')).length, 1);
    assert.strictEqual(fresh.timers.length, 0);
    assert.strictEqual(missing.calls.filter(path => path.includes('/dashboard?')).length, 3, 'missing snapshot loads totals then meet results');
    assert.ok(missing.calls.some(path => path.includes('refresh=1')), 'missing snapshot requests a complete meet lookup');
    assert.strictEqual(stale.calls.filter(path => path.includes('/dashboard?')).length, 3, 'expired snapshot loads totals then meet results');
    assert.ok(stale.calls.some(path => path.includes('refresh=1')), 'expired snapshot requests a complete meet lookup');
    assert.strictEqual(stale.timers.length, 0, 'expired snapshot does not render then refresh in the background');
    assert.strictEqual(stale.caseNode('overviewContent').hidden, false, 'fresh weekly totals appear before the meet lookup');
    assert.strictEqual(stale.caseNode('weekRuns').textContent, '8', 'expired weekly count never flashes');
    assert.ok(stale.caseNode('recentResults').innerHTML.includes('Loading results'), 'old meet rows stay hidden while fresh results load');
    stale.resolveRefresh(payload);
    await new Promise(setImmediate);
    assert.strictEqual(stale.caseNode('recentResults').children[0].children[0].textContent, 'A');
    console.log('SMART Trak Overview tests passed.');
  })().catch(error => { console.error(error); process.exitCode = 1; });
}, 0);
