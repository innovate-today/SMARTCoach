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
  "keep-trak.html",
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
    "function canonicalSport(value)",
    "if(explicit==='Cross Country'||explicit==='Track')return explicit;",
    "meetResults=normalizeMeetHistoryRows",
  ];
  required.forEach((text) => {
    if (!html.includes(text)) throw new Error(`Meet History sport toolbar filter missing ${text}`);
  });
  console.log("Meet History sport toolbar filter ok");
}

function checkMeetHistoryMeetListChronological() {
  const html = fs.readFileSync("meet-history.html", "utf8");
  const required = [
    "function meetDateSortValue(value)",
    "return isNaN(date.getTime()) ? Number.MAX_SAFE_INTEGER : date.getTime();",
    "return meetDateSortValue(a.date)-meetDateSortValue(b.date) || String(a.name||'').localeCompare(String(b.name||''));",
  ];
  required.forEach((text) => {
    if (!html.includes(text)) throw new Error(`Meet History chronological meet sort missing ${text}`);
  });
  console.log("Meet History chronological meet list ok");
}

function checkMeetHistoryPerformanceCaches() {
  const html = fs.readFileSync("meet-history.html", "utf8");
  const required = [
    "var meetGroupCache=null;",
    "var priorResultCache=null;",
    "function invalidateMeetHistoryCache()",
    "if(meetGroupCache)return meetGroupCache;",
    "priorResultCache=buildPriorResultCache();",
    "function buildPriorResultCache()",
    "if(row&&row._searchText)return row._searchText;",
    "var filteredGroupsCache=null;",
    "if(filteredGroupsCache&&filteredGroupsCacheKey===cacheKey)return filteredGroupsCache;",
    "row._resultMs=parseResultMs(row.resultDisplay);",
    "return (Array.isArray(rows)?rows:[]).map(function(row){return enrichMeetHistoryRow(row);});",
    "searchRenderTimer=setTimeout(render,120);",
    "invalidateMeetHistoryCache();",
  ];
  required.forEach((text) => {
    if (!html.includes(text)) throw new Error(`Meet History performance cache missing ${text}`);
  });
  console.log("Meet History performance cache ok");
}

function checkPageSearchDebounces() {
  const pages = [
    ["records.html", "els.search.addEventListener('input',scheduleSearchRender);", "searchRenderTimer=setTimeout(render,120);"],
    ["attendance.html", "els.search.addEventListener('input',scheduleSearchRender);", "searchRenderTimer=setTimeout(render,120);"],
    ["dashboard.html", "els.search.addEventListener('input',scheduleRowsRender);", "searchRenderTimer=setTimeout(renderRows,120);"],
    ["training-calendar.html", "els.search.addEventListener('input',scheduleSearchRender);", "searchRenderTimer=setTimeout(render,120);"],
    ["athletes.html", "els.equipmentLookupSearch.addEventListener('input',scheduleEquipmentLookupRender);", "equipmentLookupTimer=setTimeout(renderEquipmentLookup,120);"],
  ];
  pages.forEach(([file, listener, timer]) => {
    const html = fs.readFileSync(file, "utf8");
    if (!html.includes(listener)) throw new Error(`${file} heavy search listener is not debounced`);
    if (!html.includes(timer)) throw new Error(`${file} heavy search timer is missing`);
  });
  const records = fs.readFileSync("records.html", "utf8");
  if (!records.includes("function filteredRecords(currentKeys)")) {
    throw new Error("records current-record status should reuse the render currentKeys map.");
  }
  console.log("page search debounce checks ok");
}

function checkFieldNoMarkResultsAllowed() {
  const mobile = fs.readFileSync("index.html", "utf8");
  const dashboard = fs.readFileSync("dashboard.html", "utf8");
  const calendar = fs.readFileSync("training-calendar.html", "utf8");
  const api = fs.readFileSync("api/ghl/meet-result.js", "utf8");
  const requiredMobile = [
    "function fieldNoMarkResult(eventName)",
    "function fieldAttemptHasLegalMark(attempt)",
    "item.resultDisplay=fieldNoMarkResult(event.eventName);",
    "fieldAttemptsShowNoLegalMark(eventName,attempts)",
  ];
  requiredMobile.forEach((text) => {
    if (!mobile.includes(text)) throw new Error(`mobile field no-mark support missing ${text}`);
  });
  [dashboard, calendar].forEach((html, index) => {
    const file = index === 0 ? "dashboard.html" : "training-calendar.html";
    if (!html.includes("function fieldNoMarkResult(eventName)")) throw new Error(`${file} no-mark helper missing`);
    if (!html.includes("fieldAttemptsShowNoLegalMark(eventName,fieldAttempts)")) throw new Error(`${file} no-mark attempts fallback missing`);
  });
  const requiredApi = [
    "fieldAttemptsShowNoLegalMark(payload.event, fieldAttempts) ? fieldNoMarkResult(payload.event) : \"\"",
    "function fieldNoMarkResult(eventName)",
    "function fieldAttemptsShowNoLegalMark(eventName, text)",
  ];
  requiredApi.forEach((text) => {
    if (!api.includes(text)) throw new Error(`API field no-mark support missing ${text}`);
  });
  console.log("field no-mark result support ok");
}

