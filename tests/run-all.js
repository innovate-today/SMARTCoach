const fs = require("fs");
const { spawnSync } = require("child_process");

const htmlFiles = [
  "index.html",
  "dashboard.html",
  "athletes.html",
  "attendance.html",
  "training-calendar.html",
  "plan-setup.html",
  "plan-import.html",
  "plan-builder.html",
  "meet-history.html",
  "keep-trak.html",
  "field-practice.html",
  "records.html",
  "track-simulator.html",
  "xc-simulator.html",
  "weather.html",
  "miles-board.html",
  "speed-trak.html",
  "speed-board.html",
  "results-board.html",
  "how-to.html",
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

function checkTrainingCalendarButtonLabels() {
  htmlFiles.forEach((file) => {
    if (!fs.existsSync(file)) return;
    const html = fs.readFileSync(file, "utf8");
    const buttonLabels = [...html.matchAll(/<(?:a|button)\b[^>]*(?:linkbtn|button|data-page-link)[^>]*training-calendar\.html[^>]*>([\s\S]*?)<\/(?:a|button)>/gi)];
    buttonLabels.forEach((match) => {
      const label = match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (label === "Training Calendar") {
        throw new Error(`${file} has a Training Calendar button label; use Training.`);
      }
    });
  });
  const onboarding = fs.readFileSync("onboarding.html", "utf8");
  if (onboarding.includes("{label:'Training Calendar',path:'/training-calendar.html'+query}")) {
    throw new Error("onboarding generated Training Calendar button should be labeled Training.");
  }
  console.log("Training Calendar button labels ok");
}

function checkTrainingCalendarMonthView() {
  const html = fs.readFileSync("training-calendar.html", "utf8");
  [
    'id="monthViewBtn"',
    ">Month View<",
    "var calendarMonthStart=startOfMonth(new Date());",
    "function startOfMonth(date)",
    "function endOfMonth(date)",
    "function addMonths(date,monthsToAdd)",
    "function renderMonthView(list)",
    "function monthDayCell(date,items,outside)",
    "function monthItem(day)",
    "function plannedVolumeMiles(day)",
    "viewMode==='month'",
    "Previous Month",
    "Next Month",
    "data-current-month",
    "monthscroll",
  ].forEach((text) => {
    if (!html.includes(text)) {
      throw new Error(`Training Calendar month view missing ${text}`);
    }
  });
  console.log("Training Calendar Month View ok");
}

function checkCurrentFitnessClear() {
  const api = fs.readFileSync("api/ghl/athlete-best.js", "utf8");
  [
    'req.method !== "GET" && req.method !== "POST" && req.method !== "DELETE"',
    "async function deleteAthleteBest",
    'action) === "fitnessRows"',
    "async function listAthleteBestRows",
    "async function searchAthleteBestRecords",
    "async function createObjectRecordWithoutBodyLocation",
    "async function searchAthleteBestRecordsWithoutBodyLocation",
    "async function saveExistingObjectRecordWithoutLocation",
    "async function deleteObjectRecordWithLocationFallback",
    "function objectRecordPath",
    "function isLocationIdBodyError",
    "?locationId=${encodeURIComponent(locationId)}",
    "action: \"deleted\"",
    "action: \"not_found\"",
    "Access-Control-Allow-Methods\", \"GET, POST, DELETE, OPTIONS\"",
  ].forEach((text) => {
    if (!api.includes(text)) throw new Error(`Current fitness clear API missing ${text}`);
  });
  ["plan-setup.html", "plan-builder.html"].forEach((file) => {
    const html = fs.readFileSync(file, "utf8");
    [
      "function clearFitnessRow(index)",
      "class=\"fitness-clear\"",
      "method:'DELETE'",
      "fitnessRowsByAthlete",
      "function groupFitnessRows",
      "function savedFitnessForAthlete",
      "function showFitnessConfirm",
      "No saved current fitness",
      "notifyFitnessChanged();",
    ].forEach((text) => {
      if (!html.includes(text)) throw new Error(`${file} missing current fitness clear control: ${text}`);
    });
    if (html.includes("confirm('Clear ")) throw new Error(`${file} should use the in-page current fitness clear confirmation.`);
  });
  console.log("Current fitness clear controls ok");
}

function checkAccountStatusLocationVerification() {
  const api = fs.readFileSync("api/smart-trak/[route].js", "utf8");
  [
    "expectedLocationId",
    "x-smartcoach-expected-location",
    "locationCheck",
    "matches: !!resolvedLocationId && safeEqual(resolvedLocationId, expectedLocationId)",
    "function maskLocationId(value)",
  ].forEach((text) => {
    if (!api.includes(text)) throw new Error(`account status location verification missing ${text}`);
  });
  console.log("account status location verification ok");
}

function checkOnboardingSubscriberPlanLoad() {
  const html = fs.readFileSync("onboarding.html", "utf8");
  const api = fs.readFileSync("api/smart-trak/[route].js", "utf8");
  const registry = fs.readFileSync("lib/account-registry.js", "utf8");
  [
    "lookupAccount({loadIntoForm:true});",
    "if(options.loadIntoForm){",
    "fillFormFromLookup();",
    "raw==='pro unlimited custom'",
    "proUnlimited:'Pro Unlimited (Custom)'",
    'id="subscriberStatusFilter"',
    "statusFilter==='active'&&account.archived",
    "statusFilter==='archived'&&!account.archived",
    "data-subscriber-archive",
    "function setSubscriberArchive(account,action)",
    "Archive '+account+'? Optional reason:",
    "Restore '+account+' to the active Subscriber Accounts list?",
    "body:JSON.stringify({accountKey:account,action:action,reason:reason})",
  ].forEach((text) => {
    if (!html.includes(text)) throw new Error(`onboarding subscriber plan load missing ${text}`);
  });
  [
    "return accountRegistryUpdate(req, res);",
    "async function accountRegistryUpdate(req, res)",
    'action !== "archive" && action !== "restore"',
    "archivedAt: now",
    "archivedReason: cleanSetupText(payload.reason).slice(0, 240)",
    "restoredAt: now",
  ].forEach((text) => {
    if (!api.includes(text)) throw new Error(`subscriber archive API missing ${text}`);
  });
  if (api.indexOf("return accountRegistryUpdate(req, res);") < api.indexOf("async function accountRegistry(req, res)")) {
    throw new Error("subscriber archive API route is not inside accountRegistry");
  }
  if (api.indexOf("return accountRegistryUpdate(req, res);") > api.indexOf("async function accountRegistryUpdate(req, res)")) {
    throw new Error("subscriber archive API route is after accountRegistryUpdate");
  }
  [
    "archived: !!(source.archived || source.archivedAt)",
    "archivedAt: clean(source.archivedAt)",
    "archivedReason: clean(source.archivedReason)",
  ].forEach((text) => {
    if (!registry.includes(text)) throw new Error(`subscriber archive registry missing ${text}`);
  });
  console.log("onboarding subscriber plan load ok");
}

function checkAdminAccountCleanup() {
  const html = fs.readFileSync("onboarding.html", "utf8");
  const api = fs.readFileSync("api/smart-trak/[route].js", "utf8");
  [
    "Admin Cleanup",
    "cleanupAccountKey",
    "cleanupLocationId",
    "cleanupOptions",
    "function cleanupAccountData()",
    "selectedCleanupOptions()",
    "/api/smart-trak/account-cleanup",
    "X-SMARTCoach-Automation-Secret",
    "Type the same account key in Admin Cleanup before cleaning.",
    "Type the saved Location ID exactly before cleaning.",
    "body:JSON.stringify({accountKey:account,locationId:confirmLocation,cleanupOptions:selectedCleanupOptions()})",
    "It will not change subscription, coach codes, account owner info, athletes, meets, Location ID, or token.",
  ].forEach((text) => {
    if (!html.includes(text)) throw new Error(`admin cleanup UI missing ${text}`);
  });
  [
    'if (route === "account-cleanup")',
    "return accountCleanup(req, res);",
    "async function accountCleanup(req, res)",
    "automationAllowed(req)",
    "Location ID confirmation is required.",
    "Location ID confirmation does not match this account.",
    "safeEqual(expectedLocationId, cleanSetupText(existing.record.locationId))",
    "const ACCOUNT_CLEANUP_OPTIONS",
    "function normalizeAccountCleanupOptions(source)",
    "function cleanupAccountRecord(record, options)",
    "smartcoachGroups",
    "trainingMirror",
    "attendanceMirror",
    "keepTrakNotes",
    "equipmentTrak",
    "docuTrak",
    "partnerTimingSessions",
    "fieldPracticeSessions",
    "milesBoardSharing",
    "dashboardPreferences",
    "weatherLocations",
    "bugTrakReports",
    "lastAdminCleanup",
  ].forEach((text) => {
    if (!api.includes(text)) throw new Error(`admin cleanup API missing ${text}`);
  });
  [
    "coachAccessCodes",
    "accountOwnerEmail",
    "locationId",
    "token",
    "subscription",
  ].forEach((field) => {
    if (api.includes(`delete next.${field}`) || api.includes(`"${field}", "last`)) {
      throw new Error(`admin cleanup should not clear protected account field ${field}`);
    }
  });
  console.log("admin account cleanup ok");
}

function checkAccountOwnerExcludedFromAthletes() {
  const files = [
    "api/ghl/athletes.js",
    "api/ghl/dashboard.js",
    "lib/athlete-calendar.js",
  ];
  files.forEach((file) => {
    const source = fs.readFileSync(file, "utf8");
    if (!source.includes('value === "smartcoach account owner"')) {
      throw new Error(`${file} must exclude smartcoach-account-owner contacts from athlete rosters.`);
    }
    [
      'value === "voice chat"',
      'value === "support"',
      'value === "smartcoach feedback"',
      'value === "smartcoach bug trak"',
      'value === "smartcoach idea trak"',
      'support@smartcoach-pro.com',
      "function isSmartCoachSupportContact(contact)",
    ].forEach((text) => {
      if (!source.includes(text)) throw new Error(`${file} must exclude support/feedback contacts from athlete rosters.`);
    });
    if (!source.includes("function isExcludedSystemContact(tags)")) {
      throw new Error(`${file} missing system contact exclusion helper.`);
    }
  });
  const accountApi = fs.readFileSync("api/smart-trak/[route].js", "utf8");
  if (!accountApi.includes('tags: ["smartcoach-account-owner"]')) {
    throw new Error("account owner recovery contact tag changed; update roster exclusion test.");
  }
  console.log("account owner roster exclusion ok");
}

function checkSmartTrakAthleteCountsIgnoreGhlContacts() {
  const athletes = fs.readFileSync("api/ghl/athletes.js", "utf8");
  const dashboard = fs.readFileSync("api/ghl/dashboard.js", "utf8");
  [
    "const smartcoachRosterMember = !excludedSystemContact && hasAthleteTag;",
    ".filter((athlete) => athlete.smartcoachActive || athlete.smartcoachRosterMember || (includeContacts && athlete.smartcoachSetupCandidate))",
    "const smartcoachActive = smartcoachRosterMember &&",
    "const smartcoachSetupCandidate = !excludedSystemContact && Boolean(contactName(contact)) && Boolean(smartcoachAthleteId || smartcoachActiveValue || hasRosterSetupData);",
  ].forEach((text) => {
    if (!athletes.includes(text)) throw new Error(`athlete API must count only SMART Trak roster athletes: ${text}`);
  });
  [
    "const ATHLETE_FIELD_ALIASES = {",
    "listContactFieldIds({ token, locationId, names: ATHLETE_FIELD_ALIASES.smartcoachActive })",
    "existingCustomFieldValueByIdsOrNames(contact, [SMARTCOACH_ACTIVE_FIELD_ID].concat(options.activeFieldIds || []), ATHLETE_FIELD_ALIASES.smartcoachActive)",
    "const inferredSmartCoachAthlete = hasAthleteTag;",
    "const smartcoachActive = !excludedSystemContact && inferredSmartCoachAthlete &&",
    "smartcoachRosterMember: !excludedSystemContact && inferredSmartCoachAthlete",
    ".filter((athlete) => athlete.smartcoachActive && !athlete.excludedSystemContact)",
  ].forEach((text) => {
    if (!dashboard.includes(text)) throw new Error(`dashboard roster must ignore ordinary GHL contacts: ${text}`);
  });
  console.log("SMART Trak athlete counts ignore GHL contacts ok");
}

function checkInactiveAthletesStayOutOfCurrentViews() {
  const athletes = fs.readFileSync("athletes.html", "utf8");
  const dashboard = fs.readFileSync("api/ghl/dashboard.js", "utf8");
  const planSetup = fs.readFileSync("plan-setup.html", "utf8");
  [
    '<option value="active" selected>Active athletes</option>',
    '<option value="all">All roster entries</option>',
    "if(status==='active'&&!a.smartcoachActive)return false;",
    "if(status==='inactive'&&a.smartcoachActive)return false;",
  ].forEach((text) => {
    if (!athletes.includes(text)) throw new Error(`inactive athletes should be hidden from the default roster view: ${text}`);
  });
  if (!dashboard.includes(".filter((athlete) => athlete.smartcoachActive && !athlete.excludedSystemContact)")) {
    throw new Error("dashboard and Miles Board should only use active SMART Trak athletes.");
  }
  if (dashboard.includes("includeInactive: true")) {
    throw new Error("Miles Board leaderboard should not include inactive SMART Trak athletes.");
  }
  [
    "function activePlanAthletes()",
    "return activePlanAthletes().map(function(athlete)",
    "return activePlanAthletes().filter(function(athlete)",
    "if(!activePlanAthletes().length)",
  ].forEach((text) => {
    if (!planSetup.includes(text)) throw new Error(`plan setup should only show active athletes in current setup lists: ${text}`);
  });
  console.log("inactive athletes stay out of current views ok");
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
    ".stats .loadstrip{margin-bottom:0}",
    ".loadstrip .breakgrid{grid-template-columns:repeat(5,minmax(108px,1fr))}",
    "Training Load Summary",
    'id="plannedVolumeValue"',
    'id="completedVolumeValue"',
    "<span>Planned volume</span>",
    "<span>Completed volume</span>",
    "Avg miles per workout",
    "function sumPlannedTrainingVolume(rows)",
    "function updatePlannedCompletedVolumeCard(trainingRows)",
    'id="rosterAttendanceRate"',
    "<span>Attendance</span>",
    'id="rosterDocuStatus"',
    'id="rosterDocuDetail"',
    "Docu Trak docs",
    "fetch('/api/smart-trak/docu-trak?v='+stamp",
    "function updateDocuStatusCard(rows)",
    "function docuStatusSummary(rows)",
    "summary.missing+' missing'",
    "'Docu Trak · '+summary.complete+'/'+summary.total+' complete'",
    "recentAttendanceRows=result",
    "function attendanceRateText(rows)",
    'placeholder="Search athletes or groups"',
    "Average Volume Per Athlete",
    "function athleteMatchesDashboardSearch(row,query)",
    "row.name,row.smartcoachAthleteId",
    "Array.isArray(row.groups)?row.groups.join(' '):''",
    'id="simulatorBtn"',
    'id="simulatorModal"',
    "function openSimulatorModal()",
    "function closeSimulatorModal()",
    'id="trackSimulatorLink"',
    'id="xcSimulatorLink"',
    "@media(max-width:1180px)",
    ".actions{display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex:1 1 auto;min-width:0}",
    ".action-row,.modal-action-row{display:flex;align-items:center;justify-content:flex-end;gap:6px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:thin;width:100%;max-width:100%}",
    ".actions button,.actions .linkbtn{display:inline-flex;align-items:center;justify-content:center;height:32px;min-height:32px;line-height:1;white-space:nowrap",
    '<div class="dashboard-tools-row"><button id="dashboardPrefsBtn" class="dashboard-prefs-link" type="button" aria-haspopup="dialog">Customize Dashboard</button></div>',
    ".action-row,.modal-action-row{justify-content:flex-start;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:thin}",
    ".actions button,.actions .linkbtn{flex:0 0 auto;white-space:nowrap}",
  ];
  required.forEach((text) => {
    if (!html.includes(text)) throw new Error(`dashboard activity range layout missing ${text}`);
  });
  if (html.includes('id="athleteCount"') || html.includes("<span>Active athletes</span>")) {
    throw new Error("dashboard top summary should show planned/completed volume instead of the old Active athletes card.");
  }
  if (html.includes('id="rosterFitness"') || html.includes('id="rosterMissingFitness"') || html.includes("<span>With fitness</span>") || html.includes("<span>Missing fitness</span>")) {
    throw new Error("dashboard roster summary should show attendance instead of the old fitness summary cards.");
  }
  [
    'id="previousWeekVolume"',
    'id="currentWeekRuns"',
    'id="trainingVolumeCount"',
    'id="trainingMonthVolume"',
    'id="trainingAthletesThisWeek"',
    'id="trainingMissingThisWeek"',
    "<span>Previous week volume</span>",
    "<span>Completed workout entries</span>",
    "<span>Volume miles</span>",
    "<span>This month miles</span>",
    "<span>Athletes completed workouts this week</span>",
    "<span>Athletes without completed workout</span>",
    "<span>Avg per workout</span>",
    "Avg miles per athlete",
  ].forEach((text) => {
    if (html.includes(text)) throw new Error(`dashboard should remove redundant summary card/control: ${text}`);
  });
  if (html.indexOf('id="plannedVolumeValue"') > html.indexOf('id="completedVolumeValue"') || html.indexOf('id="completedVolumeValue"') > html.indexOf('id="trainingSyncCount"')) {
    throw new Error("dashboard Training Load Summary cards should start Planned, Completed, Avg miles per workout.");
  }
  if (!html.includes("completedMiles/trainingRows.length")) {
    throw new Error("dashboard Avg miles per workout card should divide completed volume by completed workout entries.");
  }
  if (html.includes("athleteActivitySearchText") || html.includes("trainingRowMatchesSearch(row,query)") || html.includes("recentTrainingSearchText(row)") || html.includes("rosterGroupSearchTextForTraining")) {
    throw new Error("dashboard search should stay athlete/group-only, not activity/workout/event text.");
  }
  const actionRowMatch = html.match(/<div class="action-row">([\s\S]*?)<\/div>/);
  const actionRowHtml = actionRowMatch ? actionRowMatch[1] : "";
  if (actionRowHtml.includes('id="trackSimulatorLink"') || actionRowHtml.includes('id="xcSimulatorLink"')) {
    throw new Error("dashboard header should use one Simulator button, with Track/XC links inside the chooser modal.");
  }
  if (html.includes(".action-row,.modal-action-row{display:contents}") || html.includes(".action-row,.modal-action-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}")) {
    throw new Error("dashboard header action rows should stay as two compact horizontal rows.");
  }
  const titleRowMatch = html.match(/<div class="title-row">([\s\S]*?)<\/div>/);
  const titleRowHtml = titleRowMatch ? titleRowMatch[1] : "";
  if (titleRowHtml.includes("dashboardPrefsBtn")) {
    throw new Error("Customize Dashboard should sit above Activity Range, not in the dashboard title row.");
  }
  console.log("dashboard activity range layout ok");
}

