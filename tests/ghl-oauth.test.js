const assert = require("assert/strict");
const fs = require("fs");
const vm = require("vm");
const { createGhlOAuth, APP_ID, CALLBACK_PATH } = require("../lib/ghl-oauth");

function fixture() {
  let time = 1000000;
  const records = new Map();
  const locks = new Set();
  const calls = [];
  const accounts = new Map();
  let provider;
  let response = {
    access_token: "private-access", refresh_token: "private-refresh", token_type: "Bearer",
    userType: "Company", companyId: "agency-one", scope: "oauth.write locations.readonly", expires_in: 86400,
  };
  const env = {
    SMARTCOACH_ADMIN_SETUP_CODE: "private-admin",
    SMARTCOACH_GHL_OAUTH_CLIENT_ID: `${APP_ID}-client`, SMARTCOACH_GHL_OAUTH_CLIENT_SECRET: "private-client-secret",
    SMARTCOACH_GHL_OAUTH_COMPANY_ID: "agency-one", SMARTCOACH_GHL_OAUTH_ENCRYPTION_KEY: Buffer.alloc(32, 4).toString("base64"),
    SMARTCOACH_GHL_OAUTH_SCOPES: "oauth.write locations.readonly",
    SMARTCOACH_GHL_OAUTH_REDIRECT_URI: `https://app.smartcoach-pro.com${CALLBACK_PATH}`,
    SMARTCOACH_GHL_OAUTH_INSTALL_URL: `https://marketplace.gohighlevel.com/oauth/chooselocation?client_id=${APP_ID}-client`,
  };
  const registry = {
    registryConfigured: () => true,
    loadAccountRecord: async (key) => ({ found: accounts.has(key), record: accounts.get(key) }),
    loadAccountScopedRecord: async (account, namespace) => ({ record: records.get(namespace) }),
    saveAccountScopedRecord: async (account, namespace, record) => {
      assert.equal(account, "ghlconnector");
      records.set(namespace, structuredClone(record));
      return { saved: true };
    },
    acquireAccountScopedLock: async (account, namespace) => {
      assert(!locks.has(namespace), "lock must exclude overlapping mutations");
      locks.add(namespace);
      return async () => locks.delete(namespace);
    },
  };
  const api = createGhlOAuth({ env, registry, now: () => time, fetch: async (url, options) => {
    calls.push({ url, options });
    if (new URL(url).pathname === "/oauth/token") assert(locks.has("oauthgrant"));
    else if (provider) return { ok: true, json: async () => provider(url, options) };
    if (response instanceof Error) throw response;
    return { ok: true, json: async () => structuredClone(response) };
  } });
  const request = (method = "POST") => ({ method, headers: { "x-smartcoach-setup-code": "private-admin", origin: "https://app.smartcoach-pro.com" }, query: {} });
  const invoke = async (route, req) => {
    const res = { headers: {}, statusCode: 200, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; return this; }, end(value) { this.body = value; return this; } };
    await api.handle(route, req, res);
    assert.equal(res.headers["Cache-Control"], "no-store");
    return res;
  };
  const start = () => invoke("ghl-oauth-start", request());
  const callbackReq = (started) => {
    const req = request("GET");
    req.query = { state: new URL(started.body.authorizationUrl).searchParams.get("state"), code: "private-code" };
    req.headers.cookie = started.headers["Set-Cookie"].split(";")[0];
    return req;
  };
  return { api, env, records, accounts, calls, request, invoke, start, callbackReq, setProvider: (value) => { provider = value; }, setResponse: (value) => { response = value; }, grant: () => structuredClone(response), advance: (ms) => { time += ms; } };
}

