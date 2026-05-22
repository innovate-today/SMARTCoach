const assert = require("assert");
const {
  requireProPlan,
  coachCodeAllowed,
  createCoachSession,
  subscriptionAccessAllowed,
  subscriptionBlockedMessage,
} = require("../lib/ghl-account");

function withEnv(overrides, fn) {
  const previous = {};
  Object.keys(overrides).forEach((key) => {
    previous[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  });
  try {
    fn();
  } finally {
    Object.keys(overrides).forEach((key) => {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    });
  }
}

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function req(accountKey = "test") {
  return { query: { account: accountKey }, headers: { "x-forwarded-for": "127.0.0.1" } };
}

withEnv({
  SMARTCOACH_PRODUCT_PLAN_TEST: "pro",
  GHL_PRIVATE_INTEGRATION_TOKEN_TEST: "token",
  GHL_LOCATION_ID_TEST: "location",
  SMARTCOACH_COACH_ACCESS_CODES_TEST: "coach-one,coach-two",
  SMARTCOACH_REQUIRE_COACH_ACCESS_TEST: "true",
  SMARTCOACH_SUBSCRIPTION_STATUS_TEST: "active",
  SMARTCOACH_SESSION_SECRET: "test-session-secret",
}, () => {
  assert.strictEqual(subscriptionAccessAllowed({ status: "" }), true);
  assert.strictEqual(subscriptionAccessAllowed({ status: "active" }), true);
  assert.strictEqual(subscriptionAccessAllowed({ status: "trialing" }), true);
  assert.strictEqual(subscriptionAccessAllowed({ status: "past_due" }), false);
  assert.strictEqual(subscriptionBlockedMessage({ status: "past_due" }), "SMART Trak access is blocked because this subscription is past due.");

  const activeRes = mockRes();
  assert.strictEqual(requireProPlan(req(), activeRes), false, "coach code should be required without a session or code");
  assert.strictEqual(activeRes.statusCode, 401);
  assert.strictEqual(activeRes.body.accessCodeRequired, true);

  assert.strictEqual(coachCodeAllowed(req(), "bad-code").allowed, false);
  const allowed = coachCodeAllowed(req(), "coach-one");
  assert.strictEqual(allowed.allowed, true);
  assert.strictEqual(allowed.coachSeats, 1);

  const session = createCoachSession("test");
  const sessionReq = { query: { account: "test" }, headers: { "x-smartcoach-session": session.token } };
  const sessionRes = mockRes();
  assert.strictEqual(requireProPlan(sessionReq, sessionRes), true);

  withEnv({ SMARTCOACH_SUBSCRIPTION_STATUS_TEST: "canceled" }, () => {
    const blockedRes = mockRes();
    assert.strictEqual(requireProPlan(req(), blockedRes), false);
    assert.strictEqual(blockedRes.statusCode, 402);
    assert.strictEqual(blockedRes.body.subscriptionAccessRequired, true);
    assert.match(blockedRes.body.error, /subscription is canceled/);
    const blockedAccess = coachCodeAllowed(req(), "coach-one");
    assert.strictEqual(blockedAccess.allowed, false);
    assert.strictEqual(blockedAccess.statusCode, 402);
  });

  withEnv({ SMARTCOACH_PRODUCT_PLAN_TEST: "essential" }, () => {
    const essentialRes = mockRes();
    assert.strictEqual(requireProPlan(req(), essentialRes), false);
    assert.strictEqual(essentialRes.statusCode, 403);
    assert.match(essentialRes.body.error, /Pro/);
  });
});

console.log("ghl-account subscription and coach access tests passed");
