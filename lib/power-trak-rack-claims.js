function rackAthleteId(value) {
  return String(value == null ? "" : value).trim().toLowerCase();
}

function rackClaimError(message, code) {
  const error = new Error(message);
  error.statusCode = 409;
  if (code) error.code = code;
  return error;
}

function normalizeRackReservations(items, options = {}) {
  const now = options.now instanceof Date ? options.now.getTime() : Number.isFinite(options.now) ? options.now : Date.now();
  const cleanText = typeof options.cleanText === "function" ? options.cleanText : (value) => String(value == null ? "" : value).trim();
  const formatName = typeof options.formatName === "function" ? options.formatName : cleanText;
  return (Array.isArray(items) ? items : []).map((item) => {
    const source = item && typeof item === "object" ? item : {};
    const athleteId = cleanText(source.athleteId).slice(0, 120);
    const deviceId = cleanText(source.deviceId).slice(0, 160);
    const expiresAt = cleanText(source.expiresAt);
    if (!athleteId || !deviceId || !expiresAt || new Date(expiresAt).getTime() <= now) return null;
    return {
      athleteId,
      athleteName: formatName(source.athleteName).slice(0, 120),
      deviceId,
      deviceLabel: cleanText(source.deviceLabel || "Rack iPad").slice(0, 120),
      claimedAt: cleanText(source.claimedAt),
      expiresAt,
    };
  }).filter(Boolean).slice(-250);
}

function normalizeRackTombstones(items, options = {}) {
  const cleanText = typeof options.cleanText === "function" ? options.cleanText : (value) => String(value == null ? "" : value).trim();
  const byId = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const source = item && typeof item === "object" ? item : { id: item };
    const id = cleanText(source.id).slice(0, 160);
    if (id) byId.set(id, { id, deletedAt: cleanText(source.deletedAt) });
  });
  return Array.from(byId.values()).slice(-500);
}

function activeRackForAthlete(rackSessions, athleteId) {
  const target = rackAthleteId(athleteId);
  return (rackSessions || []).find((rack) => rack && rack.status === "active" && (rack.athletes || []).some((athlete) => {
    if (!athlete || athlete.rackStatus !== "active") return false;
    return rackAthleteId(athlete.smartcoachAthleteId || athlete.contactId || athlete.id) === target;
  }));
}

function updateRackAthleteReservation(options = {}) {
  const action = String(options.action || "").trim().toLowerCase();
  const athleteId = String(options.athleteId || "").trim();
  const athleteName = String(options.athleteName || "").trim();
  const deviceId = String(options.deviceId || "").trim();
  const deviceLabel = String(options.deviceLabel || "Rack iPad").trim() || "Rack iPad";
  if (!athleteId || !deviceId) throw new Error("Athlete and rack device are required.");

  const activeRack = activeRackForAthlete(options.rackSessions, athleteId);
  if (action === "claim-rack-athlete" && activeRack) {
    throw rackClaimError(`${athleteName || "This athlete"} is already active on ${activeRack.rackName || "another rack"}.`);
  }

  let reservations = (options.reservations || []).map((item) => ({ ...item }));
  const target = rackAthleteId(athleteId);
  const existing = reservations.find((item) => rackAthleteId(item.athleteId) === target);
  if (action === "claim-rack-athlete" && existing && existing.deviceId !== deviceId) {
    throw rackClaimError(`${athleteName || existing.athleteName || "This athlete"} is reserved on ${existing.deviceLabel || "another rack iPad"}.`);
  }

  reservations = reservations.filter((item) => rackAthleteId(item.athleteId) !== target || item.deviceId !== deviceId);
  if (action === "claim-rack-athlete") {
    const now = options.now instanceof Date ? options.now : new Date();
    reservations.push({
      athleteId,
      athleteName,
      deviceId,
      deviceLabel,
      claimedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 5 * 60 * 1000).toISOString(),
    });
  }
  return reservations;
}

function validateRackSessionClaims(options = {}) {
  const existingRackSessions = options.existingRackSessions || [];
  const incomingRackSessions = options.incomingRackSessions || [];
  const deletedIds = new Set(options.deleteRackSessionIds || []);
  const incomingIds = new Set(incomingRackSessions.map((rack) => rack.id));
  const athleteClaims = new Map();
  const reservationClaims = new Map((options.reservations || []).map((item) => [rackAthleteId(item.athleteId), item]));

  existingRackSessions.forEach((rack) => {
    if (!rack || rack.status !== "active" || deletedIds.has(rack.id) || incomingIds.has(rack.id)) return;
    (rack.athletes || []).filter((athlete) => athlete.rackStatus === "active").forEach((athlete) => {
      const key = rackAthleteId(athlete.smartcoachAthleteId || athlete.contactId || athlete.id);
      if (key) athleteClaims.set(key, rack);
    });
  });

  const startedAthleteIds = new Set();
  incomingRackSessions.forEach((rack) => {
    if (!rack || rack.status !== "active") return;
    (rack.athletes || []).filter((athlete) => athlete.rackStatus === "active").forEach((athlete) => {
      const key = rackAthleteId(athlete.smartcoachAthleteId || athlete.contactId || athlete.id);
      const claimed = key && athleteClaims.get(key);
      if (claimed && claimed.id !== rack.id) {
        throw rackClaimError(`${athlete.name || "This athlete"} is already active on ${claimed.rackName || "another rack"}.`);
      }
      const reserved = key && reservationClaims.get(key);
      if (reserved && reserved.deviceId !== rack.deviceId) {
        throw rackClaimError(`${athlete.name || reserved.athleteName || "This athlete"} is reserved on ${reserved.deviceLabel || "another rack iPad"}.`);
      }
      if (key) {
        athleteClaims.set(key, rack);
        startedAthleteIds.add(key);
      }
    });
  });
  return startedAthleteIds;
}

function validateRackSessionTransitions(options = {}) {
  const existingById = new Map((options.existingRackSessions || []).filter(Boolean).map((rack) => [rack.id, rack]));
  const deletedIds = new Set((options.tombstones || []).map((item) => item && item.id).filter(Boolean));
  (options.incomingRackSessions || []).forEach((incoming) => {
    if (!incoming || !incoming.id) return;
    if (deletedIds.has(incoming.id)) {
      throw rackClaimError(`${incoming.rackName || "This rack"} was deleted and cannot be restored by an older rack update.`, "POWER_RACK_DELETED");
    }
    const existing = existingById.get(incoming.id);
    const existingUpdatedAt = existing && new Date(existing.updatedAt).getTime();
    const incomingUpdatedAt = new Date(incoming.updatedAt).getTime();
    if (existing && Number.isFinite(existingUpdatedAt) && Number.isFinite(incomingUpdatedAt) && incomingUpdatedAt < existingUpdatedAt) {
      throw rackClaimError(`${existing.rackName || "This rack"} has a newer saved update. Refresh before saving again.`, "POWER_RACK_STALE");
    }
    if (existing && existing.status === "complete" && incoming.status === "active") {
      throw rackClaimError(`${existing.rackName || "This rack"} has already been completed and cannot be reopened by an older rack update.`, "POWER_RACK_COMPLETE");
    }
  });
}

module.exports = { activeRackForAthlete, normalizeRackReservations, normalizeRackTombstones, updateRackAthleteReservation, validateRackSessionClaims, validateRackSessionTransitions };
