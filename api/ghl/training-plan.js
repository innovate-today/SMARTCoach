const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const TRAINING_PLAN_SCHEMA_KEY = "custom_objects.training_plans";
const TRAINING_PLAN_DAY_SCHEMA_KEY = "custom_objects.training_plan_days";
const FIELD_IDS = {
  training_plan: ["TZbFrs7XAmFTbCUR7Bht"],
  athlete_name_snapshot: ["nqVp4dTUMuxj1rhffuPh"],
  plan_scope: ["kAcRWNKWu5ZqVbCqxAfG"],
  plan_date: ["572QXhX7AZQl2Sv1yvxE"],
  season: ["BTJL9ysYRPNal1bHo24b"],
  season_year: ["nDJkgdm2LcgiWEUVN95p"],
  phase: ["YcWgORo7ArBkbQt0Gq5j"],
  workout_title: ["lYFu6UiKLQzPLINzyLky"],
  workout_description: ["g9sEI9j8luk5EosAN56m"],
  anchor_event: ["K8lUUy8QsRzhRnbBgvr0"],
  anchor_performance_display: ["SDMuNahR6frsYwo6NGye"],
  anchor_performance_ms: ["pnqr230BjRDKkOo0Yi6W"],
  ai_rationale: ["LaNI9Ia7SiIspIsx3w1V"],
  approval_status: ["XCJ9MKxQxgruGMab4e8P"],
  source_system: ["R6Gf6mGhsRVlc0YNDdI8"],
  source_record_id: ["XamLCl30IO0beWQ462JU"],
  calendar_name: ["oLgx1BacaZCIi55eKbhO"],
  plan_start_date: ["gTIZmnm82T88MYPx8p1l"],
  plan_end_date: ["rzKp8TBDvZCVSGxG9HdN"],
  peak_date: ["SRII1JNaDZtIWCJVzzO1"],
  season_block: ["ecYV9yKFSdqqIxyOejYV"],
  block_type: ["zQrdfDur9qLX2C9udnMF"],
  priority_meets: ["EhAPkIEtmrDtDdziXYQ0"],
  no_practice_dates: ["plfPz0IR9fZwcpeH8VLW"],
  school_constraints: ["WOHufSoDSSu6JUrwwk7r"],
  assigned_group: ["3PH9C8pu8d9mydxmqKHK"],
};
const DAY_FIELD_IDS = {
  training_plan_days: ["XhD36I8Z805YGdGZpQWy"],
  training_plan_id: ["IBFftNR0WSnH9Jqs1M3A"],
  date: ["6q19e2FwmyEBsnR36FOb"],
  day_type: ["nnU4navT4X42RmarQEMi"],
  group_name: ["52CgNzqxeSkCNB9JapQH"],
  athlete_contact: ["X7OV4qThdvmNTZTukHRj"],
  athlete_name_snapshot: ["dHhOi4g4nyOWTBUK9Huq"],
  workout_title: ["9AUuS96TYVKaZb5CwojP"],
  workout_details: ["HDkxzLyHwS7UYfzWULdX"],
  workout_type: ["JeJSK2v1i6hr5j5JWvnb"],
  energy_system: ["w9CkbegIX3HfeZIkJeKR"],
  target_splits__paces: ["SU6YdLenqSayX2Aa6EsV"],
  planned_volume: ["QuuQJG8PsE3WbeNtgYTf"],
  status: ["AewprcRcLKYVJY54KWPd"],
  linked_meet_id: ["T6HHd6GVO24DY1iOKxln"],
  linked_performance_record_ids: ["CFhffn65Dq4j5PzR6C7G"],
  coach_notes: ["HMK0dChJi5Q0wN1vgm9b"],
  source_system: ["m9uiJIeFwx8yyqZ3pPX5"],
  source_record_id: ["sBcjXM5l5LytSQZWVV13"],
};

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST" && req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const token = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;

  if (!token || !locationId) {
    res.status(500).json({ error: "GHL training plans are not configured on the server." });
    return;
  }

  try {
    if (req.method === "GET") {
      if (req.query && req.query.kind === "questionnaire") {
        res.status(200).json({ success: true, questionnaire: trainingPlanQuestionnaire() });
        return;
      }
      if (req.query && (req.query.kind === "days" || req.query.trainingPlanId || req.query.planId || req.query.date)) {
        const days = await listTrainingPlanDays({
          token,
          locationId,
          trainingPlanId: clean(req.query.trainingPlanId || req.query.planId),
          planSourceId: clean(req.query.planSourceId),
          date: clean(req.query.date),
          groupName: clean(req.query.groupName),
        });
        res.status(200).json({ success: true, days });
        return;
      }
      const plans = await listTrainingPlans({ token, locationId });
      res.status(200).json({ success: true, plans });
      return;
    }

    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const plan = normalizePlan(payload);
    const properties = buildTrainingPlanProperties(plan);

    const record = await createObjectRecordWithOptionFallback({
      token,
      locationId,
      schemaKey: TRAINING_PLAN_SCHEMA_KEY,
      properties,
      optionKeys: ["plan_scope", "season", "phase", "energy_system", "approval_status", "season_block", "block_type"],
    });

    const recordId = record.id || (record.record && record.record.id) || null;
    const days = buildTrainingPlanDays(plan, {
      recordId,
      sourceRecordId: properties.source_record_id,
      title: properties.workout_title,
    });
    const createdDays = [];

    for (const day of days) {
      const dayProperties = buildTrainingPlanDayProperties(plan, day, {
        planRecordId: recordId,
        planSourceRecordId: properties.source_record_id,
      });
      const dayRecord = await createObjectRecordWithOptionFallback({
        token,
        locationId,
        schemaKey: TRAINING_PLAN_DAY_SCHEMA_KEY,
        properties: dayProperties,
        optionKeys: ["day_type", "workout_type", "energy_system", "status"],
      });
      createdDays.push({
        recordId: dayRecord.id || (dayRecord.record && dayRecord.record.id) || null,
        sourceRecordId: dayProperties.source_record_id,
        date: dayProperties.date,
        title: dayProperties.workout_title,
      });
    }

    res.status(200).json({
      success: true,
      plan: {
        recordId,
        sourceRecordId: properties.source_record_id,
        title: properties.workout_title,
        description: properties.workout_description,
      },
      days: createdDays,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Training plan save failed." });
  }
};

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function listTrainingPlans({ token, locationId }) {
  const result = await ghlFetch({
    token,
    path: `/objects/${encodeURIComponent(TRAINING_PLAN_SCHEMA_KEY)}/records/search`,
    method: "POST",
    body: { locationId, page: 1, pageLimit: 100 },
  });

  return recordsFromResult(result).map(normalizeTrainingPlanRecord).filter((plan) => plan.title).sort((a, b) => {
    return String(b.planDate || "").localeCompare(String(a.planDate || "")) || a.title.localeCompare(b.title);
  });
}

function normalizeTrainingPlanRecord(record) {
  const props = recordProperties(record);
  return {
    id: record && record.id ? record.id : prop(props, "source_record_id"),
    sourceRecordId: prop(props, "source_record_id"),
    title: prop(props, "workout_title") || prop(props, "training_plan"),
    scope: labelValue(prop(props, "plan_scope")),
    season: labelValue(prop(props, "season")),
    seasonYear: Number(prop(props, "season_year")) || null,
    phase: labelValue(prop(props, "phase")),
    event: prop(props, "anchor_event"),
    athleteName: prop(props, "athlete_name_snapshot"),
    planDate: prop(props, "plan_date"),
    startDate: prop(props, "plan_start_date"),
    endDate: prop(props, "plan_end_date"),
    peakDate: prop(props, "peak_date"),
    calendarName: prop(props, "calendar_name"),
    seasonBlock: labelValue(prop(props, "season_block")),
    blockType: labelValue(prop(props, "block_type")),
    assignedGroup: prop(props, "assigned_group"),
    priorityMeets: prop(props, "priority_meets"),
    noPracticeDates: prop(props, "no_practice_dates"),
    schoolConstraints: prop(props, "school_constraints"),
    approvalStatus: labelValue(prop(props, "approval_status")),
    description: prop(props, "workout_description"),
  };
}

async function listTrainingPlanDays({ token, locationId, trainingPlanId, planSourceId, date, groupName }) {
  const result = await ghlFetch({
    token,
    path: `/objects/${encodeURIComponent(TRAINING_PLAN_DAY_SCHEMA_KEY)}/records/search`,
    method: "POST",
    body: { locationId, page: 1, pageLimit: 100 },
  });

  const planIds = [trainingPlanId, planSourceId].filter(Boolean).map((value) => value.toLowerCase());
  const wantedDate = dateOnly(date);
  const wantedGroup = clean(groupName).toLowerCase();

  return recordsFromResult(result).map(normalizeTrainingPlanDayRecord).filter((day) => {
    const dayPlanId = clean(day.trainingPlanId).toLowerCase();
    if (planIds.length && planIds.indexOf(dayPlanId) === -1) return false;
    if (wantedDate && dateOnly(day.date) !== wantedDate) return false;
    if (wantedGroup && clean(day.groupName).toLowerCase() !== wantedGroup) return false;
    return true;
  }).sort((a, b) => {
    return String(a.date || "").localeCompare(String(b.date || "")) || a.title.localeCompare(b.title);
  });
}

function normalizeTrainingPlanDayRecord(record) {
  const props = recordProperties(record);
  return {
    id: record && record.id ? record.id : dayProp(props, "source_record_id"),
    sourceRecordId: dayProp(props, "source_record_id"),
    trainingPlanId: dayProp(props, "training_plan_id"),
    date: dayProp(props, "date"),
    dayType: labelValue(dayProp(props, "day_type")),
    groupName: dayProp(props, "group_name"),
    athleteContact: dayProp(props, "athlete_contact"),
    athleteName: dayProp(props, "athlete_name_snapshot"),
    title: dayProp(props, "workout_title") || dayProp(props, "training_plan_days"),
    details: dayProp(props, "workout_details"),
    workoutType: labelValue(dayProp(props, "workout_type")),
    energySystem: labelValue(dayProp(props, "energy_system")),
    targetSplits: dayProp(props, "target_splits__paces"),
    plannedVolume: dayProp(props, "planned_volume"),
    status: labelValue(dayProp(props, "status")),
    linkedMeetId: dayProp(props, "linked_meet_id"),
    linkedPerformanceRecordIds: dayProp(props, "linked_performance_record_ids"),
    coachNotes: dayProp(props, "coach_notes"),
  };
}

function normalizePlan(payload) {
  if (!payload || typeof payload !== "object") throw httpError(400, "Missing training plan payload.");

  const season = clean(payload.season) || currentSeason().season;
  const seasonYear = Number(payload.seasonYear) || currentSeason().year;
  const groupName = clean(payload.groupName) || "Team";
  const athleteName = clean(payload.athleteName);
  const contactId = clean(payload.contactId);
  const planScope = clean(payload.planScope) || (contactId ? "individual" : "group");
  const primaryEvent = clean(payload.primaryEvent) || "400m";
  const phaseFocus = clean(payload.phaseFocus) || "Balanced";
  const planDate = clean(payload.planDate) || new Date().toISOString().slice(0, 10);
  const workoutDescription = clean(payload.workoutDescription);
  const startDate = dateOnly(payload.planStartDate || payload.startDate || payload.planDate) || planDate;
  const peakDate = dateOnly(payload.peakDate);
  const endDate = dateOnly(payload.planEndDate || payload.endDate) || peakDate || addDays(startDate, 27);
  const calendarName = clean(payload.calendarName) || `${season} ${seasonYear}`;
  const seasonBlock = clean(payload.seasonBlock) || season;
  const blockType = clean(payload.blockType) || clean(payload.phaseFocus) || "General Prep";
  const assignedGroup = clean(payload.assignedGroup) || groupName;
  const priorityMeets = cleanLines(payload.priorityMeets);
  const noPracticeDates = cleanLines(payload.noPracticeDates);
  const schoolConstraints = cleanLines(payload.schoolConstraints);
  const weeklyPracticeDays = cleanLines(payload.weeklyPracticeDays);
  const mode = optionValue(payload.mode || payload.creationMode || (Array.isArray(payload.days) ? "manual" : "guided"));
  const currentFitnessSport = clean(payload.currentFitnessSport || payload.fitnessSport || payload.sport);
  const currentFitnessDistance = clean(payload.currentFitnessDistance || payload.recentRaceDistance) || "Latest matching fitness set";
  const currentFitnessTime = clean(payload.currentFitnessTime || payload.recentRaceTime);

  return {
    mode,
    planName: clean(payload.planName),
    contactId,
    planScope,
    athleteName,
    smartcoachAthleteId: clean(payload.smartcoachAthleteId),
    groupName,
    season,
    seasonYear,
    primaryEvent,
    phaseFocus,
    planDate,
    startDate,
    endDate,
    peakDate: peakDate || endDate,
    calendarName,
    seasonBlock,
    blockType,
    priorityMeets,
    noPracticeDates,
    schoolConstraints,
    weeklyPracticeDays,
    assignedGroup,
    currentFitnessSport,
    currentFitnessDistance,
    currentFitnessTime,
    workoutDescription,
    days: normalizePlanDays(payload.days),
    questionnaire: normalizeQuestionnaire(payload.questionnaire || payload.answers || payload),
  };
}

function buildTrainingPlanProperties(plan) {
  const isIndividual = !!plan.contactId;
  const subject = isIndividual ? plan.athleteName : plan.groupName;
  const title = plan.planName || `${plan.season} ${plan.seasonYear} Season Plan - ${subject}`;
  const description = plan.workoutDescription || buildSeasonPlanDescription(plan);
  const sourceRecordId = [
    "tp",
    "season",
    slugValue(plan.season),
    plan.seasonYear,
    isIndividual ? slugValue(plan.contactId || plan.athleteName) : slugValue(plan.groupName),
    slugValue(plan.primaryEvent),
  ].filter(Boolean).join("_");

  return compactProperties({
    training_plan: title,
    athlete_contact: plan.contactId,
    athlete_name_snapshot: plan.athleteName,
    plan_scope: planScopeValue(plan.planScope),
    plan_date: plan.planDate,
    season: optionValue(plan.season),
    season_year: plan.seasonYear,
    phase: phaseValue(plan.phaseFocus),
    energy_system: "mixed",
    workout_title: title,
    workout_description: description,
    anchor_event: plan.currentFitnessDistance || plan.primaryEvent,
    anchor_performance_display: plan.currentFitnessTime,
    anchor_performance_ms: parseTimeToMs(plan.currentFitnessTime),
    ai_rationale: buildPlanRationale(plan),
    approval_status: "draft",
    calendar_name: plan.calendarName,
    plan_start_date: plan.startDate,
    plan_end_date: plan.endDate,
    peak_date: plan.peakDate,
    season_block: optionValue(plan.seasonBlock),
    block_type: blockTypeValue(plan.blockType),
    priority_meets: plan.priorityMeets,
    no_practice_dates: plan.noPracticeDates,
    school_constraints: plan.schoolConstraints,
    assigned_group: plan.assignedGroup,
    source_system: "smartcoach_pro",
    source_record_id: sourceRecordId,
  });
}

function buildSeasonPlanDescription(plan) {
  const intro = `${plan.season} ${plan.seasonYear} plan for ${plan.contactId ? plan.athleteName : plan.groupName}. Primary focus: ${plan.primaryEvent}.`;
  const focus = phaseLabel(plan.phaseFocus);
  return [
    intro,
    "",
    `Phase Focus: ${focus}`,
    "",
    "Season Structure:",
    "1. Foundation: mechanics, rhythm, aerobic support, general strength.",
    "2. Development: event-specific speed, lactate tolerance, technical consistency.",
    "3. Competition: sharpen race modeling, reduce unnecessary volume, protect recovery.",
    "4. Peak: keep intensity high, volume low, and prioritize freshness.",
    "",
    "Weekly Rhythm:",
    "- 2 quality sessions",
    "- 1 technical or speed-support session",
    "- 1-2 recovery / tempo sessions",
    "- Meet-week adjustments based on race schedule",
    "",
    "Coach Review:",
    "Use athlete bests, recent meet results, training response, soreness, and school calendar before finalizing weekly workouts.",
  ].join("\n");
}

function buildPlanRationale(plan) {
  const lines = [
    plan.mode === "manual" ? "Manual training plan created by coach." : "Guided draft created from coach questionnaire. Review and edit before use.",
    `Goal: peak on ${plan.peakDate}.`,
    `Event focus: ${plan.primaryEvent}.`,
    `Assigned group: ${plan.assignedGroup}.`,
  ];
  if (plan.priorityMeets) lines.push(`Priority meets: ${plan.priorityMeets}`);
  if (plan.noPracticeDates) lines.push(`No-practice dates: ${plan.noPracticeDates}`);
  if (plan.schoolConstraints) lines.push(`School constraints: ${plan.schoolConstraints}`);
  if (plan.weeklyPracticeDays) lines.push(`Normal practice days: ${plan.weeklyPracticeDays}`);
  if (plan.currentFitnessDistance || plan.currentFitnessTime) lines.push(`Current fitness set: ${[currentFitnessSportLabel(plan.currentFitnessSport), plan.currentFitnessDistance, plan.currentFitnessTime].filter(Boolean).join(" - ")}`);
  return lines.join("\n");
}

function buildTrainingPlanDays(plan, createdPlan) {
  if (plan.days.length) return plan.days;
  return generateDraftPlanDays(plan, createdPlan);
}

function generateDraftPlanDays(plan) {
  const noPractice = new Set(parseDateList(plan.noPracticeDates));
  const practiceDays = parsePracticeDays(plan.weeklyPracticeDays);
  const start = parseISODate(plan.startDate);
  const end = parseISODate(plan.endDate);
  if (!start || !end || start > end) return [];

  const days = [];
  let cursor = new Date(start);
  let week = 1;
  while (cursor <= end && days.length < 120) {
    const date = dateOnly(cursor);
    const dow = cursor.getUTCDay();
    if (!noPractice.has(date) && (practiceDays.has(dow) || meetForDate(plan.priorityMeets, date))) {
      days.push(draftDayForDate({ plan, date, dow, week }));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (dow === 6) week += 1;
  }
  return days;
}

function draftDayForDate({ plan, date, dow, week }) {
  const meet = meetForDate(plan.priorityMeets, date);
  if (meet) {
    return {
      date,
      groupName: plan.assignedGroup,
      athleteContact: plan.contactId,
      athleteName: plan.athleteName,
      dayType: "Meet",
      workoutTitle: meet.name || `${plan.primaryEvent} meet`,
      workoutDetails: `Meet day. Primary focus: ${plan.primaryEvent}. Use the stopwatch meet flow to time events and save results to SMARTCoach Pro.`,
      workoutType: "Race / Meet",
      energySystem: "Mixed",
      targetSplits: "Race plan should be reviewed by event and athlete before competition.",
      plannedVolume: "Meet schedule",
      status: "draft",
      linkedMeetId: meet.recordId,
      coachNotes: "Priority meet from schedule. Coach should confirm entries, warmup timing, and race plan.",
    };
  }
  const templates = isDistanceEvent(plan.primaryEvent) ? distanceWorkoutTemplates(plan, week) : trackWorkoutTemplates(plan, week);
  const template = templates[dow] || templates[2];
  return {
    date,
    groupName: plan.assignedGroup,
    athleteContact: plan.contactId,
    athleteName: plan.athleteName,
    status: "draft",
    coachNotes: `Draft week ${week}. Coach should review and adjust based on readiness, weather, and available practice time.`,
    ...template,
  };
}

function distanceWorkoutTemplates(plan, week) {
  const fitness = currentFitnessLabel(plan);
  const mileRepTarget = targetFormula({ repDistance: "1 mile", low: 0.92, high: 0.95, plan });
  const tempoTarget = targetFormula({ repDistance: "1 mile", low: 0.84, high: 0.88, plan });
  return {
    1: {
      dayType: "Recovery",
      workoutTitle: "Easy distance + strides",
      workoutDetails: "35-45 min easy distance. Finish with 6 x 100m relaxed strides / walk-back recovery.",
      workoutType: "Easy/Recovery Run",
      energySystem: "Oxidative (Aerobic)",
      targetSplits: `Easy distance at 65-75% of ${fitness}. Strides relaxed, not all-out.`,
      plannedVolume: "35-45 min + 6 strides",
    },
    2: {
      dayType: "Workout",
      workoutTitle: "3 x 1 mile intervals",
      workoutDetails: "3 x 1 mile. Recovery equals the completed rep time. Keep reps even. If the group is flat or weather is poor, reduce to 2 x 1 mile or move to easy distance.",
      workoutType: "Lactate Threshold",
      energySystem: "Mixed",
      targetSplits: `${mileRepTarget}\nRecovery: work rate = recovery, so rest for the completed rep time.`,
      plannedVolume: "3 miles quality",
    },
    3: {
      dayType: "Recovery",
      workoutTitle: "Recovery distance",
      workoutDetails: "25-35 min very easy distance + mobility. Keep effort conversational.",
      workoutType: "Easy/Recovery Run",
      energySystem: "Oxidative (Aerobic)",
      targetSplits: `60-70% of ${fitness}.`,
      plannedVolume: "25-35 min",
    },
    4: {
      dayType: "Workout",
      workoutTitle: "Tempo intervals",
      workoutDetails: "4 x 5 min tempo / 1 min easy jog recovery. Stay controlled and smooth.",
      workoutType: "Intensive Tempo",
      energySystem: "Oxidative (Aerobic)",
      targetSplits: `${tempoTarget}\nUse controlled breathing as the final check.`,
      plannedVolume: "20 min tempo work",
    },
    5: {
      dayType: "Workout",
      workoutTitle: "Pre-meet rhythm or aerobic support",
      workoutDetails: "20-30 min easy + 4 x 200m rhythm / 200m walk-jog recovery. If racing within 24 hours, keep this as easy distance only.",
      workoutType: "Extensive Tempo",
      energySystem: "Oxidative (Aerobic)",
      targetSplits: `200m rhythm at 75-82% of ${fitness}.`,
      plannedVolume: "Low to moderate",
    },
    6: {
      dayType: "Workout",
      workoutTitle: "Long run",
      workoutDetails: "45-70 min long run depending on training age and weekly mileage. Keep effort steady, not forced.",
      workoutType: "Long Run",
      energySystem: "Oxidative (Aerobic)",
      targetSplits: `65-75% of ${fitness}.`,
      plannedVolume: "45-70 min",
    },
  };
}

function trackWorkoutTemplates(plan, week) {
  const fitness = currentFitnessLabel(plan);
  return {
    1: {
      dayType: "Workout",
      workoutTitle: `${plan.primaryEvent} acceleration + mechanics`,
      workoutDetails: "Warmup, sprint drills, 6 x 30m acceleration / full walk-back recovery, 4 x 60m fast relaxed / 4-6 min recovery.",
      workoutType: "Acceleration",
      energySystem: "ATP-PC (Phosphagen)",
      targetSplits: `Fast relaxed. Use ${fitness} only as context; quality matters more than volume.`,
      plannedVolume: "Low volume / high quality",
    },
    2: {
      dayType: "Recovery",
      workoutTitle: "Tempo recovery",
      workoutDetails: "8-10 x 100m relaxed tempo / 100m walk. Add mobility and general strength.",
      workoutType: "Extensive Tempo",
      energySystem: "Oxidative (Aerobic)",
      targetSplits: `65-75% of ${fitness}.`,
      plannedVolume: "800-1000m tempo",
    },
    3: {
      dayType: "Workout",
      workoutTitle: `${plan.primaryEvent} event-specific reps`,
      workoutDetails: week < 3 ? "5 x 200m / 3 min recovery. Smooth, even reps." : "3 x 300m / 8-10 min recovery. Hold form through the last 100m.",
      workoutType: week < 3 ? "Intensive Tempo" : "Special Endurance I",
      energySystem: week < 3 ? "Mixed" : "Glycolytic (Anaerobic)",
      targetSplits: week < 3 ? `75-82% of ${fitness}.` : `85-90% of ${fitness}.`,
      plannedVolume: week < 3 ? "1000m quality" : "900m quality",
    },
    4: {
      dayType: "Recovery",
      workoutTitle: "Recovery + drills",
      workoutDetails: "20 min easy movement, sprint drills, mobility, and light general strength.",
      workoutType: "Easy/Recovery Run",
      energySystem: "Oxidative (Aerobic)",
      targetSplits: "Keep relaxed. No timed pressure.",
      plannedVolume: "Low",
    },
    5: {
      dayType: "Workout",
      workoutTitle: "Race rhythm",
      workoutDetails: "4 x 150m race rhythm / 5-6 min recovery. Stop if mechanics fade.",
      workoutType: "Speed Endurance I",
      energySystem: "Glycolytic (Anaerobic)",
      targetSplits: `88-95% of ${fitness}.`,
      plannedVolume: "600m quality",
    },
    6: {
      dayType: "Recovery",
      workoutTitle: "Easy shakeout",
      workoutDetails: "20-30 min easy or off, based on meet schedule and athlete readiness.",
      workoutType: "Easy/Recovery Run",
      energySystem: "Oxidative (Aerobic)",
      targetSplits: "Easy effort.",
      plannedVolume: "Low",
    },
  };
}

function buildTrainingPlanDayProperties(plan, day, planRecord) {
  const sourceRecordId = clean(day.sourceRecordId) || [
    "tpd",
    slugValue(planRecord.planSourceRecordId || planRecord.planRecordId || plan.groupName),
    dateOnly(day.date).replace(/-/g, ""),
    slugValue(day.workoutTitle || day.dayType || "day"),
  ].filter(Boolean).join("_");
  const title = clean(day.workoutTitle) || clean(day.title) || "Training Plan Day";
  const workoutType = inferWorkoutType(day, title);
  const energySystem = clean(day.energySystem) || energySystemForWorkoutType(workoutType);

  return compactProperties({
    training_plan_days: `${dateOnly(day.date)} - ${title}`,
    training_plan_id: planRecord.planRecordId || planRecord.planSourceRecordId,
    date: dateOnly(day.date),
    day_type: dayTypeValue(day.dayType),
    group_name: clean(day.groupName) || plan.assignedGroup,
    athlete_contact: clean(day.athleteContact) || plan.contactId,
    athlete_name_snapshot: clean(day.athleteName) || plan.athleteName,
    workout_title: title,
    workout_details: clean(day.workoutDetails || day.details),
    workout_type: workoutTypeValue(workoutType),
    energy_system: energySystemValue(energySystem),
    target_splits__paces: clean(day.targetSplits || day.targetSplitsPaces),
    planned_volume: clean(day.plannedVolume),
    status: dayStatusValue(day.status || "draft"),
    linked_meet_id: clean(day.linkedMeetId),
    linked_performance_record_ids: clean(day.linkedPerformanceRecordIds),
    coach_notes: clean(day.coachNotes),
    source_system: "smartcoach_pro",
    source_record_id: sourceRecordId,
  });
}

function inferWorkoutType(day, title) {
  const explicit = clean(day && day.workoutType);
  if (explicit) return explicit;

  const text = `${clean(title)} ${clean(day && day.workoutDetails)} ${clean(day && day.dayType)}`.toLowerCase();
  if (text.indexOf("meet") >= 0 || text.indexOf("race") >= 0) return "Race / Meet";
  if (text.indexOf("long run") >= 0) return "Long Run";
  if (text.indexOf("tempo") >= 0) return "Extensive Tempo";
  if (text.indexOf("threshold") >= 0 || text.indexOf("mile interval") >= 0 || text.indexOf("1 mile") >= 0) return "Lactate Threshold";
  if (text.indexOf("speed endurance") >= 0 || text.indexOf("race rhythm") >= 0) return "Speed Endurance I";
  if (text.indexOf("special endurance") >= 0 || text.indexOf("300m") >= 0) return "Special Endurance I";
  if (text.indexOf("acceleration") >= 0 || text.indexOf("mechanics") >= 0) return "Acceleration";
  if (text.indexOf("recovery") >= 0 || text.indexOf("easy") >= 0 || text.indexOf("shakeout") >= 0) return "Easy/Recovery Run";
  return "Easy/Recovery Run";
}

function energySystemForWorkoutType(workoutType) {
  const normalized = optionValue(workoutType);
  if (normalized.indexOf("acceleration") >= 0 || normalized.indexOf("max_velocity") >= 0) return "ATP-PC (Phosphagen)";
  if (normalized.indexOf("speed_endurance") >= 0 || normalized.indexOf("special_endurance") >= 0 || normalized.indexOf("lactate") >= 0) return "Glycolytic (Anaerobic)";
  if (normalized.indexOf("tempo") >= 0 || normalized.indexOf("recovery") >= 0 || normalized.indexOf("long_run") >= 0 || normalized.indexOf("aerobic") >= 0) return "Oxidative (Aerobic)";
  return "Mixed";
}

function normalizePlanDays(days) {
  if (!Array.isArray(days)) return [];
  return days.map((day, index) => ({
    date: dateOnly(day && day.date),
    dayType: clean(day && (day.dayType || day.type)),
    groupName: clean(day && day.groupName),
    athleteContact: clean(day && day.athleteContact),
    athleteName: clean(day && day.athleteName),
    workoutTitle: clean(day && (day.workoutTitle || day.title)) || `Training Day ${index + 1}`,
    workoutDetails: clean(day && (day.workoutDetails || day.details)),
    workoutType: clean(day && day.workoutType),
    energySystem: clean(day && day.energySystem),
    targetSplits: clean(day && (day.targetSplits || day.targetSplitsPaces)),
    plannedVolume: clean(day && day.plannedVolume),
    status: clean(day && day.status) || "draft",
    linkedMeetId: clean(day && day.linkedMeetId),
    linkedPerformanceRecordIds: clean(day && day.linkedPerformanceRecordIds),
    coachNotes: clean(day && day.coachNotes),
    sourceRecordId: clean(day && day.sourceRecordId),
  })).filter((day) => day.date && day.workoutTitle);
}

function isDistanceEvent(event) {
  const meters = eventDistanceMeters(event);
  return meters >= 1500 || /mile|k|marathon/i.test(clean(event));
}

function eventDistanceMeters(event) {
  const key = clean(event).toLowerCase().replace(/\s+/g, "");
  const map = {
    "400m": 400,
    "600m": 600,
    "800m": 800,
    "1500m": 1500,
    "1600m": 1600,
    "1mile": 1609.34,
    "3k": 3000,
    "3200m": 3200,
    "2mile": 3218.69,
    "4k": 4000,
    "5k": 5000,
    "8k": 8000,
    "10k": 10000,
    "15k": 15000,
    "halfmarathon": 21097.5,
    "marathon": 42195,
  };
  return map[key] || 0;
}

function currentFitnessLabel(plan) {
  const parts = [currentFitnessSportLabel(plan.currentFitnessSport), plan.currentFitnessDistance, plan.currentFitnessTime].filter(Boolean);
  if (parts.length) return parts.join(" ");
  return `each athlete's latest matching fitness set`;
}

function targetFormula({ repDistance, low, high, plan }) {
  const fitness = currentFitnessLabel(plan);
  const lowPct = Math.round(low * 100);
  const highPct = Math.round(high * 100);
  const calculated = calculatedRepRange({ repDistance, low, high, plan });
  const prefix = `${repDistance} target: ${lowPct}-${highPct}% of ${fitness}.`;
  if (calculated) return `${prefix} Estimated split: ${calculated}.`;
  return `${prefix} If the current fitness distance differs, convert to pace first, then calculate the rep split for ${repDistance}.`;
}

function calculatedRepRange({ repDistance, low, high, plan }) {
  const fitnessDistanceMeters = eventDistanceMeters(plan.currentFitnessDistance);
  const repMeters = eventDistanceMeters(repDistance);
  const fitnessMs = parseTimeToMs(plan.currentFitnessTime);
  if (!fitnessDistanceMeters || !repMeters || !fitnessMs) return "";
  const baseRepMs = (fitnessMs / fitnessDistanceMeters) * repMeters;
  const fast = baseRepMs / high;
  const slow = baseRepMs / low;
  return `${formatDuration(fast)}-${formatDuration(slow)}`;
}

function formatDuration(ms) {
  const totalTenths = Math.round(Number(ms || 0) / 100);
  const tenths = totalTenths % 10;
  const totalSeconds = Math.floor(totalTenths / 10);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes) return `${minutes}:${String(seconds).padStart(2, "0")}.${tenths}`;
  return `${seconds}.${tenths}s`;
}

function normalizeQuestionnaire(value) {
  if (!value || typeof value !== "object") return {};
  const fields = [
    "season",
    "seasonYear",
    "groupName",
    "athleteName",
    "primaryEvent",
    "currentFitnessDistance",
    "currentFitnessTime",
    "phaseFocus",
    "planStartDate",
    "planEndDate",
    "peakDate",
    "priorityMeets",
    "noPracticeDates",
    "schoolConstraints",
    "weeklyPracticeDays",
    "assignedGroup",
    "trainingPreferences",
    "injuryLimitations",
  ];
  return fields.reduce((answers, key) => {
    const answer = cleanLines(value[key]);
    if (answer) answers[key] = answer;
    return answers;
  }, {});
}

function trainingPlanQuestionnaire() {
  return {
    title: "Guided Plan Builder",
    description: "Create a coach-reviewed season, mesocycle, week, group, or individual plan.",
    fields: [
      {
        key: "planName",
        label: "Plan Name",
        type: "text",
        required: false,
        placeholder: "Spring 2026 400m Group",
      },
      {
        key: "planScope",
        label: "Plan Scope",
        type: "select",
        required: true,
        options: [
          { label: "Group", value: "group" },
          { label: "Individual", value: "individual" },
          { label: "Week", value: "team" },
          { label: "Season", value: "season" },
          { label: "Mesocycle", value: "mesocycle" },
        ],
      },
      {
        key: "assignedGroup",
        label: "Assigned Group",
        type: "text",
        required: false,
        placeholder: "400m Group",
      },
      {
        key: "athleteName",
        label: "Athlete",
        type: "athlete",
        required: false,
        placeholder: "Select athlete for individual plan",
      },
      {
        key: "seasonBlock",
        label: "Season Block",
        type: "select",
        required: true,
        options: [
          { label: "Summer", value: "summer" },
          { label: "Fall", value: "fall" },
          { label: "Winter", value: "winter" },
          { label: "Spring", value: "spring" },
          { label: "Offseason", value: "offseason" },
        ],
      },
      {
        key: "blockType",
        label: "Block Type",
        type: "select",
        required: true,
        options: [
          { label: "General Prep", value: "cross_country" },
          { label: "Specific Prep", value: "track_prep" },
          { label: "Pre-Competition", value: "track_season" },
          { label: "Recovery", value: "recovery" },
          { label: "Peak", value: "custom" },
        ],
      },
      {
        key: "primaryEvent",
        label: "Primary Event Focus",
        type: "select_or_text",
        required: true,
        options: standardEventOptions(),
      },
      {
        key: "currentFitnessSport",
        label: "Current Fitness Sport",
        type: "select",
        required: false,
        options: [
          { label: "Track", value: "track" },
          { label: "Cross Country", value: "cross_country" },
        ],
      },
      {
        key: "currentFitnessDistance",
        label: "Current Fitness Distance",
        type: "select",
        required: false,
        options: [
          { label: "Use latest available", value: "" },
          { label: "Latest matching fitness set", value: "Latest matching fitness set" },
          { label: "1 Mile", value: "1 Mile" },
          { label: "2 Mile", value: "2 Mile" },
          { label: "5K", value: "5K" },
        ],
      },
      {
        key: "currentFitnessTime",
        label: "Current Fitness Time",
        type: "text",
        required: false,
        placeholder: "Example: 6:12, 12:45, 20:05",
      },
      {
        key: "planStartDate",
        label: "Plan Start Date",
        type: "date",
        required: true,
      },
      {
        key: "peakDate",
        label: "Peak / Championship Date",
        type: "date",
        required: true,
      },
      {
        key: "priorityMeets",
        label: "Meet Schedule",
        type: "textarea",
        required: true,
        placeholder: "District - 2026-04-03\nRegionals - 2026-04-10\nState - 2026-04-25",
      },
      {
        key: "noPracticeDates",
        label: "No-Practice Dates",
        type: "textarea",
        required: false,
        placeholder: "2026-03-09 to 2026-03-13 Spring Break\n2026-04-07 Testing",
      },
      {
        key: "weeklyPracticeDays",
        label: "Normal Practice Days",
        type: "multi_select",
        required: true,
        options: [
          { label: "Monday", value: "monday" },
          { label: "Tuesday", value: "tuesday" },
          { label: "Wednesday", value: "wednesday" },
          { label: "Thursday", value: "thursday" },
          { label: "Friday", value: "friday" },
          { label: "Saturday", value: "saturday" },
          { label: "Sunday", value: "sunday" },
        ],
      },
      {
        key: "trainingLimits",
        label: "Training Limits",
        type: "textarea",
        required: false,
        placeholder: "Injuries, soreness, school schedule, limited facilities",
      },
      {
        key: "coachPreferences",
        label: "Coach Preferences",
        type: "textarea",
        required: false,
        placeholder: "2 hard days per week, no hard workout within 48 hours of meet",
      },
      {
        key: "planStyle",
        label: "Plan Style",
        type: "select",
        required: true,
        options: [
          { label: "Conservative", value: "conservative" },
          { label: "Balanced", value: "balanced" },
          { label: "Aggressive", value: "aggressive" },
        ],
      },
      {
        key: "manualNotes",
        label: "Manual Notes",
        type: "textarea",
        required: false,
        placeholder: "Anything else the plan should account for",
      },
    ],
  };
}

function standardEventOptions() {
  return [
    "400m",
    "600m",
    "800m",
    "1500m",
    "1600m",
    "1 Mile",
    "3K",
    "3200m",
    "2 Mile",
    "4K",
    "5K",
    "8K",
    "10K",
    "15K",
    "Half Marathon",
    "Marathon",
    "Other",
  ].map((event) => ({ label: event, value: event }));
}

async function createObjectRecordWithOptionFallback({ token, locationId, schemaKey, properties, optionKeys }) {
  try {
    return await ghlFetch({
      token,
      path: `/objects/${encodeURIComponent(schemaKey)}/records`,
      method: "POST",
      body: { locationId, properties },
    });
  } catch (error) {
    if (!optionKeys || !optionKeys.length || !/allowed option|isn't an allowed option|not an allowed/i.test(error.message || "")) throw error;
    return createWithBestOptionSubset({ token, locationId, schemaKey, properties, optionKeys });
  }
}

async function createWithBestOptionSubset({ token, locationId, schemaKey, properties, optionKeys }) {
  const keys = optionKeys.filter((key) => Object.prototype.hasOwnProperty.call(properties, key));
  const subsets = optionKeySubsets(keys).sort((a, b) => b.length - a.length);
  let lastError = null;

  for (const keep of subsets) {
    const keepSet = new Set(keep);
    const fallback = { ...properties };
    keys.forEach((key) => {
      if (!keepSet.has(key)) delete fallback[key];
    });
    try {
      return await ghlFetch({
        token,
        path: `/objects/${encodeURIComponent(schemaKey)}/records`,
        method: "POST",
        body: { locationId, properties: fallback },
      });
    } catch (error) {
      lastError = error;
      if (!/allowed option|isn't an allowed option|not an allowed/i.test(error.message || "")) throw error;
    }
  }

  throw lastError || httpError(502, "Could not create object record with available dropdown options.");
}

function optionKeySubsets(keys) {
  const results = [];
  const total = Math.pow(2, keys.length);
  for (let mask = total - 1; mask >= 0; mask -= 1) {
    const subset = [];
    keys.forEach((key, index) => {
      if (mask & (1 << index)) subset.push(key);
    });
    results.push(subset);
  }
  return results;
}

async function ghlFetch({ token, path, method, body }) {
  const response = await fetch(`${GHL_BASE_URL}${path}`, {
    method,
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

function currentSeason() {
  const date = new Date();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  if (month === 12 || month <= 2) return { season: "Winter", year };
  if (month >= 3 && month <= 5) return { season: "Spring", year };
  if (month >= 6 && month <= 8) return { season: "Summer", year };
  return { season: "Fall", year };
}

function phaseValue(value) {
  const normalized = optionValue(value);
  if (normalized.indexOf("general") === 0) return "gpp";
  if (normalized.indexOf("specific") === 0) return "spp";
  if (normalized.indexOf("pre_competition") === 0) return "pre_competition";
  if (normalized.indexOf("competition") === 0) return "competition";
  if (normalized.indexOf("transition") === 0) return "transition";
  return normalized || "gpp";
}

function phaseLabel(value) {
  const normalized = phaseValue(value);
  const labels = {
    gpp: "General Prep",
    spp: "Specific Prep",
    pre_competition: "Pre-Competition",
    competition: "Competition",
    transition: "Transition / Recovery",
  };
  return labels[normalized] || value;
}

function planScopeValue(value) {
  const normalized = optionValue(value);
  const aliases = {
    individual: "individual",
    group: "group",
    week: "team",
    team: "team",
    season: "season",
    mesocycle: "mesocycle",
  };
  return aliases[normalized] || normalized || "season";
}

function dayTypeValue(value) {
  const normalized = optionValue(value);
  const aliases = {
    workout: "workout",
    technical: "workout",
    meet: "meet",
    recovery: "recovery",
    rest: "no_practice",
    no_practice: "no_practice",
    travel: "travel",
  };
  return aliases[normalized] || "workout";
}

function dayStatusValue(value) {
  const normalized = optionValue(value);
  const aliases = {
    draft: "draft",
    approved: "adjusted",
    adjusted: "adjusted",
    scheduled: "scheduled",
    completed: "completed",
    skipped: "skipped",
    canceled: "skipped",
    cancelled: "skipped",
    needs_review: "draft",
  };
  return aliases[normalized] || "draft";
}

function currentFitnessSportLabel(value) {
  const normalized = optionValue(value);
  if (normalized === "cross_country") return "Cross Country";
  if (normalized === "track") return "Track";
  return clean(value);
}

function blockTypeValue(value) {
  const normalized = optionValue(value);
  const aliases = {
    general_prep: "cross_country",
    cross_country: "cross_country",
    specific_prep: "track_prep",
    track_prep: "track_prep",
    pre_competition: "track_season",
    competition: "track_season",
    track_season: "track_season",
    recovery: "recovery",
    transition: "recovery",
    peak: "custom",
    custom: "custom",
  };
  return aliases[normalized] || "custom";
}

function workoutTypeValue(value) {
  const normalized = optionValue(value);
  const aliases = {
    easy_recovery_run: "easy_recovery_run",
    recovery_run: "easy_recovery_run",
    special_endurance_1: "special_endurance_i",
    special_endurance_i: "special_endurance_i",
    special_endurance_2: "special_endurance_ii",
    special_endurance_ii: "special_endurance_ii",
    speed_endurance_1: "speed_endurance_i",
    speed_endurance_i: "speed_endurance_i",
  };
  return aliases[normalized] || normalized;
}

function energySystemValue(value) {
  const normalized = optionValue(value);
  if (normalized.indexOf("atp") >= 0 || normalized.indexOf("phosphagen") >= 0) return "atp_pc_phosphagen";
  if (normalized.indexOf("glycolytic") >= 0 || normalized.indexOf("anaerobic") >= 0) return "glycolytic_anaerobic";
  if (normalized.indexOf("oxidative") >= 0 || normalized.indexOf("aerobic") >= 0) return "oxidative_aerobic";
  return normalized || "mixed";
}

function compactProperties(properties) {
  return Object.keys(properties).reduce((cleaned, key) => {
    const value = properties[key];
    if (value === "" || value === null || typeof value === "undefined") return cleaned;
    cleaned[key] = value;
    return cleaned;
  }, {});
}

function recordsFromResult(result) {
  return [
    ...(Array.isArray(result && result.records) ? result.records : []),
    ...(Array.isArray(result && result.items) ? result.items : []),
    ...(Array.isArray(result && result.data && result.data.records) ? result.data.records : []),
    ...(Array.isArray(result && result.data && result.data.items) ? result.data.items : []),
  ];
}

function recordProperties(record) {
  return (record && (record.properties || record.fields || record.customFields)) || {};
}

function prop(props, key) {
  const keys = [key, `custom_objects.training_plans.${key}`].concat(FIELD_IDS[key] || []);
  return firstPropValue(props, keys);
}

function dayProp(props, key) {
  const keys = [key, `custom_objects.training_plan_days.${key}`].concat(DAY_FIELD_IDS[key] || []);
  return firstPropValue(props, keys);
}

function firstPropValue(props, keys) {
  for (const item of keys) {
    const value = readPropValue(props, item);
    if (value) return value;
  }
  return "";
}

function readPropValue(props, key) {
  if (!props) return "";
  if (Array.isArray(props)) {
    const field = props.find((item) => item && (item.key === key || item.id === key || item.fieldKey === key || item.fieldId === key || item.customFieldId === key));
    return field ? clean(field.value || field.fieldValue || field.field_value) : "";
  }
  return clean(props[key]);
}

function labelValue(value) {
  const text = clean(value);
  if (!text) return "";
  return text.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

function optionValue(value) {
  return clean(value).toLowerCase().replace(/&/g, "and").replace(/\+/g, "plus").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function slugValue(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function dateOnly(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = clean(value);
  if (!text) return "";
  return text.slice(0, 10);
}

function parseISODate(value) {
  const text = dateOnly(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(value, count) {
  const date = parseISODate(value);
  if (!date) return "";
  date.setUTCDate(date.getUTCDate() + Number(count || 0));
  return dateOnly(date);
}

function parseDateList(value) {
  return cleanLines(value).split(/\r?\n|,/).map(dateOnly).filter(Boolean);
}

function meetForDate(value, date) {
  return parseMeetSchedule(value).find((meet) => meet.date === date) || null;
}

function parseMeetSchedule(value) {
  return clean(value).split(/\r?\n/).map((line) => {
    const text = clean(line);
    const match = text.match(/(\d{4}-\d{2}-\d{2})/);
    if (!match) return null;
    const name = clean(text
      .replace(match[1], "")
      .replace(/\bpriority\b/ig, "")
      .replace(/[-–|]+/g, " ")
      .replace(/\s+/g, " "));
    return { date: match[1], name: name || "Meet", recordId: "" };
  }).filter(Boolean);
}

function parsePracticeDays(value) {
  const defaults = new Set([1, 2, 3, 4, 5, 6]);
  const text = cleanLines(value);
  if (!text) return defaults;
  const dayMap = {
    sunday: 0,
    sun: 0,
    monday: 1,
    mon: 1,
    tuesday: 2,
    tue: 2,
    wednesday: 3,
    wed: 3,
    thursday: 4,
    thu: 4,
    friday: 5,
    fri: 5,
    saturday: 6,
    sat: 6,
  };
  const days = text.split(/\r?\n|,/).map((item) => dayMap[optionValue(item)]).filter((day) => typeof day === "number");
  return days.length ? new Set(days) : defaults;
}

function parseTimeToMs(value) {
  const text = clean(value);
  if (!text) return null;
  const parts = text.split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) return null;
  if (parts.length === 1) return Math.round(parts[0] * 1000);
  if (parts.length === 2) return Math.round(((parts[0] * 60) + parts[1]) * 1000);
  if (parts.length === 3) return Math.round(((parts[0] * 3600) + (parts[1] * 60) + parts[2]) * 1000);
  return null;
}

function cleanLines(value) {
  if (Array.isArray(value)) return value.map(clean).filter(Boolean).join("\n");
  return clean(value).split(/\r?\n|,/).map((line) => line.trim()).filter(Boolean).join("\n");
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
