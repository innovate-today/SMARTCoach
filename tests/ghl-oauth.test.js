const assert = require("assert/strict");
const fs = require("fs");
const vm = require("vm");
const crypto = require("crypto");
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
    saveAccountRecord: async (key, record) => { accounts.set(key, structuredClone(record)); return { saved: true }; },
    loadAccountScopedRecord: async (account, namespace) => ({ record: records.get(namespace) }),
    saveAccountScopedRecord: async (account, namespace, record) => {
      assert.equal(account, "ghlconnector");
      records.set(namespace, { ...structuredClone(record), accountKey: account });
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
  for (const mode of ["valid", "wrong-location", "wrong-company", "not-v2", "missing-price", "unknown-status", "no-admin", "wrong-origin", "provider-error"]) {
    const check = fixture();
    const auth = await check.start();
    await check.invoke("crm-connect-callback", check.callbackReq(auth));
    const original = { locationId, productPlan: "pro100", token: "existing-pit", subscription: { status: "active" }, coachStaff: [{ id: "keep-staff" }] };
    check.accounts.set(accountKey, structuredClone(original));
    check.setProvider((url, options) => {
      if (mode === "provider-error") throw new Error("private-provider-response");
      const parsed = new URL(url);
      assert.equal(parsed.pathname, `/saas/get-saas-subscription/${locationId}`);
      assert.equal(parsed.searchParams.get("companyId"), "agency-one");
      assert.equal(options.method, undefined);
      return { locationId: mode === "wrong-location" ? "another" : locationId,
        companyId: mode === "wrong-company" ? "another" : "agency-one", isSaaSV2: mode !== "not-v2",
        subscriptionStatus: mode === "unknown-status" ? "unknown" : "trialing",
        subscriptionId: "sub_verified", customerId: "cus_verified", productId: "prod_verified",
        priceId: mode === "missing-price" ? "" : "price_verified", saasPlanId: "plan_verified", access_token: "never-return-me" };
    });
    const req = check.request();
    req.body = { accountKey, locationId };
    if (mode === "no-admin") delete req.headers["x-smartcoach-setup-code"];
    if (mode === "wrong-origin") req.headers.origin = "https://other.example";
    const result = await check.invoke("ghl-oauth-check-subscription", req);
    assert.equal(result.statusCode, mode === "valid" ? 200 : mode === "provider-error" ? 502 : ["missing-price", "unknown-status"].includes(mode) ? 422 : 403);
    assert.deepEqual(check.accounts.get(accountKey), original);
    if (mode === "valid") {
      assert.equal(result.body.providerSubscriptionStatus, "trialing");
      assert.equal(result.body.savedSubscriptionStatus, "active");
      assert.equal(result.body.purchaseVerified, false);
      assert.equal(result.body.automaticFulfillmentReady, false);
      assert.equal(result.body.buyerSetupUnchanged, true);
    }
    assert(!JSON.stringify(result).includes("never-return-me"));
    assert(!JSON.stringify(result).includes("private-provider-response"));
    if (["no-admin", "wrong-origin"].includes(mode)) assert.equal(check.calls.length, 1);
  }
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
      assert.equal(buyer.records.get(`buyergrant-${locationId}`).accountKey, "ghlconnector");
      assert.equal(buyer.records.get(`buyergrant-${locationId}`).buyerAccountKey, accountKey);
      await buyer.api.readConsumerGrant(accountKey, locationId);
      await buyer.api.buyerGrant(accountKey, locationId);
      assert.equal(buyer.calls.filter((c) => new URL(c.url).pathname === "/oauth/location-token").length, 1);
      buyer.advance(86300 * 1000);
      await buyer.api.buyerGrant(accountKey, locationId);
      assert.equal(buyer.calls.filter((c) => new URL(c.url).pathname === "/oauth/location-token").length, 2);
      delete buyer.records.get(`buyergrant-${locationId}`).buyerAccountKey;
      await buyer.api.readConsumerGrant(accountKey, locationId);
      assert.equal(buyer.calls.filter((c) => new URL(c.url).pathname === "/oauth/location-token").length, 3);
      assert.equal(buyer.records.get(`buyergrant-${locationId}`).buyerAccountKey, accountKey);
      buyer.records.get(`buyergrant-${locationId}`).buyerAccountKey = "another-buyer";
      await assert.rejects(buyer.api.readConsumerGrant(accountKey, locationId), /Verify buyer OAuth/);
      buyer.records.get(`buyergrant-${locationId}`).buyerAccountKey = accountKey;
      buyer.setProvider(() => ({ items: [] }));
      await assert.rejects(buyer.api.buyerGrant(accountKey, locationId), /installation was not verified/);
    }
  }

  for (const mode of ["create", "update", "conflict", "duplicates", "wrong-location", "bad-readback", "missing-scope", "no-admin", "wrong-origin", "wrong-mapping", "seller", "get", "not-verified"]) {
    const writer = fixture();
    writer.env.SMARTCOACH_GHL_OAUTH_SCOPES = "oauth.write locations.readonly locations/customValues.write";
    writer.setResponse({ ...writer.grant(), scope: writer.env.SMARTCOACH_GHL_OAUTH_SCOPES });
    const pending = await writer.start();
    await writer.invoke("crm-connect-callback", writer.callbackReq(pending));
    writer.accounts.set(accountKey, { locationId, token: "existing-pit", productPlan: "pro100" });
    let writes = 0;
    let values = mode === "create" ? [] : [{ id: "value-id", name: "account_key", value: mode === "conflict" ? "other-account" : accountKey, locationId: mode === "wrong-location" ? "other-location" : locationId }];
    if (mode === "duplicates") values.push({ ...values[0], id: "duplicate" });
    writer.setProvider((url, options) => {
      const path = new URL(url).pathname;
      if (path === "/oauth/installed-locations") return { items: [{ _id: locationId, isInstalled: true }] };
      if (path === "/oauth/location-token") return { access_token: "private-write-token", token_type: "Bearer", expires_in: 86400, scope: "locations.readonly locations/customValues.write", locationId };
      if (path === `/locations/${locationId}`) return { location: { id: locationId, companyId: "agency-one" } };
      if (path === "/contacts/") return { contacts: [] };
      if (path.startsWith(`/locations/${locationId}/customValues`)) {
        if (options.method === "POST" || options.method === "PUT") {
          writes++;
          assert.equal(options.headers.Authorization, "Bearer private-write-token");
          assert.equal(options.method, mode === "create" ? "POST" : "PUT");
          assert.deepEqual(JSON.parse(options.body), { name: "account_key", value: accountKey });
          values = [{ id: "value-id", name: "account_key", value: mode === "bad-readback" ? "not-saved" : accountKey, locationId }];
          return { customValue: values[0] };
        }
        return { customValues: values };
      }
      return {};
    });
    const req = writer.request();
    req.body = { accountKey, locationId };
    if (mode !== "not-verified") assert.equal((await writer.invoke("ghl-oauth-verify-buyer", req)).statusCode, 200);
    if (mode === "missing-scope") writer.env.SMARTCOACH_GHL_OAUTH_SCOPES = "oauth.write locations.readonly";
    if (mode === "no-admin") delete req.headers["x-smartcoach-setup-code"];
    if (mode === "wrong-origin") req.headers.origin = "https://attacker.example";
    if (mode === "wrong-mapping") writer.accounts.get(accountKey).locationId = "other-location";
    if (mode === "seller") req.body = { accountKey: "sc-qxwjweksyuf7sdofhpb4", locationId: "QxwjWekSyUf7sDOFHPB4" };
    if (mode === "get") req.method = "GET";
    const result = await writer.invoke("ghl-oauth-verify-write", req);
    const success = ["create", "update"].includes(mode);
    assert.equal(result.statusCode, success ? 200 : mode === "bad-readback" ? 502 : ["conflict", "duplicates", "wrong-location"].includes(mode) ? 409 : ["wrong-mapping", "seller"].includes(mode) ? 422 : mode === "get" ? 405 : mode === "not-verified" ? 503 : 403, mode);
    assert.equal(writes, success || mode === "bad-readback" ? 1 : 0, mode);
    if (success) assert.equal(result.body.accountKeyWriteVerified, true);
    assert.equal(writer.accounts.get(accountKey).token, "existing-pit");
    assert.equal(writer.accounts.get(accountKey).productPlan, "pro100");
    assert(!JSON.stringify(result).includes("private-write-token"));
  }

  const sellerLocationId = "QxwjWekSyUf7sDOFHPB4";
  for (const mode of ["existing", "create", "wrong-contact", "duplicates", "no-email", "no-code", "no-admin", "wrong-origin", "failed-send", "missing-message", "wrong-mapping", "get", "missing-seller-token", "missing-from", "wrong-from", "wrong-seller", "wrong-seller-agency", "old-buyer-sender", "corrected", "wrong-correction", "uncertain-correction", "failed-correction"]) {
    const welcome = fixture();
    welcome.env.SMARTCOACH_WELCOME_SELLER_TOKEN = "private-seller-token";
    welcome.env.SMARTCOACH_WELCOME_FROM_EMAIL = "info@smartcoach-pro.com";
    const locationScopes = "locations.readonly contacts.readonly contacts.write conversations/message.write";
    welcome.env.SMARTCOACH_GHL_OAUTH_SCOPES = `oauth.write ${locationScopes}`;
    welcome.setResponse({ ...welcome.grant(), scope: welcome.env.SMARTCOACH_GHL_OAUTH_SCOPES });
    const pending = await welcome.start();
    await welcome.invoke("crm-connect-callback", welcome.callbackReq(pending));
    welcome.accounts.set(accountKey, { locationId, token: "existing-pit", accountOwnerEmail: mode === "no-email" ? "" : "support@example.com", coachAccessCodes: mode === "no-code" ? [] : ["private-coach-code"] });
    const owner = { id: "owner-id", locationId: mode === "wrong-contact" ? locationId : sellerLocationId, email: "support@example.com" };
    let sends = 0, creates = 0;
    welcome.setProvider((url, options) => {
      const path = new URL(url).pathname;
      if (path === "/oauth/installed-locations") return { items: [{ _id: locationId, isInstalled: true }] };
      if (path === "/oauth/location-token") return { access_token: "private-welcome-token", token_type: "Bearer", expires_in: 86400, scope: locationScopes, locationId };
      if (path === `/locations/${locationId}`) return { location: { id: locationId, companyId: "agency-one" } };
      if (path === `/locations/${sellerLocationId}`) {
        assert.equal(options.headers.Authorization, "Bearer private-seller-token");
        return { location: { id: mode === "wrong-seller" ? locationId : sellerLocationId, companyId: mode === "wrong-seller-agency" ? "another-agency" : "agency-one" } };
      }
      if (path === "/contacts/") {
        if (options.method === "POST") {
          assert.equal(options.headers.Authorization, "Bearer private-seller-token");
          assert.equal(JSON.parse(options.body).locationId, sellerLocationId);
          creates++; return { contact: owner };
        }
        if (new URL(url).searchParams.has("query")) {
          assert.equal(options.headers.Authorization, "Bearer private-seller-token");
          assert.equal(new URL(url).searchParams.get("locationId"), sellerLocationId);
        }
        // The initial read probe need not contain the owner.
        return { contacts: new URL(url).searchParams.has("query") ? mode === "create" ? [] : mode === "duplicates" ? [owner, owner] : [owner] : [] };
      }
      if (path === "/conversations/messages") {
        sends++;
        assert.equal(options.headers.Authorization, "Bearer private-seller-token");
        const email = JSON.parse(options.body);
        assert.equal(email.emailTo, "support@example.com");
        assert.equal(email.contactId, "owner-id");
        assert.equal(email.emailFrom, "info@smartcoach-pro.com");
        assert(email.html.includes(`/overview.html?account=${accountKey}`));
        assert(!email.html.includes("private-coach-code"));
        assert(email.html.includes("separate <strong>SMARTCoach Access</strong> email"));
        assert(email.html.includes("If you have not received it, contact support before trying to sign in."));
        assert(email.html.includes("Account &gt; Staff Access"));
        assert(email.html.includes("phone-app setup instructions"));
        assert(!email.html.includes("existing coach access code"));
        if (["failed-send", "failed-correction"].includes(mode)) throw new Error("private-provider-error");
        return mode === "missing-message" ? {} : { messageId: "welcome-message" };
      }
      return {};
    });
    const req = welcome.request(); req.body = { accountKey, locationId, expectedOwnerEmail: "support@example.com" };
    assert.equal((await welcome.invoke("ghl-oauth-verify-buyer", req)).statusCode, 200);
    if (mode === "existing") {
      const preview = await welcome.invoke("ghl-oauth-send-welcome", { ...req, body: { accountKey, locationId, preview: true } });
      assert.equal(preview.body.ownerEmail, "support@example.com");
      assert.equal(sends, 0); assert.equal(creates, 0);
      assert.equal((await welcome.invoke("ghl-oauth-send-welcome", { ...req, body: { ...req.body, expectedOwnerEmail: "wrong@example.com" } })).statusCode, 409);
      assert.equal(sends, 0);
      welcome.accounts.get(accountKey).accountOwnerContactId = "old-contact";
      const before = structuredClone(welcome.accounts.get(accountKey));
      const correction = { ...req, body: { ...req.body, ownerEmail: "approved@example.com" } };
      assert.equal((await welcome.invoke("ghl-oauth-update-owner-email", { ...correction, headers: {} })).statusCode, 403);
      assert.equal((await welcome.invoke("ghl-oauth-update-owner-email", { ...correction, headers: { ...req.headers, origin: "https://attacker.example" } })).statusCode, 403);
      assert.equal((await welcome.invoke("ghl-oauth-update-owner-email", { ...correction, body: { ...correction.body, expectedOwnerEmail: "wrong@example.com" } })).statusCode, 409);
      assert.equal((await welcome.invoke("ghl-oauth-update-owner-email", { ...correction, body: { ...correction.body, ownerEmail: "invalid" } })).statusCode, 422);
      assert.equal((await welcome.invoke("ghl-oauth-update-owner-email", { ...correction, body: { ...correction.body, locationId: "wrong" } })).statusCode, 422);
      assert.deepEqual(welcome.accounts.get(accountKey), before);
      assert.equal((await welcome.invoke("ghl-oauth-update-owner-email", correction)).statusCode, 200);
      const expected = { ...before, accountOwnerEmail: "approved@example.com" };
      delete expected.accountOwnerContactId;
      assert.deepEqual(welcome.accounts.get(accountKey), expected);
      assert.equal(sends, 0); assert.equal(creates, 0);
      assert.equal((await welcome.invoke("ghl-oauth-update-owner-email", { ...correction, body: { ...correction.body, expectedOwnerEmail: "approved@example.com", ownerEmail: "support@example.com" } })).statusCode, 200);
    }
    if (mode === "no-admin") delete req.headers["x-smartcoach-setup-code"];
    if (mode === "wrong-origin") req.headers.origin = "https://attacker.example";
    if (mode === "wrong-mapping") welcome.accounts.get(accountKey).locationId = "other-location";
    if (mode === "get") req.method = "GET";
    if (mode === "missing-seller-token") delete welcome.env.SMARTCOACH_WELCOME_SELLER_TOKEN;
    if (mode === "missing-from") delete welcome.env.SMARTCOACH_WELCOME_FROM_EMAIL;
    if (mode === "wrong-from") welcome.env.SMARTCOACH_WELCOME_FROM_EMAIL = "sender@buyer.example.com";
    const legacy = { buyerAccountKey: accountKey, ownerEmail: "support@example.com", status: mode === "uncertain-correction" ? "attempted" : "accepted", messageId: "old-buyer-message" };
    if (["old-buyer-sender", "corrected", "wrong-correction", "uncertain-correction", "failed-correction"].includes(mode)) {
      welcome.records.set(`buyerwelcome-${locationId}`, legacy);
      const preview = await welcome.invoke("ghl-oauth-send-welcome", { ...req, body: { ...req.body, preview: true } });
      assert.equal(preview.body.sellerCorrectionRequired, true);
      assert.equal(preview.body.previousMessageId, legacy.messageId);
      assert.equal(sends, 0);
      if (mode !== "old-buyer-sender") Object.assign(req.body, { confirmSellerCorrection: true, expectedPreviousMessageId: mode === "wrong-correction" ? "wrong-message" : legacy.messageId });
    }
    const sent = await welcome.invoke("ghl-oauth-send-welcome", req);
    const success = ["existing", "create", "corrected"].includes(mode);
    assert.equal(sent.statusCode, success ? 200 : ["no-email", "no-code", "wrong-mapping"].includes(mode) ? 422 : ["duplicates", "old-buyer-sender", "wrong-correction", "uncertain-correction"].includes(mode) ? 409 : ["failed-send", "missing-message", "failed-correction"].includes(mode) ? 502 : ["missing-seller-token", "missing-from", "wrong-from"].includes(mode) ? 503 : mode === "get" ? 405 : 403, mode);
    assert.equal(sends, success || ["failed-send", "missing-message", "failed-correction"].includes(mode) ? 1 : 0, mode);
    if (["corrected", "failed-correction"].includes(mode)) assert.deepEqual(welcome.records.get(`buyerwelcome-${locationId}`).priorDelivery, legacy);
    assert.equal(creates, mode === "create" ? 1 : 0);
    assert.equal(welcome.accounts.get(accountKey).token, "existing-pit");
    assert(!JSON.stringify(sent).includes("private-welcome-token"));
    assert(!JSON.stringify(sent).includes("private-seller-token"));
    assert(!JSON.stringify(sent).includes("private-provider-error"));
    if (sends) {
      const again = await welcome.invoke("ghl-oauth-send-welcome", req);
      assert.equal(again.statusCode, success ? 200 : 409);
      assert.equal(sends, 1, "Do not duplicate accepted or uncertain sends");
      if (success) {
        assert.equal(sent.body.deliveryVerified, false);
        assert.equal(again.body.alreadyAccepted, true);
        assert.equal((await welcome.invoke("ghl-oauth-update-owner-email", { ...req, body: { ...req.body, ownerEmail: "another@example.com" } })).statusCode, 409);
        welcome.accounts.get(accountKey).accountOwnerEmail = "changed@example.com";
        assert.equal((await welcome.invoke("ghl-oauth-send-welcome", req)).statusCode, 409);
        assert.equal(sends, 1);
      }
    }
  }

  for (const mode of ["success", "no-admin", "wrong-origin", "no-confirm", "wrong-owner", "wrong-plan", "staff-exists", "not-ready", "essential", "blocked", "inactive", "wrong-seller", "wrong-contact", "failed-send", "missing-message", "save-failed"]) {
    const access = fixture();
    access.env.SMARTCOACH_WELCOME_SELLER_TOKEN = "private-seller-token";
    access.env.SMARTCOACH_WELCOME_FROM_EMAIL = "info@smartcoach-pro.com";
    access.env.SMARTCOACH_GHL_OAUTH_SCOPES = "oauth.write locations.readonly contacts.readonly";
    access.setResponse({ ...access.grant(), scope: access.env.SMARTCOACH_GHL_OAUTH_SCOPES });
    const pending = await access.start();
    await access.invoke("crm-connect-callback", access.callbackReq(pending));
    const original = { locationId, token: "existing-pit", accountOwnerEmail: "support@example.com", productPlan: "pro100",
      subscription: { status: "active" }, accessStatus: "active", coachAccessCodes: ["shared-old-code"], coachCodeVersion: 7, coachStaff: [] };
    access.accounts.set(accountKey, structuredClone(original));
    let sends = 0, sentCode = "", sentInvite = "";
    access.setProvider((url, options) => {
      const path = new URL(url).pathname;
      if (path === "/oauth/installed-locations") return { items: [{ _id: locationId, isInstalled: true }] };
      if (path === "/oauth/location-token") return { access_token: "private-buyer-token", token_type: "Bearer", expires_in: 86400, scope: "locations.readonly contacts.readonly", locationId };
      if (path === `/locations/${locationId}`) return { location: { id: locationId, companyId: "agency-one" } };
      if (path === `/locations/${sellerLocationId}`) {
        assert.equal(options.headers.Authorization, "Bearer private-seller-token");
        return { location: { id: mode === "wrong-seller" ? locationId : sellerLocationId, companyId: "agency-one" } };
      }
      if (path === "/contacts/") return { contacts: new URL(url).searchParams.has("query") ? [{ id: "owner", email: "support@example.com", locationId: mode === "wrong-contact" ? locationId : sellerLocationId }] : [] };
      if (path === "/conversations/messages") {
        sends++;
        assert.equal(options.headers.Authorization, "Bearer private-seller-token");
        const email = JSON.parse(options.body);
        assert.equal(email.emailFrom, "info@smartcoach-pro.com");
        assert.equal(email.emailTo, "support@example.com");
        assert.equal(email.subject, "SMARTCoach Access");
        const savedStaff = access.accounts.get(accountKey).coachStaff[0];
        sentCode = email.html.match(/personal SMARTCoach code is:<\/p><p><br><\/p><p>([A-Z2-9]{8})<\/p>/)[1];
        sentInvite = savedStaff.inviteToken;
        assert.equal(savedStaff.coachCodeHash, crypto.createHash("sha256").update(`private-admin:staff:${accountKey}:${sentCode}`).digest("hex"));
        assert(email.html.includes(`/overview.html?account=${accountKey}&amp;invite=${sentInvite}`));
        for (const line of ["iPhone", "Android", "Safari, not Chrome", "Add to Home Screen", "Full Access"]) assert(email.html.includes(line));
        assert(!email.html.includes("shared-old-code"));
        if (mode === "failed-send") throw new Error("private-provider-error");
        return mode === "missing-message" ? {} : { messageId: "access-message" };
      }
      return {};
    });
    const req = access.request(); req.body = { accountKey, locationId, coachName: "Marcus Moore", confirmCreate: true, expectedOwnerEmail: "support@example.com", expectedProductPlan: "pro100" };
    assert.equal((await access.invoke("ghl-oauth-verify-buyer", req)).statusCode, 200);
    if (mode === "no-admin") delete req.headers["x-smartcoach-setup-code"];
    if (mode === "wrong-origin") req.headers.origin = "https://other.example";
    if (mode === "no-confirm") delete req.body.confirmCreate;
    if (mode === "wrong-owner") req.body.expectedOwnerEmail = "other@example.com";
    if (mode === "wrong-plan") req.body.expectedProductPlan = "pro25";
    const current = access.accounts.get(accountKey);
    if (mode === "staff-exists") current.coachStaff = [{ name: "Existing Coach", coachCodeHash: "unchanged" }];
    if (mode === "not-ready") current.coachAccessCodes = [];
    if (mode === "essential") current.productPlan = "essential";
    if (mode === "blocked") current.subscription.status = "canceled";
    if (mode === "inactive") current.accessStatus = "inactive";
    if (mode === "save-failed") {
      // Simulate a storage failure without letting the provider see unsaved access.
      access.accounts.set = () => { throw new Error("private-storage-error"); };
    }
    if (mode === "success") {
      const preview = await access.invoke("ghl-oauth-create-head-coach", { ...req, body: { ...req.body, preview: true } });
      assert.equal(preview.statusCode, 200); assert.equal(preview.body.existingStaff, false);
      assert.equal(sends, 0); assert.deepEqual(current, original);
    }
    const result = await access.invoke("ghl-oauth-create-head-coach", req);
    assert.equal(result.statusCode, mode === "success" ? 200 : ["no-admin", "wrong-origin", "wrong-seller", "wrong-contact"].includes(mode) ? 403 : ["failed-send", "missing-message"].includes(mode) ? 502 : mode === "save-failed" ? 503 : 409, mode);
    assert.equal(sends, ["success", "failed-send", "missing-message"].includes(mode) ? 1 : 0, mode);
    const record = access.accounts.get(accountKey);
    assert.equal(record.token, "existing-pit"); assert.deepEqual(record.coachAccessCodes, mode === "not-ready" ? [] : ["shared-old-code"]); assert.equal(record.coachCodeVersion, 7);
    for (const secret of [sentCode, sentInvite, "private-buyer-token", "private-seller-token", "private-provider-error"].filter(Boolean)) assert(!JSON.stringify(result).includes(secret));
    if (sentCode) assert(!JSON.stringify([...access.records.values(), record]).includes(sentCode));
    if (["success", "failed-send", "missing-message", "save-failed"].includes(mode)) {
      const again = await access.invoke("ghl-oauth-create-head-coach", req);
      assert.equal(again.statusCode, mode === "success" ? 200 : 409);
      assert.equal(sends, mode === "save-failed" ? 0 : 1);
      if (mode === "success") assert.equal(again.body.alreadyAccepted, true);
    }
  }

  const inviteBoot = fs.readFileSync("overview.html", "utf8").split("  var invite=new URLSearchParams(location.search).get('invite');")[1].split("})();")[0];
  for (const mode of ["accepted", "rejected", "no-invite"]) {
    let cleaned = "", loaded = 0, accessShown = false;
    const saved = new Map(), requests = [];
    const context = { URL, URLSearchParams, key: accountKey, document: { title: "Overview" },
      location: { search: mode === "no-invite" ? `?account=${accountKey}` : `?account=${accountKey}&invite=private-invite`, href: `https://app.smartcoach-pro.com/overview.html?account=${accountKey}&invite=private-invite` },
      history: { replaceState: (_state, _title, url) => { cleaned = url; } },
      localStorage: { setItem: (key, value) => saved.set(key, value), removeItem: () => {} },
      request: async (_path, options) => { requests.push(JSON.parse(options.body)); if (mode === "rejected") throw new Error("Invalid invite"); return { sessionToken: "private-session" }; },
      load: () => loaded++, showAccess: () => { accessShown = true; } };
    vm.runInNewContext("var invite=new URLSearchParams(location.search).get('invite');" + inviteBoot, context);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(loaded, mode === "rejected" ? 0 : 1);
    assert.equal(accessShown, mode === "rejected");
    if (mode !== "no-invite") { assert(!cleaned.includes("invite=")); assert.equal(requests[0].accountKey, accountKey); }
    if (mode === "accepted") assert.equal(saved.get(`sc_session_remembered_${accountKey}`), "private-session");
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
  Object.assign(nodes, { buyerHeadCoachName: { value: "" }, ghlOAuthHeadCoachBtn: { disabled: false }, accountKey: { value: accountKey }, locationId: { value: locationId } });
  const beforeCreate = pageCalls.length;
  await context.createHighLevelHeadCoach();
  assert.equal(pageCalls.length, beforeCreate);
  nodes.buyerHeadCoachName.value = "Marcus Moore";
  pageResponse = { ownerEmail: "support@example.com", productPlan: "pro100", coachName: "Marcus Moore", emailFrom: "info@smartcoach-pro.com" };
  context.window.confirm = (message) => { assert(message.includes("Marcus Moore")); assert(message.includes("support@example.com")); assert(message.includes("info@smartcoach-pro.com")); return false; };
  await context.createHighLevelHeadCoach();
  assert.equal(pageCalls.length, beforeCreate + 1, "Cancel must stop before creating credentials");
  context.window.confirm = () => true;
  await context.createHighLevelHeadCoach();
  const createBody = JSON.parse(pageCalls.at(-1).options.body);
  assert.equal(createBody.confirmCreate, true); assert.equal(createBody.expectedProductPlan, "pro100");
  assert.equal(createBody.expectedOwnerEmail, "support@example.com");
  assert.equal(nodes.ghlOAuthHeadCoachBtn.disabled, false);
  console.log("HighLevel OAuth security and renewal tests passed");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
