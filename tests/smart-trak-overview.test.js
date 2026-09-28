const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('overview.html', 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
assert.ok(html.includes('/assets/smart-trak-navigation.js?v=20260927-fitness-review'));
const nodes = new Map();
function node(id) {
  if (!nodes.has(id)) nodes.set(id, {
    id, textContent: '', hidden: false, value: '', children: [], handlers: {},
    addEventListener(event, handler) { this.handlers[event] = handler; },
    appendChild(child) { this.children.push(child); },
    replaceChildren() { this.children = []; },
    focus() {}
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
  totals: { currentWeekRuns: 8, currentWeekVolumeMiles: 32.4 },
  athletes: [
    { name: 'A', currentFitness: { display: '5K 19:00' } },
    { name: 'B', currentFitness: { display: '' } }
  ],
  recentMeetResults: [{ athleteName: 'A', event: '5K', resultDisplay: '19:00', meetName: 'Fall Invite' }]
};
const context = {
  URL, URLSearchParams, Date, location: { search: '?account=school-a', origin: 'https://example.test' },
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
  localStorage: browserStorage, sessionStorage: browserStorage,
  document: { getElementById: lockedNode, querySelectorAll: () => [], createElement: () => ({}) },
  fetch(path) {
    lockedRequests.push(path);
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ accessReady: true, accessCodeRequired: true, coachAccessUnlocked: false, deviceAccessReady: false }) });
  }
};
lockedContext.window = lockedContext;
vm.runInNewContext(script, lockedContext);
function overviewLoadCase(snapshot) {
  const caseNodes = new Map(), calls = [], timers = [];
  const caseNode = id => {
    if (!caseNodes.has(id)) caseNodes.set(id, {
      textContent: '', hidden: false, value: '', children: [], dataset: {},
      addEventListener() {}, appendChild(child) { this.children.push(child); },
      replaceChildren() { this.children = []; }, focus() {}
    });
    return caseNodes.get(id);
  };
  const caseContext = {
    URL, URLSearchParams, Date, setTimeout(callback) { timers.push(callback); },
    location: { search: '?account=school-a', origin: 'https://example.test' },
    localStorage: browserStorage, sessionStorage: browserStorage,
    document: { getElementById: caseNode, querySelectorAll: () => [], createElement: () => caseNode(Symbol()) },
    fetch(path) {
      calls.push(path);
      const status = path.includes('account-status');
      const missing = path.includes('snapshot=1') && !snapshot;
      const data = status ? { accessReady: true, coachAccessUnlocked: true } : missing ? { snapshotMissing: true } : path.includes('snapshot=1') ? snapshot : payload;
      return Promise.resolve({ ok: !missing, json: () => Promise.resolve(data) });
    }
  };
  caseContext.window = caseContext;
  vm.runInNewContext(script, caseContext);
  return { calls, timers, caseNode };
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
  assert.ok(routes.every(route => route.href.endsWith('?account=school-a')));
  assert.ok(html.includes('data-route="/speed-trak.html"'));
  assert.ok(html.includes('data-route="/power-trak.html"'));
  assert.strictEqual(lockedNode('accessPanel').hidden, false);
  assert.strictEqual(lockedNode('overviewContent').hidden, true);
  assert.strictEqual(lockedRequests.length, 1, 'locked view does not request dashboard data');
  assert.ok(requests.some(request => request.path.includes('snapshot=1')), 'Overview requests the saved snapshot first');
  assert.ok(!requests.some(request => request.path.includes('/dashboard?') && !request.path.includes('snapshot=1')), 'fresh snapshot avoids the live aggregation');
  (async () => {
    const fresh = overviewLoadCase({ ...payload, snapshot: true, snapshotSavedAt: new Date().toISOString() });
    const missing = overviewLoadCase(null);
    const stale = overviewLoadCase({ ...payload, snapshot: true, snapshotSavedAt: '2020-01-01T00:00:00Z' });
    await new Promise(setImmediate);
    assert.strictEqual(fresh.calls.filter(path => path.includes('/dashboard?')).length, 1);
    assert.strictEqual(fresh.timers.length, 0);
    assert.strictEqual(missing.calls.filter(path => path.includes('/dashboard?')).length, 2, 'missing snapshot falls back to live data');
    assert.strictEqual(stale.caseNode('overviewContent').hidden, false, 'stale snapshot renders before refresh');
    assert.strictEqual(stale.timers.length, 1);
    stale.timers[0]();
    await new Promise(setImmediate);
    assert.strictEqual(stale.calls.filter(path => path.includes('/dashboard?')).length, 2, 'older snapshot refreshes in background');
    console.log('SMART Trak Overview tests passed.');
  })().catch(error => { console.error(error); process.exitCode = 1; });
}, 0);
