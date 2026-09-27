const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('dashboard.html', 'utf8');
const context = { recentTrainingRows: [], sameAthlete: (a,b) => !!a.contactId && a.contactId === b.contactId, trainingGroups: [
  { name: 'Distance', season: 'Cross Country' },
  { name: 'Old Distance', season: 'Cross Country', archived: true }
] };
vm.createContext(context);
for (const name of ['normalizeDashboardSport', 'athleteIsXcRunner']) {
  const start = html.indexOf('function ' + name + '(');
  const end = html.indexOf('\nfunction ', start + 1);
  vm.runInContext(html.slice(start, end), context);
}
for (const groups of [['CC Team'], ['Group 1-CC'], ['XC', 'Track Team'], ['Distance']]) {
  assert.strictEqual(context.athleteIsXcRunner({ groups }), true);
}
for (const groups of [[], ['Track Team'], ['Sprints'], ['Old Distance']]) {
  assert.strictEqual(context.athleteIsXcRunner({ groups, latestMeet: { sport: 'cross_country' } }), false);
}
assert.strictEqual(context.athleteIsXcRunner({}), false);
assert.strictEqual(context.athleteIsXcRunner({ latestTraining: { groupName: 'Group 2-CC' } }), true);
context.recentTrainingRows = [{ contactId: 'xc-runner', sport: 'Cross Country' }];
assert.strictEqual(context.athleteIsXcRunner({ contactId: 'xc-runner', groups: [] }), true);
assert.strictEqual(context.athleteIsXcRunner({ contactId: 'sprinter', groups: [] }), false);
assert.ok(html.includes("(athleteIsXcRunner(row)?'<button"));
assert.ok(html.includes("button.hasAttribute('data-athlete-bests')||!athleteIsXcRunner(athlete)"));
console.log('Dashboard XC Details visibility tests passed.');
