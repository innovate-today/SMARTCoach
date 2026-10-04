const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { savePartnerMeetResult, partnerResultId } = require("../lib/partner-meet-result");

function fixture() {
  const finish = { id: "finish-one", kind: "finish", contactId: "athlete-one", athleteName: "Runner",
    tapAt: "2026-10-03T14:15:00.000Z", raceStartAt: "2026-10-03T14:00:00.000Z",
    raceEvent: "2 Mile", raceMeetName: "Reunion", raceMeetDate: "2026-10-03" };
  const session = { id: "shared-race", records: [finish] };
  const result = { resultType: "individual", partnerTimingSessionId: session.id, partnerFinishRecordId: finish.id,
    contactId: finish.contactId, athleteName: finish.athleteName, meetName: "Reunion", meetDate: new Date("2026-10-03"),
    event: "2 Mile", resultMs: 900000, forceDuplicateSync: true };
  const records = new Map();
  let tail = Promise.resolve(), writes = 0;
  const deps = {
    lock: async () => { const before = tail; let release; tail = new Promise(resolve => { release = resolve; }); await before; return release; },
    loadSession: async () => structuredClone(session),
    load: async key => structuredClone(records.get(key) || null),
    save: async (key, record) => records.set(key, structuredClone(record)),
  };
  const save = async () => { writes++; assert.equal(result.forceDuplicateSync, false); return { success: true, recordId: "provider-one", sourceRecordId: result.sourceRecordId }; };
  return { result, session, finish, deps, records, save, get writes() { return writes; } };
}

