const fs = require("fs");
const { spawnSync } = require("child_process");

const htmlFiles = [
  "index.html",
  "dashboard.html",
  "athletes.html",
  "training-calendar.html",
  "plan-setup.html",
  "plan-import.html",
  "plan-builder.html",
  "meet-history.html",
  "records.html",
  "track-simulator.html",
  "xc-simulator.html",
  "weather.html",
  "athlete-calendar.html",
  "account-access.html",
  "onboarding.html",
  "live-launch-validation.html",
  "sales.html",
];
const jsonFiles = [
  "package.json",
  "vercel.json",
  "smart_trak_field_schema.json",
  "smart_trak_object_mapping.json",
];

function run(label, command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${label} failed.`);
  }
}

function jsFilesUnder(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return jsFilesUnder(path);
    return entry.isFile() && entry.name.endsWith(".js") ? [path] : [];
  });
}

function checkPageScripts() {
  htmlFiles.forEach((file) => {
    if (!fs.existsSync(file)) return;
    const html = fs.readFileSync(file, "utf8");
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
    scripts.forEach((script) => new Function(script));
    console.log(`${file} scripts ok`);
  });
}

function checkJsonFiles() {
  jsonFiles.forEach((file) => {
    if (!fs.existsSync(file)) return;
    JSON.parse(fs.readFileSync(file, "utf8"));
    console.log(`${file} json ok`);
  });
}

function checkLiveValidationPage() {
  const html = fs.readFileSync("live-launch-validation.html", "utf8");
  const requiredPageLinks = [
    "/dashboard.html",
    "/athletes.html",
    "/training-calendar.html",
    "/plan-setup.html",
    "/plan-import.html",
    "/plan-builder.html",
    "/meet-history.html",
    "/records.html",
    "/track-simulator.html",
    "/xc-simulator.html",
  ];
  const requiredText = [
    "Open Setup",
    "Open Stopwatch",
    "Account Status",
    "Copy Validation Link",
    "Copy Summary",
    "Coach Page Links",
  ];
  requiredPageLinks.forEach((path) => {
    if (!html.includes(`data-page-link="${path}"`)) {
      throw new Error(`live launch validation page missing ${path}`);
    }
  });
  requiredText.forEach((text) => {
    if (!html.includes(text)) {
      throw new Error(`live launch validation page missing ${text}`);
    }
  });
  console.log("live launch validation links ok");
}

function checkStandaloneRaceResultSaveScope() {
  const html = fs.readFileSync("dashboard.html", "utf8");
  if (!html.includes("var savedPayload=null;")) {
    throw new Error("dashboard standalone race result save must keep the updated payload across promise steps.");
  }
  if (!html.includes("applyRaceResultLocally(savedPayload||payload")) {
    throw new Error("dashboard standalone race result save must apply the saved payload locally.");
  }
  console.log("standalone race result save scope ok");
}

function checkMeetHistorySportToolbarFilter() {
  const html = fs.readFileSync("meet-history.html", "utf8");
  const bar = html.match(/<section class="bar">([\s\S]*?)<\/section>/);
  if (!bar || !bar[1].includes('id="sportFilter"')) {
    throw new Error("Meet History sport filter must be in the top filter bar.");
  }
  const required = [
    "sportFilter:document.getElementById('sportFilter')",
    "els.sportFilter.addEventListener('change',render)",
    "if(sport!=='all'&&sportText(row)!==sport)return false;",
    "els.sportFilter.value='all';",
  ];
  required.forEach((text) => {
    if (!html.includes(text)) throw new Error(`Meet History sport toolbar filter missing ${text}`);
  });
  console.log("Meet History sport toolbar filter ok");
}

function stubElement(value = "") {
  return {
    value,
    textContent: "",
    innerHTML: "",
    hidden: false,
    disabled: false,
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    appendChild() {},
    setAttribute() {},
    addEventListener() {},
    removeEventListener() {},
    querySelectorAll() { return []; },
    querySelector() { return null; },
  };
}

function checkAthleticEventRecordsCalendarRanges() {
  const html = fs.readFileSync("meet-history.html", "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\ninit\(\);\s*$/, "");
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
  const elements = {};
  ids.forEach((id) => { elements[id] = stubElement(); });
  elements.importDefaultYear.value = "2026";
  elements.importDefaultSeason.value = "Spring";
  elements.importDefaultGender.value = "Boys";
  elements.importDefaultSport.value = "Track";
  elements.importDefaultEvent.value = "100m";

  const runner = new Function("document", "window", "navigator", "fetch", "alert", "confirm", "URL", "URLSearchParams", `${script}
const sample = \`2026 Event Records
Mens
100 Meters
1. 12 11 John Doe 10.99 PB Apr 30 Spartan...
Season Calendar
Apr 30-May 1
Spartan Invitational at Valley High School\`;
return parseAthleticNetRows(sample);`);
  const doc = {
    body: stubElement(),
    getElementById(id) { return elements[id] || stubElement(); },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    addEventListener() {},
    createElement() { return stubElement(); },
  };
  const rows = runner(doc, {
    location: { search: "", href: "https://app.smartcoach-pro.com/meet-history.html", origin: "https://app.smartcoach-pro.com" },
    addEventListener() {},
    localStorage: { getItem() {}, setItem() {}, removeItem() {} },
  }, { clipboard: null }, () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }), () => {}, () => true, URL, URLSearchParams);
  if (!rows.length || rows[0].meetName !== "Spartan Invitational at Valley High School") {
    throw new Error("Athletic.net Event Records import must repair compact multi-day calendar meet names.");
  }
  console.log("Athletic.net compact calendar range import ok");
}

run("automation API regression tests", "node", ["tests/automation-api.test.js"]);
run("account/security regression tests", "node", ["tests/ghl-account.test.js"]);
run("account registry regression tests", "node", ["tests/account-registry.test.js"]);
run("security header regression tests", "node", ["tests/security-headers.test.js"]);
jsFilesUnder("api").concat(jsFilesUnder("lib"), jsFilesUnder("tests")).forEach((file) => {
  run(`${file} syntax`, "node", ["-c", file]);
});
checkJsonFiles();
checkPageScripts();
checkLiveValidationPage();
checkStandaloneRaceResultSaveScope();
checkMeetHistorySportToolbarFilter();
checkAthleticEventRecordsCalendarRanges();

console.log("SMARTCoach regression checks passed");
