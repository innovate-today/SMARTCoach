const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const SMARTCOACH_ACTIVE_FIELD_ID = "xepTMFvtaTwFdLVrOeQH";
const SMARTCOACH_ATHLETE_ID_FIELD_ID = "Vi7fmpkblrGZqZFyNBI2";
const ATHLETE_BEST_SCHEMA_KEY = "custom_objects.athlete_bests";
const MEET_RESULT_SCHEMA_KEY = "custom_objects.meet_results";
const PERFORMANCE_RECORD_SCHEMA_KEY = "custom_objects.performance_records";
const OPTIONAL_DASHBOARD_RECORD_TIMEOUT_MS = 4500;
const { getGhlContext, requireProPlan } = require("../../lib/ghl-account");
const { attachRegistryAccount, setSmartTrakSecurityHeaders } = require("../../lib/smart-trak-request");
const { loadTrainingMirror, loadAttendanceRecords } = require("../../lib/account-registry");

const FIELD_IDS = {
  athlete_contact: ["JNGhbB93E0xRao1jAm47", "ZBi4Oj4pmCQs8ekqaNr2", "q9xmnPdCBRL1NuomFuOo"],
  athlete_name_snapshot: ["m20bSENWaEB4jBMtXgMD", "NxKoU2l9QohpmzRt2gin", "0lX15xSvQP77xhNH45q1"],
  source_session_id: ["3Mfs6tIpL4KXx8UeNGBU"],
  source_record_id: ["9YD4n4y4aqf3VnkrwLL1", "3HVSAaItyvtLXYNasRAJ"],
  event: ["0zkuDc0aDTpw5hPOKADa", "Qtvff2zJpE2nu8qV6kAU"],
  personal_best_display: ["h1rwv5B4JSLfNnsTL7qJ"],
  personal_best_ms: ["personal_best_ms"],
  personal_best_meet: ["mRbdhzawlZ0Q386Zv3X2"],
  personal_best_date: ["tOWqZJ9HUKMtE6THTOfZ"],
  season_best_display: ["6Xc5844e5EwfqBltPYU9"],
  season_best_ms: ["season_best_ms"],
  season_best_meet: ["rRAorB4W8yNzZiIyWeV8"],
  season_best_date: ["AffLPRbHGOzMUgKaALwi"],
  last_result_display: ["JlPshYvArSOfoUTP7Gn6"],
  last_result_date: ["LLzkfQDCtloVaUzEWQxE"],
  meet_name: ["bCOXXRAtRqmCJnMZFLvB"],
  result_display: ["Cu9h6mq2X6uPSQG6IraM"],
  result_ms: ["tqdu89hWLwfdiylZzxqj"],
  meet_date: ["rYZUhun2ynmK8MNsYgph"],
  season: ["E7WkU0NjC48zZzSNMlMJ"],
  season_year: ["jImFId2bLt2Hhox7TTDR"],
  sport: ["NFlleoMtJlvlB1KAOqpR", "rgFknLe8077zfXPF5i9I"],
  wind: ["sYR9reCyygQaHH3x88DR"],
  is_pr: ["XMvKfEECN6PCcA0TKwzN"],
  is_season_best: ["zO57s50B9sf62EPdoq7J"],
  coach_race_notes: ["84pkqVasLVDNye0XCVaH"],
  group_name: ["ochf7LkGhgAh5ySys5dA"],
  workout_type: ["jX0YLlpt08vxNKV3JyM5"],
  surface: ["ZMzx2xPdO3XxuzAvj84"],
  total_time_display: ["z9eZIcIL1B7yaeR5jXHI"],
  total_time_ms: ["tzmjjgk4FwJLfJDZ1KAc"],
  session_date: ["pl69ao2Pu76zeUKMEWpm"],
  rep_number: ["J0SJxcm3yeraYzoYgjXe"],
  splits_json: ["bIjfXwW7mDCkkjGS4LL5", "kT3jmzTT9uFrJxvZSeUK"],
  coach_note: ["Afy8b8lAbUoti9cCqa1m"],
};

const FIELD_LABELS = {
  athlete_contact: ["athlete contact", "athlete"],
  athlete_name_snapshot: ["athlete name snapshot", "athlete name", "name snapshot"],
  source_session_id: ["source session id"],
  source_record_id: ["source record id"],
  group_name: ["group name", "group"],
  workout_type: ["workout type", "type"],
  surface: ["surface"],
  total_time_display: ["total time display", "total time"],
  total_time_ms: ["total time ms"],
  session_date: ["session date", "workout date", "date"],
  rep_number: ["rep number", "rep"],
  splits_json: ["splits json", "splits"],
  coach_note: ["coach note", "notes"],
};

const ATHLETE_FIELD_ALIASES = {
  smartcoachActive: ["smartcoach active", "smartcoach_active", "active athlete", "athlete active"],
  smartcoachAthleteId: ["smartcoach athlete id", "smartcoach_athlete_id", "athlete id", "smartcoach id"],
  gender: ["gender", "sex", "division"],
};