async function run() {
  const same = fixture();
  const pair = await Promise.all([savePartnerMeetResult(same.deps, same.result, same.save), savePartnerMeetResult(same.deps, same.result, same.save)]);
  assert.equal(same.writes, 1);
  assert.equal(pair[1].alreadySaved, true);
  assert.equal(pair[0].sourceRecordId, partnerResultId("shared-race", "finish-one"));
  assert.notEqual(partnerResultId("other-race", "finish-one"), pair[0].sourceRecordId);
  assert.notEqual(partnerResultId("shared-race", "other-finish"), pair[0].sourceRecordId);
  // A later race cannot relabel the previous finish's captured race snapshot.
  same.session.eventName = "5K";
  assert.equal((await savePartnerMeetResult(same.deps, same.result, same.save)).alreadySaved, true);
  for (const change of [r => { r.event = "5K"; }, r => { r.contactId = "other"; }, r => { r.resultMs++; },
    r => { r.meetName = "Other"; }, r => { r.meetDate = new Date("2026-10-04"); }, r => { r.partnerFinishRecordId = "missing"; }]) {
    const f = fixture(); change(f.result);
    await assert.rejects(savePartnerMeetResult(f.deps, f.result, f.save));
    assert.equal(f.writes, 0); assert.equal(f.records.size, 0);
  }
  const changed = fixture();
  await savePartnerMeetResult(changed.deps, changed.result, changed.save);
  changed.finish.tapAt = "2026-10-03T14:16:00.000Z"; changed.result.resultMs = 960000;
  await assert.rejects(savePartnerMeetResult(changed.deps, changed.result, changed.save), /changed after/);
  assert.equal(changed.writes, 1);
  const legacy = fixture(); delete legacy.finish.raceEvent;
  await assert.rejects(savePartnerMeetResult(legacy.deps, legacy.result, legacy.save), /predates/);
  assert.equal(legacy.writes, 0);
  const uncertain = fixture();
  let attempts = 0;
  await assert.rejects(savePartnerMeetResult(uncertain.deps, uncertain.result, async () => { attempts++; throw new Error("applied but response lost"); }));
  await assert.rejects(savePartnerMeetResult(uncertain.deps, uncertain.result, uncertain.save), /interrupted save/);
  assert.equal(attempts, 1); assert.equal(uncertain.writes, 0);
  const noIntent = fixture(); noIntent.deps.save = async () => {};
  await assert.rejects(savePartnerMeetResult(noIntent.deps, noIntent.result, noIntent.save), /history/);
  assert.equal(noIntent.writes, 0);
  const noConfirmation = fixture();
  const persist = noConfirmation.deps.save;
  noConfirmation.deps.save = async (key, value) => { if (value.status === "attempted") await persist(key, value); };
  await assert.rejects(savePartnerMeetResult(noConfirmation.deps, noConfirmation.result, noConfirmation.save), /completion/);
  await assert.rejects(savePartnerMeetResult(noConfirmation.deps, noConfirmation.result, noConfirmation.save), /interrupted save/);
  assert.equal(noConfirmation.writes, 1);
  const nextRace = fixture();
  await savePartnerMeetResult(nextRace.deps, nextRace.result, nextRace.save);
  nextRace.finish.id = "finish-two"; nextRace.result.partnerFinishRecordId = "finish-two";
  nextRace.finish.raceEvent = "5K"; nextRace.result.event = "5K";
  await savePartnerMeetResult(nextRace.deps, nextRace.result, nextRace.save);
  assert.equal(nextRace.writes, 2);

  // Exercise the real request normalizer and account-scoped storage adapter.
  const endpointFixture = fixture();
  const registry = {
    registryConfigured: () => true,
    acquireAccountScopedLock: async (account, key) => { assert.equal(account, "tca-trackandcc"); return endpointFixture.deps.lock(key); },
    loadPartnerTimingSessions: async () => [endpointFixture.session],
    loadAccountScopedRecord: async (account, key) => ({ configured: true, found: endpointFixture.records.has(key), record: endpointFixture.records.get(key) }),
    saveAccountScopedRecord: async (account, key, value) => { await endpointFixture.deps.save(key, value); return { saved: true }; },
  };
  let endpointWrites = 0;
  const modules = {
    "../../lib/ghl-account": { getGhlContext: () => ({ token: "test", locationId: "test-location", accountKey: "tca-trackandcc" }), requireProPlan: () => true },
    "../../lib/smart-trak-request": { attachRegistryAccount: async () => {}, setSmartTrakSecurityHeaders: () => {} },
    "../../lib/display-name": { displayNameCase: value => value },
    "../../lib/account-registry": registry,
    "../../lib/partner-meet-result": { savePartnerMeetResult },
    "../../lib/ghl-oauth-consumer": { attachBuyerOAuthContext: async () => true },
  };
  const endpoint = { module: { exports: {} }, require: name => { assert(name in modules, name); return modules[name]; },
    injectedSave: async ({ meetResult }) => {
      endpointWrites++;
      assert.equal(meetResult.syncedBy, "Coach One");
      assert.equal(meetResult.forceDuplicateSync, false);
      return { success: true, recordId: "endpoint-record", sourceRecordId: meetResult.sourceRecordId };
    } };
  vm.createContext(endpoint);
  vm.runInContext(fs.readFileSync("api/ghl/meet-result.js", "utf8") + "\nsaveSingleMeetResult = injectedSave;", endpoint);
  async function request(changes = {}) {
    const response = { setHeader() {}, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; }, end() {} };
    await endpoint.module.exports({ method: "POST", headers: { "x-smartcoach-coach-name": "Coach One" },
      body: { ...endpointFixture.result, meetDate: "2026-10-03", resultDisplay: "15:00.0", forceDuplicateSync: false, ...changes } }, response);
    return response;
  }
  const responses = await Promise.all([request({ sourceRecordId: "mr_8" }), request({ sourceRecordId: "mr_91" })]);
  assert.equal(endpointWrites, 1);
  assert.equal(responses[0].statusCode, 200);
  assert.equal(responses[1].body.alreadySaved, true);
  assert.equal((await request({ event: "5K" })).statusCode, 422);
  assert.equal((await request({ partnerFinishRecordId: "" })).statusCode, 400);
  assert.equal(endpointWrites, 1);
  vm.runInContext("ghlFetch = async () => { throw Object.assign(new Error('Forbidden'), {statusCode:403}); }; module.exports.findDuplicate = findDuplicateMeetResult;", endpoint);
  await assert.rejects(endpoint.module.exports.findDuplicate({ sourceRecordId: "id", strict: true }), /Forbidden/);
  assert.equal(await endpoint.module.exports.findDuplicate({ sourceRecordId: "id" }), null);

  const html = fs.readFileSync("index.html", "utf8");
  const start = html.indexOf("function buildMeetSourceRecordId(");
  const end = html.indexOf("\nfunction submitCapturedFieldMeetResult", start);
  const context = { CL: { id: 8, meetDate: "2026-10-03" }, event: "2 Mile",
    partnerTimingEnabled: () => true, ensurePartnerTiming: () => ({ id: "shared-race" }) };
  context.selectedMeetSaveEvent = () => context.event;
  vm.createContext(context); vm.runInContext(html.slice(start, end), context);
  const runner = { contactId: "athlete-one" }, finish = { ms: 900000, partnerRecordId: "finish-one" };
  const first = context.buildMeetSourceRecordId(runner, finish, 0, false);
  context.CL.id = 91; context.event = "5K";
  assert.equal(context.buildMeetSourceRecordId(runner, finish, 4, true), first);
  finish.partnerRecordId = "other-finish";
  assert.notEqual(context.buildMeetSourceRecordId(runner, finish, 0, false), first);
  context.partnerTimingEnabled = () => false;
  assert.match(context.buildMeetSourceRecordId(runner, finish, 0, true), /_resync_/);
  assert(html.includes("partnerTimingSessionId:partnerTimingEnabled()?ensurePartnerTiming().id:''"));
  assert(html.includes("if(e.status===409&&!partnerTimingEnabled())"));
  console.log("Partner Timing shared-finish idempotency and race-distance tests passed");
}

run().catch(error => { console.error(error); process.exitCode = 1; });
