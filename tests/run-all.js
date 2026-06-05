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

function checkDashboardActivityRangeLayout() {
  const html = fs.readFileSync("dashboard.html", "utf8");
  const required = [
    ".range-stat{display:grid;grid-template-columns:minmax(0,1fr)",
    ".range-controls{display:grid;gap:7px;justify-items:stretch;width:100%}",
    ".range-custom{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr)",
    ".range-custom input{width:100%;min-width:0",
  ];
  required.forEach((text) => {
    if (!html.includes(text)) throw new Error(`dashboard activity range layout missing ${text}`);
  });
  console.log("dashboard activity range layout ok");
}

function checkMeetManagerSportField() {
  const html = fs.readFileSync("dashboard.html", "utf8");
  const api = fs.readFileSync("api/ghl/meets.js", "utf8");
  const requiredHtml = [
    'id="meetManagerSport"',
    "meetManagerSport:document.getElementById('meetManagerSport')",
    "setSelectValue(els.meetManagerSport,'Track')",
    "setSelectValue(els.meetManagerSport,meet.sport||'Track')",
    "sport:els.meetManagerSport.value",
    "sport:payload.sport",
  ];
  const requiredApi = [
    "const sport = clean(payload && payload.sport) || \"Track\";",
    "sport: sport || existing.sport,",
    "sport,",
    "const sport = labelValue(row.sport) || \"Track\";",
  ];
  requiredHtml.forEach((text) => {
    if (!html.includes(text)) throw new Error(`Meet Manager sport field missing ${text}`);
  });
  requiredApi.forEach((text) => {
    if (!api.includes(text)) throw new Error(`Meets API sport persistence missing ${text}`);
  });
  console.log("Meet Manager sport field ok");
}

function checkWeatherLocationSaveFallback() {
  const html = fs.readFileSync("weather.html", "utf8");
  const route = fs.readFileSync("api/smart-trak/[route].js", "utf8");
  const requiredHtml = [
    "'X-SMARTCoach-Account':accountKey()",
    "Location saved on this device.",
    "Location removed on this device.",
  ];
  const forbiddenHtml = [
    "Account save failed",
  ];
  const requiredRoute = [
    "saved: false, warning: \"Account registry record was not found.\"",
    "saved: true, locations: weatherLocations",
    "Weather locations could not be saved to the account.",
  ];
  requiredHtml.forEach((text) => {
    if (!html.includes(text)) throw new Error(`weather local-save fallback missing ${text}`);
  });
  forbiddenHtml.forEach((text) => {
    if (html.includes(text)) throw new Error(`weather page should not show ${text}`);
  });
  requiredRoute.forEach((text) => {
    if (!route.includes(text)) throw new Error(`weather account-save fallback missing ${text}`);
  });
  console.log("weather location save fallback ok");
}

function checkTrainingCalendarQualityEditParsing() {
  const html = fs.readFileSync("training-calendar.html", "utf8");
  const required = [
    "function parseQualityDistanceLine(line)",
    "function hydrateQualityBuilderFromDay(day)",
    "hydrateQualityBuilderFromDay(calendarEditDay);",
    "distanceValue:match[3],",
    "distanceUnit:normalizeQualityDistanceUnit(match[4]),",
    "effort:String(match[5]||'Threshold').trim(),",
    "recoveryUnit:normalizeQualityRecoveryUnit(recovery&&recovery[2]||'min (jog)')",
    "if(/^mi\\b|^mile/.test(value))return 'mi ('+movement+')';",
  ];
  required.forEach((text) => {
    if (!html.includes(text)) throw new Error(`Training Calendar quality edit parser missing ${text}`);
  });
  console.log("Training Calendar quality edit parser ok");
}

