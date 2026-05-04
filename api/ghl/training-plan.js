const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const TRAINING_PLAN_SCHEMA_KEY = "custom_objects.training_plans";
const TRAINING_PLAN_DAY_SCHEMA_KEY = "custom_objects.training_plan_days";
const FIELD_IDS = {
  training_plan: ["TZbFrs7XAmFTbCUR7Bht"],
  record_name: ["OvqHfsUnX102D7iK41rN"],
  athlete_name_snapshot: ["nqVp4dTUMuxj1rhffuPh"],
  plan_scope: ["kAcRWNKWu5ZqVbCqxAfG"],
  plan_date: ["572QXhX7AZQl2Sv1yvxE"],
  season: ["BTJL9ysYRPNal1bHo24b"],
  season_year: ["nDJkgdm2LcgiWEUVN95p"],
  phase: ["YcWgORo7ArBkbQt0Gq5j"],
  workout_title: ["lYFu6UiKLQzPLINzyLky"],
  workout_description: ["g9sEI9j8luk5EosAN56m"],
  anchor_event: ["K8lUUy8QsRzhRnbBgvr0"],
  approval_status: ["XCJ9MKxQxgruGMab4e8P"],
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
    title: prop(props, "workout_title") || prop(props, "record_name") || prop(props, "training_plan"),
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
  const primaryEvent = clean(payload.primaryEvent) || "400m";
  const phaseFocus = clean(payload.phaseFocus) || "Balanced";
  const planDate = clean(payload.planDate) || new Date().toISOString().slice(0, 10);
  const workoutDescription = clean(payload.workoutDescription);
  const startDate = dateOnly(payload.planStartDate || payload.startDate || payload.planDate) || planDate;
  const endDate = dateOnly(payload.planEndDate || payload.endDate) || addDays(startDate, 27);
  const peakDate = dateOnly(payload.peakDate) || endDate;
  const calendarName = clean(payload.calendarName) || `${season} ${seasonYear}`;
  const seasonBlock = clean(payload.seasonBlock) || season;
  const blockType = clean(payload.blockType) || clean(payload.phaseFocus) || "General Prep";
  const assignedGroup = clean(payload.assignedGroup) || groupName;
  const priorityMeets = cleanLines(payload.priorityMeets);
  const noPracticeDates = cleanLines(payload.noPracticeDates);
  const schoolConstraints = cleanLines(payload.schoolConstraints);
  const mode = optionValue(payload.mode || payload.creationMode || (Array.isArray(payload.days) ? "manual" : "guided"));

  return {
    mode,
    contactId: clean(payload.contactId),
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
    peakDate,
    calendarName,
    seasonBlock,
    blockType,
    priorityMeets,
    noPracticeDates,
    schoolConstraints,
    assignedGroup,
    workoutDescription,
    days: normalizePlanDays(payload.days),
    questionnaire: normalizeQuestionnaire(payload.questionnaire || payload.answers || payload),
  };
}

function buildTrainingPlanProperties(plan) {
  const isIndividual = !!plan.contactId;
  const subject = isIndividual ? plan.athleteName : plan.groupName;
  const title = `${plan.season} ${plan.seasonYear} Season Plan - ${subject}`;
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
    record_name: title,
    athlete_contact: plan.contactId,
    athlete_name_snapshot: plan.athleteName,
    plan_scope: planScopeValue("Season"),
    plan_date: plan.planDate,
    season: optionValue(plan.season),
    season_year: plan.seasonYear,
    phase: phaseValue(plan.phaseFocus),
    energy_system: "mixed",
    workout_title: title,
    workout_description: description,
    anchor_event: plan.primaryEvent,
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
  return lines.join("\n");
}

function buildTrainingPlanDays(plan, createdPlan) {
  if (plan.days.length) return plan.days;
  return generateDraftPlanDays(plan, createdPlan);
}