module.exports = async function handler(req, res) {
  setSmartTrakSecurityHeaders(res);
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  await attachRegistryAccount(req);

  if (!requireProPlan(req, res)) return;

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { token, locationId, accountKey } = getGhlContext(req);

  if (!token || !locationId) {
    res.status(500).json({ error: "SMART Trak dashboard is not configured on the server." });
    return;
  }

  try {
    const [athletes, bestRecords, meetRecords, performanceRecords, mirroredPerformanceRecords] = await Promise.all([
      listActiveAthletes({ token, locationId }),
      safeDashboardObjectRecords({ token, locationId, schemaKey: ATHLETE_BEST_SCHEMA_KEY }),
      safeDashboardObjectRecords({ token, locationId, schemaKey: MEET_RESULT_SCHEMA_KEY }),
      safeDashboardObjectRecords({ token, locationId, schemaKey: PERFORMANCE_RECORD_SCHEMA_KEY }),
      loadTrainingMirror(accountKey),
    ]);
    const allPerformanceRecords = uniqueRecords([...(performanceRecords || []), ...(mirroredPerformanceRecords || [])]);

    const rows = athletes.map((athlete) => buildAthleteRow({
      athlete,
      bestRecords,
      meetRecords,
      performanceRecords: allPerformanceRecords,
    }));
    const meetResults = buildRecentMeetResults({ athletes, meetRecords });
    const trainingSyncs = buildRecentTrainingSyncs({ athletes, performanceRecords: allPerformanceRecords });
    const recentMeetResults = meetResults.slice(0, 100);
    const recentTrainingSyncs = trainingSyncs;

    res.status(200).json({
      success: true,
      generatedAt: new Date().toISOString(),
      totals: {
        athletes: rows.length,
        currentWeekRuns: rows.reduce((sum, row) => sum + row.currentWeekRuns, 0),
        previousWeekRuns: rows.reduce((sum, row) => sum + row.previousWeekRuns, 0),
        currentWeekVolumeMiles: roundVolume(rows.reduce((sum, row) => sum + row.currentWeekVolumeMiles, 0)),
        previousWeekVolumeMiles: roundVolume(rows.reduce((sum, row) => sum + row.previousWeekVolumeMiles, 0)),
        currentMonthVolumeMiles: roundVolume(rows.reduce((sum, row) => sum + row.currentMonthVolumeMiles, 0)),
      },
      athletes: rows,
      recentMeetResults,
      recentTrainingSyncs,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Dashboard lookup failed." });
  }
};

module.exports.publicMilesBoard = publicMilesBoard;
module.exports.publicResultsBoard = publicResultsBoard;

async function publicResultsBoard(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { token, locationId, accountKey, logoUrl } = getGhlContext(req);
  if (!token || !locationId) {
    res.status(500).json({ error: "Results Board is not configured for this account." });
    return;
  }

  try {
    const sharing = resultsBoardSharing(req.resultsBoardSharing);
    const [athletes, meetRecords] = await Promise.all([
      listActiveAthletes({ token, locationId }),
      safeDashboardObjectRecords({ token, locationId, schemaKey: MEET_RESULT_SCHEMA_KEY }),
    ]);
    const allRows = buildRecentMeetResults({ athletes, meetRecords });
    const filters = resultsBoardFilters(req.query, sharing);
    const seasonRows = allRows.filter((row) => resultsBoardRowMatches(row, filters));
    const filterOptions = resultsBoardFilterOptions(allRows, filters);
    const latestMeetName = filters.allMeets ? "" : filters.meetName || latestResultsMeetName(seasonRows);
    const latestRows = (filters.allMeets ? seasonRows : seasonRows.filter((row) => !latestMeetName || clean(row.meetName) === latestMeetName)).sort(resultsSort);
    const seasonBestRows = resultsBoardSeasonBestRows(seasonRows).sort(resultsSort);
    const meetNames = uniqueStrings(seasonRows.map((row) => row.meetName));
    res.status(200).json({
      success: true,
      accountKey,
      logoUrl,
      generatedAt: new Date().toISOString(),
      gameSettings: sharing.gameSettings,
      displayOptions: sharing.displayOptions,
      filters: {
        sport: filters.sportLabel,
        seasonYear: filters.seasonYear,
        meet: filters.allMeets ? "__all__" : latestMeetName,
        event: filters.event,
        gender: filters.gender,
        label: resultsBoardFilterLabel(filters, latestMeetName),
      },
      filterOptions,
      totals: {
        results: seasonRows.length,
        latestMeetResults: latestRows.length,
        athletes: uniqueStrings(seasonRows.map((row) => row.athleteName)).length,
        meets: meetNames.length,
        personalBests: seasonRows.filter((row) => row.isPr).length,
        seasonBests: seasonRows.filter((row) => row.isSeasonBest).length,
      },
      latestMeet: resultsBoardMeetSummary(latestRows, filters.allMeets ? "All Meets" : latestMeetName),
      seasonSummary: resultsBoardSeasonSummary(seasonRows),
      meetArchive: resultsBoardMeetArchive(seasonRows),
      athleteSummaryRows: resultsBoardAthleteSummaryRows(seasonRows),
      eventSummaryRows: resultsBoardEventSummaryRows(seasonRows),
      divisionSummaryRows: resultsBoardDivisionSummaryRows(seasonRows),
      bestHighlightRows: resultsBoardBestHighlightRows(seasonRows),
      latestRows,
      seasonRows: seasonBestRows,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Results Board lookup failed." });
  }
}

async function publicMilesBoard(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { token, locationId, accountKey, logoUrl } = getGhlContext(req);
  if (!token || !locationId) {
    res.status(500).json({ error: "Miles Board is not configured for this account." });
    return;
  }

  try {
    const sharing = req.milesBoardSharing || {};
    const displayOptions = milesBoardDisplayOptions(sharing.displayOptions);
    const [allAthletes, performanceRecords, mirroredPerformanceRecords, attendanceRecords] = await Promise.all([
      listActiveAthletes({ token, locationId }),
      safeDashboardObjectRecords({ token, locationId, schemaKey: PERFORMANCE_RECORD_SCHEMA_KEY }),
      loadTrainingMirror(accountKey),
      displayOptions.teamAttendance || displayOptions.athleteAttendance ? loadAttendanceRecords(accountKey, {
        start: dateOnly(rangeForAttendanceStart(req.query && req.query.start)),
        end: dateOnly(rangeForAttendanceEnd(req.query && req.query.end)),
      }) : Promise.resolve([]),
    ]);
    const athletes = milesBoardAthletesForSelectedGroups(allAthletes, req.milesBoardAthleteKeys);
    const allPerformanceRecords = uniqueRecords([...(performanceRecords || []), ...(mirroredPerformanceRecords || [])]);
    const start = publicBoardDate(req.query && req.query.start);
    const end = publicBoardDate(req.query && req.query.end);
    const range = normalizedBoardRange(start, end);
    const rangeAttendance = (attendanceRecords || []).filter((record) => {
      const date = parseDate(record.date || record.syncedAt || record.updatedAt);
      return date && date >= range.start && date < range.end;
    });
    const gameSettings = milesBoardGameSettings(sharing.gameSettings);
    const boardFilter = milesBoardFilter(req.query, sharing);
    const boardRows = buildMilesBoardRows({ athletes, performanceRecords: allPerformanceRecords, attendanceRecords: rangeAttendance, start: range.start, end: range.end, gameSettings, displayOptions, boardFilter });
    const groupRows = milesBoardGroupRows(boardRows);
    const totalMiles = roundVolume(boardRows.reduce((sum, row) => sum + row.totalMiles, 0));
    const totalWorkouts = boardRows.reduce((sum, row) => sum + row.workouts, 0);
    const teamAttendance = displayOptions.teamAttendance ? milesBoardAttendanceSummary(rangeAttendance) : null;
    res.status(200).json({
      success: true,
      accountKey,
      logoUrl,
      generatedAt: new Date().toISOString(),
      challengeType: clean(req.milesBoardSharing && req.milesBoardSharing.challengeType) || "total",
      challengeTypes: Array.isArray(req.milesBoardSharing && req.milesBoardSharing.challengeTypes) ? req.milesBoardSharing.challengeTypes : [clean(req.milesBoardSharing && req.milesBoardSharing.challengeType) || "total"],
      displayOptions,
      gameSettings,
      range: {
        start: dateOnly(range.start),
        end: dateOnly(addDays(range.end, -1)),
        label: boardRangeLabel(range.start, range.end),
        sport: boardFilter.sportLabel,
        seasonYear: boardFilter.seasonYear,
      },
      totals: {
        athletes: boardRows.length,
        athletesWithMiles: boardRows.filter((row) => row.totalMiles > 0).length,
        totalMiles,
        workouts: totalWorkouts,
        averagePerWorkout: totalWorkouts ? roundVolume(totalMiles / totalWorkouts) : 0,
        teamGoalMiles: gameSettings.teamGoalMiles,
        teamGoalProgress: gameSettings.teamGoalMiles ? Math.round((totalMiles / gameSettings.teamGoalMiles) * 100) : 0,
        attendanceRate: teamAttendance ? teamAttendance.rate : undefined,
        attendanceRequired: teamAttendance ? teamAttendance.required : undefined,
      },
      highlights: milesBoardHighlights(boardRows),
      weeklyWinners: milesBoardWeeklyWinners(boardRows, groupRows),
      snapshots: milesBoardSnapshots(req.milesBoardSnapshots),
      groups: groupRows,
      rows: boardRows,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Miles Board lookup failed." });
  }
}

function buildMilesBoardRows({ athletes, performanceRecords, attendanceRecords, start, end, gameSettings, displayOptions, boardFilter }) {
  const showAttendance = !!(displayOptions && displayOptions.athleteAttendance);
  const rows = athletes.map((athlete) => {
    const training = performanceRecords
      .filter((record) => recordMatchesAthlete(record, athlete) && !isVoidedPerformanceRecord(record))
      .map(normalizePerformanceRecord)
      .filter((item) => item.groupName || item.totalTimeDisplay)
      .filter((item) => milesBoardRecordMatchesFilter(item, boardFilter))
      .filter((item) => {
        const date = parseDate(item.sessionDate || item.syncedAt);
        return date && date >= start && date < end;
      });
    const totalMiles = roundVolume(training.reduce((sum, item) => sum + (Number(item.completedVolumeMiles) || 0), 0));
    const currentWeekStart = startOfBoardWeek(end);
    const currentWeekTraining = training.filter((item) => {
      const date = parseDate(item.sessionDate || item.syncedAt);
      return date && date >= currentWeekStart && date < addDays(currentWeekStart, 7);
    });
    const currentWeekMiles = sumVolumeBetween(training, currentWeekStart, addDays(currentWeekStart, 7));
    const previousWeekMiles = sumVolumeBetween(training, addDays(currentWeekStart, -7), currentWeekStart);
    const groups = uniqueStrings(training.map((item) => item.groupName).filter(Boolean));
    const last = training.slice().sort((a, b) => String(b.sessionDate || b.syncedAt).localeCompare(String(a.sessionDate || a.syncedAt)))[0] || {};
    const activeDays = uniqueStrings(training.map((item) => {
      const date = parseDate(item.sessionDate || item.syncedAt);
      return date ? dateOnly(date) : "";
    }).filter(Boolean)).length;
    const currentWeekActiveDays = uniqueStrings(currentWeekTraining.map((item) => {
      const date = parseDate(item.sessionDate || item.syncedAt);
      return date ? dateOnly(date) : "";
    }).filter(Boolean)).length;
    const row = {
      athleteName: athlete.name,
      gender: athlete.gender,
      groups,
      totalMiles,
      workouts: training.length,
      averagePerWorkout: training.length ? roundVolume(totalMiles / training.length) : 0,
      currentWeekMiles,
      currentWeekWorkouts: currentWeekTraining.length,
      currentWeekActiveDays,
      previousWeekMiles,
      weekChangeMiles: roundVolume(currentWeekMiles - previousWeekMiles),
      activeDays,
      lastLoggedDate: last.sessionDate || last.syncedAt || "",
    };
    if (showAttendance) {
      const attendance = milesBoardAttendanceSummary((attendanceRecords || []).filter((record) => attendanceMatchesAthlete(record, athlete)));
      row.attendanceRate = attendance.rate;
      row.attendanceRequired = attendance.required;
    }
    return {
      ...row,
      gameScore: milesBoardGameScore(row, gameSettings),
      currentWeekGameScore: milesBoardGameScore({
        totalMiles: row.currentWeekMiles,
        workouts: row.currentWeekWorkouts,
        currentWeekMiles: row.currentWeekMiles,
        weekChangeMiles: row.weekChangeMiles,
        activeDays: row.currentWeekActiveDays,
      }, gameSettings),
      goalHit: gameSettings.athleteGoalMiles > 0 && totalMiles >= gameSettings.athleteGoalMiles,
      badges: milesBoardBadges(row, gameSettings),
    };
  });
  return milesBoardCompetitionBadges(rows).sort((a, b) => b.totalMiles - a.totalMiles || b.workouts - a.workouts || a.athleteName.localeCompare(b.athleteName));
}

function milesBoardFilter(query, sharing) {
  const sport = clean(query && query.sport) || "Cross Country";
  const year = Number(query && query.seasonYear) || new Date().getFullYear();
  const groupNames = normalizeMilesBoardGroupNames(sharing && sharing.groupNames);
  return {
    sport,
    sportKey: optionValue(sport),
    sportLabel: labelValue(sport),
    seasonYear: year,
    groupNames,
  };
}

function milesBoardRecordMatchesFilter(item, filter) {
  if (!filter) return true;
  const year = Number(item.seasonYear) || yearFromDateValue(item.sessionDate || item.syncedAt);
  if (filter.seasonYear && year !== filter.seasonYear) return false;
  if (!filter.sportKey || filter.sportKey === "all") return true;
  const explicitSport = optionValue(item.sport);
  if (explicitSport) return explicitSport === filter.sportKey;
  if (filter.sportKey === "cross_country") return legacyCrossCountryTrainingRecord(item);
  return false;
}

function legacyCrossCountryTrainingRecord(item) {
  const text = [
    item.season,
    item.groupName,
    item.workoutPrescription,
    item.coachNote,
  ].filter(Boolean).join(" ").toLowerCase();
  if (/\b(cross country|xc|cc)\b/.test(text)) return true;
  const seasonKey = optionValue(item.season);
  if (optionValue(item.sport)) return false;
  if (seasonKey && !legacyMileageDateBucketSeason(seasonKey)) return false;
  if (!Number(item.completedVolumeMiles)) return false;
  if (/\b(track|speed|sprint|fly|starts?|runway|field event|jumps?|throws?)\b/.test(text)) return false;
  return true;
}

function legacyMileageDateBucketSeason(value) {
  return ["winter", "spring", "summer", "fall", "unspecified", "unlisted"].includes(optionValue(value));
}

function milesBoardAthletesForSelectedGroups(athletes, selectedKeys) {
  const keys = new Set(Array.isArray(selectedKeys) ? selectedKeys.map(clean).filter(Boolean).map((value) => value.toLowerCase()) : []);
  if (!keys.size) return athletes;
  return (Array.isArray(athletes) ? athletes : []).filter((athlete) => athleteMatchesSelectedMilesBoardGroup(athlete, keys));
}

function athleteMatchesSelectedMilesBoardGroup(athlete, keys) {
  return [athlete && athlete.id, athlete && athlete.contactId, athlete && athlete.smartcoachAthleteId, athlete && athlete.name]
    .map(clean)
    .filter(Boolean)
    .some((value) => keys.has(value.toLowerCase()));
}

function milesBoardDisplayOptions(source) {
  const input = source && typeof source === "object" ? source : {};
  return {
    teamAttendance: input.teamAttendance === true,
    athleteAttendance: input.athleteAttendance === true,
  };
}

function normalizeMilesBoardGroupNames(values) {
  const list = Array.isArray(values) ? values : clean(values).split(",");
  const seen = new Set();
  return list.map((value) => clean(value).slice(0, 120)).filter(Boolean).filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function rangeForAttendanceStart(value) {
  return publicBoardDate(value) || normalizedBoardRange(null, null).start;
}

function rangeForAttendanceEnd(value) {
  const date = publicBoardDate(value);
  return date || addDays(normalizedBoardRange(null, null).end, -1);
}

function attendanceMatchesAthlete(record, athlete) {
  if (!record || !athlete) return false;
  const recordIds = [record.athleteId, record.contactId, record.smartcoachAthleteId].map(clean).filter(Boolean).map((value) => value.toLowerCase());
  const athleteIds = [athlete.id, athlete.contactId, athlete.smartcoachAthleteId].map(clean).filter(Boolean).map((value) => value.toLowerCase());
  if (recordIds.length && athleteIds.length && recordIds.some((id) => athleteIds.includes(id))) return true;
  return clean(record.athleteName).toLowerCase() === clean(athlete.name).toLowerCase();
}

function milesBoardAttendanceSummary(records) {
  const counts = { present: 0, late: 0, checked_out: 0, absent: 0 };
  (Array.isArray(records) ? records : []).forEach((record) => {
    const status = clean(record && record.status).toLowerCase().replace(/\s+/g, "_");
    if (Object.prototype.hasOwnProperty.call(counts, status)) counts[status] += 1;
  });
  const attended = counts.present + counts.late + counts.checked_out;
  const required = attended + counts.absent;
  return {
    attended,
    required,
    rate: required ? Math.round((attended / required) * 100) : null,
  };
}

function milesBoardWeeklyWinners(rows, groups) {
  return {
    gameScore: milesBoardWinner(rows, "currentWeekGameScore", "pts this week"),
    mileage: milesBoardWinner(rows, "currentWeekMiles", "mi this week"),
    consistency: milesBoardWinner(rows, "currentWeekWorkouts", "workouts this week"),
    bigMover: milesBoardWinner(rows.filter((row) => row.weekChangeMiles > 0), "weekChangeMiles", "mi over last week"),
    pack: milesBoardPackWinner(groups),
  };
}

function milesBoardWinner(rows, key, suffix) {
  const winner = rows
    .filter((row) => Number(row[key]) > 0)
    .sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0) || (Number(b.currentWeekMiles) || 0) - (Number(a.currentWeekMiles) || 0) || a.athleteName.localeCompare(b.athleteName))[0];
  if (!winner) return { name: "", value: 0, label: "No winner yet" };
  const value = Number(winner[key]) || 0;
  return {
    name: winner.athleteName,
    value,
    label: `${key.indexOf("Miles") >= 0 || key === "weekChangeMiles" ? roundVolume(value) : Math.round(value)} ${suffix}`,
  };
}

function milesBoardPackWinner(groups) {
  const winner = (groups || [])
    .filter((group) => Number(group.currentWeekMiles) > 0 || Number(group.currentWeekGameScore) > 0)
    .sort((a, b) => (Number(b.currentWeekGameScore) || 0) - (Number(a.currentWeekGameScore) || 0) || (Number(b.currentWeekMiles) || 0) - (Number(a.currentWeekMiles) || 0) || milesBoardDivisionOrder(a.groupName) - milesBoardDivisionOrder(b.groupName))[0];
  if (!winner) return { name: "", value: 0, label: "No pack winner yet" };
  return {
    name: winner.groupName,
    value: Math.round(Number(winner.currentWeekGameScore) || 0),
    label: `${Math.round(Number(winner.currentWeekGameScore) || 0)} pts this week`,
  };
}

function milesBoardHighlights(rows) {
  return {
    gameLeader: milesBoardHighlight(rows, "gameScore", "pts"),
    mileageLeader: milesBoardHighlight(rows, "totalMiles", "mi"),
    weekLeader: milesBoardHighlight(rows, "currentWeekMiles", "mi this week"),
    consistencyLeader: milesBoardHighlight(rows, "workouts", "workouts"),
    bigMover: milesBoardHighlight(rows.filter((row) => row.weekChangeMiles > 0), "weekChangeMiles", "mi over last week"),
  };
}

function milesBoardHighlight(rows, key, suffix) {
  const sorted = rows
    .filter((row) => Number(row[key]) > 0)
    .sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0) || (Number(b.totalMiles) || 0) - (Number(a.totalMiles) || 0) || a.athleteName.localeCompare(b.athleteName));
  const row = sorted[0];
  if (!row) return { athleteName: "", value: 0, label: "No miles yet" };
  const value = Number(row[key]) || 0;
  return {
    athleteName: row.athleteName,
    value,
    label: `${key === "workouts" || key === "gameScore" ? Math.round(value) : roundVolume(value)} ${suffix}`,
  };
}

function milesBoardGameScore(row, settings) {
  const gameSettings = milesBoardGameSettings(settings);
  const mileagePoints = Math.round((Number(row.totalMiles) || 0) * gameSettings.pointsPerMile);
  const workoutPoints = Math.round((Number(row.workouts) || 0) * gameSettings.pointsPerWorkout);
  const weeklyPoints = Math.round((Number(row.currentWeekMiles) || 0) * gameSettings.pointsPerCurrentWeekMile);
  const moverPoints = Math.max(0, Math.round((Number(row.weekChangeMiles) || 0) * gameSettings.pointsPerImprovementMile));
  const consistencyBonus = (Number(row.activeDays) || 0) >= gameSettings.consistencyDays ? gameSettings.consistencyBonus : 0;
  return mileagePoints + workoutPoints + weeklyPoints + moverPoints + consistencyBonus;
}

function milesBoardBadges(row, settings) {
  const gameSettings = milesBoardGameSettings(settings);
  const badges = [];
  const totalMiles = Number(row.totalMiles) || 0;
  const workouts = Number(row.workouts) || 0;
  if (gameSettings.athleteGoalMiles > 0 && totalMiles >= gameSettings.athleteGoalMiles) badges.push("Goal Hit");
  if (totalMiles >= 100) badges.push("100 Mile Club");
  else if (totalMiles >= 50) badges.push("50 Mile Club");
  else if (totalMiles >= 25) badges.push("25 Mile Club");
  if (workouts >= 5) badges.push("Consistency");
  if ((Number(row.currentWeekMiles) || 0) >= 10) badges.push("This Week");
  if ((Number(row.currentWeekMiles) || 0) >= 30) badges.push("30 Mile Week");
  else if ((Number(row.currentWeekMiles) || 0) >= 20) badges.push("20 Mile Week");
  if ((Number(row.weekChangeMiles) || 0) > 0) badges.push("Big Mover");
  if ((Number(row.weekChangeMiles) || 0) >= 5) badges.push("Comeback Runner");
  return badges;
}

function milesBoardCompetitionBadges(rows) {
  const maxActiveDays = Math.max(0, ...rows.map((row) => Number(row.activeDays) || 0));
  const packLeaders = {};
  rows.forEach((row) => {
    const division = milesBoardGenderDivision(row.gender);
    if (!packLeaders[division] || (Number(row.currentWeekMiles) || 0) > (Number(packLeaders[division].currentWeekMiles) || 0)) {
      packLeaders[division] = row;
    }
  });
  return rows.map((row) => {
    const badges = Array.isArray(row.badges) ? row.badges.slice() : [];
    const division = milesBoardGenderDivision(row.gender);
    if (maxActiveDays >= 3 && (Number(row.activeDays) || 0) === maxActiveDays) badges.push("Streak Leader");
    if ((Number(row.currentWeekMiles) || 0) > 0 && packLeaders[division] && packLeaders[division].athleteName === row.athleteName) badges.push("Pack MVP");
    return { ...row, badges: uniqueStrings(badges) };
  });
}

function milesBoardGameSettings(source) {
  const input = source && typeof source === "object" ? source : {};
  return {
    challengeName: clean(input.challengeName).slice(0, 80) || "Summer Mileage Challenge",
    coachMessage: clean(input.coachMessage).slice(0, 240),
    teamGoalMiles: boundedBoardNumber(input.teamGoalMiles, 0, 10000),
    athleteGoalMiles: boundedBoardNumber(input.athleteGoalMiles, 0, 1000),
    pointsPerMile: boundedBoardNumber(input.pointsPerMile, 1, 100),
    pointsPerWorkout: boundedBoardNumber(input.pointsPerWorkout, 3, 100),
    pointsPerCurrentWeekMile: boundedBoardNumber(input.pointsPerCurrentWeekMile, 1, 100),
    pointsPerImprovementMile: boundedBoardNumber(input.pointsPerImprovementMile, 2, 100),
    consistencyDays: Math.round(boundedBoardNumber(input.consistencyDays, 3, 14)),
    consistencyBonus: boundedBoardNumber(input.consistencyBonus, 5, 500),
  };
}

function milesBoardSnapshots(source) {
  return (Array.isArray(source) ? source : []).slice(0, 12).map((item) => ({
    id: clean(item.id),
    rangeLabel: clean(item.rangeLabel),
    savedAt: clean(item.savedAt),
    challengeName: clean(item.challengeName),
    coachMessage: clean(item.coachMessage),
    totalMiles: roundVolume(item.totalMiles),
    workouts: Number(item.workouts) || 0,
    athletesActive: Number(item.athletesActive) || 0,
    packLeader: clean(item.packLeader),
    mileageWinner: clean(item.mileageWinner),
    gameWinner: clean(item.gameWinner),
    consistencyWinner: clean(item.consistencyWinner),
    bigMover: clean(item.bigMover),
  })).filter((item) => item.rangeLabel);
}

function boundedBoardNumber(value, fallback, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return fallback;
  return Math.min(number, max);
}

function milesBoardGroupRows(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = milesBoardGenderDivision(row.gender);
    if (!groups.has(key)) {
        groups.set(key, { groupName: key, athletes: 0, athletesWithMiles: 0, totalMiles: 0, workouts: 0, currentWeekMiles: 0, currentWeekGameScore: 0, gameScore: 0 });
    }
    const group = groups.get(key);
    group.athletes += 1;
    if (row.totalMiles > 0) group.athletesWithMiles += 1;
    group.totalMiles += Number(row.totalMiles) || 0;
    group.workouts += Number(row.workouts) || 0;
    group.currentWeekMiles += Number(row.currentWeekMiles) || 0;
    group.currentWeekGameScore += Number(row.currentWeekGameScore) || 0;
    group.gameScore += Number(row.gameScore) || 0;
  });
  return Array.from(groups.values()).map((group) => ({
    ...group,
    totalMiles: roundVolume(group.totalMiles),
    currentWeekMiles: roundVolume(group.currentWeekMiles),
    currentWeekGameScore: Math.round(group.currentWeekGameScore),
    gameScore: Math.round(group.gameScore),
    averagePerAthlete: group.athletes ? roundVolume(group.totalMiles / group.athletes) : 0,
  })).sort((a, b) => milesBoardDivisionOrder(a.groupName) - milesBoardDivisionOrder(b.groupName) || b.totalMiles - a.totalMiles || a.groupName.localeCompare(b.groupName));
}

function milesBoardGenderDivision(value) {
  const text = clean(value).toLowerCase();
  if (/\b(girl|girls|female|women|womens)\b/.test(text)) return "Girls";
  if (/\b(boy|boys|male|men|mens)\b/.test(text)) return "Boys";
  return "Unlisted";
}

function milesBoardDivisionOrder(value) {
  if (value === "Boys") return 1;
  if (value === "Girls") return 2;
  return 3;
}

function uniqueStrings(values) {
  const seen = new Set();
  return values.map(clean).filter(Boolean).filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function publicBoardDate(value) {
  const text = clean(Array.isArray(value) ? value[0] : value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function yearFromDateValue(value) {
  const match = clean(value).match(/^(\d{4})/);
  return match ? Number(match[1]) || 0 : 0;
}

function normalizedBoardRange(start, end) {
  const today = new Date();
  const defaultStart = new Date(today.getFullYear(), 5, 1);
  const defaultEnd = addDays(new Date(today.getFullYear(), today.getMonth(), today.getDate()), 1);
  const safeStart = start || defaultStart;
  const safeEnd = end ? addDays(end, 1) : defaultEnd;
  if (safeEnd <= safeStart) return { start: defaultStart, end: defaultEnd };
  return { start: safeStart, end: safeEnd };
}

function boardRangeLabel(start, end) {
  return `${shortBoardDate(start)} - ${shortBoardDate(addDays(end, -1))}`;
}

function shortBoardDate(date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function dateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-SMARTCoach-Account");
}

async function listActiveAthletes({ token, locationId }) {
  const [activeFieldIds, athleteIdFieldIds, genderFieldIds] = await Promise.all([
    listContactFieldIds({ token, locationId, names: ATHLETE_FIELD_ALIASES.smartcoachActive }),
    listContactFieldIds({ token, locationId, names: ATHLETE_FIELD_ALIASES.smartcoachAthleteId }),
    listContactFieldIds({ token, locationId, names: ATHLETE_FIELD_ALIASES.gender }),
  ]);
  const result = await ghlFetch({
    token,
    path: `/contacts/?locationId=${encodeURIComponent(locationId)}&limit=100`,
    method: "GET",
  });

  return (result.contacts || [])
    .map((contact) => normalizeContact(contact, { activeFieldIds, athleteIdFieldIds, genderFieldIds }))
    .filter((athlete) => athlete.smartcoachActive && !athlete.excludedSystemContact)
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function listContactFieldIds({ token, locationId, names }) {
  try {
    const result = await ghlFetch({
      token,
      path: `/locations/${encodeURIComponent(locationId)}/customFields`,
      method: "GET",
    });
    const wanted = names.map((name) => clean(name).toLowerCase()).filter(Boolean);
    return customFieldsFromResult(result).filter((field) => {
      const labels = [
        field.id,
        field.key,
        field.fieldKey,
        field.field_key,
        field.name,
        field.fieldName,
        field.field_name,
        field.label,
      ].map((value) => clean(value).toLowerCase());
      return labels.some((label) => {
        if (wanted.includes(label)) return true;
        const simple = label.split(".").pop().split("_").pop();
        return wanted.includes(simple);
      });
    }).map((field) => clean(field.id || field.fieldId || field.customFieldId)).filter(Boolean);
  } catch (error) {
    return [];
  }
}

async function searchObjectRecords({ token, locationId, schemaKey, signal }) {
  try {
    const records = [];
    for (let page = 1; page <= 10; page += 1) {
      const result = await ghlFetch({
        token,
        path: `/objects/${encodeURIComponent(schemaKey)}/records/search`,
        method: "POST",
        body: { locationId, page, pageLimit: 100 },
        signal,
      });
      const batch = recordsFromResult(result);
      records.push(...batch);
      if (batch.length < 100) break;
    }
    return uniqueRecords(records);
  } catch (error) {
    if (error.statusCode && error.statusCode >= 500) throw error;
    return [];
  }
}

async function safeDashboardObjectRecords(options) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timer = null;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        if (controller) controller.abort();
        reject(httpError(504, "Dashboard optional lookup timed out."));
      }, OPTIONAL_DASHBOARD_RECORD_TIMEOUT_MS);
    });
    return await Promise.race([
      searchObjectRecords({ ...options, signal: controller && controller.signal }),
      timeout,
    ]);
  } catch (error) {
    console.warn("SMART Trak dashboard optional object lookup failed", {
      schemaKey: options && options.schemaKey,
      statusCode: error && error.statusCode,
      message: error && error.message,
    });
    return [];
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function buildRecentTrainingSyncs({ athletes, performanceRecords }) {
  const rows = [];
  athletes.forEach((athlete) => {
    performanceRecords.forEach((record) => {
      if (!recordMatchesAthlete(record, athlete)) return;
      if (isVoidedPerformanceRecord(record)) return;
      const training = normalizePerformanceRecord(record);
      if (!training.groupName && !training.totalTimeDisplay) return;
      rows.push({
        athleteName: athlete.name,
        contactId: athlete.id,
        athleteGender: athlete.gender,
        ...training,
      });
    });
  });
  return rows.sort(sortTrainingSyncDesc);
}

function buildRecentMeetResults({ athletes, meetRecords }) {
  const rows = [];
  const matchedRecordIds = new Set();
  athletes.forEach((athlete) => {
    meetRecords.forEach((record) => {
      if (!recordMatchesAthlete(record, athlete)) return;
      if (isVoidedMeetResult(record)) return;
      const result = normalizeMeetResult(record);
      if (!result.event && !result.resultDisplay) return;
      if (result.recordId) matchedRecordIds.add(result.recordId);
      rows.push({
        ...result,
        athleteName: athlete.name,
        contactId: athlete.id,
        athleteGender: result.athleteGender || athlete.gender,
      });
    });
  });
  meetRecords.forEach((record) => {
    if (isVoidedMeetResult(record)) return;
    const result = normalizeMeetResult(record);
    if (!isRelayMeetResult(result) && !isHistoricalMeetResult(result)) return;
    if (result.recordId && matchedRecordIds.has(result.recordId)) return;
    rows.push(result);
  });
  return rows.sort(sortMeetSyncDesc);
}

function resultsBoardSharing(source) {
  const input = source && typeof source === "object" ? source : {};
  return {
    active: input.active !== false,
    sport: resultsBoardSport(input.sport || "Cross Country"),
    seasonYear: Number(input.seasonYear) || new Date().getFullYear(),
    displayOptions: {
      latestMeet: !(input.displayOptions && input.displayOptions.latestMeet === false),
      seasonSummary: !(input.displayOptions && input.displayOptions.seasonSummary === false),
      meetArchive: !(input.displayOptions && input.displayOptions.meetArchive === false),
      athleteSummary: !(input.displayOptions && input.displayOptions.athleteSummary === false),
      eventSummary: !(input.displayOptions && input.displayOptions.eventSummary === false),
      divisionSummary: !(input.displayOptions && input.displayOptions.divisionSummary === false),
      bestHighlights: !(input.displayOptions && input.displayOptions.bestHighlights === false),
      bestBadges: !(input.displayOptions && input.displayOptions.bestBadges === false),
      grades: !(input.displayOptions && input.displayOptions.grades === false),
      teamSummary: !(input.displayOptions && input.displayOptions.teamSummary === false),
      detailOrder: normalizeResultsBoardDetailOrder(input.displayOptions && input.displayOptions.detailOrder),
    },
    gameSettings: {
      boardName: clean(input.gameSettings && input.gameSettings.boardName).slice(0, 80) || "Team Results Board",
      coachMessage: clean(input.gameSettings && input.gameSettings.coachMessage).slice(0, 240),
    },
  };
}

function resultsBoardFilters(query, sharing) {
  const sport = resultsBoardSport(query && query.sport || sharing.sport);
  const meetInput = clean(query && query.meet).slice(0, 160);
  return {
    sport,
    sportKey: optionValue(sport),
    sportLabel: sport,
    seasonYear: Number(query && query.seasonYear) || Number(sharing.seasonYear) || new Date().getFullYear(),
    allMeets: meetInput === "__all__",
    meetName: meetInput === "__all__" ? "" : meetInput,
    event: clean(query && query.event).slice(0, 80),
    gender: resultsBoardGender(query && query.gender),
  };
}

function resultsBoardRowMatches(row, filters) {
  if (!row) return false;
  if (filters.seasonYear && (Number(row.seasonYear) || yearFromDateValue(row.meetDate)) !== filters.seasonYear) return false;
  if (filters.sportKey && filters.sportKey !== "all") {
    const rowSport = optionValue(row.sport || filters.sportLabel);
    if (rowSport && rowSport !== filters.sportKey) return false;
  }
  if (filters.meetName && clean(row.meetName) !== filters.meetName) return false;
  if (filters.event && clean(row.event) !== filters.event) return false;
  if (filters.gender && resultsBoardGender(row.athleteGender) !== filters.gender) return false;
  return true;
}

function latestResultsMeetName(rows) {
  const latest = (Array.isArray(rows) ? rows : []).slice().sort((a, b) => String(b.meetDate || b.syncedAt).localeCompare(String(a.meetDate || a.syncedAt)) || clean(a.meetName).localeCompare(clean(b.meetName)))[0];
  return clean(latest && latest.meetName);
}

function resultsBoardFilterOptions(rows, filters) {
  const scoped = (Array.isArray(rows) ? rows : []).filter((row) => {
    const year = Number(row.seasonYear) || yearFromDateValue(row.meetDate);
    const rowSport = optionValue(row.sport || filters.sportLabel);
    return (!filters.seasonYear || year === filters.seasonYear) && (!filters.sportKey || !rowSport || rowSport === filters.sportKey);
  });
  return {
    meets: uniqueStrings(scoped.map((row) => row.meetName)),
    events: uniqueStrings(scoped.map((row) => row.event)),
    years: uniqueStrings((Array.isArray(rows) ? rows : []).map((row) => String(Number(row.seasonYear) || yearFromDateValue(row.meetDate) || "")).filter(Boolean)).sort(),
  };
}

function resultsBoardFilterLabel(filters, meetName) {
  return [filters.sportLabel, filters.seasonYear, filters.allMeets ? "All Meets" : meetName || "Latest meet"].filter(Boolean).join(" · ");
}

function defaultResultsBoardDetailOrder() {
  return ["bestHighlights", "divisionSummary", "latestMeet", "meetArchive", "athleteSummary", "eventSummary", "seasonSummary"];
}

function normalizeResultsBoardDetailOrder(values) {
  const defaults = defaultResultsBoardDetailOrder();
  const allowed = new Set(defaults);
  const out = [];
  (Array.isArray(values) ? values : []).forEach((value) => {
    const key = clean(value);
    if (allowed.has(key) && !out.includes(key)) out.push(key);
  });
  defaults.forEach((key) => {
    if (!out.includes(key)) out.push(key);
  });
  return out;
}

function resultsBoardTopTimedResult(rows, gender) {
  const list = Array.isArray(rows) ? rows : [];
  const fastest = list.slice().filter((row) => {
    if (!(Number(row.resultMs) > 0)) return false;
    return !gender || resultsBoardGender(row.athleteGender) === gender;
  }).sort((a, b) => Number(a.resultMs) - Number(b.resultMs))[0] || {};
  return fastest.athleteName ? {
    athleteName: fastest.athleteName,
    event: fastest.event,
    resultDisplay: fastest.resultDisplay,
  } : null;
}

function resultsBoardMeetSummary(rows, meetName) {
  const list = Array.isArray(rows) ? rows : [];
  return {
    meetName: meetName || "",
    meetDate: list[0] && list[0].meetDate || "",
    athletes: uniqueStrings(list.map((row) => row.athleteName)).length,
    results: list.length,
    personalBests: list.filter((row) => row.isPr).length,
    seasonBests: list.filter((row) => row.isSeasonBest).length,
    topResult: resultsBoardTopTimedResult(list),
    topGirlsResult: resultsBoardTopTimedResult(list, "girl"),
    topBoysResult: resultsBoardTopTimedResult(list, "boy"),
  };
}

function resultsBoardSeasonSummary(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return {
    athletes: uniqueStrings(list.map((row) => row.athleteName)).length,
    results: list.length,
    meets: uniqueStrings(list.map((row) => row.meetName)).length,
    personalBests: list.filter((row) => row.isPr).length,
    seasonBests: list.filter((row) => row.isSeasonBest).length,
  };
}

function resultsBoardMeetArchive(rows) {
  const byMeet = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const meetName = clean(row.meetName) || "Unlisted meet";
    const key = `${meetName}|${clean(row.meetDate)}`;
    if (!byMeet.has(key)) {
      byMeet.set(key, {
        meetName,
        meetDate: clean(row.meetDate),
        results: 0,
        athletes: new Set(),
        events: new Set(),
        personalBests: 0,
        seasonBests: 0,
      });
    }
    const item = byMeet.get(key);
    item.results += 1;
    if (clean(row.athleteName)) item.athletes.add(clean(row.athleteName).toLowerCase());
    if (clean(row.event)) item.events.add(clean(row.event));
    if (row.isPr) item.personalBests += 1;
    if (row.isSeasonBest) item.seasonBests += 1;
  });
  return Array.from(byMeet.values()).map((item) => ({
    meetName: item.meetName,
    meetDate: item.meetDate,
    results: item.results,
    athletes: item.athletes.size,
    events: item.events.size,
    personalBests: item.personalBests,
    seasonBests: item.seasonBests,
  })).sort((a, b) => String(b.meetDate).localeCompare(String(a.meetDate)) || a.meetName.localeCompare(b.meetName));
}

