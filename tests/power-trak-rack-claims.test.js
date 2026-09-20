const assert = require("assert");
const { normalizeRackReservations, normalizeRackTombstones, updateRackAthleteReservation, validateRackSessionClaims, validateRackSessionTransitions } = require("../lib/power-trak-rack-claims");

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
  revision: 3,
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
  updatedAt: "2026-09-20T12:00:00.000Z",
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

const completedRack = {
  ...rackOne,
  status: "complete",
  athletes: rackOne.athletes.map((athlete) => ({ ...athlete, rackStatus: "released" })),
};
assert.throws(
  () => validateRackSessionTransitions({ existingRackSessions: [completedRack], incomingRackSessions: [rackOne] }),
  (error) => error.statusCode === 409 && /already been completed/.test(error.message),
);
assert.doesNotThrow(() => validateRackSessionTransitions({ existingRackSessions: [rackOne], incomingRackSessions: [completedRack] }));
assert.doesNotThrow(() => validateRackSessionTransitions({ existingRackSessions: [completedRack], incomingRackSessions: [{ ...completedRack, rackName: "Corrected Rack 1" }] }));
assert.throws(
  () => validateRackSessionTransitions({ existingRackSessions: [{ ...rackOne, revision: 4, updatedAt: "2026-09-20T12:01:00.000Z" }], incomingRackSessions: [{ ...rackOne, revision: 3, updatedAt: "2026-09-20T12:02:00.000Z" }] }),
  (error) => error.statusCode === 409 && error.code === "POWER_RACK_STALE" && /newer saved update/.test(error.message),
);
assert.doesNotThrow(() => validateRackSessionTransitions({ existingRackSessions: [rackOne], incomingRackSessions: [{ ...rackOne }] }));
assert.doesNotThrow(() => validateRackSessionTransitions({ existingRackSessions: [rackOne], incomingRackSessions: [{ ...rackOne, revision: 3, updatedAt: "2026-09-20T11:00:00.000Z" }] }));

const tombstones = normalizeRackTombstones([
  { id: "session-1", deletedAt: "2026-09-20T13:00:00.000Z" },
  { id: "session-1", deletedAt: "2026-09-20T13:01:00.000Z" },
]);
assert.deepStrictEqual(tombstones, [{ id: "session-1", deletedAt: "2026-09-20T13:01:00.000Z" }]);
assert.throws(
  () => validateRackSessionTransitions({ existingRackSessions: [], incomingRackSessions: [rackOne], tombstones }),
  (error) => error.statusCode === 409 && error.code === "POWER_RACK_DELETED" && /was deleted/.test(error.message),
);

console.log("Power Trak multi-device rack claim tests passed");
