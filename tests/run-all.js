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
  "records.html",
  "track-simulator.html",
  "xc-simulator.html",
  "weather.html",
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
    "Avg miles per athlete",
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
  ].forEach((text) => {
    if (html.includes(text)) throw new Error(`dashboard should remove redundant summary card/control: ${text}`);
  });
  if (html.indexOf('id="plannedVolumeValue"') > html.indexOf('id="completedVolumeValue"') || html.indexOf('id="completedVolumeValue"') > html.indexOf('id="trainingSyncCount"')) {
    throw new Error("dashboard Training Load Summary cards should start Planned, Completed, Avg miles per athlete.");
  }
  if (html.includes("athleteActivitySearchText") || html.includes("trainingRowMatchesSearch(row,query)") || html.includes("recentTrainingSearchText(row)") || html.includes("rosterGroupSearchTextForTraining")) {
    throw new Error("dashboard search should stay athlete/group-only, not activity/workout/event text.");
  }
  const actionRowMatch = html.match(/<div class="action-row">([\s\S]*?)<\/div>/);
  const actionRowHtml = actionRowMatch ? actionRowMatch[1] : "";
  if (actionRowHtml.includes('id="trackSimulatorLink"') || actionRowHtml.includes('id="xcSimulatorLink"')) {
    throw new Error("dashboard header should use one Simulator button, with Track/XC links inside the chooser modal.");
  }
  if (html.includes(".action-row,.modal-action-row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}")) {
    throw new Error("dashboard header action rows should stay two horizontal rows instead of becoming a multi-row grid.");
  }
  console.log("dashboard activity range layout ok");
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

