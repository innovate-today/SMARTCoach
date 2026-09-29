const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const html = fs.readFileSync('power-trak.html', 'utf8');
const rackSave=html.slice(html.indexOf('function saveRackSession('),html.indexOf('\nfunction ',html.indexOf('function saveRackSession(')+1));
assert.ok(rackSave.includes('if(!els.rackSessionsPanel.hidden)renderRackSessions()'), 'rack save skips hidden Sessions');
assert.ok(rackSave.includes('if(!els.powerLeaderboardPanel.hidden)renderPowerLeaderboard()'), 'rack save skips hidden Leaderboard');
assert.ok(rackSave.includes('if(!els.powerProgressionPanel.hidden)renderPowerProgression()'), 'rack save skips hidden Progression');
const start = html.indexOf('var powerLoadGeneration=0;');
const end = html.indexOf('els.dashboardLink.href=', start);
assert.ok(start > 0 && end > start, 'Power Trak staged load is present');

const tabs = Object.fromEntries(['sessions', 'leaderboard', 'progression', 'history', 'import'].map(name => [name, {}]));
const timers = [];
let finishHistory;
const history = new Promise(resolve => { finishHistory = resolve; });
const requests = [];
const state = { workouts: [], rackSessions: [], sessions: [], workoutDraft: null };
const els = { lastUpdated: {}, status: {}, rows: {}, rackLive: { hidden: true }, historyPanel: { hidden: true }, rackSessionsPanel: { hidden: true }, powerLeaderboardPanel: { hidden: true }, powerProgressionPanel: { hidden: true } };
const renders = { history: 0, sessions: 0, leaderboard: 0, progression: 0 };
const context = {
  Promise, Map, Date, state, els, location: { hash: '' },
  document: { querySelector(selector) {
    const match = selector.match(/data-power-tab="([^"]+)"/);
    return match ? tabs[match[1]] : null;
  } },
  smartCoachAccountKey: () => 'school-a',
  apiUrl: (path, options) => path + (options && options.activeOnly ? '?activeOnly=1' : ''),
  fetchJson(url) {
    requests.push(url);
    if (url.includes('activeOnly=1')) return Promise.resolve({ workouts: [{ id: 'workout-1' }], rackSessions: [{ id: 'active-1', status: 'active' }] });
    if (url.includes('/power-trak')) return history;
    if (url.includes('/athletes')) return Promise.resolve({ athletes: [] });
    return Promise.resolve({ groups: [] });
  },
  setTimeout(callback) { timers.push(callback); },
  powerRackKioskMode: () => false,
  blankPowerWorkout: () => ({ id: 'blank' }),
  renderWorkoutBuilder() {}, renderRackSetup() {}, resumeOwnedPowerRack() {},
  buildRows: sessions => sessions, populateFilters() {}, applyFilters() {},
  renderRackSessions() { renders.sessions++; }, renderPowerLeaderboard() { renders.leaderboard++; }, renderPowerProgression() { renders.progression++; }, renderRackHistory() { renders.history++; },
  setWorkoutStatus() {}
};
vm.runInNewContext(html.slice(start, end), context);

(async () => {
  context.load();
  await new Promise(setImmediate);
  assert.deepStrictEqual(requests.filter(url => url.includes('/power-trak')), ['/api/smart-trak/power-trak?activeOnly=1']);
  assert.strictEqual(state.workouts.length, 1, 'workout builder is ready before history');
  assert.strictEqual(state.rackSessions.length, 1, 'active racks are ready before history');
  assert.strictEqual(tabs.history.disabled, true);
  assert.strictEqual(timers.length, 1, 'full history is deferred until after initial render');

  timers.shift()();
  assert.strictEqual(requests.filter(url => url.includes('/power-trak')).length, 2);
  assert.strictEqual(tabs.history.disabled, true);
  finishHistory({ sessions: [{ id: 'test-1' }], rackSessions: [{ id: 'old-1' }] });
  await new Promise(setImmediate);
  assert.strictEqual(state.sessions.length, 1);
  assert.strictEqual(state.rackSessions.length, 2, 'new active rack remains available when history arrives');
  assert.strictEqual(tabs.history.disabled, false);
  assert.deepStrictEqual(renders, { history: 0, sessions: 0, leaderboard: 0, progression: 0 }, 'hidden history views are not rendered during page load');
  console.log('Power Trak staged load tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