function checkDashboardFilterContextAndArchivedGroups() {
  const html = fs.readFileSync("dashboard.html", "utf8");
  [
    "var rows=sortRows(dashboardRows.filter(function(row){return matchesAthleteFilter(row,filter)&&athleteMatchesDashboardSearch(row,query);})",
    "var visibleNames=rows.map(function(row){return String(row.name||'').toLowerCase();});",
    "var trainingRows=sortRows(recentTrainingRows.filter(function(row){return matchesSeasonFilter(row,'training')&&matchesActivityRange(row,'training')&&matchesTrainingFilter(row,filter,visibleNames)&&(!query||visibleNames.indexOf(String(row.athleteName||'').toLowerCase())>=0);})",
    "var completedRows=completedVolumeRows(trainingRows,meetRows);",
    "var volumeRows=sortRows(groupVolumeByAthlete(completedRows),tableSorts.volume,volumeSortValue);",
    "updateBreakdowns(rows,meetRows,trainingRows,completedRows);",
    "els.volumeSummary.innerHTML=volumeSummaryHtml(volumeRows);",
    "els.status.textContent=formatDashboardVolume(sumTrainingVolume(completedRows))+' volume · '+rows.length+' athletes · '+trainingRows.length+' workouts · '+seasonRangeLabel()+' · '+activityRangeLabel();",
    "if(displayableTrainingGroupName(row.groupName)&&groups[key].groups.indexOf(row.groupName)<0)groups[key].groups.push(row.groupName);",
    "return !isArchivedTrainingGroupName(text);",
    "return String(group&&group.name||'').trim().toLowerCase()===text && !!group.archived;",
    "if(!group||!group.name||group.archived||group.type==='meet')return false;",
    "function seasonKeyForRow(row,type)",
    "function sportSeasonKey(row,type)",
    "function normalizeDashboardSport(value)",
    "if(value==='current')return seasonYearForRow(row,type)===new Date().getFullYear();",
    "if(parts[1]==='cross_country')return 'Cross Country '+parts[0];",
  ].forEach((text) => {
    if (!html.includes(text)) throw new Error(`dashboard filtered training load/archived group guard missing ${text}`);
  });
  if (html.includes("updateBreakdowns(rows);") || html.includes("volumeSummaryHtml(groupVolumeByAthlete(recentTrainingRows")) {
    throw new Error("dashboard training cards should stay tied to the current filtered rows, not the full dashboard dataset.");
  }
  console.log("dashboard filtered training load and archived groups ok");
}

function checkDashboardTrainingPaces() {
  const html = fs.readFileSync("dashboard.html", "utf8");
  const api = fs.readFileSync("api/ghl/dashboard.js", "utf8");
  [
    "function renderAthleteTrainingPaces",
    "Training Paces",
    "Equivalent Performances",
    "Fast Reps",
    "function eventDistanceMeters",
    "renderAthleteTrainingPaces(fitness)",
  ].forEach((text) => {
    if (!html.includes(text)) throw new Error(`dashboard roster detail training paces missing ${text}`);
  });
  [
    "personal_best_ms",
    "season_best_ms",
    "resultMs: resultMs || 0",
    "function parseTimeToMs",
  ].forEach((text) => {
    if (!api.includes(text)) throw new Error(`dashboard API current fitness pace source missing ${text}`);
  });
  console.log("dashboard roster detail training paces ok");
}

function checkMilesBoardFeature() {
  const dashboard = fs.readFileSync("dashboard.html", "utf8");
  const board = fs.readFileSync("miles-board.html", "utf8");
  const api = fs.readFileSync("api/smart-trak/[route].js", "utf8");
  const dashboardApi = fs.readFileSync("api/ghl/dashboard.js", "utf8");
  const mobile = fs.readFileSync("index.html", "utf8");
  const syncApi = fs.readFileSync("api/ghl/sync-session.js", "utf8");
  const manualMileageApi = fs.readFileSync("api/ghl/manual-mileage.js", "utf8");
  [
    'id="shareMilesBoardBtn"',
    "Miles Trak",
    'id="milesBoardModal"',
    "Miles Board Sharing",
    'id="milesBoardChallengeList"',
    'data-miles-board-challenge="total"',
    'data-miles-board-challenge="game"',
    'data-miles-board-challenge="weekly"',
    'id="milesBoardShowTeamAttendance"',
    'id="milesBoardShowAthleteAttendance"',
    'id="milesBoardRangeMode"',
    'id="milesBoardStartDate"',
    'id="milesBoardEndDate"',
    "function normalizeMilesBoardDateRange",
    "function milesBoardRangeBounds",
    "dateRange:collectMilesBoardDateRange()",
    'id="milesBoardGroupList"',
    "function renderMilesBoardGroupList",
    "function loadMilesBoardGroups",
    "fetch('/api/smart-trak/groups?v='+Date.now()",
    "function milesBoardEligibleGroups",
    "data-miles-board-group",
    "function normalizeMilesBoardDisplayOptions",
    "displayOptions:normalizeMilesBoardDisplayOptions",
    "function normalizeMilesBoardGroupNames",
    "groupNames:normalizeMilesBoardGroupNames",
    "normalizeMilesBoardChallenges",
    'id="milesBoardChallengeName"',
    'id="milesBoardCoachMessage"',
    'id="milesBoardTeamGoal"',
    'id="milesBoardAthleteGoal"',
    "function normalizeMilesBoardGameSettings",
    "function collectMilesBoardGameSettings",
    'id="milesBoardTurnOff"',
    'id="milesBoardReset"',
    'id="milesBoardSnapshot"',
    "Save Weekly Snapshot",
    "function saveMilesBoardSnapshot",
    "milesBoardApiUrlFromLink",
    "function shareMilesBoard()",
    "function openMilesBoardSharing()",
    "function createMilesBoardLink()",
    "function turnOffMilesBoardLink()",
    "function resetMilesBoardLink()",
    "fetch('/api/smart-trak/miles-board-sharing?account='",
    "miles-board-link",
    "params.set('sport','Cross Country');",
    "params.set('seasonYear',milesBoardSeasonYear());",
    "function milesBoardSeasonYear()",
    "copyTextToClipboard",
  ].forEach((text) => {
    if (!dashboard.includes(text)) throw new Error(`dashboard Miles Board share missing ${text}`);
  });
  [
    "SMART Trak Miles Board",
    "/api/smart-trak/miles-board?",
    "data-sort=\"totalMiles\"",
    "data-sort=\"currentWeekMiles\"",
    "data-sort=\"weekChangeMiles\"",
    "data-sort=\"gameScore\"",
    "data-sort=\"averagePerWorkout\"",
    "Game Score Leader",
    "This Week's Winners",
    "class=\"headinfo\"",
    "smart-tooltip",
    "function initHeaderTooltips()",
    "function pointsHelpText()",
    "function badgesHelpText()",
    "function updateMilesBoardHelp()",
    "Points are automatic:",
    "Badges are automatic:",
    "Most total miles logged during this Miles Board range.",
    "Most completed workouts logged this week.",
    "Weekly Snapshot",
    "Past Weeks",
    "renderPastWeeks",
    "pastWeeks",
    "Display Mode",
    "Board Mode",
    "display-mode",
    "renderDisplayRows",
    "toggleDisplayMode",
    "displayRows",
    "Coach Message",
    "coachMessagePanel",
    "teamGoalBar",
    "function teamGoalText(totals)",
    "els.teamGoal.textContent=teamGoalText(data.totals);",
    "'% of '+goal.toLocaleString",
    "athleteGoalBar",
    "renderSnapshot",
    "renderCoachMessage",
    "weeklyGameWinner",
    "renderWeeklyWinners",
    "data-challenge-card=\"game\"",
    "badgeHtml",
    "teamGoal",
    "teamAttendanceCard",
    "Team attendance",
    'id="attendanceHead"',
    'data-sort="attendanceRate"',
    "displayOptions=normalizeDisplayOptions(data.displayOptions)",
    "renderTeamAttendance(data.totals||{})",
    "function attendanceCell(row)",
    "function attendanceText(value)",
    "function leaderboardColspan()",
    "athleteGoal",
    "Friendly team mileage leaderboard.",
    "Challenge Highlights",
    "Pack Challenge",
    "<th>Division</th>",
    "divisionOrder",
    "challengeSortKey",
    "challengeLabel",
    "challengeListLabel",
    "data-challenge-card=\"total\"",
    "This Week Challenge",
    "renderHighlights",
    "renderGroups",
    "function fetchWithTimeout(url,options,timeoutMs)",
    "Miles Board is taking too long to load. Tap Refresh to try again.",
    "window.addEventListener('pageshow'",
    "function decodeCompactShareKey(key)",
    "function compactShareParams()",
  ].forEach((text) => {
    if (!board.includes(text)) throw new Error(`Miles Board page missing ${text}`);
  });
  if (/Edit|Delete|Void|Save/.test(board)) throw new Error("Miles Board must stay read-only.");
  if (board.includes("class=\"infobadge\"")) throw new Error("Miles Board should use Dashboard-style headinfo bubbles.");
  if (board.includes("No group")) throw new Error("Miles Board should not print athlete groups under names.");
  [
    'if (route === "miles-board-link")',
    "return accountMilesBoardLink(req, res);",
    'if (route === "miles-board-sharing")',
    "return accountMilesBoardSharing(req, res);",
    'if (route === "miles-board")',
    "return accountMilesBoard(req, res);",
    "function milesBoardToken(accountKey, tokenVersion",
    "function legacyMilesBoardToken(accountKey)",
    "function milesBoardTokenVersion()",
    "function milesBoardShareKey(input)",
    "function milesBoardShareFromKey(value)",
    "params.set(\"sport\", cleanSetupText(firstQueryValue(req.query && req.query.sport)) || \"Cross Country\");",
    "params.set(\"seasonYear\", cleanSetupText(firstQueryValue(req.query && req.query.seasonYear)) || String(new Date().getFullYear()));",
    "sport: params.get(\"sport\")",
    "seasonYear: params.get(\"seasonYear\")",
    "sp: cleanSetupText(source.sport)",
    "y: cleanSetupText(source.seasonYear)",
    "sport: cleanSetupText(raw.sp || raw.sport)",
    "seasonYear: cleanSetupText(raw.y || raw.seasonYear)",
    "legacyUrl: `/miles-board.html?",
    "k: milesBoardShareKey",
    "SMARTCOACH_MILES_BOARD_SECRET",
    "normalizeMilesBoardSharing",
    "normalizeMilesBoardDisplayOptions",
    "displayOptions: normalizeMilesBoardDisplayOptions",
    "function normalizeMilesBoardDateRange",
    "dateRange: normalizeMilesBoardDateRange",
    "function normalizeMilesBoardGroupNames",
    "groupNames: normalizeMilesBoardGroupNames",
    "req.milesBoardAthleteKeys = milesBoardAthleteKeysForGroups",
    "function milesBoardAthleteKeysForGroups",
    "normalizeMilesBoardChallenges",
    "coachMessage: cleanSetupText(input.coachMessage).slice(0, 240)",
    "Miles Board sharing is turned off.",
    "lastMilesBoardSharingSync",
    "normalizeMilesBoardSnapshots",
    "normalizeMilesBoardSnapshot",
    "milesBoardSnapshots",
    "action === \"snapshot\"",
  ].forEach((text) => {
    if (!api.includes(text)) throw new Error(`Miles Board API route missing ${text}`);
  });
  [
    "module.exports.publicMilesBoard = publicMilesBoard;",
    "async function publicMilesBoard(req, res)",
    "function buildMilesBoardRows",
    "const boardFilter = milesBoardFilter(req.query, sharing);",
    "function milesBoardFilter(query, sharing)",
    "function milesBoardRecordMatchesFilter(item, filter)",
    "function legacyCrossCountryTrainingRecord(item)",
    "function yearFromDateValue(value)",
    "function normalizeMilesBoardGroupNames(values)",
    "const athletes = milesBoardAthletesForSelectedGroups(allAthletes, req.milesBoardAthleteKeys);",
    "function milesBoardAthletesForSelectedGroups",
    "function athleteMatchesSelectedMilesBoardGroup",
    ".filter((item) => milesBoardRecordMatchesFilter(item, boardFilter))",
    "sport: boardFilter.sportLabel",
    "seasonYear: boardFilter.seasonYear",
    "loadAttendanceRecords",
    "displayOptions",
    "attendanceRate",
    "function milesBoardDisplayOptions",
    "function milesBoardAttendanceSummary",
    "function attendanceMatchesAthlete",
    "function milesBoardHighlights",
    "function milesBoardWeeklyWinners",
    "function milesBoardWinner",
    "function milesBoardPackWinner",
    "function milesBoardGameScore",
    "function milesBoardBadges",
    "function milesBoardCompetitionBadges",
    "20 Mile Week",
    "Comeback Runner",
    "Streak Leader",
    "Pack MVP",
    "function milesBoardGameSettings",
    "function startOfBoardWeek",
    "const currentWeekStart = startOfBoardWeek(end)",
    "function milesBoardGroupRows",
    "function milesBoardGenderDivision",
    "function milesBoardDivisionOrder",
    "challengeType:",
    "challengeTypes:",
    "gameScore",
    "gameSettings",
    "coachMessage",
    "snapshots: milesBoardSnapshots",
    "function milesBoardSnapshots",
    "teamGoalProgress",
    "weeklyWinners",
    "currentWeekGameScore",
    "badges",
    "averagePerWorkout",
    "previousWeekMiles",
    "weekChangeMiles",
    "highlights: milesBoardHighlights(boardRows)",
    "const groupRows = milesBoardGroupRows(boardRows)",
    "groups: groupRows",
    "lastLoggedDate",
    "athleteName",
    "OPTIONAL_DASHBOARD_RECORD_TIMEOUT_MS",
    "safeDashboardObjectRecords",
    "controller.abort()",
    "if (optionValue(item.sport)) return false;",
    "if (seasonKey && !legacyMileageDateBucketSeason(seasonKey)) return false;",
    "function legacyMileageDateBucketSeason(value)",
    "[\"winter\", \"spring\", \"summer\", \"fall\", \"unspecified\", \"unlisted\"].includes(optionValue(value))",
    "if (!Number(item.completedVolumeMiles)) return false;",
    "if (/\\b(track|speed|sprint|fly|starts?|runway|field event|jumps?|throws?)\\b/.test(text)) return false;",
  ].forEach((text) => {
    if (!dashboardApi.includes(text)) throw new Error(`Miles Board sanitized dashboard API missing ${text}`);
  });
  [
    "sport:CL.sport||''",
    "seasonYear:CL.seasonYear||currentSeason().year",
  ].forEach((text) => {
    if (!mobile.includes(text)) throw new Error(`SMARTCoach app Miles Board sport/year sync missing ${text}`);
  });
  [
    "sport: clean(payload.sport)",
    "seasonYear: Number(payload.seasonYear)",
    "season_year: session.seasonYear || sessionDate.getFullYear()",
    "function performanceRecordFallbackProperties",
    "function mappedFieldErrorFor(message, field)",
    "function optionFieldErrorFor(message, field)",
    "mappedFieldErrorFor(message, \"season_year\")",
    "delete fallback.season_year",
    "optionFieldErrorFor(message, \"season\")",
    "delete fallback.season",
    "mappedFieldErrorFor(message, \"sport\")",
    "delete fallback.sport",
    "function saveSeasonRecordWithFallback",
    "function seasonRecordFallbackProperties",
    "...(session.sport ? { sport: sportValue(session.sport) } : {})",
    "function sportValue(value)",
  ].forEach((text) => {
    if (!syncApi.includes(text)) throw new Error(`sync-session sport/year persistence missing ${text}`);
  });
  if (dashboardApi.includes("recentTrainingSyncs = trainingSyncs.slice(0, 100)")) {
    throw new Error("dashboard should not trim completed training rows before frontend volume calculations.");
  }
  [
    "season: clean(payload.season) || seasonForSport(payload.sport) || seasonForDate(date)",
    "seasonYear: Number(payload.seasonYear)",
    "sport: clean(payload.sport) || \"Cross Country\"",
    "function seasonForSport(value)",
  ].forEach((text) => {
    if (!manualMileageApi.includes(text)) throw new Error(`manual mileage sport/year persistence missing ${text}`);
  });
  console.log("Miles Board feature ok");
}

