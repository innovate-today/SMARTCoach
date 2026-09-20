const assert = require("assert");
const { updateRackAthleteReservation } = require("../lib/power-trak-rack-claims");

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

assert.throws(
  () => claim({ deviceId: "rack-2", deviceLabel: "Rack 2 iPad", reservations }),
  (error) => error.statusCode === 409 && /reserved on Rack 1 iPad/.test(error.message),
);

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

console.log("Power Trak multi-device rack claim tests passed");
