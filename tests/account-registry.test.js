const assert = require("assert");
const {
  registryConfigured,
  registryHealth,
  saveAccountRecord,
  loadAccountRecord,
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

(async () => {
  await testVercelKvAliases();
  await testUpstashAliasesAndCustomPrefix();
  console.log("account registry alias tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
