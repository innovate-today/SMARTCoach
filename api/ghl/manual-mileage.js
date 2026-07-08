const syncSession = require("./sync-session");
const { requireProPlan } = require("../../lib/ghl-account");
const { attachRegistryAccount, setSmartTrakSecurityHeaders } = require("../../lib/smart-trak-request");

module.exports = async function handler(req, res) {
  setSmartTrakSecurityHeaders(res);
  if (req.method === "OPTIONS") {
    return syncSession(req, res);
  }

  await attachRegistryAccount(req);

  if (!requireProPlan(req, res)) return;

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    req.body = buildSyncPayload(payload);
    return syncSession(req, res);
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message || "Manual mileage save failed." });
  }
};

function buildSyncPayload(payload) {
  const athletes = Array.isArray(payload.athletes) ? payload.athletes.map(normalizeAthlete).filter((athlete) => athlete.name) : [];
  const qualitySession = normalizeQualitySession(payload.qualitySession);
  const distance = clean(payload.distance || payload.completedVolume || qualitySession.totalLabel);
  const workoutType = manualWorkoutType(clean(payload.workoutType)) || "Easy/Recovery Run";
  const date = clean(payload.date) || new Date().toISOString();
  const timeDisplay = clean(payload.time || payload.totalTime);
  const totalMs = timeDisplay ? parseTimeToMs(timeDisplay) : null;
  const qualityNote = qualitySession.summary;
  const qualityLaps = qualitySession.laps;

  if (!athletes.length) throw httpError(400, "Select at least one athlete.");
  if (!distance) throw httpError(400, "Distance is required.");
  if (clean(payload.logType) === "quality" && !qualitySession.sets.length) throw httpError(400, "Add at least one quality set.");
  if (timeDisplay && !totalMs) throw httpError(400, "Enter time like 36:20, 1:02:15, or 18:04.5.");

  return {
    groupName: clean(payload.groupName) || "Manual Mileage",
    season: clean(payload.season) || seasonForSport(payload.sport) || seasonForDate(date),
    seasonYear: Number(payload.seasonYear) || new Date(date).getFullYear(),
    sport: clean(payload.sport) || "Cross Country",
    phase: clean(payload.phase) || "GPP",
    workoutType,
    surface: clean(payload.surface) || "Road",
    weather: clean(payload.weather),
    completedVolume: distance,
    sessionDate: date,
    forceDuplicateSync: payload.forceDuplicateSync === true,
    athletes: athletes.map((athlete) => ({
      ...athlete,
      runs: [
        {
          runNumber: 1,
          total: timeDisplay || "Untimed",
          totalMs,
          laps: qualityLaps,
          note: [
            clean(payload.logType) === "quality" ? "Manual quality session entry" : "Manual mileage entry",
            timeDisplay ? `Manual time: ${timeDisplay}` : "",
            qualityNote,
            clean(payload.source) ? `Source: ${clean(payload.source)}` : "",
            clean(payload.notes),
          ].filter(Boolean).join("\n"),
          timestamp: date,
        },
      ],
    })),
  };
}

