const assert = require("assert");
const { loadSessionState, saveSessionState, selectLegacyState } = require("../lib/power-trak-session-storage");
const client = require("../assets/power-trak-history-client");

const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
async function run() {
  const records = new Map(), writes = [], reads = [], retired = [];
  let failBatch = false, race = false;
  const key = (account, namespace) => `${account}:${namespace}`;
  const io = {
    async load(account, namespace) {
      reads.push(namespace);
      const record = records.get(key(account, namespace));
      return { found: Boolean(record), record: clone(record) };
    },
    async loadBatch(account, namespaces) {
      assert(namespaces.length <= 10);
      return Promise.all(namespaces.map((namespace) => io.load(account, namespace)));
    },
    async saveBatch(account, items) {
      if (failBatch) throw new Error("storage unavailable");
      for (const item of items) { writes.push(item.namespace); records.set(key(account, item.namespace), clone(item.record)); }
      if (race) { race = false; records.get(key(account, "powertrak")).version = "newer-writer"; }
    },
    async saveRoot(account, namespace, record, expected) {
      const current = records.get(key(account, namespace));
      assert.strictEqual(current && current.version || null, expected && expected.version || null, "stale publication must be rejected");
      records.set(key(account, namespace), clone(record));
      return { saved: true };
    },
    async expire(account, namespaces, seconds, version) {
      assert.strictEqual(records.get(key(account, "powertrak")).version, version);
      assert.strictEqual(seconds, 86400);
      retired.push(...namespaces);
    },
  };
  const root = () => clone(records.get(key("school-a", "powertrak")));
  const sessions = Array.from({ length: 12 }, (_, i) => ({ id: `test-${i}`, date: "2026-09-01", groupId: "sprinters", athletes: [] }));
  const racks = Array.from({ length: 120 }, (_, i) => ({ id: `rack-${i}`, date: "2026-09-01", status: i < 2 ? "active" : "complete", athletes: [] }));
  const state = { powerTrakSessions: sessions, powerTrakRackSessions: racks, powerTrakWorkouts: [{ id: "workout-a" }], powerTrakRackReservations: [] };
  records.set(key("school-a", "powertrak"), { chunkManifest: { digest: "legacy-snapshot" } });
  failBatch = true;
  await assert.rejects(saveSessionState("school-a", state, io), /unavailable/);
  assert.strictEqual(root().chunkManifest.digest, "legacy-snapshot", "failed migration must keep legacy pointer");
  failBatch = false;
  await saveSessionState("school-a", state, io);
  assert.strictEqual(root().storageVersion, 2);
  assert.strictEqual(root().rackSessionRefs.length, racks.length);
  assert.strictEqual(root().metadata.powerTrakRackSessions, undefined);
  const full = await loadSessionState("school-a", root(), io);
  assert.deepStrictEqual(full.powerTrakRackSessions, racks);
  reads.length = 0;
  const live = await loadSessionState("school-a", root(), io, { activeOnly: true, omitTesting: true });
  assert.strictEqual(live.powerTrakRackSessions.length, 2);
  assert.strictEqual(reads.length, 2, "live save preparation must not load completed history");
  writes.length = 0;
  live.powerTrakRackSessions[0].status = "complete";
  const originalVersion = root().version;
  await saveSessionState("school-a", live, io, { partial: true, expectedVersion: originalVersion });
  assert.strictEqual(writes.filter((namespace) => namespace.startsWith("powertrak_session_")).length, 1, "only the changed rack blob should be written");
  assert.strictEqual(root().sessionRefs.length, 12);
  const athleteState = { powerTrakSessions: [{ id: "athlete-test", athletes: [{ athleteId: "athlete-1", name: "Lisa Smith" }] }], powerTrakRackSessions: [{ id: "athlete-rack", status: "complete", athletes: [{ id: "athlete-2", name: "Other Athlete" }] }] };
  await saveSessionState("athlete-school", athleteState, io);
  const athleteRoot = records.get(key("athlete-school", "powertrak"));
  const athletePage = await loadSessionState("athlete-school", athleteRoot, io, { athleteName: " lisa   smith ", pageSize: 50 });
  assert.strictEqual(athletePage.powerTrakSessions.length, 1);
  assert.strictEqual(athletePage.powerTrakRackSessions.length, 0);
  await saveSessionState("athlete-school", { powerTrakSessions: [], powerTrakRackSessions: [] }, io, { partial: true, expectedVersion: athleteRoot.version, deleteIds: ["athlete-test"] });
  const deletedRoot = records.get(key("athlete-school", "powertrak"));
  assert.strictEqual(deletedRoot.sessionRefs.length, 0);
  assert.strictEqual(deletedRoot.rackSessionRefs.length, 1, "deleting a test must preserve rack history");
  assert.strictEqual(root().rackSessionRefs.length, 120, "partial save must preserve completed history");
  assert(retired.length > 0, "replaced immutable blobs should retire after reader grace period");
  await assert.rejects(saveSessionState("school-a", live, io, { partial: true, expectedVersion: originalVersion }), (error) => error.statusCode === 503);
  reads.length = 0;
  const testing = await loadSessionState("school-a", root(), io, { omitRacks: true, sessionIds: ["test-0"] });
  assert.strictEqual(reads.length, 1, "a testing save should not load other tests or rack history");
  testing.powerTrakSessions[0].note = "corrected";
  await saveSessionState("school-a", testing, io, { partial: true, expectedVersion: root().version });
  assert.strictEqual(root().rackSessionRefs.length, 120);
  assert.strictEqual(root().sessionRefs.length, 12);
  let cursor = null, seen = [];
  do {
    const page = await loadSessionState("school-a", root(), io, { pageSize: 25, cursor });
    assert(page.powerTrakSessions.length + page.powerTrakRackSessions.length <= 25);
    seen.push(...page.powerTrakSessions, ...page.powerTrakRackSessions);
    cursor = page._powerHistory.nextCursor;
  } while (cursor);
  assert.strictEqual(new Set(seen.map((item) => item.id)).size, 132);
  const first = await loadSessionState("school-a", root(), io, { pageSize: 1 });
  const frozenPage = await loadSessionState("school-a", { ...root(), version: "changed" }, io, { pageSize: 1, cursor: first._powerHistory.nextCursor });
  assert.strictEqual(frozenPage._powerHistory.version, first._powerHistory.version, "concurrent rack saves should not invalidate paging snapshots");
  const snapshotKey = key("school-a", `powertrak_index_${first._powerHistory.version}`);
  const snapshot = records.get(snapshotKey); records.delete(snapshotKey);
  await assert.rejects(loadSessionState("school-a", { ...root(), version: "changed" }, io, { pageSize: 1, cursor: first._powerHistory.nextCursor }), (error) => error.statusCode === 409);
  records.set(snapshotKey, snapshot);
  const filtered = await loadSessionState("school-a", root(), io, { groupId: "unassigned", pageSize: 25 });
  assert.strictEqual(filtered.powerTrakSessions.length, 0);
  const legacyPage = selectLegacyState(state, { pageSize: 2 });
  assert.strictEqual(legacyPage.powerTrakSessions.length, 2);
  assert(legacyPage._powerHistory.nextCursor);
  await assert.rejects(loadSessionState("school-b", root(), io), /incomplete/, "account records must remain scoped");
  const beforeRace = root();
  race = true;
  await assert.rejects(saveSessionState("school-a", { ...state, powerTrakRackSessions: [{ ...racks[0], revision: 2 }] }, io, { partial: true, expectedVersion: beforeRace.version }), /stale publication/);
  assert.strictEqual(root().version, "newer-writer");
  const big = { powerTrakSessions: [], powerTrakRackSessions: Array.from({ length: 3 }, (_, i) => ({ id: `big-${i}`, status: "complete", note: "x".repeat(1200000) })) };
  await saveSessionState("large-school", big, io);
  const bigRoot = records.get(key("large-school", "powertrak"));
  const bigPage = await loadSessionState("large-school", bigRoot, io, { pageSize: 25 });
  assert.strictEqual(bigPage.powerTrakRackSessions.length, 2, "page byte budget should override item count");
  assert(bigPage._powerHistory.nextCursor);

  const responses = [
    { ok: true, sessions: [{ id: "a" }], rackSessions: [], historyPage: { nextCursor: "next" } },
    { ok: true, sessions: [], rackSessions: [{ id: "b" }], historyPage: { nextCursor: null } },
  ];
  const request = async (url) => {
    assert(new URL(url, "https://app.smartcoach-pro.com").searchParams.has("pageSize"));
    const data = responses.shift();
    return { ok: data.ok, status: data.ok ? 200 : 409, json: async () => data };
  };
  const history = await client.readHistory("/api/smart-trak/power-trak", {}, request);
  assert.strictEqual(history.sessions[0].id, "a");
  assert.strictEqual(history.rackSessions[0].id, "b");
  const delta = client.mergeDelta({ historyDelta: true, sessions: [], rackSessions: [{ id: "b", revision: 2 }], deletedRackSessionIds: ["old-import-id"] }, { sessions: [{ id: "a" }], rackSessions: [{ id: "b" }, { id: "unchanged" }, { id: "old-import-id" }] });
  assert.strictEqual(delta.sessions.length, 1);
  assert.deepStrictEqual(delta.rackSessions.map((item) => item.id), ["b", "unchanged"]);
  responses.push(
    { ok: true, sessions: [{ id: "stale" }], historyPage: { nextCursor: "old" } },
    { ok: false },
    { ok: true, sessions: [{ id: "fresh" }], historyPage: { nextCursor: null } },
  );
  const restarted = await client.readHistory("/api/smart-trak/power-trak", {}, request);
  assert.deepStrictEqual(restarted.sessions.map((item) => item.id), ["fresh"]);
  const registry = require("../lib/account-registry");
  const oldFetch = global.fetch, oldUrl = process.env.SMARTCOACH_REGISTRY_REST_URL, oldToken = process.env.SMARTCOACH_REGISTRY_REST_TOKEN;
  process.env.SMARTCOACH_REGISTRY_REST_URL = "https://registry.example";
  process.env.SMARTCOACH_REGISTRY_REST_TOKEN = "test-token";
  const commands = [];
  let evalResult = 1, failCommand = false;
  global.fetch = async (url, options) => {
    assert.strictEqual(url, "https://registry.example/pipeline", "large records must be in a POST body, not a URL");
    const batch = JSON.parse(options.body); commands.push(...batch);
    const results = batch.map((command) => failCommand ? { error: "write failed" } : { result: command[0] === "eval" ? evalResult : command[0] === "get" ? JSON.stringify({ data: "stored" }) : "OK" });
    return { ok: true, status: 200, text: async () => JSON.stringify(results) };
  };
  try {
    await registry.saveLargeAccountScopedRecords("school-a", [{ namespace: "snapshot", record: { data: "payload" }, ttlSeconds: 86400 }]);
    assert.deepStrictEqual(commands[0].slice(-2), ["ex", 86400]);
    assert(commands[0][1].includes("school-a:snapshot"));
    await registry.publishPowerTrakSessionIndex("school-a", "powertrak", { version: "new", metadata: { note: "x".repeat(200000) } }, { version: "old" });
    const publication = commands.find((command) => command[0] === "eval");
    assert.strictEqual(publication[4], "present");
    assert.strictEqual(publication[5], "old");
    evalResult = 0;
    await assert.rejects(registry.publishPowerTrakSessionIndex("school-a", "powertrak", { version: "new" }, { version: "old" }), (error) => error.statusCode === 503 && error.code === "POWER_TRAK_BUSY");
    evalResult = 1;
    await registry.expireAccountScopedRecords("school-a", ["retired"], 86400, "current-version");
    assert(commands[commands.length - 1].includes("current-version"));
    const loaded = await registry.loadAccountScopedRecords("school-a", ["one"]);
    assert.strictEqual(loaded[0].record.data, "stored");
    failCommand = true;
    await assert.rejects(registry.saveLargeAccountScopedRecords("school-a", [{ namespace: "one", record: {} }]), /batch failed/);
  } finally {
    global.fetch = oldFetch;
    if (oldUrl == null) delete process.env.SMARTCOACH_REGISTRY_REST_URL; else process.env.SMARTCOACH_REGISTRY_REST_URL = oldUrl;
    if (oldToken == null) delete process.env.SMARTCOACH_REGISTRY_REST_TOKEN; else process.env.SMARTCOACH_REGISTRY_REST_TOKEN = oldToken;
  }
  console.log("Power Trak session storage and paged history tests passed");
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
