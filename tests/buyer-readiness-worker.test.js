const assert = require("assert/strict");
const { createBuyerReadinessWorker } = require("../lib/buyer-readiness-worker");
const { scanBuyerReadinessJobs } = require("../lib/account-registry");

async function run() {
  let enabled = false, state, scans = [], resumed = [], failResume = false, failReadback = false;
  const first = "buyerreadiness-12345678901234567890", second = "buyerreadiness-12345678901234567891";
  const worker = createBuyerReadinessWorker({ enabled: () => enabled,
    load: async () => failReadback ? null : structuredClone(state),
    save: async value => { state = structuredClone(value); },
    scan: async cursor => { scans.push(cursor); return cursor === "0" ? { cursor: "42", namespaces: [first, second, first] }
      : { cursor: "0", namespaces: [] }; },
    lock: async () => () => {},
    loadJob: async namespace => ({ locationId: namespace.slice(15), buyerAccountKey: `sc-${namespace.slice(15)}`, signatureVerified: true }),
    resume: async buyer => { resumed.push(buyer.accountKey); if (failResume) throw new Error("Interrupted"); return { status: "complete" }; },
  });
  assert.equal((await worker.run()).status, "disabled");
  assert.equal(state, undefined); assert.equal(scans.length, 0);
  enabled = true;
  assert.equal((await worker.run()).processed, 1);
  assert.deepEqual(state, { cursor: "42", pending: [second] });
  assert.equal((await worker.run()).processed, 1);
  assert.deepEqual(scans, ["0"]);
  assert.equal((await worker.run()).status, "idle");
  assert.deepEqual(scans, ["0", "42"]);
  failResume = true;
  await assert.rejects(worker.run(), /Interrupted/);
  assert.deepEqual(state, { cursor: "42", pending: [first, second] }, "Failed execution must not discard pending work");
  failResume = false;
  assert.equal((await worker.run()).processed, 1);
  assert.deepEqual(state.pending, [second]);
  failReadback = true;
  await assert.rejects(worker.run(), /readback failed/);
  failReadback = false;
  state = { cursor: "0", pending: ["other-scope"] };
  await assert.rejects(worker.run(), /Invalid readiness worker state/);
  for (const job of [{ locationId: "12345678901234567891", buyerAccountKey: "sc-12345678901234567891", signatureVerified: true },
    { locationId: "12345678901234567890", buyerAccountKey: "other", signatureVerified: true },
    { locationId: "12345678901234567890", buyerAccountKey: "sc-12345678901234567890", signatureVerified: false }]) {
    const invalid = createBuyerReadinessWorker({ enabled: () => true, lock: async () => () => {},
      load: async () => ({ cursor: "0", pending: [first] }), loadJob: async () => job,
      resume: async () => { throw new Error("Must not execute"); } });
    await assert.rejects(invalid.run(), /identity mismatch/);
  }
  const previousFetch = global.fetch;
  const keys = ["SMARTCOACH_REGISTRY_REST_URL", "SMARTCOACH_REGISTRY_REST_TOKEN", "SMARTCOACH_REGISTRY_PREFIX"];
  const previousEnv = keys.map(key => process.env[key]);
  try {
    process.env.SMARTCOACH_REGISTRY_REST_URL = "https://registry.example";
    process.env.SMARTCOACH_REGISTRY_REST_TOKEN = "private-registry-token";
    process.env.SMARTCOACH_REGISTRY_PREFIX = "test:account:";
    const prefix = "test:account:ghlconnector:";
    let result = ["42", [prefix + first, prefix + second]];
    let calls = 0;
    global.fetch = async (url, options) => {
      calls++;
      const parts = new URL(url).pathname.split("/").slice(1).map(decodeURIComponent);
      assert.deepEqual(parts, ["scan", "0", "match", `${prefix}buyerreadiness-*`, "count", "20"]);
      assert.equal(options.method, "POST");
      return { ok: true, text: async () => JSON.stringify({ result }) };
    };
    assert.deepEqual(await scanBuyerReadinessJobs(), { cursor: "42", namespaces: [first, second] });
    await assert.rejects(scanBuyerReadinessJobs("invalid"), /Invalid readiness cursor/);
    assert.equal(calls, 1);
    for (const invalid of [["42", ["other:account:ghlconnector:" + first]], ["42", [prefix + "oauthgrant"]],
      ["invalid", []], "invalid", ["0", Array(1001).fill(prefix + first)]]) {
      result = invalid;
      await assert.rejects(scanBuyerReadinessJobs(), /Invalid readiness scan response/);
    }
  } finally {
    global.fetch = previousFetch;
    keys.forEach((key, index) => { if (previousEnv[index] === undefined) delete process.env[key]; else process.env[key] = previousEnv[index]; });
  }
  console.log("Readiness worker durable cursor and fail-closed tests passed");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
