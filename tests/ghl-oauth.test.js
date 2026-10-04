const assert = require("assert/strict");
const fs = require("fs");
const vm = require("vm");
const crypto = require("crypto");
const { createGhlOAuth, APP_ID, CALLBACK_PATH } = require("../lib/ghl-oauth");
const { verifySaasCatalogPurchase } = require("../lib/saas-purchase");

function fixture(options = {}) {
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
    inspectAccountLocationReferences: async locationId => options.inventory || ({ complete: true,
      references: [...accounts].filter(([, record]) => record.locationId === locationId).map(([key]) => key) }),
    loadAccountRecord: async (key) => ({ found: accounts.has(key), record: accounts.get(key) }),
    saveAccountRecord: async (key, record) => { accounts.set(key, structuredClone(record)); return { saved: true }; },
    createAccountRecord: async (key, record) => {
      if (options.nxRace) accounts.set(key, { locationId: record.locationId, schoolName: "Preserve concurrent account" });
      if (accounts.has(key)) return { saved: false };
      accounts.set(key, { ...structuredClone(record), accountKey: key }); return { saved: true };
    },
    loadAccountScopedRecord: async (account, namespace) => options.corruptHistory && namespace.startsWith("buyeraccess-")
      ? { found: false, error: "private-history-error" } : ({ record: records.get(namespace) }),
    saveAccountScopedRecord: async (account, namespace, record) => {
      assert.equal(account, "ghlconnector");
      if (options.failBuyerGrantSave && namespace.startsWith("buyergrant-")) return { saved: false };
      records.set(namespace, { ...structuredClone(record), accountKey: account });
      return { saved: true };
    },
    acquireAccountScopedLock: async (account, namespace) => {
      assert(!locks.has(namespace), "lock must exclude overlapping mutations");
      locks.add(namespace);
      return async () => locks.delete(namespace);
    },
  };
  const api = createGhlOAuth({ env, registry, fulfillmentExecutionEnabled: options.executionEnabled === true, now: () => time, fetch: async (url, options) => {
    calls.push({ url, options });
    if (new URL(url).pathname === "/oauth/token") assert(locks.has("oauthgrant"));
    else if (provider) {
      const data = provider(url, options);
      if (data?.mockHttpStatus) return { ok: false, status: data.mockHttpStatus, json: async () => data };
      return { ok: true, json: async () => data };
    }
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
  return { api, env, registry, records, accounts, calls, request, invoke, start, callbackReq, setProvider: (value) => { provider = value; }, setResponse: (value) => { response = value; }, grant: () => structuredClone(response), advance: (ms) => { time += ms; } };
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
  const missingCookieResult = await f.invoke("crm-connect-callback", noCookie);
  assert.equal(missingCookieResult.statusCode, 400);
  assert.match(missingCookieResult.body.error, /cookie is missing/);
  const mismatch = { ...cb, headers: { cookie: "__Host-smartcoach-ghl-state=" + "a".repeat(64) } };
  assert.match((await f.invoke("crm-connect-callback", mismatch)).body.error, /does not match/);
  const malformed = { ...cb, query: { ...cb.query, state: "invalid" } };
  assert.match((await f.invoke("crm-connect-callback", malformed)).body.error, /state is invalid/);
  const cookieCheck = f.request();
  cookieCheck.body = { state: cb.query.state };
  cookieCheck.headers.cookie = cb.headers.cookie;
  assert.deepEqual((await f.invoke("ghl-oauth-check-state", cookieCheck)).body, { stateCookieVerified: true });
  assert.equal(f.records.get(`oauthstate-${crypto.createHash("sha256").update(cb.query.state).digest("hex")}`).used, false);
  for (const mode of ["missing", "wrong-origin", "no-admin", "get"]) {
    const rejected = structuredClone(cookieCheck);
    if (mode === "missing") delete rejected.headers.cookie;
    if (mode === "wrong-origin") rejected.headers.origin = "https://other.example";
    if (mode === "no-admin") delete rejected.headers["x-smartcoach-setup-code"];
    if (mode === "get") rejected.method = "GET";
    assert.equal((await f.invoke("ghl-oauth-check-state", rejected)).statusCode, mode === "missing" ? 400 : mode === "get" ? 405 : 403);
  }
  assert.equal(f.calls.length, 0);
  const saved = await f.invoke("crm-connect-callback", cb);
  assert.equal(saved.statusCode, 200);
  const serialized = JSON.stringify([...f.records.values()]);
  for (const secret of ["private-access", "private-refresh", "private-client-secret", "private-code", cb.query.state]) assert(!serialized.includes(secret));
  assert.equal((await f.invoke("crm-connect-callback", cb)).statusCode, 400);
  assert.equal((await f.invoke("ghl-oauth-check-state", cookieCheck)).statusCode, 400);
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
  const expiredCheck = expired.request();
  expiredCheck.body = { state: expired.callbackReq(pending).query.state };
  expiredCheck.headers.cookie = expired.callbackReq(pending).headers.cookie;
  assert.equal((await expired.invoke("ghl-oauth-check-state", expiredCheck)).statusCode, 400);
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
  for (const rawMode of ["recovery-activate-valid", "recovery-activate-metadata", "recovery-activate-no-rollout", "recovery-activate-no-confirm", "recovery-activate-stale", "recovery-activate-existing-access", "recovery-activate-failed-send", "recovery-activate-no-admin", "recovery-activate-wrong-origin", "recovery-activate-wrong-buyer",
    "recovery-valid", "recovery-no-confirm", "recovery-wrong-buyer", "recovery-fields", "recovery-nx-race", "recovery-grant-fail", "recovery-no-admin", "recovery-wrong-origin", "recovery-get", "recovery-existing",
    "valid", "ghl-id", "no-admin", "wrong-origin", "get", "execute", "missing-preview", "seller", "wrong-key", "missing-coach",
    "existing", "race", "missing-scope", "wrong-location", "wrong-agency", "wrong-email", "wrong-subscription",
    "wrong-product", "wrong-amount", "wrong-cadence", "past-due", "bad-catalog", "forbidden", "provider-error",
    "scan-empty", "scan-alt", "scan-env", "scan-env-suffix", "scan-access", "scan-fulfillment", "scan-incomplete", "scan-limit", "scan-resume", "scan-private-reason", "scan-bad-env", "scan-corrupt-history",
    "order-crm-valid", "order-crm-token", "order-crm-scope", "order-crm-contact", "order-crm-fields", "order-crm-schema", "order-crm-no-inventory", "order-crm-missing-install",
    "order-valid", "order-install-missing", "order-install-future", "order-install-ambiguous", "order-usd-lower", "order-currency-other", "order-denied", "order-bad-request", "order-validation", "order-seller", "order-link", "order-email", "order-source", "order-test", "order-product", "order-price", "order-cadence", "order-shape", "order-missing-token"]) {
    const recovery = rawMode.startsWith("recovery-");
    const mode = recovery ? rawMode === "recovery-fields" ? "order-crm-fields" : "order-crm-valid" : rawMode;
    const locationId = recovery ? "tIz08pPpV3nUaS4nKt63" : "AbCdEfGhIjKlMnOpQrSt";
    const accountKey = `sc-${locationId.toLowerCase()}`;
    const ownerEmail = recovery ? "athleticdevelop@yahoo.com" : "buyer@example.com";
    const activation = rawMode.startsWith("recovery-activate-");
    let values = [], sends = 0;
    const review = fixture(["scan-incomplete", "scan-limit", "scan-private-reason"].includes(mode)
      ? { inventory: { complete: false, references: [], reason: mode === "scan-limit" ? "scan_page_limit_reached" : "private-inventory-error" } }
      : { corruptHistory: mode === "scan-corrupt-history", nxRace: rawMode === "recovery-nx-race", failBuyerGrantSave: rawMode === "recovery-grant-fail" });
    review.env.SMARTCOACH_GHL_OAUTH_SCOPES += " saas/company.read";
    if (mode.startsWith("order-")) review.env.SMARTCOACH_GHL_OAUTH_SCOPES += " oauth.readonly";
    if (mode.startsWith("order-crm-")) review.env.SMARTCOACH_GHL_OAUTH_SCOPES += " contacts.readonly contacts.write locations/customFields.readonly locations/customValues.readonly locations/customValues.write objects/record.readonly objects/record.write objects/schema.readonly";
    if (mode.startsWith("order-") && mode !== "order-missing-token") review.env.SMARTCOACH_WELCOME_SELLER_TOKEN = "private-seller-token";
    if (activation) {
      review.env.SMARTCOACH_WELCOME_FROM_EMAIL = "info@smartcoach-pro.com";
      if (rawMode !== "recovery-activate-no-rollout") review.env.SMARTCOACH_GHL_OAUTH_WRITE_ACCOUNTS = accountKey;
    }
    review.setResponse({ ...review.grant(), scope: review.env.SMARTCOACH_GHL_OAUTH_SCOPES });
    const auth = await review.start();
    await review.invoke("crm-connect-callback", review.callbackReq(auth));
    if (mode === "existing") review.accounts.set(accountKey, { locationId, coachStaff: [{ id: "preserve" }] });
    if (rawMode === "recovery-existing") review.accounts.set(accountKey, { locationId, coachStaff: [{ id: "preserve" }] });
    if (mode === "scan-alt") review.accounts.set("older-school", { locationId, token: "keep-pit", coachStaff: [{ coachCodeHash: "private-hash" }] });
    if (mode === "scan-env") review.env.SMARTCOACH_ACCOUNTS = JSON.stringify({ "older-school": { ghlLocationId: locationId, token: "keep-pit" } });
    if (mode === "scan-env-suffix") review.env.GHL_LOCATION_ID_OLD_SCHOOL = locationId;
    if (mode === "scan-bad-env") review.env.SMARTCOACH_ACCOUNTS = "invalid-json";
    if (mode === "scan-access") review.records.set(`buyeraccess-${locationId}`, { status: "attempted", staffId: "keep" });
    if (mode === "scan-fulfillment") review.records.set(`buyerfulfillment-${locationId}`, { status: "uncertain" });
    if (mode === "missing-scope") {
      review.env.SMARTCOACH_GHL_OAUTH_SCOPES = "oauth.write locations.readonly";
      const again = await review.start();
      review.setResponse({ ...review.grant(), scope: review.env.SMARTCOACH_GHL_OAUTH_SCOPES });
      await review.invoke("crm-connect-callback", review.callbackReq(again));
    }
    review.setProvider((url, options) => {
      if (!activation) assert.equal(options.method, new URL(url).pathname === "/oauth/location-token" ? "POST" : undefined, "Only temporary credential exchange may use POST");
      if (mode === "forbidden") return { mockHttpStatus: 403, secret: "private-provider-response" };
      if (mode === "provider-error") throw new Error("private-provider-response");
      const path = new URL(url).pathname;
      if (path === "/oauth/installed-locations") {
        assert.equal(new URL(url).searchParams.get("locationId"), locationId);
        assert.equal(new URL(url).searchParams.get("appId"), APP_ID);
        assert.equal(new URL(url).searchParams.get("versionId"), APP_ID);
        assert.equal(options.headers.Authorization, "Bearer private-access");
        return { installToFutureLocations: mode === "order-install-future",
          items: ["order-install-missing", "order-crm-missing-install"].includes(mode) ? [{ _id: "other", isInstalled: true }]
            : mode === "order-install-ambiguous" ? [{ _id: locationId, isInstalled: true }, { _id: locationId, isInstalled: true }]
              : [{ _id: locationId, isInstalled: true }] };
      }
      if (path === "/oauth/location-token") {
        assert.equal(new URLSearchParams(options.body).get("locationId"), locationId);
        assert.equal(new URLSearchParams(options.body).get("companyId"), "agency-one");
        assert.equal(options.headers.Authorization, "Bearer private-access");
        return { access_token: "private-preview-token", token_type: "Bearer", expires_in: 86400,
          locationId: mode === "order-crm-token" ? "other" : locationId,
          scope: review.env.SMARTCOACH_GHL_OAUTH_SCOPES.split(" ").filter(scope => !scope.startsWith("oauth.") && scope !== "saas/company.read").join(" ") + (mode === "order-crm-scope" ? " users.write" : "") };
      }
      if (path === "/contacts/") return { contacts: options.headers.Authorization === 'Bearer private-seller-token'
        ? [{ id: 'seller-owner', email: ownerEmail, locationId: 'QxwjWekSyUf7sDOFHPB4' }]
        : [{ locationId: mode === "order-crm-contact" ? "other" : locationId }] };
      if (path === `/locations/${locationId}/customValues`) {
        if (options.method === 'POST') {
          assert(activation); assert.equal(options.headers.Authorization, 'Bearer private-preview-token');
          assert.deepEqual(JSON.parse(options.body), { name: 'account_key', value: accountKey });
          values = [{ id: 'buyer-key', name: 'account_key', value: accountKey, locationId }];
          return { customValue: values[0] };
        }
        return { customValues: values };
      }
      if (path === '/conversations/messages') {
        assert(activation); sends++;
        assert.equal(options.headers.Authorization, 'Bearer private-seller-token');
        const email = JSON.parse(options.body);
        assert.equal(email.emailFrom, 'info@smartcoach-pro.com'); assert.equal(email.emailTo, ownerEmail);
        assert.equal(email.subject, 'SMARTCoach Access'); assert(email.html.includes('/overview.html?'));
        assert(!email.html.includes(review.accounts.get(accountKey).coachAccessCodes[0]));
        if (rawMode === 'recovery-activate-failed-send') throw new Error('private-send-error');
        return { messageId: 'accepted-legacy-email' };
      }
      const mapping = require("../smart_trak_object_mapping.json");
      if (path === `/locations/${locationId}/customFields`) return { customFields: mode === "order-crm-fields" ? [] : Object.values(mapping.contactFields).map(field => ({ ...field, locationId })) };
      if (path.startsWith("/objects/")) {
        assert.equal(options.headers.Authorization, "Bearer private-preview-token");
        assert.equal(new URL(url).searchParams.get("locationId"), locationId);
        const object = Object.values(mapping.objects).find(item => item.internalName === decodeURIComponent(path.split("/")[2]));
        return { object: { key: object.internalName, locationId: mode === "order-crm-schema" ? "other" : locationId },
          fields: Object.entries(object.fields).map(([key, field]) => ({ id: field.id, locationId, fieldKey: `${object.internalName}.${key}`, dataType: field.type })) };
      }
      if (path === "/locations/QxwjWekSyUf7sDOFHPB4") {
        assert.equal(options.headers.Authorization, "Bearer private-seller-token");
        return { location: { id: mode === "order-seller" ? "other" : "QxwjWekSyUf7sDOFHPB4", companyId: "agency-one" } };
      }
      if (path.startsWith("/payments/")) {
        assert.equal(options.headers.Version, "2021-07-28");
        assert.equal(new URL(url).searchParams.get("altType"), "location");
        if (path.startsWith("/payments/orders/")) assert.equal(new URL(url).searchParams.get("locationId"), "QxwjWekSyUf7sDOFHPB4");
        assert.equal(options.headers.Authorization, "Bearer private-seller-token");
        assert.equal(new URL(url).searchParams.get("altId"), "QxwjWekSyUf7sDOFHPB4");
        if (mode === "order-denied") return { mockHttpStatus: 403, secret: "private-provider-response" };
        if (mode === "order-bad-request") return { mockHttpStatus: 400, secret: "private-provider-response" };
        if (mode === "order-validation") return { mockHttpStatus: 422,
          message: ["altType must be a string private-provider-response", "private-provider-response", "altType should not be empty", "locationId must be a string"] };
        if (mode === "order-shape") return { data: { secret: "private-provider-response" } };
        const common = { altId: "QxwjWekSyUf7sDOFHPB4", altType: "location", contactId: "customer",
          contactSnapshot: { email: mode === "order-email" ? "other@example.com" : ownerEmail }, currency: mode === "order-usd-lower" ? "usd" : mode === "order-currency-other" ? "CAD" : "USD",
          liveMode: mode !== "order-test", markAsTest: false };
        const source = { type: "payment_link", subType: "payments_dashboard", id: mode === "order-source" ? "other" : "6a1b37c203b17c94f5713b61" };
        if (path.startsWith("/payments/orders/")) return { ...common, _id: "6abd8977b229ab130b0f3c93", status: "completed", amount: 0, source,
          items: [{ qty: 1, product: { _id: mode === "order-product" ? "other" : "product", name: "SMARTCoach Pro 25" },
            price: { _id: "price", amount: mode === "order-price" ? 29 : 19,
              recurring: { interval: mode === "order-cadence" ? "year" : "month", intervalCount: 1 } } }] };
        return { ...common, _id: "6abd897d66ad43f827dbaa4e", entityType: "order",
          entityId: mode === "order-link" ? "other" : "6abd8977b229ab130b0f3c93", entitySource: source,
          status: "trialing", amount: 19, subscriptionId: "sub_provider" };
      }
      if (path === `/locations/${locationId}`) return { location: { id: mode === "wrong-location" ? "other" : locationId,
        companyId: mode === "wrong-agency" ? "other" : "agency-one", email: mode === "wrong-email" ? "other@example.com" : ownerEmail,
        token: "private-location-token" } };
      if (path === `/saas/get-saas-subscription/${locationId}`) return { locationId, companyId: "agency-one", isSaaSV2: true,
        subscriptionStatus: mode === "past-due" ? "past_due" : "trialing", subscriptionId: mode === "ghl-id" || mode.startsWith("order-") ? "6abd897d66ad43f827dbaa4e" : "sub_verified",
        customerId: "cus_verified", productId: "product", priceId: "price", saasPlanId: "plan", access_token: "never-return-me" };
      assert.equal(path, "/saas/saas-plan/plan");
      if (mode === "race") review.accounts.set(accountKey, { locationId, coachStaff: [{ id: "preserve" }] });
      return { planId: "plan", companyId: "agency-one", providerLocationId: "QxwjWekSyUf7sDOFHPB4", productId: "product",
        isSaaSV2: true, title: mode === "bad-catalog" ? "SMARTCoach Pro 25 lookalike" : "SMARTCoach Pro 25", trialPeriod: 30,
        prices: [{ id: "price", active: true, amount: 19, currency: "USD", billingInterval: "month" }] };
    });
    const req = review.request(mode === "get" ? "GET" : "POST");
    req.body = { preview: true, accountKey, locationId, schoolName: "Athletic Develop", coachName: "Jenn Moore", ownerEmail: "BUYER@example.com",
      expectedSubscriptionId: "sub_verified", expectedProductName: "SMARTCoach Pro 25 - Monthly", expectedBillingCadence: "monthly", expectedAmount: "19.00" };
    if (mode.startsWith("scan-")) req.body.verifyExistingSetup = true;
    if (mode === "no-admin") delete req.headers["x-smartcoach-setup-code"];
    if (mode === "wrong-origin") req.headers.origin = "https://other.example";
    if (mode === "execute") req.body.confirmRecovery = true;
    if (mode === "missing-preview") delete req.body.preview;
    if (mode === "seller") { req.body.locationId = "QxwjWekSyUf7sDOFHPB4"; req.body.accountKey = "sc-qxwjweksyuf7sdofhpb4"; }
    if (mode === "wrong-key") req.body.accountKey = "other";
    if (mode === "missing-coach") req.body.coachName = "";
    if (mode === "wrong-subscription") req.body.expectedSubscriptionId = "sub_other";
    if (mode === "ghl-id") req.body.expectedSubscriptionId = "6abd897d66ad43f827dbaa4e";
    if (mode.startsWith("order-")) Object.assign(req.body, { expectedSubscriptionId: "6abd897d66ad43f827dbaa4e",
      expectedOrderId: "6abd8977b229ab130b0f3c93", expectedSaleLinkId: "6a1b37c203b17c94f5713b61" });
    if (mode.startsWith("order-crm-")) Object.assign(req.body, { verifyBuyerCrm: true, verifyExistingSetup: mode !== "order-crm-no-inventory" });
    if (recovery) {
      req.body.ownerEmail = ownerEmail;
      req.body.confirmRecovery = rawMode !== "recovery-no-confirm";
      if (rawMode === "recovery-wrong-buyer") req.body.locationId = "AbCdEfGhIjKlMnOpQrSt";
      if (rawMode === "recovery-no-admin") delete req.headers["x-smartcoach-setup-code"];
      if (rawMode === "recovery-wrong-origin") req.headers.origin = "https://other.example";
      if (rawMode === "recovery-get") req.method = "GET";
    }
    if (mode === "wrong-product") req.body.expectedProductName = "SMARTCoach Pro 100 - Monthly";
    if (mode === "wrong-amount") req.body.expectedAmount = "29.00";
    if (mode === "wrong-cadence") req.body.expectedBillingCadence = "annual";
    const recordsBefore = structuredClone([...review.records]);
    if (mode === "scan-resume") {
      review.registry.inspectAccountLocationReferences = async (location, scan) => scan
        ? { complete: true, references: ["older-school"] }
        : { complete: false, references: ["older-school"], reason: "scan_page_limit_reached",
          continuation: { prefix: "test:account:", cursor: "42", seen: ["test:account:older-school"], references: ["older-school"] } };
    }
    let result = await review.invoke(recovery ? "ghl-oauth-recover-legacy-purchase" : "ghl-oauth-review-legacy-purchase", req);
    if (recovery) {
      if (activation) {
        assert.equal(result.statusCode, 200, rawMode);
        if (rawMode === 'recovery-activate-metadata') {
          review.accounts.get(accountKey).updatedAt = '2026-10-03T20:00:00.000Z';
          const originalSave = review.registry.saveAccountRecord;
          review.registry.saveAccountRecord = (key, record) => originalSave(key, { ...record, accountKey: key, updatedAt: '2026-10-03T23:00:00.000Z' });
        }
        const beforeActivation = structuredClone(review.accounts.get(accountKey));
        const activationReq = review.request(); activationReq.body = { accountKey, locationId, preview: true };
        const preview = await review.invoke('ghl-oauth-activate-legacy-buyer', activationReq);
        assert.equal(preview.statusCode, 200, preview.body.error);
        assert.equal(preview.body.accountUnchanged, true); assert.equal(preview.body.emailSent, false);
        assert.equal(preview.body.ownerEmail, ownerEmail); assert.equal(preview.body.sellerSenderVerified, true);
        assert.deepEqual(review.accounts.get(accountKey), beforeActivation); assert.equal(sends, 0);
        activationReq.body = { accountKey, locationId, confirmActivation: rawMode !== 'recovery-activate-no-confirm',
          expectedFingerprint: rawMode === 'recovery-activate-stale' ? 'stale' : preview.body.fingerprint };
        if (rawMode === 'recovery-activate-existing-access') review.accounts.get(accountKey).coachStaff = [{ id: 'preserve' }];
        if (rawMode === 'recovery-activate-no-admin') delete activationReq.headers['x-smartcoach-setup-code'];
        if (rawMode === 'recovery-activate-wrong-origin') activationReq.headers.origin = 'https://other.example';
        if (rawMode === 'recovery-activate-wrong-buyer') activationReq.body.locationId = 'other';
        const activated = await review.invoke('ghl-oauth-activate-legacy-buyer', activationReq);
        const success = ['recovery-activate-valid', 'recovery-activate-metadata'].includes(rawMode);
        assert.equal(activated.statusCode, success ? 200 : rawMode === 'recovery-activate-failed-send' ? 502
          : ['recovery-activate-no-admin','recovery-activate-wrong-origin','recovery-activate-wrong-buyer'].includes(rawMode) ? 403 : 409, rawMode + ': ' + activated.body.error);
        if (success || rawMode === 'recovery-activate-failed-send') {
          assert.equal(sends, 1); assert.equal(review.accounts.get(accountKey).coachStaff.length, 1);
          assert.equal(review.accounts.get(accountKey).accessStatus, 'active');
          assert.equal(review.accounts.get(accountKey).token, '');
          assert.deepEqual(review.accounts.get(accountKey).subscription, beforeActivation.subscription);
          assert.equal((await review.invoke('ghl-oauth-activate-legacy-buyer', activationReq)).statusCode, 409);
          assert.equal(sends, 1);
        } else { assert.equal(sends, 0); assert.equal(values.length, 0); }
        if (success) { assert.equal(activated.body.accessEmailAccepted, true); assert.equal(activated.body.deliveryVerified, false); }
        assert(!JSON.stringify(activated).includes('private-preview-token'));
        assert(!JSON.stringify(activated).includes('private-send-error'));
        continue;
      }
      assert.equal(result.statusCode, rawMode === "recovery-valid" ? 200 : rawMode === "recovery-get" ? 405
        : rawMode === "recovery-grant-fail" ? 503 : ["recovery-fields", "recovery-nx-race", "recovery-existing"].includes(rawMode) ? 409 : 403, rawMode);
      const saved = review.accounts.get(accountKey);
      if (rawMode === "recovery-valid") {
        assert.equal(result.body.accountRecovered, true); assert.equal(result.body.buyerOAuthSaved, true);
        assert.equal(saved.productPlan, "pro25"); assert.equal(saved.subscription.status, "trialing");
        assert.equal(saved.subscription.amount, "19.00"); assert.equal(saved.accessStatus, "manual_hold");
        assert.equal(saved.requireCoachAccess, true); assert.equal(saved.token, "");
        assert.deepEqual(saved.coachStaff, []); assert.deepEqual(saved.coachAccessCodes, []);
        assert.equal(review.records.get(`buyergrant-${locationId}`).buyerAccountKey, accountKey);
        for (const key of ["emailSent", "coachAccessCreated", "automaticFulfillmentReady", "buyerProvisioningVerified"]) assert.equal(result.body[key], false);
        assert.equal((await review.invoke("ghl-oauth-recover-legacy-purchase", req)).statusCode, 409);
      } else if (rawMode === "recovery-nx-race") assert.equal(saved.schoolName, "Preserve concurrent account");
      else if (rawMode === "recovery-grant-fail") {
        assert.equal(saved.accessStatus, "manual_hold");
        assert.equal((await review.invoke("ghl-oauth-recover-legacy-purchase", req)).statusCode, 409);
      } else if (rawMode === "recovery-existing") assert.deepEqual(saved.coachStaff, [{ id: "preserve" }]);
      else assert.equal(saved, undefined);
      assert(!JSON.stringify(result).includes("private-preview-token"));
      assert(!JSON.stringify([...review.records]).includes("private-preview-token"));
      continue;
    }
    if (mode === "scan-resume") {
      assert.equal(result.statusCode, 202);
      assert.equal(result.body.inventoryComplete, false);
      assert.equal(result.body.recoveryReady, false);
      assert(!JSON.stringify(result.body).includes("older-school"));
      const token = result.body.inventoryContinuation;
      const changed = structuredClone(req);
      changed.body.inventoryContinuation = token;
      changed.body.schoolName = "Different school";
      assert.equal((await review.invoke("ghl-oauth-review-legacy-purchase", changed)).statusCode, 409);
      changed.body.schoolName = req.body.schoolName;
      changed.body.inventoryContinuation = token.slice(0, -8) + "invalid";
      assert.equal((await review.invoke("ghl-oauth-review-legacy-purchase", changed)).statusCode, 409);
      req.body.inventoryContinuation = token;
      result = await review.invoke("ghl-oauth-review-legacy-purchase", req);
      assert.deepEqual(result.body.existingSetup.savedAccountReferences, ["older-school"]);
      review.advance(10 * 60 * 1000);
      assert.equal((await review.invoke("ghl-oauth-review-legacy-purchase", req)).statusCode, 409);
    }
    if (["valid", "ghl-id", "scan-empty", "scan-alt", "scan-env", "scan-env-suffix", "scan-access", "scan-fulfillment", "scan-resume", "order-crm-valid", "order-valid", "order-install-missing", "order-usd-lower"].includes(mode)) {
      assert.equal(result.statusCode, 200);
      assert.equal(result.body.providerPurchaseVerified, true);
      assert.equal(result.body.ownerEmail, "buyer@example.com");
      assert.equal(result.body.proposedCoachName, "Jenn Moore");
      assert.equal(result.body.productName, "SMARTCoach Pro 25 - Monthly");
      assert.equal(result.body.amount, "19.00");
      assert.equal(result.body.planTrialDays, 30);
      assert.equal(result.body.subscriptionId, req.body.expectedSubscriptionId);
      assert.equal(result.body.originalOrderVerified, ["order-crm-valid", "order-valid", "order-install-missing", "order-usd-lower"].includes(mode));
      if (mode === "order-crm-valid") {
        assert.equal(result.body.buyerCrmReview.crmReadsVerified, true);
        assert.equal(result.body.buyerCrmReview.snapshot.verified, true);
        assert.equal(result.body.buyerCrmReview.buyerTokenPersisted, false);
        assert.equal(result.body.buyerCrmReview.consumerAccessEnabled, false);
      }
      if (mode.startsWith("order-")) {
        assert.equal(result.body.connectorInstallation.installed, mode !== "order-install-missing");
        assert.equal(result.body.connectorInstallation.buyerTokenRequested, false);
        assert.equal(result.body.connectorInstallation.snapshotVerified, false);
      }
      for (const key of ["alternateAccountHistoryVerified", "buyerOAuthVerified", "recoveryReady", "emailSent", "automaticFulfillmentReady"]) assert.equal(result.body[key], false);
      assert.equal(result.body.accountUnchanged, true);
      assert.equal(result.body.pendingCheckoutUnchanged, true);
      if (mode.startsWith("scan-")) {
        assert.equal(result.body.existingSetup.existingSetupReviewVerified, true);
        assert.equal(result.body.existingSetup.existingSetupOrHistoryPresent, mode !== "scan-empty");
      }
      const normal = await review.invoke("ghl-oauth-check-subscription", { ...req, body: { accountKey, locationId } });
      assert.equal(normal.statusCode, 422, "Normal provisioning must still require saved buyer mapping");
    } else assert(result.statusCode >= 400, mode);
    if (mode === "wrong-subscription") assert.match(result.body.error, /blocked: subscriptionId\./);
    if (mode === "wrong-product") assert.match(result.body.error, /blocked: productName\./);
    if (mode === "wrong-amount") assert.match(result.body.error, /blocked: amount\./);
    if (mode === "wrong-cadence") assert.match(result.body.error, /blocked: billingCadence\./);
    if (mode === "bad-catalog") assert.match(result.body.error, /purchaseCatalog.*exact supported SMARTCoach/);
    if (mode === "scan-limit") assert.match(result.body.error, /\(scan_page_limit_reached\)/);
    if (mode === "order-denied") assert.match(result.body.error, /\(order, HTTP 403\)/);
    if (mode === "order-bad-request") assert.match(result.body.error, /\(order, HTTP 400\)/);
    if (mode === "order-validation") assert.match(result.body.error, /Validation fields: altType, locationId\./);
    if (mode === "order-currency-other") assert.match(result.body.error, /blocked: currency\./);
    if (["order-crm-missing-install", "order-crm-no-inventory"].includes(mode)) assert(!review.calls.some(call => new URL(call.url).pathname === "/oauth/location-token"));
    if (mode === "scan-private-reason") assert.match(result.body.error, /\(inventory_incomplete\)/);
    assert.deepEqual([...review.records], recordsBefore, "Review must not persist recovery, grants, audits or checkout records");
    assert.equal(review.accounts.size, ["existing", "race", "scan-alt"].includes(mode) ? 1 : 0);
    for (const secret of ["private-preview-token", "private-access", "private-location-token", "private-provider-response", "never-return-me", "keep-pit", "private-hash", "private-history-error", "private-inventory-error", "private-seller-token"]) assert(!JSON.stringify(result).includes(secret));
  }
  for (const mode of ["valid", "reconcile", "reconcile-bad-price", "reconcile-bad-confirm", "wrong-location", "wrong-company", "not-v2", "empty", "wrapped", "wrapped-empty", "wrapped-wrong-buyer", "ambiguous", "missing-price", "unknown-status", "no-admin", "wrong-origin", "provider-error", "forbidden"]) {
    const check = fixture();
    const auth = await check.start();
    await check.invoke("crm-connect-callback", check.callbackReq(auth));
    const original = { locationId, productPlan: "pro100", token: "existing-pit", subscription: { status: "active", billingCadence: "monthly", amount: "29.00" }, coachStaff: [{ id: "keep-staff" }] };
    check.accounts.set(accountKey, structuredClone(original));
    check.setProvider((url, options) => {
      if (mode === "provider-error") throw new Error("private-provider-response");
      if (mode === "forbidden") return { mockHttpStatus: 403, secret: "private-provider-response" };
      if (mode === "empty") return {};
      if (mode === "wrapped-empty") return { data: {} };
      if (mode === "ambiguous") return { locationId, companyId: "agency-one", isSaaSV2: true, data: { locationId: "other" } };
      const parsed = new URL(url);
      if (parsed.pathname === "/saas/saas-plan/plan_verified") {
        assert.equal(parsed.searchParams.get("companyId"), "agency-one");
        assert.equal(options.method, undefined);
        const catalog = { planId: "plan_verified", companyId: "agency-one", providerLocationId: "QxwjWekSyUf7sDOFHPB4",
          productId: "prod_verified", isSaaSV2: true, title: "SMARTCoach Pro 100", trialPeriod: 30,
          prices: [{ id: "price_verified", billingInterval: "month", active: true, amount: 29, currency: "USD" }] };
        if (mode === "reconcile-bad-price") catalog.prices[0].amount = 2900;
        return mode === "wrapped" ? { data: catalog } : catalog;
      }
      assert.equal(parsed.pathname, `/saas/get-saas-subscription/${locationId}`);
      assert.equal(parsed.searchParams.get("companyId"), "agency-one");
      assert.equal(options.method, undefined);
      const details = { locationId: ["wrong-location", "wrapped-wrong-buyer"].includes(mode) ? "another" : locationId,
        companyId: mode === "wrong-company" ? "another" : "agency-one", isSaaSV2: mode !== "not-v2",
        subscriptionStatus: mode === "unknown-status" ? "unknown" : "trialing",
        subscriptionId: "sub_verified", customerId: "cus_verified", productId: "prod_verified",
        priceId: mode === "missing-price" ? "" : "price_verified", saasPlanId: "plan_verified", access_token: "never-return-me" };
      return ["wrapped", "wrapped-wrong-buyer"].includes(mode) ? { data: details } : details;
    });
    const req = check.request();
    req.body = { accountKey, locationId };
    if (mode.startsWith("reconcile")) Object.assign(req.body, { reconcileTrialStatus: true, expectedSavedStatus: "active", expectedProviderStatus: mode === "reconcile-bad-confirm" ? "active" : "trialing" });
    if (mode === "no-admin") delete req.headers["x-smartcoach-setup-code"];
    if (mode === "wrong-origin") req.headers.origin = "https://other.example";
    const result = await check.invoke("ghl-oauth-check-subscription", req);
    assert.equal(result.statusCode, ["valid", "wrapped", "reconcile"].includes(mode) ? 200 : mode.startsWith("reconcile-bad") ? 409 : ["provider-error", "forbidden"].includes(mode) ? 502 : ["missing-price", "unknown-status"].includes(mode) ? 422 : 403);
    if (mode === "forbidden") assert.match(result.body.error, /HTTP 403/);
    if (mode === "wrong-location") assert.match(result.body.error, /location: mismatched; agency: matched/);
    if (mode === "empty") assert.match(result.body.error, /location: missing; agency: missing/);
    if (mode === "wrapped-empty") assert.match(result.body.error, /location: missing/);
    if (mode === "wrapped-wrong-buyer") assert.match(result.body.error, /location: mismatched/);
    if (mode === "ambiguous") assert.match(result.body.error, /ambiguous/);
    assert.deepEqual(check.accounts.get(accountKey), mode === "reconcile" ? { ...original, subscription: { ...original.subscription, status: "trialing" } } : original);
    if (mode === "reconcile") {
      assert.equal(result.body.trialStatusReconciled, true);
      assert.equal(result.body.automaticFulfillmentReady, false);
      const replay = await check.invoke("ghl-oauth-check-subscription", req);
      assert.equal(replay.statusCode, 409);
    }
    if (["valid", "wrapped"].includes(mode)) {
      assert.equal(result.body.providerSubscriptionStatus, "trialing");
      assert.equal(result.body.savedSubscriptionStatus, "active");
      assert.equal(result.body.purchaseVerified, true);
      assert.equal(result.body.savedConfigurationMatches, true);
      assert.equal(result.body.purchasedProductPlan, "pro100");
      assert.equal(result.body.purchasedAmount, "29.00");
      assert.equal(result.body.purchasedBillingCadence, "monthly");
      assert.equal(result.body.planTrialDays, 30);
      assert.equal(result.body.automaticFulfillmentReady, false);
      assert.equal(result.body.buyerSetupUnchanged, true);
    }
    assert(!JSON.stringify(result).includes("never-return-me"));
    assert(!JSON.stringify(result).includes("private-provider-response"));
    if (["no-admin", "wrong-origin"].includes(mode)) assert.equal(check.calls.length, 1);
  }
  const catalogSubscription = { saasPlanId: "plan", productId: "product", priceId: "price" };
  for (const mode of ["pilot", "wrong-pending", "uncertain-email", "uninstalled", "wrong-seller", "bad-price", "no-admin", "wrong-origin", "reconciled", "stale-reconciliation", "ready-preserved"]) {
    const preview = fixture();
    preview.env.SMARTCOACH_WELCOME_SELLER_TOKEN = "private-seller-preview";
    preview.env.SMARTCOACH_WELCOME_FROM_EMAIL = "info@smartcoach-pro.com";
    if (mode === "ready-preserved") preview.env.SMARTCOACH_GHL_OAUTH_WRITE_ACCOUNTS = accountKey;
    const auth = await preview.start();
    await preview.invoke("crm-connect-callback", preview.callbackReq(auth));
    const original = { locationId, productPlan: "pro100", accountOwnerEmail: "buyer@example.com", token: "keep-pit",
      subscription: { status: "trialing", billingCadence: "monthly", amount: "29.00" },
      coachStaff: [{ id: "head", active: true, accessType: "full", coachCodeHash: "private-hash" }] };
    preview.accounts.set(accountKey, structuredClone(original));
    preview.records.set("pendingcheckout", { source: "smartcoach-precheckout", lastMatchedLocationId: mode === "wrong-pending" ? "other" : locationId,
      coachEmail: mode.includes("reconcil") ? "original@example.com" : "buyer@example.com", plan: "pro100", cadence: "monthly", productName: "SMARTCoach Pro 100 - Monthly", schoolName: "School", coachName: "Buyer",
      lastLocationCreateEvent: { id: locationId, companyId: "agency-one", email: "buyer@example.com" } });
    preview.records.set(`buyeraccess-${locationId}`, { buyerAccountKey: accountKey, locationId, ownerEmail: "buyer@example.com", productPlan: "pro100",
      senderLocationId: "QxwjWekSyUf7sDOFHPB4", emailFrom: "info@smartcoach-pro.com", messageId: "accepted-message", staffId: "head", status: mode === "uncertain-email" ? "attempted" : "accepted" });
    const history = structuredClone(preview.records.get(`buyeraccess-${locationId}`));
    preview.setProvider(url => {
      const path = new URL(url).pathname;
      if (path === `/saas/get-saas-subscription/${locationId}`) return { locationId, companyId: "agency-one", isSaaSV2: true,
        subscriptionStatus: "trialing", subscriptionId: "sub", customerId: "cus", productId: "product", priceId: "price", saasPlanId: "plan" };
      if (path === "/saas/saas-plan/plan") return { planId: "plan", companyId: "agency-one", providerLocationId: "QxwjWekSyUf7sDOFHPB4",
        productId: "product", isSaaSV2: true, title: "SMARTCoach Pro 100", trialPeriod: 30,
        prices: [{ id: "price", active: true, amount: mode === "bad-price" ? 2900 : 29, currency: "USD", billingInterval: "month" }] };
      if (path === "/oauth/installed-locations") return { items: [{ _id: locationId, isInstalled: mode !== "uninstalled" }] };
      if (path === "/oauth/location-token") return { access_token: "private-preview-buyer", token_type: "Bearer", locationId, expires_in: 86400, scope: "locations.readonly" };
      if (path === `/locations/${locationId}`) return { location: { id: locationId, companyId: "agency-one" } };
      if (path === "/locations/QxwjWekSyUf7sDOFHPB4") return { location: { id: "QxwjWekSyUf7sDOFHPB4", companyId: mode === "wrong-seller" ? "other" : "agency-one" } };
      throw new Error("Preview made an unexpected provider request");
    });
    const req = preview.request(); req.body = { accountKey, locationId };
    if (mode.includes("reconcil")) {
      preview.records.get("pendingcheckout").lastLocationCreateEvent = { id: locationId, companyId: "agency-one", email: "original@example.com" };
      const pendingBefore = structuredClone(preview.records.get("pendingcheckout"));
      const review = { ...req, body: { ...req.body, originalEmail: "original@example.com", preview: true } };
      assert.equal((await preview.invoke("ghl-oauth-reconcile-checkout", { ...review, method: "GET" })).statusCode, 405);
      assert.equal((await preview.invoke("ghl-oauth-reconcile-checkout", { ...review, headers: {} })).statusCode, 403);
      assert.equal((await preview.invoke("ghl-oauth-reconcile-checkout", { ...review, headers: { ...req.headers, origin: "https://other.example" } })).statusCode, 403);
      const reviewed = await preview.invoke("ghl-oauth-reconcile-checkout", review);
      assert.equal(reviewed.statusCode, 200);
      assert.equal(reviewed.body.preview, true);
      assert.equal(reviewed.body.ownerEmail, "buyer@example.com");
      assert.equal(reviewed.body.originalEmail, "original@example.com");
      assert(!preview.records.has(`checkoutidentity-${locationId}`));
      const approve = { ...req, body: { ...review.body, preview: false, confirmReconciliation: true, expectedFingerprint: reviewed.body.fingerprint,
        reviewedBy: "Support reviewer", reason: "Owner explicitly verified the corrected account email." } };
      for (const change of [{ confirmReconciliation: false }, { expectedFingerprint: "stale" }, { reviewedBy: "" }, { reason: "" }]) {
        assert.equal((await preview.invoke("ghl-oauth-reconcile-checkout", { ...approve, body: { ...approve.body, ...change } })).statusCode, 409);
      }
      assert(!preview.records.has(`checkoutidentity-${locationId}`));
      assert.equal((await preview.invoke("ghl-oauth-reconcile-checkout", approve)).statusCode, 200);
      const auditBefore = structuredClone(preview.records.get(`checkoutidentity-${locationId}`));
      assert.equal((await preview.invoke("ghl-oauth-reconcile-checkout", approve)).body.alreadyApproved, true);
      assert.deepEqual(preview.records.get(`checkoutidentity-${locationId}`), auditBefore);
      assert.deepEqual(preview.records.get("pendingcheckout"), pendingBefore);
      assert.deepEqual(preview.accounts.get(accountKey), original);
      assert.equal(auditBefore.status, "approved");
      assert.equal(auditBefore.reason, approve.body.reason);
      preview.records.set("pendingcheckout", { ...pendingBefore, productName: "SMARTCoach Pro 100 Monthly" });
      assert.equal((await preview.invoke("ghl-oauth-reconcile-checkout", review)).body.error,
        "Checkout identity review blocked: checkoutProductName. No reconciliation approved.");
      preview.records.set("pendingcheckout", structuredClone(pendingBefore));
      for (const [field, diagnostic] of Object.entries({ lastMatchedLocationId: "checkoutLocation", plan: "checkoutPlan",
        productName: "checkoutProductName", coachEmail: "checkoutEmail", cadence: "checkoutCadence", source: "checkoutSource" })) {
        preview.records.set("pendingcheckout", { ...pendingBefore, [field]: "changed" });
        const blocked = await preview.invoke("ghl-oauth-reconcile-checkout", review);
        assert.equal(blocked.statusCode, 409);
        assert.equal(blocked.body.error, `Checkout identity review blocked: ${diagnostic}. No reconciliation approved.`);
        preview.records.set("pendingcheckout", structuredClone(pendingBefore));
      }
      for (const field of ["id", "companyId", "email"]) {
        preview.records.set("pendingcheckout", { ...pendingBefore, lastLocationCreateEvent: { ...pendingBefore.lastLocationCreateEvent, [field]: "other" } });
        assert.equal((await preview.invoke("ghl-oauth-reconcile-checkout", review)).statusCode, 409);
        preview.records.set("pendingcheckout", structuredClone(pendingBefore));
      }
      if (mode === "stale-reconciliation") preview.records.set("pendingcheckout", { ...pendingBefore, schoolName: "Changed school" });
    }
    if (mode === "no-admin") delete req.headers["x-smartcoach-setup-code"];
    if (mode === "wrong-origin") req.headers.origin = "https://other.example";
    const result = await preview.invoke("ghl-oauth-preview-fulfillment", req);
    assert.equal(result.statusCode, ["no-admin", "wrong-origin"].includes(mode) ? 403 : 200);
    assert.deepEqual(preview.accounts.get(accountKey), original);
    assert.deepEqual(preview.records.get(`buyeraccess-${locationId}`), history);
    assert(!preview.calls.some(call => ["/conversations/messages", "/contacts/"].includes(new URL(call.url).pathname)));
    if (result.statusCode === 200) {
      assert.equal(result.body.automaticFulfillmentReady, false);
      assert.equal(result.body.emailSent, false);
      assert.equal(result.body.existingAccessPreserved, mode !== "uncertain-email");
      assert.equal(result.body.buyerOAuthVerified, mode !== "uninstalled");
      assert.equal(result.body.sellerSenderVerified, mode !== "wrong-seller");
      assert.equal(result.body.pendingCheckoutMatched, !["wrong-pending", "bad-price", "stale-reconciliation"].includes(mode));
      assert.equal(result.body.checkoutIdentityReconciled, mode === "reconciled");
      assert.equal(result.body.stagedFulfillment.nextAction, mode === "ready-preserved" ? "preserve_existing_access" : "support_review_required");
      assert.equal(result.body.stagedFulfillment.stagedPlanReady, mode === "ready-preserved");
      assert.equal(result.body.stagedFulfillment.automaticFulfillmentReady, false);
      assert.deepEqual(result.body.stagedFulfillment.steps, []);
      assert.equal(result.body.blockers.some(item => item.includes("manual PIT")), mode !== "ready-preserved");
    }
    for (const secret of ["private-preview-buyer", "private-seller-preview", "private-hash", "keep-pit"]) assert(!JSON.stringify(result).includes(secret));
  }
  const identityModes = ["provisioning-delay", "missing", "empty", "conflict", "agency-conflict", "v2-conflict", "ambiguous", "malformed", "wrong-live", "manual", "alias", "unsigned"]
    .map(kind => `automatic-policy-identity-${kind}`);
  for (const mode of [...identityModes, "automatic-policy-subscription-wait", "automatic-policy-subscription-wrong-location", "automatic-policy-subscription-malformed", "automatic-policy-subscription-unknown-status", "automatic-policy-key-readback", "automatic-policy-success", "automatic-policy-failed-send", "automatic-policy-missing-fields", "automatic-policy-unsigned-mapping", "automatic-policy-manual", "automatic-policy-alias", "automatic-policy-worker", "automatic-success", "automatic-install-success", "automatic-disabled", "automatic-unsigned", "automatic-fallback", "automatic-app", "automatic-agency", "automatic-email", "automatic-pending", "automatic-missing-mapping", "automatic-uninstalled", "automatic-failed-send", "automatic-wrong-product", "automatic-missing-fields", "delayed-readback", "success", "controlled-success", "controlled-wildcard", "controlled-other-account", "controlled-malformed", "controlled-no-confirm", "controlled-stale", "disabled", "no-admin", "wrong-origin", "wrong-buyer", "missing-scope", "missing-fields", "missing-meet-primary", "wrong-schema", "wrong-field-type", "conflicting-value", "failed-send", "missing-message"]) {
    const controlled = mode.startsWith('controlled-');
    const automatic = mode.startsWith('automatic-');
    const policy = mode.startsWith('automatic-policy-');
    const provisioningDelay = mode === "automatic-policy-identity-provisioning-delay";
    const success = ['success', 'controlled-success'].includes(mode);
    const f = fixture({ executionEnabled: !automatic && !controlled && mode !== "disabled" });
    if (provisioningDelay) f.env.SMARTCOACH_GHL_INITIAL_PROVISIONING_WAIT_ENABLED = "true";
    const scopes = "locations.readonly locations/customFields.readonly locations/customValues.readonly locations/customValues.write contacts.readonly contacts.write objects/record.readonly objects/record.write";
    const buyerScopes = scopes + (mode === "missing-scope" ? "" : " objects/schema.readonly");
    f.env.SMARTCOACH_GHL_OAUTH_SCOPES = "oauth.write " + buyerScopes;
    if (mode === "automatic-policy-success") {
      f.env.SMARTCOACH_GHL_BUYER_SCHOOL_NAME_SYNC_ENABLED = "true";
      f.env.SMARTCOACH_GHL_OAUTH_SCOPES += " locations.write";
    }
    f.env.SMARTCOACH_GHL_OAUTH_WRITE_ACCOUNTS = accountKey;
    if (automatic) {
      f.env.SMARTCOACH_GHL_CONTROLLED_FULFILLMENT_ACCOUNTS = accountKey;
      if (mode !== "automatic-disabled") f.env.SMARTCOACH_GHL_AUTOMATIC_FULFILLMENT_ACCOUNTS = accountKey;
    }
    if (policy) {
      delete f.env.SMARTCOACH_GHL_OAUTH_WRITE_ACCOUNTS;
      delete f.env.SMARTCOACH_GHL_CONTROLLED_FULFILLMENT_ACCOUNTS;
      delete f.env.SMARTCOACH_GHL_AUTOMATIC_FULFILLMENT_ACCOUNTS;
      f.env.SMARTCOACH_GHL_NEW_BUYER_PLANS = "pro25";
      f.env.SMARTCOACH_GHL_NEW_BUYER_OAUTH_PLANS = "pro25";
    }
    if (controlled) f.env.SMARTCOACH_GHL_CONTROLLED_FULFILLMENT_ACCOUNTS = mode === 'controlled-wildcard' ? '*'
      : mode === 'controlled-other-account' ? 'sc-12345678901234567890'
      : mode === 'controlled-malformed' ? `${accountKey},*` : accountKey;
    f.env.SMARTCOACH_WELCOME_SELLER_TOKEN = "private-fulfillment-seller";
    f.env.SMARTCOACH_WELCOME_FROM_EMAIL = "info@smartcoach-pro.com";
    f.setResponse({ ...f.grant(), scope: f.env.SMARTCOACH_GHL_OAUTH_SCOPES });
    const auth = await f.start(); await f.invoke("crm-connect-callback", f.callbackReq(auth));
    const original = { accountKey, locationId, token: "", productPlan: "pro100", schoolName: "School", accountOwnerName: "Buyer",
      accountOwnerEmail: "buyer@example.com", coachStaff: [], coachAccessCodes: [], requireCoachAccess: true,
      subscription: { status: "incomplete", amount: "29.99", billingCadence: "monthly" } };
    f.accounts.set(accountKey, structuredClone(original));
    const realSave = f.registry.saveAccountRecord;
    f.registry.saveAccountRecord = (key, record) => realSave(key, { ...record, accountKey: key, updatedAt: '2026-10-03T23:00:00.000Z' });
    f.records.set("pendingcheckout", { source: "smartcoach-precheckout", plan: "pro100", cadence: "monthly", productName: "SMARTCoach Pro 100 - Monthly",
      schoolName: "School", coachName: "Buyer", coachEmail: "buyer@example.com", lastMatchedLocationId: locationId,
      lastLocationCreateEvent: { id: locationId, companyId: "agency-one", email: "buyer@example.com" } });
    if (policy) {
      original.productPlan = "pro25";
      original.subscription.amount = "19.00";
      if (mode === "automatic-policy-manual") original.token = "preserve-manual-token";
      f.accounts.set(accountKey, structuredClone(original));
      Object.assign(f.records.get("pendingcheckout"), { plan: "pro25", productName: "SMARTCoach Pro 25 - Monthly" });
      f.records.get("pendingcheckout").lastLocationCreateEvent.signatureVerified = mode !== "automatic-policy-unsigned-mapping";
      if (mode === "automatic-policy-alias") f.registry.inspectAccountLocationReferences = async () => ({ complete: true, references: [accountKey, "legacy-alias"] });
      if (mode === "automatic-policy-identity-manual") {
        original.token = "manual-token"; f.accounts.get(accountKey).token = original.token;
      }
      if (mode === "automatic-policy-identity-alias") f.registry.inspectAccountLocationReferences = async () => ({ complete: true, references: [accountKey, "alias"] });
      if (mode === "automatic-policy-identity-unsigned") f.records.get("pendingcheckout").lastLocationCreateEvent.signatureVerified = false;
      assert.equal(await f.api.approvedBuyerOAuth(accountKey, locationId), false);
    }
    const mapping = require("../smart_trak_object_mapping.json");
    assert.deepEqual(Object.keys(mapping.objects.meet.fields), ["meet", "meet_date", "season", "season_year", "status", "source_system", "source_record_id"]);
    assert.equal(mapping.objects.meet.fields.meet.type, "TEXT");
    assert(mapping.objects.meet_result.fields.meet_name);
    assert(mapping.objects.record.fields.meet_name);
    let sends = 0, values = [], valueWrites = 0, installed = !["automatic-uninstalled", "automatic-policy-worker"].includes(mode), staleValueRead = ['delayed-readback', 'automatic-policy-key-readback'].includes(mode);
    let subscriptionReady = false;
    let locationName = "Buyer's Account", nameWrites = 0;
    f.setProvider((url, options) => {
      const path = new URL(url).pathname;
      if (path === `/saas/get-saas-subscription/${locationId}` && identityModes.includes(mode) && !subscriptionReady) {
        if (mode.endsWith("empty")) return null;
        if (mode.endsWith("malformed")) return [];
        if (mode.endsWith("ambiguous")) return { locationId, data: { locationId, companyId: "agency-one", isSaaSV2: true } };
        if (mode.endsWith("agency-conflict")) return { locationId, companyId: "other-agency", isSaaSV2: true };
        if (mode.endsWith("v2-conflict")) return { locationId, companyId: "agency-one", isSaaSV2: false };
        return { locationId: mode.endsWith("conflict") ? "other" : locationId, isSaaSV2: true, subscriptionStatus: "trialing" };
      }
      if (path === `/saas/get-saas-subscription/${locationId}` && mode.startsWith("automatic-policy-subscription-") && !subscriptionReady) {
        return { locationId: mode.endsWith("wrong-location") ? "different-location" : locationId,
          companyId: "agency-one", isSaaSV2: true,
          subscriptionStatus: mode.endsWith("unknown-status") ? "unknown" : "trialing",
          subscriptionId: mode.endsWith("malformed") ? { invalid: true } : null,
          customerId: "cus", productId: "product", priceId: "price", saasPlanId: "plan" };
      }
      if (path === `/saas/get-saas-subscription/${locationId}`) return { locationId, companyId: "agency-one", isSaaSV2: true, subscriptionStatus: "trialing",
        subscriptionId: "sub", customerId: "cus", productId: "product", priceId: "price", saasPlanId: "plan" };
      if (path === "/saas/saas-plan/plan") return { planId: "plan", companyId: "agency-one", providerLocationId: "QxwjWekSyUf7sDOFHPB4", productId: "product",
        isSaaSV2: true, title: mode === "automatic-wrong-product" ? "Unrelated Product" : policy ? "SMARTCoach Pro 25" : "SMARTCoach Pro 100", trialPeriod: 30, prices: [{ id: "price", active: true, amount: policy ? 19 : 29, currency: "USD", billingInterval: "month" }] };
      if (path === "/oauth/installed-locations") return { items: [{ _id: locationId, isInstalled: installed }] };
      if (path === "/oauth/location-token") return { access_token: "private-fulfillment-buyer", token_type: "Bearer", locationId, expires_in: 86400, scope: buyerScopes };
      if (path === `/locations/${locationId}`) {
        if (options.method === "PUT") {
          assert.equal(mode, "automatic-policy-success", "Name synchronization must be explicitly enabled");
          assert.equal(options.headers.Authorization, "Bearer private-access");
          assert.deepEqual(JSON.parse(options.body), { companyId: "agency-one", name: "School" });
          nameWrites++; locationName = JSON.parse(options.body).name;
        }
        return { location: { id: locationId, companyId: mode === "automatic-policy-identity-wrong-live" ? "other" : "agency-one", name: locationName, email: "buyer@example.com" } };
      }
      if (path === "/locations/QxwjWekSyUf7sDOFHPB4") return { location: { id: "QxwjWekSyUf7sDOFHPB4", companyId: "agency-one" } };
      if (path === `/locations/${locationId}/customFields`) return { customFields: ["missing-fields", "automatic-missing-fields", "automatic-policy-missing-fields"].includes(mode) ? [] : Object.values(mapping.contactFields).map(field => ({ ...field, locationId })) };
      if (path.startsWith("/objects/")) {
        assert.equal(new URL(url).searchParams.get("locationId"), locationId);
        assert.equal(options.headers.Authorization, "Bearer private-fulfillment-buyer");
        const object = Object.values(mapping.objects).find(item => item.internalName === decodeURIComponent(path.split("/")[2]));
        return { object: { key: object.internalName, locationId: mode === "wrong-schema" ? "other" : locationId }, fields: Object.entries(object.fields).filter(([key]) => !(mode === "missing-meet-primary" && object.internalName === "custom_objects.meets" && key === "meet")).map(([key, field]) => ({ id: field.id, locationId, fieldKey: `${object.internalName}.${key}`, dataType: mode === "wrong-field-type" ? "INVALID" : field.type })) };
      }
      if (path === `/locations/${locationId}/customValues`) {
        if (options.method === "POST") { valueWrites++; values = [{ id: "key-value", name: "account_key", value: accountKey, locationId }]; return { customValue: values[0] }; }
        if (staleValueRead && valueWrites) { staleValueRead = false; return { customValues: [] }; }
        return { customValues: mode === "conflicting-value" ? [{ id: "other-key", name: "account_key", value: "sc-other", locationId }] : values };
      }
      if (path === "/contacts/") return { contacts: [{ id: "seller-owner", email: "buyer@example.com", locationId: "QxwjWekSyUf7sDOFHPB4" }] };
      if (path === "/conversations/messages") {
        sends++; assert.equal(options.headers.Authorization, "Bearer private-fulfillment-seller");
        const email = JSON.parse(options.body); assert.equal(email.emailFrom, "info@smartcoach-pro.com");
        assert.equal(email.emailTo, "buyer@example.com"); assert.equal(email.subject, "SMARTCoach Access");
        assert(!email.html.includes(f.accounts.get(accountKey).coachAccessCodes[0]));
        if (["failed-send", "automatic-failed-send", "automatic-policy-failed-send"].includes(mode)) throw new Error("private-send-error");
        return mode === "missing-message" ? {} : { messageId: "fulfillment-message" };
      }
      throw new Error("Unexpected fulfillment provider request");
    });
    if (automatic) {
      const installFirst = ["automatic-install-success", "automatic-missing-mapping"].includes(mode);
      const event = { type: installFirst ? "INSTALL" : "LocationCreate", id: locationId, locationId,
        appId: installFirst ? APP_ID : "6abed80821f5efd8466abccb",
        companyId: "agency-one", email: "buyer@example.com" };
      const verification = { signatureVerified: mode !== "automatic-unsigned", automationSecretFallback: mode === "automatic-fallback" };
      if (mode === "automatic-app") event.appId = "other-app";
      if (mode === "automatic-agency") event.companyId = "other-agency";
      if (mode === "automatic-email") event.email = "other@example.com";
      if (mode === "automatic-pending") f.records.get("pendingcheckout").lastMatchedLocationId = "other-location";
      if (mode === "automatic-missing-mapping") f.accounts.delete(accountKey);
      const before = f.calls.length;
      let result = await f.api.dispatchProvisioningEvent(event, verification);
      if (provisioningDelay) {
        assert.equal(result.status, "waiting_for_provisioning"); assert.equal(result.attempts, 0);
        assert.equal(f.calls.length, before, "Initial signed creation must not inspect provider metadata");
        const queued = structuredClone(f.records.get(`buyerreadiness-${locationId}`));
        assert.equal((await f.api.dispatchProvisioningEvent(event, verification)).status, "waiting_for_provisioning");
        assert.equal(f.calls.length, before); assert.equal(valueWrites, 0); assert.equal(sends, 0);
        assert.deepEqual(f.records.get(`buyerreadiness-${locationId}`), queued);
        f.env.CRON_SECRET = "private-cron-secret-at-least-32-characters";
        f.env.SMARTCOACH_GHL_READINESS_WORKER_ENABLED = "true";
        f.registry.scanBuyerReadinessJobs = async () => ({ cursor: "0", namespaces: [`buyerreadiness-${locationId.toLowerCase()}`] });
        const realLoad = f.registry.loadAccountScopedRecord;
        f.registry.loadAccountScopedRecord = (key, namespace) => realLoad(key,
          namespace === `buyerreadiness-${locationId.toLowerCase()}` ? `buyerreadiness-${locationId}` : namespace);
        const cron = f.request("GET"); cron.headers = { authorization: `Bearer ${f.env.CRON_SECRET}` };
        assert.equal((await f.invoke("ghl-oauth-readiness-cron", cron)).body.buyerStatus, "waiting_for_provisioning");
        assert.equal(f.calls.length, before); assert.equal(sends, 0);
        subscriptionReady = true; f.advance(60000);
        assert.equal((await f.invoke("ghl-oauth-readiness-cron", cron)).body.buyerStatus, "complete");
        const check = f.request(); check.body = { accountKey, locationId, dryRun: true };
        result = (await f.invoke("ghl-oauth-process-readiness", check)).body;
        assert.equal(result.status, "complete"); assert.equal(result.attempts, 1);
        assert.equal(f.records.get(`buyerreadiness-${locationId}`).expiresAt, queued.expiresAt);
        assert.equal(valueWrites, 1); assert.equal(sends, 1);
        assert.equal((await f.invoke("ghl-oauth-readiness-cron", cron)).body.buyerStatus, "existing_access_preserved");
        assert.equal(valueWrites, 1); assert.equal(sends, 1);
      }
      const succeeds = provisioningDelay || ["automatic-success", "automatic-install-success", "automatic-policy-success"].includes(mode);
      const rejectedEvent = ["automatic-unsigned", "automatic-fallback", "automatic-app", "automatic-agency"].includes(mode);
      assert.equal(result.status, succeeds ? "complete" : rejectedEvent ? "event_rejected"
        : ["automatic-policy-identity-missing", "automatic-policy-identity-empty"].includes(mode) ? "waiting_for_subscription_identity"
        : mode === "automatic-policy-subscription-wait" ? "waiting_for_subscription"
        : mode === "automatic-disabled" ? "disabled" : mode === "automatic-missing-mapping" ? "waiting_for_mapping"
          : ["automatic-uninstalled", "automatic-policy-worker"].includes(mode) ? "waiting_for_installation"
          : ["automatic-email", "automatic-pending", "automatic-policy-unsigned-mapping", "automatic-policy-manual", "automatic-policy-alias"].includes(mode) ? "checkout_review_required" : "support_review_required", mode);
      assert.equal(result.deliveryVerified, false); assert.equal(result.automaticFulfillmentReady, false);
      if (["automatic-failed-send", "automatic-policy-failed-send"].includes(mode)) {
        assert.equal(result.failure.stage, "fulfillment_execution");
        assert(["exception", "blocked"].includes(result.failure.kind));
      }
      if (succeeds) assert.equal(result.failure, null);
      const purchaseFailureStage = {
        "automatic-policy-subscription-wrong-location": "purchase_subscription_identity",
        "automatic-policy-subscription-malformed": "purchase_subscription_details",
        "automatic-policy-subscription-unknown-status": "purchase_subscription_details",
      }[mode];
      if (purchaseFailureStage) assert.deepEqual(result.failure, { stage: purchaseFailureStage, kind: "exception",
        ...(mode === "automatic-policy-subscription-wrong-location" ? { identityReason: "conflicting_identity",
          identityChecks: { locationId: "mismatched", companyId: "matched", isSaaSV2: "matched" } } : {}) });
      const identityReason = { "automatic-policy-identity-conflict": "conflicting_identity",
        "automatic-policy-identity-agency-conflict": "conflicting_identity", "automatic-policy-identity-v2-conflict": "conflicting_identity",
        "automatic-policy-identity-ambiguous": "ambiguous_envelope", "automatic-policy-identity-malformed": "malformed_response" }[mode];
      const identityChecks = {
        "automatic-policy-identity-conflict": { locationId: "mismatched", companyId: "missing", isSaaSV2: "matched" },
        "automatic-policy-identity-agency-conflict": { locationId: "matched", companyId: "mismatched", isSaaSV2: "matched" },
        "automatic-policy-identity-v2-conflict": { locationId: "matched", companyId: "matched", isSaaSV2: "mismatched" }
      }[mode];
      if (identityReason) assert.deepEqual(result.failure, { stage: "purchase_subscription_identity", kind: "exception", identityReason,
        ...(identityChecks ? { identityChecks } : {}) });
      if (["wrong-live", "manual", "alias", "unsigned"].some(kind => mode === `automatic-policy-identity-${kind}`)) {
        assert.deepEqual(result.failure, { stage: "purchase_identity_wait_verification", kind: "exception" });
      }
      if (mode === "automatic-policy-success") {
        assert.equal(locationName, "School");
        assert.equal(nameWrites, 1);
        assert.equal(f.records.get(`buyerschoolname-${locationId}`).status, "confirmed");
        await f.api.dispatchProvisioningEvent(event, verification);
        assert.equal(nameWrites, 1, "Repeated events must not rename again");
        assert.equal(sends, 1, "Name synchronization must not duplicate access emails");
        const savedRecords = structuredClone(Array.from(f.records.entries()));
        const savedAccount = structuredClone(f.accounts.get(accountKey));
        f.accounts.set(accountKey, structuredClone(original));
        f.records.delete(`buyeraccess-${locationId}`);
        f.records.delete(`buyerwelcome-${locationId}`);
        Object.assign(f.records.get(`buyerreadiness-${locationId}`), { status: "support_review_required" });
        Object.assign(f.records.get(`buyerpolicy-${locationId}`), { status: "approved" });
        Object.assign(f.records.get(`buyerfulfillment-${locationId}`), { status: "pending",
          steps: { verify_buyer_setup: { status: "attempted", attemptedAt: 1000000 } } });
        Object.assign(f.records.get(`buyerschoolname-${locationId}`), { status: "attempted" });
        const reviewReq = f.request(); reviewReq.body = { accountKey, locationId, reviewSchoolName: true, dryRun: true };
        const stoppedJob = structuredClone(f.records.get(`buyerreadiness-${locationId}`));
        const stoppedFulfillment = structuredClone(f.records.get(`buyerfulfillment-${locationId}`));
        const attemptedName = structuredClone(f.records.get(`buyerschoolname-${locationId}`));
        const writesBefore = f.calls.filter(call => ["POST", "PUT", "PATCH", "DELETE"].includes(call.options.method)).length;
        const namePreview = await f.invoke("ghl-oauth-process-readiness", reviewReq);
        assert.equal(namePreview.statusCode, 200, JSON.stringify(namePreview.body));
        assert.equal(namePreview.body.readbackVerified, true);
        assert.equal(namePreview.body.providerWritePerformed, false);
        assert.equal(namePreview.body.emailSent, false);
        assert(!JSON.stringify(namePreview.body).includes("private-"));
        assert.deepEqual(f.records.get(`buyerschoolname-${locationId}`), attemptedName);
        assert.deepEqual(f.accounts.get(accountKey), original);
        for (const [key, change] of [
          [`buyerreadiness-${locationId}`, { status: "pending" }],
          [`buyerreadiness-${locationId}`, { signatureVerified: false }],
          [`buyerreadiness-${locationId}`, { expiresAt: 1 }],
          [`buyerpolicy-${locationId}`, { buyerAccountKey: "sc-other" }],
          [`buyerpolicy-${locationId}`, { snapshotVerified: false }],
          [`buyerfulfillment-${locationId}`, { fingerprint: "changed" }],
          [`buyerfulfillment-${locationId}`, { steps: { verify_buyer_setup: { status: "attempted" }, ensure_buyer_account_key: { status: "attempted" } } }],
        ]) {
          const before = structuredClone(f.records.get(key));
          f.records.set(key, { ...before, ...change });
          assert.equal((await f.invoke("ghl-oauth-process-readiness", reviewReq)).statusCode, 409);
          assert.deepEqual(f.records.get(`buyerschoolname-${locationId}`), attemptedName);
          f.records.set(key, before);
        }
        f.accounts.get(accountKey).subscription.status = "trialing";
        assert.equal((await f.invoke("ghl-oauth-process-readiness", reviewReq)).statusCode, 409);
        f.accounts.set(accountKey, structuredClone(original));
        for (const change of [
          req => { delete req.headers["x-smartcoach-setup-code"]; },
          req => { req.headers.origin = "https://other.example"; },
          req => { req.method = "GET"; },
          req => { req.body.dryRun = false; },
          req => { req.body.dryRun = false; req.body.confirmReadback = true; req.body.expectedFingerprint = "stale"; },
        ]) {
          const blocked = f.request(); blocked.body = { ...reviewReq.body }; change(blocked);
          assert((await f.invoke("ghl-oauth-process-readiness", blocked)).statusCode >= 400);
          assert.deepEqual(f.records.get(`buyerschoolname-${locationId}`), attemptedName);
        }
        const confirmReq = f.request(); confirmReq.body = { ...reviewReq.body, dryRun: false,
          confirmReadback: true, expectedFingerprint: namePreview.body.fingerprint };
        const confirmedName = await f.invoke("ghl-oauth-process-readiness", confirmReq);
        assert.equal(confirmedName.statusCode, 200, JSON.stringify(confirmedName.body));
        assert.equal(confirmedName.body.ledgerConfirmed, true);
        assert.equal(f.records.get(`buyerschoolname-${locationId}`).confirmationSource, "reviewed_provider_readback");
        assert.equal(f.records.get(`buyerschoolname-${locationId}`).attemptedAt, attemptedName.attemptedAt);
        assert.deepEqual(f.records.get(`buyerreadiness-${locationId}`), stoppedJob);
        assert.deepEqual(f.records.get(`buyerfulfillment-${locationId}`), stoppedFulfillment);
        assert.deepEqual(f.accounts.get(accountKey), original);
        assert.equal((await f.invoke("ghl-oauth-process-readiness", confirmReq)).statusCode, 409);
        assert.equal(f.calls.filter(call => ["POST", "PUT", "PATCH", "DELETE"].includes(call.options.method)).length, writesBefore,
          "Reviewed name confirmation must make no provider writes");
        assert.equal(nameWrites, 1); assert.equal(sends, 1);
        Object.assign(f.records.get(`buyerreadiness-${locationId}`), { failure: { stage: "fulfillment_execution", kind: "exception" } });
        const setupJob = structuredClone(f.records.get(`buyerreadiness-${locationId}`));
        const setupRecords = structuredClone(Array.from(f.records.entries()));
        const setupName = structuredClone(f.records.get(`buyerschoolname-${locationId}`));
        const setupReq = f.request(); setupReq.body = { accountKey, locationId, reviewSetupRecovery: true, dryRun: true };
        const setupPreview = await f.invoke("ghl-oauth-process-readiness", setupReq);
        assert.equal(setupPreview.statusCode, 200, JSON.stringify(setupPreview.body));
        assert.equal(setupPreview.body.setupRecoveryReady, true);
        assert.equal(setupPreview.body.accountUnchanged, true);
        assert.equal(setupPreview.body.emailSent, false);
        assert.equal(setupPreview.body.providerWritePerformed, false);
        assert(!JSON.stringify(setupPreview.body).includes("private-"));
        const businessRecords = entries => entries.filter(([key]) => !key.startsWith("buyergrant-"));
        assert.deepEqual(businessRecords(Array.from(f.records.entries())), businessRecords(setupRecords));
        assert.deepEqual(f.accounts.get(accountKey), original);
        const scopedLoad = f.registry.loadAccountScopedRecord;
        for (const namespace of ["buyerreadiness", "buyerfulfillment", "buyerpolicy", "buyerschoolname", "buyeraccess", "buyerwelcome", "buyersetupreview", "buyerkeyreview", "checkoutidentity"]) {
          f.registry.loadAccountScopedRecord = async (storage, key) => key === `${namespace}-${locationId}`
            ? { error: "unavailable" } : scopedLoad(storage, key);
          assert((await f.invoke("ghl-oauth-process-readiness", setupReq)).statusCode >= 400);
          assert.deepEqual(f.accounts.get(accountKey), original);
        }
        f.registry.loadAccountScopedRecord = scopedLoad;
        for (const [stage, namespace, occurrence] of [
          ["stored_history", `buyerreadiness-${locationId}`, 1],
          ["confirmed_school_name", `buyerschoolname-${locationId}`, 3],
          ["fulfillment_inspection", `checkoutidentity-${locationId}`, 2],
        ]) {
          let reads = 0;
          f.registry.loadAccountScopedRecord = async (storage, key) => {
            if (key === namespace && ++reads === occurrence) throw new TypeError("private-token and buyer@example.com");
            return scopedLoad(storage, key);
          };
          const unavailable = await f.invoke("ghl-oauth-process-readiness", setupReq);
          assert.equal(unavailable.statusCode, 503);
          assert.equal(unavailable.body.error, `Setup recovery requires review at ${stage} (TypeError). Do not repeat recovery.`);
          assert(!JSON.stringify(unavailable.body).includes("private-token"));
          assert(!JSON.stringify(unavailable.body).includes("buyer@example.com"));
          assert.deepEqual(f.accounts.get(accountKey), original);
          assert.equal(f.records.get(`buyersetupreview-${locationId}`), undefined);
          f.registry.loadAccountScopedRecord = scopedLoad;
        }
        const acquireLock = f.registry.acquireAccountScopedLock;
        f.registry.acquireAccountScopedLock = async () => { throw new Error("private storage details"); };
        const lockFailure = await f.invoke("ghl-oauth-process-readiness", setupReq);
        assert.equal(lockFailure.body.error, "Setup recovery requires review at history_lock (unexpected_exception). Do not repeat recovery.");
        f.registry.acquireAccountScopedLock = acquireLock;
        locationName = "Changed name";
        assert.equal((await f.invoke("ghl-oauth-process-readiness", setupReq)).statusCode, 409);
        locationName = "School";
        for (const flag of ["SMARTCOACH_GHL_NEW_BUYER_PLANS", "SMARTCOACH_GHL_BUYER_SCHOOL_NAME_SYNC_ENABLED"]) {
          const previous = f.env[flag]; f.env[flag] = "";
          assert.equal((await f.invoke("ghl-oauth-process-readiness", setupReq)).statusCode, 409);
          f.env[flag] = previous;
        }
        for (const [key, change] of [
          [`buyerreadiness-${locationId}`, { status: "pending" }],
          [`buyerreadiness-${locationId}`, { signatureVerified: false }],
          [`buyerreadiness-${locationId}`, { expiresAt: 1 }],
          [`buyerreadiness-${locationId}`, { attempts: 6 }],
          [`buyerreadiness-${locationId}`, { failure: { stage: "other" } }],
          [`buyerpolicy-${locationId}`, { snapshotVerified: false }],
          [`buyerschoolname-${locationId}`, { status: "attempted" }],
          [`buyerschoolname-${locationId}`, { companyId: "foreign" }],
          [`buyerfulfillment-${locationId}`, { steps: { verify_buyer_setup: { status: "attempted", attemptedAt: 1 }, unknown: {} } }],
          [`buyerfulfillment-${locationId}`, { fingerprint: "changed" }],
        ]) {
          const before = structuredClone(f.records.get(key)); f.records.set(key, { ...before, ...change });
          assert.equal((await f.invoke("ghl-oauth-process-readiness", setupReq)).statusCode, 409);
          assert.deepEqual(f.accounts.get(accountKey), original); f.records.set(key, before);
        }
        for (const namespace of ["buyersetupreview", "buyerkeyreview", "checkoutidentity", "buyeraccess", "buyerwelcome"]) {
          f.records.set(`${namespace}-${locationId}`, {});
          assert.equal((await f.invoke("ghl-oauth-process-readiness", setupReq)).statusCode, 409);
          f.records.delete(`${namespace}-${locationId}`);
        }
        for (const change of [
          req => { delete req.headers["x-smartcoach-setup-code"]; },
          req => { req.headers.origin = "https://other.example"; },
          req => { req.method = "GET"; },
          req => { req.body.dryRun = false; },
          req => { req.body.dryRun = false; req.body.confirmSetupRecovery = true; req.body.expectedFingerprint = "stale"; },
        ]) {
          const blocked = f.request(); blocked.body = { ...setupReq.body }; change(blocked);
          assert((await f.invoke("ghl-oauth-process-readiness", blocked)).statusCode >= 400);
          assert.deepEqual(f.accounts.get(accountKey), original);
        }
        const setupConfirmReq = f.request(); setupConfirmReq.body = { ...setupReq.body, dryRun: false,
          confirmSetupRecovery: true, expectedFingerprint: setupPreview.body.fingerprint };
        f.accounts.get(accountKey).logoUrl = "changed";
        assert.equal((await f.invoke("ghl-oauth-process-readiness", setupConfirmReq)).statusCode, 409);
        f.accounts.set(accountKey, structuredClone(original));
        const scopedSave = f.registry.saveAccountScopedRecord;
        let setupSaves = 0;
        f.registry.saveAccountScopedRecord = async (storage, namespace, record) => {
          const result = await scopedSave(storage, namespace, record);
          f.records.get(namespace).updatedAt = `storage-${++setupSaves}`;
          return result;
        };
        const recoveredSetup = await f.invoke("ghl-oauth-process-readiness", setupConfirmReq);
        assert.equal(recoveredSetup.statusCode, 200, JSON.stringify(recoveredSetup.body));
        assert.equal(recoveredSetup.body.setupRecovered, true);
        assert.equal(recoveredSetup.body.readinessStillStopped, true);
        assert.equal(recoveredSetup.body.emailSent, false);
        assert.equal(recoveredSetup.body.providerWritePerformed, false);
        assert.equal(f.accounts.get(accountKey).subscription.status, "trialing");
        assert.equal(f.accounts.get(accountKey).requireCoachAccess, true);
        assert.equal(f.accounts.get(accountKey).coachAccessCodes.length, 1);
        assert.equal(f.accounts.get(accountKey).token, original.token);
        assert.equal(f.accounts.get(accountKey).accountOwnerEmail, original.accountOwnerEmail);
        assert.deepEqual(f.records.get(`buyerreadiness-${locationId}`), setupJob);
        assert.deepEqual(f.records.get(`buyerschoolname-${locationId}`), setupName);
        assert.equal(f.records.get(`buyerfulfillment-${locationId}`).steps.verify_buyer_setup.status, "confirmed");
        assert.equal(f.records.get(`buyerfulfillment-${locationId}`).steps.verify_buyer_setup.attemptedAt, stoppedFulfillment.steps.verify_buyer_setup.attemptedAt);
        assert.equal(f.records.get(`buyerfulfillment-${locationId}`).steps.ensure_buyer_account_key, undefined);
        assert.equal(f.records.get(`buyersetupreview-${locationId}`).status, "confirmed");
        assert.deepEqual(f.records.get(`buyersetupreview-${locationId}`).originalFulfillment, stoppedFulfillment);
        assert.equal((await f.invoke("ghl-oauth-process-readiness", setupConfirmReq)).statusCode, 409);
        assert.equal(f.calls.filter(call => ["POST", "PUT", "PATCH", "DELETE"].includes(call.options.method)).length, writesBefore);
        assert.equal(nameWrites, 1); assert.equal(sends, 1);
        f.registry.saveAccountScopedRecord = scopedSave;
        for (const stage of ["audit", "setup", "fulfillment", "final-audit", "setup-readback"]) {
          f.records.clear(); for (const [key, value] of structuredClone(setupRecords)) f.records.set(key, value);
          f.accounts.set(accountKey, structuredClone(original));
          const p = await f.invoke("ghl-oauth-process-readiness", setupReq);
          assert.equal(p.statusCode, 200);
          const accountSave = f.registry.saveAccountRecord;
          f.registry.saveAccountScopedRecord = async (storage, namespace, record) => {
            if (stage === "audit" && namespace === `buyersetupreview-${locationId}`
              || stage === "fulfillment" && namespace === `buyerfulfillment-${locationId}`
              || stage === "final-audit" && namespace === `buyersetupreview-${locationId}` && record.status === "confirmed") return { saved: false };
            return scopedSave(storage, namespace, record);
          };
          f.registry.saveAccountRecord = async (key, record) => {
            if (stage === "setup") return { saved: false };
            return accountSave(key, stage === "setup-readback" ? { ...record, token: "changed" } : record);
          };
          const failedReq = f.request(); failedReq.body = { ...setupConfirmReq.body, expectedFingerprint: p.body.fingerprint };
          const failed = await f.invoke("ghl-oauth-process-readiness", failedReq);
          assert.equal(failed.statusCode, 503, stage + JSON.stringify(failed.body));
          assert.deepEqual(f.records.get(`buyerreadiness-${locationId}`), setupJob);
          assert.deepEqual(f.records.get(`buyerschoolname-${locationId}`), setupName);
          assert.equal(f.records.get(`buyeraccess-${locationId}`), undefined);
          assert.equal(f.records.get(`buyerfulfillment-${locationId}`).steps.ensure_buyer_account_key, undefined);
          if (stage === "audit" || stage === "setup") assert.deepEqual(f.accounts.get(accountKey), original);
          if (stage !== "audit") assert.equal((await f.invoke("ghl-oauth-process-readiness", setupReq)).statusCode, 409);
          f.registry.saveAccountRecord = accountSave;
          f.registry.saveAccountScopedRecord = scopedSave;
        }
        assert.equal(nameWrites, 1); assert.equal(sends, 1);
        f.records.clear(); for (const [key, value] of savedRecords) f.records.set(key, value);
        f.accounts.set(accountKey, savedAccount);
      } else assert.equal(nameWrites, 0);
      if (mode === "automatic-policy-key-readback") {
        assert.deepEqual(result.failure, { stage: "key_provider_readback", kind: "exception" });
        assert.equal(valueWrites, 1);
        assert.equal(sends, 0);
        const repeated = await f.api.dispatchProvisioningEvent(event, verification);
        assert.equal(repeated.status, "support_review_required");
        assert.equal(valueWrites, 1, "uncertain readback must never repeat the write");
        assert.equal(sends, 0);
      }
      const readinessReq = f.request(); readinessReq.body = { accountKey, locationId };
      const providerCalls = f.calls.length;
      const storedBeforeInspection = JSON.stringify(Array.from(f.records.entries()));
      const readinessPreview = await f.invoke("ghl-oauth-process-readiness", readinessReq);
      assert.equal(readinessPreview.statusCode, 200);
      assert.equal(f.calls.length, providerCalls, "readiness status must not contact the provider");
      assert.equal(JSON.stringify(Array.from(f.records.entries())), storedBeforeInspection, "inspection must preserve saved jobs");
      if (mode !== "automatic-disabled") {
        assert(readinessPreview.body.savedEvidence);
        assert.equal(readinessPreview.body.savedEvidence.fulfillmentStatus, succeeds ? "complete"
          : ["automatic-failed-send", "automatic-policy-failed-send", "automatic-policy-key-readback"].includes(mode) ? "pending" : "not_recorded");
        assert(!JSON.stringify(readinessPreview.body).includes("private-fulfillment"));
        assert(!JSON.stringify(readinessPreview.body.savedEvidence).includes("fingerprint"));
        assert.equal(readinessPreview.body.savedEvidence.schoolNameStatus, mode === "automatic-policy-success" ? "confirmed" : "not_recorded");
      } else assert.equal(readinessPreview.body.savedEvidence, undefined);
      if (succeeds) {
        const schoolKey = `buyerschoolname-${locationId}`;
        const savedSchool = f.records.get(schoolKey);
        for (const status of ["attempted", "confirmed", "private-provider-error"]) {
          f.records.set(schoolKey, { buyerAccountKey: accountKey, locationId, companyId: "agency-one", status,
            schoolName: "private-school-name", fingerprint: "private-fingerprint", token: "private-school-token" });
          const before = JSON.stringify(Array.from(f.records.entries()));
          const readback = await f.invoke("ghl-oauth-process-readiness", readinessReq);
          assert.equal(readback.statusCode, 200);
          assert.equal(readback.body.savedEvidence.schoolNameStatus, status.startsWith("private-") ? "not_recorded" : status);
          assert(!JSON.stringify(readback.body).includes("private-school"));
          assert(!JSON.stringify(readback.body).includes("private-fingerprint"));
          assert.equal(JSON.stringify(Array.from(f.records.entries())), before);
        }
        for (const conflict of [{ buyerAccountKey: "sc-other-buyer" }, { locationId: "other-location" }, { companyId: "other-agency" }]) {
          f.records.set(schoolKey, { buyerAccountKey: accountKey, locationId, companyId: "agency-one", status: "confirmed", ...conflict });
          assert.equal((await f.invoke("ghl-oauth-process-readiness", readinessReq)).statusCode, 503);
        }
        if (savedSchool) f.records.set(schoolKey, savedSchool);
        else f.records.delete(schoolKey);
        assert.equal(f.calls.length, providerCalls, "School name ledger inspection must not contact the provider");
        const key = `buyerfulfillment-${locationId}`;
        const savedJob = f.records.get(key);
        f.records.set(key, { ...savedJob, buyerAccountKey: "sc-other-buyer" });
        assert.equal((await f.invoke("ghl-oauth-process-readiness", readinessReq)).statusCode, 503);
        f.records.set(key, savedJob);
        assert.equal(f.calls.length, providerCalls);
      }
      if (!rejectedEvent && mode !== "automatic-disabled") {
        const job = f.records.get(`buyerreadiness-${locationId}`);
        assert.equal(job.buyerAccountKey, accountKey);
        assert.equal(job.signatureVerified, true);
        assert.equal(job.attempts, 1);
        assert(!JSON.stringify(job).includes("private-fulfillment"));
        if (["automatic-missing-mapping", "automatic-uninstalled"].includes(mode)) {
          assert(job.nextAttemptAt > 1000000);
          const earlyReq = f.request(); earlyReq.body = { accountKey, locationId, dryRun: false, confirmExecution: true };
          assert.equal((await f.invoke("ghl-oauth-process-readiness", earlyReq)).body.status, result.status);
          assert.equal(f.calls.length, providerCalls, "backoff must not make provider calls");
        }
      }
      for (const invalid of ["no-admin", "wrong-origin", "get", "unconfirmed"]) {
        const req = f.request(); req.body = { accountKey, locationId };
        if (invalid === "no-admin") delete req.headers["x-smartcoach-setup-code"];
        if (invalid === "wrong-origin") req.headers.origin = "https://other.example";
        if (invalid === "get") req.method = "GET";
        if (invalid === "unconfirmed") req.body.dryRun = false;
        assert.equal((await f.invoke("ghl-oauth-process-readiness", req)).statusCode,
          invalid === "get" ? 405 : invalid === "unconfirmed" ? 409 : 403);
      }
      assert.equal(sends, succeeds || ["automatic-failed-send", "automatic-policy-failed-send"].includes(mode) ? 1 : 0);
      if (succeeds) {
        assert.equal(f.accounts.get(accountKey).subscription.status, "trialing");
        assert.equal(f.accounts.get(accountKey).subscription.amount, policy ? "19.00" : "29.00");
        if (policy) {
          assert.equal(f.records.get(`buyerpolicy-${locationId}`).status, "complete");
          assert.equal(await f.api.approvedBuyerOAuth(accountKey, locationId), true);
          assert.equal(await f.api.approvedBuyerOAuth("sc-12345678901234567890", "12345678901234567890"), false);
        }
        assert.equal((await f.api.dispatchProvisioningEvent(event, verification)).status, "existing_access_preserved");
        assert.equal(sends, 1); assert.equal(valueWrites, 1);
      } else if (["automatic-failed-send", "automatic-policy-failed-send"].includes(mode)) {
        assert.equal(f.records.get(`buyeraccess-${locationId}`).status, "attempted");
        assert.equal((await f.api.dispatchProvisioningEvent(event, verification)).status, "support_review_required");
        assert.equal(sends, 1);
        if (policy) assert.equal(await f.api.approvedBuyerOAuth(accountKey, locationId), false);
      } else if (mode === "automatic-policy-key-readback") {
        assert.equal(valueWrites, 1);
        assert.equal(f.records.get(`buyerfulfillment-${locationId}`).steps.ensure_buyer_account_key.status, "attempted");
        assert.equal(await f.api.approvedBuyerOAuth(accountKey, locationId), false);
      } else {
        assert.equal(valueWrites, 0);
        if (mode !== "automatic-missing-mapping") assert.deepEqual(f.accounts.get(accountKey), original);
      }
      if (rejectedEvent || mode === "automatic-disabled") assert.equal(f.calls.length, before);
      if (mode === "automatic-missing-mapping") {
        // INSTALL arriving first must not invent a checkout or location mapping.
        f.accounts.set(accountKey, structuredClone(original));
        f.advance(60000);
        const resume = f.request(); resume.body = { accountKey, locationId, dryRun: false, confirmExecution: true };
        assert.equal((await f.invoke("ghl-oauth-process-readiness", resume)).body.status, "complete");
        assert.equal(sends, 1);
      }
      if (mode === "automatic-uninstalled") {
        installed = true;
        f.advance(60000);
        const resume = f.request(); resume.body = { accountKey, locationId, dryRun: false, confirmExecution: true };
        assert.equal((await f.invoke("ghl-oauth-process-readiness", resume)).body.status, "complete");
        assert.equal(sends, 1);
      }
      if (["automatic-policy-identity-missing", "automatic-policy-identity-empty"].includes(mode)) {
        const waitingJob = structuredClone(f.records.get(`buyerreadiness-${locationId}`));
        assert.equal(valueWrites, 0); assert.equal(sends, 0);
        assert.equal(f.records.get(`buyerpolicy-${locationId}`), undefined);
        subscriptionReady = true;
        f.env.CRON_SECRET = "private-cron-secret-at-least-32-characters";
        f.env.SMARTCOACH_GHL_READINESS_WORKER_ENABLED = "true";
        f.registry.scanBuyerReadinessJobs = async () => ({ cursor: "0", namespaces: [`buyerreadiness-${locationId.toLowerCase()}`] });
        const realLoad = f.registry.loadAccountScopedRecord;
        f.registry.loadAccountScopedRecord = (key, namespace) => realLoad(key,
          namespace === `buyerreadiness-${locationId.toLowerCase()}` ? `buyerreadiness-${locationId}` : namespace);
        const cron = f.request("GET"); cron.headers = { authorization: `Bearer ${f.env.CRON_SECRET}` };
        assert.equal((await f.invoke("ghl-oauth-readiness-cron", cron)).body.buyerStatus, "waiting_for_subscription_identity");
        assert.equal(valueWrites, 0); assert.equal(sends, 0);
        f.advance(60000);
        assert.equal((await f.invoke("ghl-oauth-readiness-cron", cron)).body.buyerStatus, "complete");
        assert.equal(f.records.get(`buyerreadiness-${locationId}`).attempts, 2);
        assert.equal(f.records.get(`buyerreadiness-${locationId}`).expiresAt, waitingJob.expiresAt);
        assert.equal(valueWrites, 1); assert.equal(sends, 1);
        assert.equal((await f.invoke("ghl-oauth-readiness-cron", cron)).body.buyerStatus, "existing_access_preserved");
        assert.equal(valueWrites, 1); assert.equal(sends, 1);
      } else if (identityModes.includes(mode) && !provisioningDelay) {
        subscriptionReady = true; f.advance(60000);
        assert.equal((await f.api.dispatchProvisioningEvent(event, verification)).status, "support_review_required");
        assert.equal(valueWrites, 0); assert.equal(sends, 0);
      }
      if (mode === "automatic-policy-subscription-wait") {
        const waitingJob = structuredClone(f.records.get(`buyerreadiness-${locationId}`));
        assert.equal(waitingJob.attempts, 1);
        assert.equal(f.records.get(`buyerpolicy-${locationId}`), undefined);
        assert.equal(valueWrites, 0); assert.equal(sends, 0);
        subscriptionReady = true;
        const resume = f.request(); resume.body = { accountKey, locationId, dryRun: false, confirmExecution: true };
        assert.equal((await f.invoke("ghl-oauth-process-readiness", resume)).body.status, "waiting_for_subscription");
        f.advance(60000);
        assert.equal((await f.invoke("ghl-oauth-process-readiness", resume)).body.status, "complete");
        assert.equal(f.records.get(`buyerreadiness-${locationId}`).attempts, 2);
        assert.equal(f.records.get(`buyerreadiness-${locationId}`).expiresAt, waitingJob.expiresAt);
        assert.equal(valueWrites, 1); assert.equal(sends, 1);
      } else if (mode.startsWith("automatic-policy-subscription-")) {
        subscriptionReady = true; f.advance(60000);
        assert.equal((await f.api.dispatchProvisioningEvent(event, verification)).status, "support_review_required");
        assert.equal(valueWrites, 0); assert.equal(sends, 0);
      }
      if (mode === "automatic-policy-worker") {
        f.env.CRON_SECRET = "private-cron-secret-at-least-32-characters";
        const cron = f.request("GET"); cron.headers = { authorization: `Bearer ${f.env.CRON_SECRET}` };
        const beforeWorker = f.calls.length;
        assert.equal((await f.invoke("ghl-oauth-readiness-cron", cron)).body.status, "disabled");
        assert.equal(f.calls.length, beforeWorker);
        assert.equal((await f.invoke("ghl-oauth-readiness-cron", { ...cron, headers: {} })).statusCode, 403);
        assert.equal((await f.invoke("ghl-oauth-readiness-cron", { ...cron, method: "POST" })).statusCode, 405);
        f.env.SMARTCOACH_GHL_READINESS_WORKER_ENABLED = "true";
        f.registry.scanBuyerReadinessJobs = async () => ({ cursor: "0", namespaces: [`buyerreadiness-${locationId.toLowerCase()}`] });
        const realLoad = f.registry.loadAccountScopedRecord;
        f.registry.loadAccountScopedRecord = (key, namespace) => realLoad(key, namespace === `buyerreadiness-${locationId.toLowerCase()}` ? `buyerreadiness-${locationId}` : namespace);
        installed = true; f.advance(60000);
        const processed = await f.invoke("ghl-oauth-readiness-cron", cron);
        assert.equal(processed.body.buyerStatus, "complete", JSON.stringify(processed.body));
        assert.equal(sends, 1);
        assert.equal(await f.api.approvedBuyerOAuth(accountKey, locationId), true);
        assert.equal((await f.invoke("ghl-oauth-readiness-cron", cron)).body.buyerStatus, "existing_access_preserved");
        assert.equal(sends, 1);
      }
      for (const secret of ["private-fulfillment-buyer", "private-fulfillment-seller", "private-admin", "private-send-error"]) {
        assert(!JSON.stringify(result).includes(secret));
      }
      if (["automatic-policy-success", "automatic-policy-missing-fields", "automatic-policy-unsigned-mapping", "automatic-policy-alias"].includes(mode)) {
        const diagnosticsReq = f.request(); diagnosticsReq.body = { accountKey, locationId, dryRun: true, inspectPrerequisites: true };
        const jobsBefore = JSON.stringify(Array.from(f.records.entries()).filter(([key]) => /buyer(readiness|policy|fulfillment|access)-/.test(key)));
        const accountBefore = structuredClone(f.accounts.get(accountKey));
        const writesBefore = valueWrites, sendsBefore = sends;
        const diagnostics = await f.invoke("ghl-oauth-process-readiness", diagnosticsReq);
        assert.equal(diagnostics.statusCode, 200);
        assert.equal(diagnostics.body.prerequisites.stage, mode === "automatic-policy-success" ? "verified"
          : mode === "automatic-policy-missing-fields" ? "snapshot" : "qualification");
        if (mode === "automatic-policy-alias") {
          assert.deepEqual(diagnostics.body.prerequisites.inventory, { complete: true, referenceCount: 2, buyerMatched: true, reason: null });
          assert(!JSON.stringify(diagnostics.body).includes("legacy-alias"));
        }
        assert.equal(sends, sendsBefore); assert.equal(valueWrites, writesBefore);
        assert.deepEqual(f.accounts.get(accountKey), accountBefore);
        assert.equal(JSON.stringify(Array.from(f.records.entries()).filter(([key]) => /buyer(readiness|policy|fulfillment|access)-/.test(key))), jobsBefore);
        assert(!JSON.stringify(diagnostics.body).includes("private-fulfillment"));
        if (mode === "automatic-policy-success") {
          const namespace = `buyerfulfillment-${locationId}`;
          const oldJob = structuredClone(f.records.get(namespace));
          f.records.get(namespace).steps.ensure_buyer_account_key.status = "attempted";
          const keyReviewRecords = () => Array.from(f.records.entries()).filter(([key]) => !key.startsWith("buyergrant-"));
          const beforeKeyReview = JSON.stringify(keyReviewRecords());
          const correct = [{ id: "key-value", name: "account_key", value: accountKey, locationId }];
          for (const candidate of [correct, [], [...correct, ...correct], [{ ...correct[0], value: "other" }],
            [{ ...correct[0], locationId: "other" }], [{ ...correct[0], id: null }]]) {
            values = candidate;
            const reviewed = await f.invoke("ghl-oauth-process-readiness", diagnosticsReq);
            assert.equal(reviewed.statusCode, 200);
            assert.deepEqual(reviewed.body.accountKeyReadback, { readVerified: true, exactMatch: candidate === correct,
              matchCount: candidate.length, providerWritePerformed: false });
            assert.equal(sends, sendsBefore); assert.equal(valueWrites, writesBefore);
            assert.equal(JSON.stringify(keyReviewRecords()), beforeKeyReview);
            assert.deepEqual(f.accounts.get(accountKey), accountBefore);
          }
          f.records.set(namespace, oldJob);
          values = correct;
          const recoveryJob = structuredClone(f.records.get(`buyerreadiness-${locationId}`));
          Object.assign(recoveryJob, { status: "support_review_required", attempts: 1, emailAccepted: false });
          const recoveryAudit = { buyerAccountKey: accountKey, locationId, status: "approved", fingerprint: 'a'.repeat(64),
            approvedAt: 1000000, originalJob: recoveryJob };
          f.records.set(`buyerrecovery-${locationId}`, recoveryAudit);
          f.records.set(`buyerreadiness-${locationId}`, { ...recoveryJob, attempts: 4,
            recovery: { fingerprint: recoveryAudit.fingerprint, approvedAt: recoveryAudit.approvedAt,
              originalStatus: recoveryJob.status, originalAttempts: 1 } });
          f.records.get(`buyerpolicy-${locationId}`).status = "approved";
          const stoppedFulfillment = structuredClone(oldJob);
          stoppedFulfillment.status = "pending";
          stoppedFulfillment.steps.ensure_buyer_account_key.status = "attempted";
          delete stoppedFulfillment.steps.create_head_coach_and_send_seller_access;
          f.records.set(namespace, stoppedFulfillment);
          f.records.delete(`buyeraccess-${locationId}`);
          const stoppedAccount = f.accounts.get(accountKey);
          stoppedAccount.coachStaff = []; delete stoppedAccount.accessCode; delete stoppedAccount.lastStaffSync;
          const beforeKeyRecovery = JSON.stringify(keyReviewRecords());
          const buyerBeforeKeyRecovery = structuredClone(stoppedAccount);
          const recoveryReq = f.request(); recoveryReq.body = { accountKey, locationId, reviewKeyRecovery: true, dryRun: true };
          const keyPreview = await f.invoke("ghl-oauth-process-readiness", recoveryReq);
          assert.equal(keyPreview.statusCode, 200, keyPreview.body.error);
          assert.equal(keyPreview.body.keyRecoveryReady, true);
          assert.equal(keyPreview.body.providerWritePerformed, false);
          assert.equal(JSON.stringify(keyReviewRecords()), beforeKeyRecovery);
          assert.deepEqual(f.accounts.get(accountKey), buyerBeforeKeyRecovery);
          assert.equal(valueWrites, writesBefore); assert.equal(sends, sendsBefore);
          for (const invalid of ["no-admin", "wrong-origin", "get", "unconfirmed", "stale"]) {
            const request = f.request(); request.body = { ...recoveryReq.body };
            if (invalid === "no-admin") delete request.headers["x-smartcoach-setup-code"];
            if (invalid === "wrong-origin") request.headers.origin = "https://other.example";
            if (invalid === "get") request.method = "GET";
            if (["unconfirmed", "stale"].includes(invalid)) Object.assign(request.body, { dryRun: false,
              confirmRecovery: invalid === "stale", expectedFingerprint: "stale" });
            assert.equal((await f.invoke("ghl-oauth-process-readiness", request)).statusCode,
              invalid === "get" ? 405 : ["unconfirmed", "stale"].includes(invalid) ? 409 : 403);
            assert.equal(JSON.stringify(keyReviewRecords()), beforeKeyRecovery);
          }
          recoveryReq.body = { ...recoveryReq.body, dryRun: false, confirmRecovery: true, expectedFingerprint: keyPreview.body.fingerprint };
          const recovered = await f.invoke("ghl-oauth-process-readiness", recoveryReq);
          assert.equal(recovered.statusCode, 200, recovered.body.error);
          assert.equal(recovered.body.status, "complete");
          assert.equal(recovered.body.emailAccepted, true);
          assert.equal(valueWrites, writesBefore, "key recovery must not repeat a provider write");
          assert.equal(sends, sendsBefore + 1);
          assert.equal(f.records.get(`buyerkeyreview-${locationId}`).originalReadiness.attempts, 4);
          assert.equal(f.records.get(`buyerreadiness-${locationId}`).attempts, 5);
          assert.deepEqual(f.records.get(`buyerrecovery-${locationId}`), recoveryAudit);
          assert.equal((await f.invoke("ghl-oauth-process-readiness", recoveryReq)).statusCode, 409);
          assert.equal(sends, sendsBefore + 1);
        }
      }
      continue;
    }
    const req = f.request(); req.body = { accountKey, locationId, dryRun: true };
    const inheritedHeaders = req.headers;
    delete req.headers;
    Object.setPrototypeOf(req, { get headers() { return inheritedHeaders; } });
    const preview = await f.invoke("ghl-oauth-fulfill-buyer", req);
    assert.equal(preview.statusCode, 200, `${mode}: ${preview.body.error || ""}`); assert.equal(preview.body.steps.length, 3);
    assert.equal(preview.body.controlledExecutionEnabled,
      !['disabled', 'controlled-wildcard', 'controlled-other-account', 'controlled-malformed'].includes(mode));
    assert.deepEqual(f.accounts.get(accountKey), original); assert.equal(sends, 0); assert.equal(valueWrites, 0);
    const snapshotReq = f.request(); snapshotReq.body = { accountKey, locationId, dryRun: true, verifySnapshot: true };
    const snapshot = await f.invoke("ghl-oauth-fulfill-buyer", snapshotReq);
    const invalidSnapshot = ["missing-scope", "missing-fields", "missing-meet-primary", "wrong-schema", "wrong-field-type"].includes(mode);
    assert.equal(snapshot.statusCode, invalidSnapshot ? mode === "missing-scope" ? 403 : 409 : 200, `${mode}: snapshot`);
    if (!invalidSnapshot) {
      assert.deepEqual(snapshot.body.snapshot, { verified: true,
        contactFieldCount: Object.keys(mapping.contactFields).length, objectCount: Object.keys(mapping.objects).length });
      assert.equal(snapshot.body.accountUnchanged, true); assert.equal(snapshot.body.emailSent, false);
      assert.equal(snapshot.body.automaticFulfillmentReady, false);
    }
    assert.deepEqual(f.accounts.get(accountKey), original); assert.equal(sends, 0); assert.equal(valueWrites, 0);
    for (const denied of ["no-admin", "wrong-origin", "wrong-buyer"]) {
      const rejected = f.request(); rejected.body = { ...snapshotReq.body };
      if (denied === "no-admin") delete rejected.headers["x-smartcoach-setup-code"];
      if (denied === "wrong-origin") rejected.headers.origin = "https://other.example";
      if (denied === "wrong-buyer") rejected.body.accountKey = "sc-other";
      const before = f.calls.length;
      assert.equal((await f.invoke("ghl-oauth-fulfill-buyer", rejected)).statusCode, denied === "wrong-buyer" ? 422 : 403);
      assert.equal(f.calls.length, before);
    }
    assert(!JSON.stringify(snapshot).includes("private-fulfillment-buyer"));
    req.body = { ...req.body, dryRun: false, confirmExecution: true, expectedFingerprint: preview.body.fingerprint };
    if (mode === 'controlled-no-confirm') req.body.confirmExecution = false;
    if (mode === 'controlled-stale') req.body.expectedFingerprint = 'stale';
    if (mode === 'disabled') req.body.fulfillmentExecutionEnabled = true;
    if (mode === "no-admin") delete req.headers["x-smartcoach-setup-code"];
    if (mode === "wrong-origin") req.headers.origin = "https://other.example";
    if (mode === "wrong-buyer") req.body.accountKey = "sc-other";
    const beforeExecuteCalls = f.calls.length;
    const result = await f.invoke("ghl-oauth-fulfill-buyer", req);
    assert.equal(result.statusCode, success ? 200 : ["delayed-readback", "failed-send", "missing-message"].includes(mode) ? 502 : mode === "wrong-buyer" ? 422 : ["no-admin", "wrong-origin", "missing-scope"].includes(mode) ? 403 : 409, `${mode}: ${result.body.error || ""}`);
    assert.equal(sends, success || ["failed-send", "missing-message"].includes(mode) ? 1 : 0);
    if (['disabled', 'controlled-wildcard', 'controlled-other-account', 'controlled-malformed'].includes(mode)) {
      assert.equal(f.calls.length, beforeExecuteCalls);
    }
    if (mode === 'delayed-readback') {
      assert.equal((await f.invoke('ghl-oauth-fulfill-buyer', req)).statusCode, 409);
      const review = f.request(); review.body = { accountKey, locationId, reviewInterruptedWrite: true, dryRun: true };
      const verified = await f.invoke('ghl-oauth-fulfill-buyer', review);
      assert.equal(verified.statusCode, 200, JSON.stringify({ error: verified.body.error, job: f.records.get(`buyerfulfillment-${locationId}`) })); assert.equal(verified.body.interruptedWriteVerified, true);
      assert.equal(valueWrites, 1); assert.equal(sends, 0);
      review.body = { ...review.body, dryRun: false, confirmRecovery: true, expectedFingerprint: 'stale' };
      assert.equal((await f.invoke('ghl-oauth-fulfill-buyer', review)).statusCode, 409);
      review.body.expectedFingerprint = verified.body.fingerprint;
      review.body.confirmRecovery = false;
      assert.equal((await f.invoke('ghl-oauth-fulfill-buyer', review)).statusCode, 409);
      review.body.confirmRecovery = true;
      values[0].value = 'other';
      assert.equal((await f.invoke('ghl-oauth-fulfill-buyer', review)).statusCode, 409);
      values[0].value = accountKey;
      const recovered = await f.invoke('ghl-oauth-fulfill-buyer', review);
      assert.equal(recovered.statusCode, 200); assert.equal(recovered.body.recoveryRecorded, true);
      assert.equal(recovered.body.providerWritePerformed, false); assert.equal(recovered.body.emailSent, false);
      assert.equal(valueWrites, 1); assert.equal(sends, 0);
      assert.equal((await f.invoke('ghl-oauth-fulfill-buyer', review)).statusCode, 409);
      assert.equal((await f.invoke('ghl-oauth-fulfill-buyer', req)).statusCode, 200);
      assert.equal(valueWrites, 1); assert.equal(sends, 1);
      assert.equal((await f.invoke('ghl-oauth-fulfill-buyer', req)).statusCode, 200);
      assert.equal(valueWrites, 1); assert.equal(sends, 1);
    } else if (success) {
      assert.equal(f.accounts.get(accountKey).subscription.amount, "29.00");
      assert.equal(f.accounts.get(accountKey).subscription.status, "trialing");
      assert.equal(f.accounts.get(accountKey).token, ""); assert.equal(f.accounts.get(accountKey).coachStaff.length, 1);
      assert.equal((await f.invoke("ghl-oauth-fulfill-buyer", req)).statusCode, 200);
      assert.equal(sends, 1); assert.equal(valueWrites, 1);
    } else if (["failed-send", "missing-message"].includes(mode)) {
      assert.equal((await f.invoke("ghl-oauth-fulfill-buyer", req)).statusCode, 409);
      assert.equal(sends, 1); assert.equal(f.records.get(`buyeraccess-${locationId}`).status, "attempted");
    } else if (mode === "conflicting-value") {
      assert.equal(valueWrites, 0); assert.equal(f.accounts.get(accountKey).coachStaff.length, 0);
      assert.equal((await f.invoke("ghl-oauth-fulfill-buyer", req)).statusCode, 409);
    } else { assert.deepEqual(f.accounts.get(accountKey), original); }
    for (const secret of ["private-fulfillment-buyer", "private-fulfillment-seller", "private-send-error",
      ...f.accounts.get(accountKey).coachAccessCodes]) assert(!JSON.stringify(result).includes(secret));
  }

  const catalog = { planId: "plan", companyId: "agency", providerLocationId: "seller", productId: "product", isSaaSV2: true,
    title: "SMARTCoach Pro 100", trialPeriod: 30, prices: [{ id: "price", billingInterval: "month", active: true, amount: 29, currency: "USD" }] };
  assert.equal(verifySaasCatalogPurchase(catalogSubscription, catalog, "agency", "seller").purchaseVerified, true);
  for (const [title, monthly, annual] of [["SMARTCoach Pro 25", 19, 199], ["SMARTCoach Pro 100", 29, 299], ["SMARTCoach Pro 200", 39, 399]]) {
    for (const [interval, amount] of [["month", monthly], ["year", annual]]) {
      for (const trialDays of [0, 7, 14, 30, 365]) {
        const offer = structuredClone(catalog);
        offer.title = title;
        offer.trialPeriod = trialDays;
        offer.prices[0].billingInterval = interval;
        offer.prices[0].amount = amount;
        const verified = verifySaasCatalogPurchase(catalogSubscription, offer, "agency", "seller");
        assert.equal(verified.purchaseVerified, true);
        assert.equal(verified.planTrialDays, trialDays);
      }
    }
  }
  for (const mutate of [
    c => { c.planId = "other"; }, c => { c.companyId = "other"; }, c => { c.providerLocationId = "buyer"; },
    c => { c.productId = "other"; }, c => { c.isSaaSV2 = false; }, c => { c.title += " Monthly"; },
    c => { c.title = "SMARTCoach Pro Unlimited"; }, c => { c.title = "SMARTCoach Essential"; },
    c => { c.prices = []; }, c => { c.prices.push({ ...c.prices[0] }); }, c => { c.prices[0].active = false; },
    c => { c.prices[0].currency = "AED"; }, c => { c.prices[0].amount = 2900; },
    c => { c.prices[0].amount = null; }, c => { c.prices[0].billingInterval = "week"; },
    c => { delete c.trialPeriod; }, c => { c.trialPeriod = "30"; }, c => { c.trialPeriod = -1; },
  ]) {
    const invalid = structuredClone(catalog);
    mutate(invalid);
    assert.equal(verifySaasCatalogPurchase(catalogSubscription, invalid, "agency", "seller").purchaseVerified, false);
  }
  const annualCatalog = structuredClone(catalog);
  annualCatalog.prices[0].billingInterval = "year";
  annualCatalog.prices[0].amount = "299";
  assert.equal(verifySaasCatalogPurchase(catalogSubscription, annualCatalog, "agency", "seller").purchasedBillingCadence, "annual");
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

  for (const mode of ["valid", "missing-location-read", "agency-scope-on-location", "extra-write", "cached-old-scopes"]) {
    const mixed = fixture();
    if (mode !== "cached-old-scopes") mixed.env.SMARTCOACH_GHL_OAUTH_SCOPES += " saas/company.read saas/location.read";
    mixed.setResponse({ ...mixed.grant(), scope: mixed.env.SMARTCOACH_GHL_OAUTH_SCOPES });
    const auth = await mixed.start();
    assert.equal((await mixed.invoke("crm-connect-callback", mixed.callbackReq(auth))).statusCode, 200);
    mixed.accounts.set(accountKey, { locationId, token: "keep-pit" });
    mixed.setProvider((url) => {
      const path = new URL(url).pathname;
      if (path === "/oauth/installed-locations") return { items: [{ _id: locationId, isInstalled: true }] };
      if (path === `/locations/${locationId}`) return { location: { id: locationId, companyId: "agency-one" } };
      if (path === "/oauth/location-token") {
        const expanded = mixed.env.SMARTCOACH_GHL_OAUTH_SCOPES.includes("saas/location.read");
        return { access_token: "private-mixed-buyer", token_type: "Bearer", expires_in: 86400, locationId,
          scope: "locations.readonly" + (expanded && mode !== "missing-location-read" ? " saas/location.read" : "")
            + (mode === "agency-scope-on-location" ? " saas/company.read" : "") + (mode === "extra-write" ? " saas/location.write" : "") };
      }
      return {};
    });
    if (["missing-location-read", "agency-scope-on-location", "extra-write"].includes(mode)) {
      await assert.rejects(mixed.api.buyerGrant(accountKey, locationId), /permissions/);
      assert(!mixed.records.has(`buyergrant-${locationId}`));
    } else {
      await mixed.api.buyerGrant(accountKey, locationId);
      if (mode === "cached-old-scopes") {
        mixed.env.SMARTCOACH_GHL_OAUTH_SCOPES += " saas/company.read saas/location.read";
        mixed.setResponse({ ...mixed.grant(), scope: mixed.env.SMARTCOACH_GHL_OAUTH_SCOPES });
        const reauth = await mixed.start();
        await mixed.invoke("crm-connect-callback", mixed.callbackReq(reauth));
        await mixed.api.buyerGrant(accountKey, locationId);
        assert.equal(mixed.calls.filter((c) => new URL(c.url).pathname === "/oauth/location-token").length, 2);
      }
    }
    assert.equal(mixed.accounts.get(accountKey).token, "keep-pit");
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

  for (const mode of ["success", "oauth-no-pit", "no-admin", "wrong-origin", "no-confirm", "wrong-owner", "wrong-plan", "staff-exists", "not-ready", "essential", "blocked", "inactive", "wrong-seller", "wrong-contact", "failed-send", "missing-message", "save-failed"]) {
    const access = fixture();
    access.env.SMARTCOACH_WELCOME_SELLER_TOKEN = "private-seller-token";
    access.env.SMARTCOACH_WELCOME_FROM_EMAIL = "info@smartcoach-pro.com";
    access.env.SMARTCOACH_GHL_OAUTH_SCOPES = "oauth.write locations.readonly contacts.readonly";
    access.setResponse({ ...access.grant(), scope: access.env.SMARTCOACH_GHL_OAUTH_SCOPES });
    const pending = await access.start();
    await access.invoke("crm-connect-callback", access.callbackReq(pending));
    const original = { accountKey, locationId, token: mode === "oauth-no-pit" ? "" : "existing-pit", accountOwnerEmail: "support@example.com", productPlan: "pro100",
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
    assert.equal(result.statusCode, ["success", "oauth-no-pit"].includes(mode) ? 200 : ["no-admin", "wrong-origin", "wrong-seller", "wrong-contact"].includes(mode) ? 403 : ["failed-send", "missing-message"].includes(mode) ? 502 : mode === "save-failed" ? 503 : 409, mode);
    assert.equal(sends, ["success", "oauth-no-pit", "failed-send", "missing-message"].includes(mode) ? 1 : 0, mode);
    const record = access.accounts.get(accountKey);
    assert.equal(record.token, original.token); assert.deepEqual(record.coachAccessCodes, mode === "not-ready" ? [] : ["shared-old-code"]); assert.equal(record.coachCodeVersion, 7);
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
  let cookieConfirmed = true;
  const context = vm.createContext({ URL, document: { getElementById: (id) => nodes[id] }, window: { location: { assign: (url) => navigations.push(url) } }, setStatus: (...args) => statuses.push(args), fetch: async (url, options) => { pageCalls.push({ url, options }); return { ok: true, json: async () => url.endsWith('ghl-oauth-check-state') ? { stateCookieVerified: cookieConfirmed } : pageResponse }; } });
  vm.runInContext(connectionCode, context);
  nodes.ghlOAuthReadinessBtn = { disabled: false };
  nodes.accountKey = { value: 'sc-abcdefghijklmnopqrst' };
  nodes.locationId = { value: 'AbCdEfGhIjKlMnOpQrSt' };
  nodes.setupCode.value = 'private-admin';
  pageResponse = { status: 'support_review_required', attempts: 1, emailAccepted: false, outcomeRequiresReview: true };
  await context.checkHighLevelReadiness();
  assert.equal(pageCalls[0].url, '/api/smart-trak/ghl-oauth-process-readiness');
  assert.deepEqual(JSON.parse(pageCalls[0].options.body), { accountKey: nodes.accountKey.value, locationId: nodes.locationId.value, dryRun: true, inspectPrerequisites: true });
  assert.match(statuses.pop()[0], /support_review_required.*no retry, account changes, or email sent/);
  assert.equal(nodes.ghlOAuthReadinessBtn.disabled, false);
  assert.equal(navigations.length, 0);
  pageCalls.length = 0;
  nodes.ghlOAuthSchoolReviewBtn = { disabled: false };
  nodes.ghlOAuthSchoolConfirmBtn = { hidden: true };
  pageResponse = { accountKey: nodes.accountKey.value, locationId: nodes.locationId.value, schoolName: "School",
    fingerprint: "b".repeat(64), readbackVerified: true, providerWritePerformed: false, accountUnchanged: true, emailSent: false };
  await context.reviewSchoolNameReadback();
  assert.equal(nodes.ghlOAuthSchoolConfirmBtn.hidden, false);
  assert.equal(JSON.parse(pageCalls.pop().options.body).dryRun, true);
  pageResponse = { ledgerConfirmed: true, providerWritePerformed: false, emailSent: false };
  await context.confirmSchoolNameReadback();
  assert.deepEqual(JSON.parse(pageCalls.pop().options.body), { accountKey: nodes.accountKey.value, locationId: nodes.locationId.value,
    reviewSchoolName: true, dryRun: false, confirmReadback: true, expectedFingerprint: "b".repeat(64) });
  assert.match(statuses.pop()[0], /Setup remains stopped/);
  assert.equal(nodes.ghlOAuthSchoolConfirmBtn.hidden, true);
  await context.confirmSchoolNameReadback();
  assert.equal(pageCalls.length, 0, "Confirmation must consume the preview exactly once");
  nodes.ghlOAuthSetupReviewBtn = { disabled: false };
  nodes.ghlOAuthSetupConfirmBtn = { hidden: true };
  const setupPreviewResponse = { accountKey: nodes.accountKey.value, locationId: nodes.locationId.value, schoolName: "School",
    setupRecoveryReady: true, fingerprint: "c".repeat(64), readinessStillStopped: true,
    providerWritePerformed: false, accountUnchanged: true, emailSent: false };
  pageResponse = setupPreviewResponse;
  await context.previewInterruptedSetupRecovery();
  assert.equal(nodes.ghlOAuthSetupConfirmBtn.hidden, false);
  assert.deepEqual(JSON.parse(pageCalls.pop().options.body), { accountKey: nodes.accountKey.value, locationId: nodes.locationId.value,
    reviewSetupRecovery: true, dryRun: true });
  nodes.locationId.value = "changed";
  await context.confirmInterruptedSetupRecovery();
  assert.equal(pageCalls.length, 0);
  nodes.locationId.value = setupPreviewResponse.locationId;
  await context.previewInterruptedSetupRecovery(); pageCalls.length = 0;
  pageResponse = { setupRecovered: true, jobHistoryPreserved: true, readinessStillStopped: true, providerWritePerformed: false, emailSent: false };
  await context.confirmInterruptedSetupRecovery();
  assert.deepEqual(JSON.parse(pageCalls.pop().options.body), { accountKey: nodes.accountKey.value, locationId: nodes.locationId.value,
    reviewSetupRecovery: true, dryRun: false, confirmSetupRecovery: true, expectedFingerprint: "c".repeat(64) });
  assert.match(statuses.pop()[0], /Automation stays stopped/);
  assert.equal(nodes.ghlOAuthSetupConfirmBtn.hidden, true);
  await context.confirmInterruptedSetupRecovery(); assert.equal(pageCalls.length, 0);
  for (const change of [{ emailSent: true }, { providerWritePerformed: true }, { readinessStillStopped: false }, { accountKey: "other" }]) {
    pageResponse = { ...setupPreviewResponse, ...change };
    await context.previewInterruptedSetupRecovery();
    assert.equal(nodes.ghlOAuthSetupConfirmBtn.hidden, true);
  }
  pageCalls.length = 0;
  nodes.ghlOAuthKeyRecoveryPreviewBtn = { disabled: false };
  nodes.ghlOAuthKeyRecoveryConfirmBtn = { hidden: true };
  const keyRecoveryPreview = { keyRecoveryReady: true, accountUnchanged: true, emailSent: false,
    providerWritePerformed: false, jobHistoryPreserved: true, fingerprint: 'b'.repeat(64), currentAttempts: 4,
    buyer: { buyerAccountKey: nodes.accountKey.value, locationId: nodes.locationId.value,
      schoolName: 'Mustang', coachName: 'Steve Bronco', ownerEmail: 'buyer@example.com',
      productName: 'SMARTCoach Pro 25 - Monthly', amount: '19.00', billingCadence: 'monthly' } };
  pageResponse = keyRecoveryPreview;
  await context.previewBuyerKeyRecovery();
  assert.equal(JSON.parse(pageCalls.at(-1).options.body).dryRun, true);
  assert.equal(JSON.parse(pageCalls.at(-1).options.body).reviewKeyRecovery, true);
  assert.equal(nodes.ghlOAuthKeyRecoveryConfirmBtn.hidden, false);
  assert.match(statuses.pop()[0], /without repeating its provider write/);
  const beforeChangedKeyBuyer = pageCalls.length;
  nodes.locationId.value = 'other';
  await context.confirmBuyerKeyRecovery();
  assert.equal(pageCalls.length, beforeChangedKeyBuyer);
  assert.equal(nodes.ghlOAuthKeyRecoveryConfirmBtn.hidden, true);
  nodes.locationId.value = keyRecoveryPreview.buyer.locationId;
  pageResponse = { ...keyRecoveryPreview, providerWritePerformed: true };
  await context.previewBuyerKeyRecovery();
  assert.equal(nodes.ghlOAuthKeyRecoveryConfirmBtn.hidden, true);
  pageResponse = keyRecoveryPreview;
  await context.previewBuyerKeyRecovery();
  pageResponse = { keyRecoveryApproved: true, providerWritePerformed: false, jobHistoryPreserved: true, status: 'complete', emailAccepted: true };
  await context.confirmBuyerKeyRecovery();
  assert.deepEqual(JSON.parse(pageCalls.at(-1).options.body), { accountKey: nodes.accountKey.value,
    locationId: nodes.locationId.value, reviewKeyRecovery: true, dryRun: false, confirmRecovery: true, expectedFingerprint: keyRecoveryPreview.fingerprint });
  const afterKeyRecovery = pageCalls.length;
  await context.confirmBuyerKeyRecovery();
  assert.equal(pageCalls.length, afterKeyRecovery);
  assert.match(statuses.pop()[0], /No repeat key write/);
  pageCalls.length = 0;
  nodes.ghlOAuthRecoveryPreviewBtn = { disabled: false };
  nodes.ghlOAuthRecoveryConfirmBtn = { hidden: true };
  const recoveryPreview = { recoveryReady: true, accountUnchanged: true, emailSent: false, jobHistoryPreserved: true,
    fingerprint: 'a'.repeat(64), buyer: { buyerAccountKey: nodes.accountKey.value, locationId: nodes.locationId.value,
      schoolName: 'Mustang', coachName: 'Steve Bronco', ownerEmail: 'buyer@example.com',
      productName: 'SMARTCoach Pro 25 - Monthly', amount: '19.00', billingCadence: 'monthly' } };
  pageResponse = recoveryPreview;
  await context.previewReadinessRecovery();
  assert.deepEqual(JSON.parse(pageCalls.at(-1).options.body), { accountKey: nodes.accountKey.value,
    locationId: nodes.locationId.value, reviewRecovery: true, dryRun: true });
  assert.equal(nodes.ghlOAuthRecoveryConfirmBtn.hidden, false);
  assert.match(statuses.pop()[0], /No account changes or email sent/);
  const beforeChangedBuyer = pageCalls.length;
  nodes.locationId.value = 'other';
  await context.confirmReadinessRecovery();
  assert.equal(pageCalls.length, beforeChangedBuyer);
  assert.equal(nodes.ghlOAuthRecoveryConfirmBtn.hidden, true);
  nodes.locationId.value = recoveryPreview.buyer.locationId;
  pageResponse = { ...recoveryPreview, emailSent: true };
  await context.previewReadinessRecovery();
  assert.equal(nodes.ghlOAuthRecoveryConfirmBtn.hidden, true);
  pageResponse = recoveryPreview;
  await context.previewReadinessRecovery();
  pageResponse = { recoveryApproved: true, jobHistoryPreserved: true, status: 'complete', emailAccepted: true };
  await context.confirmReadinessRecovery();
  assert.deepEqual(JSON.parse(pageCalls.at(-1).options.body), { accountKey: nodes.accountKey.value,
    locationId: nodes.locationId.value, reviewRecovery: true, dryRun: false, confirmRecovery: true,
    expectedFingerprint: recoveryPreview.fingerprint });
  const afterRecovery = pageCalls.length;
  await context.confirmReadinessRecovery();
  assert.equal(pageCalls.length, afterRecovery);
  assert.match(statuses.pop()[0], /recovered signup, not proof of an unattended signup pass/);
  pageCalls.length = 0;
  nodes.setupCode.value = '';
  pageResponse = { authorizationUrl: 'https://marketplace.gohighlevel.com/oauth/chooselocation?state=test' };
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
  assert.equal(new URL(navigations[1]).pathname, '/oauth/chooselocation');
  cookieConfirmed = false;
  await context.connectHighLevelAgency();
  assert.equal(navigations.length, 2);
  assert.match(statuses.pop()[0], /authorization cookie/);
  cookieConfirmed = true;
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
  Object.assign(nodes, { ghlOAuthLegacyReviewBtn: { disabled: false }, ghlOAuthLegacyCrmBtn: { disabled: false }, ghlOAuthLegacyRecoverBtn: { disabled: false }, legacySchoolName: { value: "Athletic Develop" },
    legacyCoachName: { value: "Jenn Moore" }, legacyOwnerEmail: { value: "buyer@example.com" },
    legacySubscriptionId: { value: "sub_verified" }, legacyProductName: { value: "SMARTCoach Pro 25 - Monthly" }, legacyAmount: { value: "19" },
    legacyOrderId: { value: "" }, legacySaleLinkId: { value: "" } });
  const safeReview = { preview: true, providerPurchaseVerified: true, locationIdentityVerified: true,
    accountUnchanged: true, pendingCheckoutUnchanged: true, emailSent: false, recoveryReady: false,
    automaticFulfillmentReady: false, existingSetup: { existingSetupReviewVerified: true }, productName: "SMARTCoach Pro 25 - Monthly", currency: "USD", amount: "19.00", billingCadence: "monthly", blockers: ["Original order pending."] };
  pageResponse = safeReview;
  const beforeLegacy = pageCalls.length;
  await context.reviewHighLevelLegacyPurchase();
  assert.equal(pageCalls.length, beforeLegacy + 1);
  assert(pageCalls.at(-1).url.endsWith("ghl-oauth-review-legacy-purchase"));
  const legacyBody = JSON.parse(pageCalls.at(-1).options.body);
  assert.equal(legacyBody.preview, true);
  assert.equal(legacyBody.verifyExistingSetup, true);
  assert.equal(legacyBody.expectedAmount, "19.00");
  assert.equal(legacyBody.coachName, "Jenn Moore");
  assert.equal(legacyBody.expectedBillingCadence, "monthly");
  assert.match(statuses.pop()[0], /Recovery remains disabled/);
  for (const change of [{ emailSent: true }, { recoveryReady: true }, { automaticFulfillmentReady: true }, { accountUnchanged: false }, { blockers: null }, { existingSetup: null }, { existingSetup: { existingSetupReviewVerified: false } }]) {
    pageResponse = { ...safeReview, ...change };
    await context.reviewHighLevelLegacyPurchase();
    assert.match(statuses.pop()[0], /response could not be verified/);
    assert.equal(nodes.ghlOAuthLegacyReviewBtn.disabled, false);
  }
  nodes.legacyOrderId.value = "6abd8977b229ab130b0f3c93";
  nodes.legacySaleLinkId.value = "6a1b37c203b17c94f5713b61";
  nodes.legacySubscriptionId.value = "6abd897d66ad43f827dbaa4e";
  pageResponse = safeReview;
  await context.reviewHighLevelLegacyPurchase();
  assert.match(statuses.pop()[0], /Original order verification response could not be verified/);
  pageResponse = { ...safeReview, originalOrderVerified: true, orderReview: { orderId: nodes.legacyOrderId.value,
    subscriptionId: nodes.legacySubscriptionId.value, saleLinkId: nodes.legacySaleLinkId.value } };
  await context.reviewHighLevelLegacyPurchase();
  assert.match(statuses.pop()[0], /Recovery remains disabled/);
  assert.equal(JSON.parse(pageCalls.at(-1).options.body).expectedOrderId, nodes.legacyOrderId.value);
  const verifiedOrderReview = pageResponse;
  await context.reviewHighLevelLegacyPurchase(true);
  assert.match(statuses.pop()[0], /Buyer CRM preview response could not be verified/);
  const buyerCrmReview = { accountKey: nodes.accountKey.value, locationId: nodes.locationId.value,
    crmReadsVerified: true, snapshot: { verified: true }, buyerTokenPersisted: false, consumerAccessEnabled: false };
  pageResponse = { ...verifiedOrderReview, buyerCrmReview };
  await context.reviewHighLevelLegacyPurchase(true);
  assert.match(statuses.pop()[0], /Recovery remains disabled/);
  assert.equal(JSON.parse(pageCalls.at(-1).options.body).verifyBuyerCrm, true);
  for (const change of [{ buyerTokenPersisted: true }, { consumerAccessEnabled: true }, { locationId: "wrong" }, { snapshot: { verified: false } }]) {
    pageResponse = { ...verifiedOrderReview, buyerCrmReview: { ...buyerCrmReview, ...change } };
    await context.reviewHighLevelLegacyPurchase(true);
    assert.match(statuses.pop()[0], /Buyer CRM preview response could not be verified/);
    assert.equal(nodes.ghlOAuthLegacyCrmBtn.disabled, false);
  }
  context.window.confirm = () => false;
  const beforeRecoveryCancel = pageCalls.length;
  await context.reviewHighLevelLegacyPurchase(true, true);
  assert.equal(pageCalls.length, beforeRecoveryCancel);
  assert.equal(nodes.ghlOAuthLegacyRecoverBtn.disabled, false);
  context.window.confirm = () => true;
  pageResponse = { accountRecovered: true, accountKey: nodes.accountKey.value, locationId: nodes.locationId.value,
    productPlan: "pro25", amount: "19.00", billingCadence: "monthly", subscriptionStatus: "trialing",
    buyerOAuthSaved: true, snapshotVerified: true, accessStatus: "manual_hold", coachAccessCreated: false,
    emailSent: false, billingUnchanged: true, pendingCheckoutUnchanged: true, automaticFulfillmentReady: false };
  await context.reviewHighLevelLegacyPurchase(true, true);
  assert.match(statuses.pop()[0], /account recovered and read back/);
  assert(pageCalls.at(-1).url.endsWith('ghl-oauth-recover-legacy-purchase'));
  assert.equal(JSON.parse(pageCalls.at(-1).options.body).confirmRecovery, true);
  const safeRecovery = pageResponse;
  for (const change of [{ emailSent: true }, { accessStatus: "active" }, { buyerOAuthSaved: false }, { coachAccessCreated: true }, { amount: "29.00" }]) {
    pageResponse = { ...safeRecovery, ...change };
    await context.reviewHighLevelLegacyPurchase(true, true);
    assert.match(statuses.pop()[0], /Recovery result could not be verified/);
  }
  nodes.ghlOAuthLegacyActivateBtn = { disabled: false };
  nodes.ghlOAuthLegacyActivateConfirmBtn = { hidden: true };
  pageResponse = { preview: true, fingerprint: 'activation-fingerprint', accountKey: nodes.accountKey.value,
    locationId: nodes.locationId.value, coachName: 'Jenn Moore', ownerEmail: 'athleticdevelop@yahoo.com',
    productPlan: 'pro25', amount: '19.00', billingCadence: 'monthly', subscriptionStatus: 'trialing',
    emailFrom: 'info@smartcoach-pro.com', sellerSenderVerified: true, buyerOAuthVerified: true,
    snapshotVerified: true, coreOAuthWriteRolloutEnabled: false, accountUnchanged: true, emailSent: false, automaticFulfillmentReady: false };
  await context.previewLegacyActivation();
  assert.equal(nodes.ghlOAuthLegacyActivateConfirmBtn.hidden, true);
  assert.match(statuses.pop()[0], /rollout must be enabled/);
  const safeActivationPreview = { ...pageResponse, coreOAuthWriteRolloutEnabled: true };
  pageResponse = safeActivationPreview;
  await context.previewLegacyActivation();
  assert.equal(nodes.ghlOAuthLegacyActivateConfirmBtn.hidden, false);
  const goodActivation = { legacyActivated: true, accountKey: nodes.accountKey.value, locationId: nodes.locationId.value,
    headCoachCreated: true, accessEmailAccepted: true, ownerEmail: 'athleticdevelop@yahoo.com', emailFrom: 'info@smartcoach-pro.com',
    accessStatus: 'active', coreOAuthWriteRolloutEnabled: true, accountKeyWriteVerified: true, billingUnchanged: true, automaticFulfillmentReady: false };
  pageResponse = goodActivation;
  await context.confirmLegacyActivation();
  assert.match(statuses.pop()[0], /Inbox delivery and Overview sign-in are not yet verified/);
  assert.equal(JSON.parse(pageCalls.at(-1).options.body).expectedFingerprint, 'activation-fingerprint');
  const beforeConsumedConfirmation = pageCalls.length;
  await context.confirmLegacyActivation();
  assert.equal(pageCalls.length, beforeConsumedConfirmation);
  for (const change of [{ emailFrom: 'buyer@example.com' }, { accountUnchanged: false }, { snapshotVerified: false }]) {
    pageResponse = { ...safeActivationPreview, ...change };
    await context.previewLegacyActivation();
    assert.match(statuses.pop()[0], /preview could not be verified/);
    assert.equal(nodes.ghlOAuthLegacyActivateConfirmBtn.hidden, true);
  }
  nodes.legacyAmount.value = "";
  const beforeInvalidAmount = pageCalls.length;
  await context.reviewHighLevelLegacyPurchase();
  assert.equal(pageCalls.length, beforeInvalidAmount);
  assert.match(statuses.pop()[0], /recurring subscription amount/);
  console.log("HighLevel OAuth security and renewal tests passed");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