function checkResultsBoardFeature() {
  const dashboard = fs.readFileSync("dashboard.html", "utf8");
  const board = fs.readFileSync("results-board.html", "utf8");
  const api = fs.readFileSync("api/smart-trak/[route].js", "utf8");
  const dashboardApi = fs.readFileSync("api/ghl/dashboard.js", "utf8");
  [
    'id="shareResultsBoardBtn"',
    "Results Board Sharing",
    'id="resultsBoardModal"',
    'id="resultsBoardSport"',
    'id="resultsBoardSeasonYear"',
    'id="resultsBoardShowLatest"',
    'id="resultsBoardShowSeason"',
    'id="resultsBoardShowArchive"',
    'id="resultsBoardShowAthletes"',
    'id="resultsBoardShowEvents"',
    'id="resultsBoardShowDivisions"',
    'id="resultsBoardShowHighlights"',
    'id="resultsBoardShowBadges"',
    'id="resultsBoardShowSummary"',
    'id="resultsBoardDetailList"',
    'id="resultsBoardDetailsDefault"',
    'data-results-board-detail="latestMeet"',
    "meetArchive:true",
    "athleteSummary:true",
    "eventSummary:true",
    "divisionSummary:true",
    "bestHighlights:true",
    "detailOrder:defaultResultsBoardDetailOrder()",
    "function defaultResultsBoardDetailOrder()",
    "function normalizeResultsBoardDetailOrder(values)",
    "function renderResultsBoardDetailOrder(order)",
    "function moveResultsBoardDetail(button,direction)",
    "function resetResultsBoardDetailDefaults()",
    "function normalizeResultsBoardSharing",
    "function openResultsBoardSharing()",
    "function createResultsBoardLink()",
    "fetch('/api/smart-trak/results-board-sharing?account='",
    "results-board-link",
    "resultsBoardSharing=normalizeResultsBoardSharing(data&&data.resultsBoardSharing)",
    "if(location.hash==='#share-results-board')",
  ].forEach((text) => {
    if (!dashboard.includes(text)) throw new Error(`dashboard Results Board share missing ${text}`);
  });
  [
    "SMART Trak Results Board",
    "/api/smart-trak/results-board?",
    "Team meet results.",
    "Latest Meet",
    "All Meets",
    "Top Result - Girls",
    "Top Result - Boys",
    'data-sort-table="highlight"',
    'data-sort-table="division"',
    'data-sort-table="latest"',
    'data-sort-table="archive"',
    'data-sort-table="athlete"',
    'data-sort-table="event"',
    'data-sort-table="season"',
    'data-sort-key="athleteName"',
    'data-sort-key="resultMs"',
    'data-sort-key="best"',
    'data-sort-key="latestDate"',
    "Meet Archive",
    "Athlete Summary",
    "Event Summary",
    "Division Summary",
    "PB / SB Highlights",
    "Season Results",
    "archiveRows=data.meetArchive||[]",
    "athleteRows=data.athleteSummaryRows||[]",
    "eventRows=data.eventSummaryRows||[]",
    "divisionRows=data.divisionSummaryRows||[]",
    "highlightRows=data.bestHighlightRows||[]",
    "applyBoardSectionOrder()",
    "function defaultDetailOrder()",
    "function normalizeDetailOrder(values)",
    "function applyBoardSectionOrder()",
    "sortRows('latest'",
    "function sortRows(table,rows)",
    "function sortValue(table,row,key,index)",
    "function compareSortValues(a,b)",
    "function parseResultNumber(value)",
    "function updateSortHeaders()",
    "function handleSortHeaderClick(event)",
    "document.addEventListener('click',handleSortHeaderClick)",
    "displayOptions.meetArchive===false",
    "displayOptions.athleteSummary===false",
    "displayOptions.eventSummary===false",
    "displayOptions.divisionSummary===false",
    "displayOptions.bestHighlights===false",
    "function filterArchiveRows(rows,query)",
    "function filterAthleteRows(rows,query)",
    "function filterEventRows(rows,query)",
    "function filterDivisionRows(rows,query)",
    "function archiveRowHtml(row)",
    "function athleteRowHtml(row)",
    "function eventRowHtml(row)",
    "function divisionRowHtml(row)",
    "function highlightRowHtml(row)",
    "function compactShareParams()",
    "function renderFilterOptions",
    "function reloadWithFilters",
    "function bestPills(row)",
    "Results Board is taking too long to load. Tap Refresh to try again.",
  ].forEach((text) => {
    if (!board.includes(text)) throw new Error(`Results Board page missing ${text}`);
  });
  if (board.includes("<strong>Top Result</strong>")) throw new Error("Results Board should show only Girls/Boys top-result cards.");
  if (/Edit|Delete|Void|Save/.test(board)) throw new Error("Results Board must stay read-only.");
  [
    'if (route === "results-board-sharing")',
    "return accountResultsBoardSharing(req, res);",
    'if (route === "results-board-link")',
    "return accountResultsBoardLink(req, res);",
    'if (route === "results-board")',
    "return accountResultsBoard(req, res);",
    "function resultsBoardToken(accountKey, tokenVersion",
    "function resultsBoardTokenVersion()",
    "function resultsBoardShareKey(input)",
    "function resultsBoardShareFromKey(value)",
    "function normalizeResultsBoardSharing(source)",
    "meetArchive: input.meetArchive !== false",
    "athleteSummary: input.athleteSummary !== false",
    "eventSummary: input.eventSummary !== false",
    "divisionSummary: input.divisionSummary !== false",
    "bestHighlights: input.bestHighlights !== false",
    "detailOrder: normalizeResultsBoardDetailOrder(input.detailOrder)",
    "function normalizeResultsBoardDetailOrder(values)",
    "resultsBoardSharing: normalizeResultsBoardSharing",
    "lastResultsBoardSharingSync",
    "url: `/results-board.html?",
    "SMARTCOACH_RESULTS_BOARD_SECRET",
  ].forEach((text) => {
    if (!api.includes(text)) throw new Error(`Results Board API route missing ${text}`);
  });
  [
    "module.exports.publicResultsBoard = publicResultsBoard;",
    "async function publicResultsBoard(req, res)",
    "function resultsBoardFilters(query, sharing)",
    "allMeets: meetInput === \"__all__\"",
    "function resultsBoardRowMatches(row, filters)",
    "function latestResultsMeetName(rows)",
    "function resultsBoardFilterOptions(rows, filters)",
    "filters.allMeets ? \"All Meets\"",
    "function resultsBoardSeasonBestRows(rows)",
    "function resultsBoardMeetArchive(rows)",
    "function resultsBoardAthleteSummaryRows(rows)",
    "function resultsBoardEventSummaryRows(rows)",
    "function resultsBoardDivisionSummaryRows(rows)",
    "function resultsBoardDivisionLabel(value)",
    "function resultsBoardBestHighlightRows(rows)",
    "function resultsBoardTopTimedResult(rows, gender)",
    "athleteGender: result.athleteGender || athlete.gender",
    "meetArchive: resultsBoardMeetArchive(seasonRows)",
    "athleteSummaryRows: resultsBoardAthleteSummaryRows(seasonRows)",
    "eventSummaryRows: resultsBoardEventSummaryRows(seasonRows)",
    "divisionSummaryRows: resultsBoardDivisionSummaryRows(seasonRows)",
    "bestHighlightRows: resultsBoardBestHighlightRows(seasonRows)",
    "topGirlsResult",
    "topBoysResult",
    "detailOrder: normalizeResultsBoardDetailOrder",
    "latestRows",
    "seasonRows: seasonBestRows",
    "personalBests",
    "seasonBests",
  ].forEach((text) => {
    if (!dashboardApi.includes(text)) throw new Error(`Results Board dashboard API missing ${text}`);
  });
  console.log("Results Board feature ok");
}

function checkSpeedTrakFeature() {
  const page = fs.readFileSync("speed-trak.html", "utf8");
  const board = fs.readFileSync("speed-board.html", "utf8");
  const api = fs.readFileSync("api/smart-trak/[route].js", "utf8");
  const training = fs.readFileSync("training-calendar.html", "utf8");
  const dashboard = fs.readFileSync("dashboard.html", "utf8");
  [
    "<h1>Speed Trak</h1>",
    "Speed testing leaderboard for flys, starts, and runway work.",
    "/api/smart-trak/field-practice",
    "/api/smart-trak/athletes",
    "10m Fly",
    "30m Fly",
    "30m Start",
    "60m Start",
    "90m Start",
    "150m Start",
    "250m Start",
    "Max Velocity",
    'id="addResultBtn"',
    'id="shareSpeedBoardBtn"',
    'id="speedBoardModal"',
    "Speed Trak Board Sharing",
    'data-speed-board-challenge="velocity"',
    'data-speed-board-challenge="fastest"',
    'data-speed-board-challenge="game"',
    'id="speedBoardBadgeVelocity"',
    'id="speedBoardBadgeFrequency"',
    'id="speedBoardBadgeImprovement"',
    "velocityClubThreshold",
    "quickTurnoverThreshold",
    "bigMoverThreshold",
    "function openSpeedBoardSharing()",
    "fetch('/api/smart-trak/speed-board-sharing?account='",
    "fetch('/api/smart-trak/speed-board-link?'+speedBoardLinkParams().toString()",
    "function createSpeedBoardLink()",
    "function resetSpeedBoardLink()",
    'id="speedResultModal"',
    'id="deleteSpeedResultModal"',
    "Import Speed Data",
    'id="importBody" hidden',
    "toggleImportBtn.textContent=open?'Hide Import':'Open Import'",
    "Download Template",
    "Preview Data",
    "Save Speed Data",
    "csvInput",
    "pasteInput",
    "strideLength",
    "strideFrequency",
    "velocity",
    "speedAthleteOptions",
    "function matchRosterAthlete(name)",
    "function applyRosterAthleteToForm()",
    "Roster Status",
    "rosterStatus",
    "populateSpeedAthleteOptions();",
    "speedAthleteInput.addEventListener('change',applyRosterAthleteToForm)",
    "data-sort=\"seconds\"",
    "metricSelect",
    "genderSelect",
    "yearSelect",
    "limitSelect",
    "function buildRows(practices,athletes)",
    "function metricLabel(row,practice)",
    "function openSpeedResultModal(row)",
    "function saveSpeedResult()",
    "function deleteSpeedResult()",
    "function savePracticeList(practices)",
    "function parseSpeedImportRows(text)",
    "function buildSpeedImportPractice(rows,date,index)",
    "function saveSpeedImport()",
    "function initHeaderTooltips()",
    "data-speed-edit",
    "data-speed-delete",
    "state.practices=practices",
    "X-SMARTCoach-Session",
    "X-SMARTCoach-Access-Code",
    "sc_access_",
    "headers:headers()",
  ].forEach((text) => {
    if (!page.includes(text)) throw new Error(`Speed Trak page missing ${text}`);
  });
  [
    "Speed Trak Leaderboard",
    "Team speed leaderboard.",
    "/api/smart-trak/speed-board?",
    "Speed Trak Board is taking too long to load. Tap Refresh to try again.",
    'id="metricSelect"',
    'id="genderSelect"',
    'id="yearSelect"',
    "function renderFilterOptions(options,filters)",
    "function reloadWithBoardFilters()",
    "else params.set(key,'all')",
    "els.metricSelect.value='';els.genderSelect.value='';els.yearSelect.value='';reloadWithBoardFilters()",
    "Display Mode",
    "Challenge Highlights",
    "Velocity Leader",
    "Fastest Time",
    "Game Score",
    "Big Mover",
    "This Week's Winners",
    "class=\"headinfo\"",
    "smart-tooltip",
    "function initHeaderTooltips()",
    'id="pointsHead"',
    'id="badgesHead"',
    "function updateBoardHelp(settings)",
    "Badges: Velocity Club at",
    "data-sort=\"bestVelocity\"",
    "data-sort=\"bestSeconds\"",
    "data-sort=\"reps\"",
    "function renderDisplayRows(rows)",
    "function challengeSortKey(value)",
    "badgeHtml(row.badges)",
  ].forEach((text) => {
    if (!board.includes(text)) throw new Error(`Speed Trak public board missing ${text}`);
  });
  [
    "Rep Leader",
    'data-challenge-card="consistency"',
    "consistencyLeader",
    "weeklyConsistencyWinner",
  ].forEach((text) => {
    if (board.includes(text)) throw new Error(`Speed Trak public board should not include reps-based award ${text}`);
  });
  if (/Edit|Delete|Void|Save/.test(board)) throw new Error("Speed Trak Board must stay read-only.");
  [
    'if (route === "speed-board-sharing")',
    'if (route === "speed-board-link")',
    'if (route === "speed-board")',
    "function accountSpeedBoardSharing(req, res)",
    "function accountSpeedBoardLink(req, res)",
    "function accountSpeedBoard(req, res)",
    "function speedBoardToken(accountKey",
    "function speedBoardShareKey(input)",
    "function speedBoardShareFromKey(value)",
    "url: `/speed-board.html?",
    "function normalizeSpeedBoardSharing(source)",
    "function normalizeSpeedBoardChallenges(values)",
    "function buildSpeedBoardRows",
    "function speedBoardOptionalFilter(value)",
    "function speedBoardFilterOptions(practices)",
    "filterOptions",
    "const metric = speedBoardOptionalFilter(firstQueryValue(req.query && req.query.metric) || share.metric).slice(0, 80);",
    "function normalizeSpeedBoardReps(practices)",
    "function speedBoardHighlights(rows)",
    "function speedBoardWeeklyWinners(rows)",
    "velocityClubThreshold: milesBoardNumber(input.velocityClubThreshold, 9, 30)",
    "quickTurnoverThreshold: milesBoardNumber(input.quickTurnoverThreshold, 5, 20)",
    "bigMoverThreshold: milesBoardNumber(input.bigMoverThreshold, 0, 20)",
    "speedBoardBadges(row, gameSettings)",
    "gameSettings.velocityClubThreshold",
    "gameSettings.quickTurnoverThreshold",
    "gameSettings.bigMoverThreshold",
    "function startOfBoardWeek(end)",
    "function startOfWeekForDate(sourceDate)",
    "function publicBoardDate(value)",
    "function addDays(date, days)",
    "function uniqueStrings(values)",
    "speedBoardSharing: next",
    "lastSpeedBoardSharingSync",
  ].forEach((text) => {
    if (!api.includes(text)) throw new Error(`Speed Trak Board API missing ${text}`);
  });
  [
    'if (text === "consistency" || text === "reps"',
    'badges.push("Rep Leader")',
    'badges.push("Consistent Sprinter")',
    "consistencyLeader",
    'consistency: speedBoardWinner',
  ].forEach((text) => {
    if (api.includes(text)) throw new Error(`Speed Trak Board API should not include reps-based award ${text}`);
  });
  [
    'id="milesTrakLink"',
    'id="speedTrakLink"',
    "els.milesTrakLink.href=pageUrl('/dashboard.html')+'#share-miles-board';",
    "els.speedTrakLink.href=pageUrl('/speed-trak.html');",
  ].forEach((text) => {
    if (!training.includes(text)) throw new Error(`Training Speed/Miles Trak link missing ${text}`);
  });
  [
    "/api/smart-trak/field-practice?v=",
    "speedPracticeTrainingRows(fieldPracticeRows,dashboardRows)",
    "speedMetricSession:true",
    '<option value="speed_training">Speed / sprints</option>',
    "if(filter==='speed_training')return hasSpeedTraining(row.name);",
    "if(filter==='speed_training')return !!row.speedMetricSession;",
    "if(filter==='speed_training')return false;",
    "dashboardVolumeUnit=speedVolumeContext(trainingRows,completedRows,filter)?'meters':'miles';",
    "function formatDashboardVolume(miles)",
    "speedRepCount",
    "speedMetricIds",
    "if(row&&row.speedMetricSession&&effective.label)return effective.label;",
    "completedVolumeMeters:totalMeters",
    "plannedVolumeMeters:plannedReps&&sameDistance?plannedReps*firstMeters:0",
    "dashboardVolumeUnit==='meters'?'Avg meters per workout':'Avg miles per workout'",
    "volumeValueDisplay(row,'volume')",
    "formatMeters(group.volumeMeters)",
    "sourceSessionId:practice.id||practice.practiceId||''",
    "sourceRecordId:'field_practice_'+(practice.id||practice.practiceId||'')+'_'+key",
    "speed reps",
    "Speed Metrics session",
    "completedVolumeMiles:totalMeters/1609.344",
    "var fieldPracticeRows=[];",
    "recentTrainingRows=(result.data.recentTrainingSyncs||[]).concat(speedPracticeTrainingRows(fieldPracticeRows,dashboardRows));",
    "function saveSpeedPracticeCorrection(reason)",
    "function updateSpeedPracticeForRow(row,updater)",
    "fetch('/api/smart-trak/field-practice'",
    "kind:row.speedMetricSession?'speed':'training'",
    "if(voidRequest.kind==='speed')",
    "practice.speedMetrics=(practice.speedMetrics||[]).filter(function(metric){return metrics.indexOf(metric)<0;});",
  ].forEach((text) => {
    if (!dashboard.includes(text)) throw new Error(`Dashboard Speed Metrics training-load bridge missing ${text}`);
  });
  if (/Void/.test(page)) throw new Error("Speed Trak should not expose void actions.");
  console.log("Speed Trak feature ok");
}

function checkDashboardWhatsNew() {
  const html = fs.readFileSync("dashboard.html", "utf8");
  [
    'id="whatsNewBtn"',
    "What's New",
    "var WHATS_NEW_VERSION=",
    "var WHATS_NEW_ITEMS=",
    "function whatsNewStorageKey()",
    "function whatsNewUnreadCount()",
    "function openWhatsNew()",
    "function markWhatsNewSeen()",
    "smartcoachWhatsNewSeen_",
    "Keep Trak",
    "Attendance Trak",
    "Dashboard",
    "Customize Dashboard lets coaches hide optional shortcuts or summary cards they do not use every day.",
    "Hidden tools keep their saved data and can be turned back on with Show All.",
    "Training Calendar",
    "Training Customization lets coaches adjust the effort percentages used for target pace ranges.",
    "Saved custom percentages are account-wide and used by the SMARTCoach app when calculating workout targets.",
    "Field Practice",
    "Training now includes Field Practice for field-event practice planning.",
    "Saved Field Practice sessions can be opened from Training and used by the SMARTCoach app.",
    "Speed Metrics",
    "Training now includes Speed Metrics workouts for acceleration, fly zones, max velocity, and runway timing.",
    "Coaches can capture time and stride count in the SMARTCoach app, then send reps back to SMART Trak.",
    "Dashboard Training Load counts saved speed sessions and shows speed-only volume in meters.",
    "Speed Trak",
    "Speed Trak gives coaches a leaderboard for saved Speed Metrics marks.",
    "Coaches can import speed marks from a spreadsheet or add one-off results manually.",
    "Edit and delete tools help clean up incorrect speed results without reimporting a file.",
    "Results Board",
    "Share a read-only team results board for the latest race and season results.",
    "Viewers can filter by meet, event, and gender, including All Meets for the selected sport and season year.",
    "Board details include PB/SB Highlights, Boys/Girls summaries, meet archive, athlete summary, event summary, and season results.",
    "Coaches can choose visible sections, reorder board details, add a coach message, and viewers can tap table headers to sort columns.",
    "Athlete Calendar",
    "Calendar Questions lets coaches add up to five Complete/Modify/Skip questions for athletes.",
    "Questions can be marked required, and athlete answers are added to the completed workout Athlete Note.",
    "Miles Board",
    "Share a read-only mileage leaderboard from the Dashboard activity range.",
    "Coaches can choose multiple challenge types, add a coach message, save weekly snapshots, and use Display Mode for a projector or TV.",
    "Badges highlight goal hits, mileage clubs, consistency, weekly mileage, big movers, comeback runners, streak leaders, and Pack MVP.",
    "Partner Timing",
    "Cross country race timing can now be shared across multiple coach devices.",
    "Sync Partner Timing combines shared taps before Save Meet Results creates the official Meet History records.",
    "Meet History",
    "Feedback",
    "Bug Trak",
    "Idea Trak",
    "Desktop pages now include one Feedback button with Bug Trak and Idea Trak.",
    "Mark All Seen",
  ].forEach((text) => {
    if (!html.includes(text)) throw new Error(`Dashboard What's New missing ${text}`);
  });
  [
    "Account owner recovery contacts are kept out of athlete rosters.",
    "Staff Access still shows device activity without exposing coach codes.",
  ].forEach((text) => {
    if (html.includes(text)) throw new Error(`Dashboard What's New includes non-coach-facing text: ${text}`);
  });
  console.log("Dashboard What's New ok");
}

