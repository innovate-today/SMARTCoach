const crypto = require("crypto");
const registry = require("./account-registry");
const { subscriptionAccessAllowed, accountSetupReady, accountAccessAllowed, normalizeAccountAccess } = require("./ghl-account");
const { coachAccessEmail } = require("./coach-access-email");
const { verifySaasCatalogPurchase } = require("./saas-purchase");
const { planBuyerFulfillment, createBuyerFulfillment, controlledBuyerExecutionAllowed, automaticBuyerExecutionAllowed } = require("./buyer-fulfillment");
const { createBuyerReadiness } = require("./buyer-readiness");
const { createBuyerReadinessWorker } = require("./buyer-readiness-worker");
const { createBuyerReadinessRecovery } = require("./buyer-readiness-recovery");
const { newBuyerPolicyEnabled, validBuyerIdentity, qualifyNewBuyer, completedBuyerOAuthApproval } = require("./new-buyer-policy");

const APP_ID = "6abfe408797ba36482ddbe72";
const PROVISIONING_APP_ID = "6abed80821f5efd8466abccb";
const STORE_KEY = "ghlconnector";
const CALLBACK_PATH = "/api/smart-trak/crm-connect-callback";
const COOKIE = "__Host-smartcoach-ghl-state";
const STATE_TTL_MS = 10 * 60 * 1000;
const SELLER_LOCATION_ID = "QxwjWekSyUf7sDOFHPB4";
const APPROVED_LEGACY_BUYER = { accountKey: "sc-tiz08pppv3nuas4nkt63", locationId: "tIz08pPpV3nUaS4nKt63",
  schoolName: "Athletic Develop", coachName: "Jenn Moore", ownerEmail: "athleticdevelop@yahoo.com",
  expectedSubscriptionId: "6abd897d66ad43f827dbaa4e", expectedOrderId: "6abd8977b229ab130b0f3c93",
  expectedSaleLinkId: "6a1b37c203b17c94f5713b61", expectedProductName: "SMARTCoach Pro 25 - Monthly",
  expectedBillingCadence: "monthly", expectedAmount: "19.00" };

