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
      KV_REST_API_URL: undefined,
      KV_REST_API_TOKEN: undefined,
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined,
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
      assert.strictEqual(JSON.stringify(res.body).includes("pit"), false);
      assert.strictEqual(JSON.stringify(res.body).includes("coach-code"), false);
      assert.ok(res.body.environment.some((row) => row.key.includes("GHL_PRIVATE_INTEGRATION_TOKEN") && row.value === "__hidden__"));
      assert.ok(res.body.environment.some((row) => row.key.includes("SMARTCOACH_COACH_ACCESS_CODES") && row.value === "__hidden__"));
      assert.strictEqual(fetchCalled, false);
    });
  } finally {
    global.fetch = previousFetch;
  }
}

async function testAccountSetupCodeProtection() {
  await withEnv({
    SMARTCOACH_ADMIN_SETUP_CODE: "setup-secret",
  }, async () => {
    const missingRes = mockRes();
    await handler({
      method: "GET",
      query: { route: "account-setup", account: "protected-school", plan: "pro" },
      headers: {},
    }, missingRes);

    assert.strictEqual(missingRes.statusCode, 401);
    assert.strictEqual(missingRes.body.adminSetupCodeRequired, true);

    const wrongRes = mockRes();
    await handler({
      method: "GET",
      query: { route: "account-setup", account: "protected-school", plan: "pro", setupCode: "wrong-code" },
      headers: {},
    }, wrongRes);

    assert.strictEqual(wrongRes.statusCode, 401);
    assert.strictEqual(wrongRes.body.adminSetupCodeRequired, true);

    const allowedRes = mockRes();
    await handler({
      method: "GET",
      query: { route: "account-setup", account: "protected-school", plan: "pro", setupCode: "setup-secret" },
      headers: {},
    }, allowedRes);

    assert.strictEqual(allowedRes.statusCode, 200);
    assert.strictEqual(allowedRes.body.accountKey, "protected-school");
    assert.ok(Array.isArray(allowedRes.body.environment));
  });
}

async function testAutomationSecretRequiredBeforeRegistry() {
  const previousFetch = global.fetch;
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("Unauthorized automation should not touch the registry.");
  };

  try {
    await withEnv({
      SMARTCOACH_AUTOMATION_SECRET: "automation-secret",
      SMARTCOACH_REGISTRY_REST_URL: "https://registry.example",
      SMARTCOACH_REGISTRY_REST_TOKEN: "registry-token",
    }, async () => {
      const payload = {
        accountKey: "unauthorized-school",
        productPlan: "pro",
        privateIntegrationToken: "pit",
        locationId: "loc",
        coachAccessCodes: "coach-code",
        subscriptionStatus: "active",
      };

      const missingSecretRes = mockRes();
      await handler({
        method: "POST",
        query: { route: "account-automation" },
        headers: {},
        body: payload,
      }, missingSecretRes);

      assert.strictEqual(missingSecretRes.statusCode, 401);
      assert.strictEqual(missingSecretRes.body.automationSecretRequired, true);

      const wrongSecretRes = mockRes();
      await handler({
        method: "POST",
        query: { route: "account-automation" },
        headers: { "x-smartcoach-automation-secret": "wrong-secret" },
        body: payload,
      }, wrongSecretRes);

      assert.strictEqual(wrongSecretRes.statusCode, 401);
      assert.strictEqual(wrongSecretRes.body.automationSecretRequired, true);
      assert.strictEqual(fetchCalled, false);
    });
  } finally {
    global.fetch = previousFetch;
  }
}

async function testAutomationDoesNotGenerateCoachCodes() {
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
        accountKey: "missing-code-school",
        productPlan: "pro",
        coachSeats: "3",
        privateIntegrationToken: "pit",
        locationId: "loc",
        subscriptionStatus: "active",
      },
    }, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.setupReady, false);
    assert.strictEqual(res.body.accessReady, false);
    assert.strictEqual(res.body.coachSeats, 3);
    assert.deepStrictEqual(res.body.accountRegistryRecord.coachAccessCodes, []);
    assert.strictEqual(res.body.accountRegistryRecord.requireCoachAccess, true);
  });
}