function resultsBoardAthleteSummaryRows(rows) {
  const byAthlete = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const athleteName = clean(row.athleteName) || "Unlisted athlete";
    const key = athleteName.toLowerCase();
    if (!byAthlete.has(key)) {
      byAthlete.set(key, {
        athleteName,
        gender: resultsBoardGender(row.athleteGender),
        results: 0,
        meets: new Set(),
        events: new Set(),
        personalBests: 0,
        seasonBests: 0,
        bestResult: null,
        latestDate: "",
      });
    }
    const item = byAthlete.get(key);
    item.results += 1;
    if (clean(row.meetName)) item.meets.add(clean(row.meetName));
    if (clean(row.event)) item.events.add(clean(row.event));
    if (row.isPr) item.personalBests += 1;
    if (row.isSeasonBest) item.seasonBests += 1;
    if (!item.bestResult || resultsBetter(row, item.bestResult)) item.bestResult = row;
    if (String(row.meetDate || "") > item.latestDate) item.latestDate = String(row.meetDate || "");
  });
  return Array.from(byAthlete.values()).map((item) => ({
    athleteName: item.athleteName,
    gender: item.gender,
    results: item.results,
    meets: item.meets.size,
    events: item.events.size,
    personalBests: item.personalBests,
    seasonBests: item.seasonBests,
    bestEvent: item.bestResult && item.bestResult.event || "",
    bestResult: item.bestResult && item.bestResult.resultDisplay || "",
    latestDate: item.latestDate,
  })).sort((a, b) =>
    b.personalBests - a.personalBests ||
    b.seasonBests - a.seasonBests ||
    b.results - a.results ||
    a.athleteName.localeCompare(b.athleteName)
  );
}

