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

  (config.headers || []).forEach((entry) => {
    if (!requiredSources.has(entry.source)) return;
    const headers = {};
    (entry.headers || []).forEach((header) => {
      headers[String(header.key || "").toLowerCase()] = String(header.value || "");
    });
    Object.entries(requiredHeaders).forEach(([key, pattern]) => {
      assert.match(headers[key] || "", pattern, `${entry.source} missing ${key}`);
    });
    requiredSources.delete(entry.source);
  });

  assert.strictEqual(requiredSources.size, 0, `Missing Vercel header sources: ${[...requiredSources].join(", ")}`);
}

(async () => {
  await testApiSecurityHeaders();
  testVercelHtmlSecurityHeaders();
  console.log("security header tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
