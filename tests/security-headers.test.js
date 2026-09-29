const assert = require("assert");
const fs = require("fs");
const handler = require("../api/smart-trak/[route]");

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(key, value) {
      this.headers[key.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      return this;
    },
  };
}

async function testApiSecurityHeaders() {
  const res = mockRes();
  await handler({
    method: "GET",
    query: { route: "account-status", account: "security-header-test" },
    headers: {},
  }, res);

  assert.match(res.headers["cache-control"] || "", /no-store/);
  assert.match(res.headers.pragma || "", /no-cache/);
  assert.strictEqual(res.headers.expires, "0");
  assert.strictEqual(res.headers["surrogate-control"], "no-store");
  assert.strictEqual(res.headers["x-content-type-options"], "nosniff");
  assert.strictEqual(res.headers["referrer-policy"], "no-referrer");
}

function testVercelHtmlSecurityHeaders() {
  const config = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
  const publicHtml = new Set(["sales.html"]);
  const privateHtmlSources = fs.readdirSync(".")
    .filter((file) => file.endsWith(".html") && !publicHtml.has(file))
    .map((file) => `/${file}`);
  const requiredSources = new Set(["/", ...privateHtmlSources]);
  const requiredHeaders = {
    "cache-control": /no-store/,
    "x-robots-tag": /noindex/,
    "referrer-policy": /^no-referrer$/,
    "x-content-type-options": /^nosniff$/,
  };

  requiredSources.forEach((source) => {
    const entries = (config.headers || []).filter((entry) => entry.source === source);
    assert.ok(entries.length, `Missing Vercel header source: ${source}`);
    const headers = {};
    entries.forEach((entry) => (entry.headers || []).forEach((header) => {
      headers[String(header.key || "").toLowerCase()] = String(header.value || "");
    }));
    Object.entries(requiredHeaders).forEach(([key, pattern]) => {
      assert.match(headers[key] || "", pattern, `${source} missing ${key}`);
    });
  });
  const powerHeaders = Object.fromEntries((config.headers.find((entry) => entry.source === "/power-trak.html").headers || []).map((header) => [String(header.key).toLowerCase(), String(header.value)]));
  assert.match(powerHeaders["content-security-policy"] || "", /frame-ancestors 'none'/);
  assert.strictEqual(powerHeaders["x-frame-options"], "DENY");
  assert.match(powerHeaders["permissions-policy"] || "", /camera=\(\)/);

  const privateFrameRule = config.headers.find((entry) => entry.source.startsWith("/((?!") && entry.headers.some((header) => header.key === "X-Frame-Options"));
  assert.ok(privateFrameRule, "private pages retain the frame-blocking rule");
  const matchesPrivateRule = new RegExp(`^${privateFrameRule.source}$`);
  for (const board of ["results-board", "miles-board", "speed-board", "xc-records-board", "xc-progression-board"]) {
    const path = `/${board}.html`;
    assert.strictEqual(matchesPrivateRule.test(path), false, `${path} must be embeddable`);
    const boardHeaders = Object.fromEntries((config.headers.find((entry) => entry.source === path).headers || []).map((header) => [String(header.key).toLowerCase(), String(header.value)]));
    assert.ok(boardHeaders["content-security-policy"], `${path} keeps a content security policy`);
    assert.doesNotMatch(boardHeaders["content-security-policy"], /frame-ancestors 'none'/);
    assert.strictEqual(boardHeaders["x-frame-options"], undefined);
  }
  assert.strictEqual(matchesPrivateRule.test("/onboarding.html"), false, "GHL must be able to embed onboarding");
  const onboardingHeaders = Object.fromEntries((config.headers.find((entry) => entry.source === "/onboarding.html").headers || []).map((header) => [String(header.key).toLowerCase(), String(header.value)]));
  assert.strictEqual(onboardingHeaders["x-frame-options"], undefined);
  assert.match(onboardingHeaders["content-security-policy"], /frame-ancestors 'self' https:\/\/app\.gohighlevel\.com https:\/\/app\.msgsndr\.com/);
  assert.match(onboardingHeaders["permissions-policy"], /camera=\(\)/);
  for (const path of ["/dashboard.html", "/overview.html", "/athletes.html", "/api/smart-trak/account-status"]) {
    assert.strictEqual(matchesPrivateRule.test(path), true, `${path} must remain frame-blocked`);
  }
}

(async () => {
  await testApiSecurityHeaders();
  testVercelHtmlSecurityHeaders();
  console.log("security header tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