function checkHowToGuidePage() {
  const html = fs.readFileSync("how-to.html", "utf8");
  const dashboard = fs.readFileSync("dashboard.html", "utf8");
  const guide = fs.readFileSync("SMART_TRAK_COACH_HOW_TO.md", "utf8");
  [
    "SMART Trak How To Guide",
    "Coach-facing guide for SMART Trak and the SMARTCoach Pro mobile app.",
    "fetch('/SMART_TRAK_COACH_HOW_TO.md?t='",
    "function renderMarkdown(markdown)",
    "id=\"tocBody\"",
    "id=\"guideBody\"",
    "Open Text Guide",
    "printBtn",
    "smartcoach-help-widget.js",
  ].forEach((text) => {
    if (!html.includes(text)) throw new Error(`How To guide page missing ${text}`);
  });
  [
    'id="dashboardLink"',
    'href="/dashboard.html"',
  ].forEach((text) => {
    if (!dashboard.includes(text)) throw new Error(`Dashboard guide navigation missing ${text}`);
  });
  if (dashboard.includes('id="howToLink"')) throw new Error("How To guide should not live in the Dashboard action row.");
  [
    "Use **Import History** when starting SMART Trak with older results from a spreadsheet, CSV, TSV, or the SMART Trak template.",
    "Paste spreadsheet rows into the import box, or upload a CSV/TSV/template file.",
    "Athletic.net copy/paste import is no longer available because it was not reliable enough for coach-facing use.",
  ].forEach((text) => {
    if (!guide.includes(text)) throw new Error(`How To guide Meet History import wording missing ${text}`);
  });
  [
    "Choose **Paste Spreadsheet**, **Upload Spreadsheet**, or **Athletic.net Import**.",
    "Athletic.net Import supports copied",
    "paste the season calendar or meet reference list below the records",
  ].forEach((text) => {
    if (guide.includes(text)) throw new Error(`How To guide still describes removed Athletic.net import flow: ${text}`);
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
    'sport: optionValue(nextValues.sport)',
    'season_year: Number(nextValues.seasonYear) || ""',
    'sport: clean(data.sport)',
  ].forEach((text) => {
    if (!api.includes(text)) throw new Error(`Correction API imported history support missing ${text}`);
  });
  console.log("Meet History imported result corrections ok");
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

function checkAttendanceSeasonAttachment() {
  const mobile = fs.readFileSync("index.html", "utf8");
  const desktop = fs.readFileSync("attendance.html", "utf8");
  const api = fs.readFileSync("api/smart-trak/[route].js", "utf8");
  const registry = fs.readFileSync("lib/account-registry.js", "utf8");
  [
    'id="att-sport"',
    'id="att-season"',
    "function attendanceSport()",
    "function attendanceSeason()",
    "sport:attendanceSport()",
    "season:attendanceSeason()",
    "Off Season Track",
  ].forEach((text) => {
    if (!mobile.includes(text)) throw new Error(`mobile attendance season attachment missing ${text}`);
  });
  [
    'id="sportFilter"',
    'id="seasonFilter"',
    "function attendanceSeasonLabel(row)",
    "data-sport",
    "data-season",
    "sport:tr.querySelector('[data-sport]').value",
    "season:seasonParts.season",
    "seasonYear:seasonParts.seasonYear",
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
    "function partnerMasterToggle()",
    "function resetPartnerTimingRace()",
    "function stopPartnerRaceClock()",
    "function partnerSelectedStationIds()",
    "function partnerSelectedStations()",
    "function partnerCaptureStations()",
    "function partnerMarkButtonHtml(r,station)",
    "function syncPartnerTimingFromPanel()",
    "function selectPartnerStationFromInput(input,stationId)",
    "function handlePartnerStationChoiceEvent(event)",
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
    "Reset Race Clock",
    "Choose My Station(s)",
    "Recording stations:",
    "DONE '+ex(station.label)",
    "MARK '+ex(station.label)",
    "partner-mark-btn",
    "partner-mark-group",
    "partner-just-marked",
    "aria-pressed",
    "selectedStationIds",
    "Continue Race Clock",
    "Sync Partner Timing",
    "No athlete checkbox is needed.",
    "partner-station-status",
    "partner-station-choice",
    "data-partner-station-id",
    "type=\"checkbox\"",
    "touchend',function(e)",
    "#m-partner-timing .partner-station-choice",
    "Selected: '+stations.map",
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
    "finishAt: clean(source.finishAt)",
    "selectedStationIds",
    "resetRecords: clean(source.resetRecords)",
  ].forEach((text) => {
    if (!registry.includes(text)) throw new Error(`Partner Timing registry storage missing ${text}`);
  });
  console.log("Partner Timing phase one ok");
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
checkAccountStatusLocationVerification();
checkAccountOwnerExcludedFromAthletes();
checkStandaloneRaceResultSaveScope();
checkDashboardActivityRangeLayout();
checkDashboardWhatsNew();
checkHowToGuidePage();
checkDashboardToolPreferences();
checkBugTrakDesktopFeedback();
checkPlanImportMultiGroupAssignment();
checkMeetManagerSportField();
checkWeatherLocationSaveFallback();
checkTrainingCalendarQualityEditParsing();
checkTrainingCustomization();
checkAthleteCalendarBulkEmailLinks();
checkDashboardPlainLapSplitsStayLaps();
checkMeetHistorySportToolbarFilter();
checkMeetHistoryMeetListChronological();
checkMeetHistoryPerformanceCaches();
checkMeetHistoryImportOnlySpreadsheet();
checkMeetHistoryImportedResultCorrections();
checkPageSearchDebounces();
checkFieldNoMarkResultsAllowed();
checkKeepTrakFeature();
checkAttendanceCheckpointMarkAll();
checkAttendanceSeasonAttachment();
checkGroupsTrayAddHidden();
checkMobileGroupStorageAccountScoped();
checkMobileAccountLogout();
checkHistoricalMeetResultsLoadUnmatched();
checkMeetHistoryUnlistedSeasonYearFallback();
checkPartnerTimingPhaseOne();

console.log("SMARTCoach regression checks passed");