function resultsBoardEventSummaryRows(rows) {
  const byEvent = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const event = clean(row.event) || "Unlisted event";
    const key = event.toLowerCase();
    if (!byEvent.has(key)) {
      byEvent.set(key, {
        event,
        results: 0,
        athletes: new Set(),
        meets: new Set(),
        personalBests: 0,
        seasonBests: 0,
        leader: null,
        latestDate: "",
      });
    }
    const item = byEvent.get(key);
    item.results += 1;
    if (clean(row.athleteName)) item.athletes.add(clean(row.athleteName).toLowerCase());
    if (clean(row.meetName)) item.meets.add(clean(row.meetName));
    if (row.isPr) item.personalBests += 1;
    if (row.isSeasonBest) item.seasonBests += 1;
    if (!item.leader || resultsBetter(row, item.leader)) item.leader = row;
    if (String(row.meetDate || "") > item.latestDate) item.latestDate = String(row.meetDate || "");
  });
  return Array.from(byEvent.values()).map((item) => ({
    event: item.event,
    results: item.results,
    athletes: item.athletes.size,
    meets: item.meets.size,
    personalBests: item.personalBests,
    seasonBests: item.seasonBests,
    leaderName: item.leader && item.leader.athleteName || "",
    leaderResult: item.leader && item.leader.resultDisplay || "",
    latestDate: item.latestDate,
  })).sort((a, b) =>
    b.results - a.results ||
    b.athletes - a.athletes ||
    a.event.localeCompare(b.event)
  );
}

