const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const page = fs.readFileSync("power-trak.html", "utf8");
const start = page.indexOf("function leaderboardUnitKind(unit)");
const end = page.indexOf("function leaderboardCandidates()", start);
assert(start >= 0 && end > start, "leaderboard result helpers should be present");

const context = {
  norm: (value) => String(value || "").trim().toLowerCase(),
  rackResultReps: (result) => Number(result.actualReps) || 1,
  state: {
    rackSessions: [{
      id: "power_import_123",
      date: "2024-08-06",
      workoutName: "Imported Power Data",
      rackName: "Imported Report 1",
      athletes: [{
        id: "athlete-1",
        name: "Campbell Laible",
        results: [
          { exerciseName: "Barbell Bench Press", actualValue: "185", unit: "lb", round: 1, rep: 1 },
          { exerciseName: "Barbell Bench Press", actualValue: "195", unit: "lb", round: 2, rep: 1 },
          { exerciseName: "Barbell Bench Press", actualValue: "195", unit: "lb", round: 2, rep: 2 },
          { exerciseName: "Barbell Bench Press 1RM", actualValue: "224", unit: "lb", round: 3, rep: 1 },
          { exerciseName: "Barbell Bench Press Volume Load", actualValue: "575", unit: "lb", round: 4, rep: 1 },
        ],
      }],
    }],
  },
};
vm.createContext(context);
vm.runInContext(page.slice(start, end), context);
const rows = context.leaderboardSetResults();
assert.strictEqual(rows.length, 3, "volume load must stay out of rankings");
const estimate = rows.find((row) => row.estimatedMax);
assert(estimate, "Highest Max should be available as an estimated 1RM");
assert.strictEqual(estimate.exercise, "Barbell Bench Press");
assert.strictEqual(estimate.value, 224);
assert.strictEqual(rows.find((row) => !row.estimatedMax && row.reps === 1).value, 185);
assert.strictEqual(rows.find((row) => !row.estimatedMax && row.reps === 2).value, 195);

const elements = Object.fromEntries([
  "powerLeaderboardTitle", "powerLeaderboardReps", "powerLeaderboardSearch",
].map((id) => [id, { value: "", innerHTML: "", textContent: "" }]));
context.document = {
  getElementById: (id) => elements[id],
  querySelectorAll: () => [],
};
context.els = Object.fromEntries([
  "powerLeaderboardExercise", "powerLeaderboardUnit", "powerLeaderboardYear",
  "powerLeaderboardLimit", "powerLeaderboardCount", "powerLeaderboardRows",
].map((id) => [id, { value: "", innerHTML: "", textContent: "" }]));
context.els.powerLeaderboardLimit.value = "25";
context.athleteKey = context.norm;
context.esc = String;
context.formatDate = String;
vm.runInContext(page.slice(end, page.indexOf("function powerProgressionChart(", end)), context);
context.approvedLeaderboardExercises = [{ exercise: "Barbell Bench Press", board: "strength" }];
context.leaderboardBoard = "strength";
context.renderPowerLeaderboard();
assert.strictEqual(elements.powerLeaderboardReps.value, "estimated");
assert(context.els.powerLeaderboardRows.innerHTML.includes("224 lb"));
assert(!context.els.powerLeaderboardRows.innerHTML.includes("185 lb"));
elements.powerLeaderboardReps.value = "1";
context.renderPowerLeaderboard();
assert(context.els.powerLeaderboardRows.innerHTML.includes("185 lb"));
assert(!context.els.powerLeaderboardRows.innerHTML.includes("224 lb"));
console.log("Power Trak estimated 1RM leaderboard tests passed");
