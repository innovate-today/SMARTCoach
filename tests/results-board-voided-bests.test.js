const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const context = { module: { exports: {} }, require: name => {
  if (name === "crypto") return require("crypto");
  if (name === "../../lib/display-name") return { displayNameCase: value => value };
  return {};
} };
vm.createContext(context);
vm.runInContext(fs.readFileSync("api/ghl/dashboard.js", "utf8")
  + "\nmodule.exports.board = buildResultsBoardRows; module.exports.index = buildDashboardRecordIndex;", context);

function result(id, athlete, event, display, ms, extra = {}) {
  return { id, properties: { athlete_contact: athlete, athlete_name_snapshot: athlete,
    event, result_display: display, result_ms: ms, meet_name: "Real Meet",
    meet_date: "2026-10-08", season_year: 2026, sport: "Cross Country",
    source_record_id: id, ...extra } };
}
function best(athlete, event, source, display, ms, extra = {}) {
  return { id: `best-${athlete}`, properties: { athlete_contact: athlete,
    athlete_name_snapshot: athlete, event, personal_best_source_record_id: source,
    personal_best_display: display, personal_best_ms: ms, ...extra } };
}
const athletes = [{ id: "Michael", name: "Michael" }, { id: "Annie", name: "Annie" }];
const real = [result("real-m", "Michael", "5K", "24:41.48", 1481480),
  result("real-a", "Annie", "2 Mile", "17:26.77", 1046770)];
const voided = [result("test-m", "Michael", "5K", "00:03.9", 3900,
  { coach_race_notes: "SMARTCoach Status: Voided", meet_name: "Test Meet" }),
  result("test-a", "Annie", "2 Mile", "00:04.7", 4700,
    { coach_race_notes: "SMARTCoach Status: Voided", meet_name: "Test Meet" })];
const bestRecords = [best("Michael", "5K", "test-m", "00:03.9", 3900),
  best("Annie", "2 Mile", "test-a", "00:04.7", 4700)];
const before = JSON.stringify({ real, voided, bestRecords });
for (const indexed of [false, true]) {
  const meetRecords = real.concat(voided);
  const index = indexed ? context.module.exports.index({ athletes, meetRecords, bestRecords }) : null;
  const rows = context.module.exports.board({ athletes, meetRecords, bestRecords,
    meetRecordIndex: index && index.meetsByAthlete });
  assert.equal(rows.length, 2, "Voided results stay out of the board");
  assert.equal(rows.find(row => row.contactId === "Michael").bestDisplay, "24:41.48");
  assert.equal(rows.find(row => row.contactId === "Annie").bestDisplay, "17:26.77");
}
assert.equal(JSON.stringify({ real, voided, bestRecords }), before, "Board computation never mutates provider records");
function michaelBest(bestRecord, extraRecords = []) {
  return context.module.exports.board({ athletes, meetRecords: real.concat(voided, extraRecords),
    bestRecords: [bestRecord] }).find(row => row.contactId === "Michael");
}
assert.equal(michaelBest(best("Michael", "5K", "historical-source", "20:00.0", 1200000)).bestDisplay,
  "20:00.0", "Legitimate historical bests absent from fetched results are retained");
const previousValid = result("previous-real", "Michael", "5K", "23:00.0", 1380000);
assert.equal(michaelBest(bestRecords[0], [previousValid]).bestDisplay, "23:00.0",
  "Use the best surviving result, not merely the latest result");
const legacyBest = best("Michael", "5K", "", "00:03.9", 3900,
  { personal_best_date: "2026-10-08", personal_best_meet: "Test Meet" });
assert.equal(michaelBest(legacyBest).bestDisplay, "24:41.48",
  "Legacy bests with matching athlete/event/date/meet/result are excluded");
assert.equal(michaelBest(best("Michael", "5K", "", "00:03.9", 3900)).bestDisplay, "00:03.9",
  "Incomplete evidence must not discard a best solely because the time looks suspicious");
assert.equal(michaelBest({ ...legacyBest, properties: { ...legacyBest.properties,
  personal_best_meet: "Different Meet" } }).bestDisplay, "00:03.9");
assert.equal(michaelBest(best("Michael", "5K", "different-source", "00:03.9", 3900,
  { personal_best_date: "2026-10-08", personal_best_meet: "Test Meet" })).bestDisplay, "00:03.9",
  "Known source IDs take precedence over a coincidentally matching result");
assert.equal(michaelBest(bestRecords[0], [result("test-m", "Other", "5K", "1.0", 1000,
  { coach_race_notes: "SMARTCoach Status: Voided" })]).bestDisplay, "24:41.48");
const sameNameOtherContact = result("test-m", "Other", "5K", "00:03.9", 3900,
  { athlete_name_snapshot: "Michael", coach_race_notes: "SMARTCoach Status: Voided" });
const noOwnVoid = context.module.exports.board({ athletes, meetRecords: real.concat(sameNameOtherContact),
  bestRecords: [bestRecords[0]] }).find(row => row.contactId === "Michael");
assert.equal(noOwnVoid.bestDisplay, "00:03.9", "Another contact with the same name cannot invalidate the best");
const corrected = result("test-m", "Michael", "5K", "25:00.0", 1500000,
  { coach_race_notes: "Correction Date: 2026-10-09" });
assert.equal(context.module.exports.board({ athletes, meetRecords: real.concat(corrected),
  bestRecords: [bestRecords[0]] }).find(row => row.contactId === "Michael").bestDisplay, "24:41.48",
  "Existing edit/correction behavior remains intact");
console.log("Results Board voided-best tests passed");