function resultsBoardDivisionSummaryRows(rows) {
  const byDivision = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const gender = resultsBoardGender(row.athleteGender);
    const key = gender || "unlisted";
    if (!byDivision.has(key)) {
      byDivision.set(key, {
        division: key,
        results: 0,
        athletes: new Set(),
        meets: new Set(),
        events: new Set(),
        personalBests: 0,
        seasonBests: 0,
        leader: null,
        latestDate: "",
      });
    }
    const item = byDivision.get(key);
    item.results += 1;
    if (clean(row.athleteName)) item.athletes.add(clean(row.athleteName).toLowerCase());
    if (clean(row.meetName)) item.meets.add(clean(row.meetName));
    if (clean(row.event)) item.events.add(clean(row.event));
    if (row.isPr) item.personalBests += 1;
    if (row.isSeasonBest) item.seasonBests += 1;
    if (!item.leader || resultsBetter(row, item.leader)) item.leader = row;
    if (String(row.meetDate || "") > item.latestDate) item.latestDate = String(row.meetDate || "");
  });
  const order = { boy: 1, girl: 2, unlisted: 3 };
  return Array.from(byDivision.values()).map((item) => ({
    division: item.division,
    divisionLabel: resultsBoardDivisionLabel(item.division),
    results: item.results,
    athletes: item.athletes.size,
    meets: item.meets.size,
    events: item.events.size,
    personalBests: item.personalBests,
    seasonBests: item.seasonBests,
    leaderName: item.leader && item.leader.athleteName || "",
    leaderEvent: item.leader && item.leader.event || "",
    leaderResult: item.leader && item.leader.resultDisplay || "",
    latestDate: item.latestDate,
  })).sort((a, b) => (order[a.division] || 99) - (order[b.division] || 99));
}

