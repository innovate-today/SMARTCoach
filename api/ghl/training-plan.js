const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const TRAINING_PLAN_SCHEMA_KEY = "custom_objects.training_plans";

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
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
    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const plan = normalizePlan(payload);
    const properties = buildTrainingPlanProperties(plan);

    const record = await ghlFetch({
      token,
      path: `/objects/${encodeURIComponent(TRAINING_PLAN_SCHEMA_KEY)}/records`,
      method: "POST",
      body: { locationId, properties },
    });

    res.status(200).json({
      success: true,
      plan: {
        recordId: record.id || (record.record && record.record.id) || null,
        sourceRecordId: properties.source_record_id,
        title: properties.workout_title,
        description: properties.workout_description,
      },
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Training plan save failed." });
  }
};

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
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

  return {
    contactId: clean(payload.contactId),
    athleteName,
    smartcoachAthleteId: clean(payload.smartcoachAthleteId),
    groupName,
    season,
    seasonYear,
    primaryEvent,
    phaseFocus,
    planDate,
  };
}

function buildTrainingPlanProperties(plan) {
  const isIndividual = !!plan.contactId;
  const subject = isIndividual ? plan.athleteName : plan.groupName;
  const title = `${plan.season} ${plan.seasonYear} Season Plan - ${subject}`;
  const description = buildSeasonPlanDescription(plan);
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
    plan_scope: "season",
    plan_date: plan.planDate,
    season: optionValue(plan.season),
    season_year: plan.seasonYear,
    phase: phaseValue(plan.phaseFocus),
    workout_type: "season_plan",
    energy_system: "mixed",
    workout_title: title,
    workout_description: description,
    anchor_event: plan.primaryEvent,
    ai_rationale: "Baseline season plan draft generated from selected season, event focus, and training phase. Review and edit before assigning workouts.",
    approval_status: "draft",
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

function compactProperties(properties) {
  return Object.keys(properties).reduce((cleaned, key) => {
    const value = properties[key];
    if (value === "" || value === null || typeof value === "undefined") return cleaned;
    cleaned[key] = value;
    return cleaned;
  }, {});
}

function optionValue(value) {
  return clean(value).toLowerCase().replace(/&/g, "and").replace(/\+/g, "plus").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function slugValue(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function clean(value) {
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