async function testAutomationPreservesProUnlimitedPlan() {
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
        accountKey: "unlimited-school",
        productPlan: "proUnlimited",
        coachSeats: "10",
        privateIntegrationToken: "pit",
        locationId: "loc",
        coachAccessCodes: "coach-code",
        subscriptionStatus: "active",
        subscriptionAmount: "45.00",
      },
    }, res);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.success, true);
    assert.strictEqual(res.body.productPlan, "proUnlimited");
    assert.strictEqual(res.body.productPlanLabel, "SMARTCoach Pro Unlimited");
    assert.strictEqual(res.body.activeAthleteLimit, null);
    assert.strictEqual(res.body.subscription.amount, "Custom");
  });
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

async function testInvalidStripeWebhookDoesNotTouchRegistry() {
  const previousFetch = global.fetch;
  const secret = "stripe-webhook-secret";
  let fetchCalled = false;
  global.fetch = async () => {
    fetchCalled = true;
    throw new Error("Invalid Stripe signatures should not touch the registry.");
  };

  try {
    await withEnv({
      SMARTCOACH_STRIPE_WEBHOOK_SECRET: secret,
      SMARTCOACH_REGISTRY_REST_URL: "https://registry.example",
      SMARTCOACH_REGISTRY_REST_TOKEN: "registry-token",
    }, async () => {
      const payload = {
        id: "evt_bad_signature",
        type: "customer.subscription.updated",
        data: {
          object: {
            object: "subscription",
            id: "sub_bad_signature",
            metadata: { accountKey: "bad-signature-school" },
            status: "active",
          },
        },
      };
      const rawBody = JSON.stringify(payload);

      const missingSignatureRes = mockRes();
      await handler({
        method: "POST",
        query: { route: "account-stripe-webhook" },
        headers: {},
        body: rawBody,
      }, missingSignatureRes);

      assert.strictEqual(missingSignatureRes.statusCode, 401);
      assert.match(missingSignatureRes.body.error, /signature is required/i);

      const invalidSignatureRes = mockRes();
      await handler({
        method: "POST",
        query: { route: "account-stripe-webhook" },
        headers: { "stripe-signature": stripeSignature(rawBody, "wrong-secret") },
        body: rawBody,
      }, invalidSignatureRes);

      assert.strictEqual(invalidSignatureRes.statusCode, 401);
      assert.match(invalidSignatureRes.body.error, /could not be verified/i);
      assert.strictEqual(fetchCalled, false);
    });
  } finally {
    global.fetch = previousFetch;
  }
}