function checkDashboardStaffAccessHandoff() {
  const html = fs.readFileSync("dashboard.html", "utf8");
  const onboarding = fs.readFileSync("onboarding.html", "utf8");
  [
    "data-staff-email",
    "data-copy-staff-invite",
    "data-revoke-staff-invite",
    "data-restore-staff-invite",
    "data-staff-role",
    "data-staff-active",
    "data-staff-access-type",
    'id="staffActiveCount"',
    'id="staffInactiveCount"',
    'id="staffInviteUsedCount"',
    'id="staffInviteRevokedCount"',
    "function renderStaffSummary()",
    "function staffAccessAllowed(data)",
    "function applyStaffAccessVisibility(data)",
    "Staff Access is available to the head coach.",
    "Active staff",
    "Inactive staff",
    "Invites used",
    "Revoked invites",
    "staff-access-panel",
    "staff-row-fields",
    "staff-row-actions",
    "function staffAuditHtml(item)",
    "Created '+formatDateTime(item.inviteCreatedAt)",
    "Copied '+formatDateTime(item.inviteLastCopiedAt)",
    "Revoked '+formatDateTime(item.inviteRevokedAt)",
    ".staff-access-panel{width:min(1080px,100%)}",
    "@media(max-width:980px)",
    "Head Coach",
    "Assistant Coach",
    "Volunteer Coach",
    "Full Access",
    "App Only",
    "data-copy-staff-code",
    "function staffPersonalCode()",
    "function compactMessageLines(lines)",
    "function staffCodeMessageLines(savedItem,code,options)",
    "function copyStaffCoachCode(index)",
    "if(result.data&&result.data.sessionToken)setSmartCoachSession(result.data.sessionToken,true);",
    "SMARTCoach Access",
    "Your personal SMARTCoach code is:",
    "Use this code when the app asks for your coach access code.",
    "This code is for the phone app only.",
    "This same code also opens SMART Trak:",
    "SMART Trak invite link:",
    "Access type: '+staffAccessTypeLabel(savedItem&&savedItem.accessType)",
    "var message=compactMessageLines(staffCodeMessageLines(savedItem,code,{inviteLink:link}));",
    "Invite and personal code copied for '+savedItem.name+'.",
    "function normalizeStaffAccessType(value)",
    "function staffAccessTypeOptions(current)",
    "This coach is App Only. Change Access Type to Full Access before creating a SMART Trak invite.",
    "Set this coach to Active before creating or copying an invite.",
    "inviteLastUsedAt",
    "Used '+formatDateTime(item.inviteLastUsedAt)",
    "if(item.active===false)return 'Inactive';",
    "function staffInviteToken()",
    "function staffInviteUrl(item)",
    "function tryDashboardInviteAccess(data)",
    "inviteToken:token",
    "function copyStaffInvite(index)",
    "SMARTCoach Phone App",
    "Use the stopwatch app on your phone to time workouts, record splits, manage training groups, and sync completed sessions into SMART Trak.",
    "Open this link on your phone:",
    "https://app.smartcoach-pro.com",
    "Open the link in Safari. It must be Safari, not Chrome.",
    "Scroll down and tap Add to Home Screen.",
    "Tap Add to Home screen or Install app if it appears.",
  ].forEach((text) => {
    if (!html.includes(text)) throw new Error(`Dashboard Staff Access handoff missing ${text}`);
  });
  [
    "Share Assistant Access",
    'id="assistantSmartTrakLink"',
    'id="mobileAccessEmails"',
    "function collectMobileAccessMessage()",
    "function emailMobileAccessMessage()",
  ].forEach((text) => {
    if (html.includes(text)) throw new Error(`Dashboard Staff Access should use named invites, not generic sharing: ${text}`);
  });
  [
    "Head coach: use SMART Trak from the custom menu link.",
    "Assistant coaches: use a personal coach code or staff invite link from Staff Access.",
    "Head coaches can use the custom menu link; assistants can use a personal coach code or staff invite link.",
    "The saved setup code is a fallback/recovery code.",
    "function phoneAppInstallLines(plan)",
    "SMARTCoach Phone App",
    "Use the stopwatch app on your phone to time workouts, record splits, manage training groups, and sync completed sessions",
    "Open this link on your phone:",
    "https://app.smartcoach-pro.com",
    "Open the link in Safari. It must be Safari, not Chrome.",
    "Scroll down and tap Add to Home Screen.",
    "Tap Add to Home screen or Install app if it appears.",
  ].forEach((text) => {
    if (!onboarding.includes(text)) throw new Error(`Onboarding staff access handoff missing ${text}`);
  });
  const smartTrakApi = fs.readFileSync("api/smart-trak/[route].js", "utf8");
  [
    "function coachInviteAllowed(account, accountKey, inviteToken)",
    "Staff invite link is invalid or revoked.",
    "publicCoachStaff(coachStaff, coachAccessUnlocked)",
    "publicCoachStaff(normalizeCoachStaff(existing.record.coachStaff), false)",
    "staffInviteAccepted: !!access.staffInvite",
    "function staffAccessAdminAllowed(sessionOrAccess, staffItems)",
    "staffAdminAllowed",
    "Head coach access is required to manage Staff Access.",
    "Head coach access is required to change the fallback coach code.",
    "function markStaffInviteUsed({ accountKey, accountRecord, staffInviteId, deviceSource })",
    "staffInviteUsedAt",
    "lastStaffInviteUse",
    "inviteLastUsedAt",
    "inviteRevokedAt",
    "accessType: normalizeStaffAccessType",
    "function normalizeCoachStaffForSave(items, accountKey, existingItems, legacyCodes = [])",
    "function staffCoachCodeHash(accountKey, code)",
    "function staffCoachCodeAllowed(account, accountKey, providedCode)",
    "function staffAccessChangeRequiresSessionBump(existingItems, nextItems)",
    "normalizeStaffAccessType(prev.accessType) !== normalizeStaffAccessType(item.accessType)",
    "const sessionRefreshNeeded = staffAccessChangeRequiresSessionBump(existing.record.coachStaff, coachStaff)",
    "sessionToken: refreshedSession && refreshedSession.token || undefined",
    "staffCodeAccess && staffCodeAccess.allowed",
    "staffCoachCodeAccepted: !!access.staffCoachCode",
    "staffCodeUpdatedAt: staff[index].coachCodeUpdatedAt",
    "function coachSessionAllowedForAccount(session, accountRecord, expectedVersion)",
    "cleanSetupText(item.coachCodeUpdatedAt) !== staffCodeUpdatedAt",
    "hasCoachCode: !!item.coachCodeHash",
    "Personal code must be different from the shared fallback code.",
    "normalizeStaffAccessType(item.accessType) !== \"app-only\"",
    "function desktopSessionAllowedForStaff(access, account, deviceSource)",
    "This coach is set to App Only. Ask the head coach for Full Access before opening SMART Trak.",
  ].forEach((text) => {
    if (!smartTrakApi.includes(text)) throw new Error(`Staff invite backend missing ${text}`);
  });
  if (smartTrakApi.includes("cleanSetupText(prev.coachCodeHash) !== cleanSetupText(item.coachCodeHash)")) {
    throw new Error("Personal coach code resets should not bump every coach's remembered session.");
  }
  const ghlAccount = fs.readFileSync("lib/ghl-account.js", "utf8");
  [
    "staffCoachId: cleanText(options.staffCoachId)",
    "staffCodeUpdatedAt: cleanText(options.staffCodeUpdatedAt)",
    "function coachSessionAllowedForStaff(session, expectedVersion, staffItems)",
    "cleanText(item.coachCodeUpdatedAt) !== staffCodeUpdatedAt",
    "coachStaff: normalizeCoachStaff(account && account.coachStaff)",
  ].forEach((text) => {
    if (!ghlAccount.includes(text)) throw new Error(`Staff session validation missing ${text}`);
  });
  const app = fs.readFileSync("index.html", "utf8");
  [
    "accessType:String(raw.accessType||'full')",
    "if(selected&&!selectedCoachIsValid(selected))setSelectedCoachIdentity(null);",
    "coach.name+(coach.accessType==='app-only'?' (App Only)':'')",
    "setSelectedCoachIdentity({id:result.data.coachId||'',name:result.data.coachName,accessType:result.data.accessType||'full'});",
  ].forEach((text) => {
    if (!app.includes(text)) throw new Error(`SMARTCoach app staff access type missing ${text}`);
  });
  const guide = fs.readFileSync("SMART_TRAK_COACH_HOW_TO.md", "utf8");
  [
    "Create Invite",
    "Copy Invite",
    "Only the head coach can see and use **Staff Access**.",
    "Creating/resetting personal coach codes, changing the shared fallback code, and saving staff rows require head coach access.",
    "Assistant invite links unlock SMART Trak for the named assistant without requiring the head coach to add that coach to the account workspace.",
    "Review the **Active staff**, **Inactive staff**, **Invites used**, and **Revoked invites** cards",
    "choose each coach's role, choose **Full Access** or **App Only**, and keep only current staff marked **Active**.",
    "Click **Create Code** or **Reset Code** to copy a send-ready message for that coach.",
    "The message includes the personal code, phone app link, access type, and the SMART Trak link when the coach has Full Access.",
    "Copying an invite creates/resets that assistant's personal code, so send the newest copied message.",
    "Use **Full Access** for coaches who should open SMART Trak and use the phone app.",
    "Use **App Only** for coaches who should use the phone app but should not open SMART Trak.",
    "Personal coach codes are the preferred normal access method.",
    "Inactive coaches cannot use staff invite links.",
    "Each coach row shows invite activity such as when an invite was created, copied, used, or revoked.",
    "Staff Access updates that assistant's invite status to show when the link was last used.",
  ].forEach((text) => {
    if (!guide.includes(text)) throw new Error(`Staff invite guide missing ${text}`);
  });
  console.log("Dashboard Staff Access handoff ok");
}

function checkCrossCountryRaceResultEvents() {
  const dashboard = fs.readFileSync("dashboard.html", "utf8");
  const calendar = fs.readFileSync("training-calendar.html", "utf8");
  const expected = "var CROSS_COUNTRY_RACE_EVENT_OPTIONS=['Marathon','Half Marathon','15K','10K','5K','2 Mile','3200m','3K','1 Mile','1600m','1500m','800m','Other'];";
  [dashboard, calendar].forEach((html, index) => {
    const page = index === 0 ? "Dashboard" : "Training Calendar";
    if (!html.includes(expected)) throw new Error(`${page} missing full Cross Country race-result event list.`);
    if (!html.includes("sport==='cross_country'?[''].concat(CROSS_COUNTRY_RACE_EVENT_OPTIONS)")) {
      throw new Error(`${page} race-result dropdown must use the full Cross Country event list.`);
    }
  });
  console.log("Cross Country race result events ok");
}

function checkTrainingCalendarRaceResultAthleteFallback() {
  const calendar = fs.readFileSync("training-calendar.html", "utf8");
  [
    "function raceResultAthleteRows()",
    "function selectedRaceResultGroupAthletes(activeRows)",
    "function selectedRaceResultCalendarDay()",
    "var groupRows=selectedRaceResultGroupAthletes(active);",
    "return groupRows.length?groupRows:active;",
    "if(loadedAthletes.length||!mileageAthletes.length)mileageAthletes=loadedAthletes;",
    "if(loadedGroups.length||!trainingGroups.length)trainingGroups=loadedGroups;",
    "return raceResultAthleteRows().find(function(row){return String(row.contactId||row.name||'')===String(selected);})||null;",
    "No athletes available for this meet",
  ].forEach((text) => {
    if (!calendar.includes(text)) throw new Error(`Training Calendar race-result athlete fallback missing ${text}`);
  });
  console.log("Training Calendar race result athlete fallback ok");
}

function checkTrainingCalendarDeletedMeetGuard() {
  const calendar = fs.readFileSync("training-calendar.html", "utf8");
  [
    "var calendarMeetsLoaded=false;",
    "var activeMeetIds={};",
    "if(id)activeMeetIds[id]=true;",
    "return !(calendarMeetsLoaded&&linked&&!activeMeetIds[linked]);",
    "calendarMeetsLoaded=!!results[4].ok;",
    "if(calendarMeetsLoaded)calendarMeets=results[4].data.meets||[];",
    "catch(function(){return{ok:false,data:{meets:[]}};})",
    "calendarMeetsLoaded=false;",
  ].forEach((text) => {
    if (!calendar.includes(text)) throw new Error(`Training Calendar deleted meet guard missing ${text}`);
  });
  console.log("Training Calendar deleted meet guard ok");
}

function checkDashboardStartHere() {
  const html = fs.readFileSync("dashboard.html", "utf8");
  const guide = fs.readFileSync("SMART_TRAK_COACH_HOW_TO.md", "utf8");
  [
    'id="startHereBtn"',
    'onclick="openStartHere()"',
    "Start Here",
    'id="startHereModal"',
    "var START_HERE_PATHS=",
    "Set Up My Team",
    "Plan Workouts",
    "Run Daily Practice",
    "Run Meet Day",
    "Track Summer Mileage",
    "Coach Field Events",
    "function renderStartHereProgress()",
    "function openStartHere()",
    "function handleStartHereAction(event)",
    "Account setup looks complete:",
    "Pick a goal, then follow the buttons from left to right.",
  ].forEach((text) => {
    if (!html.includes(text)) throw new Error(`Dashboard Start Here missing ${text}`);
  });
  if (html.includes("escAttr(")) throw new Error("Dashboard Start Here references missing escAttr helper.");
  [
    "Use **Start Here** on the Dashboard",
    "It stays available after setup is complete",
    "**Set Up My Team**",
    "**Coach Field Events**",
    "If the account is brand new, start with **Set Up My Team**",
  ].forEach((text) => {
    if (!guide.includes(text)) throw new Error(`How To Start Here guide missing ${text}`);
  });
  console.log("Dashboard Start Here ok");
}

function checkHowToGuidePage() {
  const html = fs.readFileSync("how-to.html", "utf8");
  const dashboard = fs.readFileSync("dashboard.html", "utf8");
  const guide = fs.readFileSync("SMART_TRAK_COACH_HOW_TO.md", "utf8");
  const sales = fs.readFileSync("sales.html", "utf8");
  const api = fs.readFileSync("api/smart-trak/[route].js", "utf8");
  [
    "SMART Trak How To Guide",
    "Coach-facing guide for SMART Trak and the SMARTCoach Pro mobile app.",
    "fetch('/SMART_TRAK_COACH_HOW_TO.md?t='",
    "function renderMarkdown(markdown)",
    "id=\"tocBody\"",
    "id=\"guideBody\"",
    "printBtn",
    "smartcoach-help-widget.js",
  ].forEach((text) => {
    if (!html.includes(text)) throw new Error(`How To guide page missing ${text}`);
  });
  [
    "Open Text Guide",
    "id=\"markdownLink\"",
    "href=\"/SMART_TRAK_COACH_HOW_TO.md\"",
  ].forEach((text) => {
    if (html.includes(text)) throw new Error(`How To guide should not link coaches to raw text page: ${text}`);
  });
  [
    'id="dashboardLink"',
    'href="/dashboard.html"',
  ].forEach((text) => {
    if (!dashboard.includes(text)) throw new Error(`Dashboard guide navigation missing ${text}`);
  });
  if (dashboard.includes('id="howToLink"')) throw new Error("How To guide should not live in the Dashboard action row.");
  [
    "## Miles Board",
    "Use **Miles Trak** when you want a view-only mileage leaderboard for athletes.",
    "How to set up the Miles Board:",
    "Display Mode",
    "Miles Board badges are earned this way:",
    "Pack MVP",
    "Use **Import History** when starting SMART Trak with older results from a spreadsheet, CSV, TSV, or the SMART Trak template.",
    "Paste spreadsheet rows into the import box, or upload a CSV/TSV/template file.",
    "Athletic.net copy/paste import is no longer available because it was not reliable enough for coach-facing use.",
    "Beta customers can use a 30-day Pro 100 trial.",
    "A coach can only move to a lower Pro plan after the active athlete count is at or below that plan's limit.",
    "## Speed Trak",
    "Use **Speed Trak** from Training when you want a leaderboard of speed testing marks captured during Speed Metrics practice sessions or imported from a spreadsheet.",
    "velocity",
    "stride length",
    "stride frequency",
    "Dashboard Training Load and Completed Workouts",
    "5 x 30m counts as 150m",
    "one completed workout for each athlete with at least one saved rep",
    "completed-workout detail shows the Speed Metrics rep breakdown",
  ].forEach((text) => {
    if (!guide.includes(text)) throw new Error(`How To guide missing ${text}`);
  });
  [
    "Choose **Paste Spreadsheet**, **Upload Spreadsheet**, or **Athletic.net Import**.",
    "Athletic.net Import supports copied",
    "paste the season calendar or meet reference list below the records",
  ].forEach((text) => {
    if (guide.includes(text)) throw new Error(`How To guide still describes removed Athletic.net import flow: ${text}`);
  });
  [
    ".html",
    "/api/",
    "webhook",
    "payload",
    "custom_objects",
  ].forEach((text) => {
    if (guide.includes(text)) throw new Error(`How To guide includes non-coach-facing technical text: ${text}`);
  });
  [
    "Beta customers can start with a 30-day Pro 100 trial.",
    "Lower-plan downgrades require the active athlete count to fit the requested plan first.",
  ].forEach((text) => {
    if (!sales.includes(text)) throw new Error(`Sales page missing ${text}`);
  });
  if (guide.includes("7-day trial") || sales.includes("7-day trial")) throw new Error("Trial wording should use the 30-day Pro 100 beta trial.");
  [
    "async function enforcePlanDowngradeAthleteLimit",
    "Mark ${overBy} athlete",
    "before changing to ${targetPlan.label}",
  ].forEach((text) => {
    if (!api.includes(text)) throw new Error(`Plan downgrade guard missing ${text}`);
  });
  console.log("How To guide page ok");
}

