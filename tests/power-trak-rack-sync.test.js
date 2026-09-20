const assert = require("assert");
const { flush } = require("../power-trak-rack-sync");

(async () => {
  const queue = [
    { id: "rack-1", athletes: [{ id: "a1", completedReps: 2 }] },
    { id: "rack-2", athletes: [{ id: "a2", completedReps: 4 }] },
    { id: "rack-3", athletes: [{ id: "a3", completedReps: 6 }] },
  ];
  const attempted = [];

  const result = await flush(queue, async (rack) => {
    attempted.push(rack.id);
    if (rack.id === "rack-2") throw new Error("Rack reservation conflict");
    return { rackSessions: [{ id: rack.id }] };
  });

  assert.deepStrictEqual(attempted, ["rack-1", "rack-2", "rack-3"]);
  assert.deepStrictEqual(result.synced.map((item) => item.rack.id), ["rack-1", "rack-3"]);
  assert.deepStrictEqual(result.failed.map((item) => item.rack.id), ["rack-2"]);
  assert.deepStrictEqual(result.remaining.map((rack) => rack.id), ["rack-2"]);
  assert.strictEqual(result.synced[0].data.rackSessions[0].id, "rack-1");

  queue[1].athletes[0].completedReps = 99;
  assert.strictEqual(result.remaining[0].athletes[0].completedReps, 4);

  const recovered = await flush(result.remaining, async (rack) => ({ savedId: rack.id }));
  assert.deepStrictEqual(recovered.remaining, []);
  assert.deepStrictEqual(recovered.synced.map((item) => item.data.savedId), ["rack-2"]);

  console.log("Power Trak offline rack sync tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
