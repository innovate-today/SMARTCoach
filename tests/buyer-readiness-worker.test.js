const assert = require("assert/strict");
const { createBuyerReadinessWorker } = require("../lib/buyer-readiness-worker");
const { createBuyerReadiness } = require("../lib/buyer-readiness");
const { scanBuyerReadinessJobs } = require("../lib/account-registry");

async function run() {
  await verifyAutomaticSubscriptionResume();
  await verifyAutomaticSubscriptionResume("waiting_for_subscription_identity");
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
      assert.deepEqual(parts, ["scan", "0", "match", `${prefix}buyerreadiness-*`, "count", "1000"]);
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

async function verifyAutomaticSubscriptionResume(waitingStatus = "waiting_for_subscription") {
  const buyer = { locationId: "AbCdEfGhIjKlMnOpQrSt", accountKey: "sc-abcdefghijklmnopqrst" };
  const namespace = "buyerreadiness-abcdefghijklmnopqrst";
  const event = { type: "INSTALL", locationId: buyer.locationId, companyId: "agency", appId: "connector" };
  let now = 1000, job, workerState, subscriptionReady = false, executions = 0, inspections = 0;
  const readiness = createBuyerReadiness({
    now: () => now, allowed: () => true, lock: async () => () => {},
    load: async () => structuredClone(job),
    save: async (_, value) => { job = structuredClone(value); },
    inspect: async (_, savedEvent, reportStage) => {
      inspections++;
      assert.deepEqual(savedEvent, event);
      reportStage("purchase_subscription_details");
      if (!subscriptionReady && waitingStatus === "waiting_for_subscription_identity") return { status: waitingStatus };
      if (!subscriptionReady) throw Object.assign(new Error("Identifiers pending"), { readinessPending: "subscription" });
      return { status: "ready", fingerprint: "verified-purchase" };
    },
    execute: async () => { executions++; return { status: "complete", emailAccepted: true }; },
  });
  assert.equal((await readiness.run(buyer, { event })).status, waitingStatus);
  const deadline = job.expiresAt;
  const worker = createBuyerReadinessWorker({
    enabled: () => true, lock: async () => () => {},
    load: async () => structuredClone(workerState),
    save: async value => { workerState = structuredClone(value); },
    scan: async () => ({ cursor: "0", namespaces: [namespace] }),
    loadJob: async () => structuredClone(job),
    resume: async identity => {
      assert.deepEqual(identity, buyer);
      return readiness.run(identity);
    },
  });
  subscriptionReady = true;
  assert.equal((await worker.run()).buyerStatus, waitingStatus);
  assert.equal(inspections, 1, "Worker must honor the persisted retry time");
  assert.equal(executions, 0);
  now += 60000;
  assert.equal((await worker.run()).buyerStatus, "complete");
  assert.equal(job.attempts, 2);
  assert.equal(job.expiresAt, deadline);
  assert.equal(job.emailAccepted, true);
  assert.equal(executions, 1);
  const complete = structuredClone(job);
  assert.equal((await worker.run()).buyerStatus, "existing_access_preserved");
  assert.deepEqual(job, complete);
  assert.equal(executions, 1, "Repeated worker scans must not resend access");
  job = { ...complete, status: "support_review_required", emailAccepted: false,
    failure: { stage: "purchase_subscription_read", kind: "exception" } };
  const stopped = structuredClone(job);
  assert.equal((await worker.run()).buyerStatus, "support_review_required");
  assert.deepEqual(job, stopped);
  assert.equal(executions, 1, "Worker must not replay a stopped buyer");
}
run().catch(error => { console.error(error); process.exitCode = 1; });