function checkKeepTrakFeature() {
  const mobile = fs.readFileSync("index.html", "utf8");
  const desktop = fs.readFileSync("keep-trak.html", "utf8");
  const dashboard = fs.readFileSync("dashboard.html", "utf8");
  const calendar = fs.readFileSync("training-calendar.html", "utf8");
  const api = fs.readFileSync("api/smart-trak/[route].js", "utf8");
  const registry = fs.readFileSync("lib/account-registry.js", "utf8");
  [
    "id=\"m-keep-trak\"",
    "function openKeepTrak()",
    "function loadKeepTrak()",
    "function toggleKeepTrakNote(id,completed)",
    "function addKeepTrakBullet()",
    "function setKeepTrakDay(offset)",
    "Yesterday",
    "Tomorrow",
    "Add Bullet",
    "keep-compose-actions",
    "keep-complete",
    "keep-reopen",
  ].forEach((text) => {
    if (!mobile.includes(text)) throw new Error(`mobile Keep Trak missing ${text}`);
  });
  [
    "/api/smart-trak/keep-trak",
    "function deleteNote(id)",
    "Open notes from earlier days carry forward until completed.",
    ".top{position:sticky",
    "maxlength=\"4000\"",
    "charCount",
    "id=\"cleanupPanel\"",
    "function cleanupCutoffDate()",
    "return addDays(todayISO(),-30);",
    "function deleteSelectedCleanupNotes()",
    "Delete Selected",
    "id=\"confirmOverlay\"",
    "function openConfirm(title,message,okLabel,onConfirm)",
    "Delete Keep Trak note?",
    "id=\"bulletBtn\"",
    "function addBriefingBullet()",
    "id=\"dayRail\"",
    "function renderDayRail()",
    "id=\"noteFormPanel\"",
    "id=\"addNoteBtn\"",
  ].forEach((text) => {
    if (!desktop.includes(text)) throw new Error(`desktop Keep Trak missing ${text}`);
  });
  if (desktop.includes("confirm(")) throw new Error("desktop Keep Trak should use the in-page confirmation dialog.");
  if (desktop.includes("titleInput")) throw new Error("desktop Keep Trak should not show a title field.");
  if (!mobile.includes("id=\"keep-body\" maxlength=\"4000\"")) throw new Error("mobile Keep Trak note limit missing.");
  if (!dashboard.includes("keepTrakLink") || !calendar.includes("keepTrakLink")) {
    throw new Error("Keep Trak coach navigation link missing.");
  }
  [
    'route === "keep-trak"',
    "function accountKeepTrak",
    "saveKeepTrakNotes",
    "loadKeepTrakNotes",
  ].forEach((text) => {
    if (!api.includes(text) && !registry.includes(text)) throw new Error(`Keep Trak backend missing ${text}`);
  });
  if (!registry.includes(".slice(-1500)")) throw new Error("Keep Trak registry storage must stay capped.");
  console.log("Keep Trak feature ok");
}

function checkAttendanceCheckpointMarkAll() {
  const mobile = fs.readFileSync("index.html", "utf8");
  [
    "function attendanceMarkCheckpointAll(cpIndex,status)",
    "attendanceMarkCheckpointAll('+cpIndex+'",
    "att-head-actions",
    "Mark All Present",
    "#m-attendance .att-head{background:#050505",
    "#m-attendance .att-head .att-name,#m-attendance .att-head .att-small{color:#fff}",
    "#m-attendance .att-athlete{font-size:15px;font-weight:900;color:#111827;background:#e5e7eb",
  ].forEach((text) => {
    if (!mobile.includes(text)) throw new Error(`checkpoint Mark All Present missing ${text}`);
  });
  if (mobile.includes("onclick=\"attendanceMarkAll('present')\"")) {
    throw new Error("Attendance should not use one global Mark All Present button.");
  }
  console.log("attendance checkpoint Mark All Present ok");
}

function checkGroupsTrayAddHidden() {
  const mobile = fs.readFileSync("index.html", "utf8");
  if (!mobile.includes('id="groups-tray-add-btn" onclick="addGroupForView()" hidden')) {
    throw new Error("Groups tray Add button should be hidden because top Add is available.");
  }
  if (!mobile.includes("if(buttons.add)buttons.add.hidden=true;")) {
    throw new Error("Groups tray Add button should stay hidden when tray actions refresh.");
  }
  if (!mobile.includes("id=\"groups-tray-archive-btn\"")) {
    throw new Error("Groups tray Archive button should remain available.");
  }
  console.log("Groups tray Add hidden ok");
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
    "function inferredSeasonText(row)",
    "var season=values.season||importSeasonForDate(meetDate)||els.importDefaultSeason.value;",
    "row._seasonText=inferredSeasonText(row);",
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
checkMeetHistoryMeetListChronological();
checkMeetHistoryPerformanceCaches();
checkPageSearchDebounces();
checkFieldNoMarkResultsAllowed();
checkKeepTrakFeature();
checkAttendanceCheckpointMarkAll();
checkGroupsTrayAddHidden();
checkHistoricalMeetResultsLoadUnmatched();
checkMeetHistoryUnlistedSeasonYearFallback();
checkAthleticEventRecordsCalendarRanges();

console.log("SMARTCoach regression checks passed");
