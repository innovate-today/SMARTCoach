const assert = require("assert");
const { acquireAccountScopedLock } = require("../lib/account-registry");

(async () => {
  const previousUrl = process.env.SMARTCOACH_REGISTRY_REST_URL;
  const previousToken = process.env.SMARTCOACH_REGISTRY_REST_TOKEN;
  const previousFetch = global.fetch;
  process.env.SMARTCOACH_REGISTRY_REST_URL = "https://registry.example";
  process.env.SMARTCOACH_REGISTRY_REST_TOKEN = "test-token";
  const commands = [];
  let attempts = 0;

  global.fetch = async (url) => {
    const parts = String(url).replace("https://registry.example/", "").split("/").map(decodeURIComponent);
    commands.push(parts);
    if (parts[0] === "set") {
      attempts += 1;
      return { ok: true, status: 200, text: async () => JSON.stringify({ result: attempts === 1 ? null : "OK" }) };
    }
    if (parts[0] === "eval") return { ok: true, status: 200, text: async () => JSON.stringify({ result: 1 }) };
    throw new Error(`Unexpected registry command: ${parts[0]}`);
  };

  try {
    const release = await acquireAccountScopedLock("school-one", "powertrak", { waitMs: 5000, retryMs: 10, ttlMs: 2000 });
    assert.strictEqual(attempts, 2);
    assert.strictEqual(commands[1][0], "set");
    assert.match(commands[1][1], /school-one:powertrak:lock$/);
    assert.strictEqual(commands[1][3], "nx");
    assert.strictEqual(commands[1][4], "px");
    assert.strictEqual(commands[1][5], "2000");
    await release();
    await release();
    const releases = commands.filter((parts) => parts[0] === "eval");
    assert.strictEqual(releases.length, 1);
    assert.match(releases[0][1], /redis\.call\('get'/);
    assert.strictEqual(releases[0][3], commands[1][1]);
    assert.strictEqual(releases[0][4], commands[1][2]);

    global.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ result: null }) });
    await assert.rejects(
      () => acquireAccountScopedLock("school-one", "powertrak", { waitMs: 25, retryMs: 10, ttlMs: 2000 }),
      (error) => error.statusCode === 503 && error.code === "POWER_TRAK_BUSY" && /retry automatically/.test(error.message),
    );
    console.log("Account scoped mutation lock tests passed");
  } finally {
    global.fetch = previousFetch;
    if (previousUrl == null) delete process.env.SMARTCOACH_REGISTRY_REST_URL;
    else process.env.SMARTCOACH_REGISTRY_REST_URL = previousUrl;
    if (previousToken == null) delete process.env.SMARTCOACH_REGISTRY_REST_TOKEN;
    else process.env.SMARTCOACH_REGISTRY_REST_TOKEN = previousToken;
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
