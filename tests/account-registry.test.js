const assert = require("assert");
const {
  registryConfigured,
  registryHealth,
  saveAccountRecord,
  loadAccountRecord,
  saveAttendanceRecords,
  loadAttendanceRecords,
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
      const compactAccountSet = sets.filter((entry) => entry.key === "smartcoach:account:attendanceschool").slice(-1)[0];
      const compactAccount = JSON.parse(compactAccountSet.value);
      assert.deepStrictEqual(compactAccount.attendanceMirror, []);
      assert.ok(Array.from(store.keys()).some((key) => key.includes(":attendance:item:")));
    });
  } finally {
    global.fetch = previousFetch;
  }
}

async function testCoachDeviceUsageCountsAppDevicesOnly() {
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
      await recordCoachDeviceSession("device-school", { deviceId: "desktop_1", deviceLabel: "Mac Safari", userAgent: "Macintosh" });
      await recordCoachDeviceSession("device-school", { deviceId: "app_1", deviceLabel: "iPhone Safari", deviceSource: "app", coachName: "Moore" });
      await recordCoachDeviceSession("device-school", { deviceId: "app_2", deviceLabel: "iPad Safari", deviceSource: "app" });

      const usage = await loadCoachDeviceUsage("device-school");
      assert.strictEqual(usage.activeDevices, 2);
      assert.strictEqual(usage.devicesSeenThisWeek, 2);
      assert.strictEqual(usage.unassignedDevices, 1);
      assert.deepStrictEqual(usage.devices.map((device) => device.deviceId).sort(), ["app_1", "app_2"]);
    });
  } finally {
    global.fetch = previousFetch;
  }
}

(async () => {
  await testVercelKvAliases();
  await testUpstashAliasesAndCustomPrefix();
  await testSchoolRecordsMirrorManifestFallback();
  await testAttendanceMirrorItemizedStorage();
  await testCoachDeviceUsageCountsAppDevicesOnly();
  console.log("account registry alias tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
