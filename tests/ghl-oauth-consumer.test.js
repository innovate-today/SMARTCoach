const assert = require("assert/strict");
const { attachBuyerOAuthReadContext, attachBuyerOAuthContext, buyerCrmToken } = require("../lib/ghl-oauth-consumer");
const { getGhlContext, accountSetupReady } = require("../lib/ghl-account");
const { athleteCalendarCredentialAccepted } = require("../lib/athlete-calendar");
const crypto = require("crypto");
const fs = require("fs");

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
  const writeScopes = "locations.readonly contacts.readonly contacts.write locations/customFields.readonly objects/record.readonly objects/record.write";
  const writeDeps = { ...deps, env: { SMARTCOACH_GHL_OAUTH_WRITE_ACCOUNTS: accountKey }, oauth: {
    readConsumerGrant: async () => ({ locationId, access_token: "private-write-oauth", scope: writeScopes })
  } };
  const readinessRequest = request(), readinessResponse = response();
  assert.equal(await attachBuyerOAuthContext(readinessRequest, readinessResponse, "account-status", { ...writeDeps, authorize: () => { throw new Error("Account readiness must not require an existing coach session"); } }), true);
  assert.equal(getGhlContext(readinessRequest).token, "private-write-oauth");
  for (const [route, methods] of Object.entries({ records: ["POST", "PATCH", "DELETE"], "athlete-calendar": ["POST"], athletes: ["POST", "PUT", "PATCH"], groups: ["POST"], meets: ["POST", "PATCH", "DELETE"],
    "training-plan": ["POST"], "athlete-best": ["POST", "DELETE"], "sync-session": ["POST"], "manual-mileage": ["POST"], "meet-result": ["POST"], correction: ["POST"] })) {
    for (const method of methods) {
      const req = { ...request(), method }, res = response();
      assert.equal(await attachBuyerOAuthContext(req, res, route, writeDeps), true);
      assert.equal(getGhlContext(req).token, "private-write-oauth");
      assert.equal(req.smartcoachRegistryAccount.token, "manual-pit");
      assert(!JSON.stringify(res).includes("private-write-oauth"));
    }
  }
  for (const scope of writeScopes.split(" ")) {
    const req = { ...request(), method: "POST" }, res = response();
    assert.equal(await attachBuyerOAuthContext(req, res, "sync-session", { ...writeDeps, oauth: {
      readConsumerGrant: async () => ({ locationId, access_token: "private-write-oauth", scope: writeScopes.split(" ").filter(s => s !== scope).join(" ") })
    } }), false);
    assert.equal(res.statusCode, 503);
    assert(!req.smartcoachOAuthContext);
  }
  for (const [route, method] of [["unknown", "POST"], ["athlete-profile", "PATCH"], ["athletes", "DELETE"]]) {
    const res = response();
    assert.equal(await attachBuyerOAuthContext({ ...request(), method }, res, route, writeDeps), false);
    assert.equal(res.statusCode, 503);
  }
  const originalWrites = process.env.SMARTCOACH_GHL_OAUTH_WRITE_ACCOUNTS;
  try {
    process.env.SMARTCOACH_GHL_OAUTH_WRITE_ACCOUNTS = accountKey;
    const req = { ...request(), method: "POST" };
    assert.equal(getGhlContext(req).token, undefined, "Opt-in OAuth accounts cannot use PIT via an unadapted or direct route");
    const res = response();
    assert.equal(await attachBuyerOAuthContext(req, res, "sync-session", { ...writeDeps, oauth: { readConsumerGrant: async () => { throw new Error("revoked-private"); } } }), false);
    assert.equal(getGhlContext(req).token, undefined);
    assert(!JSON.stringify(res).includes("revoked-private"));
    assert.equal(await attachBuyerOAuthContext(req, response(), "sync-session", writeDeps), true);
    assert.equal(getGhlContext(req).token, "private-write-oauth");
    const foreign = { ...request(), query: { account: "other" } };
    assert.equal(getGhlContext(foreign).token, "manual-pit");
  } finally {
    if (originalWrites === undefined) delete process.env.SMARTCOACH_GHL_OAUTH_WRITE_ACCOUNTS;
    else process.env.SMARTCOACH_GHL_OAUTH_WRITE_ACCOUNTS = originalWrites;
  }
  const oauthAccount = { accountKey, locationId, productPlan: "pro100", coachAccessCodes: ["existing-code"], requireCoachAccess: true };
  const verified = { accountKey, locationId, token: "request-only-oauth" };
  assert.equal(accountSetupReady(oauthAccount), false);
  assert.equal(accountSetupReady(oauthAccount, verified), true);
  assert.equal(accountSetupReady(oauthAccount, { ...verified, accountKey: "other" }), false);
  assert.equal(accountSetupReady(oauthAccount, { ...verified, locationId: "other" }), false);
  assert.equal(accountSetupReady(oauthAccount, { ...verified, token: "" }), false);
  assert.equal(accountSetupReady({ ...oauthAccount, coachAccessCodes: [] }, verified), false);
  assert.equal(accountSetupReady({ ...oauthAccount, accountKey: "sc-qxwjweksyuf7sdofhpb4", locationId: "QxwjWekSyUf7sDOFHPB4" }, { accountKey: "sc-qxwjweksyuf7sdofhpb4", locationId: "QxwjWekSyUf7sDOFHPB4", token: "seller" }), false);
  assert.equal(accountSetupReady({ ...oauthAccount, token: "manual-pit" }), true);
  const crmAccount = { accountKey, locationId, token: "manual-pit" };
  for (const approved of [true, false, "unavailable"]) {
    const policyDeps = { ...writeDeps, env: { SMARTCOACH_GHL_NEW_BUYER_PLANS: "pro25", SMARTCOACH_GHL_NEW_BUYER_OAUTH_PLANS: "pro25" },
      oauth: { ...writeDeps.oauth, approvedBuyerOAuth: async (key, location) => {
        assert.equal(key, accountKey); assert.equal(location, locationId);
        if (approved === "unavailable") throw new Error("private-policy-error");
        return approved;
      } } };
    const req = { ...request(), method: "POST" }, res = response();
    assert.equal(await attachBuyerOAuthContext(req, res, "sync-session", policyDeps), approved !== "unavailable");
    if (approved === "unavailable") {
      assert.equal(res.statusCode, 503);
      assert(!JSON.stringify(res).includes("private-policy-error"));
      await assert.rejects(buyerCrmToken(crmAccount, [], policyDeps), error => error.statusCode === 503);
    } else {
      assert.equal(getGhlContext(req).token, approved ? "private-write-oauth" : "manual-pit");
      assert.equal(await buyerCrmToken(crmAccount, ["contacts.write"], policyDeps), approved ? "private-write-oauth" : "manual-pit");
    }
  }
  assert.equal(await buyerCrmToken(crmAccount, ["contacts.write"], writeDeps), "private-write-oauth");
  assert.equal(await buyerCrmToken(crmAccount, ["ungranted.write"], { ...writeDeps, env: {} }), "manual-pit");
  await assert.rejects(buyerCrmToken(crmAccount, ["ungranted.write"], writeDeps), /connection could not be verified/);
  await assert.rejects(buyerCrmToken(crmAccount, [], { ...writeDeps, oauth: { readConsumerGrant: async () => { throw new Error("private-revoked"); } } }), error => error.statusCode === 503 && !error.message.includes("private-revoked"));
  await assert.rejects(buyerCrmToken(crmAccount, [], { ...writeDeps, oauth: { readConsumerGrant: async () => ({ locationId: "wrong", access_token: "foreign" }) } }), /connection could not be verified/);
  const secret = String(process.env.SMARTCOACH_ATHLETE_ACCESS_SECRET || process.env.SMARTCOACH_SESSION_SECRET || process.env.SMARTCOACH_AUTOMATION_SECRET || "smartcoach-athlete-calendar").trim();
  const athleteId = "athlete-one";
  const privateCode = crypto.createHmac("sha256", secret).update(`${accountKey}:${athleteId}`).digest("hex").slice(0, 12);
  const calendarGet = { ...request(), query: { account: accountKey, athlete: athleteId, code: privateCode } };
  const calendarContext = getGhlContext(calendarGet);
  assert.equal(athleteCalendarCredentialAccepted(calendarGet, calendarContext), true);
  assert.equal(athleteCalendarCredentialAccepted({ ...calendarGet, query: { ...calendarGet.query, code: "wrong" } }, calendarContext), false);
  assert.equal(athleteCalendarCredentialAccepted(calendarGet, { ...calendarContext, accountKey: "other" }), false);
  assert.equal(athleteCalendarCredentialAccepted({ ...calendarGet, query: { ...calendarGet.query, athlete: "another" } }, calendarContext), false);
  const calendarPost = { ...request(), method: "POST", body: { athleteId, code: privateCode } };
  assert.equal(athleteCalendarCredentialAccepted(calendarPost, calendarContext), true);
  assert.equal(athleteCalendarCredentialAccepted({ ...calendarPost, body: { athleteId: "another", code: privateCode } }, calendarContext), false);
  assert.equal(athleteCalendarCredentialAccepted({ ...calendarGet, method: "DELETE" }, calendarContext), false);
  let calendarGrantCalls = 0;
  const calendarDeps = { ...writeDeps,
    authorize: req => athleteCalendarCredentialAccepted(req, getGhlContext(req)),
    oauth: { readConsumerGrant: async () => { calendarGrantCalls++; return { locationId, access_token: "private-calendar-oauth", scope: writeScopes }; } },
  };
  assert.equal(await attachBuyerOAuthContext({ ...calendarGet, query: { ...calendarGet.query, code: "wrong" } }, response(), "athlete-calendar", calendarDeps), false);
  assert.equal(await attachBuyerOAuthContext({ ...calendarPost, body: { athleteId: "another", code: privateCode } }, response(), "athlete-calendar", calendarDeps), false);
  assert.equal(calendarGrantCalls, 0, "Private athlete authorization must run before buyer grant lookup");
  const acceptedCalendar = { ...calendarGet };
  assert.equal(await attachBuyerOAuthContext(acceptedCalendar, response(), "athlete-calendar", calendarDeps), true);
  assert.equal(calendarGrantCalls, 1);
  assert.equal(getGhlContext(acceptedCalendar).token, "private-calendar-oauth");
  for (const route of ["records", "attendance", "sync-diagnostics", "athlete-calendar"]) {
    const req = request();
    assert.equal(await attachBuyerOAuthContext(req, response(), route, writeDeps), true);
    assert.equal(getGhlContext(req).token, "private-write-oauth");
  }
  let repeatCalls = 0;
  const repeatReq = { ...request(), method: "POST" };
  const repeatDeps = { ...writeDeps, oauth: { readConsumerGrant: async () => { repeatCalls++; return { locationId, access_token: "private-write-oauth", scope: writeScopes }; } } };
  assert.equal(await attachBuyerOAuthContext(repeatReq, response(), "manual-mileage", repeatDeps), true);
  assert.equal(await attachBuyerOAuthContext(repeatReq, response(), "sync-session", repeatDeps), true);
  assert.equal(repeatCalls, 1, "Nested handlers must reuse the request-only grant");
  for (const [file, route] of [["athletes", "athletes"], ["records", "records"], ["athlete-best", "athlete-best"], ["athlete-profile", "athlete-profile"],
    ["dashboard", "dashboard"], ["meets", "meets"], ["training-plan", "training-plan"], ["sync-session", "sync-session"], ["manual-mileage", "manual-mileage"], ["meet-result", "meet-result"], ["correction", "correction"]]) {
    assert(fs.readFileSync(`api/ghl/${file}.js`, "utf8").includes(`attachBuyerOAuthContext(req, res, "${route}"`), `${file} direct handler must attach OAuth`);
  }
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
  console.log("Buyer OAuth read/write consumer isolation and readiness tests passed");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
