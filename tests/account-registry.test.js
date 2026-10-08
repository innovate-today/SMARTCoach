const assert = require("assert");
const fs = require("node:fs");
const vm = require("node:vm");
const { savePartnerMeetResult, verifyPartnerFinish } = require("../lib/partner-meet-result");
const {
  registryConfigured,
  registryHealth,
  saveAccountRecord,
  createAccountRecord,
  loadAccountRecord,
  inspectAccountLocationReferences,
  saveAttendanceRecords,
  loadAttendanceRecords,
  saveKeepTrakNotes,
  loadKeepTrakNotes,
  savePartnerTimingSession,
  loadPartnerTimingSessions,
  mirrorSchoolRecords,
  loadSchoolRecordsMirror,
  schoolRecordsMirrorStatus,
  recordCoachDeviceSession,
  loadCoachDeviceUsage,
} = require("../lib/account-registry");

function withEnv(overrides, fn) {
  const previous = {};
  Object.keys(overrides).forEach((key) => {
    previous[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  });
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      Object.keys(overrides).forEach((key) => {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      });
    });
}

async function testVercelKvAliases() {
  const previousFetch = global.fetch;
  const requests = [];
  let savedRaw = "";
  global.fetch = async (url, options) => {
    requests.push({ url: String(url), auth: options && options.headers && options.headers.Authorization });
    const text = String(url);
    if (text.includes("/ping")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ result: "PONG" }) };
    }
    if (text.includes("/set/")) {
      savedRaw = decodeURIComponent(text.split("/set/")[1].split("/").slice(1).join("/"));
      return { ok: true, status: 200, text: async () => JSON.stringify({ result: "OK" }) };
    }
    if (text.includes("/get/")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ result: savedRaw }) };
    }
    throw new Error(`Unexpected registry call: ${text}`);
  };

  try {
    await withEnv({
      SMARTCOACH_REGISTRY_REST_URL: undefined,
      SMARTCOACH_REGISTRY_REST_TOKEN: undefined,
      KV_REST_API_URL: "https://kv.example/",
      KV_REST_API_TOKEN: "kv-token",
      SMARTCOACH_REGISTRY_PREFIX: undefined,
    }, async () => {
      assert.strictEqual(registryConfigured(), true);

      const health = await registryHealth();
      assert.deepStrictEqual(health, { configured: true, reachable: true });

      const save = await saveAccountRecord("Alias School!", { productPlan: "pro" });
      assert.strictEqual(save.saved, true);
      assert.strictEqual(save.key, "smartcoach:account:aliasschool");

      const loaded = await loadAccountRecord("Alias School!");
      assert.strictEqual(loaded.found, true);
      assert.strictEqual(loaded.record.accountKey, "Alias School!");
      assert.strictEqual(loaded.record.productPlan, "pro");
      assert.ok(loaded.record.updatedAt);
      assert.ok(requests.every((request) => request.auth === "Bearer kv-token"));
      assert.ok(requests.every((request) => request.url.startsWith("https://kv.example/")));
    });
  } finally {
    global.fetch = previousFetch;
  }
}