function checkDashboardToolPreferences() {
  const html = fs.readFileSync("dashboard.html", "utf8");
  const api = fs.readFileSync("api/smart-trak/[route].js", "utf8");
  const directPages = [
    "keep-trak.html",
    "attendance.html",
    "athletes.html",
    "records.html",
    "weather.html",
    "track-simulator.html",
    "xc-simulator.html",
  ];
  directPages.forEach((file) => {
    if (!fs.existsSync(file)) throw new Error(`hidden dashboard tools must still load directly by URL: ${file}`);
  });
  [
    'id="dashboardPrefsBtn"',
    "Customize Dashboard",
    'id="dashboardPrefsModal"',
    'id="dashboardPrefsList"',
    "function defaultDashboardPreferences()",
    "function normalizeDashboardPreferences(source)",
    "function dashboardToolVisible(key)",
    "function applyDashboardPreferences(source)",
    "function renderDashboardPrefsList()",
    "function collectDashboardPreferences()",
    "function resetDashboardPreferences()",
    "function saveDashboardPreferences()",
    "fetch('/api/smart-trak/dashboard-preferences?account='",
    "Hidden tools keep their saved data and can still be opened directly by URL.",
    "Preferences only change dashboard visibility.",
    "node.hidden=!dashboardToolVisible(key);",
    'data-dashboard-tool="keepTrak"',
    'data-dashboard-tool="attendanceTrak"',
    'data-dashboard-tool="docuTrak"',
    'data-dashboard-tool="weather"',
    'data-dashboard-tool="records"',
    'data-dashboard-tool="simulators"',
    "equipmentTrak:true",
    "Show All",
  ].forEach((text) => {
    if (!html.includes(text)) throw new Error(`dashboard tool preferences missing ${text}`);
  });
  [
    "fetch('/api/smart-trak/attendance?v='+stamp",
    "fetch('/api/smart-trak/docu-trak?v='+stamp",
    "recentAttendanceRows=results[2].ok?(results[2].data.attendance||[]):[];",
    "docuItems=results[3].ok?(results[3].data.items||[]):[];",
    "if(els.rosterAttendanceRate)els.rosterAttendanceRate.textContent=attendanceRateText(attendanceRows);",
    "updateDocuStatusCard(rows);",
  ].forEach((text) => {
    if (!html.includes(text)) throw new Error(`dashboard hidden tools must not remove summary data flow: ${text}`);
  });
  [
    'if (route === "dashboard-preferences")',
    "return accountDashboardPreferences(req, res);",
    "async function accountDashboardPreferences(req, res)",
    "dashboardPreferences: normalizeDashboardPreferences",
    "function defaultDashboardVisibleTools()",
    "function normalizeDashboardPreferences(source)",
    "lastDashboardPreferencesSync",
    "keepTrak: true",
    "attendanceTrak: true",
    "equipmentTrak: true",
    "docuTrak: true",
    "weather: true",
    "records: true",
    "simulators: true",
  ].forEach((text) => {
    if (!api.includes(text)) throw new Error(`dashboard preferences API missing ${text}`);
  });
  console.log("dashboard tool preferences ok");
}

function checkBugTrakDesktopFeedback() {
  const widget = fs.readFileSync("assets/smartcoach-help-widget.js", "utf8");
  const api = fs.readFileSync("api/smart-trak/[route].js", "utf8");
  const registry = fs.readFileSync("lib/account-registry.js", "utf8");
  [
    "smartcoach-bugtrak-btn",
    "smartcoachFeedbackBtn",
    "function smartcoachHelpSuppressedPage()",
    "path==='/athlete-calendar'||path==='/athlete-calendar.html'||path==='/miles-board'||path==='/miles-board.html'",
    "Feedback",
    "Bug Trak",
    "Idea Trak",
    "data-feedback-mode=\"idea\"",
    "smartcoachBugTrakForm",
    "smartcoachHowToLink",
    "Open How To Guide",
    "function smartCoachPageUrl(path)",
    "if(howTo)howTo.href=smartCoachPageUrl('/how-to.html');",
    "Send Bug Report",
    "Send Idea",
    "Idea saved.",
    "fetch('/api/smart-trak/bug-trak?account='",
    "type:mode",
    "page:location.href",
    "@media(max-width:760px){.smartcoach-bugtrak-btn,.smartcoach-bugtrak-overlay{display:none!important}}",
  ].forEach((text) => {
    if (!widget.includes(text)) throw new Error(`Bug Trak desktop widget missing ${text}`);
  });
  [
    'if (route === "bug-trak")',
    "return accountBugTrak(req, res);",
    "async function accountBugTrak(req, res)",
    "function normalizeBugTrakPayload(payload, req, accountKey)",
    'cleanSetupText(source.type).toLowerCase() === "idea" ? "idea" : "bug"',
    'Idea Trak is saved for beta review without immediate notification.',
    "SMARTCOACH_BUGTRAK_WEBHOOK_URL",
    "async function notifyBugTrak(report, accountKey)",
    "function bugTrakWebhookPayload(report, accountKey)",
    "title,",
    "message: body",
    "text: `${title}\\n\\n${body}`",
    "notificationText: `${title}\\n\\n${body}`",
    "bugTrakText: `${title}\\n\\n${body}`",
    "bugNotificationTitle: title",
    "bugNotificationBody: body",
    "bugNotificationText: `${title}\\n\\n${body}`",
    "bugSummary: cleanSetupText(item.summary)",
    "bugType: type",
    "contactTags: feedbackTags",
    "excludeFromAthletes: true",
    "bugUrgency: cleanSetupText(item.urgency)",
    "bugPage: cleanSetupText(item.page)",
    "saveBugTrakReport(accountKey, report)",
  ].forEach((text) => {
    if (!api.includes(text)) throw new Error(`Bug Trak API missing ${text}`);
  });
  [
    "async function saveBugTrakReport(accountKey, report)",
    "async function loadBugTrakReports(accountKey, filters = {})",
    "function normalizeBugTrakReport(report)",
    'clean(source.type).toLowerCase() === "idea" ? "idea" : "bug"',
    "bugTrakReports",
    "lastBugTrakReport",
    ".slice(-500)",
    "saveBugTrakReport,",
    "loadBugTrakReports,",
  ].forEach((text) => {
    if (!registry.includes(text)) throw new Error(`Bug Trak registry missing ${text}`);
  });
  console.log("Bug Trak desktop feedback ok");
}

function checkPublicSharePagesHideFeedback() {
  const athleteCalendar = fs.readFileSync("athlete-calendar.html", "utf8");
  const milesBoard = fs.readFileSync("miles-board.html", "utf8");
  const speedBoard = fs.readFileSync("speed-board.html", "utf8");
  [
    ["Athlete Calendar", athleteCalendar],
    ["Miles Board", milesBoard],
    ["Speed Trak Board", speedBoard],
  ].forEach(([label, html]) => {
    if (html.includes("smartcoach-help-widget.js")) {
      throw new Error(`${label} should not load the shared feedback/help widget`);
    }
  });
  console.log("Public share pages hide feedback ok");
}

function checkPlanImportMultiGroupAssignment() {
  const html = fs.readFileSync("plan-import.html", "utf8");
  [
    'id="additionalGroups"',
    "Also Assign To",
    "function renderAdditionalGroups()",
    "function selectedAdditionalGroups()",
    "function selectedAssignedGroups()",
    "function rowsForAssignedGroup(groupName)",
    "var assignedGroups=selectedAssignedGroups();",
    "Additional groups are only available when creating a new plan.",
    "groupsToSave.map(function(groupName,index)",
    "days:append?rows:rowsForAssignedGroup(groupName)",
    "next.planName=els.planName.value+' - '+groupName",
    "Saved to '+savedGroups+' group",
  ].forEach((text) => {
    if (!html.includes(text)) throw new Error(`Upload/Paste Plan multi-group assignment missing ${text}`);
  });
  console.log("Upload/Paste Plan multi-group assignment ok");
}

function checkPlanSetupHidesArchivedPlans() {
  const html = fs.readFileSync("plan-setup.html", "utf8");
  [
    "function activeAssignmentPlans()",
    "return plans.filter(function(plan){return !isArchivedPlan(plan);});",
    "function isArchivedPlan(plan)",
    "if(/\\[SMARTCoach Plan Archive\\][\\s\\S]*?Archived:\\s*Yes/i.test(String(plan.schoolConstraints||'')))return true;",
    "var end=parsePlanDate(plan.endDate||plan.planEndDate);",
    "return end<today;",
    "function parsePlanDate(value)",
  ].forEach((text) => {
    if (!html.includes(text)) throw new Error(`Athlete Setup plan assignments should hide archived/past plans: ${text}`);
  });
  console.log("Athlete Setup archived plan filter ok");
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

function checkCalendarMeetSportPropagation() {
  const calendar = fs.readFileSync("training-calendar.html", "utf8");
  const app = fs.readFileSync("index.html", "utf8");
  const api = fs.readFileSync("api/ghl/meets.js", "utf8");
  [
    "var sport=sportFromDay(day);",
    "sport:sport,",
    "sport:normalizeSport(els.addDaySport.value)",
    "sport:day.sport,",
    "sport:sportFromDay(Object.assign({},calendarEditDay,updates))",
  ].forEach((text) => {
    if (!calendar.includes(text)) throw new Error(`Training Calendar meet sport propagation missing ${text}`);
  });
  [
    "function calendarDaySport(day)",
    "String(day&&day.coachNotes||'').match(/^Sport:\\s*(Track|Cross Country)\\s*$/im)",
    "var daySport=calendarDaySport(day);",
    "sport:daySport||linkedMeet&&linkedMeet.sport||inferMeetSport",
  ].forEach((text) => {
    if (!app.includes(text)) throw new Error(`Mobile calendar meet sport fallback missing ${text}`);
  });
  [
    "sport: sportValue(sport),",
    "if (sport) properties.sport = sportValue(sport);",
  ].forEach((text) => {
    if (!api.includes(text)) throw new Error(`Meets API custom-object sport persistence missing ${text}`);
  });
  console.log("Calendar meet sport propagation ok");
}

function checkDashboardMeetCorrectionFields() {
  const html = fs.readFileSync("dashboard.html", "utf8");
  const api = fs.readFileSync("api/ghl/correction.js", "utf8");
  [
    'id="meetCorrectionSport"',
    'id="meetCorrectionSeason"',
    'id="meetCorrectionSeasonYear"',
    "meetCorrectionSport:document.getElementById('meetCorrectionSport')",
    "meetCorrectionSeason:document.getElementById('meetCorrectionSeason')",
    "meetCorrectionSeasonYear:document.getElementById('meetCorrectionSeasonYear')",
    "setSelectValue(els.meetCorrectionSport,meetCorrectionRow.sport||'')",
    "setSelectValue(els.meetCorrectionSeason,meetCorrectionRow.season||'')",
    "els.meetCorrectionSeasonYear.value=meetCorrectionRow.seasonYear||''",
    "sport:els.meetCorrectionSport.value",
    "season:els.meetCorrectionSeason.value",
    "seasonYear:els.meetCorrectionSeasonYear.value",
    "sport:row.sport||''",
    "season:row.season||''",
    "seasonYear:row.seasonYear||''",
  ].forEach((text) => {
    if (!html.includes(text)) throw new Error(`Dashboard meet correction fields missing ${text}`);
  });
  [
    'const seasonYearValue = clean(nextValues.seasonYear);',
    'if (seasonYearValue && !Number.isFinite(Number(seasonYearValue))) throw httpError(400, "Season Year must be a number.");',
    '...(seasonYearValue ? { season_year: Number(seasonYearValue) } : {})',
  ].forEach((text) => {
    if (!api.includes(text)) throw new Error(`Correction API meet correction field handling missing ${text}`);
  });
  console.log("Dashboard meet correction fields ok");
}

function checkTrainingCorrectionWorkoutNoteReplacement() {
  const api = fs.readFileSync("api/ghl/correction.js", "utf8");
  [
    "Workout: nextValues.workoutType",
    "return !/^(Workout|Completed volume|Weather):/i.test(line.trim());",
    "workout_type: workoutTypeValue(nextValues.workoutType)",
  ].forEach((text) => {
    if (!api.includes(text)) throw new Error(`Training correction workout note replacement missing ${text}`);
  });
  console.log("Training correction workout note replacement ok");
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
    "<option>min</option><option>sec</option>",
    "return ['mi','km','m','min','sec'].map(function(value)",
    "if(/^sec|^second/.test(value))return 'sec';",
    "if(/^min|^minute/.test(value))return 'min';",
    "mi|mile|miles|km|kilometer|kilometers|m|meter|meters|min|minute|minutes|sec|second|seconds",
    "distanceValue:match[3],",
    "distanceUnit:normalizeQualityDistanceUnit(match[4]),",
    "effort:String(match[5]||'Threshold').trim(),",
    "recoveryUnit:normalizeQualityRecoveryUnit(recovery&&recovery[2]||'min (jog)')",
    "if(text.indexOf('min')>=0||text.indexOf('sec')>=0)return 0;",
    "function stripQualityGeneratedLines(text)",
    "if(parseQualityDistanceLine(value))return false;",
    "parsedRows.forEach(addQualityRow);",
    "stripQualityGeneratedLines(calendarEditDay.details||'')",
    "if(/^mi\\b|^mile/.test(value))return 'mi ('+movement+')';",
  ];
  required.forEach((text) => {
    if (!html.includes(text)) throw new Error(`Training Calendar quality edit parser missing ${text}`);
  });
  console.log("Training Calendar quality edit parser ok");
}

function checkTrainingAdjustmentAuditDates() {
  const api = fs.readFileSync("api/ghl/training-plan.js", "utf8");
  [
    "function coachDateTimeLabel(date)",
    'timeZone: "America/Chicago"',
    "Adjustment Date: ${coachDateTimeLabel(new Date())}",
    "Status Update Date: ${coachDateTimeLabel(new Date())}",
  ].forEach((text) => {
    if (!api.includes(text)) throw new Error(`Training adjustment audit date missing ${text}`);
  });
  console.log("Training adjustment audit dates ok");
}

function checkQualityWorkoutTypesAccepted() {
  const calendar = fs.readFileSync("training-calendar.html", "utf8");
  const trainingPlanApi = fs.readFileSync("api/ghl/training-plan.js", "utf8");
  const syncApi = fs.readFileSync("api/ghl/sync-session.js", "utf8");
  const correctionApi = fs.readFileSync("api/ghl/correction.js", "utf8");
  const manualMileageApi = fs.readFileSync("api/ghl/manual-mileage.js", "utf8");
  [
    "Threshold",
    "Interval",
    "Repetition",
    "Hills",
    "Fast Reps",
    "Speed Endurance I",
    "Speed Endurance II",
    "Special Endurance I",
    "Special Endurance II",
    "Intensive Tempo",
    "Extensive Tempo",
  ].forEach((type) => {
    if (!calendar.includes(type)) throw new Error(`Training Calendar quality workout type missing ${type}`);
  });
  [
    'threshold: "lactate_threshold"',
    'interval: "aerobic_power"',
    'repetition: "acceleration"',
    'fast_reps: "acceleration"',
    'hills: "hill_sprints"',
    'hill: "hill_sprints"',
    "speed_endurance_ii",
    "special_endurance_ii",
  ].forEach((text) => {
    [trainingPlanApi, syncApi, correctionApi].forEach((source) => {
      if (!source.includes(text)) throw new Error(`Workout type save aliases missing ${text}`);
    });
  });
  [
    'threshold: "Lactate Threshold"',
    'interval: "Aerobic Power"',
    'repetition: "Acceleration"',
    'fast_reps: "Acceleration"',
    'hills: "Hill Sprints"',
  ].forEach((text) => {
    if (!manualMileageApi.includes(text)) throw new Error(`Manual mileage workout type alias missing ${text}`);
  });
  if (!syncApi.includes("createPerformanceRecordWithWorkoutTypeFallback")) throw new Error("Sync should retry workout saves when GHL rejects a workout type option");
  if (!syncApi.includes("delete fallback.workout_type")) throw new Error("Sync should retry workout saves without rejected workout type option");
  console.log("Quality workout type aliases ok");
}

function checkManualMileageQualitySession() {
  const dashboard = fs.readFileSync("dashboard.html", "utf8");
  const manualMileageApi = fs.readFileSync("api/ghl/manual-mileage.js", "utf8");
  const howTo = fs.readFileSync("SMART_TRAK_COACH_HOW_TO.md", "utf8");
  [
    'id="manualMileageMode"',
    'value="quality">Quality Session',
    'id="manualMileageWarmup"',
    'id="manualMileageCooldown"',
    'id="manualMileageRepRows"',
    'data-quality-splits',
    "function collectManualQualitySession()",
    "function manualQualitySplitsText(quality)",
  ].forEach((text) => {
    if (!dashboard.includes(text)) throw new Error(`Manual quality session UI missing ${text}`);
  });
  [
    "function normalizeQualitySession(raw)",
    'kind: "rep"',
    "Set ${setIndex + 1} Rep ${splitIndex + 1}",
    "Manual quality session entry",
    'speed_endurance_ii: "Speed Endurance II"',
    'special_endurance_ii: "Special Endurance II"',
  ].forEach((text) => {
    if (!manualMileageApi.includes(text)) throw new Error(`Manual quality session API missing ${text}`);
  });
  [
    "Use Log Miles for manual mileage entries or quality sessions",
    "warmup, reps, rests, splits, and cooldown",
    "Quality-session rep splits appear with the completed workout details.",
  ].forEach((text) => {
    if (!howTo.includes(text)) throw new Error(`Manual quality session guide missing ${text}`);
  });
  console.log("Manual mileage quality session ok");
}

function checkTrainingCustomization() {
  const calendar = fs.readFileSync("training-calendar.html", "utf8");
  const app = fs.readFileSync("index.html", "utf8");
  const route = fs.readFileSync("api/smart-trak/[route].js", "utf8");
  [
    'id="trainingCustomBtn"',
    'id="trainingCustomModal"',
    "function defaultTrainingCustomizationRules()",
    "Easy / Recovery Run",
    "Lactate Threshold",
    "Save Customization",
    "fetch('/api/smart-trak/training-customization?account='",
  ].forEach((text) => {
    if (!calendar.includes(text)) throw new Error(`Training Calendar customization UI missing ${text}`);
  });
  [
    'route === "training-customization"',
    "function accountTrainingCustomization",
    "trainingCustomization: normalizeTrainingCustomization",
    "lastTrainingCustomizationSync",
  ].forEach((text) => {
    if (!route.includes(text)) throw new Error(`Training customization API missing ${text}`);
  });
  [
    "TRAINING_CUSTOMIZATION=null",
    "applyTrainingCustomization(data&&data.trainingCustomization)",
    "function applyCustomPaceRules(rules)",
    "applyCustomPaceRules(rules);",
  ].forEach((text) => {
    if (!app.includes(text)) throw new Error(`SMARTCoach app customization target support missing ${text}`);
  });
  console.log("Training customization ok");
}

