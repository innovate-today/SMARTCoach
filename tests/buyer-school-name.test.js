const assert = require("node:assert/strict");
const { ensureBuyerSchoolName } = require("../lib/buyer-school-name");

function fixture(options = {}) {
  const buyer = { locationId: "P2Pf8bmdItOfIOijTVBv", accountKey: "sc-p2pf8bmditofioijtvbv" };
  const evidence = { ...buyer, schoolName: "Sandy High", coachName: "Marty Dirt", ownerEmail: "buyer@example.com",
    subscriptionId: "subscription", checkoutFingerprint: "checkout", purchaseVerified: true, pendingCheckoutMatched: true };
  let location = { id: buyer.locationId, companyId: "agency", name: "Marty Dirt's Account", email: evidence.ownerEmail };
  let record = null, writes = 0, saves = 0, reads = 0;
  const waits = [];
  const deps = { companyId: "agency", now: () => 100,
    waitForReadback: async ms => { waits.push(ms); },
    readLocation: async () => {
      if (++reads === 3 && options.failWriteReadback) throw new Error("uncertain provider readback");
      return structuredClone(location);
    },
    writeName: async name => { writes++; location.name = name; },
    load: async () => structuredClone(record),
    save: async value => { record = { ...structuredClone(value), accountKey: "storage", updatedAt: `storage-owned-${++saves}` }; } };
  return { buyer, evidence, deps, location, waits, get reads() { return reads; }, get record() { return record; }, get writes() { return writes; } };
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
  assert.deepEqual(delayed.waits, [1000, 2000, 4000]);
  assert.equal(delayed.reads, 6);
  await assert.rejects(ensureBuyerSchoolName(delayed.deps, delayed.buyer, delayed.evidence), /already attempted/);

  for (const staleReads of [1, 3]) {
    const eventually = fixture();
    const read = eventually.deps.readLocation;
    let postWriteReads = 0;
    eventually.deps.readLocation = async () => {
      const location = await read();
      if (eventually.writes && ++postWriteReads <= staleReads) location.name = "Marty Dirt's Account";
      return location;
    };
    assert.equal((await ensureBuyerSchoolName(eventually.deps, eventually.buyer, eventually.evidence)).nameUpdated, true);
    assert.equal(eventually.record.status, "confirmed");
    assert.equal(eventually.writes, 1);
    assert.deepEqual(eventually.waits, [1000, 2000, 4000].slice(0, staleReads));
    await ensureBuyerSchoolName(eventually.deps, eventually.buyer, eventually.evidence);
    assert.equal(eventually.writes, 1);
  }
  for (const field of ["id", "companyId", "email", "name"]) {
    const competing = fixture();
    const read = competing.deps.readLocation;
    let postWriteReads = 0;
    competing.deps.readLocation = async () => {
      const location = await read();
      if (competing.writes && ++postWriteReads === 1) location.name = "Marty Dirt's Account";
      else if (competing.writes) location[field] = "Other coach or account";
      return location;
    };
    await assert.rejects(ensureBuyerSchoolName(competing.deps, competing.buyer, competing.evidence));
    assert.deepEqual(competing.waits, [1000]);
    assert.equal(competing.writes, 1);
    assert.equal(competing.record.status, "attempted");
  }

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

  const applied = fixture();
  let appliedWrites = 0;
  applied.deps.writeName = async name => { appliedWrites++; applied.location.name = name; throw new Error("private response failure"); };
  assert.equal((await ensureBuyerSchoolName(applied.deps, applied.buyer, applied.evidence)).nameUpdated, true);
  assert.equal(applied.record.status, "confirmed");
  assert.equal(applied.record.writeResponseUncertain, true);
  assert(!JSON.stringify(applied.record).includes("private response failure"));
  assert.equal((await ensureBuyerSchoolName(applied.deps, applied.buyer, applied.evidence)).alreadyConfirmed, true);
  assert.equal(appliedWrites, 1);
  for (const [fault, expectedStage] of [
    ["provider-read", "school_provider_readback"], ["identity", "school_identity_readback"],
    ["stale-name", "school_name_readback"], ["save", "school_completion_save"],
    ["confirmation-read", "school_completion_readback"],
  ]) {
    const broken = fixture(); let stage;
    broken.deps.reportStage = value => { stage = value; };
    const read = broken.deps.readLocation, persist = broken.deps.save;
    let reads = 0;
    broken.deps.readLocation = async () => {
      if (++reads >= 3) {
        if (fault === "provider-read") throw new Error("private provider response");
        const location = await read();
        if (fault === "identity") location.companyId = "other";
        if (fault === "stale-name") location.name = "Marty Dirt's Account";
        return location;
      }
      return read();
    };
    broken.deps.save = async record => {
      if (record.status === "confirmed" && fault === "save") throw new Error("private storage response");
      await persist(record);
      if (record.status === "confirmed" && fault === "confirmation-read") broken.record.schoolName = "corrupted";
    };
    await assert.rejects(ensureBuyerSchoolName(broken.deps, broken.buyer, broken.evidence));
    assert.equal(stage, expectedStage, fault);
    assert.equal(broken.writes, 1);
  }
  for (const field of ["id", "companyId", "email"]) {
    const wrongReadback = fixture();
    wrongReadback.deps.writeName = async name => {
      wrongReadback.location.name = name; wrongReadback.location[field] = "other"; throw new Error("uncertain");
    };
    await assert.rejects(ensureBuyerSchoolName(wrongReadback.deps, wrongReadback.buyer, wrongReadback.evidence), /identity does not match/);
    assert.equal(wrongReadback.record.status, "attempted");
    await assert.rejects(ensureBuyerSchoolName(wrongReadback.deps, wrongReadback.buyer, wrongReadback.evidence), /already attempted/);
  }
  const reviewed = fixture({ failWriteReadback: true });
  reviewed.deps.writeName = async name => { reviewed.location.name = name; throw new Error("uncertain response after write"); };
  await assert.rejects(ensureBuyerSchoolName(reviewed.deps, reviewed.buyer, reviewed.evidence), /uncertain/);
  reviewed.deps.writeName = async () => assert.fail("Reviewed readback must never repeat the provider write");
  const original = structuredClone(reviewed.record);
  const preview = await ensureBuyerSchoolName(reviewed.deps, reviewed.buyer, reviewed.evidence, { reviewReadback: true });
  assert.equal(preview.readbackVerified, true);
  assert.equal(preview.providerWritePerformed, false);
  assert.equal(preview.emailSent, false);
  assert.deepEqual(reviewed.record, original);
  assert(!JSON.stringify(preview).includes("beforeName"));
  for (const options of [{}, { confirmReadback: true, expectedFingerprint: "stale" }]) {
    await assert.rejects(ensureBuyerSchoolName(reviewed.deps, reviewed.buyer, reviewed.evidence,
      { reviewReadback: true, dryRun: false, ...options }), /Explicit unchanged/);
    assert.deepEqual(reviewed.record, original);
  }
  for (const change of [
    f => { f.location.name = "Changed name"; },
    f => { f.location.email = "other@example.com"; },
    f => { f.evidence.subscriptionId = "changed"; },
    f => { f.location.companyId = "other"; },
  ]) {
    const invalid = fixture({ failWriteReadback: true });
    invalid.deps.writeName = async name => { invalid.location.name = name; throw new Error("uncertain"); };
    await assert.rejects(ensureBuyerSchoolName(invalid.deps, invalid.buyer, invalid.evidence));
    const before = structuredClone(invalid.record); change(invalid);
    await assert.rejects(ensureBuyerSchoolName(invalid.deps, invalid.buyer, invalid.evidence,
      { reviewReadback: true, dryRun: false, confirmReadback: true, expectedFingerprint: preview.fingerprint }));
    assert.deepEqual(invalid.record, before);
  }
  const confirmed = await ensureBuyerSchoolName(reviewed.deps, reviewed.buyer, reviewed.evidence,
    { reviewReadback: true, dryRun: false, confirmReadback: true, expectedFingerprint: preview.fingerprint });
  assert.equal(confirmed.ledgerConfirmed, true);
  assert.equal(confirmed.providerWritePerformed, false);
  assert.equal(reviewed.record.status, "confirmed");
  assert.equal(reviewed.record.attemptedAt, original.attemptedAt);
  assert.equal(reviewed.record.beforeName, original.beforeName);
  assert.equal(reviewed.record.confirmationSource, "reviewed_provider_readback");
  assert.notEqual(reviewed.record.updatedAt, original.updatedAt);
  assert.equal(reviewed.record.accountKey, original.accountKey);
  await assert.rejects(ensureBuyerSchoolName(reviewed.deps, reviewed.buyer, reviewed.evidence,
    { reviewReadback: true, dryRun: false, confirmReadback: true, expectedFingerprint: preview.fingerprint }), /requires an attempted/);
  assert.equal((await ensureBuyerSchoolName(reviewed.deps, reviewed.buyer, reviewed.evidence)).alreadyConfirmed, true);

  const uncertainSave = fixture({ failWriteReadback: true });
  uncertainSave.deps.writeName = async name => { uncertainSave.location.name = name; throw new Error("uncertain"); };
  await assert.rejects(ensureBuyerSchoolName(uncertainSave.deps, uncertainSave.buyer, uncertainSave.evidence));
  const uncertainPreview = await ensureBuyerSchoolName(uncertainSave.deps, uncertainSave.buyer, uncertainSave.evidence, { reviewReadback: true });
  uncertainSave.deps.save = async () => {};
  await assert.rejects(ensureBuyerSchoolName(uncertainSave.deps, uncertainSave.buyer, uncertainSave.evidence,
    { reviewReadback: true, dryRun: false, confirmReadback: true, expectedFingerprint: uncertainPreview.fingerprint }), /confirmation readback failed/);
  assert.equal(uncertainSave.record.status, "attempted");
  for (const field of ["status", "confirmedAt", "confirmationSource", "fingerprint", "buyerAccountKey", "locationId", "companyId", "schoolName", "attemptedAt", "beforeName", "accountKey"]) {
    const corrupted = fixture({ failWriteReadback: true });
    corrupted.deps.writeName = async name => { corrupted.location.name = name; throw new Error("uncertain"); };
    await assert.rejects(ensureBuyerSchoolName(corrupted.deps, corrupted.buyer, corrupted.evidence));
    const corruptPreview = await ensureBuyerSchoolName(corrupted.deps, corrupted.buyer, corrupted.evidence, { reviewReadback: true });
    const persist = corrupted.deps.save;
    corrupted.deps.save = async value => { await persist(value); corrupted.record[field] = "corrupted"; };
    await assert.rejects(ensureBuyerSchoolName(corrupted.deps, corrupted.buyer, corrupted.evidence,
      { reviewReadback: true, dryRun: false, confirmReadback: true, expectedFingerprint: corruptPreview.fingerprint }), /confirmation readback failed/);
  }
  console.log("buyer school name tests passed");
})().catch(error => { console.error(error); process.exitCode = 1; });
