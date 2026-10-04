const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

function loadFunctions(context, html, names) {
  vm.createContext(context);
  for (const name of names) {
    const start = html.indexOf('function ' + name + '(');
    const end = html.indexOf('\nfunction ', start + 1);
    assert.ok(start >= 0 && end > start, name);
    vm.runInContext(html.slice(start, end), context);
  }
}

const calendar = fs.readFileSync('training-calendar.html', 'utf8');
const volume = {};
loadFunctions(volume, calendar, ['formatMiles']);
for (const miles of [1, 5, 10, 20, 30, 100, 10.5, 12.25, 0.1]) {
  assert.strictEqual(volume.formatMiles(miles), miles + ' mi');
}
assert.strictEqual(volume.formatMiles(10.126), '10.13 mi');
assert.strictEqual(volume.formatMiles(0), '');
const builder = {
  addDayMode: 'easy',
  els: {
    addDayDetails: { value: '' }, addDayTitleInput: { value: '' },
    addDayWorkoutType: { value: '' },
    addDayVolumeField: { hidden: true }, addDayVolume: { value: '' },
    addDayTargetField: { hidden: true }, addDayTarget: { value: '' },
    addEasyDistance: { value: '10' }, addEasyUnit: { value: 'mi' },
    easyStridesFields: { hidden: true },
  },
  distanceText: (value, unit) => value + ' ' + unit,
  defaultEasyRunTarget: () => 'Conversational',
};
loadFunctions(builder, calendar, ['unitMiles', 'formatMiles', 'buildAddDayActivityValues']);
assert.strictEqual(builder.buildAddDayActivityValues().plannedVolume, '10 mi');
assert.strictEqual(builder.buildAddDayActivityValues().details, '10 mi easy');
builder.els.addEasyDistance.value = '20';
assert.strictEqual(builder.buildAddDayActivityValues().plannedVolume, '20 mi');

const html = fs.readFileSync('index.html', 'utf8');
const values = new Map([
  ['sc_account', 'western'],
  ['sc1_western', '[{"name":"jet"}]'],
  ['sc_access_western', 'western-code'],
]);
const storage = {
  getItem: key => values.has(key) ? values.get(key) : null,
  setItem: (key, value) => values.set(key, String(value)),
};
let redirected = '';
const inputs = {
  'account-key': { value: 'mustang' },
  'access-code': { value: 'mustang-code' },
};
const context = {
  APP_ACCOUNT_KEY: null, URL, URLSearchParams, localStorage: storage,
  window: { location: {
    search: '?account=western', href: 'https://app.smartcoach-pro.com/?account=western',
    replace: value => { redirected = value; },
  } },
  document: { getElementById: id => inputs[id] || null, cookie: '' },
};
const functions = ['cleanAccountKey', 'setSmartCoachAccountKey', 'smartCoachAccountKey',
  'accountStorageSuffix', 'accountStorageKey', 'getAccountStorage', 'setAccountStorage',
  'accountCookieNameFor', 'writeSmartCoachCookie', 'saveAccountSettings'];
loadFunctions(context, html, functions);
assert.strictEqual(context.smartCoachAccountKey(), 'western');
context.saveAccountSettings();
assert.strictEqual(redirected, '/?account=mustang');
assert.strictEqual(values.get('sc_account'), 'mustang');
assert.strictEqual(values.get('sc_access_mustang'), 'mustang-code');
assert.strictEqual(values.get('sc_access_western'), 'western-code');
assert.strictEqual(values.get('sc1_western'), '[{"name":"jet"}]');
assert.strictEqual(values.has('sc1_mustang'), false);
assert.match(context.document.cookie, /^sc_access_mustang=mustang-code;/);
// Old callbacks must retain their account even after another tab changes selection.
assert.strictEqual(context.smartCoachAccountKey(), 'western');
context.setAccountStorage('sc1', '[{"name":"jet updated"}]');
assert.strictEqual(values.has('sc1_mustang'), false);

const fresh = {
  ...context, APP_ACCOUNT_KEY: null,
  window: { location: { search: '?account=mustang' } },
};
loadFunctions(fresh, html, functions.slice(0, 8));
assert.strictEqual(fresh.smartCoachAccountKey(), 'mustang');
assert.strictEqual(fresh.getAccountStorage('sc1'), null);
fresh.setAccountStorage('sc1', '[{"name":"horsee"}]');
assert.strictEqual(values.get('sc1_western'), '[{"name":"jet updated"}]');
assert.strictEqual(fresh.getAccountStorage('sc1'), '[{"name":"horsee"}]');
console.log('Calendar mileage formatting and isolated account-switch tests passed.');