async function run() {
  const f = fixture();
  const unauth = f.request();
  delete unauth.headers["x-smartcoach-setup-code"];
  unauth.query.setupCode = "private-admin";
  assert.equal((await f.invoke("ghl-oauth-start", unauth)).statusCode, 403);
  const badOrigin = f.request();
  badOrigin.headers.origin = "https://other.example";
  assert.equal((await f.invoke("ghl-oauth-start", badOrigin)).statusCode, 403);
  assert.equal((await f.invoke("ghl-oauth-start", f.request("GET"))).statusCode, 405);
  const started = await f.start();
  assert.equal(started.statusCode, 200);
  assert.match(started.headers["Set-Cookie"], /Secure; HttpOnly; SameSite=Lax/);
  const cb = f.callbackReq(started);
  const noCookie = { ...cb, headers: {} };
  assert.equal((await f.invoke("crm-connect-callback", noCookie)).statusCode, 400);
  assert.equal(f.calls.length, 0);
  const saved = await f.invoke("crm-connect-callback", cb);
  assert.equal(saved.statusCode, 200);
  const serialized = JSON.stringify([...f.records.values()]);
  for (const secret of ["private-access", "private-refresh", "private-client-secret", "private-code", cb.query.state]) assert(!serialized.includes(secret));
  assert.equal((await f.invoke("crm-connect-callback", cb)).statusCode, 400);
  assert.equal(f.calls.length, 1);
  const status = await f.invoke("ghl-oauth-status", f.request("GET"));
  assert.equal(status.body.connected, true);
  assert.equal(status.body.buyerProvisioningVerified, false);
  assert(!JSON.stringify(status).includes("private-access"));
  assert.equal((await f.api.agencyGrant()).access_token, "private-access");
  assert.equal(f.calls.length, 1);
  f.advance(86400 * 1000);
  f.setResponse({ ...f.grant(), access_token: "renewed-access", refresh_token: "renewed-refresh" });
  assert.equal((await f.api.agencyGrant()).access_token, "renewed-access");
  assert.equal(new URLSearchParams(f.calls[1].options.body).get("grant_type"), "refresh_token");
  assert.equal(new URLSearchParams(f.calls[1].options.body).get("refresh_token"), "private-refresh");
  assert.equal(f.records.get("oauthgrant").status, "connected");
  f.advance(86400 * 1000);
  f.setResponse(new Error("private-provider-error"));
  await assert.rejects(f.api.agencyGrant(), /token exchange failed/);
  assert.equal(f.records.get("oauthgrant").status, "reauthorization_required");
  const count = f.calls.length;
  await assert.rejects(f.api.agencyGrant(), /authorized again/);
  assert.equal(f.calls.length, count);

  for (const change of [{ companyId: "another-agency" }, { userType: "Location", locationId: "buyer" }, { appId: "wrong-app" }, { scope: "locations.readonly" }, { scope: "oauth.write locations.readonly users.write" }, { expires_in: 0 }, { approveAllLocations: true }, { installToFutureLocations: true }]) {
    const bad = fixture();
    bad.setResponse({ ...bad.grant(), ...change });
    const pending = await bad.start();
    assert.equal((await bad.invoke("crm-connect-callback", bad.callbackReq(pending))).statusCode, 403);
    assert(!bad.records.has("oauthgrant"));
  }
  const expired = fixture();
  const pending = await expired.start();
  expired.advance(600001);
  assert.equal((await expired.invoke("crm-connect-callback", expired.callbackReq(pending))).statusCode, 400);
  assert.equal(expired.calls.length, 0);
  const missing = fixture();
  delete missing.env.SMARTCOACH_ADMIN_SETUP_CODE;
  assert.equal((await missing.start()).statusCode, 403);
  const misconfigured = fixture();
  misconfigured.env.SMARTCOACH_GHL_OAUTH_ENCRYPTION_KEY = "bad";
  assert.equal((await misconfigured.start()).statusCode, 503);
  for (const path of ["/oauth/chooselocation", "/v2/oauth/chooselocation"]) {
    const official = fixture();
    official.env.SMARTCOACH_GHL_OAUTH_INSTALL_URL = `https://marketplace.gohighlevel.com${path}?client_id=${APP_ID}-client`;
    const result = await official.start();
    assert.equal(result.statusCode, 200);
    assert.equal(new URL(result.body.authorizationUrl).pathname, path);
  }
  for (const url of ["https://example.com/v2/oauth/chooselocation", "https://marketplace.gohighlevel.com/v3/oauth/chooselocation", "https://marketplace.gohighlevel.com/v2/oauth/chooselocation/extra"]) {
    const invalid = fixture();
    invalid.env.SMARTCOACH_GHL_OAUTH_INSTALL_URL = `${url}?client_id=${APP_ID}-client`;
    assert.equal((await invalid.start()).statusCode, 503);
  }
  const noRegistry = createGhlOAuth({ env: fixture().env, registry: { registryConfigured: () => false } });
  await assert.rejects(noRegistry.agencyGrant(), /registry is required/);
  const tampered = fixture();
  const tamperedStart = await tampered.start();
  await tampered.invoke("crm-connect-callback", tampered.callbackReq(tamperedStart));
  tampered.records.get("oauthgrant").encrypted.tag = Buffer.alloc(16).toString("base64");
  await assert.rejects(tampered.api.agencyGrant(), /authorized again/);

  const locationId = "AbCdEfGhIjKlMnOpQrSt";
  const accountKey = `sc-${locationId.toLowerCase()}`;
  for (const mode of ["valid", "wrong-install", "future-install", "wrong-token", "extra-scope", "wrong-agency", "wrong-contact", "wrong-mapping", "seller", "no-admin", "wrong-origin"]) {
    const buyer = fixture();
    const auth = await buyer.start();
    await buyer.invoke("crm-connect-callback", buyer.callbackReq(auth));
    buyer.accounts.set(accountKey, { locationId: mode === "wrong-mapping" ? "wrong" : locationId, token: "existing-pit" });
    buyer.setProvider((url) => {
      const path = new URL(url).pathname;
      if (path === "/oauth/installed-locations") return { items: [{ _id: locationId, isInstalled: mode !== "wrong-install" }], installToFutureLocations: mode === "future-install" };
      if (path === "/oauth/location-token") return { access_token: "private-buyer-access", refresh_token: "private-buyer-refresh", token_type: "Bearer", expires_in: 86400, scope: mode === "extra-scope" ? "locations.readonly users.write" : "locations.readonly", locationId: mode === "wrong-token" ? "another-buyer" : locationId, appId: APP_ID };
      if (path === `/locations/${locationId}`) return { location: { id: locationId, companyId: mode === "wrong-agency" ? "another-agency" : "agency-one" } };
      if (path === "/contacts/") return { contacts: [{ locationId: mode === "wrong-contact" ? "another-buyer" : locationId }] };
      return {};
    });
    const req = buyer.request();
    req.body = { accountKey, locationId };
    if (mode === "seller") req.body = { accountKey: "sc-qxwjweksyuf7sdofhpb4", locationId: "QxwjWekSyUf7sDOFHPB4" };
    if (mode === "no-admin") delete req.headers["x-smartcoach-setup-code"];
    if (mode === "wrong-origin") req.headers.origin = "https://attacker.example";
    const verified = await buyer.invoke("ghl-oauth-verify-buyer", req);
    assert.equal(verified.statusCode, mode === "valid" ? 200 : ["wrong-mapping", "seller"].includes(mode) ? 422 : 403, mode);
    assert.equal(buyer.accounts.get(accountKey).token, "existing-pit");
    assert(!JSON.stringify(verified.body).includes("private-buyer"));
    assert(!JSON.stringify([...buyer.records.values()]).includes("private-buyer"));
    if (mode === "valid") {
      assert.equal(verified.body.buyerProvisioningVerified, false);
      await buyer.api.buyerGrant(accountKey, locationId);
      assert.equal(buyer.calls.filter((c) => new URL(c.url).pathname === "/oauth/location-token").length, 1);
      buyer.advance(86300 * 1000);
      await buyer.api.buyerGrant(accountKey, locationId);
      assert.equal(buyer.calls.filter((c) => new URL(c.url).pathname === "/oauth/location-token").length, 2);
      buyer.setProvider(() => ({ items: [] }));
      await assert.rejects(buyer.api.buyerGrant(accountKey, locationId), /installation was not verified/);
    }
  }

  const page = fs.readFileSync("onboarding.html", "utf8");
  const connectionCode = page.slice(page.indexOf("async function highLevelConnectionRequest("), page.indexOf("function generateSetup(){"));
  const nodes = { setupCode: { value: "" }, ghlOAuthConnectBtn: { disabled: false }, ghlOAuthStatusBtn: { disabled: false } };
  const pageCalls = [], navigations = [], statuses = [];
  let pageResponse = { authorizationUrl: "https://marketplace.gohighlevel.com/oauth/chooselocation?state=test" };
  const context = vm.createContext({ URL, document: { getElementById: (id) => nodes[id] }, window: { location: { assign: (url) => navigations.push(url) } }, setStatus: (...args) => statuses.push(args), fetch: async (url, options) => { pageCalls.push({ url, options }); return { ok: true, json: async () => pageResponse }; } });
  vm.runInContext(connectionCode, context);
  await context.connectHighLevelAgency();
  assert.equal(pageCalls.length, 0);
  assert.match(statuses.pop()[0], /Setup Code/);
  nodes.setupCode.value = "private-admin";
  await context.connectHighLevelAgency();
  assert.equal(pageCalls[0].options.method, "POST");
  assert.equal(pageCalls[0].options.credentials, "same-origin");
  assert.equal(pageCalls[0].options.headers["X-SMARTCoach-Setup-Code"], "private-admin");
  assert(!pageCalls[0].url.includes("private-admin"));
  assert.equal(navigations.length, 1);
  pageResponse = { authorizationUrl: "https://marketplace.gohighlevel.com/v2/oauth/chooselocation?state=test" };
  await context.connectHighLevelAgency();
  assert.equal(navigations.length, 2);
  pageResponse = { authorizationUrl: "https://attacker.example/oauth" };
  await context.connectHighLevelAgency();
  assert.equal(navigations.length, 2);
  pageResponse = { authorizationUrl: "https://marketplace.gohighlevel.com/v3/oauth/chooselocation?state=test" };
  await context.connectHighLevelAgency();
  assert.equal(navigations.length, 2);
  assert.equal(nodes.ghlOAuthConnectBtn.disabled, false);
  pageResponse = { connected: true };
  await context.checkHighLevelConnection();
  assert.match(statuses.pop()[0], /not yet verified/);
  console.log("HighLevel OAuth security and renewal tests passed");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