function resultsBoardBestHighlightRows(rows) {
  return (Array.isArray(rows) ? rows : []).filter((row) => row && (row.isPr || row.isSeasonBest)).slice().sort((a, b) =>
    String(b.meetDate || b.syncedAt).localeCompare(String(a.meetDate || a.syncedAt)) ||
    Number(!!b.isPr) - Number(!!a.isPr) ||
    clean(a.athleteName).localeCompare(clean(b.athleteName))
  ).map((row) => ({
    athleteName: clean(row.athleteName),
    meetName: clean(row.meetName),
    meetDate: clean(row.meetDate),
    event: clean(row.event),
    resultDisplay: clean(row.resultDisplay),
    isPr: !!row.isPr,
    isSeasonBest: !!row.isSeasonBest,
  }));
}

function resultsBoardSeasonBestRows(rows) {
  const bestByAthleteEvent = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const key = `${clean(row.athleteName).toLowerCase()}|${clean(row.event).toLowerCase()}`;
    if (!key.replace("|", "")) return;
    const current = bestByAthleteEvent.get(key);
    if (!current || resultsBetter(row, current)) bestByAthleteEvent.set(key, row);
  });
  return Array.from(bestByAthleteEvent.values());
}

function resultsBetter(left, right) {
  const leftMs = Number(left && left.resultMs) || parseTimeToMs(left && left.resultDisplay);
  const rightMs = Number(right && right.resultMs) || parseTimeToMs(right && right.resultDisplay);
  if (leftMs && rightMs) return leftMs < rightMs;
  if (leftMs && !rightMs) return true;
  if (!leftMs && rightMs) return false;
  return String(left && left.meetDate || "").localeCompare(String(right && right.meetDate || "")) > 0;
}

function resultsSort(a, b) {
  return clean(a.event).localeCompare(clean(b.event)) ||
    (Number(a.resultMs) || 999999999) - (Number(b.resultMs) || 999999999) ||
    clean(a.athleteName).localeCompare(clean(b.athleteName));
}

function resultsBoardSport(value) {
  const key = optionValue(value);
  if (key === "track" || key === "track_and_field" || key === "track_field") return "Track";
  return "Cross Country";
}

function resultsBoardGender(value) {
  const text = clean(value).toLowerCase();
  if (/\b(boy|boys|male|men|mens|m)\b/.test(text)) return "boy";
  if (/\b(girl|girls|female|women|womens|f)\b/.test(text)) return "girl";
  return "";
}

function resultsBoardDivisionLabel(value) {
  if (value === "boy") return "Boys";
  if (value === "girl") return "Girls";
  return "Unlisted";
}

function isHistoricalMeetResult(result) {
  return clean(result && result.resultType).toLowerCase() === "historical import" ||
    clean(result && result.sourceRecordId).toLowerCase().startsWith("mhi_") ||
    /Athletic\.net|historical/i.test(clean(result && result.coachRaceNotes));
}

function buildAthleteRow({ athlete, bestRecords, meetRecords, performanceRecords }) {
  const bests = bestRecords.filter((record) => recordMatchesAthlete(record, athlete)).map(normalizeBest).filter((item) => item.event);
  const meets = meetRecords.filter((record) => recordMatchesAthlete(record, athlete)).map(normalizeMeetResult).filter((item) => item.event || item.resultDisplay).sort(sortByDateDesc);
  const training = performanceRecords.filter((record) => recordMatchesAthlete(record, athlete) && !isVoidedPerformanceRecord(record)).map(normalizePerformanceRecord).filter((item) => item.groupName || item.totalTimeDisplay).sort(sortByDateDesc);
  const currentFitness = chooseCurrentFitness(bests);
  const latestMeet = meets[0] || {};
  const latestTraining = training[0] || {};

  return {
    contactId: athlete.id,
    name: athlete.name,
    gender: athlete.gender,
    smartcoachAthleteId: athlete.smartcoachAthleteId,
    currentFitness,
    latestMeet,
    latestTraining,
    currentWeekRuns: countRunsBetween(training, startOfCurrentWeek(), addDays(startOfCurrentWeek(), 7)),
    previousWeekRuns: countRunsBetween(training, addDays(startOfCurrentWeek(), -7), startOfCurrentWeek()),
    currentWeekVolumeMiles: sumVolumeBetween(training, startOfCurrentWeek(), addDays(startOfCurrentWeek(), 7)),
    previousWeekVolumeMiles: sumVolumeBetween(training, addDays(startOfCurrentWeek(), -7), startOfCurrentWeek()),
    currentMonthVolumeMiles: sumVolumeBetween(training, startOfCurrentMonth(), addDays(startOfNextMonth(), 0)),
    meetResultCount: meets.length,
    trainingRecordCount: training.length,
    status: athlete.smartcoachActive ? "Active" : "Tagged",
  };
}

function chooseCurrentFitness(bests) {
  const usable = bests.filter((item) => !isFutureDate(bestDate(item)));
  const source = usable.length ? usable : bests;
  const sorted = source.slice().sort((a, b) => String(bestDate(b)).localeCompare(String(bestDate(a))));
  const best = sorted[0] || {};
  const display = best.lastResultDisplay || best.seasonBestDisplay || best.personalBestDisplay || "";
  const resultMs = best.lastResultDisplay === display
    ? parseTimeToMs(display)
    : (best.seasonBestDisplay === display ? best.seasonBestMs : best.personalBestMs) || parseTimeToMs(display);
  const date = bestDate(best);
  return {
    event: best.event || "",
    display,
    resultMs: resultMs || 0,
    date,
    label: [best.event, display].filter(Boolean).join(" "),
  };
}

function bestDate(best) {
  return best.lastResultDate || best.seasonBestDate || best.personalBestDate || "";
}

function isFutureDate(value) {
  const date = parseDate(value);
  if (!date) return false;
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return date > today;
}

function normalizeContact(contact, options = {}) {
  const tags = Array.isArray(contact.tags) ? contact.tags : [];
  const smartcoachActiveValue = existingCustomFieldValueByIdsOrNames(contact, [SMARTCOACH_ACTIVE_FIELD_ID].concat(options.activeFieldIds || []), ATHLETE_FIELD_ALIASES.smartcoachActive);
  const smartcoachAthleteId = existingCustomFieldValueByIdsOrNames(contact, [SMARTCOACH_ATHLETE_ID_FIELD_ID].concat(options.athleteIdFieldIds || []), ATHLETE_FIELD_ALIASES.smartcoachAthleteId);
  const explicitlyInactive = isInactiveValue(smartcoachActiveValue);
  const hasAthleteTag = tags.some((tag) => clean(tag).toLowerCase() === "smartcoach-athlete");
  const excludedSystemContact = isExcludedSystemContact(tags) || isSmartCoachSupportContact(contact);
  const inferredSmartCoachAthlete = hasAthleteTag;
  const smartcoachActive = !excludedSystemContact && inferredSmartCoachAthlete && (isActiveValue(smartcoachActiveValue) || (!explicitlyInactive && Boolean(smartcoachAthleteId || hasAthleteTag)));
  return {
    id: contact.id,
    name: contactName(contact),
    gender: contactGender(contact, options.genderFieldIds),
    smartcoachActive,
    smartcoachActiveValue,
    smartcoachAthleteId,
    smartcoachRosterMember: !excludedSystemContact && inferredSmartCoachAthlete,
    excludedSystemContact,
    tags,
  };
}

function isExcludedSystemContact(tags) {
  return (Array.isArray(tags) ? tags : []).some((tag) => {
    const value = clean(tag).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    return value === "live chat" ||
      value === "voice chat" ||
      value === "support" ||
      value === "smartcoach account owner" ||
      value === "smartcoach feedback" ||
      value === "smartcoach bug trak" ||
      value === "smartcoach idea trak";
  });
}

function isSmartCoachSupportContact(contact) {
  const emails = [contact && contact.email, contact && contact.emailLowerCase, contact && contact.primaryEmail].map(clean).map((email) => email.toLowerCase());
  return emails.some((email) => email === "support@smartcoach-pro.com");
}

function contactGender(contact, genderFieldIds = []) {
  const fieldValue = genderFieldIds.map((fieldId) => existingCustomFieldValue(contact, fieldId)).find(Boolean);
  return clean(
    contact && (contact.gender || contact.sex || contact.genderIdentity)
  ) || fieldValue || existingCustomFieldValueByName(contact, ["gender", "sex", "division"]);
}

function normalizeBest(record) {
  const props = recordProperties(record);
  return {
    event: prop(props, "event"),
    personalBestDisplay: prop(props, "personal_best_display"),
    personalBestMs: Number(prop(props, "personal_best_ms")) || 0,
    personalBestDate: prop(props, "personal_best_date"),
    personalBestMeet: prop(props, "personal_best_meet"),
    seasonBestDisplay: prop(props, "season_best_display"),
    seasonBestMs: Number(prop(props, "season_best_ms")) || 0,
    seasonBestDate: prop(props, "season_best_date"),
    seasonBestMeet: prop(props, "season_best_meet"),
    lastResultDisplay: prop(props, "last_result_display"),
    lastResultDate: prop(props, "last_result_date"),
  };
}

