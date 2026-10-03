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
  const api = createGhlOAuth({ env, registry, fulfillmentExecutionEnabled: options.executionEnabled === true, now: () => time, fetch: async (url, options) => {
    calls.push({ url, options });
    if (new URL(url).pathname === "/oauth/token") assert(locks.has("oauthgrant"));
    else if (provider) {
      const data = provider(url, options);
      if (data.mockHttpStatus) return { ok: false, status: data.mockHttpStatus, json: async () => data };
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
  for (const mode of ["valid", "no-admin", "wrong-origin", "get", "execute", "missing-preview", "seller", "wrong-key", "missing-coach",
    "existing", "race", "missing-scope", "wrong-location", "wrong-agency", "wrong-email", "wrong-subscription",
    "wrong-product", "wrong-amount", "wrong-cadence", "past-due", "bad-catalog", "forbidden", "provider-error"]) {
    const review = fixture();
    review.env.SMARTCOACH_GHL_OAUTH_SCOPES += " saas/company.read";
    review.setResponse({ ...review.grant(), scope: review.env.SMARTCOACH_GHL_OAUTH_SCOPES });
    const auth = await review.start();
    await review.invoke("crm-connect-callback", review.callbackReq(auth));
    if (mode === "existing") review.accounts.set(accountKey, { locationId, coachStaff: [{ id: "preserve" }] });
    if (mode === "missing-scope") {
      review.env.SMARTCOACH_GHL_OAUTH_SCOPES = "oauth.write locations.readonly";
      const again = await review.start();
      review.setResponse({ ...review.grant(), scope: review.env.SMARTCOACH_GHL_OAUTH_SCOPES });
      await review.invoke("crm-connect-callback", review.callbackReq(again));
    }
    review.setProvider((url, options) => {
      assert.equal(options.method, undefined, "Review must only read provider data");
      if (mode === "forbidden") return { mockHttpStatus: 403, secret: "private-provider-response" };
      if (mode === "provider-error") throw new Error("private-provider-response");
      const path = new URL(url).pathname;
      if (path === `/locations/${locationId}`) return { location: { id: mode === "wrong-location" ? "other" : locationId,
        companyId: mode === "wrong-agency" ? "other" : "agency-one", email: mode === "wrong-email" ? "other@example.com" : "buyer@example.com",
        token: "private-location-token" } };
      if (path === `/saas/get-saas-subscription/${locationId}`) return { locationId, companyId: "agency-one", isSaaSV2: true,
        subscriptionStatus: mode === "past-due" ? "past_due" : "trialing", subscriptionId: "sub_verified",
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
    if (mode === "no-admin") delete req.headers["x-smartcoach-setup-code"];
    if (mode === "wrong-origin") req.headers.origin = "https://other.example";
    if (mode === "execute") req.body.confirmRecovery = true;
    if (mode === "missing-preview") delete req.body.preview;
    if (mode === "seller") { req.body.locationId = "QxwjWekSyUf7sDOFHPB4"; req.body.accountKey = "sc-qxwjweksyuf7sdofhpb4"; }
    if (mode === "wrong-key") req.body.accountKey = "other";
    if (mode === "missing-coach") req.body.coachName = "";
    if (mode === "wrong-subscription") req.body.expectedSubscriptionId = "sub_other";
    if (mode === "wrong-product") req.body.expectedProductName = "SMARTCoach Pro 100 - Monthly";
    if (mode === "wrong-amount") req.body.expectedAmount = "29.00";
    if (mode === "wrong-cadence") req.body.expectedBillingCadence = "annual";
    const recordsBefore = structuredClone([...review.records]);
    const result = await review.invoke("ghl-oauth-review-legacy-purchase", req);
    if (mode === "valid") {
      assert.equal(result.statusCode, 200);
      assert.equal(result.body.providerPurchaseVerified, true);
      assert.equal(result.body.ownerEmail, "buyer@example.com");
      assert.equal(result.body.proposedCoachName, "Jenn Moore");
      assert.equal(result.body.productName, "SMARTCoach Pro 25 - Monthly");
      assert.equal(result.body.amount, "19.00");
      assert.equal(result.body.planTrialDays, 30);
      for (const key of ["originalOrderVerified", "alternateAccountHistoryVerified", "buyerOAuthVerified", "recoveryReady", "emailSent", "automaticFulfillmentReady"]) assert.equal(result.body[key], false);
      assert.equal(result.body.accountUnchanged, true);
      assert.equal(result.body.pendingCheckoutUnchanged, true);
      const normal = await review.invoke("ghl-oauth-check-subscription", { ...req, body: { accountKey, locationId } });
      assert.equal(normal.statusCode, 422, "Normal provisioning must still require saved buyer mapping");
    } else assert(result.statusCode >= 400, mode);
    if (mode === "wrong-subscription") assert.match(result.body.error, /blocked: subscriptionId\./);
    if (mode === "wrong-product") assert.match(result.body.error, /blocked: productName\./);
    if (mode === "wrong-amount") assert.match(result.body.error, /blocked: amount\./);
    if (mode === "wrong-cadence") assert.match(result.body.error, /blocked: billingCadence\./);
    if (mode === "bad-catalog") assert.match(result.body.error, /purchaseCatalog.*exact supported SMARTCoach/);
    assert.deepEqual([...review.records], recordsBefore, "Review must not persist recovery, grants, audits or checkout records");
    assert.equal(review.accounts.size, ["existing", "race"].includes(mode) ? 1 : 0);
    for (const secret of ["private-access", "private-location-token", "private-provider-response", "never-return-me"]) assert(!JSON.stringify(result).includes(secret));
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
  for (const mode of ["success", "disabled", "no-admin", "wrong-origin", "wrong-buyer", "missing-scope", "missing-fields", "missing-meet-primary", "wrong-schema", "wrong-field-type", "conflicting-value", "failed-send", "missing-message"]) {
    const f = fixture({ executionEnabled: mode !== "disabled" });
    const scopes = "locations.readonly locations/customFields.readonly locations/customValues.readonly locations/customValues.write contacts.readonly contacts.write objects/record.readonly objects/record.write";
    const buyerScopes = scopes + (mode === "missing-scope" ? "" : " objects/schema.readonly");
    f.env.SMARTCOACH_GHL_OAUTH_SCOPES = "oauth.write " + buyerScopes;
    f.env.SMARTCOACH_GHL_OAUTH_WRITE_ACCOUNTS = accountKey;
    f.env.SMARTCOACH_WELCOME_SELLER_TOKEN = "private-fulfillment-seller";
    f.env.SMARTCOACH_WELCOME_FROM_EMAIL = "info@smartcoach-pro.com";
    f.setResponse({ ...f.grant(), scope: f.env.SMARTCOACH_GHL_OAUTH_SCOPES });
    const auth = await f.start(); await f.invoke("crm-connect-callback", f.callbackReq(auth));
    const original = { accountKey, locationId, token: "", productPlan: "pro100", schoolName: "School", accountOwnerName: "Buyer",
      accountOwnerEmail: "buyer@example.com", coachStaff: [], coachAccessCodes: [], requireCoachAccess: true,
      subscription: { status: "incomplete", amount: "29.99", billingCadence: "monthly" } };
    f.accounts.set(accountKey, structuredClone(original));
    f.records.set("pendingcheckout", { source: "smartcoach-precheckout", plan: "pro100", cadence: "monthly", productName: "SMARTCoach Pro 100 - Monthly",
      schoolName: "School", coachName: "Buyer", coachEmail: "buyer@example.com", lastMatchedLocationId: locationId,
      lastLocationCreateEvent: { id: locationId, companyId: "agency-one", email: "buyer@example.com" } });
    const mapping = require("../smart_trak_object_mapping.json");
    assert.deepEqual(Object.keys(mapping.objects.meet.fields), ["meet", "meet_date", "season", "season_year", "status", "source_system", "source_record_id"]);
    assert.equal(mapping.objects.meet.fields.meet.type, "TEXT");
    assert(mapping.objects.meet_result.fields.meet_name);
    assert(mapping.objects.record.fields.meet_name);
    let sends = 0, values = [], valueWrites = 0;
    f.setProvider((url, options) => {
      const path = new URL(url).pathname;
      if (path === `/saas/get-saas-subscription/${locationId}`) return { locationId, companyId: "agency-one", isSaaSV2: true, subscriptionStatus: "trialing",
        subscriptionId: "sub", customerId: "cus", productId: "product", priceId: "price", saasPlanId: "plan" };
      if (path === "/saas/saas-plan/plan") return { planId: "plan", companyId: "agency-one", providerLocationId: "QxwjWekSyUf7sDOFHPB4", productId: "product",
        isSaaSV2: true, title: "SMARTCoach Pro 100", trialPeriod: 30, prices: [{ id: "price", active: true, amount: 29, currency: "USD", billingInterval: "month" }] };
      if (path === "/oauth/installed-locations") return { items: [{ _id: locationId, isInstalled: true }] };
      if (path === "/oauth/location-token") return { access_token: "private-fulfillment-buyer", token_type: "Bearer", locationId, expires_in: 86400, scope: buyerScopes };
      if (path === `/locations/${locationId}`) return { location: { id: locationId, companyId: "agency-one" } };
      if (path === "/locations/QxwjWekSyUf7sDOFHPB4") return { location: { id: "QxwjWekSyUf7sDOFHPB4", companyId: "agency-one" } };
      if (path === `/locations/${locationId}/customFields`) return { customFields: mode === "missing-fields" ? [] : Object.values(mapping.contactFields).map(field => ({ ...field, locationId })) };
      if (path.startsWith("/objects/")) {
        assert.equal(new URL(url).searchParams.get("locationId"), locationId);
        assert.equal(options.headers.Authorization, "Bearer private-fulfillment-buyer");
        const object = Object.values(mapping.objects).find(item => item.internalName === decodeURIComponent(path.split("/")[2]));
        return { object: { key: object.internalName, locationId: mode === "wrong-schema" ? "other" : locationId }, fields: Object.entries(object.fields).filter(([key]) => !(mode === "missing-meet-primary" && object.internalName === "custom_objects.meets" && key === "meet")).map(([key, field]) => ({ id: field.id, locationId, fieldKey: `${object.internalName}.${key}`, dataType: mode === "wrong-field-type" ? "INVALID" : field.type })) };
      }
      if (path === `/locations/${locationId}/customValues`) {
        if (options.method === "POST") { valueWrites++; values = [{ id: "key-value", name: "account_key", value: accountKey, locationId }]; return { customValue: values[0] }; }
        return { customValues: mode === "conflicting-value" ? [{ id: "other-key", name: "account_key", value: "sc-other", locationId }] : values };
      }
      if (path === "/contacts/") return { contacts: [{ id: "seller-owner", email: "buyer@example.com", locationId: "QxwjWekSyUf7sDOFHPB4" }] };
      if (path === "/conversations/messages") {
        sends++; assert.equal(options.headers.Authorization, "Bearer private-fulfillment-seller");
        const email = JSON.parse(options.body); assert.equal(email.emailFrom, "info@smartcoach-pro.com");
        assert.equal(email.emailTo, "buyer@example.com"); assert.equal(email.subject, "SMARTCoach Access");
        assert(!email.html.includes(f.accounts.get(accountKey).coachAccessCodes[0]));
        if (mode === "failed-send") throw new Error("private-send-error");
        return mode === "missing-message" ? {} : { messageId: "fulfillment-message" };
      }
      throw new Error("Unexpected fulfillment provider request");
    });
    const req = f.request(); req.body = { accountKey, locationId, dryRun: true };
    const inheritedHeaders = req.headers;
    delete req.headers;
    Object.setPrototypeOf(req, { get headers() { return inheritedHeaders; } });
    const preview = await f.invoke("ghl-oauth-fulfill-buyer", req);
    assert.equal(preview.statusCode, 200, `${mode}: ${preview.body.error || ""}`); assert.equal(preview.body.steps.length, 3);
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
    if (mode === "no-admin") delete req.headers["x-smartcoach-setup-code"];
    if (mode === "wrong-origin") req.headers.origin = "https://other.example";
    if (mode === "wrong-buyer") req.body.accountKey = "sc-other";
    const result = await f.invoke("ghl-oauth-fulfill-buyer", req);
    assert.equal(result.statusCode, mode === "success" ? 200 : ["failed-send", "missing-message"].includes(mode) ? 502 : mode === "wrong-buyer" ? 422 : ["no-admin", "wrong-origin", "missing-scope"].includes(mode) ? 403 : 409, `${mode}: ${result.body.error || ""}`);
    assert.equal(sends, ["success", "failed-send", "missing-message"].includes(mode) ? 1 : 0);
    if (mode === "success") {
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
  Object.assign(nodes, { ghlOAuthLegacyReviewBtn: { disabled: false }, legacySchoolName: { value: "Athletic Develop" },
    legacyCoachName: { value: "Jenn Moore" }, legacyOwnerEmail: { value: "buyer@example.com" },
    legacySubscriptionId: { value: "sub_verified" }, legacyProductName: { value: "SMARTCoach Pro 25 - Monthly" }, legacyAmount: { value: "19" } });
  const safeReview = { preview: true, providerPurchaseVerified: true, locationIdentityVerified: true,
    accountUnchanged: true, pendingCheckoutUnchanged: true, emailSent: false, recoveryReady: false,
    automaticFulfillmentReady: false, productName: "SMARTCoach Pro 25 - Monthly", currency: "USD", amount: "19.00", billingCadence: "monthly", blockers: ["Original order pending."] };
  pageResponse = safeReview;
  const beforeLegacy = pageCalls.length;
  await context.reviewHighLevelLegacyPurchase();
  assert.equal(pageCalls.length, beforeLegacy + 1);
  assert(pageCalls.at(-1).url.endsWith("ghl-oauth-review-legacy-purchase"));
  const legacyBody = JSON.parse(pageCalls.at(-1).options.body);
  assert.equal(legacyBody.preview, true);
  assert.equal(legacyBody.expectedAmount, "19.00");
  assert.equal(legacyBody.coachName, "Jenn Moore");
  assert.equal(legacyBody.expectedBillingCadence, "monthly");
  assert.match(statuses.pop()[0], /Recovery remains disabled/);
  for (const change of [{ emailSent: true }, { recoveryReady: true }, { automaticFulfillmentReady: true }, { accountUnchanged: false }, { blockers: null }]) {
    pageResponse = { ...safeReview, ...change };
    await context.reviewHighLevelLegacyPurchase();
    assert.match(statuses.pop()[0], /response could not be verified/);
    assert.equal(nodes.ghlOAuthLegacyReviewBtn.disabled, false);
  }
  nodes.legacyAmount.value = "";
  const beforeInvalidAmount = pageCalls.length;
  await context.reviewHighLevelLegacyPurchase();
  assert.equal(pageCalls.length, beforeInvalidAmount);
  assert.match(statuses.pop()[0], /recurring subscription amount/);
  console.log("HighLevel OAuth security and renewal tests passed");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