async function testPartialAutomationPreservesSavedConnection() {
  const previousFetch = global.fetch;
  const existing = {
    accountKey: "merge-school",
    productPlan: "pro",
    token: "saved-token",
    locationId: "saved-location",
    coachSeats: 3,
    coachAccessCodes: ["coach-one", "coach-two", "coach-three"],
    parentEmailCoachAccess: [true, false, true],
    requireCoachAccess: true,
    subscription: {
      status: "active",
      billingCadence: "monthly",
      amount: "39.99",
      renewalDate: "2026-06-21",
      stripeCustomerId: "cus_saved",
      stripeSubscriptionId: "sub_saved",
    },
    logoUrl: "https://example.com/logo.png",
    automationEventHistory: [],
  };
  let savedRecord = null;

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
      const encodedPayload = text.split("/set/")[1].split("/").slice(1).join("/");
      savedRecord = JSON.parse(decodeURIComponent(encodedPayload));
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
      SMARTCOACH_AUTOMATION_SECRET: "automation-secret",
      SMARTCOACH_REGISTRY_REST_URL: "https://registry.example",
      SMARTCOACH_REGISTRY_REST_TOKEN: "registry-token",
    }, async () => {
      const res = mockRes();
      await handler({
        method: "POST",
        query: { route: "account-automation" },
        headers: { "x-smartcoach-automation-secret": "automation-secret" },
        body: {
          accountKey: "merge-school",
          subscriptionStatus: "past_due",
          subscriptionAmount: "49.99",
          renewalDate: "2026-07-21",
          stripeSubscriptionId: "sub_updated",
        },
      }, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.registry.saved, true);
      assert.ok(savedRecord);
      assert.strictEqual(savedRecord.token, existing.token);
      assert.strictEqual(savedRecord.locationId, existing.locationId);
      assert.deepStrictEqual(savedRecord.coachAccessCodes, existing.coachAccessCodes);
      assert.deepStrictEqual(savedRecord.parentEmailCoachAccess, existing.parentEmailCoachAccess);
      assert.strictEqual(savedRecord.logoUrl, existing.logoUrl);
      assert.strictEqual(savedRecord.subscription.status, "past_due");
      assert.strictEqual(savedRecord.subscription.amount, "49.99");
      assert.strictEqual(savedRecord.subscription.renewalDate, "2026-07-21");
      assert.strictEqual(savedRecord.subscription.stripeCustomerId, existing.subscription.stripeCustomerId);
      assert.strictEqual(savedRecord.subscription.stripeSubscriptionId, "sub_updated");
      assert.strictEqual(res.body.accountRegistryRecord.token, "__hidden__");
      assert.deepStrictEqual(res.body.accountRegistryRecord.coachAccessCodes, ["__hidden__", "__hidden__", "__hidden__"]);
      assert.ok(res.body.environment.some((row) => row.key.includes("GHL_PRIVATE_INTEGRATION_TOKEN") && row.value === "__hidden__"));
      assert.ok(res.body.environment.some((row) => row.key.includes("SMARTCOACH_COACH_ACCESS_CODES") && row.value === "__hidden__"));
      assert.strictEqual(JSON.stringify(res.body).includes(existing.token), false);
      assert.strictEqual(JSON.stringify(res.body).includes(existing.coachAccessCodes[0]), false);
    });
  } finally {
    global.fetch = previousFetch;
  }
}

async function testCoachCodeResetLimit() {
  const previousFetch = global.fetch;
  const month = new Date().toISOString().slice(0, 7);
  const existing = {
    accountKey: "reset-limit-school",
    productPlan: "pro25",
    token: "saved-token",
    locationId: "saved-location",
    coachSeats: 1,
    coachAccessCodes: ["old-code"],
    requireCoachAccess: true,
    subscription: { status: "active", billingCadence: "monthly", amount: "45.00" },
    coachCodeChangeHistory: [
      { changedAt: `${month}-01T12:00:00.000Z`, month, source: "manual-onboarding" },
      { changedAt: `${month}-10T12:00:00.000Z`, month, source: "manual-onboarding" },
    ],
  };
  let saveCalled = false;

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
      saveCalled = true;
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
      SMARTCOACH_AUTOMATION_SECRET: "automation-secret",
      SMARTCOACH_REGISTRY_REST_URL: "https://registry.example",
      SMARTCOACH_REGISTRY_REST_TOKEN: "registry-token",
    }, async () => {
      const res = mockRes();
      await handler({
        method: "POST",
        query: { route: "account-automation" },
        headers: { "x-smartcoach-automation-secret": "automation-secret" },
        body: {
          accountKey: "reset-limit-school",
          coachAccessCodes: "new-code",
        },
      }, res);

      assert.strictEqual(res.statusCode, 429);
      assert.match(res.body.error, /2 times per month/);
      assert.strictEqual(saveCalled, false);
    });
  } finally {
    global.fetch = previousFetch;
  }
}

