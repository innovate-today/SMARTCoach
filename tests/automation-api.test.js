const assert = require("assert");
const crypto = require("crypto");
const handler = require("../api/smart-trak/[route]");

function withEnv(overrides, fn) {
  const previous = {};
  Object.keys(overrides).forEach((key) => {
    previous[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  });
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      Object.keys(overrides).forEach((key) => {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      });
    });
}

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(key, value) {
      this.headers[key] = value;
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

function stripeSignature(body, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const digest = crypto.createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${digest}`;
}

async function testAutomationDryRunDoesNotSave() {
  const previousFetch = global.fetch;
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("Dry run should not call the registry when no registry is configured.");
  };
  try {
    await withEnv({
      SMARTCOACH_AUTOMATION_SECRET: "automation-secret",
      SMARTCOACH_REGISTRY_REST_URL: undefined,
      SMARTCOACH_REGISTRY_REST_TOKEN: undefined,
    }, async () => {
      const res = mockRes();
      await handler({
        method: "POST",
        query: { route: "account-automation-dry-run" },
        headers: { "x-smartcoach-automation-secret": "automation-secret" },
        body: {
          accountKey: "dry-run-school",
          productPlan: "pro",
          coachSeats: "1",
          privateIntegrationToken: "pit",
          locationId: "loc",
          coachAccessCodes: "coach-code",
          subscriptionStatus: "active",
        },
      }, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.dryRun, true);
      assert.strictEqual(res.body.registry.saved, false);
      assert.strictEqual(res.body.accessReady, true);
      assert.strictEqual(res.body.accountRegistryRecord.token, "__hidden__");
      assert.deepStrictEqual(res.body.accountRegistryRecord.coachAccessCodes, ["__hidden__"]);
      assert.strictEqual(fetchCalled, false);
    });
  } finally {
    global.fetch = previousFetch;
  }
}

async function testDuplicateStripeWebhookDoesNotSaveAgain() {
  const previousFetch = global.fetch;
  const eventId = "evt_duplicate_123";
  const secret = "stripe-webhook-secret";
  let setCalls = 0;
  const existing = {
    accountKey: "duplicate-school",
    productPlan: "pro",
    token: "pit",
    locationId: "loc",
    coachSeats: 1,
    coachAccessCodes: ["coach-code"],
    requireCoachAccess: true,
    subscription: { status: "active", billingCadence: "monthly", amount: "29.99" },
    lastAutomationEvent: {
      source: "stripe-webhook",
      eventType: "customer.subscription.updated",
      stripeEventId: eventId,
      receivedAt: "2026-05-21T00:00:00.000Z",
    },
    automationEventHistory: [],
  };

  global.fetch = async (url) => {
    const text = String(url);
    if (text.includes("/get/")) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ result: JSON.stringify(existing) }),
      };
    }
    if (text.includes("/set/")) {
      setCalls += 1;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ result: "OK" }),
      };
    }
    throw new Error(`Unexpected registry call: ${text}`);
  };

  try {
    await withEnv({
      SMARTCOACH_STRIPE_WEBHOOK_SECRET: secret,
      SMARTCOACH_REGISTRY_REST_URL: "https://registry.example",
      SMARTCOACH_REGISTRY_REST_TOKEN: "registry-token",
    }, async () => {
      const payload = {
        id: eventId,
        type: "customer.subscription.updated",
        data: {
          object: {
            object: "subscription",
            id: "sub_duplicate",
            metadata: { accountKey: "duplicate-school" },
            status: "active",
          },
        },
      };
      const rawBody = JSON.stringify(payload);
      const res = mockRes();
      await handler({
        method: "POST",
        query: { route: "account-stripe-webhook" },
        headers: { "stripe-signature": stripeSignature(rawBody, secret) },
        body: rawBody,
      }, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.stripeWebhookVerified, true);
      assert.strictEqual(res.body.stripeWebhookDuplicate, true);
      assert.strictEqual(res.body.registry.duplicate, true);
      assert.strictEqual(setCalls, 0);
    });
  } finally {
    global.fetch = previousFetch;
  }
}

async function testAutomationHealthLaunchReady() {
  const previousFetch = global.fetch;
  global.fetch = async (url) => {
    const text = String(url);
    if (text.includes("/ping")) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ result: "PONG" }),
      };
    }
    throw new Error(`Unexpected registry call: ${text}`);
  };

  try {
    await withEnv({
      SMARTCOACH_AUTOMATION_SECRET: "automation-secret",
      SMARTCOACH_REGISTRY_REST_URL: "https://registry.example",
      SMARTCOACH_REGISTRY_REST_TOKEN: "registry-token",
      SMARTCOACH_STRIPE_WEBHOOK_SECRET: "stripe-webhook-secret",
      SMARTCOACH_SESSION_SECRET: "session-secret",
      SMARTCOACH_REQUIRE_COACH_ACCESS: "true",
      SMARTCOACH_PARENT_EMAIL_FEATURE_ENABLED: undefined,
    }, async () => {
      const res = mockRes();
      await handler({
        method: "GET",
        query: { route: "account-automation-health" },
        headers: { "x-smartcoach-automation-secret": "automation-secret" },
      }, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.launchReady, true);
      assert.deepStrictEqual(res.body.launchBlockers, []);
      assert.ok(Array.isArray(res.body.launchChecks));
      assert.ok(res.body.launchChecks.length >= 6);
      assert.strictEqual(res.body.launchChecks.every((check) => check.ready), true);
    });
  } finally {
    global.fetch = previousFetch;
  }
}

async function testParentEmailReleaseGate() {
  await withEnv({
    SMARTCOACH_PRODUCT_PLAN_EMAILGATE: "pro",
    GHL_PRIVATE_INTEGRATION_TOKEN_EMAILGATE: "token",
    GHL_LOCATION_ID_EMAILGATE: "location",
    SMARTCOACH_COACH_ACCESS_CODES_EMAILGATE: "coach-one",
    SMARTCOACH_PARENT_EMAIL_COACH_ACCESS_EMAILGATE: "1",
    SMARTCOACH_REQUIRE_COACH_ACCESS_EMAILGATE: "true",
    SMARTCOACH_SUBSCRIPTION_STATUS_EMAILGATE: "active",
    SMARTCOACH_SESSION_SECRET: "session-secret",
    SMARTCOACH_PARENT_EMAIL_FEATURE_ENABLED: undefined,
  }, async () => {
    const sessionRes = mockRes();
    await handler({
      method: "POST",
      query: { route: "account-session" },
      headers: { "x-forwarded-for": "127.0.0.21" },
      body: { accountKey: "emailgate", accessCode: "coach-one" },
    }, sessionRes);

    assert.strictEqual(sessionRes.statusCode, 200);
    assert.strictEqual(sessionRes.body.success, true);
    assert.strictEqual(sessionRes.body.parentEmailAllowed, false);

    const statusRes = mockRes();
    await handler({
      method: "GET",
      query: { route: "account-status", account: "emailgate" },
      headers: { "x-smartcoach-session": sessionRes.body.sessionToken },
    }, statusRes);

    assert.strictEqual(statusRes.statusCode, 200);
    assert.strictEqual(statusRes.body.parentEmailToolsAllowed, false);
    assert.strictEqual(statusRes.body.coach.parentEmailAllowed, false);
  });

  await withEnv({
    SMARTCOACH_PRODUCT_PLAN_EMAILLIVE: "pro",
    GHL_PRIVATE_INTEGRATION_TOKEN_EMAILLIVE: "token",
    GHL_LOCATION_ID_EMAILLIVE: "location",
    SMARTCOACH_COACH_SEATS_EMAILLIVE: "3",
    SMARTCOACH_COACH_ACCESS_CODES_EMAILLIVE: "coach-one,coach-two",
    SMARTCOACH_PARENT_EMAIL_COACH_ACCESS_EMAILLIVE: "2",
    SMARTCOACH_REQUIRE_COACH_ACCESS_EMAILLIVE: "true",
    SMARTCOACH_SUBSCRIPTION_STATUS_EMAILLIVE: "active",
    SMARTCOACH_SESSION_SECRET: "session-secret",
    SMARTCOACH_PARENT_EMAIL_FEATURE_ENABLED: "true",
  }, async () => {
    const firstCoachRes = mockRes();
    await handler({
      method: "POST",
      query: { route: "account-session" },
      headers: { "x-forwarded-for": "127.0.0.22" },
      body: { accountKey: "emaillive", accessCode: "coach-one" },
    }, firstCoachRes);
    assert.strictEqual(firstCoachRes.statusCode, 200);
    assert.strictEqual(firstCoachRes.body.parentEmailAllowed, false);

    const secondCoachRes = mockRes();
    await handler({
      method: "POST",
      query: { route: "account-session" },
      headers: { "x-forwarded-for": "127.0.0.23" },
      body: { accountKey: "emaillive", accessCode: "coach-two" },
    }, secondCoachRes);

    assert.strictEqual(secondCoachRes.statusCode, 200);
    assert.strictEqual(secondCoachRes.body.parentEmailAllowed, true);

    const statusRes = mockRes();
    await handler({
      method: "GET",
      query: { route: "account-status", account: "emaillive" },
      headers: { "x-smartcoach-session": secondCoachRes.body.sessionToken },
    }, statusRes);

    assert.strictEqual(statusRes.statusCode, 200);
    assert.strictEqual(statusRes.body.parentEmailToolsAllowed, true);
    assert.strictEqual(statusRes.body.coach.parentEmailAllowed, true);
  });
}

async function testCoachAccessRateLimit() {
  await withEnv({
    SMARTCOACH_PRODUCT_PLAN_RATELIMIT: "pro",
    GHL_PRIVATE_INTEGRATION_TOKEN_RATELIMIT: "token",
    GHL_LOCATION_ID_RATELIMIT: "location",
    SMARTCOACH_COACH_ACCESS_CODES_RATELIMIT: "coach-one",
    SMARTCOACH_REQUIRE_COACH_ACCESS_RATELIMIT: "true",
    SMARTCOACH_SUBSCRIPTION_STATUS_RATELIMIT: "active",
    SMARTCOACH_SESSION_SECRET: "session-secret",
  }, async () => {
    for (let i = 0; i < 8; i += 1) {
      const res = mockRes();
      await handler({
        method: "POST",
        query: { route: "account-session" },
        headers: { "x-forwarded-for": "127.0.0.31" },
        body: { accountKey: "ratelimit", accessCode: `wrong-code-${i}` },
      }, res);

      assert.strictEqual(res.statusCode, 401);
      assert.strictEqual(res.body.allowed, false);
      assert.strictEqual(res.body.accessCodeRequired, true);
      if (i === 7) assert.ok(Number(res.headers["Retry-After"]) > 0);
    }

    const blockedRes = mockRes();
    await handler({
      method: "POST",
      query: { route: "account-session" },
      headers: { "x-forwarded-for": "127.0.0.31" },
      body: { accountKey: "ratelimit", accessCode: "coach-one" },
    }, blockedRes);

    assert.strictEqual(blockedRes.statusCode, 429);
    assert.match(blockedRes.body.error, /Too many access attempts/);
    assert.ok(Number(blockedRes.headers["Retry-After"]) > 0);
  });
}

(async () => {
  await testAutomationDryRunDoesNotSave();
  await testDuplicateStripeWebhookDoesNotSaveAgain();
  await testAutomationHealthLaunchReady();
  await testParentEmailReleaseGate();
  await testCoachAccessRateLimit();
  console.log("automation API dry-run and Stripe idempotency tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
