const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('dashboard.html', 'utf8');
const context = { recentTrainingRows: [], recentMeetRows: [], sameAthlete: (a,b) => !!a.contactId && a.contactId === b.contactId, trainingGroups: [
  { name: 'Distance', season: 'Cross Country' },
  { name: 'Old Distance', season: 'Cross Country', archived: true }
] };
vm.createContext(context);
for (const name of ['normalizeDashboardSport', 'athleteIsXcRunner', 'distanceMeetEvent', 'athleteIsDistanceRunner']) {
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
assert.strictEqual(context.athleteIsDistanceRunner({groups:['Track Team'],latestMeet:{event:'1600m'}}),true);
assert.strictEqual(context.athleteIsDistanceRunner({groups:['Middle Distance']}),true);
assert.strictEqual(context.athleteIsDistanceRunner({groups:['Sprints'],latestMeet:{event:'100m'}}),false);
assert.strictEqual(context.athleteIsDistanceRunner({groups:['Throws'],latestMeet:{event:'Discus'}}),false);
context.recentMeetRows=[{contactId:'distance-runner',event:'3200m'}];
assert.strictEqual(context.athleteIsDistanceRunner({contactId:'distance-runner'}),true);
assert.ok(html.includes("(athleteIsDistanceRunner(row)?'<button"));
assert.ok(html.includes("button.hasAttribute('data-athlete-bests')||!athleteIsDistanceRunner(athlete)"));
console.log('Dashboard Distance Details visibility tests passed.');
