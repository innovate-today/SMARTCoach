const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

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
    res.status(500).json({ error: "GHL sync is not configured on the server." });
    return;
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const session = normalizeSession(payload);
    const synced = [];

    for (const athlete of session.athletes) {
      const contact = await findOrCreateContact({ token, locationId, athlete, session });
      await addSessionNote({ token, contactId: contact.id, body: buildNoteBody(session, athlete) });
      synced.push({ athlete: athlete.name, contactId: contact.id });
    }

    res.status(200).json({ success: true, synced });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "GHL sync failed." });
  }
};

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function normalizeSession(payload) {
  if (!payload || typeof payload !== "object") {
    throw httpError(400, "Missing sync payload.");
  }

  const athletes = Array.isArray(payload.athletes)
    ? payload.athletes
        .map(normalizeAthlete)
        .filter((athlete) => athlete.name && athlete.runs.length)
    : [];

  if (!athletes.length) {
    throw httpError(400, "No athletes with saved runs were provided.");
  }

  return {
    groupName: clean(payload.groupName) || "SMARTCoach Workout",
    season: clean(payload.season) || "Unspecified",
    phase: clean(payload.phase) || "Unspecified",
    workoutType: clean(payload.workoutType) || "Unspecified",
    energySystem: clean(payload.energySystem) || "Unspecified",
    surface: clean(payload.surface) || "Unspecified",
    sessionDate: payload.sessionDate ? new Date(payload.sessionDate) : new Date(),
    athletes,
  };
}

function normalizeAthlete(raw) {
  return {
    name: clean(raw && raw.name),
    runs: Array.isArray(raw && raw.runs)
      ? raw.runs.map(normalizeRun).filter((run) => run.total)
      : [],
  };
}

function normalizeRun(raw, index) {
  return {
    runNumber: Number(raw && raw.runNumber) || index + 1,
    total: clean(raw && raw.total),
    totalMs: Number(raw && raw.totalMs) || null,
    laps: Array.isArray(raw && raw.laps)
      ? raw.laps.map((lap) => ({
          time: clean(lap && lap.time),
          ms: Number(lap && lap.ms) || null,
        })).filter((lap) => lap.time)
      : [],
    note: clean(raw && raw.note),
  };
}

async function findOrCreateContact({ token, locationId, athlete, session }) {
  const existing = await findExistingContact({ token, locationId, athleteName: athlete.name });
  if (existing) {
    await addTags({ token, contactId: existing.id, tags: buildTags(session) });
    return existing;
  }

  const nameParts = athlete.name.split(/\s+/);
  const firstName = nameParts.shift() || athlete.name;
  const lastName = nameParts.join(" ");

  const created = await ghlFetch({
    token,
    path: "/contacts/",
    method: "POST",
    body: {
      firstName,
      lastName,
      locationId,
      source: "SMARTCoach",
      tags: buildTags(session),
    },
  });

  const contact = created.contact || created;
  if (!contact || !contact.id) {
    throw httpError(502, `GHL did not return a contact for ${athlete.name}.`);
  }
  return contact;
}

async function findExistingContact({ token, locationId, athleteName }) {
  const result = await ghlFetch({
    token,
    path: `/contacts/?locationId=${encodeURIComponent(locationId)}&query=${encodeURIComponent(athleteName)}&limit=10`,
    method: "GET",
  });

  const normalizedName = athleteName.toLowerCase();
  return (result.contacts || []).find((contact) => {
    const contactName = `${contact.firstName || ""} ${contact.lastName || ""}`.trim().toLowerCase();
    return contactName === normalizedName;
  }) || null;
}

async function addTags({ token, contactId, tags }) {
  try {
    await ghlFetch({
      token,
      path: `/contacts/${encodeURIComponent(contactId)}/tags`,
      method: "POST",
      body: { tags },
    });
  } catch (error) {
    if (error.statusCode !== 404) throw error;
  }
}

async function addSessionNote({ token, contactId, body }) {
  await ghlFetch({
    token,
    path: `/contacts/${encodeURIComponent(contactId)}/notes`,
    method: "POST",
    body: { body },
  });
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

  if (!response.ok) {
    throw httpError(response.status, data.message || data.error || `GHL request failed with ${response.status}.`);
  }

  return data;
}

function buildTags(session) {
  return [
    "smartcoach-athlete",
    slugTag(session.season, "season"),
    slugTag(session.workoutType, "workout"),
    slugTag(session.phase, "phase"),
  ].filter(Boolean);
}

function buildNoteBody(session, athlete) {
  const dateLabel = Number.isNaN(session.sessionDate.getTime())
    ? new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : session.sessionDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  const lines = [
    `SMARTCoach Session - ${dateLabel}`,
    `Group: ${session.groupName} | Season: ${session.season}`,
    `Phase: ${session.phase} | Type: ${session.workoutType}`,
    `Energy System: ${session.energySystem} | Surface: ${session.surface}`,
    "",
    `Athlete: ${athlete.name}`,
  ];

  athlete.runs.forEach((run) => {
    const lapText = run.laps.length
      ? ` | Laps: ${run.laps.map((lap) => lap.time).join(" / ")}`
      : "";
    const noteText = run.note ? ` | ${run.note}` : "";
    lines.push(`  Run ${run.runNumber}: ${run.total}${lapText}${noteText}`);
  });

  return lines.join("\n");
}

function slugTag(value, suffix) {
  const slug = clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug ? `smartcoach-${slug}-${suffix}` : "";
}

function clean(value) {
  return String(value || "").trim();
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return { message: text };
  }
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
