const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('dashboard.html', 'utf8');
let refreshes = 0;
let detailRemoved = false;
let replaced = '';
const summary = {
  getAttribute: () => 'athlete-a',
  nextElementSibling: {
    classList: { contains: value => value === 'training-detail-row' },
    remove: () => { detailRemoved = true; }
  },
  set outerHTML(value) { replaced = value; }
};
const context = {
  trainingAthletePages: {},
  trainingWorkoutPageSize: 25,
  visibleTrainingAthleteGroups: [],
  els: { recentTrainingRows: { querySelectorAll: () => [summary] } },
  esc: value => String(value).replace(/"/g, '&quot;'),
  trainingGroupHtml: group => '<tr>' + group.key + '</tr>',
  refreshTableScrollbars: () => { refreshes++; },
  renderRows: () => { throw new Error('Expansion must not rebuild the dashboard'); }
};
vm.createContext(context);
for (const name of ['trainingWorkoutPage', 'trainingWorkoutPaginationHtml', 'renderTrainingAthleteGroup']) {
  const start = html.indexOf('function ' + name + '(');
  const end = html.indexOf('\nfunction ', start + 1);
  vm.runInContext(html.slice(start, end), context);
}
const group = { key: 'athlete-a', rows: Array.from({ length: 10003 }, (_, id) => ({ id })) };
context.visibleTrainingAthleteGroups = [group];
let page = context.trainingWorkoutPage(group);
assert.strictEqual(page.rows.length, 25);
assert.strictEqual(page.rows[0].id, 0);
assert.strictEqual(page.total, 10003);
context.trainingAthletePages[group.key] = 1;
page = context.trainingWorkoutPage(group);
assert.strictEqual(page.rows[0].id, 25);
assert.ok(context.trainingWorkoutPaginationHtml(group, page).includes('26-50 of 10003 entries'));
context.trainingAthletePages[group.key] = 9999;
page = context.trainingWorkoutPage(group);
assert.strictEqual(page.rows.length, 3);
assert.strictEqual(page.rows[0].id, 10000);
assert.ok(context.trainingWorkoutPaginationHtml(group, page).includes('data-page="401" disabled'));
group.rows = group.rows.slice(0, 2);
page = context.trainingWorkoutPage(group);
assert.strictEqual(page.page, 0);
assert.strictEqual(context.trainingWorkoutPaginationHtml(group, page), '');
context.renderTrainingAthleteGroup(group.key);
assert.strictEqual(detailRemoved, true);
assert.strictEqual(replaced, '<tr>athlete-a</tr>');
assert.strictEqual(refreshes, 1);
context.renderTrainingAthleteGroup('missing');
assert.strictEqual(refreshes, 1);
console.log('Dashboard training expansion and bounded history tests passed.');