async function testCoachSelfServiceCodeReset() {
  const previousFetch = global.fetch;
  const existing = {
    accountKey: "self-reset-school",
    productPlan: "pro25",
    token: "saved-token",
    locationId: "saved-location",
    coachSeats: 2,
    coachAccessCodes: ["coach-one", "coach-two"],
    parentEmailCoachAccess: [true, false],
    requireCoachAccess: true,
    subscription: { status: "active", billingCadence: "monthly", amount: "45.00" },
    coachCodeVersion: 1,
    coachCodeChangeHistory: [],
  };
  let savedRecord = null;

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
      const encodedPayload = text.split("/set/")[1].split("/").slice(1).join("/");
      savedRecord = JSON.parse(decodeURIComponent(encodedPayload));
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
      SMARTCOACH_SESSION_SECRET: "session-secret",
      SMARTCOACH_AUTOMATION_SECRET: "automation-secret",
      SMARTCOACH_REGISTRY_REST_URL: "https://registry.example",
      SMARTCOACH_REGISTRY_REST_TOKEN: "registry-token",
    }, async () => {
      const res = mockRes();
      await handler({
        method: "POST",
        query: { route: "account-code-reset" },
        headers: {},
        body: {
          accountKey: "self-reset-school",
          currentCode: "coach-one",
          newCode: "coach-one-new",
        },
      }, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.coachIndex, 0);
      assert.ok(res.body.sessionToken);
      assert.ok(savedRecord);
      assert.deepStrictEqual(savedRecord.coachAccessCodes, ["coach-one-new", "coach-two"]);
      assert.strictEqual(savedRecord.coachCodeVersion, 2);
      assert.strictEqual(savedRecord.coachCodeChangeHistory.length, 1);
      assert.strictEqual(savedRecord.coachCodeChangeHistory[0].source, "coach-self-service");
    });
  } finally {
    global.fetch = previousFetch;
  }
}

async function testCoachRecoveryBypassesMonthlyResetLimit() {
  const previousFetch = global.fetch;
  const month = new Date().toISOString().slice(0, 7);
  const secret = "session-secret";
  const accountKey = "recovery-limit-school";
  const recoveryCode = "TEMP1234";
  const tokenHash = crypto.createHash("sha256").update(`${secret}:${accountKey}:${recoveryCode}`).digest("hex");
  const existing = {
    accountKey,
    productPlan: "pro25",
    token: "saved-token",
    locationId: "saved-location",
    coachSeats: 1,
    coachAccessCodes: ["old-code"],
    parentEmailCoachAccess: [false],
    requireCoachAccess: true,
    subscription: { status: "active", billingCadence: "monthly", amount: "45.00" },
    coachCodeVersion: 3,
    coachCodeRecovery: {
      requestedAt: `${month}-15T12:00:00.000Z`,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      tokenHash,
      status: "sent",
      delivery: "email",
      sentTo: "coach@example.com",
    },
    coachCodeChangeHistory: [
      { changedAt: `${month}-01T12:00:00.000Z`, month, source: "manual-onboarding" },
      { changedAt: `${month}-10T12:00:00.000Z`, month, source: "manual-onboarding" },
    ],
  };
  let savedRecord = null;

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
      const encodedPayload = text.split("/set/")[1].split("/").slice(1).join("/");
      savedRecord = JSON.parse(decodeURIComponent(encodedPayload));
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
      SMARTCOACH_SESSION_SECRET: secret,
      SMARTCOACH_REGISTRY_REST_URL: "https://registry.example",
      SMARTCOACH_REGISTRY_REST_TOKEN: "registry-token",
    }, async () => {
      const res = mockRes();
      await handler({
        method: "POST",
        query: { route: "account-code-reset" },
        headers: {},
        body: {
          accountKey,
          recoveryCode,
          newCode: "coach-new-safe",
        },
      }, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.temporaryRecoveryUsed, true);
      assert.ok(savedRecord);
      assert.deepStrictEqual(savedRecord.coachAccessCodes, ["coach-new-safe"]);
      assert.strictEqual(savedRecord.coachCodeRecovery.status, "used");
      assert.strictEqual(savedRecord.coachCodeVersion, 4);
      assert.strictEqual(savedRecord.coachCodeChangeHistory[0].source, "coach-recovery");
    });
  } finally {
    global.fetch = previousFetch;
  }
}

