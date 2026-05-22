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

(async () => {
  await testAutomationDryRunDoesNotSave();
  await testDuplicateStripeWebhookDoesNotSaveAgain();
  console.log("automation API dry-run and Stripe idempotency tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
