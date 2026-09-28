const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('overview.html', 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)][0][1];
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
  console.log('SMART Trak Overview tests passed.');
}, 0);