function checkDashboardPlainLapSplitsStayLaps() {
  const html = fs.readFileSync("dashboard.html", "utf8");
  const api = fs.readFileSync("api/ghl/dashboard.js", "utf8");
  const required = [
    "function hasRepRestPattern(row)",
    "if(!hasRepRestPattern(row)||splits.length<2)return 'lap';",
    "return /\\b\\d+(?:\\s*[-–]\\s*\\d+)?\\s*(?:x|×)\\s*\\d/.test(text) && /(recover|recovery|rest|jog|walk)/.test(text);",
  ];
  const requiredApi = [
    "function hasRepRestPattern(row)",
    'if (!hasRepRestPattern(row) || splits.length < 2) return "lap";',
    "return /\\b\\d+(?:\\s*[-–]\\s*\\d+)?\\s*(?:x|×)\\s*\\d/.test(text) && /(recover|recovery|rest|jog|walk)/.test(text);",
  ];
  required.forEach((text) => {
    if (!html.includes(text)) throw new Error(`dashboard plain lap split guard missing ${text}`);
  });
  requiredApi.forEach((text) => {
    if (!api.includes(text)) throw new Error(`dashboard API plain lap split guard missing ${text}`);
  });
  console.log("dashboard plain lap split guard ok");
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

function checkHistoricalMeetResultsLoadUnmatched() {
  const api = fs.readFileSync("api/ghl/dashboard.js", "utf8");
  const required = [
    "isHistoricalMeetResult(result)",
    'resultType).toLowerCase() === "historical import"',
    'startsWith("mhi_")',
    "Athletic\\.net|historical",
  ];
  required.forEach((text) => {
    if (!api.includes(text)) throw new Error(`dashboard must include unmatched historical meet imports: ${text}`);
  });
  console.log("historical meet imports load unmatched ok");
}

function checkMeetHistoryUnlistedSeasonYearFallback() {
  const html = fs.readFileSync("meet-history.html", "utf8");
  const dashboardApi = fs.readFileSync("api/ghl/dashboard.js", "utf8");
  const api = fs.readFileSync("api/ghl/meet-result.js", "utf8");
  const requiredHtml = [
    "if(/^(unlisted|unspecified)$/i.test(season))season='';",
    "if(seasonYear)return seasonYear;",
    "season:result.season||'',seasonYear:result.seasonYear||''",
    "if(season!=='all'&&seasonText(row)!==season&&String(row.seasonYear||'')!==season)return false;",
  ];
  const requiredApi = [
    "const rawSeason = clean(row && row.season);",
    "const season = rawSeason && !/^(unlisted|unspecified)$/i.test(rawSeason) ? rawSeason : String(seasonYear);",
    "seasonYear: Number(props.season_year) || yearFromDateValue(props.meet_date),",
  ];
  const requiredDashboardApi = [
    'season: ["E7WkU0NjC48zZzSNMlMJ"],',
    'season_year: ["jImFId2bLt2Hhox7TTDR"],',
    'season: labelValue(prop(props, "season")) || prop(props, "season"),',
    'seasonYear: Number(prop(props, "season_year")) || yearFromDateValue(prop(props, "meet_date")),',
  ];
  requiredHtml.forEach((text) => {
    if (!html.includes(text)) throw new Error(`Meet History year fallback missing ${text}`);
  });
  requiredApi.forEach((text) => {
    if (!api.includes(text)) throw new Error(`historical import season normalization missing ${text}`);
  });
  requiredDashboardApi.forEach((text) => {
    if (!dashboardApi.includes(text)) throw new Error(`dashboard meet-result season response missing ${text}`);
  });
  console.log("Meet History unlisted season year fallback ok");
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
checkDashboardActivityRangeLayout();
checkMeetManagerSportField();
checkWeatherLocationSaveFallback();
checkTrainingCalendarQualityEditParsing();
checkDashboardPlainLapSplitsStayLaps();
checkMeetHistorySportToolbarFilter();
checkHistoricalMeetResultsLoadUnmatched();
checkMeetHistoryUnlistedSeasonYearFallback();
checkAthleticEventRecordsCalendarRanges();

console.log("SMARTCoach regression checks passed");
