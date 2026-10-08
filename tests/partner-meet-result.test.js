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

  // Provider accepts unfiltered reads but rejects the bare source field filter.
  let searchCalls = [];
  let pages = [];
  const lookupDiagnostics = [];
  endpoint.console = { warn: (label, value) => {
    assert.equal(label, "[partner-meet-duplicate-lookup]");
    lookupDiagnostics.push(JSON.parse(value));
  } };
  endpoint.searchProvider = async options => {
    searchCalls.push(options);
    assert.equal(options.method, "POST");
    assert.equal(options.path, "/objects/custom_objects.meet_results/records/search");
    assert.equal(options.token, "cached-test-token");
    assert.equal(options.body.locationId, "test-location");
    assert.equal(options.body.pageLimit, 100);
    assert.equal(options.body.filters, undefined);
    assert.equal(options.body.query, undefined);
    assert.equal(options.body.page, searchCalls.length);
    const response = pages[options.body.page - 1];
    if (response instanceof Error) throw response;
    return response;
  };
  vm.runInContext("ghlFetch = searchProvider;", endpoint);
  const lookup = sourceRecordId => endpoint.module.exports.findDuplicate({
    token: "cached-test-token", locationId: "test-location", sourceRecordId, strict: true,
  });
  const searchRow = (id, sourceRecordId) => ({ id, locationId: "test-location", properties: { source_record_id: sourceRecordId } });
  const firstPage = Array.from({ length: 100 }, (_, index) => searchRow(`record-${index}`, `unrelated-${index}`));
  pages = [{ records: firstPage, total: 101 }, { records: [searchRow("existing", "wanted")], total: 101 }];
  assert.equal((await lookup("wanted")).id, "existing");
  assert.equal(searchCalls.length, 2, "Duplicate beyond the first page is detected");
  searchCalls = [];
  pages = [{ records: [searchRow("near-match", "wanted-extra")], total: 1 }];
  assert.equal(await lookup("wanted"), null, "Only an exact source ID is a duplicate");
  searchCalls = [];
  pages = [{ records: [{ id: "qualified", properties: { "custom_objects.meet_results.source_record_id": "wanted" } }], total: 1 }];
  assert.equal((await lookup("wanted")).id, "qualified");
  searchCalls = [];
  pages = [{ records: [], total: 0 }];
  assert.equal(await lookup("new-finish"), null);
  for (const invalid of [undefined, {}, { records: [], total: 1 }, { records: [], total: "0" },
    { records: [searchRow("one", "other")], total: 0 },
    { records: [{ ...searchRow("foreign", "wanted"), locationId: "other-location" }], total: 1 },
    { records: [{ properties: { source_record_id: "wanted" } }], total: 1 }]) {
    searchCalls = []; pages = [invalid];
    await assert.rejects(lookup("wanted"), error => error.statusCode === 503);
  }
  searchCalls = []; pages = [{ records: firstPage, total: 200 }, { records: firstPage, total: 200 }];
  await assert.rejects(lookup("wanted"), error => error.statusCode === 503);
  searchCalls = []; pages = [{ records: firstPage, total: 101 }, Object.assign(new Error("Forbidden"), { statusCode: 403 })];
  await assert.rejects(lookup("wanted"), /Forbidden/);
  searchCalls = [];
  pages = Array.from({ length: 100 }, (_, page) => ({ total: 10001,
    records: Array.from({ length: 100 }, (_, index) => searchRow(`row-${page}-${index}`, "unrelated")) }));
  await assert.rejects(lookup("wanted"), /incomplete/);
  assert.equal(searchCalls.length, 100, "Bounded incomplete scans cannot authorize a write");
  const diagnosticCases = [
    ["invalid_total", { records: [], total: "PRIVATE_PROVIDER_VALUE" }],
    ["count_exceeds_total", { records: [searchRow("PRIVATE_RECORD_ID", "PRIVATE_SOURCE_ID")], total: 0 }],
    ["oversized_page", { records: Array.from({ length: 101 }, (_, i) => searchRow(`row-${i}`, "other")), total: 101 }],
    ["missing_record_id", { records: [{ _id: "PRIVATE_ALTERNATE_ID", properties: { source_record_id: "PRIVATE_SOURCE_ID" } }], total: 1 }],
    ["location_mismatch", { records: [{ ...searchRow("PRIVATE_RECORD_ID", "other"), locationId: "PRIVATE_LOCATION_ID" }], total: 1 }],
    ["short_page_before_total", { records: [], total: 1 }],
    ["repeated_record_id", { records: [searchRow("PRIVATE_RECORD_ID", "other"), searchRow("PRIVATE_RECORD_ID", "other")], total: 2 }],
  ];
  for (const [reason, response] of diagnosticCases) {
    lookupDiagnostics.length = 0; searchCalls = []; pages = [response];
    await assert.rejects(lookup("PRIVATE_SOURCE_ID_WANTED"), error => error.statusCode === 503);
    assert.equal(lookupDiagnostics.length, 1);
    assert.equal(lookupDiagnostics[0].reason, reason);
    assert.equal(lookupDiagnostics[0].page, 1);
    assert.equal(lookupDiagnostics[0].recordCount, response.records.length);
    assert(!JSON.stringify(lookupDiagnostics).includes("PRIVATE_"));
    assert(!JSON.stringify(lookupDiagnostics).includes("cached-test-token"));
    assert(Object.values(lookupDiagnostics[0]).every(value => value === null
      || typeof value === "number" || typeof value === "boolean"
      || value === reason || value === typeof response.total));
  }
  assert.equal(lookupDiagnostics[0].reason, "repeated_record_id");
  lookupDiagnostics.length = 0; searchCalls = [];
  pages = Array.from({ length: 7 }, (_, page) => ({ total: 650,
    records: Array.from({ length: 100 }, (_, i) => searchRow(`page-${page}-${i}`, "other")) }));
  await assert.rejects(lookup("wanted"), error => error.statusCode === 503);
  assert.equal(lookupDiagnostics[0].reason, "count_exceeds_total");
  assert.equal(lookupDiagnostics[0].page, 7);
  assert.equal(lookupDiagnostics[0].seenCount, 600);
  searchCalls = []; pages = [{ records: [], total: "PRIVATE_PROVIDER_VALUE" }];
  endpoint.console.warn = () => { throw new Error("Logging unavailable"); };
  await assert.rejects(lookup("wanted"), error => error.statusCode === 503);
  endpoint.console.warn = (label, value) => lookupDiagnostics.push(JSON.parse(value));
  for (const statusCode of [401, 403, 422, 500]) {
    searchCalls = [];
    pages = [Object.assign(new Error("Provider rejected lookup"), { statusCode })];
    await assert.rejects(lookup("wanted"), error => error.statusCode === statusCode);
    assert.equal(searchCalls.length, 1, "Provider failures never fall back to an unsafe create");
  }
  searchCalls = [];
  assert.equal(await lookup(""), null);
  assert.equal(searchCalls.length, 0);
  endpoint.searchProvider = async ({ body }) => {
    assert.equal(body.pageLimit, 1);
    assert.equal(body.filters[0].field, "source_record_id");
    return { records: [searchRow("legacy-existing", "legacy")] };
  };
  vm.runInContext("ghlFetch = (...args) => searchProvider(...args);", endpoint);
  assert.equal((await endpoint.module.exports.findDuplicate({ sourceRecordId: "legacy" })).id,
    "legacy-existing", "Non-Partner lookup behavior remains unchanged");

  // Exercise the real strict lookup inside both sequential race saves, not a
  // mocked duplicate decision. Existing finish locks and confirmations still apply.
  const races = fixture();
  const savedProviderRecords = [];
  let providerCreates = 0;
  endpoint.searchProvider = async ({ body }) => {
    assert.equal(body.filters, undefined);
    return { records: savedProviderRecords, total: savedProviderRecords.length };
  };
  vm.runInContext("ghlFetch = (...args) => searchProvider(...args);", endpoint);
  const saveWithLookup = async () => {
    const duplicate = await lookup(races.result.sourceRecordId);
    if (duplicate) throw Object.assign(new Error("Already saved"), { statusCode: 409 });
    providerCreates++;
    const record = searchRow(`saved-${providerCreates}`, races.result.sourceRecordId);
    savedProviderRecords.push(record);
    return { success: true, recordId: record.id, sourceRecordId: races.result.sourceRecordId };
  };
  await savePartnerMeetResult(races.deps, races.result, saveWithLookup);
  assert.equal((await savePartnerMeetResult(races.deps, races.result, saveWithLookup)).alreadySaved, true);
  races.finish.id = "girls-finish"; races.result.partnerFinishRecordId = "girls-finish";
  races.finish.raceEvent = "5K"; races.result.event = "5K";
  await savePartnerMeetResult(races.deps, races.result, saveWithLookup);
  assert.equal(providerCreates, 2, "Different-distance races each save exactly once");
  const blockedRace = fixture();
  endpoint.searchProvider = async () => ({ records: [], total: 1 });
  await assert.rejects(savePartnerMeetResult(blockedRace.deps, blockedRace.result, async () => {
    await lookup(blockedRace.result.sourceRecordId); providerCreates++;
  }), /incomplete/);
  assert.equal(providerCreates, 2, "Incomplete duplicate reads cannot create a provider record");
  await assert.rejects(savePartnerMeetResult(blockedRace.deps, blockedRace.result, saveWithLookup), /interrupted save/);

  const liveRecords = [];
  const liveRequests = [];
  const realEndpoint = { module: { exports: {} }, require: endpoint.require,
    fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      liveRequests.push({ url, body });
      assert.equal(options.headers.Authorization, "Bearer test-token");
      assert(options.headers.Version);
      assert.equal(options.method, "POST");
      assert.equal(body.locationId, "test-location");
      if (url.endsWith("/records/search")) {
        assert.equal(body.filters, undefined);
        return { ok: true, text: async () => JSON.stringify({ records: liveRecords, total: liveRecords.length }) };
      }
      assert(url.endsWith("/objects/custom_objects.meet_results/records"));
      const record = { id: `created-${liveRecords.length}`, properties: body.properties };
      liveRecords.push(record);
      return { ok: true, text: async () => JSON.stringify(record) };
    } };
  vm.createContext(realEndpoint);
  vm.runInContext(fs.readFileSync("api/ghl/meet-result.js", "utf8") + `
    findOrCreateContact = async () => ({ id: "athlete-one" });
    findObjectRecord = async () => null;
    findAthleteBestRecord = async () => ({ record: null });
    addMeetResultNote = async () => {};
    upsertSeasonRecord = async () => ({});
    upsertAthleteBest = async () => ({});
    module.exports.normalize = normalizeMeetResult;
    module.exports.save = saveSingleMeetResult;
  `, realEndpoint);
  const actualRaces = fixture();
  for (const [index, event] of [[0, "5K"], [1, "2 Mile"]]) {
    actualRaces.finish.id = `finish-${index}`;
    actualRaces.finish.raceEvent = event;
    actualRaces.result = realEndpoint.module.exports.normalize({ ...actualRaces.result,
      partnerFinishRecordId: actualRaces.finish.id, event, meetDate: "2026-10-03", resultDisplay: "15:00.0" });
    const saveActual = () => realEndpoint.module.exports.save({ token: "test-token", locationId: "test-location", meetResult: actualRaces.result });
    assert.equal((await savePartnerMeetResult(actualRaces.deps, actualRaces.result, saveActual)).success, true);
    assert.equal(liveRecords[index].properties.event, event);
    assert.equal(liveRecords[index].properties.source_record_id, actualRaces.result.sourceRecordId);
    assert.equal((await savePartnerMeetResult(actualRaces.deps, actualRaces.result, saveActual)).alreadySaved, true);
    await assert.rejects(saveActual(), error => error.statusCode === 409);
    assert.equal(liveRecords.length, index + 1, "Actual save rejects existing provider duplicates");
  }
  assert.equal(liveRecords.length, 2, "5K boys then 2 Mile girls each reach the real result-create path");

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
