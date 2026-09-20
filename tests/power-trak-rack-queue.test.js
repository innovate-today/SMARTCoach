const assert = require("assert");
const { merge, remove } = require("../power-trak-rack-queue");

const first = { id: "rack-1", updatedAt: "12:00", athletes: [{ id: "a1", completedReps: 1 }] };
const second = { id: "rack-2", updatedAt: "12:01", athletes: [{ id: "a2", completedReps: 2 }] };
let queue = merge([], first);
queue = merge(queue, second);
assert.deepStrictEqual(queue.map((rack) => rack.id), ["rack-1", "rack-2"]);

const latestFirst = { id: "rack-1", updatedAt: "12:02", athletes: [{ id: "a1", completedReps: 3 }] };
queue = merge(queue, latestFirst);
assert.deepStrictEqual(queue.map((rack) => rack.id), ["rack-2", "rack-1"]);
assert.strictEqual(queue[1].athletes[0].completedReps, 3);
assert.strictEqual(queue.filter((rack) => rack.id === "rack-1").length, 1);

latestFirst.athletes[0].completedReps = 99;
assert.strictEqual(queue[1].athletes[0].completedReps, 3);

queue = remove(queue, "rack-2");
assert.deepStrictEqual(queue.map((rack) => rack.id), ["rack-1"]);
assert.deepStrictEqual(remove(queue, "missing"), queue);

console.log("Power Trak offline rack queue tests passed");