async function testAccountSetupSyncsGhlAccountKeyCustomValue() {
  const previousFetch = global.fetch;
  let savedRecord = null;
  const ghlCalls = [];

  global.fetch = async (url, options = {}) => {
    const text = String(url);
    if (text.includes("/get/")) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ result: "" }),
      };
    }
    if (text.includes("/set/")) {
      const encodedPayload = text.split("/set/")[1].split("/").slice(1).join("/");
      savedRecord = JSON.parse(decodeURIComponent(encodedPayload));
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ result: "OK" }),
      };
    }
    if (text.includes("services.leadconnectorhq.com/locations/location-123/customValues")) {
      ghlCalls.push({ url: text, method: options.method || "GET", body: options.body ? JSON.parse(options.body) : null });
      if ((options.method || "GET") === "GET") {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ customValues: [] }),
        };
      }
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ customValue: { id: "cv_123", name: "account_key", fieldKey: "{{custom_values.account_key}}" } }),
      };
    }
    throw new Error(`Unexpected setup custom value call: ${text}`);
  };

  try {
    await withEnv({
      SMARTCOACH_AUTOMATION_SECRET: "automation-secret",
      SMARTCOACH_REGISTRY_REST_URL: "https://registry.example",
      SMARTCOACH_REGISTRY_REST_TOKEN: "registry-token",
    }, async () => {
      const res = mockRes();
      await handler({
        method: "POST",
        query: { route: "account-automation" },
        headers: { "x-smartcoach-automation-secret": "automation-secret" },
        body: {
          accountKey: "custom-value-school",
          productPlan: "pro",
          privateIntegrationToken: "pit",
          locationId: "location-123",
          coachAccessCodes: "coach-code",
          subscriptionStatus: "active",
        },
      }, res);

      assert.strictEqual(res.statusCode, 200);
      assert.ok(savedRecord);
      assert.strictEqual(res.body.registry.saved, true);
      assert.strictEqual(res.body.ghlCustomValueSync.success, true);
      assert.strictEqual(res.body.ghlCustomValueSync.action, "created");
      assert.strictEqual(ghlCalls.length, 2);
      assert.strictEqual(ghlCalls[1].method, "POST");
      assert.deepStrictEqual(ghlCalls[1].body, { name: "account_key", value: "custom-value-school" });
    });
  } finally {
    global.fetch = previousFetch;
  }
}

async function testAutomationSubscriptionStatusAliases() {
  const previousFetch = global.fetch;
  const cases = [
    ["paid", "active"],
    ["payment failed", "past_due"],
    ["failed payment", "past_due"],
    ["cancelled", "canceled"],
    ["pending", "incomplete"],
    ["not paid", "unpaid"],
    ["unexpected workflow text", "incomplete"],
  ];

  try {
    await withEnv({
      SMARTCOACH_AUTOMATION_SECRET: "automation-secret",
      SMARTCOACH_REGISTRY_REST_URL: "https://registry.example",
      SMARTCOACH_REGISTRY_REST_TOKEN: "registry-token",
    }, async () => {
      for (const [input, expected] of cases) {
        let savedRecord = null;
        global.fetch = async (url) => {
          const text = String(url);
          if (text.includes("/get/")) {
            return {
              ok: true,
              status: 200,
              text: async () => JSON.stringify({ result: "" }),
            };
          }
          if (text.includes("/set/")) {
            const encodedPayload = text.split("/set/")[1].split("/").slice(1).join("/");
            savedRecord = JSON.parse(decodeURIComponent(encodedPayload));
            return {
              ok: true,
              status: 200,
              text: async () => JSON.stringify({ result: "OK" }),
            };
          }
          throw new Error(`Unexpected registry call: ${text}`);
        };

        const res = mockRes();
        await handler({
          method: "POST",
          query: { route: "account-automation" },
          headers: { "x-smartcoach-automation-secret": "automation-secret" },
          body: {
            accountKey: `status-${expected.replace(/_/g, "-")}`,
            productPlan: "pro",
            privateIntegrationToken: "pit",
            locationId: "loc",
            coachAccessCodes: "coach-code",
            subscriptionStatus: input,
          },
        }, res);

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(savedRecord.subscription.status, expected);
        assert.strictEqual(res.body.subscriptionAccessAllowed, expected === "active" || expected === "trialing");
      }
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
      SMARTCOACH_ADMIN_SETUP_CODE: "setup-secret",
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
      assert.ok(res.body.launchChecks.length >= 7);
      assert.strictEqual(res.body.launchChecks.every((check) => check.ready), true);
      assert.strictEqual(res.body.setupCodeConfigured, true);
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

async function testRegistryLookupHidesSecrets() {
  const previousFetch = global.fetch;
  const record = {
    accountKey: "secret-school",
    productPlan: "pro",
    token: "private-integration-token",
    locationId: "location",
    accessCode: "legacy-access",
    coachSeats: 3,
    coachAccessCodes: ["coach-one", "coach-two"],
    parentEmailCoachAccess: [true, false, false],
    requireCoachAccess: true,
    subscription: { status: "active", billingCadence: "monthly", amount: "39.99" },
    updatedAt: "2026-05-22T00:00:00.000Z",
  };

  global.fetch = async (url) => {
    const text = String(url);
    if (text.includes("/get/")) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ result: JSON.stringify(record) }),
      };
    }
    throw new Error(`Unexpected registry call: ${text}`);
  };

  try {
    await withEnv({
      SMARTCOACH_AUTOMATION_SECRET: "automation-secret",
      SMARTCOACH_REGISTRY_REST_URL: "https://registry.example",
      SMARTCOACH_REGISTRY_REST_TOKEN: "registry-token",
    }, async () => {
      const res = mockRes();
      await handler({
        method: "GET",
        query: { route: "account-registry", account: "secret-school" },
        headers: { "x-smartcoach-automation-secret": "automation-secret" },
      }, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.setupReady, true);
      assert.strictEqual(res.body.accountRegistryRecord.token, "__hidden__");
      assert.strictEqual(res.body.accountRegistryRecord.accessCode, "__hidden__");
      assert.deepStrictEqual(res.body.accountRegistryRecord.coachAccessCodes, ["__hidden__", "__hidden__"]);
      assert.strictEqual(res.body.accountRegistryRecord.privateIntegrationToken, undefined);
      assert.strictEqual(JSON.stringify(res.body).includes("private-integration-token"), false);
      assert.strictEqual(JSON.stringify(res.body).includes("coach-one"), false);
      assert.strictEqual(JSON.stringify(res.body).includes("legacy-access"), false);
    });
  } finally {
    global.fetch = previousFetch;
  }
}

