const assert = require("node:assert/strict");
const { ensureBuyerSchoolName } = require("../lib/buyer-school-name");

function fixture() {
  const buyer = { locationId: "P2Pf8bmdItOfIOijTVBv", accountKey: "sc-p2pf8bmditofioijtvbv" };
  const evidence = { ...buyer, schoolName: "Sandy High", coachName: "Marty Dirt", ownerEmail: "buyer@example.com",
    subscriptionId: "subscription", checkoutFingerprint: "checkout", purchaseVerified: true, pendingCheckoutMatched: true };
  let location = { id: buyer.locationId, companyId: "agency", name: "Marty Dirt's Account", email: evidence.ownerEmail };
  let record = null, writes = 0;
  const deps = { companyId: "agency", now: () => 100,
    readLocation: async () => structuredClone(location),
    writeName: async name => { writes++; location.name = name; },
    load: async () => structuredClone(record),
    save: async value => { record = { ...structuredClone(value), accountKey: "storage", updatedAt: "storage-owned" }; } };
  return { buyer, evidence, deps, location, get record() { return record; }, get writes() { return writes; } };
}

(async () => {
  const f = fixture();
  assert.equal((await ensureBuyerSchoolName(f.deps, f.buyer, f.evidence)).nameUpdated, true);
  assert.equal(f.location.name, "Sandy High");
  assert.equal(f.record.status, "confirmed");
  assert.equal(f.writes, 1);
  assert.equal((await ensureBuyerSchoolName(f.deps, f.buyer, f.evidence)).alreadyConfirmed, true);
  assert.equal(f.writes, 1);
  f.location.name = "Coach-chosen name";
  await assert.rejects(ensureBuyerSchoolName(f.deps, f.buyer, f.evidence), /Confirmed school name has changed/);
  assert.equal(f.writes, 1);

  for (const name of ["Sandy High", "Coach-chosen name"]) {
    const custom = fixture(); custom.location.name = name;
    const result = await ensureBuyerSchoolName(custom.deps, custom.buyer, custom.evidence);
    assert.equal(name === "Sandy High" ? result.alreadyNamed : result.customNamePreserved, true);
    assert.equal(custom.writes, 0); assert.equal(custom.record, null);
  }
  for (const change of [
    f => { f.evidence.purchaseVerified = false; },
    f => { f.evidence.pendingCheckoutMatched = false; },
    f => { f.evidence.locationId = "other"; },
    f => { f.evidence.schoolName = ""; },
    f => { f.location.id = "other"; },
    f => { f.location.companyId = "other"; },
    f => { f.location.email = "other@example.com"; },
    f => { f.location.name = ""; },
    f => { f.buyer.locationId = "QxwjWekSyUf7sDOFHPB4"; f.buyer.accountKey = "sc-qxwjweksyuf7sdofhpb4"; Object.assign(f.evidence, f.buyer); },
  ]) {
    const invalid = fixture(); change(invalid);
    await assert.rejects(ensureBuyerSchoolName(invalid.deps, invalid.buyer, invalid.evidence));
    assert.equal(invalid.writes, 0); assert.equal(invalid.record, null);
  }
  const stale = fixture();
  stale.deps.writeName = async () => { throw new Error("uncertain provider response"); };
  await assert.rejects(ensureBuyerSchoolName(stale.deps, stale.buyer, stale.evidence), /uncertain/);
  assert.equal(stale.record.status, "attempted");
  stale.deps.writeName = async () => assert.fail("Must not replay attempted writes");
  await assert.rejects(ensureBuyerSchoolName(stale.deps, stale.buyer, stale.evidence), /already attempted/);

  const delayed = fixture();
  delayed.deps.writeName = async () => {};
  await assert.rejects(ensureBuyerSchoolName(delayed.deps, delayed.buyer, delayed.evidence), /provider readback failed/);
  assert.equal(delayed.record.status, "attempted");
  await assert.rejects(ensureBuyerSchoolName(delayed.deps, delayed.buyer, delayed.evidence), /already attempted/);

  const race = fixture();
  const save = race.deps.save;
  race.deps.save = async record => { await save(record); race.location.name = "Changed by coach"; };
  await assert.rejects(ensureBuyerSchoolName(race.deps, race.buyer, race.evidence), /changed before/);
  assert.equal(race.writes, 0);
  const intentFailure = fixture(); intentFailure.deps.save = async () => {};
  await assert.rejects(ensureBuyerSchoolName(intentFailure.deps, intentFailure.buyer, intentFailure.evidence), /intent readback/);
  assert.equal(intentFailure.writes, 0);
  const conflict = fixture();
  await ensureBuyerSchoolName(conflict.deps, conflict.buyer, conflict.evidence);
  conflict.evidence.schoolName = "Other School";
  await assert.rejects(ensureBuyerSchoolName(conflict.deps, conflict.buyer, conflict.evidence), /history conflicts/);
  assert.equal(conflict.writes, 1);
  console.log("buyer school name tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
