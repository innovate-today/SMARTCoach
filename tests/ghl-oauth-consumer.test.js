const assert = require("assert/strict");
const { attachBuyerOAuthReadContext } = require("../lib/ghl-oauth-consumer");
const { getGhlContext } = require("../lib/ghl-account");

async function run() {
  const locationId = "AbCdEfGhIjKlMnOpQrSt";
  const accountKey = `sc-${locationId.toLowerCase()}`;
  const request = () => ({ method: "GET", query: { account: accountKey }, headers: {},
    smartcoachRegistryAccount: { locationId, token: "manual-pit", productPlan: "pro100" } });
  const response = () => ({ statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; },
    status(v) { this.statusCode = v; return this; }, json(v) { this.body = v; return this; } });
  let calls = 0;
  const deps = { env: { SMARTCOACH_GHL_OAUTH_READ_ACCOUNTS: accountKey }, authorize: () => true,
    oauth: { readConsumerGrant: async (key, loc) => {
      calls += 1;
      assert.equal(key, accountKey); assert.equal(loc, locationId);
      return { locationId, access_token: "private-oauth" };
    } } };
  for (const route of ["athletes", "dashboard", "groups", "meets", "training-plan", "athlete-best", "athlete-profile"]) {
    const req = request(), res = response();
    assert.equal(await attachBuyerOAuthReadContext(req, res, route, deps), true);
    assert.equal(getGhlContext(req).token, "private-oauth");
    assert.equal(req.smartcoachRegistryAccount.token, "manual-pit");
    assert.equal(getGhlContext(req).productPlan, "pro100");
    assert.equal(res.headers["X-SMARTCoach-CRM-Auth"], "oauth");
    assert(!JSON.stringify(res).includes("private-oauth"));
  }
  const before = calls;
  for (const change of [{ method: "POST" }, { method: "PATCH" }, { query: { account: "other" } }]) {
    const req = { ...request(), ...change };
    assert.equal(await attachBuyerOAuthReadContext(req, response(), "athletes", deps), true);
    assert.equal(getGhlContext(req).token, "manual-pit");
  }
  for (const route of ["athlete-calendar", "account-status", "account-session", "manual-mileage"]) {
    assert.equal(await attachBuyerOAuthReadContext(request(), response(), route, deps), true);
  }
  assert.equal(calls, before);
  const denied = request();
  assert.equal(await attachBuyerOAuthReadContext(denied, response(), "athletes", { ...deps, authorize: () => false }), false);
  assert.equal(calls, before);
  for (const grant of [null, { locationId: "wrong", access_token: "wrong-token" }]) {
    const req = request(), res = response();
    assert.equal(await attachBuyerOAuthReadContext(req, res, "athletes", { ...deps, oauth: {
      readConsumerGrant: async () => { if (!grant) throw new Error("private-provider-error"); return grant; }
    } }), false);
    assert.equal(res.statusCode, 503);
    assert.equal(req.smartcoachRegistryAccount.token, "manual-pit");
    assert(!JSON.stringify(res).includes("private-provider-error"));
  }
  const changed = request();
  await attachBuyerOAuthReadContext(changed, response(), "athletes", deps);
  changed.smartcoachRegistryAccount.locationId = "different";
  assert.throws(() => getGhlContext(changed), /identity changed/);
  console.log("Buyer OAuth read consumer isolation tests passed");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