async function testRegistryListSubscribers() {
  const previousFetch = global.fetch;
  const records = {
    "smartcoach:account:alpha": {
      accountKey: "alpha",
      productPlan: "pro25",
      token: "private-alpha",
      locationId: "loc-alpha",
      coachSeats: 1,
      coachAccessCodes: ["alpha-code"],
      requireCoachAccess: true,
      subscription: { status: "active", billingCadence: "monthly", amount: "45.00" },
      updatedAt: "2026-05-22T12:00:00.000Z",
    },
    "smartcoach:account:bravo": {
      accountKey: "bravo",
      productPlan: "essential",
      coachSeats: 1,
      coachAccessCodes: ["bravo-code"],
      requireCoachAccess: true,
      subscription: { status: "active", billingCadence: "annual", amount: "100.00" },
      updatedAt: "2026-05-23T12:00:00.000Z",
    },
  };

  global.fetch = async (url) => {
    const text = String(url);
    if (text.includes("/scan/")) {
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ result: ["0", Object.keys(records).concat(["smartcoach:account:alpha:records:index"])] }),
      };
    }
    if (text.includes("/get/")) {
      const key = decodeURIComponent(text.split("/get/")[1] || "");
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ result: JSON.stringify(records[key]) }),
      };
    }
    throw new Error(`Unexpected registry call: ${text}`);
  };

  try {
    await withEnv({
      SMARTCOACH_AUTOMATION_SECRET: "automation-secret",
      SMARTCOACH_REGISTRY_REST_URL: "https://registry.example",
      SMARTCOACH_REGISTRY_REST_TOKEN: "registry-token",
    }, async () => {
      const res = mockRes();
      await handler({
        method: "GET",
        query: { route: "account-registry", action: "list" },
        headers: { "x-smartcoach-automation-secret": "automation-secret" },
      }, res);

      assert.strictEqual(res.statusCode, 200);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.count, 2);
      assert.deepStrictEqual(res.body.accounts.map((item) => item.accountKey), ["bravo", "alpha"]);
      assert.strictEqual(res.body.accounts[0].productPlan, "essential");
      assert.strictEqual(res.body.accounts[1].coachAccessCodesConfigured, 1);
      assert.strictEqual(JSON.stringify(res.body).includes("private-alpha"), false);
      assert.strictEqual(JSON.stringify(res.body).includes("alpha-code"), false);
      assert.strictEqual(JSON.stringify(res.body).includes("bravo-code"), false);
    });
  } finally {
    global.fetch = previousFetch;
  }
}