function normalizeMeetResult(record) {
  const props = recordProperties(record);
  const coachRaceNotes = prop(props, "coach_race_notes");
  const splitsText = prop(props, "splits_json");
  const resultType = noteValue(coachRaceNotes, "Result Type");
  return {
    recordId: record && record.id ? record.id : "",
    sourceRecordId: prop(props, "source_record_id"),
    athleteName: prop(props, "athlete_name_snapshot"),
    athleteGender: noteValue(coachRaceNotes, "Gender"),
    meetName: prop(props, "meet_name"),
    event: prop(props, "event"),
    resultDisplay: prop(props, "result_display"),
    resultMs: Number(prop(props, "result_ms")) || 0,
    meetDate: prop(props, "meet_date"),
    season: labelValue(prop(props, "season")) || prop(props, "season"),
    seasonYear: Number(prop(props, "season_year")) || yearFromDateValue(prop(props, "meet_date")),
    sport: labelValue(prop(props, "sport")) || prop(props, "sport"),
    wind: prop(props, "wind"),
    isPr: yes(prop(props, "is_pr")),
    isSeasonBest: yes(prop(props, "is_season_best")),
    splitsText,
    resultType,
    relayType: noteValue(coachRaceNotes, "Relay Type"),
    relayTeamName: noteValue(coachRaceNotes, "Relay Team"),
    fieldAttempts: noteValue(coachRaceNotes, "Field Attempts"),
    fieldVideo: noteValue(coachRaceNotes, "Video"),
    coachRaceNotes,
    correctionDate: noteValue(coachRaceNotes, "Correction Date"),
    correctionReason: noteValue(coachRaceNotes, "Correction Reason"),
    corrected: !!noteValue(coachRaceNotes, "Correction Date"),
    syncedAt: recordTimestamp(record),
  };
}

function isRelayMeetResult(result) {
  return clean(result && result.resultType).toLowerCase() === "relay" || /"name"\s*:/.test(clean(result && result.splitsText));
}

function isVoidedMeetResult(record) {
  const note = prop(recordProperties(record), "coach_race_notes").toLowerCase();
  return note.indexOf("smartcoach status: voided") >= 0;
}

function normalizePerformanceRecord(record) {
  const props = recordProperties(record);
  const coachNote = prop(props, "coach_note");
  const completedVolume = noteValue(coachNote, "Completed volume");
  const plannedVolume = noteValue(coachNote, "Planned volume");
  const splitsText = prop(props, "splits_json");
  const workoutPrescription = noteValue(coachNote, "Workout");
  const workoutType = labelValue(prop(props, "workout_type")) || workoutTypeFromRecordName(prop(props, "performance_record"), prop(props, "athlete_name_snapshot"));
  const effectiveVolume = effectiveCompletedVolume({
    completedVolume,
    plannedVolume,
    workoutPrescription,
    coachNote,
    splitsText,
    workoutType,
    plannedEffort: noteValue(coachNote, "Planned effort"),
  });
  return {
    recordId: record && record.id ? record.id : "",
    sourceSessionId: prop(props, "source_session_id"),
    sourceRecordId: prop(props, "source_record_id"),
    groupName: prop(props, "group_name"),
    season: labelValue(prop(props, "season")) || prop(props, "season"),
    seasonYear: Number(prop(props, "season_year")) || yearFromDateValue(prop(props, "session_date")),
    sport: labelValue(prop(props, "sport")) || prop(props, "sport"),
    workoutType,
    surface: labelValue(prop(props, "surface")),
    repNumber: Number(prop(props, "rep_number")) || null,
    totalTimeDisplay: prop(props, "total_time_display"),
    totalTimeMs: Number(prop(props, "total_time_ms")) || 0,
    sessionDate: prop(props, "session_date"),
    splitsText,
    coachNote,
    workoutPrescription,
    plannedTarget: noteValue(coachNote, "Planned target"),
    actual: noteValue(coachNote, "Actual"),
    targetDifference: noteValue(coachNote, "Difference"),
    plannedEffort: noteValue(coachNote, "Planned effort"),
    plannedVolume,
    completedVolume: effectiveVolume.label || completedVolume,
    completedVolumeMiles: effectiveVolume.miles || parseVolumeToMiles(completedVolume),
    plannedVolumeMiles: parseVolumeToMiles(plannedVolume),
    currentFitnessSnapshot: noteValue(coachNote, "Current fitness"),
    athleteNote: noteValue(coachNote, "Athlete note") || noteValue(coachNote, "Athlete notes"),
    weather: noteValue(coachNote, "Weather"),
    correctionDate: noteValue(coachNote, "Correction Date"),
    correctionReason: noteValue(coachNote, "Correction Reason"),
    corrected: !!noteValue(coachNote, "Correction Date"),
    syncedAt: recordTimestamp(record),
  };
}

function workoutTypeFromRecordName(recordName, athleteName) {
  let text = clean(recordName);
  const athlete = clean(athleteName);
  if (!text) return "";
  if (athlete && text.toLowerCase().startsWith(`${athlete.toLowerCase()} - `)) {
    text = text.slice(athlete.length + 3);
  }
  text = text.replace(/\s+-\s+Run\s+\d+\s*$/i, "");
  return clean(text);
}

function isVoidedPerformanceRecord(record) {
  const note = prop(recordProperties(record), "coach_note").toLowerCase();
  return note.indexOf("smartcoach status: voided") >= 0;
}

function noteValue(note, label) {
  const prefix = `${label}:`;
  const line = clean(note).split(/\r?\n/).find((item) => item.trim().toLowerCase().startsWith(prefix.toLowerCase()));
  return line ? clean(line.slice(prefix.length)) : "";
}

function recordMatchesAthlete(record, athlete) {
  const props = recordProperties(record);
  const contactValue = prop(props, "athlete_contact");
  if (contactValue && contactValue === athlete.id) return true;
  const nameValue = prop(props, "athlete_name_snapshot").toLowerCase();
  return !!nameValue && !!athlete.name && nameValue === athlete.name.toLowerCase();
}

function countRunsBetween(training, start, end) {
  return training.filter((item) => {
    const date = parseDate(item.sessionDate);
    return date && date >= start && date < end;
  }).length;
}

function sumVolumeBetween(training, start, end) {
  return roundVolume(training.reduce((sum, item) => {
    const date = parseDate(item.sessionDate);
    if (!date || date < start || date >= end) return sum;
    return sum + (Number(item.completedVolumeMiles) || 0);
  }, 0));
}

function startOfCurrentMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function startOfNextMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

function parseVolumeToMiles(value) {
  const text = clean(value).toLowerCase();
  if (!text) return 0;
  const repMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:x|×)\s*(\d+(?:\.\d+)?)\s*(mi|mile|miles|km|k|meter|meters|m)\b/);
  if (repMatch) return convertVolumeToMiles(Number(repMatch[1]) * Number(repMatch[2]), repMatch[3]);
  const rangeMatch = text.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*(mi|mile|miles|km|k|meter|meters|m)\b/);
  if (rangeMatch) return convertVolumeToMiles((Number(rangeMatch[1]) + Number(rangeMatch[2])) / 2, rangeMatch[3]);
  const match = text.match(/(\d+(?:\.\d+)?)\s*(mi|mile|miles|km|k|meter|meters|m)\b/);
  if (match) return convertVolumeToMiles(Number(match[1]), match[2]);
  const numericOnly = text.match(/^\s*(\d+(?:\.\d+)?)\s*$/);
  return numericOnly ? Number(numericOnly[1]) : 0;
}

function effectiveCompletedVolume(row) {
  const splitVolume = completedRepVolumeFromSplits(row);
  if (splitVolume) return splitVolume;
  return { label: clean(row && row.completedVolume), miles: parseVolumeToMiles(row && row.completedVolume) };
}

function completedRepVolumeFromSplits(row) {
  if (!row) return null;
  const splits = parseSplitLines(row.splitsText);
  const reps = workSplitCount(row, splits);
  if (!reps) return null;
  const source = [
    row.workoutPrescription,
    row.coachNote,
    row.plannedVolume,
    row.completedVolume,
    row.plannedEffort,
    row.workoutType,
  ].filter(Boolean).join(" ");
  const distance = explicitRepDistanceFromText(source) || repDistanceFromVolumeRange(row.plannedVolume || row.completedVolume, reps, source);
  if (!distance || !distance.meters) return null;
  return {
    label: `${reps} x ${distance.label} completed`,
    miles: roundVolume((distance.meters * reps) / 1609.344),
  };
}

function explicitRepDistanceFromText(text) {
  const match = clean(text).match(/\b\d+(?:\s*[-–]\s*\d+)?\s*(?:x|×)\s*([0-9]+(?:\.[0-9]+)?\s*(?:m|km|k)|1\s*mile|2\s*mile)\b/i);
  return distanceLabelAndMeters(match && match[1]);
}

function repDistanceFromVolumeRange(value, reps, source) {
  const range = clean(value).match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*(mi|mile|miles|km|k|meter|meters|m)\b/i);
  if (!range) return null;
  const low = volumeAmountToMeters(Number(range[1]), range[3]);
  const high = volumeAmountToMeters(Number(range[2]), range[3]);
  if (!low || !high) return null;
  const candidates = [100, 150, 200, 300, 400, 500, 600, 800, 1000, 1200, 1600].filter((distance) => (
    Math.abs(low / distance - Math.round(low / distance)) < 0.01 &&
    Math.abs(high / distance - Math.round(high / distance)) < 0.01 &&
    Math.round(high / distance) >= reps
  ));
  if (!candidates.length) return null;
  const meters = /tempo|stride|recovery|walk|jog/i.test(clean(source)) ? candidates[0] : candidates[candidates.length - 1];
  return { label: distanceLabelFromMeters(meters), meters };
}