function checkMobileCalendarWorkoutPriority() {
  const mobile = fs.readFileSync("index.html", "utf8");
  [
    "function canAutoApplyCalendarWorkout(group)",
    "if(group.trainingPlanAuto==='calendar-selected')return false;",
    "function hasCalendarWorkoutSelection(target)",
    "String(target.trainingPlanTitle||'').indexOf('SMART Trak Calendar')===0",
    "target.trainingPlanDaySourceId",
    "target.trainingPlanDayDate",
    "function canAutoApplySavedGroupPlan(group)",
    "if(hasCalendarWorkoutSelection(group))return false;",
    "if(hasCalendarWorkoutSelection(r))return false;",
    "if(CL&&CL.trainingPlanAuto==='calendar-selected')return false;",
    "if(groupPlan&&canAutoApplySavedGroupPlan(CL))",
    "onclick=\"selectTrainingPlanDay('+TP.indexOf(plan)+','+di+')\"",
    "function selectTrainingPlanDay(planIndex,dayIndex)",
    "function sameTrainingPlanDay(a,b)",
    "var active=sameTrainingPlanDay(plan.selectedDay,d);",
    "String(a.date||a.trainingPlanDayDate||'')",
    "['calendar-athlete-selected','calendar-group-selected'].indexOf(String(r.trainingPlanAuto||''))<0",
    "if(TPA.kind==='athlete'&&plan.calendarPlan)TPA.target.trainingPlanAuto='calendar-athlete-selected';",
    "function applySelectedTrainingPlanToGroupRunners(plan)",
    "if(applySelectedTrainingPlanToTarget(r,plan))r.trainingPlanAuto='calendar-group-selected';",
    "changed=clearGroupCalendarRunnerOverrides(log)||changed;",
    "function clearGroupCalendarRunnerOverrides(group)",
    "var target=group||CL;",
    "if(isRunnerCalendarPlanOverride(r)){clearAthleteTrainingPlanFields(r);changed=true;}",
    "var planLabel=r.trainingPlanAuto==='calendar-group-selected'?'Group Plan':'Individual Plan';",
    "target.trainingPlanAuto=plan.calendarPlan?'calendar-selected':'';",
    "trainingPlanAuto:l.trainingPlanAuto||''",
    "trainingPlanAuto:r.trainingPlanAuto||''",
    "function selectedCalendarPlanDay(days)",
    "plan.selectedDay=selectedCalendarPlanDay(days);",
    "function useSelectedTrainingPlanForGroup()",
    "applySelectedTrainingPlanToTarget(CL,plan)",
    "applySelectedTrainingPlanToGroupRunners(plan);",
    "clearCachedPlanTarget(r);",
    "function isSpeedMetricsPlanDay(day)",
    "function createFieldPracticeFromPlanDay(plan,day)",
    "function openSelectedPlanDayFieldPractice(planIndex,dayIndex)",
    "function calendarSpeedMetricFieldPractices(saved)",
    "function fieldPracticeAllPractices()",
    "Open Speed Metrics",
    "Speed Metrics ready",
    "function isRunnerCalendarPlanOverride(r)",
    "String(r.trainingPlanTitle||'').indexOf('SMART Trak Calendar')===0",
    "onclick=\"useSelectedTrainingPlanForGroup()\"",
    "Workout selected for the group.",
  ].forEach((text) => {
    if (!mobile.includes(text)) throw new Error(`mobile calendar workout priority missing ${text}`);
  });
  if (mobile.includes("if(applyNow)useSelectedTrainingPlan();")) {
    throw new Error("Mobile workout card taps must not auto-create athlete overrides before Use for Group.");
  }
  if (mobile.includes("if(group.trainingPlanId&&!group.trainingPlanAuto)return false;")) {
    throw new Error("Mobile SMART Trak Calendar workouts should not be blocked by an older saved group plan.");
  }
  console.log("mobile calendar workout priority ok");
}

function checkMobileTrainingPlanArchiveFilter() {
  const mobile = fs.readFileSync("index.html", "utf8");
  [
    "function activeTrainingPlans(plans)",
    "if(isPastTrainingPlan(plan))return false;",
    "function isPastTrainingPlan(plan)",
    "var end=parseTrainingPlanDate(plan&&plan.endDate||plan&&plan.planEndDate);",
    "return end<today;",
    "function parseTrainingPlanDate(value)",
  ].forEach((text) => {
    if (!mobile.includes(text)) throw new Error(`mobile training plan picker should hide archived/past plans: ${text}`);
  });
  console.log("mobile training plan archive filter ok");
}

function checkMobileCalendarMeetDedup() {
  const mobile = fs.readFileSync("index.html", "utf8");
  [
    "var linkedRecordId=String(linkedMeet&&linkedMeet.id||day.linkedMeetId||'');",
    "var log=linkedRecordId?findManagedMeetLogByRecordId(linkedRecordId):null;",
    "sharedGroupId:linkedRecordId?('meetrec_'+linkedRecordId):id",
    "sharedGroupId:linkedRecordId?('meetrec_'+linkedRecordId):(log.sharedGroupId||id)",
    "function findManagedMeetLogByRecordId(recordId)",
    "if(recordId&&shared.indexOf('meetrec_')===0)managedRecordIds[recordId]=true;",
    "if(!activeIds[shared]||(recordId&&managedRecordIds[recordId]))",
  ].forEach((text) => {
    if (!mobile.includes(text)) throw new Error(`Mobile calendar meet dedup missing ${text}`);
  });
  console.log("mobile calendar meet dedup ok");
}

function checkMobileMeetListSort() {
  const mobile = fs.readFileSync("index.html", "utf8");
  [
    "function meetGroupDateSortValue(group)",
    "return isNaN(date.getTime())?Number.MAX_SAFE_INTEGER:date.getTime();",
    "function compareMeetGroupsByDate(a,b)",
    "if(aPast!==bPast)return aPast?1:-1;",
    "return meetGroupDateSortValue(a)-meetGroupDateSortValue(b)||String(meetDisplayTitle(a)).localeCompare(String(meetDisplayTitle(b)));",
    "if(GV==='meets')groups.sort(compareMeetGroupsByDate);",
  ].forEach((text) => {
    if (!mobile.includes(text)) throw new Error(`Mobile meet list sort missing ${text}`);
  });
  console.log("mobile meet list sort ok");
}

function checkAthleteCalendarBulkEmailLinks() {
  const html = fs.readFileSync("athletes.html", "utf8");
  const api = fs.readFileSync("api/ghl/athletes.js", "utf8");
  [
    'id="emailCalendarLinksBtn"',
    "Email Calendar Links",
    'id="calendarEmailModal"',
    'id="calendarEmailDirectLink"',
    'id="calendarEmailProvider"',
    "calendar-email-provider",
    "Email Provider",
    '<option value="gmail" selected>Gmail</option>',
    "Default mail app",
    "Gmail",
    "Outlook",
    "Yahoo Mail",
    "Email Athlete Calendar Links",
    "Choose the email provider in the action row below",
    "function calendarEmailSourceAthletes()",
    "return sortAthletes(filteredAthletes()).filter(function(a){return a.smartcoachActive;});",
    "function validEmail(value)",
    "return 'mailto:'+String(item.email||'').trim()+'?subject='",
    "function calendarEmailProvider()",
    "return ui.provider&&ui.provider.value||'gmail';",
    "function calendarEmailDraftUrl(item)",
    "https://mail.google.com/mail/?view=cm&fs=1",
    "https://outlook.office.com/mail/deeplink/compose",
    "https://compose.mail.yahoo.com/",
    "function openCalendarEmailModal()",
    "function openNextCalendarEmailDraft()",
    "function copyCalendarEmailMessages()",
    "function downloadCalendarEmailCsv()",
    "function setupCalendarEmailTools()",
    "document.addEventListener('DOMContentLoaded',setupCalendarEmailTools);",
    "fetch(apiUrl('/api/smart-trak/athletes?action=calendarLink&athleteId='",
    "ui.direct.href=href;",
    "ui.direct.target=provider==='mailto'?'':'_blank';",
    "ui.direct.click();",
    "choose Gmail/Outlook/Yahoo",
    "mailto:",
    "Download CSV",
    "Open Draft Link",
    "Open Next Draft",
    "Missing athlete email",
    "smartcoach-athlete-calendar-email-links.csv",
  ].forEach((text) => {
    if (!html.includes(text)) throw new Error(`Athlete Calendar bulk email links missing ${text}`);
  });
  if (html.includes("fetch('/api/smart-trak/calendar-email") || html.includes("sendCalendarEmail") || html.includes("window.location.href=calendarEmailMailto")) {
    throw new Error("Athlete Calendar bulk email links should use the coach email provider, not server-sent email.");
  }
  const directLink = html.match(/<a id="calendarEmailDirectLink"[^>]*>/);
  if (!directLink || directLink[0].includes('target="_blank"')) {
    throw new Error("Athlete Calendar draft link markup should not force mailto into a blank browser tab.");
  }
  [
    'clean(req.query && req.query.action) === "calendarLink"',
    "athleteAccessCode(accountKey, athlete.id)",
    "`/athlete-calendar.html?account=${encodeURIComponent(accountKey)}&athlete=${encodeURIComponent(athlete.id)}&code=${encodeURIComponent(code)}`",
  ].forEach((text) => {
    if (!api.includes(text)) throw new Error(`Athlete Calendar link API missing ${text}`);
  });
  console.log("Athlete Calendar bulk email links ok");
}

function checkAthleteCalendarQuestions() {
  const athletes = fs.readFileSync("athletes.html", "utf8");
  const calendar = fs.readFileSync("athlete-calendar.html", "utf8");
  const api = fs.readFileSync("api/smart-trak/[route].js", "utf8");
  const lib = fs.readFileSync("lib/athlete-calendar.js", "utf8");
  [
    'id="calendarQuestionsBtn"',
    "Calendar Questions",
    'id="calendarQuestionsModal"',
    'id="calendarQuestionRows"',
    'id="saveCalendarQuestionsBtn"',
    "Complete Workout Questions",
    "Answers are added to the Athlete Note column",
    "function openCalendarQuestionsModal()",
    "function collectCalendarQuestionSettings()",
    "function saveCalendarQuestionSettings()",
    "function setupCalendarQuestionTools()",
    "document.addEventListener('DOMContentLoaded',setupCalendarQuestionTools);",
    "fetch(apiUrl('/api/smart-trak/athlete-calendar-questions')",
    "questions:questions",
    ".filter(Boolean).slice(0,5)",
  ].forEach((text) => {
    if (!athletes.includes(text)) throw new Error(`Athlete Calendar Questions coach setup missing ${text}`);
  });
  [
    'id="calendarQuestions"',
    "athleteCalendarQuestions=[]",
    "athleteCalendarQuestions=normalizeCalendarQuestions(data.athleteCalendarQuestions)",
    "function renderCalendarQuestions()",
    "function collectCalendarQuestionAnswers()",
    "Answer required:",
    "athleteCalendarAnswers:answers",
    ".slice(0,5)",
  ].forEach((text) => {
    if (!calendar.includes(text)) throw new Error(`Athlete Calendar question modal missing ${text}`);
  });
  [
    'route === "athlete-calendar-questions"',
    "function accountAthleteCalendarQuestions",
    "athleteCalendarQuestions: normalizeAthleteCalendarQuestions",
    "lastAthleteCalendarQuestionsSync",
    "function normalizeAthleteCalendarQuestions",
    "function normalizeAthleteCalendarQuestion",
    ".filter(Boolean).slice(0, 5)",
  ].forEach((text) => {
    if (!api.includes(text)) throw new Error(`Athlete Calendar Questions API missing ${text}`);
  });
  [
    "athleteCalendarQuestions: questionSettings",
    "function loadAthleteCalendarQuestionSettings",
    "function normalizeAthleteCalendarAnswers",
    "const missingRequired",
    "function composeAthleteSubmittedNotes",
    "Workout questions:",
    "athleteSubmittedNote: notes",
  ].forEach((text) => {
    if (!lib.includes(text)) throw new Error(`Athlete Calendar Questions sync path missing ${text}`);
  });
  console.log("Athlete Calendar questions ok");
}

function checkAthleteCalendarSubmittedStatusPill() {
  const calendar = fs.readFileSync("athlete-calendar.html", "utf8");
  const lib = fs.readFileSync("lib/athlete-calendar.js", "utf8");
  [
    "var pillLabel=submitted?submitted.label:(day.status||'Scheduled');",
    '<span class="pill \'+(submitted?submitted.className:\'\')+\'">\'+esc(pillLabel)+\'</span>',
    "Athlete submitted: '+esc(submitted.label)",
  ].forEach((text) => {
    if (!calendar.includes(text)) throw new Error(`Athlete Calendar submitted status pill missing ${text}`);
  });
  [
    "const activeMeetIds = await loadActiveMeetIds(context.accountKey);",
    "raceCompletedVolume(day, actualVolume)",
    "function raceCompletedVolume(day, actualVolume)",
    "const raceMiles = parseRaceDistanceMiles",
    "const supportMiles = raceSupportMiles",
    "function raceSupportMiles(text)",
    "function parseRaceDistanceMiles(text)",
    "return `${formatMiles(totalMiles)} total`;",
    "athleteCanSeeDay(athlete, groups, day) && trainingDayHasActiveMeet(day, activeMeetIds)",
    "athleteCanSeeDay(athlete, groups, day) || !trainingDayHasActiveMeet(day, activeMeetIds)",
    "async function loadActiveMeetIds(accountKey)",
    "function trainingDayHasActiveMeet(day, activeMeetIds)",
    "return activeMeetIds.has(linkedMeetId);",
    "loadSubmittedTrainingStatuses(context.accountKey, athlete)",
    "function applySubmittedTrainingStatus(day, submittedStatuses)",
    "function submittedStatusFromNote(note)",
    "athlete calendar submission",
    "smartcoach status: voided",
  ].forEach((text) => {
    if (!lib.includes(text)) throw new Error(`Athlete Calendar deleted meet guard missing ${text}`);
  });
  console.log("Athlete Calendar submitted status pill ok");
}