async function testAccountStatusReportsDeviceUnlock() {
  await withEnv({
    SMARTCOACH_PRODUCT_PLAN_UNLOCK: "pro",
    GHL_PRIVATE_INTEGRATION_TOKEN_UNLOCK: "token",
    GHL_LOCATION_ID_UNLOCK: "location",
    SMARTCOACH_COACH_ACCESS_CODES_UNLOCK: "coach-one",
    SMARTCOACH_REQUIRE_COACH_ACCESS_UNLOCK: "true",
    SMARTCOACH_SUBSCRIPTION_STATUS_UNLOCK: "active",
    SMARTCOACH_SESSION_SECRET: "session-secret",
  }, async () => {
    const lockedRes = mockRes();
    await handler({
      method: "GET",
      query: { route: "account-status", account: "unlock" },
      headers: {},
    }, lockedRes);

    assert.strictEqual(lockedRes.statusCode, 200);
    assert.strictEqual(lockedRes.body.accessReady, true);
    assert.strictEqual(lockedRes.body.coachAccessRequired, true);
    assert.strictEqual(lockedRes.body.coachAccessUnlocked, false);
    assert.strictEqual(lockedRes.body.coachSessionActive, false);
    assert.strictEqual(lockedRes.body.deviceAccessReady, false);

    const codeRes = mockRes();
    await handler({
      method: "GET",
      query: { route: "account-status", account: "unlock" },
      headers: { "x-smartcoach-access-code": "coach-one" },
    }, codeRes);

    assert.strictEqual(codeRes.statusCode, 200);
    assert.strictEqual(codeRes.body.accessReady, true);
    assert.strictEqual(codeRes.body.coachAccessUnlocked, true);
    assert.strictEqual(codeRes.body.coachAccessCodeAccepted, true);
    assert.strictEqual(codeRes.body.deviceAccessReady, true);

    const sessionRes = mockRes();
    await handler({
      method: "POST",
      query: { route: "account-session" },
      headers: { "x-forwarded-for": "127.0.0.41" },
      body: { accountKey: "unlock", accessCode: "coach-one" },
    }, sessionRes);
    assert.strictEqual(sessionRes.statusCode, 200);

    const unlockedRes = mockRes();
    await handler({
      method: "GET",
      query: { route: "account-status", account: "unlock" },
      headers: { "x-smartcoach-session": sessionRes.body.sessionToken },
    }, unlockedRes);

    assert.strictEqual(unlockedRes.statusCode, 200);
    assert.strictEqual(unlockedRes.body.accessReady, true);
    assert.strictEqual(unlockedRes.body.coachAccessUnlocked, true);
    assert.strictEqual(unlockedRes.body.coachSessionActive, true);
    assert.strictEqual(unlockedRes.body.deviceAccessReady, true);
  });
}

(async () => {
  await testAutomationDryRunDoesNotSave();
  await testAccountSetupCodeProtection();
  await testAutomationSecretRequiredBeforeRegistry();
  await testAutomationDoesNotGenerateCoachCodes();
  await testAutomationPreservesProUnlimitedPlan();
  await testDuplicateStripeWebhookDoesNotSaveAgain();
  await testInvalidStripeWebhookDoesNotTouchRegistry();
  await testPartialAutomationPreservesSavedConnection();
  await testCoachCodeResetLimit();
  await testCoachSelfServiceCodeReset();
  await testCoachRecoveryBypassesMonthlyResetLimit();
  await testAccountSetupSyncsGhlAccountKeyCustomValue();
  await testAutomationSubscriptionStatusAliases();
  await testAutomationHealthLaunchReady();
  await testParentEmailReleaseGate();
  await testCoachAccessRateLimit();
  await testRegistryLookupHidesSecrets();
  await testRegistryListSubscribers();
  await testAccountStatusReportsDeviceUnlock();
  console.log("automation API dry-run and Stripe idempotency tests passed");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
