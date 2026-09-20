function rackAthleteId(value) {
  return String(value == null ? "" : value).trim().toLowerCase();
}

function rackClaimError(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
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

module.exports = { activeRackForAthlete, updateRackAthleteReservation, validateRackSessionClaims };