function generateDraftPlanDays(plan) {
  const noPractice = new Set(parseDateList(plan.noPracticeDates));
  const start = parseISODate(plan.startDate);
  const end = parseISODate(plan.endDate);
  if (!start || !end || start > end) return [];

  const days = [];
  let cursor = new Date(start);
  let week = 1;
  while (cursor <= end && days.length < 120) {
    const date = dateOnly(cursor);
    const dow = cursor.getUTCDay();
    if (!noPractice.has(date) && dow !== 0) {
      days.push(draftDayForDate({ plan, date, dow, week }));
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (dow === 6) week += 1;
  }
  return days;
}

function draftDayForDate({ plan, date, dow, week }) {
  const templates = {
    1: {
      dayType: "Workout",
      workoutTitle: `${plan.primaryEvent} speed development`,
      workoutDetails: "Acceleration mechanics, short fast reps, full recovery. Coach should edit reps, distances, and recoveries before use.",
      workoutType: "Acceleration",
      energySystem: "ATP-PC (Phosphagen)",
      plannedVolume: "Low volume / high quality",
    },
    2: {
      dayType: "Recovery",
      workoutTitle: "Recovery / aerobic support",
      workoutDetails: "Easy aerobic work, mobility, drills, and general strength. Keep effort controlled.",
      workoutType: "Easy/Recovery Run",
      energySystem: "Oxidative (Aerobic)",
      plannedVolume: "Low to moderate",
    },
    3: {
      dayType: "Workout",
      workoutTitle: `${plan.primaryEvent} event-specific session`,
      workoutDetails: "Primary quality day. Build race rhythm, target pace awareness, and technical consistency.",
      workoutType: week < 3 ? "Intensive Tempo" : "Special Endurance I",
      energySystem: week < 3 ? "Mixed" : "Glycolytic (Anaerobic)",
      plannedVolume: "Moderate",
    },
    4: {
      dayType: "Technical",
      workoutTitle: "Technical / rhythm day",
      workoutDetails: "Drills, wickets/strides, relay exchange or event-specific skill work. Keep nervous system fresh.",
      workoutType: "Max Velocity",
      energySystem: "ATP-PC (Phosphagen)",
      plannedVolume: "Low",
    },
    5: {
      dayType: "Workout",
      workoutTitle: "Competition rhythm / tempo",
      workoutDetails: "Meet-week adjustment point. If racing within 48 hours, reduce volume and sharpen only.",
      workoutType: week % 2 ? "Speed Endurance I" : "Extensive Tempo",
      energySystem: week % 2 ? "Glycolytic (Anaerobic)" : "Oxidative (Aerobic)",
      plannedVolume: "Moderate",
    },
    6: {
      dayType: "Meet",
      workoutTitle: "Meet / controlled effort",
      workoutDetails: "Use for scheduled meet, time trial, or controlled aerobic work. Edit based on actual calendar.",
      workoutType: "Long Run",
      energySystem: "Mixed",
      plannedVolume: "Coach choice",
    },
  };
  const template = templates[dow] || templates[2];
  return {
    date,
    groupName: plan.assignedGroup,
    athleteContact: plan.contactId,
    athleteName: plan.athleteName,
    targetSplits: "",
    status: "draft",
    coachNotes: `Draft week ${week}. Coach should review and adjust.`,
    ...template,
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
    workout_type: workoutTypeValue(day.workoutType),
    energy_system: energySystemValue(day.energySystem),
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

function normalizeQuestionnaire(value) {
  if (!value || typeof value !== "object") return {};
  const fields = [
    "season",
    "seasonYear",
    "groupName",
    "athleteName",
    "primaryEvent",
    "phaseFocus",
    "planStartDate",
    "planEndDate",
    "peakDate",
    "priorityMeets",
    "noPracticeDates",
    "schoolConstraints",
    "assignedGroup",
    "recentResults",
    "weeklyPracticeDays",
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
        label: "Priority Meets",
        type: "textarea",
        required: false,
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
        key: "recentResults",
        label: "Current Fitness / Recent Results",
        type: "textarea",
        required: false,
        placeholder: "400m PR 54.8, recent 300m time trial 41.2",
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
    const fallback = { ...properties };
    optionKeys.forEach((key) => delete fallback[key]);
    return ghlFetch({
      token,
      path: `/objects/${encodeURIComponent(schemaKey)}/records`,
      method: "POST",
      body: { locationId, properties: fallback },
    });
  }
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