async function testUpstashAliasesAndCustomPrefix() {
  const previousFetch = global.fetch;
  const requests = [];
  let savedRaw = "";
  global.fetch = async (url, options) => {
    requests.push({ url: String(url), auth: options && options.headers && options.headers.Authorization });
    const text = String(url);
    if (text.includes("/set/")) {
      savedRaw = decodeURIComponent(text.split("/set/")[1].split("/").slice(1).join("/"));
      return { ok: true, status: 200, text: async () => JSON.stringify({ result: "OK" }) };
    }
    if (text.includes("/get/")) {
      return { ok: true, status: 200, text: async () => JSON.stringify({ result: savedRaw }) };
    }
    throw new Error(`Unexpected registry call: ${text}`);
  };

  try {
    await withEnv({
      SMARTCOACH_REGISTRY_REST_URL: undefined,
      SMARTCOACH_REGISTRY_REST_TOKEN: undefined,
      KV_REST_API_URL: undefined,
      KV_REST_API_TOKEN: undefined,
      UPSTASH_REDIS_REST_URL: "https://upstash.example",
      UPSTASH_REDIS_REST_TOKEN: "upstash-token",
      SMARTCOACH_REGISTRY_PREFIX: "test:account:",
    }, async () => {
      assert.strictEqual(registryConfigured(), true);

      const save = await saveAccountRecord("Test School", { productPlan: "pro" });
      assert.strictEqual(save.saved, true);
      assert.strictEqual(save.key, "test:account:testschool");

      const loaded = await loadAccountRecord("Test School");
      assert.strictEqual(loaded.found, true);
      assert.strictEqual(loaded.key, "test:account:testschool");
      assert.strictEqual(loaded.record.productPlan, "pro");
      assert.ok(requests.every((request) => request.auth === "Bearer upstash-token"));
      assert.ok(requests.every((request) => request.url.startsWith("https://upstash.example/")));
      assert.match(requests[0].url, /\/set\/test%3Aaccount%3Atestschool\//);
      assert.match(requests[1].url, /\/get\/test%3Aaccount%3Atestschool$/);
    });
  } finally {
    global.fetch = previousFetch;
  }
}

async function testSchoolRecordsMirrorManifestFallback() {
  const previousFetch = global.fetch;
  const store = {};
  const setMembers = {};
  global.fetch = async (url) => {
    const text = String(url);
    const parts = text.replace("https://registry.example/", "").split("/").map(decodeURIComponent);
    const command = parts[0];
    if (command === "set") {
      store[parts[1]] = parts.slice(2).join("/");
      return { ok: true, status: 200, text: async () => JSON.stringify({ result: "OK" }) };
    }
    if (command === "get") {
      return { ok: true, status: 200, text: async () => JSON.stringify({ result: store[parts[1]] || null }) };
    }
    if (command === "sadd") {
      setMembers[parts[1]] = setMembers[parts[1]] || new Set();
      setMembers[parts[1]].add(parts[2]);
      return { ok: true, status: 200, text: async () => JSON.stringify({ result: 1 }) };
    }
    if (command === "smembers") {
      return { ok: true, status: 200, text: async () => JSON.stringify({ result: [] }) };
    }
    if (command === "scan") {
      return { ok: true, status: 200, text: async () => JSON.stringify({ result: ["0", []] }) };
    }
    throw new Error(`Unexpected registry call: ${text}`);
  };

  try {
    await withEnv({
      SMARTCOACH_REGISTRY_REST_URL: "https://registry.example",
      SMARTCOACH_REGISTRY_REST_TOKEN: "registry-token",
      SMARTCOACH_REGISTRY_PREFIX: undefined,
    }, async () => {
      const records = [
        { recordId: "rec_1", sourceRecordId: "src_1", gender: "Boys", sport: "Track", event: "400m", resultDisplay: "49.50", athleteName: "A Runner", recordDate: "2026-04-01", isCurrent: true },
        { recordId: "rec_2", sourceRecordId: "src_2", gender: "Girls", sport: "Track", event: "400m", resultDisplay: "57.20", athleteName: "B Runner", recordDate: "2026-04-01", isCurrent: true },
        { recordId: "rec_3", sourceRecordId: "src_3", gender: "Boys", sport: "Track", event: "800m", resultDisplay: "1:58.10", athleteName: "C Runner", recordDate: "2026-04-02", isCurrent: true },
        { recordId: "rec_4", sourceRecordId: "src_4", gender: "Girls", sport: "Track", event: "800m", resultDisplay: "2:18.90", athleteName: "D Runner", recordDate: "2026-04-02", isCurrent: true },
      ];

      const saved = await mirrorSchoolRecords("records-school", records);
      assert.strictEqual(saved.saved, true);
      assert.strictEqual(saved.count, 4);

      const loaded = await loadSchoolRecordsMirror("records-school");
      assert.strictEqual(loaded.length, 4);
      assert.deepStrictEqual(loaded.map((item) => item.recordId).sort(), ["rec_1", "rec_2", "rec_3", "rec_4"]);

      const status = await schoolRecordsMirrorStatus("records-school");
      assert.strictEqual(status.indexCount, 0);
      assert.strictEqual(status.scanCount, 0);
      assert.strictEqual(status.manifestCount, 4);
      assert.strictEqual(status.loadCount, 4);
    });
  } finally {
    global.fetch = previousFetch;
  }
}

async function testAttendanceMirrorItemizedStorage() {
  const previousFetch = global.fetch;
  const store = new Map();
  const sets = [];
  global.fetch = async (url, options) => {
    const text = String(url);
    const parts = text.replace("https://registry.example/", "").split("/").map(decodeURIComponent);
    const command = parts[0];
    if (command === "set") {
      const key = parts[1];
      const value = parts.slice(2).join("/");
      store.set(key, value);
      sets.push({ key, value });
      return { ok: true, status: 200, text: async () => JSON.stringify({ result: "OK" }) };
    }
    if (command === "get") {
      return { ok: true, status: 200, text: async () => JSON.stringify({ result: store.get(parts[1]) || "" }) };
    }
    if (command === "sadd") {
      const key = parts[1];
      const set = new Set(JSON.parse(store.get(key) || "[]"));
      parts.slice(2).forEach((item) => set.add(item));
      store.set(key, JSON.stringify(Array.from(set)));
      return { ok: true, status: 200, text: async () => JSON.stringify({ result: 1 }) };
    }
    if (command === "srem") {
      const key = parts[1];
      const set = new Set(JSON.parse(store.get(key) || "[]"));
      parts.slice(2).forEach((item) => set.delete(item));
      store.set(key, JSON.stringify(Array.from(set)));
      return { ok: true, status: 200, text: async () => JSON.stringify({ result: 1 }) };
    }
    if (command === "smembers") {
      return { ok: true, status: 200, text: async () => JSON.stringify({ result: JSON.parse(store.get(parts[1]) || "[]") }) };
    }
    if (command === "del") {
      store.delete(parts[1]);
      return { ok: true, status: 200, text: async () => JSON.stringify({ result: 1 }) };
    }
    if (command === "scan") {
      const matchIndex = parts.indexOf("match");
      const pattern = matchIndex >= 0 ? parts[matchIndex + 1].replace(/\*/g, "") : "";
      const keys = Array.from(store.keys()).filter((key) => key.startsWith(pattern));
      return { ok: true, status: 200, text: async () => JSON.stringify({ result: ["0", keys] }) };
    }
    throw new Error(`Unexpected registry call: ${text}`);
  };

  try {
    await withEnv({
      SMARTCOACH_REGISTRY_REST_URL: "https://registry.example",
      SMARTCOACH_REGISTRY_REST_TOKEN: "registry-token",
      SMARTCOACH_REGISTRY_PREFIX: undefined,
    }, async () => {
      await saveAccountRecord("Attendance School", {
        productPlan: "pro",
        attendanceMirror: [{
          date: "2026-07-08",
          groupId: "cc-team",
          groupName: "CC Team",
          sport: "Cross Country",
          season: "Summer",
          seasonYear: 2026,
          checkpointId: "practice",
          checkpointName: "Practice Start",
          athleteId: "a1",
          athleteName: "Runner One",
          status: "present",
        }],
      });

      const saved = await saveAttendanceRecords("Attendance School", [{
        date: "2026-07-09",
        groupId: "cc-team",
        groupName: "CC Team",
        sport: "Cross Country",
        season: "Summer",
        seasonYear: 2026,
        checkpointId: "practice",
        checkpointName: "Practice Start",
        athleteId: "a2",
        athleteName: "Runner Two",
        status: "late",
      }]);
      assert.strictEqual(saved.saved, true);
      assert.strictEqual(saved.total, 2);

      const loaded = await loadAttendanceRecords("Attendance School", { group: "CC Team" });
      assert.deepStrictEqual(loaded.map((row) => row.athleteName).sort(), ["Runner One", "Runner Two"]);

      const replacementDeleteId = "2026-07-09|cross_country|cross_country|2026|cc-team|practice|a2";
      const edited = await saveAttendanceRecords("Attendance School", [{
        date: "2026-07-09",
        groupId: "cc-team",
        groupName: "CC Team",
        sport: "Cross Country",
        season: "Cross Country",
        seasonYear: 2026,
        checkpointId: "practice",
        checkpointName: "Practice Start",
        athleteId: "a2",
        athleteName: "Runner Two",
        status: "excused",
      }], { deleteIds: [replacementDeleteId] });
      assert.strictEqual(edited.saved, true);

      const loadedAfterEdit = await loadAttendanceRecords("Attendance School", { group: "CC Team" });
      const runnerTwo = loadedAfterEdit.find((row) => row.athleteName === "Runner Two");
      assert.ok(runnerTwo, "same-id attendance edit should not delete the saved row");
      assert.strictEqual(runnerTwo.status, "excused");

      const compactAccountSet = sets.filter((entry) => entry.key === "smartcoach:account:attendanceschool").slice(-1)[0];
      const compactAccount = JSON.parse(compactAccountSet.value);
      assert.deepStrictEqual(compactAccount.attendanceMirror, []);
      assert.ok(Array.from(store.keys()).some((key) => key.includes(":attendance:item:")));
    });
  } finally {
    global.fetch = previousFetch;
  }
}

async function testKeepTrakUsesScopedStorage() {
  const previousFetch = global.fetch;
  const store = new Map();
  const sets = [];
  global.fetch = async (url) => {
    const text = String(url);
    const parts = text.replace("https://registry.example/", "").split("/").map(decodeURIComponent);
    const command = parts[0];
    if (command === "set") {
      const key = parts[1];
      const value = parts.slice(2).join("/");
      store.set(key, value);
      sets.push({ key, value });
      return { ok: true, status: 200, text: async () => JSON.stringify({ result: "OK" }) };
    }
    if (command === "get") {
      return { ok: true, status: 200, text: async () => JSON.stringify({ result: store.get(parts[1]) || "" }) };
    }
    throw new Error(`Unexpected registry call: ${text}`);
  };

  try {
    await withEnv({
      SMARTCOACH_REGISTRY_REST_URL: "https://registry.example",
      SMARTCOACH_REGISTRY_REST_TOKEN: "registry-token",
      SMARTCOACH_REGISTRY_PREFIX: undefined,
    }, async () => {
      const legacyNote = {
        id: "legacy-note",
        date: "2026-08-01",
        body: "Check uniforms",
        completed: false,
      };
      await saveAccountRecord("Keep School", {
        productPlan: "pro",
        keepTrakNotes: [legacyNote],
      });

      const baseKey = "smartcoach:account:keepschool";
      const scopedKey = "smartcoach:account:keepschool:keeptraknotes";
      const fullSetsBefore = sets.filter((entry) => entry.key === baseKey).length;

      const saved = await saveKeepTrakNotes("Keep School", [{
        id: "new-note",
        date: "2026-08-02",
        body: "Bring med kit",
        completed: false,
      }]);
      assert.strictEqual(saved.saved, true);
      assert.strictEqual(saved.total, 2);
      assert.strictEqual(sets.filter((entry) => entry.key === baseKey).length, fullSetsBefore);
      assert.ok(sets.some((entry) => entry.key === scopedKey), "Keep Trak notes should save to scoped storage");

      const loaded = await loadKeepTrakNotes("Keep School", {
        includeArchived: "true",
        start: "2026-08-01",
        end: "2026-08-02",
      });
      assert.deepStrictEqual(loaded.map((note) => note.id).sort(), ["legacy-note", "new-note"]);

      const deleted = await saveKeepTrakNotes("Keep School", [], { deleteIds: ["legacy-note"] });
      assert.strictEqual(deleted.saved, true);
      assert.strictEqual(deleted.deleted, 1);

      const loadedAfterDelete = await loadKeepTrakNotes("Keep School", { includeArchived: "true" });
      assert.deepStrictEqual(loadedAfterDelete.map((note) => note.id), ["new-note"]);
    });
  } finally {
    global.fetch = previousFetch;
  }
}

async function testPartnerTimingUsesScopedStorage() {
  const previousFetch = global.fetch;
  const store = new Map();
  const sets = [];
  global.fetch = async (url) => {
    const text = String(url);
    const parts = text.replace("https://registry.example/", "").split("/").map(decodeURIComponent);
    const command = parts[0];
    if (command === "eval") {
      const key = parts[3], token = parts[4];
      if (store.get(key) === token) store.delete(key);
      return { ok: true, status: 200, text: async () => JSON.stringify({ result: 1 }) };
    }
    if (command === "set") {
      const key = parts[1];
      if (parts[3] === "nx" && store.has(key)) return { ok: true, status: 200, text: async () => JSON.stringify({ result: null }) };
      const value = parts[3] === "nx" ? parts[2] : parts.slice(2).join("/");
      store.set(key, value);
      sets.push({ key, value });
      return { ok: true, status: 200, text: async () => JSON.stringify({ result: "OK" }) };
    }
    if (command === "get") {
      return { ok: true, status: 200, text: async () => JSON.stringify({ result: store.get(parts[1]) || "" }) };
    }
    throw new Error(`Unexpected registry call: ${text}`);
  };

  try {
    await withEnv({
      SMARTCOACH_REGISTRY_REST_URL: "https://registry.example",
      SMARTCOACH_REGISTRY_REST_TOKEN: "registry-token",
      SMARTCOACH_REGISTRY_PREFIX: undefined,
    }, async () => {
      await saveAccountRecord("Partner School", {
        productPlan: "pro",
        partnerTimingSessions: [{
          id: "meet-1",
          meetName: "Blue Invite",
          records: [{
            id: "tap-legacy",
            stationId: "mile-1",
            stationLabel: "Mile 1",
            athleteName: "Hayden Dunn",
            tapAt: "2026-08-21T12:00:00.000Z",
          }],
        }],
      });

      const baseKey = "smartcoach:account:partnerschool";
      const scopedKey = "smartcoach:account:partnerschool:partnertiming";
      const fullSetsBefore = sets.filter((entry) => entry.key === baseKey).length;

      const saved = await savePartnerTimingSession("Partner School", {
        id: "meet-1",
        meetName: "Blue Invite",
        meetDate: "2026-08-21",
        eventName: "2 Mile",
        startAt: "2026-08-21T12:00:00.000Z",
        records: [{
          id: "tap-new",
          stationId: "mile-1",
          stationLabel: "Mile 1",
          athleteName: "Vanessa Dessommes",
          tapAt: "2026-08-21T12:01:00.000Z",
        }],
      });
      assert.strictEqual(saved.saved, true);
      assert.strictEqual(saved.session.records.length, 2);
      assert.strictEqual(sets.filter((entry) => entry.key === baseKey).length, fullSetsBefore);
      assert.ok(sets.some((entry) => entry.key === scopedKey), "Partner Timing should save to scoped storage");

      const loaded = await loadPartnerTimingSessions("Partner School", { id: "meet-1" });
      assert.strictEqual(loaded.length, 1);
      assert.deepStrictEqual(loaded[0].records.map((record) => record.id).sort(), ["tap-legacy", "tap-new"]);
      const newTap = loaded[0].records.find(record => record.id === "tap-new");
      assert.strictEqual(newTap.raceEvent, "2 Mile");
      assert.strictEqual(newTap.raceStartAt, "2026-08-21T12:00:00.000Z");
      const otherDevice = await savePartnerTimingSession("Partner School", {
        id: "meet-1", eventName: "5K", meetName: "Wrong", meetDate: "2026-08-22",
        startAt: "2026-08-21T12:10:00.000Z",
        records: [{ ...newTap, raceEvent: "5K", tapAt: "2026-08-21T12:30:00.000Z" },
          { id: "finish-new", kind: "finish", stationId: "finish", athleteName: "Runner", tapAt: "2026-08-21T12:16:00.000Z" }],
      });
      assert.strictEqual(otherDevice.session.eventName, "2 Mile");
      assert.strictEqual(otherDevice.session.meetName, "Blue Invite");
      assert.strictEqual(otherDevice.session.startAt, saved.session.startAt);
      assert.deepStrictEqual(otherDevice.session.records.find(record => record.id === "tap-new"), newTap);
      assert.strictEqual(otherDevice.session.records.find(record => record.id === "finish-new").raceEvent, "2 Mile");
      const reset = await savePartnerTimingSession("Partner School", {
        id: "meet-1", resetRecords: "reset-new-race", eventName: "5K", meetName: "Blue Invite", meetDate: "2026-08-21",
        startAt: "2026-08-21T13:00:00.000Z", records: [],
      });
      assert.strictEqual(reset.session.eventName, "5K");
      assert.strictEqual(reset.session.records.length, 0);

      const html = fs.readFileSync("index.html", "utf8");
      const elements = { "ms-event": { value: "" }, "ms-event-display": {}, "ms-btn": { style: {} }, "ms-status": { style: {} },
        "ms-wind": { value: "" }, "ms-notes": { value: "" } };
      const runner = { id: 1, name: "Runner", contactId: "runner-one", saved: [] };
      const ui = { CL: { type: "meet", meetName: "Blue Invite", meetDate: "2026-08-21", eventName: "Race",
        name: "Race", season: "Fall", seasonYear: 2026, partnerTiming: { id: "label-later", stations: [], records: [] } },
        document: { getElementById: id => elements[id] }, save() {}, rr() {}, updateMeetBestHints() {},
        normalizeEventLabel: undefined, raceSportMode: () => "xc", meetResultSport: () => "Cross Country", selectedMeetResultType: () => "individual",
        partnerTimingEnabled: () => true, ensurePartnerTiming: () => ui.CL.partnerTiming,
        partnerSelectedStationIds: () => [], selectedMeetRunners: () => [runner], applyPartnerTimingRecordsToRunners() {},
        renderMeetSaveAthletes() {}, updateMeetSaveStates() {}, hasMeetSyncedRuns: () => false, meetRaceAlreadySaved: () => false,
        findAthleteByName: () => null, runnerMeetFlag: () => false,
        meetRunsForSave: () => runner.saved.map((run, index) => ({ run, index })),
        meetGroupDivisionLabel: () => "Open", fmt: () => "15:00.0", splitLabelsForRun: () => [],
        buildMeetSourceRecordId: () => "test-source", markMeetSavedRuns() {}, markMeetRaceSaved() {},
        confirm: () => true, tapFeedback() {}, preserveRaceSummarySnapshot() {}, renderPartnerTimingControls() {},
        partnerTimingSyncTimer: null, syncPartnerTimingSession: () => Promise.resolve(true),
        finishEntryQuickAction() {}, setTimeout() {}, currentSeason: () => ({ season: "Fall", year: 2026 }) };
      vm.createContext(ui);
      vm.runInContext(html.slice(html.indexOf("function normalizeEventLabel("), html.indexOf("function clrLaps("))
        + html.slice(html.indexOf("function eventDistance("), html.indexOf("function runnerPlan("))
        + html.slice(html.indexOf("function meetEventLabels("), html.indexOf("function setSyncMeetEvent("))
        + html.slice(html.indexOf("function partnerTimingPayload("), html.indexOf("function mergePartnerTimingSession("))
        + html.slice(html.indexOf("function resetPartnerTimingRace("), html.indexOf("function recordPartnerStationTap("))
        + html.slice(html.indexOf("function submitCapturedMeetResults("), html.indexOf("function submitCapturedRelayMeetResult(")), ui);
      const endpointSource = fs.readFileSync("api/ghl/meet-result.js", "utf8");
      const normalizer = { clean: value => String(value || "").trim(), displayNameCase: value => value,
        validDate: value => value, truthy: value => !!value,
        httpError: (statusCode, message) => Object.assign(new Error(message), { statusCode }) };
      vm.createContext(normalizer);
      vm.runInContext(endpointSource.slice(endpointSource.indexOf("function normalizeMeetResult("),
        endpointSource.indexOf("function fieldNoMarkResult(")), normalizer);

      let providerWrites = 0;
      ui.CL.runners = [runner];
      for (const [index, entered, expected] of [[0, "2 miles", "2 Mile"], [1, "5km", "5K"]]) {
        const startAt = index ? "2026-08-21T14:00:00.000Z" : "2026-08-21T13:00:00.000Z";
        const finishAt = index ? "2026-08-21T14:15:00.000Z" : "2026-08-21T13:15:00.000Z";
        if (index) ui.resetPartnerTimingRace();
        assert.strictEqual(ui.CL.eventName, "Race", "Reset must not reuse the preceding race distance");
        ui.CL.partnerTiming.startAt = startAt;
        ui.CL.partnerTiming.records = [{ id: `label-finish-${index}`, kind: "finish", stationId: "finish",
          contactId: runner.contactId, athleteName: runner.name, tapAt: finishAt }];
        const capture = { ...ui.partnerTimingPayload(), resetRecords: ui.CL.partnerTiming.resetRecords || "" };
        const unfinalized = await savePartnerTimingSession("Partner School", capture);
        ui.CL.partnerTiming.resetRecords = "";
        runner.saved = [{ ms: 900000, partnerRecordId: `label-finish-${index}` }];
        ui.setMeetSaveEvent(entered);
        assert.strictEqual(ui.CL.eventName, expected);
        assert.strictEqual(ui.eventDistance(expected), index ? 5000 : 3218.69, "Existing unit conversion remains unchanged");
        assert.throws(() => verifyPartnerFinish(unfinalized.session, { resultType: "individual",
          partnerTimingSessionId: capture.id, partnerFinishRecordId: `label-finish-${index}`, event: expected }),
        /Shared race event is Race/, "Reproduce the original record-first/label-later rejection");
        const wire = JSON.parse(JSON.stringify(ui.partnerTimingPayload()));
        assert.strictEqual(wire.eventName, expected);
        const finalized = await savePartnerTimingSession("Partner School", wire);
        assert.strictEqual(finalized.session.records[0].raceEvent, expected);
        assert.strictEqual(finalized.session.records[0].raceStartAt, startAt);
        assert.deepStrictEqual((await savePartnerTimingSession("Partner School", wire)).session.records,
          finalized.session.records, "Repeated sync must not change captured evidence");
        const ledger = new Map();
        const deps = { lock: async () => async () => {},
          loadSession: async id => (await loadPartnerTimingSessions("Partner School", { id }))[0],
          load: async key => ledger.get(key), save: async (key, value) => ledger.set(key, value) };
        let saving;
        ui.saveMeetResultQueue = queue => {
          assert.strictEqual(queue[0].payload.event, expected);
          const payload = JSON.parse(JSON.stringify(queue[0].payload));
          const result = normalizer.normalizeMeetResult(payload);
          assert.strictEqual(result.event, expected);
          saving = savePartnerMeetResult(deps, result, async () => {
            providerWrites++;
            return { success: true, recordId: `saved-${index}` };
          }).then(data => [{ ok: true, data }]);
          return saving;
        };
        ui.submitCapturedMeetResults(false, true);
        await saving;
        assert.strictEqual(providerWrites, index + 1);
        assert.throws(() => normalizer.normalizeMeetResult({ athleteName: "Runner", meetName: "Blue Invite",
          meetDate: "2026-08-21", event: "", resultDisplay: "15:00.0" }), /Event is required/);
        const conflict = await savePartnerTimingSession("Partner School", { ...wire, eventName: index ? "2 Mile" : "5K" });
        assert.strictEqual(conflict.session.eventName, expected, "A real distance must remain immutable");
        assert.throws(() => verifyPartnerFinish(conflict.session, { resultType: "individual",
          partnerTimingSessionId: wire.id, partnerFinishRecordId: runner.saved[0].partnerRecordId,
          event: index ? "2 Mile" : "5K" }), /Shared race event/);
      }
      ui.setMeetSaveEvent("");
      let missingSaveCalls = 0;
      ui.saveMeetResultQueue = () => { missingSaveCalls++; return Promise.resolve([]); };
      ui.submitCapturedMeetResults(false, true);
      assert.strictEqual(missingSaveCalls, 0);
      assert.strictEqual(elements["ms-status"].textContent, "Choose a distance before saving meet results.");
      const unlabeled = await savePartnerTimingSession("Partner School", { id: "still-unlabeled", eventName: "Race",
        meetName: "Blue Invite", meetDate: "2026-08-21", startAt: "2026-08-21T15:00:00.000Z", records: [] });
      const missing = await savePartnerTimingSession("Partner School", { ...unlabeled.session, eventName: "" });
      assert.strictEqual(missing.session.eventName, "Race", "Missing distance cannot finalize a race");
      for (const eventName of ["0m", "-2 Mile", "Race plan", "not a distance"]) {
        const invalid = await savePartnerTimingSession("Partner School", { ...unlabeled.session, eventName });
        assert.strictEqual(invalid.session.eventName, "Race");
      }
      const stale = await savePartnerTimingSession("Partner School", { ...unlabeled.session,
        eventName: "2 Mile", startAt: "2026-08-21T14:00:00.000Z" });
      assert.strictEqual(stale.session.eventName, "Race", "A stale clock cannot label the current race");
      const contenders = await Promise.all(["2 Mile", "5K"].map(eventName =>
        savePartnerTimingSession("Partner School", { ...unlabeled.session, eventName })));
      assert.strictEqual(contenders[0].session.eventName, "2 Mile");
      assert.strictEqual(contenders[1].session.eventName, "2 Mile", "The account lock permits only the first label");

      const unconfirmed = await savePartnerTimingSession("Partner School", { ...unlabeled.session, id: "unconfirmed-label" });
      const read = global.fetch;
      let discardWrite = true;
      global.fetch = async (url, options) => {
        const parts = String(url).replace("https://registry.example/", "").split("/").map(decodeURIComponent);
        if (discardWrite && parts[0] === "set" && parts[1] === scopedKey) {
          discardWrite = false;
          return { ok: true, status: 200, text: async () => JSON.stringify({ result: "OK" }) };
        }
        return read(url, options);
      };
      try {
        await assert.rejects(savePartnerTimingSession("Partner School", { ...unconfirmed.session, eventName: "2 Mile" }),
          error => error.statusCode === 503 && /distance could not be confirmed/.test(error.message));
      } finally {
        global.fetch = read;
      }
    });
  } finally {
    global.fetch = previousFetch;
  }
}

async function testCoachDeviceUsageCountsAuthorizedDevices() {
  const previousFetch = global.fetch;
  const store = {};
  const setMembers = {};
  global.fetch = async (url) => {
    const text = String(url);
    const parts = text.replace("https://registry.example/", "").split("/").map(decodeURIComponent);
    const command = parts[0];
    if (command === "set") {
      store[parts[1]] = parts.slice(2).join("/");
      return { ok: true, status: 200, text: async () => JSON.stringify({ result: "OK" }) };
    }
    if (command === "get") {
      return { ok: true, status: 200, text: async () => JSON.stringify({ result: store[parts[1]] || null }) };
    }
    if (command === "sadd") {
      setMembers[parts[1]] = setMembers[parts[1]] || new Set();
      setMembers[parts[1]].add(parts[2]);
      return { ok: true, status: 200, text: async () => JSON.stringify({ result: 1 }) };
    }
    if (command === "smembers") {
      return { ok: true, status: 200, text: async () => JSON.stringify({ result: Array.from(setMembers[parts[1]] || []) }) };
    }
    throw new Error(`Unexpected registry call: ${text}`);
  };

  try {
    await withEnv({
      SMARTCOACH_REGISTRY_REST_URL: "https://registry.example",
      SMARTCOACH_REGISTRY_REST_TOKEN: "registry-token",
      SMARTCOACH_REGISTRY_PREFIX: undefined,
    }, async () => {
      await recordCoachDeviceSession("device-school", { deviceId: "desktop_1", deviceLabel: "Mac Safari", deviceSource: "desktop", userAgent: "Macintosh" });
      await recordCoachDeviceSession("device-school", { deviceId: "app_1", deviceLabel: "iPhone Safari", deviceSource: "app", coachName: "Moore" });
      await recordCoachDeviceSession("device-school", { deviceId: "app_2", deviceLabel: "iPad Safari", deviceSource: "app" });

      const usage = await loadCoachDeviceUsage("device-school");
      assert.strictEqual(usage.activeDevices, 3);
      assert.strictEqual(usage.devicesSeenThisWeek, 3);
      assert.strictEqual(usage.unassignedDevices, 2);
      assert.deepStrictEqual(usage.devices.map((device) => device.deviceId).sort(), ["app_1", "app_2", "desktop_1"]);
    });
  } finally {
    global.fetch = previousFetch;
  }
}

async function testLocationReferencesReadOnly() {
  const previousFetch = global.fetch;
  const locationId = "AbCdEfGhIjKlMnOpQrSt";
  const prefix = "test:account:";
  try {
    await withEnv({ SMARTCOACH_REGISTRY_REST_URL: "https://registry.example", SMARTCOACH_REGISTRY_REST_TOKEN: "private-token", SMARTCOACH_REGISTRY_PREFIX: prefix }, async () => {
      for (const mode of ["found", "empty", "invalid-scan", "corrupt", "partial", "oversize", "missing"]) {
        let scans = 0;
        const calls = [];
        global.fetch = async (url, options) => {
          const parts = new URL(url).pathname.split("/").slice(1).map(decodeURIComponent);
          calls.push(parts);
          assert.strictEqual(options.method, "POST");
          let result;
          if (parts[0] === "scan") {
            assert.strictEqual(parts[parts.length - 1], "1000");
            scans++;
            result = mode === "invalid-scan" ? "invalid" : [mode === "partial" || scans === 1 && mode === "found" ? "42" : "0",
              mode === "oversize" ? Array.from({ length: 501 }, (_, index) => prefix + index)
                : mode === "empty" || mode === "partial" ? [] : [prefix + "old-school", prefix + "other", prefix + "old-school:records:staff"]];
          } else {
            assert.strictEqual(parts[0], "mget");
            assert(!parts.some(part => part.includes(":records:")));
            result = mode === "missing" ? [] : [mode === "corrupt" ? "invalid-json" : JSON.stringify({ locationId, token: "never-return-token", coachStaff: [{ coachCodeHash: "private-hash" }] }), JSON.stringify({ locationId: "OtherBuyerLocationId" })];
          }
          return { ok: true, text: async () => JSON.stringify({ result }) };
        };
        const reviewed = await inspectAccountLocationReferences(locationId);
        assert.strictEqual(reviewed.complete, ["found", "empty"].includes(mode));
        const expectedReasons = { "invalid-scan": "invalid_scan_response", corrupt: "unreadable_account_record",
          partial: "scan_page_limit_reached", oversize: "account_limit_reached", missing: "invalid_account_batch" };
        assert.strictEqual(reviewed.reason, expectedReasons[mode]);
        if (mode === "found") assert.deepStrictEqual(reviewed.references, ["old-school"]);
        if (mode === "empty") assert.deepStrictEqual(reviewed.references, []);
        if (mode === "partial") {
          assert.strictEqual(scans, 20);
          assert.strictEqual(reviewed.continuation.cursor, "42");
          global.fetch = async (url) => {
            assert(new URL(url).pathname.startsWith('/scan/42/'));
            return { ok: true, text: async () => JSON.stringify({ result: ["0", []] }) };
          };
          const completed = await inspectAccountLocationReferences(locationId, reviewed.continuation);
          assert.strictEqual(completed.complete, true);
          const invalid = await inspectAccountLocationReferences(locationId, { ...reviewed.continuation, prefix: "other:" });
          assert.strictEqual(invalid.reason, "invalid_continuation");
        }
        assert(calls.every(parts => ["scan", "mget"].includes(parts[0])));
        assert(!JSON.stringify(reviewed).includes("never-return-token"));
        assert(!JSON.stringify(reviewed).includes("private-hash"));
      }
    });
  } finally { global.fetch = previousFetch; }
}

async function testCreateOnlyAccountRecord() {
  const previousFetch = global.fetch;
  let saved;
  global.fetch = async url => {
    const parts = new URL(url).pathname.split('/').slice(1).map(decodeURIComponent);
    assert.strictEqual(parts[0], 'set');
    assert.strictEqual(parts[1], 'test:buyer');
    assert.strictEqual(parts[3], 'NX');
    const result = saved ? null : 'OK';
    if (!saved) saved = JSON.parse(parts[2]);
    return { ok: true, text: async () => JSON.stringify({ result }) };
  };
  try {
    await withEnv({ SMARTCOACH_REGISTRY_REST_URL: 'https://registry.example',
      SMARTCOACH_REGISTRY_REST_TOKEN: 'test-token', SMARTCOACH_REGISTRY_PREFIX: 'test:' }, async () => {
      assert.strictEqual((await createAccountRecord('buyer', { schoolName: 'Preserved' })).saved, true);
      assert.strictEqual((await createAccountRecord('buyer', { schoolName: 'Replacement' })).saved, false);
      assert.strictEqual(saved.schoolName, 'Preserved');
      assert.strictEqual(saved.accountKey, 'buyer');
    });
  } finally { global.fetch = previousFetch; }
}

(async () => {
  await testCreateOnlyAccountRecord();
  await testLocationReferencesReadOnly();
  await testVercelKvAliases();
  await testUpstashAliasesAndCustomPrefix();
  await testSchoolRecordsMirrorManifestFallback();
  await testAttendanceMirrorItemizedStorage();
  await testKeepTrakUsesScopedStorage();
  await testPartnerTimingUsesScopedStorage();
  await testCoachDeviceUsageCountsAuthorizedDevices();
  console.log("account registry alias tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