function normalizeQualitySession(raw) {
  const sets = Array.isArray(raw && raw.sets)
    ? raw.sets.map((set) => ({
        reps: Math.max(1, Math.round(Number(set && set.reps) || 1)),
        distance: clean(set && set.distance),
        splits: Array.isArray(set && set.splits) ? set.splits.map(clean).filter(Boolean) : [],
        rest: clean(set && set.rest),
        effort: clean(set && set.effort),
        note: clean(set && set.note),
      })).filter((set) => set.distance || set.splits.length || set.rest || set.note)
    : [];
  const warmup = clean(raw && raw.warmup);
  const cooldown = clean(raw && raw.cooldown);
  const totalLabel = clean(raw && raw.totalLabel);
  const lines = [];
  const laps = [];
  if (warmup) lines.push(`Warmup: ${warmup}`);
  sets.forEach((set, setIndex) => {
    const base = `${set.reps} x ${set.distance || "distance"}${set.effort ? ` @ ${set.effort}` : ""}`;
    const extras = [];
    if (set.splits.length) extras.push(`splits ${set.splits.join(" / ")}`);
    if (set.rest) extras.push(`rest ${set.rest}`);
    if (set.note) extras.push(set.note);
    lines.push(`Set ${setIndex + 1}: ${base}${extras.length ? ` - ${extras.join(" - ")}` : ""}`);
    set.splits.forEach((split, splitIndex) => {
      laps.push({
        time: split,
        ms: parseTimeToMs(split),
        kind: "rep",
        label: `Set ${setIndex + 1} Rep ${splitIndex + 1}`,
      });
    });
  });
  if (cooldown) lines.push(`Cooldown: ${cooldown}`);
  if (totalLabel) lines.push(`Total: ${totalLabel}`);
  return { warmup, cooldown, sets, totalLabel, summary: lines.join("\n"), laps };
}

function normalizeAthlete(raw) {
  return {
    name: clean(raw && raw.name),
    contactId: clean(raw && raw.contactId),
    smartcoachAthleteId: clean(raw && raw.smartcoachAthleteId),
  };
}

function seasonForDate(value) {
  const date = new Date(value);
  const month = Number.isNaN(date.getTime()) ? new Date().getMonth() + 1 : date.getMonth() + 1;
  if (month === 12 || month === 1) return "Winter";
  if (month >= 2 && month <= 5) return "Spring";
  if (month >= 6 && month <= 7) return "Summer";
  return "Fall";
}

function seasonForSport(value) {
  const sport = clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (sport === "cross_country" || sport === "xc" || sport === "cc") return "Cross Country";
  if (sport === "track" || sport === "track_and_field" || sport === "track_field") return "Track";
  return "";
}

function clean(value) {
  return String(value || "").trim();
}

function manualWorkoutType(value) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const aliases = {
    easy: "Easy/Recovery Run",
    easy_run: "Easy/Recovery Run",
    recovery_run: "Easy/Recovery Run",
    easy_recovery_run: "Easy/Recovery Run",
    threshold: "Lactate Threshold",
    interval: "Aerobic Power",
    repetition: "Acceleration",
    fast_reps: "Acceleration",
    hills: "Hill Sprints",
    hill: "Hill Sprints",
    hill_sprints: "Hill Sprints",
    speed_endurance_i: "Speed Endurance I",
    speed_endurance_ii: "Speed Endurance II",
    special_endurance_i: "Special Endurance I",
    special_endurance_ii: "Special Endurance II",
    intensive_tempo: "Intensive Tempo",
    extensive_tempo: "Extensive Tempo",
    tempo_run: "Extensive Tempo",
    warmup_cooldown: "Easy/Recovery Run",
    warm_up_cool_down: "Easy/Recovery Run",
    other: "Easy/Recovery Run",
  };
  return aliases[normalized] || value;
}

function parseTimeToMs(value) {
  const text = clean(value).toLowerCase().replace(/s$/, "");
  const wordMatch = text.match(/(?:(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|hr|h))?\s*(?:(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|min|m))?\s*(?:(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|sec|s))?/);
  if (wordMatch && (wordMatch[1] || wordMatch[2] || wordMatch[3])) {
    const seconds = (Number(wordMatch[1]) || 0) * 3600 + (Number(wordMatch[2]) || 0) * 60 + (Number(wordMatch[3]) || 0);
    return seconds > 0 ? Math.round(seconds * 1000) : null;
  }
  const parts = text.split(":").map((part) => part.trim());
  if (!parts.length || parts.length > 3) return null;
  if (parts.some((part) => part === "" || Number.isNaN(Number(part)))) return null;
  let seconds = 0;
  if (parts.length === 1) seconds = Number(parts[0]);
  if (parts.length === 2) seconds = Number(parts[0]) * 60 + Number(parts[1]);
  if (parts.length === 3) seconds = Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2]);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.round(seconds * 1000);
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
