const syncSession = require("./sync-session");

module.exports = async function handler(req, res) {
  if (req.method === "OPTIONS") {
    return syncSession(req, res);
  }

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
  const distance = clean(payload.distance || payload.completedVolume);
  const workoutType = manualWorkoutType(clean(payload.workoutType)) || "Easy/Recovery Run";
  const date = clean(payload.date) || new Date().toISOString();

  if (!athletes.length) throw httpError(400, "Select at least one athlete.");
  if (!distance) throw httpError(400, "Distance is required.");

  return {
    groupName: clean(payload.groupName) || "Manual Mileage",
    season: clean(payload.season) || seasonForDate(date),
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
          total: "Untimed",
          totalMs: null,
          laps: [],
          note: [
            "Manual mileage entry",
            clean(payload.source) ? `Source: ${clean(payload.source)}` : "",
            clean(payload.notes),
          ].filter(Boolean).join("\n"),
          timestamp: date,
        },
      ],
    })),
  };
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
  if (month === 12 || month <= 2) return "Winter";
  if (month >= 3 && month <= 5) return "Spring";
  if (month >= 6 && month <= 8) return "Summer";
  return "Fall";
}

function clean(value) {
  return String(value || "").trim();
}

function manualWorkoutType(value) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const aliases = {
    easy_run: "Easy/Recovery Run",
    recovery_run: "Easy/Recovery Run",
    easy_recovery_run: "Easy/Recovery Run",
    tempo_run: "Extensive Tempo",
    warmup_cooldown: "Easy/Recovery Run",
    warm_up_cool_down: "Easy/Recovery Run",
    other: "Easy/Recovery Run",
  };
  return aliases[normalized] || value;
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