function distanceLabelAndMeters(value) {
  const text = clean(value).toLowerCase();
  if (!text) return null;
  if (text === "1 mile") return { label: "1 Mile", meters: 1609.344 };
  if (text === "2 mile") return { label: "2 Mile", meters: 3218.688 };
  const match = text.match(/^([0-9]+(?:\.[0-9]+)?)\s*(m|km|k)$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const meters = match[2] === "m" ? amount : amount * 1000;
  return { label: distanceLabelFromMeters(meters), meters };
}

function distanceLabelFromMeters(meters) {
  if (Math.abs(meters - 1609.344) < 1) return "1 Mile";
  if (Math.abs(meters - 3218.688) < 1) return "2 Mile";
  return meters >= 1000 && meters % 1000 === 0 ? `${meters / 1000}K` : `${Math.round(meters)}m`;
}

function volumeAmountToMeters(amount, unit) {
  const normalized = clean(unit).toLowerCase();
  if (normalized === "mi" || normalized === "mile" || normalized === "miles") return amount * 1609.344;
  if (normalized === "km" || normalized === "k") return amount * 1000;
  if (normalized === "m" || normalized === "meter" || normalized === "meters") return amount;
  return 0;
}

function parseSplitLines(text) {
  return clean(text).split(/\r?\n/).map((line, index) => {
    const match = line.match(/^\s*(?:(Lap|Rep|Rest|Recovery)\s*)?(\d+)\s*:\s*(.+?)\s*$/i);
    if (!match) return null;
    const word = match[1] || "Lap";
    const number = Number(match[2]) || index + 1;
    const kind = /^(rest|recovery)$/i.test(word) ? "recovery" : (/rep/i.test(word) ? "work" : "");
    return { lap: number, label: `${word} ${number}`, kind, time: match[3] };
  }).filter(Boolean);
}

function workSplitCount(row, splits) {
  if (!splits.length) return 0;
  const hasRecoverySplit = splits.some((split) => split.kind === "recovery" || split.kind === "rest");
  if (!hasRepRestPattern(row) && !hasRecoverySplit) return splits.length;
  return splits.filter((split, index) => {
    const kind = splitKind(row, index, splits);
    return kind === "work" || kind === "rep";
  }).length;
}

function splitKind(row, index, splits) {
  if (splits[index] && splits[index].kind) return splits[index].kind;
  if (!hasRepRestPattern(row) || splits.length < 2) return "lap";
  return index % 2 === 0 ? "work" : "recovery";
}

function hasRepRestPattern(row) {
  const text = [row && row.workoutPrescription, row && row.coachNote, row && row.plannedVolume, row && row.completedVolume, row && row.plannedEffort, row && row.workoutType].filter(Boolean).join(" ").toLowerCase();
  return /\b\d+(?:\s*[-–]\s*\d+)?\s*(?:x|×)\s*\d/.test(text) && /(recover|recovery|rest|jog|walk)/.test(text);
}

function convertVolumeToMiles(amount, unit) {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const normalized = clean(unit).toLowerCase();
  if (normalized === "mi" || normalized === "mile" || normalized === "miles") return roundVolume(amount);
  if (normalized === "km" || normalized === "k") return roundVolume(amount * 0.621371);
  if (normalized === "m" || normalized === "meter" || normalized === "meters") return roundVolume(amount / 1609.344);
  return 0;
}

function roundVolume(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function startOfCurrentWeek() {
  return startOfWeekForDate(new Date());
}

function startOfBoardWeek(end) {
  return startOfWeekForDate(addDays(end, -1));
}

function startOfWeekForDate(sourceDate) {
  const now = sourceDate instanceof Date ? sourceDate : new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseDate(value) {
  const text = clean(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sortByDateDesc(a, b) {
  const ad = a.meetDate || a.sessionDate || a.lastResultDate || a.seasonBestDate || a.personalBestDate || "";
  const bd = b.meetDate || b.sessionDate || b.lastResultDate || b.seasonBestDate || b.personalBestDate || "";
  return String(bd).localeCompare(String(ad));
}

function sortMeetSyncDesc(a, b) {
  const ad = a.syncedAt || a.meetDate || "";
  const bd = b.syncedAt || b.meetDate || "";
  return String(bd).localeCompare(String(ad));
}

function sortTrainingSyncDesc(a, b) {
  const ad = a.syncedAt || a.sessionDate || "";
  const bd = b.syncedAt || b.sessionDate || "";
  return String(bd).localeCompare(String(ad));
}

function recordTimestamp(record) {
  return clean(record && (record.createdAt || record.dateAdded || record.dateCreated || record.updatedAt || record.dateUpdated));
}

async function ghlFetch({ token, path, method, body, signal }) {
  const response = await fetch(`${GHL_BASE_URL}${path}`, {
    method,
    signal,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: GHL_VERSION,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const data = text ? safeJson(text) : {};
  if (!response.ok) throw httpError(response.status, data.message || data.error || `GHL request failed with ${response.status}.`);
  return data;
}

function recordsFromResult(result) {
  return [
    ...(Array.isArray(result && result.records) ? result.records : []),
    ...(Array.isArray(result && result.items) ? result.items : []),
    ...(Array.isArray(result && result.data && result.data.records) ? result.data.records : []),
    ...(Array.isArray(result && result.data && result.data.items) ? result.data.items : []),
  ];
}

function customFieldsFromResult(result) {
  return [
    ...(Array.isArray(result && result.customFields) ? result.customFields : []),
    ...(Array.isArray(result && result.fields) ? result.fields : []),
    ...(Array.isArray(result && result.data && result.data.customFields) ? result.data.customFields : []),
    ...(Array.isArray(result && result.data && result.data.fields) ? result.data.fields : []),
  ];
}

function uniqueRecords(records) {
  const seen = {};
  return records.filter((record) => {
    const props = recordProperties(record);
    const key = (record && record.id) || prop(props, "source_record_id") || JSON.stringify(props);
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function recordProperties(record) {
  return (record && (record.properties || record.fields || record.customFields)) || {};
}

function prop(props, key) {
  const keys = [
    key,
    `custom_objects.athlete_bests.${key}`,
    `custom_objects.meet_results.${key}`,
    `custom_objects.performance_records.${key}`,
  ].concat(FIELD_IDS[key] || []);
  for (const item of keys) {
    const value = readPropValue(props, item);
    if (value) return value;
  }
  return "";
}

function readPropValue(props, key) {
  if (!props) return "";
  const wanted = propLookupKeys(key);
  if (Array.isArray(props)) {
    const field = props.find((item) => item && fieldLabels(item).some((label) => wanted.includes(normalizeLookupKey(label))));
    return field ? fieldValue(field) : "";
  }
  if (Object.prototype.hasOwnProperty.call(props, key)) return clean(props[key]);
  const match = Object.keys(props).find((item) => wanted.includes(normalizeLookupKey(item)));
  return match ? clean(props[match]) : "";
}

function propLookupKeys(key) {
  const base = [
    key,
    `custom_objects.athlete_bests.${key}`,
    `custom_objects.meet_results.${key}`,
    `custom_objects.performance_records.${key}`,
  ].concat(FIELD_IDS[key] || [], FIELD_LABELS[key] || []);
  return base.map(normalizeLookupKey).filter(Boolean);
}

function fieldLabels(field) {
  return [
    field.id,
    field.fieldId,
    field.field_id,
    field.customFieldId,
    field.key,
    field.fieldKey,
    field.field_key,
    field.name,
    field.fieldName,
    field.field_name,
    field.label,
    field.displayName,
    field.display_name,
  ].map(clean).filter(Boolean);
}

function normalizeLookupKey(value) {
  const text = clean(value).toLowerCase();
  if (!text) return "";
  const suffix = text.split(".").pop();
  return suffix.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function existingCustomFieldValue(contact, fieldId) {
  const field = customFieldList(contact).find((item) => item && (item.id === fieldId || item.fieldId === fieldId || item.field_id === fieldId || item.customFieldId === fieldId));
  if (!field) return "";
  return fieldValue(field);
}

function existingCustomFieldValueByIdsOrNames(contact, fieldIds, names) {
  const byId = (Array.isArray(fieldIds) ? fieldIds : []).map((fieldId) => existingCustomFieldValue(contact, fieldId)).find(Boolean);
  return byId || existingCustomFieldValueByName(contact, names || []);
}

function existingCustomFieldValueByName(contact, names) {
  const wanted = names.map((name) => clean(name).toLowerCase()).filter(Boolean);
  const field = customFieldList(contact).find((item) => {
    if (!item) return false;
    const labels = [
      item.id,
      item.fieldId,
      item.field_id,
      item.customFieldId,
      item.key,
      item.fieldKey,
      item.field_key,
      item.name,
      item.fieldName,
      item.field_name,
      item.label,
    ].map((value) => clean(value).toLowerCase());
    return labels.some((label) => {
      if (wanted.includes(label)) return true;
      const simple = label.split(".").pop().split("_").pop();
      return wanted.includes(simple);
    });
  });
  return field ? fieldValue(field) : "";
}

function customFieldList(contact) {
  if (!contact) return [];
  if (Array.isArray(contact.customFields)) return contact.customFields;
  if (Array.isArray(contact.customField)) return contact.customField;
  if (Array.isArray(contact.customFieldsData)) return contact.customFieldsData;
  if (contact.customFields && typeof contact.customFields === "object") {
    return Object.keys(contact.customFields).map((key) => ({ id: key, value: contact.customFields[key] }));
  }
  return [];
}

function fieldValue(field) {
  const value = firstPresent([field.value, field.fieldValue, field.field_value, field.valueString, field.value_string]);
  if (Array.isArray(value)) return value.map(fieldValuePart).filter(Boolean).join(", ");
  return fieldValuePart(value);
}

function fieldValuePart(value) {
  if (value === null || typeof value === "undefined") return "";
  if (typeof value === "object") return clean(value.value || value.name || value.label || value.key || value.id);
  return clean(value);
}

function firstPresent(values) {
  for (const value of values) {
    if (value !== null && typeof value !== "undefined" && value !== "") return value;
  }
  return "";
}

function contactName(contact) {
  return clean(contact.name) || `${clean(contact.firstName)} ${clean(contact.lastName)}`.trim();
}

function isActiveValue(value) {
  return /^(yes|y|true|active|1|on)$/i.test(clean(value));
}

function isInactiveValue(value) {
  return /^(no|n|false|inactive|0|off)$/i.test(clean(value));
}

function optionValue(value) {
  return clean(value).toLowerCase().replace(/&/g, "and").replace(/\+/g, "plus").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function labelValue(value) {
  const text = clean(value);
  if (!text) return "";
  return text.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function yes(value) {
  return /^(yes|true|1|on)$/i.test(clean(value));
}

function parseTimeToMs(value) {
  const text = clean(value);
  if (!text) return 0;
  const parts = text.split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) return 0;
  let seconds = 0;
  if (parts.length === 1) seconds = parts[0];
  if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
  if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  return Math.round(seconds * 1000);
}

function clean(value) {
  if (value && typeof value === "object") return clean(value.value || value.name || value.label || value.id);
  return String(value || "").trim();
}

function safeJson(text) {
  try { return JSON.parse(text); } catch (error) { return { message: text }; }
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