function failure(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

function equal(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length > 0 && left.length === right.length && crypto.timingSafeEqual(left, right);
}

function config(env) {
  const clientId = String(env.SMARTCOACH_GHL_OAUTH_CLIENT_ID || "").trim();
  const secret = String(env.SMARTCOACH_GHL_OAUTH_CLIENT_SECRET || "").trim();
  const companyId = String(env.SMARTCOACH_GHL_OAUTH_COMPANY_ID || "").trim();
  const key = Buffer.from(env.SMARTCOACH_GHL_OAUTH_ENCRYPTION_KEY || "", "base64");
  const scopes = String(env.SMARTCOACH_GHL_OAUTH_SCOPES || "").trim().split(/\s+/).filter(Boolean);
  let redirect, install;
  try {
    redirect = new URL(env.SMARTCOACH_GHL_OAUTH_REDIRECT_URI);
    install = new URL(env.SMARTCOACH_GHL_OAUTH_INSTALL_URL);
  } catch (_) {
    throw failure(503, "HighLevel OAuth configuration is incomplete.");
  }
  if (!clientId.startsWith(`${APP_ID}-`) || !secret || !companyId || key.length !== 32 || !scopes.length
    || redirect.protocol !== "https:" || redirect.pathname !== CALLBACK_PATH || redirect.search || redirect.hash || redirect.username || redirect.password
    || install.origin !== "https://marketplace.gohighlevel.com" || !["/oauth/chooselocation", "/v2/oauth/chooselocation"].includes(install.pathname)
    || install.username || install.password || install.hash
    || install.searchParams.get("client_id") !== clientId) {
    throw failure(503, "HighLevel OAuth configuration is incomplete.");
  }
  return { clientId, secret, companyId, key, scopes, redirect, install };
}

function encrypt(value, cfg) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", cfg.key, iv);
  cipher.setAAD(Buffer.from(`${APP_ID}:${cfg.companyId}`));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return { iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
}

function decrypt(value, cfg) {
  try {
    const cipher = crypto.createDecipheriv("aes-256-gcm", cfg.key, Buffer.from(value.iv, "base64"));
    cipher.setAAD(Buffer.from(`${APP_ID}:${cfg.companyId}`));
    cipher.setAuthTag(Buffer.from(value.tag, "base64"));
    return JSON.parse(Buffer.concat([cipher.update(Buffer.from(value.ciphertext, "base64")), cipher.final()]).toString());
  } catch (_) {
    throw failure(503, "HighLevel connection must be authorized again.");
  }
}

function createGhlOAuth(deps = {}) {
  const store = deps.registry || registry;
  const env = deps.env || process.env;
  const fetcher = deps.fetch || ((...args) => fetch(...args));
  const now = deps.now || Date.now;
  // Only the verified server event entry point can create this authorization marker.
  const eventAuthorization = Symbol("verified-buyer-event");
  const newBuyerQualifications = new Map();
  const readinessAdmissionAllowed = buyer => automaticBuyerExecutionAllowed(env, buyer)
    || newBuyerPolicyEnabled(env) && validBuyerIdentity(buyer);
  const automaticExecutionAllowed = buyer => automaticBuyerExecutionAllowed(env, buyer)
    || newBuyerPolicyEnabled(env) && validBuyerIdentity(buyer) && newBuyerQualifications.has(buyer.accountKey);
  const cfg = () => {
    if (!store.registryConfigured()) throw failure(503, "Account registry is required for HighLevel OAuth.");
    return config(env);
  };
  const load = async (namespace) => (await store.loadAccountScopedRecord(STORE_KEY, namespace)).record;
  const save = async (namespace, record) => {
    const result = await store.saveAccountScopedRecord(STORE_KEY, namespace, record);
    if (!result.saved) throw failure(503, "HighLevel connection could not be saved.");
  };
  const locked = async (namespace, work) => {
    const release = await store.acquireAccountScopedLock(STORE_KEY, namespace, { ttlMs: 120000, waitMs: 1000 });
    try { return await work(); } finally { await release(); }
  };

  function admin(req) {
    if (req[eventAuthorization] === true) return;
    const expected = String(env.SMARTCOACH_ADMIN_SETUP_CODE || "").trim();
    const provided = req.headers && req.headers["x-smartcoach-setup-code"];
    if (!expected || !equal(provided, expected)) throw failure(403, "Setup admin authorization is required.");
  }

  function validateGrant(data, settings) {
    const expires = Number(data && data.expires_in);
    const actualScopes = new Set(String(data && data.scope || "").split(/\s+/));
    if (!data || data.userType !== "Company" || data.companyId !== settings.companyId
      || data.locationId || (data.appId && data.appId !== APP_ID)
      || data.token_type !== "Bearer" || !data.access_token || !data.refresh_token
      || !Number.isFinite(expires) || expires <= 120
      || settings.scopes.some((scope) => !actualScopes.has(scope))
      || [...actualScopes].some((scope) => scope && !settings.scopes.includes(scope))
      || data.approveAllLocations === true || data.installToFutureLocations === true) {
      throw failure(403, "HighLevel authorization did not match the configured agency and permissions.");
    }
    return { ...data, expiresAt: now() + expires * 1000 };
  }

  async function exchange(settings, fields) {
    let response, data;
    try {
      response = await fetcher("https://services.leadconnectorhq.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", Version: "v3" },
        body: new URLSearchParams({ client_id: settings.clientId, client_secret: settings.secret, user_type: "Company", ...fields }).toString(),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error("Rejected");
      data = await response.json();
    } catch (_) {
      // Provider responses may contain credentials; never forward their text.
      throw failure(502, "HighLevel token exchange failed. Start a new authorization.");
    }
    return validateGrant(data, settings);
  }

  async function start(req, res) {
    admin(req);
    const settings = cfg();
    if (req.headers.origin !== settings.redirect.origin) throw failure(403, "Start the connection from the SMARTCoach admin page.");
    const state = crypto.randomBytes(32).toString("hex");
    const hash = crypto.createHash("sha256").update(state).digest("hex");
    const expiresAt = now() + STATE_TTL_MS;
    await save(`oauthstate-${hash}`, { expiresAt, used: false, appId: APP_ID, companyId: settings.companyId });
    const url = new URL(settings.install);
    url.searchParams.set("redirect_uri", settings.redirect.href);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", settings.scopes.join(" "));
    url.searchParams.set("state", state);
    res.setHeader("Set-Cookie", `${COOKIE}=${state}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=600`);
    res.status(200).json({ authorizationUrl: url.href, expiresAt });
  }

  function requireStateCookie(req, state) {
    if (typeof state !== "string" || !/^[a-f0-9]{64}$/.test(state)) {
      throw failure(400, "HighLevel authorization state is invalid. Start a new connection.");
    }
    const cookies = String(req.headers.cookie || "").split(";").map((item) => item.trim());
    const cookie = cookies.find((item) => item.startsWith(`${COOKIE}=`));
    if (!cookie) {
      throw failure(400, "HighLevel authorization browser cookie is missing or expired. Start a new connection in the same browser.");
    }
    if (!equal(cookie.slice(COOKIE.length + 1), state)) {
      throw failure(400, "HighLevel authorization browser cookie does not match this connection. Start a new connection.");
    }
  }

  async function checkState(req, res) {
    admin(req);
    const settings = cfg();
    if (req.headers.origin !== settings.redirect.origin) throw failure(403, "Check the connection from the SMARTCoach admin page.");
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    requireStateCookie(req, body.state);
    const pending = await load(`oauthstate-${crypto.createHash("sha256").update(body.state).digest("hex")}`);
    if (!pending || pending.used || pending.expiresAt <= now() || pending.appId !== APP_ID || pending.companyId !== settings.companyId) {
      throw failure(400, "HighLevel authorization expired or was already used.");
    }
    res.status(200).json({ stateCookieVerified: true });
  }

  async function callback(req, res) {
    const settings = cfg();
    const state = req.query && req.query.state;
    const code = req.query && req.query.code;
    requireStateCookie(req, state);
    const namespace = `oauthstate-${crypto.createHash("sha256").update(state).digest("hex")}`;
    await locked(namespace, async () => {
      const pending = await load(namespace);
      if (!pending || pending.used || pending.expiresAt <= now() || pending.appId !== APP_ID || pending.companyId !== settings.companyId) {
        throw failure(400, "HighLevel authorization expired or was already used.");
      }
      await save(namespace, { ...pending, used: true });
      if (req.query.error || typeof code !== "string" || !code || code.length > 2048) throw failure(400, "HighLevel authorization was not completed.");
      await locked("oauthgrant", async () => {
        const grant = await exchange(settings, { grant_type: "authorization_code", code, redirect_uri: settings.redirect.href });
        await save("oauthgrant", { status: "connected", encrypted: encrypt(grant, settings) });
      });
    });
    res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(200).end("HighLevel agency authorization saved. Buyer onboarding is not yet verified. You may close this tab.");
  }

  async function agencyGrant() {
    const settings = cfg();
    return locked("oauthgrant", async () => {
      const saved = await load("oauthgrant");
      if (!saved || saved.status !== "connected") throw failure(503, "HighLevel connection must be authorized again.");
      const grant = decrypt(saved.encrypted, settings);
      if (grant.expiresAt > now() + 120000) return grant;
      // Mark before rotation: an interrupted exchange must not reuse a single-use refresh token.
      await save("oauthgrant", { ...saved, status: "reauthorization_required" });
      const renewed = await exchange(settings, { grant_type: "refresh_token", refresh_token: grant.refresh_token });
      await save("oauthgrant", { status: "connected", encrypted: encrypt(renewed, settings) });
      return renewed;
    });
  }

  async function status(req, res) {
    admin(req);
    const settings = cfg();
    const saved = await load("oauthgrant");
    const grant = saved && saved.status === "connected" ? decrypt(saved.encrypted, settings) : null;
    res.status(200).json({ appId: APP_ID, connected: !!grant, status: saved && saved.status || "not_connected", expiresAt: grant && grant.expiresAt || null, buyerProvisioningVerified: false });
  }

  async function providerJson(path, token, options = {}) {
    let providerStatus, providerValidationFields = [];
    try {
      const response = await fetcher(`https://services.leadconnectorhq.com${path}`, {
        ...options,
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json", Version: "v3", ...options.headers },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        providerStatus = response.status;
        if (providerStatus === 422 && path.startsWith("/payments/")) {
          try {
            const rejected = await response.json();
            const messages = Array.isArray(rejected?.message) ? rejected.message : [rejected?.message];
            const allowed = new Set(["altId", "altType", "locationId", "orderId", "subscriptionId", "Version"]);
            // Return only known field names, never provider validation text or values.
            providerValidationFields = [...new Set(messages.filter(value => typeof value === "string")
              .map(value => value.match(/^(altId|altType|locationId|orderId|subscriptionId|Version)\b/)?.[1])
              .filter(value => allowed.has(value)))];
          } catch (_) {}
        }
        throw new Error("Rejected");
      }
      return await response.json();
    } catch (_) {
      throw Object.assign(failure(502, "HighLevel buyer verification request failed."), { providerStatus, providerValidationFields });
    }
  }

  async function buyerMapping(accountKey, locationId) {
    if (typeof locationId !== "string" || !/^[a-zA-Z0-9]{20}$/.test(locationId)
      || locationId === SELLER_LOCATION_ID || accountKey !== `sc-${locationId.toLowerCase()}`) {
      throw failure(422, "Buyer account key must match a location distinct from the selling location.");
    }
    const saved = await store.loadAccountRecord(accountKey);
    if (!saved || !saved.found || !saved.record || saved.record.locationId !== locationId) {
      throw failure(422, "Saved buyer account does not match the requested location.");
    }
  }

  async function buyerGrant(accountKey, locationId) {
    const settings = cfg();
    const buyerScopes = settings.scopes.filter((scope) => !scope.startsWith("oauth.") && scope !== "saas/company.read");
    const validBuyerScopes = (grant) => {
      const scopes = new Set(String(grant.scope || "").split(/\s+/).filter(Boolean));
      return buyerScopes.every((scope) => scopes.has(scope))
        && [...scopes].every((scope) => settings.scopes.includes(scope) && scope !== "saas/company.read");
    };
    await buyerMapping(accountKey, locationId);
    return locked(`buyergrant-${locationId}`, async () => {
      const agency = await agencyGrant();
      const query = new URLSearchParams({ companyId: settings.companyId, appId: APP_ID,
        versionId: APP_ID, locationId, isInstalled: "true", pageSize: "100" });
      const installed = await providerJson(`/oauth/installed-locations?${query}`, agency.access_token);
      if (installed.installToFutureLocations === true || !Array.isArray(installed.items)) {
        throw failure(403, "Connector installation was not verified for this buyer location.");
      }
      if (!installed.items.some((item) => item._id === locationId && item.isInstalled === true)) {
        throw Object.assign(failure(403, "Connector installation was not verified for this buyer location."), { readinessPending: "installation" });
      }
      const namespace = `buyergrant-${locationId}`;
      const cached = await load(namespace);
      let grant = cached && cached.status === "verified" && cached.buyerAccountKey === accountKey
        ? decrypt(cached.encrypted, settings) : null;
      if (!grant || grant.expiresAt <= now() + 120000 || !validBuyerScopes(grant)) {
        // Reissue through the verified agency grant rather than consume a location refresh token.
        grant = await providerJson("/oauth/location-token", agency.access_token, {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ companyId: settings.companyId, locationId }).toString(),
        });
        if (grant.locationId !== locationId || grant.token_type !== "Bearer" || !grant.access_token
          || (grant.companyId && grant.companyId !== settings.companyId)
          || (grant.appId && grant.appId !== APP_ID) || (grant.versionId && grant.versionId !== APP_ID)
          || !Number.isFinite(Number(grant.expires_in)) || Number(grant.expires_in) <= 120
          || !validBuyerScopes(grant)) {
          throw failure(403, "HighLevel buyer token did not match the configured location and permissions.");
        }
        grant = { ...grant, expiresAt: now() + Number(grant.expires_in) * 1000 };
      }
      const details = await providerJson(`/locations/${encodeURIComponent(locationId)}`, grant.access_token);
      if (!details.location || details.location.id !== locationId || details.location.companyId !== settings.companyId) {
        throw failure(403, "HighLevel location identity did not match the buyer agency.");
      }
      await buyerMapping(accountKey, locationId);
      await save(namespace, { status: "verified", buyerAccountKey: accountKey, locationId, verifiedAt: now(), encrypted: encrypt(grant, settings) });
      return grant;
    });
  }

  async function readSaasPurchase(locationId, agency) {
    const settings = cfg();
    let details;
    try {
      details = await providerJson(`/saas/get-saas-subscription/${encodeURIComponent(locationId)}?${new URLSearchParams({ companyId: settings.companyId })}`, agency.access_token);
    } catch (error) {
      const status = Number(error.providerStatus);
      if (Number.isInteger(status) && status >= 400 && status <= 599) {
        throw failure(502, `HighLevel subscription read was rejected (HTTP ${status}). Review agency SaaS API access. No buyer setup was changed.`);
      }
      throw error;
    }
    if (details && Object.prototype.hasOwnProperty.call(details, "data")) {
      if (["locationId", "companyId", "isSaaSV2"].some((field) => details[field] !== undefined)) {
        throw failure(403, "Subscription response has ambiguous identity envelopes. No buyer setup was changed.");
      }
      details = details.data;
    }
    if (!details || Array.isArray(details) || details.locationId !== locationId || details.companyId !== settings.companyId || details.isSaaSV2 !== true) {
      const match = (field, expected) => !details || details[field] === undefined || details[field] === null
        ? "missing" : details[field] === expected ? "matched" : "mismatched";
      const wrapped = !!details && !!details.data && typeof details.data === "object";
      throw failure(403, `Subscription identity not verified (location: ${match("locationId", locationId)}; agency: ${match("companyId", settings.companyId)}; SaaS V2: ${match("isSaaSV2", true)}; data wrapper: ${wrapped ? "present" : "absent"}). No buyer setup was changed.`);
    }
    const status = String(details.subscriptionStatus || "").trim().toLowerCase();
    const ids = ["subscriptionId", "customerId", "productId", "priceId", "saasPlanId"];
    if (!["active", "trialing", "past_due", "paused", "canceled", "incomplete", "incomplete_expired", "unpaid"].includes(status)
      || ids.some((field) => typeof details[field] !== "string" || !details[field].trim() || details[field].length > 200)) {
      throw failure(422, "Subscription details are incomplete. No buyer setup was changed.");
    }
    let catalog = await providerJson(`/saas/saas-plan/${encodeURIComponent(details.saasPlanId)}?${new URLSearchParams({ companyId: settings.companyId })}`, agency.access_token);
    if (catalog && Object.prototype.hasOwnProperty.call(catalog, "data")) {
      if (["planId", "companyId", "productId"].some((field) => catalog[field] !== undefined)) {
        throw failure(403, "SaaS plan response has ambiguous identity envelopes. No buyer setup was changed.");
      }
      catalog = catalog.data;
    }
    const purchase = verifySaasCatalogPurchase(details, catalog, settings.companyId, SELLER_LOCATION_ID);
    return { details, status, ids, purchase };
  }

  async function readBuyerPurchase(accountKey, locationId) {
    await buyerMapping(accountKey, locationId);
    const verified = await readSaasPurchase(locationId, await agencyGrant());
    await buyerMapping(accountKey, locationId);
    const account = (await store.loadAccountRecord(accountKey)).record;
    const { purchase } = verified;
    const savedConfigurationMatches = purchase.purchaseVerified && account.productPlan === purchase.purchasedProductPlan
      && account.subscription?.billingCadence === purchase.purchasedBillingCadence
      && Number(account.subscription?.amount) === Number(purchase.purchasedAmount);
    return { account, ...verified, savedConfigurationMatches };
  }

  const checkoutKey = email => `checkout-${crypto.createHash("sha256").update(email).digest("hex").slice(0, 32)}`;
  const snapshotHash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const normalizedEmail = value => String(value || "").trim().toLowerCase();

  async function reviewLegacyOrder(body, details, purchase, status, ownerEmail) {
    const token = String(env.SMARTCOACH_WELCOME_SELLER_TOKEN || "").trim();
    if (!token) throw failure(503, "Seller credential is required for read-only order verification.");
    let order, subscription;
    let stage = "seller_identity";
    try {
      const seller = await providerJson(`/locations/${SELLER_LOCATION_ID}`, token);
      if (seller.location?.id !== SELLER_LOCATION_ID || seller.location?.companyId !== cfg().companyId) {
        throw failure(403, "Seller identity did not match.");
      }
      const query = new URLSearchParams({ altId: SELLER_LOCATION_ID, altType: "location" });
      stage = "order";
      order = await providerJson(`/payments/orders/${body.expectedOrderId}?${new URLSearchParams({ altId: SELLER_LOCATION_ID, altType: "location", locationId: SELLER_LOCATION_ID })}`, token,
        { headers: { Version: "2021-07-28" } });
      stage = "subscription";
      subscription = await providerJson(`/payments/subscriptions/${details.subscriptionId}?${query}`, token,
        { headers: { Version: "2021-07-28" } });
    } catch (error) {
      const permission = [401, 403].includes(error.providerStatus) || error.statusCode === 403;
      const http = Number.isInteger(error.providerStatus) && error.providerStatus >= 100 && error.providerStatus <= 599
        ? String(error.providerStatus) : "unavailable";
      const validation = error.providerValidationFields?.length ? ` Validation fields: ${error.providerValidationFields.join(", ")}.` : "";
      throw failure(permission ? 403 : 502, permission
        ? `Seller order/subscription read access was denied (${stage}, HTTP ${http}). No recovery performed.`
        : `Seller order/subscription could not be read (${stage}, HTTP ${http}).${validation} No recovery performed.`);
    }
    const object = value => !!value && typeof value === "object" && !Array.isArray(value);
    const item = Array.isArray(order?.items) && order.items.length === 1 ? order.items[0] : null;
    const money = value => (typeof value === "number" || typeof value === "string" && /^\d+(?:\.\d{1,2})?$/.test(value))
      && Number.isFinite(Number(value)) && Number(value) === Number(purchase.purchasedAmount);
    const source = value => object(value) && value.type === "payment_link" && value.subType === "payments_dashboard"
      && value.id === body.expectedSaleLinkId;
    const usd = value => typeof value === "string" && value.toUpperCase() === "USD";
    const checks = {
      orderIdentity: object(order) && order._id === body.expectedOrderId && order.altId === SELLER_LOCATION_ID && order.altType === "location",
      subscriptionIdentity: object(subscription) && subscription._id === details.subscriptionId
        && subscription.altId === SELLER_LOCATION_ID && subscription.altType === "location",
      orderLink: subscription?.entityType === "order" && subscription.entityId === body.expectedOrderId,
      customer: typeof order?.contactId === "string" && !!order.contactId && order.contactId === subscription?.contactId
        && object(order.contactSnapshot) && object(subscription.contactSnapshot)
        && normalizedEmail(order.contactSnapshot.email) === ownerEmail && normalizedEmail(subscription.contactSnapshot.email) === ownerEmail,
      livePurchase: order?.liveMode === true && subscription?.liveMode === true
        && order.markAsTest !== true && subscription.markAsTest !== true,
      status: order?.status === "completed" && subscription?.status === status,
      source: source(order?.source) && source(subscription?.entitySource),
      currency: usd(order?.currency) && usd(subscription?.currency),
      product: object(item) && object(item.product) && object(item.price)
        && item.product._id === details.productId && item.price._id === details.priceId
        && item.product.name === purchase.purchasedProductName && item.qty === 1,
      recurringAmount: money(subscription?.amount) && money(item?.price?.amount),
      cadence: item?.price?.recurring?.interval === (purchase.purchasedBillingCadence === "annual" ? "year" : "month")
        && item.price.recurring.intervalCount === 1,
      providerSubscription: typeof subscription?.subscriptionId === "string" && /^sub_[a-zA-Z0-9]+$/.test(subscription.subscriptionId),
    };
    const failed = Object.keys(checks).filter(key => !checks[key]);
    if (failed.length) throw failure(409, `Seller order verification blocked: ${failed.join(", ")}. No recovery performed.`);
    return { originalOrderVerified: true, orderId: order._id, subscriptionId: subscription._id,
      saleLinkId: body.expectedSaleLinkId, trialChargeVerified: false };
  }

  async function reviewExistingBuyerSetup(locationId, scan = null) {
    let inventory;
    try { inventory = await store.inspectAccountLocationReferences(locationId, scan); }
    catch (_) { throw failure(503, "Saved account inventory could not be reviewed. Existing access must be preserved."); }
    if (inventory.complete !== true || !Array.isArray(inventory.references)) {
      if (inventory.reason === "scan_page_limit_reached" && inventory.continuation) {
        return { existingSetupReviewVerified: false, continuation: inventory.continuation };
      }
      const reasons = new Set(["registry_unconfigured", "invalid_scan_response", "account_limit_reached",
        "invalid_account_batch", "unreadable_account_record", "scan_page_limit_reached"]);
      const reason = reasons.has(inventory.reason) ? inventory.reason : "inventory_incomplete";
      throw failure(503, `Saved account inventory could not be fully reviewed (${reason}). Existing access must be preserved.`);
    }
    let mappings = {};
    try {
      if (env.SMARTCOACH_ACCOUNTS) mappings = JSON.parse(env.SMARTCOACH_ACCOUNTS);
      if (!mappings || typeof mappings !== "object" || Array.isArray(mappings)
        || Object.values(mappings).some(record => !record || typeof record !== "object" || Array.isArray(record))) throw new Error("Invalid mappings");
    } catch (_) { throw failure(503, "Environment account mappings could not be reviewed. Existing access must be preserved."); }
    const environmentReferences = Object.entries(mappings).filter(([, record]) =>
      record.locationId === locationId || record.ghlLocationId === locationId).map(([key]) => `account:${key}`);
    for (const [name, value] of Object.entries(env)) {
      if (value === locationId && (name === "GHL_LOCATION_ID" || name.startsWith("GHL_LOCATION_ID_"))) environmentReferences.push(name);
    }
    let access, fulfillment;
    try {
      const readHistory = async namespace => {
        const saved = await store.loadAccountScopedRecord(STORE_KEY, namespace);
        if (!saved || saved.error || saved.configured === false || saved.found && (!saved.record
          || typeof saved.record !== "object" || Array.isArray(saved.record))) throw new Error("Unreadable history");
        return saved.record;
      };
      access = await readHistory(`buyeraccess-${locationId}`);
      fulfillment = await readHistory(`buyerfulfillment-${locationId}`);
    } catch (_) { throw failure(503, "Buyer access history could not be reviewed. Existing access must be preserved."); }
    return { existingSetupReviewVerified: true, savedAccountReferences: inventory.references,
      environmentAccountReferences: environmentReferences, buyerAccessHistoryPresent: !!access,
      buyerFulfillmentHistoryPresent: !!fulfillment,
      existingSetupOrHistoryPresent: inventory.references.length > 0 || environmentReferences.length > 0 || !!access || !!fulfillment };
  }

  async function recoverLegacyPurchase(req, res) {
    admin(req);
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    // This one-account recovery approval is not a general fulfillment switch.
    const approved = APPROVED_LEGACY_BUYER;
    if (req.headers.origin !== cfg().redirect.origin || body.confirmRecovery !== true
      || Object.entries(approved).some(([key, value]) => body[key] !== value)) {
      throw failure(403, "Confirm the exact approved legacy buyer and purchase before recovery.");
    }
    return locked(`buyergrant-${body.locationId}`, () => locked(`legacyrecovery-${body.locationId}`, () => reviewLegacyPurchase({ ...req, headers: req.headers,
      body: { ...body, confirmRecovery: false, preview: true, verifyExistingSetup: true, verifyBuyerCrm: true } }, res,
    async ({ grant, purchase, status, details, snapshot, settings }) => {
      const fresh = await readSaasPurchase(body.locationId, await agencyGrant());
      if (fresh.status !== status || JSON.stringify(fresh.purchase) !== JSON.stringify(purchase)
        || ["subscriptionId", "customerId", "productId", "priceId", "saasPlanId"].some(key => fresh.details[key] !== details[key])) {
        throw failure(409, "Buyer purchase changed before recovery. Start a new review.");
      }
      await reviewLegacyOrder(body, fresh.details, fresh.purchase, fresh.status, body.ownerEmail);
      const existingGrant = await store.loadAccountScopedRecord(STORE_KEY, `buyergrant-${body.locationId}`);
      if (existingGrant.error || existingGrant.found || existingGrant.record) throw failure(409, "Buyer grant history changed. No recovery performed.");
      const record = { locationId: body.locationId, schoolName: body.schoolName, accountOwnerEmail: body.ownerEmail,
        productPlan: purchase.purchasedProductPlan, coachSeats: 1, requireCoachAccess: true,
        coachAccessCodes: [], coachStaff: [], token: "", accessStatus: "manual_hold",
        accessReason: "Legacy account recovered; coach access and consumer rollout require separate approval.",
        subscription: { status, billingCadence: purchase.purchasedBillingCadence, amount: purchase.purchasedAmount,
          currency: purchase.purchasedCurrency, subscriptionId: details.subscriptionId },
        legacyRecovery: { source: "verified-legacy-purchase", orderId: body.expectedOrderId,
          saleLinkId: body.expectedSaleLinkId, subscriptionId: body.expectedSubscriptionId,
          coachName: body.coachName, verifiedAt: new Date(now()).toISOString(), snapshot } };
      if (!(await store.createAccountRecord(body.accountKey, record)).saved) throw failure(409, "Buyer account creation was not confirmed. Review before retrying.");
      await save(`buyergrant-${body.locationId}`, { status: "verified", buyerAccountKey: body.accountKey,
        locationId: body.locationId, verifiedAt: now(), encrypted: encrypt({ ...grant,
          expiresAt: now() + Number(grant.expires_in) * 1000 }, settings) });
      const readback = await store.loadAccountRecord(body.accountKey);
      if (readback.error || !readback.found || !readback.record
        || Object.keys(record).some(key => JSON.stringify(readback.record[key]) !== JSON.stringify(record[key]))) {
        throw failure(503, "Recovered account readback failed. Review before retrying.");
      }
      const savedGrant = await load(`buyergrant-${body.locationId}`);
      if (!savedGrant || savedGrant.buyerAccountKey !== body.accountKey || savedGrant.locationId !== body.locationId
        || decrypt(savedGrant.encrypted, settings).access_token !== grant.access_token) {
        throw failure(503, "Recovered buyer credential readback failed. Review before retrying.");
      }
      if (deps.onAccountUpdated) deps.onAccountUpdated(body.accountKey);
      return res.status(200).json({ accountRecovered: true, accountKey: body.accountKey, locationId: body.locationId,
        productPlan: record.productPlan, amount: record.subscription.amount, billingCadence: record.subscription.billingCadence,
        subscriptionStatus: status, buyerOAuthSaved: true, snapshotVerified: true, accessStatus: "manual_hold",
        coachAccessCreated: false, emailSent: false, billingUnchanged: true, pendingCheckoutUnchanged: true,
        automaticFulfillmentReady: false, buyerProvisioningVerified: false });
    })));
  }

  async function reviewLegacyPurchase(req, res, onVerified) {
    admin(req);
    const settings = cfg();
    if (req.headers.origin !== settings.redirect.origin) throw failure(403, "Review legacy purchases from the SMARTCoach admin page.");
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { accountKey, locationId, expectedSubscriptionId, expectedProductName, expectedBillingCadence, expectedAmount } = body;
    if (body.expectedOrderId !== undefined && (!/^[a-fA-F0-9]{24}$/.test(body.expectedOrderId)
      || typeof body.expectedOrderId !== "string" || typeof body.expectedSaleLinkId !== "string"
      || !/^[a-fA-F0-9]{24}$/.test(body.expectedSaleLinkId)
      || typeof expectedSubscriptionId !== "string" || !/^[a-fA-F0-9]{24}$/.test(expectedSubscriptionId))) {
      throw failure(422, "Exact HighLevel order, subscription and sale-link IDs are required for seller order review.");
    }
    if (body.expectedSaleLinkId !== undefined && body.expectedOrderId === undefined) throw failure(422, "Order ID is required for sale-link review.");
    if (body.preview !== true || body.confirmRecovery === true || body.dryRun === false) {
      throw failure(409, "Legacy purchase review is read-only. Recovery execution is not available.");
    }
    if (typeof locationId !== "string" || !/^[a-zA-Z0-9]{20}$/.test(locationId)
      || locationId === SELLER_LOCATION_ID || accountKey !== `sc-${locationId.toLowerCase()}`) {
      throw failure(422, "Buyer account key must match a location distinct from the selling location.");
    }
    const ownerEmail = normalizedEmail(body.ownerEmail);
    const schoolName = String(body.schoolName || "").trim();
    const coachName = String(body.coachName || "").trim();
    if (ownerEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)
      || !schoolName || schoolName.length > 120 || !coachName || coachName.length > 120
      || typeof expectedSubscriptionId !== "string" || !/^(?:[a-fA-F0-9]{24}|sub_[a-zA-Z0-9]{1,196})$/.test(expectedSubscriptionId)
      || typeof expectedProductName !== "string" || !/^SMARTCoach Pro (25|100|200) - (Monthly|Annual)$/.test(expectedProductName)
      || !["monthly", "annual"].includes(expectedBillingCadence)
      || typeof expectedAmount !== "string" || !/^\d{1,5}\.\d{2}$/.test(expectedAmount)) {
      throw failure(422, "Confirmed coach/program/email and exact subscription, product, cadence and amount are required.");
    }
    const existing = await store.loadAccountRecord(accountKey);
    if (existing.error || existing.found || existing.record) throw failure(409, "A saved or unreadable buyer record exists. Review existing setup; no recovery performed.");
    const agency = await agencyGrant();
    const scopes = new Set(String(agency.scope || "").split(/\s+/));
    if (!["locations.readonly", "saas/company.read"].every(scope => scopes.has(scope))) {
      throw failure(403, "Agency location and SaaS read permissions are required for legacy purchase review.");
    }
    const location = (await providerJson(`/locations/${encodeURIComponent(locationId)}`, agency.access_token)).location;
    if (!location || location.id !== locationId || location.companyId !== settings.companyId || normalizedEmail(location.email) !== ownerEmail) {
      throw failure(403, "Buyer location, agency or confirmed email did not match. No recovery performed.");
    }
    const { details, status, purchase } = await readSaasPurchase(locationId, agency);
    const productName = `${purchase.purchasedProductName} - ${purchase.purchasedBillingCadence === "annual" ? "Annual" : "Monthly"}`;
    const checks = { purchaseCatalog: purchase.purchaseVerified === true, subscriptionStatus: ["active", "trialing"].includes(status),
      subscriptionId: details.subscriptionId === expectedSubscriptionId, productName: productName === expectedProductName,
      billingCadence: purchase.purchasedBillingCadence === expectedBillingCadence, amount: purchase.purchasedAmount === expectedAmount };
    const failed = Object.keys(checks).filter(key => !checks[key]);
    if (failed.length) throw failure(409, `Legacy purchase review blocked: ${failed.join(", ")}.${purchase.purchaseVerified ? "" : ` ${purchase.reason}`} No recovery performed.`);
    const after = await store.loadAccountRecord(accountKey);
    if (after.error || after.found || after.record) throw failure(409, "Buyer setup changed during review. Review existing setup; no recovery performed.");
    const identity = snapshotHash({ accountKey, locationId, ownerEmail, schoolName, coachName,
      expectedSubscriptionId, expectedProductName, expectedBillingCadence, expectedAmount,
      expectedOrderId: body.expectedOrderId, expectedSaleLinkId: body.expectedSaleLinkId,
      verifyBuyerCrm: body.verifyBuyerCrm === true, companyId: settings.companyId });
    let traversal = { startedAt: now(), batches: 0, scan: null };
    if (body.inventoryContinuation !== undefined) {
      try {
        if (body.verifyExistingSetup !== true || typeof body.inventoryContinuation !== "string"
          || body.inventoryContinuation.length > 131072) throw new Error("Invalid continuation");
        traversal = decrypt(JSON.parse(Buffer.from(body.inventoryContinuation, "base64url").toString()), settings);
        if (traversal.purpose !== "legacy_inventory" || traversal.identity !== identity
          || !Number.isFinite(traversal.startedAt) || traversal.startedAt > now()
          || now() - traversal.startedAt >= STATE_TTL_MS || !Number.isInteger(traversal.batches)
          || traversal.batches < 1 || traversal.batches >= 100 || !traversal.scan
          || traversal.scan.cursor === "0") throw new Error("Invalid continuation");
      } catch (_) { throw failure(409, "Inventory continuation was not accepted. Start a new read-only review."); }
    }
    const existingSetup = body.verifyExistingSetup === true ? await reviewExistingBuyerSetup(locationId, traversal.scan) : null;
    if (existingSetup?.continuation) {
      if (traversal.batches >= 99) throw failure(503, "Inventory review reached its total batch limit. Existing access must be preserved.");
      const token = encrypt({ purpose: "legacy_inventory", identity, startedAt: traversal.startedAt,
        batches: traversal.batches + 1, scan: existingSetup.continuation }, settings);
      return res.status(202).json({ preview: true, inventoryComplete: false,
        inventoryContinuation: Buffer.from(JSON.stringify(token)).toString("base64url"),
        accountUnchanged: true, pendingCheckoutUnchanged: true, emailSent: false,
        recoveryReady: false, automaticFulfillmentReady: false });
    }
    const finalAccount = await store.loadAccountRecord(accountKey);
    if (finalAccount.error || finalAccount.found || finalAccount.record) throw failure(409, "Buyer setup changed during review. Review existing setup; no recovery performed.");
    const orderReview = body.expectedOrderId === undefined ? null : await reviewLegacyOrder(body, details, purchase, status, ownerEmail);
    let connectorInstallation = null;
    if (orderReview) {
      if (!scopes.has("oauth.readonly")) throw failure(403, "Agency connector installation read permission is required. No recovery performed.");
      const query = new URLSearchParams({ companyId: settings.companyId, appId: APP_ID,
        versionId: APP_ID, locationId, isInstalled: "true", pageSize: "100" });
      const installed = await providerJson(`/oauth/installed-locations?${query}`, agency.access_token);
      if (installed.installToFutureLocations === true || !Array.isArray(installed.items) || installed.items.length >= 100) {
        throw failure(409, "Buyer connector installation inventory is not safely bounded. No recovery performed.");
      }
      const matches = installed.items.filter(item => item?._id === locationId && item.isInstalled === true);
      if (matches.length > 1) throw failure(409, "Buyer connector installation is ambiguous. No recovery performed.");
      connectorInstallation = { reviewed: true, installed: matches.length === 1, appId: APP_ID, locationId,
        buyerTokenRequested: false, snapshotVerified: false };
    }
    const reviewedAccount = await store.loadAccountRecord(accountKey);
    if (reviewedAccount.error || reviewedAccount.found || reviewedAccount.record) throw failure(409, "Buyer setup changed during review. No recovery performed.");
    let buyerCrmReview = null;
    if (body.verifyBuyerCrm === true) {
      if (!orderReview || connectorInstallation?.installed !== true
        || existingSetup?.existingSetupReviewVerified !== true || existingSetup.existingSetupOrHistoryPresent) {
        throw failure(409, "Buyer CRM preview requires verified original order, installed connector and no existing setup/history. No recovery performed.");
      }
      if (!scopes.has("oauth.write")) throw failure(403, "Agency location-token permission is required for buyer CRM preview.");
      const grant = await providerJson("/oauth/location-token", agency.access_token, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ companyId: settings.companyId, locationId }).toString(),
      });
      const granted = new Set(String(grant.scope || "").split(/\s+/).filter(Boolean));
      const required = settings.scopes.filter(scope => !scope.startsWith("oauth.") && scope !== "saas/company.read");
      if (grant.locationId !== locationId || grant.token_type !== "Bearer" || !grant.access_token
        || (grant.companyId && grant.companyId !== settings.companyId)
        || (grant.appId && grant.appId !== APP_ID) || (grant.versionId && grant.versionId !== APP_ID)
        || (grant.userType && grant.userType !== "Location")
        || !Number.isFinite(Number(grant.expires_in)) || Number(grant.expires_in) <= 120
        || !required.every(scope => granted.has(scope))
        || [...granted].some(scope => !settings.scopes.includes(scope) || scope === "saas/company.read")) {
        throw failure(403, "Legacy buyer preview token did not match location and configured permissions. No recovery performed.");
      }
      const buyerLocation = (await providerJson(`/locations/${encodeURIComponent(locationId)}`, grant.access_token)).location;
      if (buyerLocation?.id !== locationId || buyerLocation.companyId !== settings.companyId
        || normalizedEmail(buyerLocation.email) !== ownerEmail) throw failure(403, "Legacy buyer CRM identity did not match. No recovery performed.");
      const values = await providerJson(`/locations/${encodeURIComponent(locationId)}/customValues`, grant.access_token);
      if (!Array.isArray(values.customValues)) throw failure(409, "Legacy buyer custom values could not be verified.");
      if (onVerified && values.customValues.some(value => (value.name === "account_key" || value.name === "SMARTCoach Account Key")
        && value.value && value.value !== accountKey)) throw failure(409, "Buyer custom-value account mapping conflicts. No recovery performed.");
      const contacts = await providerJson(`/contacts/?${new URLSearchParams({ locationId, limit: "1" })}`, grant.access_token,
        { headers: { Version: "2023-02-21" } });
      if (!Array.isArray(contacts.contacts) || contacts.contacts.some(contact => contact.locationId !== locationId)) {
        throw failure(403, "Legacy buyer contacts did not match the buyer location.");
      }
      const snapshot = await verifyBuyerSnapshot({ locationId }, grant);
      const unchanged = await store.loadAccountRecord(accountKey);
      if (unchanged.error || unchanged.found || unchanged.record) throw failure(409, "Buyer setup changed during CRM preview. No recovery performed.");
      // The preview credential stays in memory and is never saved as a consumer grant.
      buyerCrmReview = { accountKey, locationId, crmReadsVerified: true, snapshot,
        buyerTokenPersisted: false, consumerAccessEnabled: false };
      if (onVerified) return onVerified({ grant, purchase, status, details, snapshot, settings });
    }
    // This evidence cannot substitute for a matched checkout or authorize fulfillment.
    res.status(200).json({ preview: true, providerPurchaseVerified: true, locationIdentityVerified: true,
      buyerAccountKey: accountKey, locationId, ownerEmail, proposedSchoolName: schoolName, proposedCoachName: coachName,
      productName, productPlan: purchase.purchasedProductPlan, billingCadence: purchase.purchasedBillingCadence,
      amount: purchase.purchasedAmount, currency: purchase.purchasedCurrency, providerSubscriptionStatus: status,
      subscriptionId: details.subscriptionId, planTrialDays: purchase.planTrialDays,
      existingSetup, connectorInstallation, buyerCrmReview,
      orderReview, originalOrderVerified: orderReview?.originalOrderVerified === true, alternateAccountHistoryVerified: false, buyerOAuthVerified: false,
      recoveryReady: false, accountUnchanged: true, pendingCheckoutUnchanged: true, emailSent: false,
      automaticFulfillmentReady: false,
      blockers: [existingSetup ? existingSetup.existingSetupOrHistoryPresent
        ? "Existing buyer setup or access history was found. Preserve it and review before recovery."
        : orderReview ? "No matching existing setup or connector access history found in the completed read-only review. Original seller order linkage verified."
          : "No matching existing setup or connector access history found in the completed read-only review. Original seller order linkage still needs verification."
        : orderReview ? "Original seller order linkage verified. Alternate-key access history still needs verification."
          : "Original seller order linkage and alternate-key access history need verification.",
        buyerCrmReview ? "Buyer CRM reads and snapshot verified in a temporary preview. A separately approved recovery path is still required."
          : connectorInstallation ? connectorInstallation.installed
          ? "Buyer connector installation verified. Buyer CRM reads, snapshot and a separately approved recovery path are not yet verified."
          : "Buyer connector is not installed for this location. Buyer CRM reads, snapshot and a separately approved recovery path are not yet verified."
          : "Buyer connector, snapshot and a separately approved recovery path are not yet verified."] });
  }

  async function activateLegacyBuyer(req, res) {
    admin(req);
    const settings = cfg();
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const approved = APPROVED_LEGACY_BUYER;
    if (req.headers.origin !== settings.redirect.origin || body.accountKey !== approved.accountKey
      || body.locationId !== approved.locationId) throw failure(403, "Only the approved recovered buyer may be activated.");
    return locked(`legacyactivation-${approved.locationId}`, async () => {
      const accountResult = await store.loadAccountRecord(approved.accountKey);
      const account = accountResult.record;
      const recovery = account?.legacyRecovery;
      if (accountResult.error || !accountResult.found || !account || account.locationId !== approved.locationId
        || account.schoolName !== approved.schoolName || account.accountOwnerEmail !== approved.ownerEmail
        || account.productPlan !== "pro25" || recovery?.source !== "verified-legacy-purchase"
        || recovery.orderId !== approved.expectedOrderId || recovery.saleLinkId !== approved.expectedSaleLinkId
        || recovery.subscriptionId !== approved.expectedSubscriptionId || recovery.coachName !== approved.coachName) {
        throw failure(409, "Saved legacy recovery identity does not match the approved buyer.");
      }
      const previous = await load(`legacyactivation-${approved.locationId}`);
      if (previous) throw failure(409, "Legacy activation was already attempted. Review saved access and delivery before retrying.");
      const accessHistory = await store.loadAccountScopedRecord(STORE_KEY, `buyeraccess-${approved.locationId}`);
      if (accessHistory.error || accessHistory.record || accessHistory.found || account.coachStaff?.length
        || account.coachAccessCodes?.length || account.accessCode || account.token
        || account.accessStatus !== "manual_hold" || account.requireCoachAccess !== true) {
        throw failure(409, "Existing credentials or changed account access must be preserved. No activation performed.");
      }
      const verified = await readBuyerPurchase(approved.accountKey, approved.locationId);
      if (!verified.purchase.purchaseVerified || !verified.savedConfigurationMatches
        || !["active", "trialing"].includes(verified.status) || verified.status !== account.subscription?.status
        || verified.details.subscriptionId !== approved.expectedSubscriptionId) {
        throw failure(409, "Legacy buyer purchase or saved subscription changed. No activation performed.");
      }
      await reviewLegacyOrder(approved, verified.details, verified.purchase, verified.status, approved.ownerEmail);
      const grant = await readConsumerGrant(approved.accountKey, approved.locationId);
      const location = (await providerJson(`/locations/${approved.locationId}`, grant.access_token)).location;
      if (location?.id !== approved.locationId || location.companyId !== settings.companyId
        || normalizedEmail(location.email) !== approved.ownerEmail) throw failure(403, "Buyer location identity changed.");
      await verifyBuyerSnapshot({ locationId: approved.locationId }, grant);
      const customValues = await providerJson(`/locations/${approved.locationId}/customValues`, grant.access_token);
      if (!Array.isArray(customValues.customValues)) throw failure(409, "Buyer custom values could not be reviewed.");
      const keys = customValues.customValues.filter(value => String(value?.name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_") === "account_key");
      if (keys.length > 1 || keys.some(value => !value.id || value.locationId && value.locationId !== approved.locationId
        || value.value && value.value !== approved.accountKey)) throw failure(409, "Buyer custom-value mapping conflicts. No activation performed.");
      const sellerToken = String(env.SMARTCOACH_WELCOME_SELLER_TOKEN || "").trim();
      const emailFrom = String(env.SMARTCOACH_WELCOME_FROM_EMAIL || "").trim().toLowerCase();
      if (!sellerToken || emailFrom !== "info@smartcoach-pro.com") throw failure(403, "Authenticated seller sender is required.");
      const seller = (await providerJson(`/locations/${SELLER_LOCATION_ID}`, sellerToken)).location;
      if (seller?.id !== SELLER_LOCATION_ID || seller.companyId !== settings.companyId) throw failure(403, "Seller sender identity did not match.");
      const rollout = String(env.SMARTCOACH_GHL_OAUTH_WRITE_ACCOUNTS || "").split(/[,\s]+/).includes(approved.accountKey);
      const fingerprint = snapshotHash({ account, emailFrom, purchase: verified.purchase, status: verified.status, rollout });
      if (body.preview === true) return res.status(200).json({ preview: true, fingerprint, accountKey: approved.accountKey,
        locationId: approved.locationId, coachName: approved.coachName, ownerEmail: approved.ownerEmail,
        productPlan: "pro25", amount: "19.00", billingCadence: "monthly", subscriptionStatus: verified.status,
        emailFrom, sellerSenderVerified: true, buyerOAuthVerified: true, snapshotVerified: true,
        coreOAuthWriteRolloutEnabled: rollout, accountUnchanged: true, emailSent: false, automaticFulfillmentReady: false });
      if (!rollout || body.confirmActivation !== true || body.expectedFingerprint !== fingerprint) {
        throw failure(409, "Confirm the current legacy activation preview and enable only this buyer's OAuth rollout.");
      }
      const fresh = await store.loadAccountRecord(approved.accountKey);
      if (fresh.error || JSON.stringify(fresh.record) !== JSON.stringify(account)) throw failure(409, "Buyer setup changed before activation.");
      // Persist an attempt before any mutation; partial setup or uncertain sending cannot replay.
      await save(`legacyactivation-${approved.locationId}`, { status: "attempted", buyerAccountKey: approved.accountKey,
        locationId: approved.locationId, fingerprint, attemptedAt: now() });
      await handlerResult(verifyBuyerWrite, req, { accountKey: approved.accountKey, locationId: approved.locationId });
      const prepared = { ...account, accessStatus: "active", accessReason: "Approved legacy buyer activation",
        accountOwnerName: approved.coachName, coachAccessCodes: [crypto.randomBytes(32).toString("hex")] };
      if (!(await store.saveAccountRecord(approved.accountKey, prepared)).saved) throw failure(503, "Buyer activation save failed. Review before retrying.");
      const saved = (await store.loadAccountRecord(approved.accountKey)).record;
      if (!saved || saved.accountKey !== approved.accountKey
        || Object.keys(prepared).filter(key => key !== "updatedAt").some(key => JSON.stringify(saved[key]) !== JSON.stringify(prepared[key]))) {
        throw failure(503, "Buyer activation readback failed. Review before retrying.");
      }
      if (deps.onAccountUpdated) deps.onAccountUpdated(approved.accountKey);
      const access = await handlerResult(createBuyerHeadCoach, req, { accountKey: approved.accountKey,
        locationId: approved.locationId, coachName: approved.coachName, confirmCreate: true,
        expectedOwnerEmail: approved.ownerEmail, expectedProductPlan: "pro25" });
      if (access.headCoachCreated !== true || access.accessEmailAccepted !== true) throw failure(503, "Buyer access acceptance is uncertain. Review before retrying.");
      await save(`legacyactivation-${approved.locationId}`, { status: "accepted", buyerAccountKey: approved.accountKey,
        locationId: approved.locationId, fingerprint, acceptedAt: now() });
      if (deps.onAccountUpdated) deps.onAccountUpdated(approved.accountKey);
      return res.status(200).json({ legacyActivated: true, ...access, accountKey: approved.accountKey,
        locationId: approved.locationId, accessStatus: "active", coreOAuthWriteRolloutEnabled: true,
        accountKeyWriteVerified: true, emailFrom, billingUnchanged: true, automaticFulfillmentReady: false });
    });
  }

  function checkoutChecks(pending, email, locationId, purchase) {
    const name = `${purchase.purchasedProductName} - ${purchase.purchasedBillingCadence === "annual" ? "Annual" : "Monthly"}`;
    return { checkoutRecord: !!pending, checkoutPurchase: !!purchase.purchaseVerified,
      checkoutSource: pending?.source === "smartcoach-precheckout", checkoutLocation: pending?.lastMatchedLocationId === locationId,
      checkoutEmail: pending?.coachEmail === email, checkoutPlan: pending?.plan === purchase.purchasedProductPlan,
      checkoutCadence: pending?.cadence === purchase.purchasedBillingCadence, checkoutProductName: pending?.productName === name,
      checkoutSchool: !!pending?.schoolName, checkoutCoach: !!pending?.coachName };
  }

  function checkoutMatches(pending, email, locationId, purchase) {
    return Object.values(checkoutChecks(pending, email, locationId, purchase)).every(Boolean);
  }

  async function checkoutIdentityEvidence(accountKey, locationId, originalEmail) {
    const verified = await readBuyerPurchase(accountKey, locationId);
    const { account, purchase, status, savedConfigurationMatches, details } = verified;
    const ownerEmail = normalizedEmail(account.accountOwnerEmail);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(originalEmail) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail) || ownerEmail === originalEmail) {
      throw failure(422, "Distinct valid original checkout and saved owner emails are required.");
    }
    const pending = (await store.loadAccountScopedRecord(checkoutKey(originalEmail), "pendingcheckout")).record;
    const event = pending?.lastLocationCreateEvent;
    const checks = { savedPricing: savedConfigurationMatches, ...checkoutChecks(pending, originalEmail, locationId, purchase),
      locationEvent: event?.id === locationId, agencyEvent: event?.companyId === cfg().companyId,
      originalEventEmail: normalizedEmail(event?.email) === originalEmail,
      subscriptionStatus: ["active", "trialing"].includes(status) && account.subscription?.status === status,
      accountAccess: accountAccessAllowed(normalizeAccountAccess(account)) };
    const failed = Object.keys(checks).filter(key => !checks[key]);
    if (failed.length) throw failure(409, `Checkout identity review blocked: ${failed.join(", ")}. No reconciliation approved.`);
    await buyerGrant(accountKey, locationId);
    const evidence = { buyerAccountKey: accountKey, locationId, companyId: cfg().companyId, sellerLocationId: SELLER_LOCATION_ID,
      originalEmail, ownerEmail, pendingKey: checkoutKey(originalEmail), pendingHash: snapshotHash(pending),
      productPlan: purchase.purchasedProductPlan, productName: pending.productName, cadence: purchase.purchasedBillingCadence,
      amount: purchase.purchasedAmount, subscriptionId: details.subscriptionId, customerId: details.customerId,
      productId: details.productId, priceId: details.priceId, saasPlanId: details.saasPlanId };
    return { evidence, fingerprint: snapshotHash(evidence) };
  }

  async function reconcileCheckoutIdentity(req, res) {
    admin(req);
    if (req.headers.origin !== cfg().redirect.origin) throw failure(403, "Review checkout identity from the SMARTCoach admin page.");
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { accountKey, locationId } = body;
    const originalEmail = normalizedEmail(body.originalEmail);
    const namespace = `checkoutidentity-${locationId}`;
    const result = await locked(namespace, async () => {
      const { evidence, fingerprint } = await checkoutIdentityEvidence(accountKey, locationId, originalEmail);
      const previous = await load(namespace);
      if (previous && (previous.status !== "approved" || previous.fingerprint !== fingerprint)) {
        throw failure(409, "Existing identity reconciliation conflicts with current evidence. Support review is required.");
      }
      if (body.preview === true) return { ...evidence, fingerprint, preview: true, alreadyApproved: !!previous };
      const reviewedBy = String(body.reviewedBy || "").trim();
      const reason = String(body.reason || "").trim();
      if (body.confirmReconciliation !== true || !equal(body.expectedFingerprint, fingerprint)
        || reviewedBy.length < 3 || reviewedBy.length > 120 || reason.length < 20 || reason.length > 1000) {
        throw failure(409, "Explicit support approval, reviewer, reason and unchanged preview evidence are required.");
      }
      if (previous) return { reconciliationApproved: true, alreadyApproved: true };
      await save(namespace, { ...evidence, fingerprint, status: "approved", reviewedBy, reason, approvedAt: now() });
      const confirmed = await load(namespace);
      if (!confirmed || confirmed.fingerprint !== fingerprint || confirmed.status !== "approved") throw failure(503, "Identity audit readback failed. Review before retrying.");
      return { reconciliationApproved: true, alreadyApproved: false };
    });
    res.status(200).json({ ...result, accountUnchanged: true, pendingCheckoutUnchanged: true, emailSent: false, automaticFulfillmentReady: false });
  }

  async function previewBuyerFulfillment(req, res) {
    admin(req);
    const settings = cfg();
    if (req.headers.origin !== settings.redirect.origin) throw failure(403, "Preview fulfillment from the SMARTCoach admin page.");
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { accountKey, locationId } = body;
    const { account, status, purchase, savedConfigurationMatches } = await readBuyerPurchase(accountKey, locationId);
    const blockers = [];
    if (!purchase.purchaseVerified || !savedConfigurationMatches) blockers.push("Exact purchase and saved pricing must match.");
    if (!["active", "trialing"].includes(status) || account.subscription?.status !== status) blockers.push("Saved and provider subscription status must match and allow access.");
    const ownerEmail = String(account.accountOwnerEmail || "").trim().toLowerCase();
    const validOwner = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail);
    if (!validOwner) blockers.push("A valid saved buyer owner email is required.");
    const pendingKey = checkoutKey(ownerEmail);
    const pending = validOwner ? (await store.loadAccountScopedRecord(pendingKey, "pendingcheckout")).record : null;
    const directCheckout = checkoutMatches(pending, ownerEmail, locationId, purchase)
      && pending.lastLocationCreateEvent?.id === locationId && pending.lastLocationCreateEvent?.companyId === settings.companyId
      && normalizedEmail(pending.lastLocationCreateEvent?.email) === ownerEmail;
    let pendingMatched = directCheckout;
    let checkoutIdentityReconciled = false;
    const audit = await load(`checkoutidentity-${locationId}`);
    if (!pendingMatched && audit?.status === "approved" && audit.buyerAccountKey === accountKey && audit.ownerEmail === ownerEmail) {
      try {
        const current = await checkoutIdentityEvidence(accountKey, locationId, audit.originalEmail);
        checkoutIdentityReconciled = !!audit.reviewedBy && !!audit.reason && equal(audit.fingerprint, current.fingerprint);
        pendingMatched = checkoutIdentityReconciled;
      } catch (_) { /* Stale approvals cannot authorize a changed buyer or checkout. */ }
    }
    if (!pendingMatched) blockers.push("Pre-checkout buyer identity, location and purchased plan must match; corrected owner details require support review.");
    let buyerOAuthVerified = false;
    try { await buyerGrant(accountKey, locationId); buyerOAuthVerified = true; }
    catch (_) { blockers.push("Buyer connector installation and OAuth access must be verified."); }
    const sellerToken = String(env.SMARTCOACH_WELCOME_SELLER_TOKEN || "").trim();
    const sender = String(env.SMARTCOACH_WELCOME_FROM_EMAIL || "").trim().toLowerCase();
    let sellerSenderVerified = false;
    if (sellerToken && sender === "info@smartcoach-pro.com") {
      try {
        const seller = await providerJson(`/locations/${SELLER_LOCATION_ID}`, sellerToken);
        sellerSenderVerified = seller.location?.id === SELLER_LOCATION_ID && seller.location?.companyId === settings.companyId;
      } catch (_) { /* Report a sanitized blocker; never fall back to buyer-account sending. */ }
    }
    if (!sellerSenderVerified) blockers.push("SMARTCoach Pro seller sender info@smartcoach-pro.com must be verified.");
    const previous = await load(`buyeraccess-${locationId}`);
    const staff = Array.isArray(account.coachStaff) ? account.coachStaff : [];
    const existingAccessPreserved = !!previous && previous.status === "accepted" && previous.buyerAccountKey === accountKey
      && previous.locationId === locationId && previous.ownerEmail === ownerEmail
      && previous.productPlan === account.productPlan && previous.senderLocationId === SELLER_LOCATION_ID
      && previous.emailFrom === "info@smartcoach-pro.com" && !!previous.messageId
      && staff.some(item => item.id === previous.staffId && item.active === true && item.accessType === "full" && !!item.coachCodeHash);
    if ((previous || staff.length) && !existingAccessPreserved) blockers.push("Existing or uncertain coach access must be reviewed; no reset or automatic resend is allowed.");
    if (!accountAccessAllowed(normalizeAccountAccess(account))) blockers.push("Saved account access is on hold.");
    const coreOAuthWriteRolloutEnabled = String(env.SMARTCOACH_GHL_OAUTH_WRITE_ACCOUNTS || "").split(/[,\s]+/).includes(accountKey)
      || req[eventAuthorization] === true && automaticExecutionAllowed({ accountKey, locationId })
      || await approvedBuyerOAuth(accountKey, locationId);
    if (!coreOAuthWriteRolloutEnabled) blockers.push("Core CRM OAuth writes are implemented but not enabled for this buyer; manual PIT setup remains in use.");
    const newBuyerConfigurationVerified = !previous && staff.length === 0 && directCheckout
      && account.productPlan === purchase.purchasedProductPlan && account.subscription?.status === "incomplete"
      && account.schoolName === pending.schoolName && account.accountOwnerName === pending.coachName;
    const stagedFulfillment = planBuyerFulfillment({ accountKey, locationId, ...purchase, savedConfigurationMatches, newBuyerConfigurationVerified,
      pendingCheckoutMatched: pendingMatched, providerSubscriptionStatus: status,
      subscriptionStatusMatched: account.subscription?.status === status, buyerOAuthVerified, sellerSenderVerified,
      existingAccessPreserved, existingAccessAbsent: !previous && staff.length === 0,
      accountAccessAllowed: accountAccessAllowed(normalizeAccountAccess(account)), coreOAuthWriteRolloutEnabled });
    blockers.push("Automatic new-buyer execution is disabled; connected setup and seller-email handlers require controlled verification.");
    res.status(200).json({ accountKey, locationId, ...purchase, providerSubscriptionStatus: status, newBuyerConfigurationVerified,
      savedConfigurationMatches, pendingCheckoutMatched: pendingMatched, checkoutIdentityReconciled, buyerOAuthVerified, sellerSenderVerified,
      existingAccessPreserved, nextAccessAction: existingAccessPreserved ? "preserve_existing_access" : "support_review_required",
      coreOAuthWritesImplemented: true, remainingOAuthPathsImplemented: true, coreOAuthWriteRolloutEnabled,
      stagedFulfillment, automaticFulfillmentReady: false, previewOnly: true, accountUnchanged: true, emailSent: false, blockers });
  }

  async function handlerResult(handler, req, body) {
    let status = 200, data;
    await handler({ method: req.method, headers: req.headers, body, [eventAuthorization]: req[eventAuthorization] },
      { status(value) { status = value; return this; }, json(value) { data = value; return this; } });
    if (status >= 400 || !data) throw failure(status >= 400 ? status : 503, data?.error || "Fulfillment handler did not return a verified result.");
    return data;
  }

  async function inspectFulfillmentBuyer(req, buyer) {
    if (req[eventAuthorization] === true && !automaticExecutionAllowed(buyer)) {
      throw failure(409, "Automatic fulfillment approval changed.");
    }
    const qualification = newBuyerQualifications.get(buyer.accountKey);
    if (req[eventAuthorization] === true && qualification) {
      const verified = await readBuyerPurchase(buyer.accountKey, buyer.locationId);
      const pending = await store.loadAccountScopedRecord(checkoutKey(normalizedEmail(verified.account.accountOwnerEmail)), "pendingcheckout");
      const proof = await store.loadAccountScopedRecord(STORE_KEY, `buyerpolicy-${buyer.locationId}`);
      if (pending.error || proof.error) throw failure(503, "Buyer policy evidence unavailable.");
      const current = qualifyNewBuyer({ buyer, account: verified.account, pending: pending.record,
        purchase: verified.purchase, status: verified.status, companyId: cfg().companyId,
        subscriptionId: verified.details.subscriptionId, priceId: verified.details.priceId,
        inventory: await store.inspectAccountLocationReferences(buyer.locationId), previous: proof.record });
      if (!current.qualified || current.fingerprint !== qualification.fingerprint) {
        throw failure(409, "New-buyer evidence changed. Support review required.");
      }
    }
    const preview = await handlerResult(previewBuyerFulfillment, req, buyer);
    if (req[eventAuthorization] === true && (!preview.pendingCheckoutMatched || preview.checkoutIdentityReconciled)) {
      throw failure(409, "Automatic fulfillment requires the original directly matched checkout.");
    }
    const account = (await store.loadAccountRecord(buyer.accountKey)).record;
    const audit = await load(`checkoutidentity-${buyer.locationId}`);
    const originalEmail = preview.checkoutIdentityReconciled ? audit.originalEmail : normalizedEmail(account.accountOwnerEmail);
    const pending = (await store.loadAccountScopedRecord(checkoutKey(originalEmail), "pendingcheckout")).record;
    const purchase = await readBuyerPurchase(buyer.accountKey, buyer.locationId);
    return { ...preview, subscriptionStatusMatched: account.subscription?.status === purchase.status,
      accountAccessAllowed: accountAccessAllowed(normalizeAccountAccess(account)),
      existingAccessAbsent: !(await load(`buyeraccess-${buyer.locationId}`)) && !(account.coachStaff || []).length,
      ownerEmail: normalizedEmail(account.accountOwnerEmail), coachName: pending?.coachName, schoolName: pending?.schoolName,
      productPlan: purchase.purchase.purchasedProductPlan, productName: pending?.productName,
      billingCadence: purchase.purchase.purchasedBillingCadence, amount: purchase.purchase.purchasedAmount,
      subscriptionId: purchase.details.subscriptionId, priceId: purchase.details.priceId,
      checkoutFingerprint: pending ? snapshotHash(pending) : "" };
  }

  async function verifyBuyerSnapshot(buyer, grant) {
    const scopes = new Set(String(grant.scope || "").split(/\s+/));
    const required = ["locations.readonly", "locations/customFields.readonly", "locations/customValues.readonly",
      "locations/customValues.write", "contacts.readonly", "contacts.write", "objects/record.readonly", "objects/record.write", "objects/schema.readonly"];
    if (!required.every(scope => scopes.has(scope))) throw failure(403, "Buyer fulfillment OAuth scopes are incomplete.");
    const fields = await providerJson(`/locations/${encodeURIComponent(buyer.locationId)}/customFields?model=all`, grant.access_token);
    if (!Array.isArray(fields.customFields)) throw failure(409, "Buyer snapshot fields could not be verified.");
    const mapping = require("../smart_trak_object_mapping.json");
    const expected = Object.values(mapping.contactFields).map(field => field.fieldKey);
    if (expected.some(key => fields.customFields.filter(field => field.fieldKey === key && !!field.id
      && (!field.locationId || field.locationId === buyer.locationId)).length !== 1)) {
      throw failure(409, "Buyer snapshot fields are missing or ambiguous. Verify the installed snapshot before creating access.");
    }
    for (const object of Object.values(mapping.objects)) {
      const schema = await providerJson(`/objects/${encodeURIComponent(object.internalName)}?${new URLSearchParams({ locationId: buyer.locationId, fetchProperties: "true" })}`, grant.access_token);
      if (schema.object?.locationId !== buyer.locationId || schema.object?.key !== object.internalName || !Array.isArray(schema.fields)) {
        throw failure(409, `Buyer snapshot object identity or field list does not match: ${object.internalName}; key match=${schema.object?.key === object.internalName}, location match=${schema.object?.locationId === buyer.locationId}, field list=${Array.isArray(schema.fields)}.`);
      }
      const mismatches = Object.entries(object.fields).filter(([key, expectedField]) => schema.fields.filter(field =>
          [`${object.internalName}.${key}`, `${object.internalName.replace("custom_objects.", "custom_object.")}.${key}`].includes(field.fieldKey)
          && !!field.id && field.locationId === buyer.locationId && field.dataType === expectedField.type).length !== 1);
      if (mismatches.length) {
        throw failure(409, `Buyer snapshot fields do not match: ${object.internalName}: ${mismatches.map(([key, field]) => `${key} (${field.type})`).join(", ")}.`);
      }
    }
    return { verified: true, contactFieldCount: expected.length, objectCount: Object.keys(mapping.objects).length };
  }

  async function configureFulfillmentBuyer(req, buyer, evidence) {
    const grant = await readConsumerGrant(buyer.accountKey, buyer.locationId);
    await verifyBuyerSnapshot(buyer, grant);
    await locked(`buyersubscription-${buyer.locationId}`, () => locked(`buyeraccess-${buyer.locationId}`, async () => {
      const fresh = await inspectFulfillmentBuyer(req, buyer);
      if (!planBuyerFulfillment(fresh).stagedPlanReady || fresh.checkoutFingerprint !== evidence.checkoutFingerprint
        || ["ownerEmail", "subscriptionId", "priceId", "productPlan", "productName", "billingCadence", "amount", "providerSubscriptionStatus"]
          .some(field => fresh[field] !== evidence[field])) {
        throw failure(409, "Buyer evidence changed before setup.");
      }
      const account = (await store.loadAccountRecord(buyer.accountKey)).record;
      if ((account.coachStaff || []).length || await load(`buyeraccess-${buyer.locationId}`)) throw failure(409, "Existing coach access must be preserved.");
      const updated = { ...account, productPlan: fresh.productPlan, requireCoachAccess: true,
        coachAccessCodes: account.coachAccessCodes?.length ? account.coachAccessCodes : [crypto.randomBytes(32).toString("hex")],
        subscription: { ...account.subscription, status: fresh.providerSubscriptionStatus,
          billingCadence: fresh.billingCadence, amount: fresh.amount } };
      if (!(await store.saveAccountRecord(buyer.accountKey, updated)).saved) throw failure(503, "Buyer setup save could not be confirmed.");
      const saved = (await store.loadAccountRecord(buyer.accountKey)).record;
      if (!saved || saved.locationId !== buyer.locationId || saved.productPlan !== updated.productPlan
        || saved.subscription?.status !== updated.subscription.status || saved.subscription?.amount !== updated.subscription.amount
        || saved.subscription?.billingCadence !== updated.subscription.billingCadence
        || saved.accountOwnerEmail !== account.accountOwnerEmail || saved.token !== account.token
        || JSON.stringify(saved.coachAccessCodes) !== JSON.stringify(updated.coachAccessCodes) || saved.requireCoachAccess !== true) {
        throw failure(503, "Buyer setup readback failed. Support review required.");
      }
      if (deps.onAccountUpdated) deps.onAccountUpdated(buyer.accountKey);
    }));
    return { ...buyer, confirmed: true };
  }

  async function fulfillBuyer(req, res) {
    admin(req);
    if (req.headers.origin !== cfg().redirect.origin) throw failure(403, "Review fulfillment from the SMARTCoach admin page.");
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const buyer = { accountKey: body.accountKey, locationId: body.locationId };
    if (req[eventAuthorization] === true && !automaticExecutionAllowed(buyer)) {
      throw failure(409, "Automatic fulfillment is disabled for this buyer.");
    }
    // Public calls require admin confirmation; server events also require the automatic gate.
    const executionEnabled = deps.fulfillmentExecutionEnabled === true || controlledBuyerExecutionAllowed(env, buyer)
      || req[eventAuthorization] === true && automaticExecutionAllowed(buyer);
    if (body.dryRun === false && !executionEnabled) throw failure(409, "Live buyer fulfillment is disabled for this buyer. Dry-run verification only.");
    // Scoped storage owns accountKey; retain the logical buyer identity separately.
    const loadJob = async value => {
      const job = await load(`buyerfulfillment-${value.locationId}`);
      if (!job) return job;
      if (job.locationId !== value.locationId || (job.buyerAccountKey !== value.accountKey
        && !(job.buyerAccountKey === undefined && [value.accountKey, STORE_KEY].includes(job.accountKey)))) {
        throw failure(409, 'Fulfillment ledger buyer identity conflicts. Support review required.');
      }
      return { ...job, accountKey: value.accountKey };
    };
    const saveJob = (value, job) => save(`buyerfulfillment-${value.locationId}`, { ...job, buyerAccountKey: value.accountKey });
    const coordinator = createBuyerFulfillment({ executionEnabled, now,
      inspect: value => inspectFulfillmentBuyer(req, value), load: loadJob,
      save: saveJob,
      lock: value => store.acquireAccountScopedLock(STORE_KEY, `buyerfulfillment-${value.locationId}`, { ttlMs: 120000, waitMs: 1000 }),
      actions: {
        verify_buyer_setup: (value, evidence) => configureFulfillmentBuyer(req, value, evidence),
        ensure_buyer_account_key: async value => {
          const result = await handlerResult(verifyBuyerWrite, req, value);
          return { ...value, confirmed: result.accountKeyWriteVerified === true };
        },
        create_head_coach_and_send_seller_access: async (value, evidence) => {
          await handlerResult(createBuyerHeadCoach, req, { ...value, coachName: evidence.coachName,
            confirmCreate: true, expectedOwnerEmail: evidence.ownerEmail, expectedProductPlan: evidence.productPlan });
          const accepted = await load(`buyeraccess-${value.locationId}`);
          return { ...value, confirmed: accepted?.status === "accepted", senderLocationId: accepted?.senderLocationId,
            emailFrom: accepted?.emailFrom, messageId: accepted?.messageId };
        },
      },
    });
    if (body.reviewInterruptedWrite === true) {
      const release = await store.acquireAccountScopedLock(STORE_KEY, `buyerfulfillment-${buyer.locationId}`, { ttlMs: 120000, waitMs: 1000 });
      try {
        const preview = await coordinator.run(buyer, { dryRun: true });
        const job = await loadJob(buyer);
        if (!job || job.accountKey !== buyer.accountKey || job.locationId !== buyer.locationId || job.fingerprint !== preview.fingerprint
          || job.status !== 'pending' || job.steps?.verify_buyer_setup?.status !== 'confirmed'
          || job.steps?.ensure_buyer_account_key?.status !== 'attempted'
          || job.steps?.create_head_coach_and_send_seller_access
          || Object.keys(job.steps).some(step => !['verify_buyer_setup', 'ensure_buyer_account_key'].includes(step))) {
          throw failure(409, 'Interrupted account-key step does not match a reviewable setup. No retry or recovery performed.');
        }
        const grant = await readConsumerGrant(buyer.accountKey, buyer.locationId);
        await verifyBuyerSnapshot(buyer, grant);
        const data = await providerJson(`/locations/${encodeURIComponent(buyer.locationId)}/customValues`, grant.access_token);
        const values = Array.isArray(data.customValues) ? data.customValues.filter(item => item
          && String(item.name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_') === 'account_key') : [];
        if (values.length !== 1 || !values[0].id || values[0].value !== buyer.accountKey
          || values[0].locationId && values[0].locationId !== buyer.locationId) {
          throw failure(409, 'Buyer account-key readback is not an exact unambiguous match. No recovery performed.');
        }
        await buyerMapping(buyer.accountKey, buyer.locationId);
        if (body.dryRun !== false) return res.status(200).json({ ...preview, interruptedWriteVerified: true,
          providerWritePerformed: false, recoveryRecorded: false });
        if (!executionEnabled || body.confirmRecovery !== true || body.expectedFingerprint !== preview.fingerprint) {
          throw failure(409, 'Explicit unchanged-evidence recovery confirmation is required.');
        }
        job.steps.ensure_buyer_account_key = { ...job.steps.ensure_buyer_account_key,
          status: 'confirmed', confirmedAt: now(), recovery: 'exact_provider_readback', reviewedAt: now() };
        await saveJob(buyer, job);
        const confirmed = await loadJob(buyer);
        if (confirmed?.fingerprint !== job.fingerprint || confirmed.steps?.ensure_buyer_account_key?.status !== 'confirmed'
          || confirmed.steps?.ensure_buyer_account_key?.recovery !== 'exact_provider_readback') {
          throw failure(503, 'Recovery ledger readback requires support review.');
        }
        return res.status(200).json({ recoveryRecorded: true, accountKey: buyer.accountKey, locationId: buyer.locationId,
          providerWritePerformed: false, emailSent: false, automaticFulfillmentReady: false });
      } finally { await release(); }
    }
    const result = await coordinator.run(buyer, { dryRun: body.dryRun !== false,
      confirmExecution: body.confirmExecution === true, expectedFingerprint: body.expectedFingerprint });
    if (result.dryRun) {
      result.controlledExecutionEnabled = executionEnabled;
      const grant = await readConsumerGrant(buyer.accountKey, buyer.locationId);
      result.newBuyerSchemaScopeAvailable = String(grant.scope || "").split(/\s+/).includes("objects/schema.readonly");
      if (body.verifySnapshot === true) result.snapshot = await verifyBuyerSnapshot(buyer, grant);
    }
    res.status(200).json(result);
  }

  async function dispatchProvisioningEvent(payload, verification = {}) {
    const base = { automaticFulfillmentReady: false, emailAccepted: false, deliveryVerified: false };
    const locationId = payload?.type === "LocationCreate" ? payload.id : payload?.locationId;
    const buyer = { locationId, accountKey: typeof locationId === "string" ? `sc-${locationId.toLowerCase()}` : "" };
    // Disabled dispatch performs no registry/provider reads, token saves, writes or mail.
    if (!readinessAdmissionAllowed(buyer)) return { ...base, status: "disabled" };
    if (verification.signatureVerified !== true || verification.automationSecretFallback === true || !validProvisioningEvent(payload, buyer)) {
      return { ...base, status: "event_rejected" };
    }
    try {
      // Persist only the signed event identity needed for rechecking; never retain its full payload.
      const event = { type: payload.type, appId: payload.appId, companyId: payload.companyId,
        ...(payload.versionId ? { versionId: payload.versionId } : {}),
        ...(payload.type === "LocationCreate" ? { id: locationId, email: normalizedEmail(payload.email) } : { locationId }) };
      return await readinessQueue().run(buyer, { event });
    } catch (_) {
      return { ...base, status: "support_review_required", outcomeRequiresReview: true };
    }
  }

  function validProvisioningEvent(payload, buyer) {
    return ["LocationCreate", "INSTALL"].includes(payload?.type)
      && payload.appId === (payload.type === "LocationCreate" ? PROVISIONING_APP_ID : APP_ID)
      && (!payload.versionId || payload.versionId === payload.appId)
      && !!env.SMARTCOACH_GHL_OAUTH_COMPANY_ID && payload.companyId === env.SMARTCOACH_GHL_OAUTH_COMPANY_ID
      && (payload.type === "LocationCreate" ? payload.id : payload.locationId) === buyer.locationId
      && payload.approveAllLocations !== true && payload.installToFutureLocations !== true;
  }

  function readinessQueue() {
    const req = { method: "POST", headers: { origin: cfg().redirect.origin }, [eventAuthorization]: true };
    return createBuyerReadiness({ now, allowed: readinessAdmissionAllowed,
      load: async buyer => {
        const result = await store.loadAccountScopedRecord(STORE_KEY, `buyerreadiness-${buyer.locationId}`);
        if (result.error) throw failure(503, "Buyer readiness storage is unavailable.");
        return result.record;
      },
      save: (buyer, job) => save(`buyerreadiness-${buyer.locationId}`, job),
      lock: buyer => store.acquireAccountScopedLock(STORE_KEY, `buyerreadiness-${buyer.locationId}`, { ttlMs: 120000, waitMs: 1000 }),
      inspect: async (buyer, payload) => {
        newBuyerQualifications.delete(buyer.accountKey);
        if (!validProvisioningEvent(payload, buyer)) return { status: "checkout_review_required" };
        const locationId = buyer.locationId;
        const accountResult = await store.loadAccountRecord(buyer.accountKey);
        if (accountResult.error) throw failure(503, "Buyer mapping unavailable.");
        if (!accountResult.found || !accountResult.record) return { status: "waiting_for_mapping" };
        const account = accountResult.record;
        const email = normalizedEmail(account.accountOwnerEmail);
        const pendingResult = await store.loadAccountScopedRecord(checkoutKey(email), "pendingcheckout");
        const pending = pendingResult.record;
        if (pendingResult.error || account.locationId !== locationId || pending?.source !== "smartcoach-precheckout"
          || pending.lastMatchedLocationId !== locationId || pending.coachEmail !== email
          || pending.lastLocationCreateEvent?.id !== locationId
          || pending.lastLocationCreateEvent?.companyId !== payload.companyId
          || normalizedEmail(pending.lastLocationCreateEvent?.email) !== email
          || payload.type === "LocationCreate" && normalizedEmail(payload.email) !== email) {
          return { status: "checkout_review_required" };
        }
        if (!automaticBuyerExecutionAllowed(env, buyer)) {
          const verified = await readBuyerPurchase(buyer.accountKey, buyer.locationId);
          const previousResult = await store.loadAccountScopedRecord(STORE_KEY, `buyerpolicy-${locationId}`);
          if (previousResult.error) throw failure(503, "Buyer policy storage is unavailable.");
          const qualification = qualifyNewBuyer({ buyer, account: verified.account, pending,
            purchase: verified.purchase, status: verified.status, companyId: payload.companyId,
            subscriptionId: verified.details.subscriptionId, priceId: verified.details.priceId,
            inventory: await store.inspectAccountLocationReferences(locationId), previous: previousResult.record });
          if (!qualification.qualified || await load(`checkoutidentity-${locationId}`)) return { status: "checkout_review_required" };
          const accessResult = await store.loadAccountScopedRecord(STORE_KEY, `buyeraccess-${locationId}`);
          if (accessResult.error || accessResult.record && !qualification.previousPreserved) return { status: "checkout_review_required" };
          newBuyerQualifications.set(buyer.accountKey, qualification);
        }
        try { await buyerGrant(buyer.accountKey, locationId); }
        catch (error) {
          if (error.readinessPending === "installation") return { status: "waiting_for_installation" };
          throw error;
        }
        // Only mapping/installation absence is retryable. Purchase/snapshot mismatches stop for review.
        const preview = await handlerResult(fulfillBuyer, req, { ...buyer, dryRun: true, verifySnapshot: true });
        if (preview.existingAccessPreserved) return { status: "existing_access_preserved" };
        const qualification = newBuyerQualifications.get(buyer.accountKey);
        if (qualification) {
          if (preview.snapshot?.verified !== true || !newBuyerPolicyEnabled(env)) return { status: "support_review_required" };
          const proof = { ...qualification.identity, fingerprint: qualification.fingerprint,
            snapshotVerified: true, status: "approved", approvedAt: now() };
          await save(`buyerpolicy-${locationId}`, proof);
          const confirmed = await load(`buyerpolicy-${locationId}`);
          if (!confirmed || Object.keys(proof).some(key => confirmed[key] !== proof[key])) throw failure(503, "Buyer policy readback failed.");
        }
        return { status: "ready", fingerprint: preview.fingerprint };
      },
      execute: async (buyer, readiness) => {
        const result = await handlerResult(fulfillBuyer, req, { ...buyer, dryRun: false,
          confirmExecution: true, expectedFingerprint: readiness.fingerprint });
        const qualification = newBuyerQualifications.get(buyer.accountKey);
        if (result.complete === true && qualification) {
          const proof = { ...qualification.identity, fingerprint: qualification.fingerprint,
            snapshotVerified: true, status: "complete", completedAt: now() };
          await save(`buyerpolicy-${buyer.locationId}`, proof);
          const account = (await store.loadAccountRecord(buyer.accountKey)).record;
          if (!completedBuyerOAuthApproval(env, buyer, account, await load(`buyerpolicy-${buyer.locationId}`))) {
            throw failure(503, "Completed buyer policy readback failed. Support review required.");
          }
        }
        return { status: result.complete === true ? "complete" : "support_review_required",
          emailAccepted: result.emailAccepted === true };
      },
    });
  }

  async function processBuyerReadiness(req, res) {
    admin(req);
    if (req.headers.origin !== cfg().redirect.origin) throw failure(403, "Review readiness from the SMARTCoach admin page.");
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const buyer = { accountKey: body.accountKey, locationId: body.locationId };
    if (body.reviewRecovery === true) {
      const recovery = createBuyerReadinessRecovery({ now,
        enabled: () => newBuyerPolicyEnabled(env), eventValid: validProvisioningEvent,
        lock: value => store.acquireAccountScopedLock(STORE_KEY, `buyerreadiness-${value.locationId}`, { ttlMs: 120000, waitMs: 1000 }),
        load: async value => {
          const evidence = {};
          for (const name of ["readiness", "recovery", "policy", "fulfillment", "access", "welcome"]) {
            const result = await store.loadAccountScopedRecord(STORE_KEY, `buyer${name}-${value.locationId}`);
            if (result.error) throw failure(503, "Recovery evidence unavailable. No retry performed.");
            evidence[name] = result.record;
          }
          const checkout = await store.loadAccountScopedRecord(STORE_KEY, `checkoutidentity-${value.locationId}`);
          if (checkout.error) throw failure(503, "Checkout review evidence unavailable. No retry performed.");
          evidence.checkoutIdentity = checkout.record;
          return evidence;
        },
        inspect: value => inspectBuyerPrerequisites(value, null, true),
        saveRecovery: (value, record) => save(`buyerrecovery-${value.locationId}`, record),
        saveReadiness: (value, record) => save(`buyerreadiness-${value.locationId}`, record),
        resume: value => readinessQueue().run(value),
      });
      return res.status(200).json(await recovery.run(buyer, body));
    }
    if (body.dryRun === false && body.confirmExecution !== true) throw failure(409, "Explicit readiness execution confirmation is required.");
    // Public callers can only inspect/resume a stored verified event, never enqueue a new one.
    const result = await readinessQueue().run(buyer, { inspectOnly: body.dryRun !== false });
    if (body.dryRun !== false && result.status !== "disabled" && validBuyerIdentity(buyer)) {
      const fulfillment = await store.loadAccountScopedRecord(STORE_KEY, `buyerfulfillment-${buyer.locationId}`);
      const policy = await store.loadAccountScopedRecord(STORE_KEY, `buyerpolicy-${buyer.locationId}`);
      if (fulfillment.error || policy.error) throw failure(503, "Saved automation evidence is unavailable.");
      for (const record of [fulfillment.record, policy.record]) {
        if (record && (record.buyerAccountKey !== buyer.accountKey || record.locationId !== buyer.locationId)) {
          throw failure(503, "Saved automation evidence does not match this buyer. Support review required.");
        }
      }
      // Whitelist support fields; never return stored credentials, fingerprints or mail contents.
      const steps = {};
      for (const step of ["verify_buyer_setup", "ensure_buyer_account_key", "create_head_coach_and_send_seller_access"]) {
        const status = fulfillment.record?.steps?.[step]?.status;
        steps[step] = ["attempted", "confirmed"].includes(status) ? status : "not_recorded";
      }
      result.savedEvidence = {
        policyStatus: ["approved", "complete"].includes(policy.record?.status) ? policy.record.status : "not_recorded",
        snapshotVerified: policy.record?.snapshotVerified === true,
        fulfillmentStatus: ["pending", "complete"].includes(fulfillment.record?.status) ? fulfillment.record.status : "not_recorded",
        steps,
      };
      if (body.inspectPrerequisites === true) {
        result.prerequisites = await inspectBuyerPrerequisites(buyer, policy.record);
        if (result.prerequisites.verified === true && steps.ensure_buyer_account_key === "attempted") {
          result.accountKeyReadback = await inspectBuyerAccountKey(buyer);
        }
      }
    }
    res.status(200).json(result);
  }

  async function inspectBuyerAccountKey(buyer) {
    try {
      const grant = await buyerGrant(buyer.accountKey, buyer.locationId);
      const data = await providerJson(`/locations/${encodeURIComponent(buyer.locationId)}/customValues`, grant.access_token);
      if (!Array.isArray(data.customValues)) throw failure(502, "Invalid custom-values readback.");
      const values = data.customValues.filter(item => item && String(item.name || "").trim()
        .toLowerCase().replace(/[^a-z0-9]+/g, "_") === "account_key");
      const exactMatch = values.length === 1 && !!values[0].id && values[0].value === buyer.accountKey
        && (!values[0].locationId || values[0].locationId === buyer.locationId);
      return { readVerified: true, exactMatch, matchCount: values.length, providerWritePerformed: false };
    } catch (_) {
      return { readVerified: false, exactMatch: false, providerWritePerformed: false };
    }
  }

  async function inspectBuyerPrerequisites(buyer, previous, internal = false) {
    let stage = "purchase";
    try {
      const verified = await readBuyerPurchase(buyer.accountKey, buyer.locationId);
      stage = "qualification";
      const pending = await store.loadAccountScopedRecord(checkoutKey(normalizedEmail(verified.account.accountOwnerEmail)), "pendingcheckout");
      if (pending.error) throw failure(503, "Checkout evidence unavailable.");
      const inventory = await store.inspectAccountLocationReferences(buyer.locationId);
      const inventorySummary = { complete: inventory.complete === true, referenceCount: inventory.references?.length || 0,
        buyerMatched: inventory.references?.includes(buyer.accountKey) === true,
        reason: ["registry_unconfigured", "invalid_continuation", "invalid_scan_response", "account_limit_reached",
          "invalid_account_batch", "unreadable_account_record", "scan_page_limit_reached"].includes(inventory.reason) ? inventory.reason : null };
      const qualification = qualifyNewBuyer({ buyer, account: verified.account, pending: pending.record,
        purchase: verified.purchase, status: verified.status, companyId: cfg().companyId,
        subscriptionId: verified.details.subscriptionId, priceId: verified.details.priceId,
        inventory, previous });
      if (!qualification.qualified) return { verified: false, stage, blockers: qualification.blockers, inventory: inventorySummary };
      stage = "installation";
      const grant = await buyerGrant(buyer.accountKey, buyer.locationId);
      stage = "snapshot";
      const snapshot = await verifyBuyerSnapshot(buyer, grant);
      return { verified: true, stage: "verified", snapshot, ...(internal ? { qualification } : {}) };
    } catch (error) {
      // Only local snapshot-validation messages are safe to display; provider bodies stay private.
      const localSnapshotError = stage === "snapshot" &&
        (error.message === "Buyer fulfillment OAuth scopes are incomplete." || String(error.message).startsWith("Buyer snapshot "));
      return { verified: false, stage, reason: localSnapshotError ? error.message : "Prerequisite verification failed. No fulfillment was attempted.",
        ...(Number.isInteger(error.providerStatus) ? { providerStatus: error.providerStatus } : {}) };
    }
  }

  async function readinessCron(req, res) {
    const secret = String(env.CRON_SECRET || "");
    if (secret.length < 32 || !equal(req.headers?.authorization, `Bearer ${secret}`)) {
      throw failure(403, "Readiness scheduler authorization is required.");
    }
    const enabled = () => env.SMARTCOACH_GHL_READINESS_WORKER_ENABLED === "true";
    const worker = createBuyerReadinessWorker({ enabled,
      load: async () => {
        const result = await store.loadAccountScopedRecord(STORE_KEY, "readinessworker");
        if (result.error) throw failure(503, "Readiness worker storage unavailable.");
        return result.record;
      },
      save: state => save("readinessworker", state),
      scan: cursor => store.scanBuyerReadinessJobs(cursor),
      loadJob: async namespace => {
        const result = await store.loadAccountScopedRecord(STORE_KEY, namespace);
        if (result.error) throw failure(503, "Readiness job storage unavailable.");
        return result.record;
      },
      lock: () => store.acquireAccountScopedLock(STORE_KEY, "readinessworker", { ttlMs: 120000, waitMs: 1000 }),
      resume: buyer => readinessQueue().run(buyer),
    });
    return res.status(200).json(await worker.run());
  }

  async function checkBuyerSubscription(req, res) {
    admin(req);
    const settings = cfg();
    if (req.headers.origin !== settings.redirect.origin) throw failure(403, "Check the purchase from the SMARTCoach admin page.");
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { accountKey, locationId } = body;
    const { account, details, status, ids, purchase, savedConfigurationMatches } = await readBuyerPurchase(accountKey, locationId);
    if (body.reconcileTrialStatus === true) {
      if (!savedConfigurationMatches || status !== "trialing" || account.subscription?.status !== "active"
        || body.expectedSavedStatus !== "active" || body.expectedProviderStatus !== "trialing") {
        throw failure(409, "Trial reconciliation requires verified matching pricing and an active-to-trialing status change. No buyer setup was changed.");
      }
      await locked(`buyersubscription-${locationId}`, async () => {
        await buyerMapping(accountKey, locationId);
        const latest = (await store.loadAccountRecord(accountKey)).record;
        if (JSON.stringify(latest) !== JSON.stringify(account)) throw failure(409, "Buyer setup changed during verification. Check the purchase again.");
        const updated = { ...latest, subscription: { ...latest.subscription, status: "trialing" } };
        const saved = await store.saveAccountRecord(accountKey, updated);
        if (!saved.saved) throw failure(503, "Trial status could not be saved.");
        if (deps.onAccountUpdated) deps.onAccountUpdated(accountKey);
        const confirmed = (await store.loadAccountRecord(accountKey)).record;
        const stableRecord = (record) => { const copy = { ...record }; delete copy.updatedAt; delete copy.accountKey; return copy; };
        if (!confirmed || JSON.stringify(stableRecord(confirmed)) !== JSON.stringify(stableRecord(updated))) throw failure(503, "Trial status readback did not match. Review the account before retrying.");
      });
      return res.status(200).json({ accountKey, locationId, ...purchase, savedConfigurationMatches,
        providerSubscriptionStatus: status, savedSubscriptionStatus: "trialing", trialStatusReconciled: true,
        automaticFulfillmentReady: false, billingUnchanged: true, coachAccessUnchanged: true, emailHistoryUnchanged: true });
    }
    // Catalog verification alone never changes access or sends an email.
    res.status(200).json({ accountKey, locationId, subscriptionIdentityVerified: true,
      providerSubscriptionStatus: status, savedSubscriptionStatus: account.subscription?.status || "",
      savedProductPlan: account.productPlan || "", ...Object.fromEntries(ids.map((field) => [field, details[field]])),
      ...purchase, savedConfigurationMatches, automaticFulfillmentReady: false, buyerSetupUnchanged: true,
      reason: purchase.reason || "Purchase catalog verified. Reconcile saved subscription status before automatic fulfillment." });
  }

  async function verifyBuyer(req, res) {
    admin(req);
    const settings = cfg();
    if (req.headers.origin !== settings.redirect.origin) throw failure(403, "Verify the buyer from the SMARTCoach admin page.");
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { accountKey, locationId } = body;
    const grant = await buyerGrant(accountKey, locationId);
    await providerJson(`/locations/${encodeURIComponent(locationId)}/customValues`, grant.access_token);
    await providerJson(`/locations/${encodeURIComponent(locationId)}/customFields`, grant.access_token);
    const contacts = await providerJson(`/contacts/?${new URLSearchParams({ locationId, limit: "1" })}`, grant.access_token,
      { headers: { Version: "2023-02-21" } });
    if (!Array.isArray(contacts.contacts) || contacts.contacts.some((contact) => contact.locationId !== locationId)) {
      throw failure(403, "HighLevel contacts did not match the buyer location.");
    }
    res.status(200).json({ accountKey, locationId, buyerOAuthVerified: true,
      crmReadsVerified: true, expiresAt: grant.expiresAt, pitUnchanged: true, buyerProvisioningVerified: false });
  }

  async function readConsumerGrant(accountKey, locationId) {
    await buyerMapping(accountKey, locationId);
    const saved = await load(`buyergrant-${locationId}`);
    if (!saved || saved.status !== "verified" || saved.locationId !== locationId) {
      throw failure(503, "Verify buyer OAuth before enabling CRM reads.");
    }
    if (saved.buyerAccountKey !== accountKey) {
      // Older scoped records had their buyer key replaced by the storage-owner key.
      // Only migrate an encrypted, location-matching record in this connector scope.
      if (saved.buyerAccountKey !== undefined || saved.accountKey !== STORE_KEY
        || decrypt(saved.encrypted, cfg()).locationId !== locationId) {
        throw failure(503, "Verify buyer OAuth before enabling CRM reads.");
      }
    }
    return buyerGrant(accountKey, locationId);
  }

  async function approvedBuyerOAuth(accountKey, locationId) {
    if (!newBuyerPolicyEnabled(env) || !validBuyerIdentity({ accountKey, locationId })) return false;
    const proof = await store.loadAccountScopedRecord(STORE_KEY, `buyerpolicy-${locationId}`);
    const saved = await store.loadAccountRecord(accountKey);
    if (proof.error || saved.error) throw failure(503, "Buyer policy storage is unavailable.");
    const approved = completedBuyerOAuthApproval(env, { accountKey, locationId }, saved.record, proof.record);
    if (proof.record?.status === "complete" && !approved) throw failure(503, "Completed buyer policy could not be verified.");
    return approved;
  }

  async function verifyBuyerWrite(req, res) {
    admin(req);
    const settings = cfg();
    if (req.headers.origin !== settings.redirect.origin) throw failure(403, "Verify the buyer from the SMARTCoach admin page.");
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { accountKey, locationId } = body;
    const grant = await readConsumerGrant(accountKey, locationId);
    if (!settings.scopes.includes("locations/customValues.write")
      || !String(grant.scope || "").split(/\s+/).includes("locations/customValues.write")) {
      throw failure(403, "Buyer custom-value write permission is required.");
    }
    await locked(`buyerwrite-${locationId}`, async () => {
      const path = `/locations/${encodeURIComponent(locationId)}/customValues`;
      const matchingValues = async () => {
        const data = await providerJson(path, grant.access_token);
        if (!Array.isArray(data.customValues)) throw failure(502, "Buyer custom values could not be verified.");
        const values = data.customValues.filter((item) => item && String(item.name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_") === "account_key");
        if (values.length > 1 || values.some((item) => item.locationId && item.locationId !== locationId)) {
          throw failure(409, "Buyer account-key custom value is ambiguous or belongs to another location.");
        }
        return values;
      };
      const [existing] = await matchingValues();
      if (existing && String(existing.value || "").trim() && existing.value !== accountKey) {
        throw failure(409, "Buyer account-key custom value conflicts with the saved account. No write was made.");
      }
      if (existing && !existing.id) throw failure(502, "Buyer custom-value identity could not be verified.");
      await buyerMapping(accountKey, locationId);
      // Re-save the exact account key, including when it already matches, to prove write permission.
      await providerJson(existing ? `${path}/${encodeURIComponent(existing.id)}` : path, grant.access_token, {
        method: existing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: existing ? existing.name : "account_key", value: accountKey }),
      });
      const [saved] = await matchingValues();
      if (!saved || saved.value !== accountKey) throw failure(502, "Buyer account-key write could not be confirmed by readback.");
      await buyerMapping(accountKey, locationId);
    });
    res.status(200).json({ accountKey, locationId, accountKeyWriteVerified: true,
      pitUnchanged: true, buyerProvisioningVerified: false });
  }

  async function sellerEmailContact(ownerEmail, settings) {
    const sellerToken = String(env.SMARTCOACH_WELCOME_SELLER_TOKEN || "").trim();
    const emailFrom = String(env.SMARTCOACH_WELCOME_FROM_EMAIL || "").trim().toLowerCase();
    if (!sellerToken || !/^[^\s@]+@(?:[a-z0-9-]+\.)*smartcoach-pro\.com$/.test(emailFrom)) {
      throw failure(503, "SMARTCoach Pro seller email connection is not configured. Buyer-account sending is disabled.");
    }
    const sellerDetails = await providerJson(`/locations/${SELLER_LOCATION_ID}`, sellerToken);
    if (!sellerDetails.location || sellerDetails.location.id !== SELLER_LOCATION_ID || sellerDetails.location.companyId !== settings.companyId) {
      throw failure(403, "Welcome sender did not match the SMARTCoach Pro selling location.");
    }
    const contactData = await providerJson(`/contacts/?${new URLSearchParams({ locationId: SELLER_LOCATION_ID, query: ownerEmail, limit: "100" })}`, sellerToken, { headers: { Version: "2023-02-21" } });
    if (!Array.isArray(contactData.contacts)) throw failure(502, "Buyer owner contact could not be verified.");
    const matches = contactData.contacts.filter((contact) => String(contact.email || "").trim().toLowerCase() === ownerEmail);
    if (matches.length > 1) throw failure(409, "Multiple owner contacts matched. Resolve duplicates before sending.");
    let contact = matches[0];
    if (!contact) {
      const created = await providerJson("/contacts/", sellerToken, {
        method: "POST", headers: { "Content-Type": "application/json", Version: "2023-02-21" },
        body: JSON.stringify({ locationId: SELLER_LOCATION_ID, email: ownerEmail, firstName: "SMARTCoach", lastName: "Account Owner", tags: ["smartcoach-account-owner"], source: "SMARTCoach welcome" }),
      });
      contact = created.contact;
    }
    if (!contact || !contact.id || contact.locationId !== SELLER_LOCATION_ID || String(contact.email || "").trim().toLowerCase() !== ownerEmail) {
      throw failure(403, "Welcome contact did not match the selling location and saved owner email.");
    }
    return { sellerToken, emailFrom, contact };
  }

  async function sendBuyerWelcome(req, res) {
    admin(req);
    const settings = cfg();
    if (req.headers.origin !== settings.redirect.origin) throw failure(403, "Send the welcome email from the SMARTCoach admin page.");
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { accountKey, locationId } = body;
    await readConsumerGrant(accountKey, locationId);
    const namespace = `buyerwelcome-${locationId}`;
    const result = await locked(namespace, async () => {
      const account = (await store.loadAccountRecord(accountKey)).record;
      const ownerEmail = String(account.accountOwnerEmail || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) throw failure(422, "Save a valid account-owner email before sending a welcome email.");
      const codes = Array.isArray(account.coachAccessCodes) ? account.coachAccessCodes.filter(Boolean) : [];
      if (!codes.length && !account.accessCode) throw failure(422, "Configure coach access before sending a welcome email.");
      const overviewUrl = `https://app.smartcoach-pro.com/overview.html?account=${encodeURIComponent(accountKey)}`;
      const previous = await load(namespace);
      const sellerCorrectionRequired = !!previous && previous.senderLocationId !== SELLER_LOCATION_ID;
      if (body.preview === true) return { preview: true, ownerEmail, overviewUrl, senderLocationId: SELLER_LOCATION_ID,
        emailFrom: String(env.SMARTCOACH_WELCOME_FROM_EMAIL || "").trim().toLowerCase(), sellerCorrectionRequired,
        previousMessageId: sellerCorrectionRequired ? previous.messageId : undefined };
      if (body.expectedOwnerEmail !== ownerEmail) throw failure(409, "Confirm the saved welcome recipient before sending.");
      if (previous) {
        if (previous.buyerAccountKey !== accountKey || previous.ownerEmail !== ownerEmail) throw failure(409, "Welcome recipient changed. Review the previous delivery before sending again.");
        if (previous.status !== "accepted") throw failure(409, "A welcome send was already attempted. Check HighLevel delivery before retrying.");
        if (!sellerCorrectionRequired) return { ...previous, alreadyAccepted: true };
        if (body.confirmSellerCorrection !== true || !previous.messageId || body.expectedPreviousMessageId !== previous.messageId) {
          throw failure(409, "Confirm the previous buyer-sender message before sending one corrected seller welcome.");
        }
      }
      const { sellerToken, emailFrom, contact } = await sellerEmailContact(ownerEmail, settings);
      await buyerMapping(accountKey, locationId);
      const latest = (await store.loadAccountRecord(accountKey)).record;
      if (String(latest.accountOwnerEmail || "").trim().toLowerCase() !== ownerEmail) throw failure(409, "Welcome recipient changed during verification.");
      // Persist before transmission: a timeout must never automatically send a duplicate email.
      const attempt = { buyerAccountKey: accountKey, locationId, senderLocationId: SELLER_LOCATION_ID, emailFrom, ownerEmail, overviewUrl, status: "attempted", attemptedAt: now() };
      if (sellerCorrectionRequired) attempt.priorDelivery = previous;
      await save(namespace, attempt);
      const sent = await providerJson("/conversations/messages", sellerToken, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "Email", contactId: contact.id, emailTo: ownerEmail, emailFrom, status: "pending",
          subject: "Welcome to SMARTCoach Pro - your sign-in link",
          html: [
            "<p>Welcome to SMARTCoach Pro.</p>",
            "<p>Here are your next steps:</p>",
            "<ol>",
            "<li>Check for your separate <strong>SMARTCoach Access</strong> email. It contains your personal coach access code and phone-app setup instructions. If you have not received it, contact support before trying to sign in.</li>",
            `<li><a href="${overviewUrl}">Open SMART Trak Overview</a> for your account. When prompted, enter the personal coach code provided in your SMARTCoach Access email.</li>`,
            "<li>Once signed in as the head coach, open <strong>Account &gt; Staff Access</strong> to invite your assistant coaches. Each coach should use their own personal code.</li>",
            "</ol>",
            "<p>This welcome email does not create or reset a coach code. Keep your coach-access email, code, and private invite link confidential.</p>",
            '<p>Need help? Email <a href="mailto:support@smartcoach-pro.com">support@smartcoach-pro.com</a>.</p>',
          ].join("") }),
      });
      if (!sent.messageId) throw failure(502, "Welcome email acceptance could not be confirmed. Check HighLevel before retrying.");
      const accepted = { ...attempt, status: "accepted", messageId: sent.messageId, acceptedAt: now() };
      await save(namespace, accepted);
      return accepted;
    });
    if (result.preview) return res.status(200).json(result);
    res.status(200).json({ welcomeAccepted: true, senderLocationId: result.senderLocationId, deliveryVerified: false, buyerProvisioningVerified: false,
      alreadyAccepted: !!result.alreadyAccepted, messageId: result.messageId, overviewUrl: result.overviewUrl });
  }

  async function createBuyerHeadCoach(req, res) {
    admin(req);
    const settings = cfg();
    if (req.headers.origin !== settings.redirect.origin) throw failure(403, "Create buyer access from the SMARTCoach admin page.");
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { accountKey, locationId } = body;
    const coachName = String(body.coachName || "").trim();
    if (!coachName || coachName.length > 120 || /[\r\n]/.test(coachName)) throw failure(422, "Enter a valid head coach name.");
    const verifiedGrant = await readConsumerGrant(accountKey, locationId);
    const namespace = `buyeraccess-${locationId}`;
    const result = await locked(namespace, async () => {
      const account = (await store.loadAccountRecord(accountKey)).record;
      const ownerEmail = String(account.accountOwnerEmail || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) throw failure(422, "Save a valid account-owner email first.");
      if (!accountSetupReady(account, { accountKey, locationId, token: verifiedGrant.access_token }) || !["pro25", "pro100", "pro200", "prounlimited"].includes(account.productPlan)
        || !subscriptionAccessAllowed(account.subscription) || !accountAccessAllowed(normalizeAccountAccess(account))) {
        throw failure(409, "Buyer setup, plan, subscription and account access must be ready first.");
      }
      const previous = await load(namespace);
      if (body.preview === true) return { preview: true, coachName, ownerEmail, productPlan: account.productPlan,
        emailFrom: String(env.SMARTCOACH_WELCOME_FROM_EMAIL || "").trim().toLowerCase(),
        alreadyAccepted: !!previous && previous.status === "accepted", existingStaff: (account.coachStaff || []).length > 0 };
      if (body.confirmCreate !== true || body.expectedOwnerEmail !== ownerEmail || body.expectedProductPlan !== account.productPlan) {
        throw failure(409, "Confirm the saved recipient, plan and head coach creation.");
      }
      if (previous) {
        if (previous.buyerAccountKey !== accountKey || previous.ownerEmail !== ownerEmail || previous.coachName !== coachName
          || previous.status !== "accepted") throw failure(409, "Buyer access was already attempted. Review delivery before retrying.");
        return { ...previous, alreadyAccepted: true };
      }
      if ((account.coachStaff || []).length) throw failure(409, "Existing Staff Access must be reviewed; no codes will be replaced.");
      const { sellerToken, emailFrom, contact } = await sellerEmailContact(ownerEmail, settings);
      await buyerMapping(accountKey, locationId);
      const latest = (await store.loadAccountRecord(accountKey)).record;
      if (JSON.stringify(latest) !== JSON.stringify(account)) throw failure(409, "Buyer setup changed. Preview it again before creating access.");
      const timestamp = new Date(now()).toISOString();
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let code;
      do { code = Array.from(crypto.randomBytes(8), (byte) => alphabet[byte % alphabet.length]).join(""); }
      while ([...(account.coachAccessCodes || []), account.accessCode].includes(code));
      const secret = String(env.SMARTCOACH_SESSION_SECRET || env.SMARTCOACH_ADMIN_SETUP_CODE || "").trim();
      if (!secret) throw failure(503, "Coach access signing configuration is required.");
      const staff = { id: `head-coach-${crypto.randomBytes(8).toString("hex")}`, name: coachName, email: ownerEmail,
        role: "Head Coach", active: true, accessType: "full",
        coachCodeHash: crypto.createHash("sha256").update(`${secret}:staff:${accountKey}:${code}`).digest("hex"),
        coachCodeCreatedAt: timestamp, coachCodeUpdatedAt: timestamp,
        inviteToken: crypto.randomBytes(18).toString("hex"), inviteCreatedAt: timestamp, updatedAt: timestamp };
      const attempt = { buyerAccountKey: accountKey, locationId, ownerEmail, coachName, productPlan: account.productPlan,
        staffId: staff.id, senderLocationId: SELLER_LOCATION_ID, emailFrom, status: "attempted", attemptedAt: now() };
      // A partially saved credential or uncertain send requires support review, never automatic replay.
      await save(namespace, attempt);
      const saved = await store.saveAccountRecord(accountKey, { ...latest, coachStaff: [staff],
        lastStaffSync: { savedAt: timestamp, count: 1 } });
      if (!saved.saved) throw failure(503, "Buyer head coach could not be saved. Review before retrying.");
      const readback = (await store.loadAccountRecord(accountKey)).record;
      if (readback.locationId !== locationId || readback.accountOwnerEmail !== latest.accountOwnerEmail
        || readback.productPlan !== latest.productPlan || readback.coachStaff?.length !== 1
        || readback.coachStaff[0].coachCodeHash !== staff.coachCodeHash || readback.coachStaff[0].inviteToken !== staff.inviteToken) {
        throw failure(503, "Buyer head coach readback failed. Review before retrying.");
      }
      const inviteUrl = `${settings.redirect.origin}/overview.html?${new URLSearchParams({ account: accountKey, invite: staff.inviteToken })}`;
      const sent = await providerJson("/conversations/messages", sellerToken, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "Email", contactId: contact.id, emailTo: ownerEmail, emailFrom, status: "pending",
          subject: "SMARTCoach Access", html: coachAccessEmail(coachName, code, inviteUrl) }) });
      if (!sent.messageId) throw failure(502, "Access email acceptance is uncertain. Check HighLevel before retrying.");
      const accepted = { ...attempt, status: "accepted", messageId: sent.messageId, acceptedAt: now() };
      await save(namespace, accepted);
      return accepted;
    });
    if (result.preview) return res.status(200).json(result);
    res.status(200).json({ headCoachCreated: true, accessEmailAccepted: true, alreadyAccepted: !!result.alreadyAccepted,
      ownerEmail: result.ownerEmail, coachName: result.coachName, productPlan: result.productPlan,
      senderLocationId: result.senderLocationId, deliveryVerified: false, buyerProvisioningVerified: false });
  }

  async function updateBuyerOwnerEmail(req, res) {
    admin(req);
    const settings = cfg();
    if (req.headers.origin !== settings.redirect.origin) throw failure(403, "Update the owner from the SMARTCoach admin page.");
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { accountKey, locationId, expectedOwnerEmail } = body;
    const ownerEmail = String(body.ownerEmail || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) throw failure(422, "Enter a valid account-owner email.");
    await readConsumerGrant(accountKey, locationId);
    await locked(`buyerwelcome-${locationId}`, async () => {
      await buyerMapping(accountKey, locationId);
      const existing = (await store.loadAccountRecord(accountKey)).record;
      if (String(existing.accountOwnerEmail || "").trim().toLowerCase() !== expectedOwnerEmail) {
        throw failure(409, "Saved owner email changed. Preview the recipient again before updating.");
      }
      if (await load(`buyerwelcome-${locationId}`)) throw failure(409, "Review the previous welcome delivery before changing its recipient.");
      const updated = { ...existing, accountOwnerEmail: ownerEmail };
      // Recovery must resolve a new matching contact, not reuse the previous owner's contact ID.
      if (ownerEmail !== expectedOwnerEmail) delete updated.accountOwnerContactId;
      const saved = await store.saveAccountRecord(accountKey, updated);
      if (!saved.saved) throw failure(503, "Owner email could not be saved.");
      const confirmed = (await store.loadAccountRecord(accountKey)).record;
      if (!confirmed || confirmed.accountOwnerEmail !== ownerEmail) throw failure(503, "Owner email readback failed.");
    });
    res.status(200).json({ ownerEmailUpdated: true, ownerEmail, pitUnchanged: true, coachCodesUnchanged: true });
  }

  async function handle(route, req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    const expectedMethod = ["ghl-oauth-start", "ghl-oauth-verify-buyer", "ghl-oauth-verify-write", "ghl-oauth-send-welcome", "ghl-oauth-update-owner-email", "ghl-oauth-create-head-coach", "ghl-oauth-check-subscription", "ghl-oauth-preview-fulfillment", "ghl-oauth-reconcile-checkout", "ghl-oauth-check-state", "ghl-oauth-fulfill-buyer", "ghl-oauth-process-readiness", "ghl-oauth-review-legacy-purchase", "ghl-oauth-recover-legacy-purchase", "ghl-oauth-activate-legacy-buyer"].includes(route) ? "POST" : "GET";
    if (req.method !== expectedMethod) {
      res.setHeader("Allow", expectedMethod);
      return res.status(405).json({ error: "Method not allowed." });
    }
    try {
      if (route === "ghl-oauth-start") return await start(req, res);
      if (route === "ghl-oauth-check-state") return await checkState(req, res);
      if (route === "crm-connect-callback") return await callback(req, res);
      if (route === "ghl-oauth-verify-buyer") return await verifyBuyer(req, res);
      if (route === "ghl-oauth-check-subscription") return await checkBuyerSubscription(req, res);
      if (route === "ghl-oauth-review-legacy-purchase") return await reviewLegacyPurchase(req, res);
      if (route === "ghl-oauth-recover-legacy-purchase") return await recoverLegacyPurchase(req, res);
      if (route === "ghl-oauth-activate-legacy-buyer") return await activateLegacyBuyer(req, res);
      if (route === "ghl-oauth-preview-fulfillment") return await previewBuyerFulfillment(req, res);
      if (route === "ghl-oauth-fulfill-buyer") return await fulfillBuyer(req, res);
      if (route === "ghl-oauth-process-readiness") return await processBuyerReadiness(req, res);
      if (route === "ghl-oauth-readiness-cron") return await readinessCron(req, res);
      if (route === "ghl-oauth-reconcile-checkout") return await reconcileCheckoutIdentity(req, res);
      if (route === "ghl-oauth-verify-write") return await verifyBuyerWrite(req, res);
      if (route === "ghl-oauth-send-welcome") return await sendBuyerWelcome(req, res);
      if (route === "ghl-oauth-create-head-coach") return await createBuyerHeadCoach(req, res);
      if (route === "ghl-oauth-update-owner-email") return await updateBuyerOwnerEmail(req, res);
      return await status(req, res);
    } catch (error) {
      return res.status(error.statusCode || 503).json({ error: error.statusCode ? error.message : "HighLevel connection is unavailable." });
    }
  }

  return { handle, agencyGrant, buyerGrant, readConsumerGrant, approvedBuyerOAuth, dispatchProvisioningEvent };
}

module.exports = { createGhlOAuth, APP_ID, CALLBACK_PATH };