function checkAthleteCalendarSelfReportedWorkouts() {
  const calendar = fs.readFileSync("athlete-calendar.html", "utf8");
  const lib = fs.readFileSync("lib/athlete-calendar.js", "utf8");
  [
    'id="addWorkoutBtn"',
    'id="selfReportModal"',
    'data-self-report-mode="quality"',
    'data-self-report-splits',
    "function collectSelfReportQualitySession()",
    "action:'athlete-added'",
    "Add at least one quality set.",
  ].forEach((text) => {
    if (!calendar.includes(text)) throw new Error(`Athlete Calendar self-report UI missing ${text}`);
  });
  [
    "function isAthleteAddedWorkout",
    "function buildAthleteAddedSyncPayload",
    "Athlete added quality session",
    "normalizeQualitySession(payload.qualitySession)",
    "forceDuplicateSync: true",
    "const syncSession = require(\"../api/ghl/sync-session\");",
  ].forEach((text) => {
    if (!lib.includes(text)) throw new Error(`Athlete Calendar self-report sync missing ${text}`);
  });
  console.log("Athlete Calendar self-reported workouts ok");
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
    "function seasonYearText(row)",
    "if((sport==='Cross Country'||sport==='Track')&&seasonYear)return sport+' '+seasonYear;",
    "if((seasonSport==='Cross Country'||seasonSport==='Track')&&seasonYear)return seasonSport+' '+seasonYear;",
    "var groupSport=sportText(group);",
    "var matchesSport=sport==='all'||groupSport===sport||results.length>0;",
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

function checkMeetHistoryImportOnlySpreadsheet() {
  const html = fs.readFileSync("meet-history.html", "utf8");
  const removed = [
    'id="auditBtn"',
    'id="auditPanel"',
    "Meet History Data Audit",
    'id="importAthleticMode"',
    "Athletic.net Import",
    'id="importImageMode"',
    'id="importImage"',
    "Screenshot / Photo",
    "isAthleticImportText(text))return parseAthleticNetRows(text)",
  ];
  removed.forEach((text) => {
    if (html.includes(text)) throw new Error(`Meet History should not expose unreliable import/audit control: ${text}`);
  });
  [
    "Spreadsheet File",
    'id="importFile"',
    "Paste spreadsheet rows or upload a CSV/TSV template.",
    "function parseImportRows(text)",
  ].forEach((text) => {
    if (!html.includes(text)) throw new Error(`Meet History spreadsheet import missing ${text}`);
  });
  console.log("Meet History spreadsheet-only import ok");
}

function checkMeetHistoryImportedResultCorrections() {
  const html = fs.readFileSync("meet-history.html", "utf8");
  const api = fs.readFileSync("api/ghl/correction.js", "utf8");
  [
    'id="historyEditModal"',
    'id="historyVoidModal"',
    "<th>Actions</th>",
    "function openHistoryEdit(rowKeyValue)",
    "function saveHistoryEdit()",
    "function openHistoryVoid(rowKeyValue)",
    "function saveHistoryVoid()",
    "fetch('/api/smart-trak/correction'",
    "sport:els.historyEditSport.value",
    "seasonYear:els.historyEditSeasonYear.value",
    "resultType:'historical import'",
    "historyActionButtons(row)",
  ].forEach((text) => {
    if (!html.includes(text)) throw new Error(`Meet History imported result corrections missing ${text}`);
  });
  [
    'if (!contactId && !isMeetResult && !relayCorrection) throw httpError(400, "Missing athlete contact.");',
    'sport: prop(props, "sport")',
    'season: prop(props, "season")',
    'seasonYear: String(prop(props, "season_year") || "")',
    '...(clean(nextValues.sport) ? { sport: optionValue(nextValues.sport) } : {})',
    '...(clean(nextValues.season) ? { season: optionValue(nextValues.season) } : {})',
    '...(seasonYearValue ? { season_year: Number(seasonYearValue) } : {})',
    'sport: clean(data.sport)',
  ].forEach((text) => {
    if (!api.includes(text)) throw new Error(`Correction API imported history support missing ${text}`);
  });
  console.log("Meet History imported result corrections ok");
}

function checkMeetResultSplitDetails() {
  const dashboard = fs.readFileSync("dashboard.html", "utf8");
  const history = fs.readFileSync("meet-history.html", "utf8");
  [
    "data-meet-detail=\"1\"",
    "function openMeetResultDetail(button)",
    "Lap / Split Times",
    "parseSplitLines(row.splitsText)",
    "No lap or split times saved for this result.",
  ].forEach((text) => {
    if (!dashboard.includes(text)) throw new Error(`Dashboard meet result split details missing ${text}`);
  });
  [
    'id="historyDetailModal"',
    'data-history-detail="',
    "function openHistoryDetail(rowKeyValue)",
    "function parseSplitLines(text)",
    "Lap / Split Times",
    "No lap or split times saved for this result.",
  ].forEach((text) => {
    if (!history.includes(text)) throw new Error(`Meet History split details missing ${text}`);
  });
  console.log("Meet result split details ok");
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

function checkEquipmentInventoryModelSerial() {
  const athletes = fs.readFileSync("athletes.html", "utf8");
  const mobile = fs.readFileSync("index.html", "utf8");
  const api = fs.readFileSync("api/smart-trak/[route].js", "utf8");
  [
    "data-inventory-model",
    "data-inventory-serial",
    "data-inventory-availability",
    "data-inventory-lost",
    "id=\"openEquipmentSetupBtn\"",
    "Setup Items",
    "function refreshEquipmentSetupViews()",
    "function moveEquipmentSetupRow(row,direction)",
    "data-equipment-setup-move=\"up\"",
    "data-equipment-setup-move=\"down\"",
    "title=\"Move up\"",
    "title=\"Move down\"",
    "equipment-setup-row",
    "function equipmentInventoryForIssuedRow(row)",
    "function inventoryUnavailableCount(inv,total)",
    "function inventoryItemUnavailable(itemId,item)",
    "function inventoryCapacityIssue(skipAthleteKey,skipCoachKey,itemId,item)",
    "function inventoryAlphaNumber(value)",
    "row.model=String(row.model||row.modelNumber||'').trim();",
    "row.serialNumber=String(row.serialNumber||row.serial||'').trim();",
    "row.availability=equipmentInventoryAvailability",
    "Assigned #",
    "Serial #",
  ].forEach((text) => {
    if (!athletes.includes(text)) throw new Error(`Equipment Trak inventory metadata missing ${text}`);
  });
  if (athletes.includes("data-equipment-setup=\"1\"")) {
    throw new Error("Equipment setup should live in the Equipment Trak modal, not athlete details.");
  }
  [
    "function equipmentInventoryForRecordItem(itemId,row)",
    "inventory&&inventory.model",
    "inventory&&inventory.serialNumber",
    "Assigned #",
  ].forEach((text) => {
    if (!mobile.includes(text)) throw new Error(`Mobile Equipment Trak metadata search missing ${text}`);
  });
  [
    "model: cleanSetupText(raw.model || raw.modelNumber).slice(0, 80)",
    "serialNumber: cleanSetupText(raw.serialNumber || raw.serial).slice(0, 120)",
    "availability: normalizeEquipmentInventoryAvailability",
    "function duplicateInventoryUnavailableEquipment(records, inventory, coachRecords = {})",
    "function duplicateInventoryCapacityIssue(records, inventory, coachRecords = {})",
    "function equipmentDuplicateMessage(duplicate)",
    "function equipmentInventoryRowBlocksItem(row, itemId, item)",
    "function inventoryAlphaNumber(value)",
  ].forEach((text) => {
    if (!api.includes(text)) throw new Error(`Equipment Trak API metadata persistence missing ${text}`);
  });
  console.log("Equipment Trak inventory model/serial checks ok");
}

function checkAthletesDocuTrakSetupLayout() {
  const athletes = fs.readFileSync("athletes.html", "utf8");
  if (athletes.includes("coach-facing view")) {
    throw new Error("Athletes page subtitle should not say coach-facing view.");
  }
  if (!athletes.includes('<div class="sectiontitle">Checklist Requirements <button id="addDocuItemBtn" class="utility section-action" type="button">Add</button></div>')) {
    throw new Error("Docu Trak add requirement button should stay in the Checklist Requirements header.");
  }
  if (athletes.includes('<button id="addDocuItemBtn" class="utility" type="button">Add Requirement</button>')) {
    throw new Error("Docu Trak add requirement button should not sit in the modal footer.");
  }
  console.log("Athletes Docu Trak setup layout ok");
}

function checkEquipmentIssueSheetStickyHeader() {
  const athletes = fs.readFileSync("athletes.html", "utf8");
  [
    "#equipmentIssueSheetPane{display:flex;flex-direction:column;min-height:0}",
    ".issue-sheet-wrap{max-height:calc(100vh - 250px);overflow:auto}",
    ".issue-sheet-wrap table{border-collapse:separate;border-spacing:0}",
    ".issue-sheet-wrap th{top:0;z-index:5;background:#f8fafc",
  ].forEach((text) => {
    if (!athletes.includes(text)) throw new Error(`Equipment Trak issue sheet sticky header missing ${text}`);
  });
  if (athletes.includes(".issue-sheet-wrap th{top:57px")) {
    throw new Error("Equipment Trak issue sheet header should not use the old fixed toolbar offset.");
  }
  console.log("Equipment Trak issue sheet sticky header checks ok");
}

function checkEquipmentCoachIssued() {
  const athletes = fs.readFileSync("athletes.html", "utf8");
  const api = fs.readFileSync("api/smart-trak/[route].js", "utf8");
  [
    "equipmentCoachRecords={}",
    "Coach Issued",
    "function saveEquipmentCoachRecord()",
    "function duplicateIssuedCoachItem(coachKey,nextItems)",
    "function deleteEquipmentCoachRecord(coachKey,itemId)",
    "data-delete-equipment-coach",
    "function duplicateEquipmentGlobalKey(itemId,item)",
    "action:'save-coach'",
    "data-edit-equipment-coach",
  ].forEach((text) => {
    if (!athletes.includes(text)) throw new Error(`Equipment Trak coach-issued UI missing ${text}`);
  });
  [
    'action === "save-coach"',
    "coachRecords: normalizeEquipmentCoachRecords(raw.coachRecords)",
    "function normalizeEquipmentCoachRecords(records)",
    "function outstandingCoachEquipmentRecordsForPool(seasons, pool)",
    "duplicateIssuedEquipment(current.records, current.inventory, current.coachRecords)",
    "function equipmentDuplicateGlobalKey(itemId, item)",
    "seenCoachGlobal",
  ].forEach((text) => {
    if (!api.includes(text)) throw new Error(`Equipment Trak coach-issued API missing ${text}`);
  });
  console.log("Equipment Trak coach-issued checks ok");
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

function checkMobileFieldEventCaptureControls() {
  const mobile = fs.readFileSync("index.html", "utf8");
  [
    "Clear this field flight draft? This removes all athletes and unsaved attempts for this event.",
    "function normalizeFieldMarkForSave(eventName,mark)",
    "function normalizeFeetInchesQuarterMark(mark)",
    "Math.round(inches*4)/4",
    "Enter marks as feet-inches with quarter inches, like 15-0.25.",
    "function fieldAttemptInfoMarkText(attempt)",
    "function fieldAttemptInfoDetailText(attempt,index)",
    "font-size:21px;line-height:1.15",
    "font-size:15px;font-weight:400",
  ].forEach((text) => {
    if (!mobile.includes(text)) throw new Error(`mobile field event capture control missing ${text}`);
  });
  console.log("mobile field event capture controls ok");
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
    "function editKeepTrakNote(id)",
    "function clearKeepTrakEditor()",
    "KEEP_TRAK={notes:[],editingId:''}",
    "Save Edit",
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

function checkAttendanceMobileSummary() {
  const mobile = fs.readFileSync("index.html", "utf8");
  [
    'id="m-attendance-summary"',
    'id="att-save-status"',
    'id="att-save-btn"',
    "function setAttendanceSaveStatus(message,type)",
    "openAttendanceSummary()",
    "function attendanceSavedRecord(cp,r)",
    "function attendanceRowMatchesGroup(row)",
    "function attendanceSummarySourceRows()",
    "function attendanceSummaryRange()",
    "function attendanceFilteredSummaryRows()",
    "function setAttendanceSummaryRange(mode)",
    "function setAttendanceSummaryCustomRange()",
    "function loadAttendanceSummaryRows()",
    "smartCoachApiUrl('/api/smart-trak/attendance')",
    ".filter(attendanceRowMatchesGroup)",
    "function attendanceRunnerSummaryCounts(r,sourceRows)",
    "function attendanceSummaryRows()",
    "function attendanceDetailRowsForRunner(r)",
    "function attendanceDetailHtml(selectedId)",
    "function renderAttendanceSummary(selectedId)",
    "Loaded from SMART Trak.",
    "Recent marks",
    "var rows=details.map(function(row)",
    "No saved attendance marks for this athlete yet.",
    "Select an athlete or tap a row to see recent marks.",
    '<span class="slbl">Range</span>',
    '<option value="custom"',
    'id="att-summary-start"',
    'id="att-summary-end"',
    "data-att-athlete-id",
    "querySelectorAll('[data-att-athlete-id]')",
    "setAttendanceSaveStatus('Saving attendance to SMART Trak...','warn')",
    "setAttendanceSaveStatus('Complete','ok')",
    "Checked Out is included in Present for this summary.",
    "<th>Name</th><th>%</th><th>P</th><th>A</th><th>E</th><th>T</th>",
    "counts.present+counts.checked_out",
  ].forEach((text) => {
    if (!mobile.includes(text)) throw new Error(`mobile attendance summary missing ${text}`);
  });
  if (mobile.includes("details.slice(0,12)")) throw new Error("mobile attendance summary still caps selected-athlete recent marks");
  console.log("mobile attendance summary ok");
}

function checkAttendanceSeasonAttachment() {
  const mobile = fs.readFileSync("index.html", "utf8");
  const desktop = fs.readFileSync("attendance.html", "utf8");
  const api = fs.readFileSync("api/smart-trak/[route].js", "utf8");
  const registry = fs.readFileSync("lib/account-registry.js", "utf8");
  [
    'id="att-sport" required',
    '<option value="">Choose sport</option>',
    'id="att-season"',
    "function attendanceSport()",
    "function attendanceSeason()",
    "sport:attendanceSport()",
    "season:attendanceSeason()",
    "Off Season Track",
    "Choose Cross Country or Track before saving attendance.",
    "if(sport)sport.value='';",
  ].forEach((text) => {
    if (!mobile.includes(text)) throw new Error(`mobile attendance season attachment missing ${text}`);
  });
  if (mobile.includes("return input&&input.value?input.value:(CL&&CL.type==='meet'?'Track':'Cross Country');")) {
    throw new Error("mobile attendance sport must not default to Track/Cross Country.");
  }
  [
    'id="sportFilter"',
    'id="seasonFilter"',
    "function attendanceSeasonLabel(row)",
    "data-sport",
    "data-season",
    "sport:tr.querySelector('[data-sport]').value",
    "season:seasonParts.season",
    "seasonYear:seasonParts.seasonYear",
    "body:JSON.stringify({records:[next],deleteIds:[id]})",
    "'sport','season','seasonYear'",
    'id="confirmOverlay"',
    "function openConfirm(title,message,detail,okLabel,onConfirm)",
    "Delete attendance mark?",
    "formatLongDate(row.date)",
  ].forEach((text) => {
    if (!desktop.includes(text)) throw new Error(`desktop attendance season attachment missing ${text}`);
  });
  if (desktop.includes("confirm(")) throw new Error("desktop Attendance should use the in-page confirmation dialog.");
  [
    "sport: firstQueryValue(req.query && req.query.sport)",
    "season: firstQueryValue(req.query && req.query.season)",
    "const activeAttendance = await activeAttendanceRecords({ attendance, token, locationId });",
    "async function activeAttendanceRecords({ attendance, token, locationId })",
    "athletes.filter((athlete) => athlete && athlete.smartcoachActive)",
    "return rows.filter((row) => {",
    "const sport = cleanSetupText(payload && payload.sport);",
    "seasonYear",
  ].forEach((text) => {
    if (!api.includes(text)) throw new Error(`attendance API season attachment missing ${text}`);
  });
  [
    "const sport = clean(filters.sport).toLowerCase();",
    "sport: clean(record.sport)",
    "season: clean(record.season)",
    "seasonYear: Number(record.seasonYear) || null",
    "item.sport",
    "item.season",
    "item.seasonYear",
  ].forEach((text) => {
    if (!registry.includes(text)) throw new Error(`attendance registry season attachment missing ${text}`);
  });
  console.log("attendance season attachment ok");
}

function checkGroupsTrayAddHidden() {
  const mobile = fs.readFileSync("index.html", "utf8");
  if (!mobile.includes('<span style="color:#fff">SMARTCoach</span>')) {
    throw new Error("Mobile home header should say SMARTCoach.");
  }
  if (mobile.includes('<span style="color:#fff">Groups</span>')) {
    throw new Error("Mobile home header should not say Groups.");
  }
  if (!mobile.includes(".nav-title.detail-title{min-width:0;line-height:1.22;padding:0 8px;display:block;overflow-wrap:anywhere}")) {
    throw new Error("Mobile detail header should reserve room for long meet names.");
  }
  if (!mobile.includes('<div class="nav-btn" onclick="go(\'s-groups\')">&#8249; Back</div>')) {
    throw new Error("Mobile detail header should use Back instead of Groups.");
  }
  if (!mobile.includes('<div class="nav-title detail-title">')) {
    throw new Error("Mobile detail header should use the detail title layout.");
  }
  const detailStart = mobile.indexOf('<div class="screen" id="s-group">');
  const detailEnd = mobile.indexOf('<!-- LOG ENTRY -->', detailStart);
  const detailHeader = detailStart >= 0 && detailEnd > detailStart ? mobile.slice(detailStart, detailEnd) : "";
  if (detailHeader.includes("smart-logo")) {
    throw new Error("Mobile detail header should not include the SMART logo.");
  }
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

function checkMobileGroupStorageAccountScoped() {
  const mobile = fs.readFileSync("index.html", "utf8");
  const setup = fs.readFileSync("plan-setup.html", "utf8");
  const groupsApi = fs.readFileSync("lib/ghl-groups.js", "utf8");
  [
    "function accountStorageSuffix()",
    "function accountStorageKey(base)",
    "function getAccountStorage(base)",
    "function setAccountStorage(base,value)",
    "return suffix==='default'?base:(base+'_'+suffix);",
    "if(account==='default')return localStorage.getItem(base);",
    "if(localStorage.getItem(base+'_account')===account)return localStorage.getItem(base);",
    "setAccountStorage('sc1',JSON.stringify(s));",
    "setAccountStorage('sc1_lid',String(lid));",
    "setAccountStorage('sc1_rid',String(rid));",
    "var d=getAccountStorage('sc1');",
    "lid=parseInt(getAccountStorage('sc1_lid')||'10');",
    "rid=parseInt(getAccountStorage('sc1_rid')||'10');",
  ].forEach((text) => {
    if (!mobile.includes(text)) throw new Error(`mobile group storage account scoping missing ${text}`);
  });
  [
    "function reconcileTrainingGroupsForRoster(sourceGroups)",
    "next.athletes=cleaned.length||!members.length?cleaned:members;",
    "deleteGroupIds:options.deleteGroupIds||[]",
    ".filter(function(group){return !group.archived;})",
  ].forEach((text) => {
    if (!setup.includes(text)) throw new Error(`desktop group reconciliation must preserve saved groups when member ids do not match: ${text}`);
  });
  [
    "function mergeGroups(existingGroups, incomingGroups, deleteGroupIds)",
    "const existingState = await loadGroupsState({ token, locationId, accountKey });",
    "const groups = mergeGroups(existingState.groups, incomingGroups, deleteGroupIds);",
    "function groupNameKey(group)",
    "function groupRosterKey(group)",
    "const previousRosterKey = rosterKey ? rosterToKey.get(rosterKey) : \"\";",
    "function normalizeDeleteGroupIds(values)",
  ].forEach((text) => {
    if (!groupsApi.includes(text)) throw new Error(`shared group API should merge desktop and phone saves: ${text}`);
  });
  [
    "function groupRosterKeyFromAthletes(athletes)",
    "function groupRosterKey(group)",
    "if(group.name&&log.name!==group.name){log.name=group.name;changed=true;}",
    "!item.sharedGroupId&&groupRosterKey(item)===rosterKey",
    "if(AR_PROMISE)return AR_PROMISE;",
    "return loadAthletes().then(function(){",
    "if(AR_READY)applyLoadedSharedGroups();",
    "if(pruned)queueSharedGroupsSave();",
  ].forEach((text) => {
    if (!mobile.includes(text)) throw new Error(`mobile group sync should rename existing groups instead of duplicating them: ${text}`);
  });
  if (!mobile.includes("logs.filter(function(group){return (group.type||'training')==='training'&&!group.archived;})")) {
    throw new Error("mobile shared group saves should skip archived training groups so deleted Smart Trak groups do not get recreated.");
  }
  if (setup.includes("if(members.length&&!cleaned.length)return null;")) {
    throw new Error("desktop group reconciliation should not hide saved groups just because current roster ids do not match.");
  }
  [
    "Recover Phone Groups",
    "recoverLegacyPhoneGroups",
    "legacyPhoneGroupStorage",
    "name:'Workout 1'",
    "name:'Workout 2'",
    "name:'Workout 3'",
    "localStorage.setItem('sc1',JSON.stringify(s))",
    "localStorage.getItem('sc1')",
    "localStorage.getItem('sc1_lid'",
    "localStorage.getItem('sc1_rid'",
  ].forEach((text) => {
    if (mobile.includes(text)) throw new Error(`mobile group storage should not use unscoped storage directly: ${text}`);
  });
  console.log("mobile group storage account scoping ok");
}

function checkMobileAccountLogout() {
  const mobile = fs.readFileSync("index.html", "utf8");
  [
    "function smartCoachAccountFromUrl()",
    "function hasSmartCoachAccountSelection()",
    "function promptForAccountAccessNeeded()",
    "function accountDeviceAccessReady()",
    "function closeAccountSettings()",
    "if(!hasSmartCoachAccountSelection()){",
    "promptForAccountAccessNeeded();",
    "if(accountDeviceAccessReady())loadProData();",
    "Account access needed",
    "Open your school\\'s SMARTCoach link, or enter your account key and coach access code.",
    "Enter your account key and coach access code to continue.",
    "Enter the coach access code to unlock SMARTCoach on this phone.",
    "Use the account key from your school&apos;s SMARTCoach setup, then enter the coach access code for this device.",
    'onclick="closeAccountSettings()"',
    'onclick="logOutSmartCoachAccount()"',
    ">Log Out</button>",
    "function logOutSmartCoachAccount()",
    "function clearAccountAccessForKey(accountKey)",
    "Log out of SMARTCoach on this phone? Saved groups stay on this device.",
    "window.location.replace(url.pathname+(url.search||'')+(url.hash||''));",
  ].forEach((text) => {
    if (!mobile.includes(text)) throw new Error(`mobile account logout missing ${text}`);
  });
  [
    "switchSmartCoachAccount",
    ">Switch Account</button>",
    "localStorage.removeItem('sc_account');",
    "url.searchParams.delete('account');",
    "url.searchParams.delete('tenant');",
    'onclick="hm(\'m-account\')" style="margin-top:8px">Close</button>',
    "localStorage.removeItem('sc1')",
    "localStorage.removeItem('sc1_lid')",
    "localStorage.removeItem('sc1_rid')",
    "Use <b>default</b> for this SMARTCoach account.",
  ].forEach((text) => {
    if (mobile.includes(text)) throw new Error(`mobile account logout should not delete account selection or group data: ${text}`);
  });
  console.log("mobile account logout ok");
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
    "sport:result.sport||'',season:result.season||'',seasonYear:result.seasonYear||''",
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

function checkAthleticResultsGridDuplicateMeetDates() {
  const html = fs.readFileSync("meet-history.html", "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\ninit\(\);\s*$/, "");
  const ids = [...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
  const elements = {};
  ids.forEach((id) => { elements[id] = stubElement(); });
  elements.importDefaultYear.value = "2022";
  elements.importDefaultSeason.value = "Fall";
  elements.importDefaultGender.value = "Boys";
  elements.importDefaultSport.value = "Cross Country";
  elements.importDefaultEvent.value = "";

  const runner = new Function("document", "window", "navigator", "fetch", "alert", "confirm", "URL", "URLSearchParams", `${script}
const sample = [
  '2022 Results Grid',
  'Mens',
  'Gr\\tAthlete\\tAug 11\\tAug 20\\tAug 27\\tSep 10',
  '10\\tBen Davis\\t12:36.0 2\\t21:01.9 3\\t20:33.5 3\\t19:59.8 3',
  'Race Distances: 1 3200 Meters | 2 2 Miles | 3 5000 Meters',
  'Meet List',
  'Aug 11\\tArl. Houston Texans 2 Miles Meet',
  'Aug 20\\tWaxahachie Woodhouse Invitational',
  'Aug 20\\tSouthlake Carroll 3200',
  'Aug 27\\tSouthlake Carroll Invitational',
  'Sep 10\\tUTA Region II Preview Meet',
  'Key'
].join('\\n');
return { rows: parseAthleticNetRows(sample), formattedDate: formatDate('2022-08-20') };`);
  const doc = {
    body: stubElement(),
    getElementById(id) { return elements[id] || stubElement(); },
    querySelectorAll() { return []; },
    querySelector() { return null; },
    addEventListener() {},
    createElement() { return stubElement(); },
  };
  const result = runner(doc, {
    location: { search: "", href: "https://app.smartcoach-pro.com/meet-history.html", origin: "https://app.smartcoach-pro.com" },
    addEventListener() {},
    localStorage: { getItem() {}, setItem() {}, removeItem() {} },
  }, { clipboard: null }, () => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }), () => {}, () => true, URL, URLSearchParams);
  const rows = result.rows;
  const aug20 = rows.find((row) => row.resultDisplay === "21:01.9");
  const sep10 = rows.find((row) => row.resultDisplay === "19:59.8");
  if (!aug20 || aug20.meetName !== "Waxahachie Woodhouse Invitational" || aug20.meetDate !== "2022-08-20") {
    throw new Error("Athletic.net Results Grid duplicate date should keep the first Aug 20 meet.");
  }
  if (!sep10 || sep10.meetName !== "UTA Region II Preview Meet" || sep10.meetDate !== "2022-09-10") {
    throw new Error("Athletic.net Results Grid should map later date columns to the matching Meet List row.");
  }
  if (!/Aug\s+20/.test(result.formattedDate)) {
    throw new Error("Meet History date-only display should not shift by timezone.");
  }
  console.log("Athletic.net Results Grid duplicate meet dates ok");
}

function checkPartnerTimingPhaseOne() {
  const html = fs.readFileSync("index.html", "utf8");
  const api = fs.readFileSync("api/smart-trak/[route].js", "utf8");
  const registry = fs.readFileSync("lib/account-registry.js", "utf8");
  [
    "function defaultPartnerTimingState(group)",
    "function normalizePartnerTimingState(partner,group)",
    "function openPartnerTiming()",
    "function recordPartnerStationTap(runnerId,stationId)",
    "function partnerReviewHtml()",
    "function partnerRaceElapsedMs()",
    "function partnerRaceClockHtml(place)",
    "function updatePartnerRaceClocks()",
    "function startPartnerTimingAutoSync()",
    "function partnerMasterToggle()",
    "function resetPartnerTimingRace()",
    "function stopPartnerRaceClock()",
    "function partnerSelectedStationIds()",
    "function partnerSelectedStations()",
    "function partnerCaptureStations()",
    "function recordPartnerAutoTap(r,kind,tapAt)",
    "function applyPartnerTimingRecordsToRunners()",
    "function partnerActiveFinishRecord(r)",
    "function partnerSplitLapsForRunner(r,finish)",
    "function dedupePartnerSavedRuns(r,finish)",
    "function partnerRecordKind(record)",
    "function meetResultSport()",
    "function meetDayCfg()",
    "function applyMeetDayCfg(log)",
    "function postMeetResultItem(item,attempt)",
    "function saveMeetResultQueue(queue,onProgress)",
    "function syncPartnerTimingFromPanel()",
    "function setPartnerStationSelected(stationId,selected)",
    "function partnerStationStatusText()",
    "function partnerRunnerClockText(r)",
    "function partnerRunnerClockLive(r)",
    "function partnerButtonLabel(r,station)",
    "function syncPartnerTimingSession()",
    "function loadPartnerTimingSession()",
    "if(partnerTimingEnabled())loadPartnerTimingSession();",
    "Partner Timing Race Clock",
    "updatePartnerRaceClocks();",
    "partnerTimingEnabled()){",
    "partnerMasterToggle();",
    "partner.records=[];",
    "partner.resetRecords=new Date().toISOString();",
    "if(partnerTimingSyncTimer){clearInterval(partnerTimingSyncTimer);partnerTimingSyncTimer=null;}",
    "CL.runners.forEach(function(r){r.on=false;r.el=0;r.t0=0;r.le=0;r.lt=0;r.laps=[];r.saved=[];r.ts=null;});",
    "updatePartnerRaceClocks();",
    "Reset Race Clock",
    "Record first, label later",
    "use the normal athlete <b>Lap</b> and <b>Stop</b> buttons",
    "recordPartnerAutoTap(x,'split'",
    "var partnerRecord=recordPartnerAutoTap(x,'finish'",
    "recordPartnerAutoTap(x,'resume'",
    "stopRunnerAt(x,nStop,{partnerRecordId:partnerRecord&&partnerRecord.id||''});",
    "run.partnerRecordId===finish.id",
    "savedRun.splitLabels=savedSplitLabels(r);",
    "status.textContent='Saving meet result '+current+' of '+total+'...';",
    "result.status===429&&attempt<4",
    "Checking shared Partner Timing taps before saving meet results",
    "Partner Timing finishes are ready to save as meet results.",
    "sport:meetResultSport()",
    "cfg:meetDayCfg()",
    "log.cfg.repRest=0;",
    "log.cfg.showPlan=0;",
    "log.cfg.showTarget=0;",
    "log.cfg.showSync=0;",
    "meetDayDefaults:(CL.type||'training')==='meet'?1:0",
    "else if(resume&&partnerRaceRunning()&&!r.on)",
    "if(applyPartnerTimingRecordsToRunners())changed=true;",
    "if(stationId==='finish')return'finish';",
    "if(stationId.indexOf('split_')===0)return'split';",
    "Partner Timing synced. '+after+' shared tap",
    "CL.cfg.laps=1;",
    "partner-just-marked",
    "selectedStationIds",
    "Continue Race Clock",
    "Sync Partner Timing",
    "No Partner Timing finish taps are ready to save yet.",
    "startPartnerRunnerClocks();",
    "loadPartnerTimingSession();",
    "setInterval(function(){",
    "multiple taps",
    "partner.finishAt='';partner.finishCoach='';",
    "Split 1",
    "t.closest&&t.closest('button')",
    "id=\"m-partner-timing\"",
    "id=\"tray-plan-label\">Plan</span>",
    "meet?'Partner':'Plan'",
    "/api/smart-trak/partner-timing",
  ].forEach((text) => {
    if (!html.includes(text)) throw new Error(`Partner Timing mobile phase one missing ${text}`);
  });
  [
    'if (route === "partner-timing")',
    "return accountPartnerTiming(req, res);",
    "async function accountPartnerTiming(req, res)",
    "savePartnerTimingSession(accountKey, session)",
    "loadPartnerTimingSessions(accountKey",
  ].forEach((text) => {
    if (!api.includes(text)) throw new Error(`Partner Timing endpoint missing ${text}`);
  });
  [
    "async function savePartnerTimingSession(accountKey, session)",
    "async function loadPartnerTimingSessions(accountKey, filters = {})",
    "function normalizePartnerTimingSession(session)",
    "function normalizePartnerTimingRecord(record)",
    "partnerTimingSessions",
    "lastPartnerTimingSync",
    "item.resetRecords ? [] : current.records",
    "if (!item.resetRecords && !item.startAt && current.startAt)",
    "if (!item.resetRecords && !item.startAt && !item.finishAt && current.finishAt)",
    "finishAt: clean(source.finishAt)",
    "splitIndex: Number(source.splitIndex) || 0",
    "kind: clean(source.kind)",
    "selectedStationIds",
    "resetRecords: clean(source.resetRecords)",
  ].forEach((text) => {
    if (!registry.includes(text)) throw new Error(`Partner Timing registry storage missing ${text}`);
  });
  console.log("Partner Timing phase one ok");
}

function checkFieldPracticePhaseOne() {
  const page = fs.readFileSync("field-practice.html", "utf8");
  const dashboard = fs.readFileSync("dashboard.html", "utf8");
  const calendar = fs.readFileSync("training-calendar.html", "utf8");
  const api = fs.readFileSync("api/smart-trak/[route].js", "utf8");
  [
    "Field Practice",
    "Practice Focus",
    "Drill Routine",
    "Athlete Focus & Summary",
    "athleteSummaries",
    "Post-practice summary for this athlete",
    "Runway / Speed Metrics",
    "speedMetrics",
    "function speedMetricCalc(row)",
    "velocity, stride length, and stride frequency",
    "function renderRoutineOptions(selected)",
    "function accessStorageKey()",
    "function rememberedSessionStorageKey()",
    "X-SMARTCoach-Access-Code",
    "X-SMARTCoach-Session",
    "var eventRoutineMap",
    "Beginner pole vault routine",
    "High jump approach routine",
    "Long jump approach routine",
    "Triple jump rhythm routine",
    "Shot put power routine",
    "Discus stand throw routine",
    "Javelin approach routine",
    "Hammer turn routine",
    "Plant mechanics routine",
    "Short approach routine",
    "Bar clearance routine",
    "Meet week routine",
    "Jump Attempts",
    "Make O",
    "Miss X",
    "Pass -",
    "attemptPattern",
    "function normalizeHeight(mark)",
    "Optional attempt summary:",
    "Athlete Preview",
    "Copy Preview",
    "Field event drill checklists, practice focus, and attempt notes.",
    "font-family:inherit;font-size:14px;font-weight:800",
    "button.utility-action",
    'id="refreshBtn" class="utility-action"',
    "/api/smart-trak/field-practice",
  ].forEach((text) => {
    if (!page.includes(text)) throw new Error(`Field Practice page missing ${text}`);
  });
  [
    "openFieldPractice()",
    "m-field-practice",
    "function loadFieldPractice()",
    "function saveFieldPractice(practice)",
    "function newFieldPractice()",
    "function fieldPracticeRoutineDrills(event,routineKey)",
    "function syncFieldPracticeAthleteSummaries(p)",
    "function updateFieldPracticeAthleteSummary(index,field,value)",
    "function fieldPracticePreviewText(p)",
    "Athlete Focus & Summary",
    "function shareFieldPracticePreview()",
    "FIELD_PRACTICE_EVENTS",
    "FIELD_PRACTICE_ROUTINES",
    "loadCalendarDaysCache().catch(function(){return CD||[];}).then(function(){return loadFieldPractice();});",
    "function fieldPracticeGroupByName(name)",
    "calendarGenerated",
    "fieldPracticeAllPractices()",
    "calendarSpeedMetricFieldPractices(saved)",
    "Runway / Speed Metrics",
    "Fly zone",
    "Stride frequency",
    "Create Practice",
    "Share Preview",
    "m-training-mode",
    "function openTrainingModePicker()",
    "function openTrainingModeDistance()",
    "function openTrainingModeSpeed()",
    "function openTrainingModeCalendar()",
    "Multi Athlete Timer",
    "Speed Metrics",
    "Calendar Workout",
    "#m-training-mode .msh{height:100%;max-height:none;border-radius:0;display:flex;flex-direction:column;padding-top:env(safe-area-inset-top)}",
    "#m-training-mode .profile-box{flex:1;min-height:0;max-height:none;-webkit-overflow-scrolling:touch}",
    "FIELD_PRACTICE.mode='field'",
    "FIELD_PRACTICE.mode='speed'",
    "function createSpeedMetricsPracticeForCurrentGroup()",
    "function syncFieldPracticeSpeedMetrics(p,force)",
    "function cleanFieldPracticeSpeedMetrics(p)",
    "function fieldPracticeSpeedCaptureHtml(p)",
    "speed-hero",
    "speed-ath-open",
    "speed-ath-remove",
    "speed-add-rep",
    "speed-add-athlete-toggle",
    "function toggleFieldPracticeSpeedAddAthlete()",
    "FIELD_PRACTICE.addAthleteOpen=false;",
    "data-speed-row-key",
    "startFieldPracticeSpeedDrag",
    "finishFieldPracticeSpeedDrag",
    "cancelFieldPracticeSpeedDrag",
    "#m-field-practice.speed-mode #fp-share-btn{display:none}",
    "Speed Capture",
    "+ Athlete",
    "Add Athlete",
    "+ Add Rep",
    "Remove '+name+'?",
    "function confirmRemoveFieldPracticeSpeedAthlete(key)",
    "function toggleFieldPracticeSpeedRepTimer(id)",
    "lastSpeedActiveId",
    "fp-top-actions",
    "Session Results",
    "Start",
    "Stop",
    "fp-speed-result-gender",
    "speedRemovedAthletes",
    "Save to SMART Trak",
    "function fieldPracticeSpeedRepStatus(row,field)",
    "Move to the next runner",
    "Time captured for",
    "Strides saved for",
    "m/s",
    "return saved.filter(function(item){return item&&item.event!=='Runway / Speed Metrics';});",
  ].forEach((text) => {
    const app = fs.readFileSync("index.html", "utf8");
    if (!app.includes(text)) throw new Error(`Mobile Field Practice app missing ${text}`);
  });
  [
    'id="fieldPracticeLink"',
    'href="/field-practice.html"',
    "Field Practice",
    "els.fieldPracticeLink.href=pageUrl('/field-practice.html');",
    'data-add-activity-mode="speed"',
    "Add Speed Metrics",
    "Max Velocity",
    "max velocity",
    "function speedWorkVolumeLabel(reps,value,unit)",
    "Zone / Focus: '+zone",
    "Work volume: '+workVolume",
    "workVolume?workVolume+' total'",
    "capture time + stride count for each athlete",
    '<option value="all">All activity types</option>',
    "{value:'easy',label:'Easy'}",
    "{value:'quality',label:'Quality'}",
    "{value:'speed',label:'Speed'}",
    "{value:'race',label:'Race'}",
    "{value:'rest',label:'Rest'}",
    "var explicitQualityPattern=/\\b(quality session|tempo|threshold|interval|repetition|quality)\\b/;",
    "if(explicitQualityPattern.test(qualityText))return 'quality';",
    'class="mixitem speed"',
    "counts.speed",
    "return 'speed';",
  ].forEach((text) => {
    if (!calendar.includes(text)) throw new Error(`Training Calendar Field Practice link missing ${text}`);
  });
  if (dashboard.includes('id="fieldPracticeLink"')) throw new Error("Dashboard should not show Field Practice button");
  if (!dashboard.includes('id="trainingCalendarLink" class="linkbtn secondary" href="/training-calendar.html">Training</a>')) throw new Error("Dashboard Training Calendar button should be labeled Training");
  [
    'route === "field-practice"',
    "return accountFieldPractice(req, res);",
    "async function accountFieldPractice(req, res)",
    "function normalizeFieldPractice(item)",
    "fieldPracticeSessions",
    "lastFieldPracticeSync",
    "function normalizeFieldPracticeHeight(value)",
    "routineKey",
    "attemptSummary",
    "function normalizeFieldPracticeAttempts(items)",
    "function normalizeFieldPracticeAthleteSummaries(items)",
    "function normalizeFieldPracticeSpeedMetrics(items)",
    "speedMetrics: normalizeFieldPracticeSpeedMetrics(source.speedMetrics)",
  ].forEach((text) => {
    if (!api.includes(text)) throw new Error(`Field Practice API missing ${text}`);
  });
  console.log("Field Practice phase one ok");
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
checkTrainingCalendarButtonLabels();
checkTrainingCalendarMonthView();
checkCurrentFitnessClear();
checkAccountStatusLocationVerification();
checkOnboardingSubscriberPlanLoad();
checkAdminAccountCleanup();
checkAccountOwnerExcludedFromAthletes();
checkSmartTrakAthleteCountsIgnoreGhlContacts();
checkInactiveAthletesStayOutOfCurrentViews();
checkStandaloneRaceResultSaveScope();
checkDashboardActivityRangeLayout();
checkDashboardFilterContextAndArchivedGroups();
checkDashboardTrainingPaces();
checkMilesBoardFeature();
checkResultsBoardFeature();
checkSpeedTrakFeature();
checkDashboardWhatsNew();
checkDashboardStaffAccessHandoff();
checkCrossCountryRaceResultEvents();
checkTrainingCalendarRaceResultAthleteFallback();
checkTrainingCalendarDeletedMeetGuard();
checkDashboardStartHere();
checkHowToGuidePage();
checkDashboardToolPreferences();
checkBugTrakDesktopFeedback();
checkPublicSharePagesHideFeedback();
checkPlanImportMultiGroupAssignment();
checkPlanSetupHidesArchivedPlans();
checkMeetManagerSportField();
checkCalendarMeetSportPropagation();
checkDashboardMeetCorrectionFields();
checkTrainingCorrectionWorkoutNoteReplacement();
checkWeatherLocationSaveFallback();
checkTrainingCalendarQualityEditParsing();
checkTrainingAdjustmentAuditDates();
checkQualityWorkoutTypesAccepted();
checkManualMileageQualitySession();
checkTrainingCustomization();
checkMobileCalendarWorkoutPriority();
checkMobileTrainingPlanArchiveFilter();
checkMobileCalendarMeetDedup();
checkMobileMeetListSort();
checkAthleteCalendarBulkEmailLinks();
checkAthleteCalendarQuestions();
checkAthleteCalendarSubmittedStatusPill();
checkAthleteCalendarSelfReportedWorkouts();
checkDashboardPlainLapSplitsStayLaps();
checkMeetHistorySportToolbarFilter();
checkMeetHistoryMeetListChronological();
checkMeetHistoryPerformanceCaches();
checkMeetHistoryImportOnlySpreadsheet();
checkMeetHistoryImportedResultCorrections();
checkMeetResultSplitDetails();
checkPageSearchDebounces();
checkAthletesDocuTrakSetupLayout();
checkEquipmentInventoryModelSerial();
checkEquipmentIssueSheetStickyHeader();
checkEquipmentCoachIssued();
checkFieldNoMarkResultsAllowed();
checkMobileFieldEventCaptureControls();
checkKeepTrakFeature();
checkAttendanceCheckpointMarkAll();
checkAttendanceMobileSummary();
checkAttendanceSeasonAttachment();
checkGroupsTrayAddHidden();
checkMobileGroupStorageAccountScoped();
checkMobileAccountLogout();
checkHistoricalMeetResultsLoadUnmatched();
checkMeetHistoryUnlistedSeasonYearFallback();
checkPartnerTimingPhaseOne();
checkFieldPracticePhaseOne();

console.log("SMARTCoach regression checks passed");
