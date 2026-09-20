const assert = require("assert");
const { normalizeRackReservations, updateRackAthleteReservation, validateRackSessionClaims } = require("../lib/power-trak-rack-claims");

function claim(options) {
  return updateRackAthleteReservation({
    action: "claim-rack-athlete",
    athleteId: "athlete-1",
    athleteName: "Test Athlete",
    deviceLabel: "Rack iPad",
    rackSessions: [],
    reservations: [],
    now: new Date("2026-09-20T12:00:00.000Z"),
    ...options,
  });
}

let reservations = claim({ deviceId: "rack-1", deviceLabel: "Rack 1 iPad" });
assert.strictEqual(reservations.length, 1);
assert.strictEqual(reservations[0].deviceId, "rack-1");
assert.strictEqual(reservations[0].expiresAt, "2026-09-20T12:05:00.000Z");

const normalized = normalizeRackReservations([
  { athleteId: "expired", athleteName: "Old Athlete", deviceId: "rack-old", expiresAt: "2026-09-20T11:59:59.000Z" },
  reservations[0],
], { now: new Date("2026-09-20T12:00:00.000Z") });
assert.deepStrictEqual(normalized.map((item) => item.athleteId), ["athlete-1"]);

assert.throws(
  () => claim({ deviceId: "rack-2", deviceLabel: "Rack 2 iPad", reservations }),
  (error) => error.statusCode === 409 && /reserved on Rack 1 iPad/.test(error.message),
);

const wrongDeviceRelease = updateRackAthleteReservation({
  action: "release-rack-athlete",
  athleteId: "athlete-1",
  deviceId: "rack-2",
  rackSessions: [],
  reservations,
});
assert.strictEqual(wrongDeviceRelease.length, 1);
assert.strictEqual(wrongDeviceRelease[0].deviceId, "rack-1");

reservations = updateRackAthleteReservation({
  action: "release-rack-athlete",
  athleteId: "athlete-1",
  deviceId: "rack-1",
  rackSessions: [],
  reservations,
});
assert.deepStrictEqual(reservations, []);

reservations = claim({ deviceId: "rack-2", deviceLabel: "Rack 2 iPad", reservations });
assert.strictEqual(reservations.length, 1);
assert.strictEqual(reservations[0].deviceId, "rack-2");

assert.throws(
  () => claim({
    deviceId: "rack-1",
    reservations: [],
    rackSessions: [{
      id: "session-2",
      status: "active",
      rackName: "Rack 2",
      athletes: [{ id: "athlete-1", rackStatus: "active" }],
    }],
  }),
  (error) => error.statusCode === 409 && /already active on Rack 2/.test(error.message),
);

const rackOne = {
  id: "session-1",
  status: "active",
  rackName: "Rack 1",
  deviceId: "rack-1",
  athletes: [{ id: "athlete-1", name: "Test Athlete", rackStatus: "active" }],
};
const rackTwo = {
  id: "session-2",
  status: "active",
  rackName: "Rack 2",
  deviceId: "rack-2",
  athletes: [{ id: "athlete-1", name: "Test Athlete", rackStatus: "active" }],
};

assert.throws(
  () => validateRackSessionClaims({ existingRackSessions: [rackOne], incomingRackSessions: [rackTwo], reservations: [] }),
  (error) => error.statusCode === 409 && /already active on Rack 1/.test(error.message),
);

const rackOneReservation = [{ athleteId: "athlete-1", athleteName: "Test Athlete", deviceId: "rack-1", deviceLabel: "Rack 1 iPad" }];
assert.throws(
  () => validateRackSessionClaims({ existingRackSessions: [], incomingRackSessions: [rackTwo], reservations: rackOneReservation }),
  (error) => error.statusCode === 409 && /reserved on Rack 1 iPad/.test(error.message),
);

const started = validateRackSessionClaims({ existingRackSessions: [], incomingRackSessions: [rackOne], reservations: rackOneReservation });
assert.deepStrictEqual(Array.from(started), ["athlete-1"]);

console.log("Power Trak multi-device rack claim tests passed");
