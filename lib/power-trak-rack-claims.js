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

module.exports = { activeRackForAthlete, updateRackAthleteReservation };
