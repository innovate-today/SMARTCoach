const crypto = require("crypto");
const registry = require("./account-registry");
const { subscriptionAccessAllowed, accountSetupReady, accountAccessAllowed, normalizeAccountAccess } = require("./ghl-account");
const { coachAccessEmail } = require("./coach-access-email");
const { verifySaasCatalogPurchase } = require("./saas-purchase");
const { planBuyerFulfillment } = require("./buyer-fulfillment");

const APP_ID = "6abfe408797ba36482ddbe72";
const STORE_KEY = "ghlconnector";
const CALLBACK_PATH = "/api/smart-trak/crm-connect-callback";
const COOKIE = "__Host-smartcoach-ghl-state";
const STATE_TTL_MS = 10 * 60 * 1000;
const SELLER_LOCATION_ID = "QxwjWekSyUf7sDOFHPB4";

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
    let providerStatus;
    try {
      const response = await fetcher(`https://services.leadconnectorhq.com${path}`, {
        ...options,
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json", Version: "v3", ...options.headers },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) { providerStatus = response.status; throw new Error("Rejected"); }
      return await response.json();
    } catch (_) {
      throw Object.assign(failure(502, "HighLevel buyer verification request failed."), { providerStatus });
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
      if (installed.installToFutureLocations === true || !Array.isArray(installed.items)
        || !installed.items.some((item) => item._id === locationId && item.isInstalled === true)) {
        throw failure(403, "Connector installation was not verified for this buyer location.");
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

  async function readBuyerPurchase(accountKey, locationId) {
    const settings = cfg();
    await buyerMapping(accountKey, locationId);
    const agency = await agencyGrant();
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
    await buyerMapping(accountKey, locationId);
    const account = (await store.loadAccountRecord(accountKey)).record;
    let catalog = await providerJson(`/saas/saas-plan/${encodeURIComponent(details.saasPlanId)}?${new URLSearchParams({ companyId: settings.companyId })}`, agency.access_token);
    if (catalog && Object.prototype.hasOwnProperty.call(catalog, "data")) {
      if (["planId", "companyId", "productId"].some((field) => catalog[field] !== undefined)) {
        throw failure(403, "SaaS plan response has ambiguous identity envelopes. No buyer setup was changed.");
      }
      catalog = catalog.data;
    }
    const purchase = verifySaasCatalogPurchase(details, catalog, settings.companyId, SELLER_LOCATION_ID);
    const savedConfigurationMatches = purchase.purchaseVerified && account.productPlan === purchase.purchasedProductPlan
      && account.subscription?.billingCadence === purchase.purchasedBillingCadence
      && Number(account.subscription?.amount) === Number(purchase.purchasedAmount);
    return { account, details, status, ids, purchase, savedConfigurationMatches };
  }

  const checkoutKey = email => `checkout-${crypto.createHash("sha256").update(email).digest("hex").slice(0, 32)}`;
  const snapshotHash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
  const normalizedEmail = value => String(value || "").trim().toLowerCase();

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
    let pendingMatched = checkoutMatches(pending, ownerEmail, locationId, purchase);
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
    const coreOAuthWriteRolloutEnabled = String(env.SMARTCOACH_GHL_OAUTH_WRITE_ACCOUNTS || "").split(/[,\s]+/).includes(accountKey);
    if (!coreOAuthWriteRolloutEnabled) blockers.push("Core CRM OAuth writes are implemented but not enabled for this buyer; manual PIT setup remains in use.");
    const stagedFulfillment = planBuyerFulfillment({ accountKey, locationId, ...purchase, savedConfigurationMatches,
      pendingCheckoutMatched: pendingMatched, providerSubscriptionStatus: status,
      subscriptionStatusMatched: account.subscription?.status === status, buyerOAuthVerified, sellerSenderVerified,
      existingAccessPreserved, existingAccessAbsent: !previous && staff.length === 0,
      accountAccessAllowed: accountAccessAllowed(normalizeAccountAccess(account)), coreOAuthWriteRolloutEnabled });
    blockers.push("Automatic new-buyer execution is disabled; setup and seller-email step adapters still require integration and controlled verification.");
    res.status(200).json({ accountKey, locationId, ...purchase, providerSubscriptionStatus: status,
      savedConfigurationMatches, pendingCheckoutMatched: pendingMatched, checkoutIdentityReconciled, buyerOAuthVerified, sellerSenderVerified,
      existingAccessPreserved, nextAccessAction: existingAccessPreserved ? "preserve_existing_access" : "support_review_required",
      coreOAuthWritesImplemented: true, remainingOAuthPathsImplemented: true, coreOAuthWriteRolloutEnabled,
      stagedFulfillment, automaticFulfillmentReady: false, previewOnly: true, accountUnchanged: true, emailSent: false, blockers });
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
    const expectedMethod = ["ghl-oauth-start", "ghl-oauth-verify-buyer", "ghl-oauth-verify-write", "ghl-oauth-send-welcome", "ghl-oauth-update-owner-email", "ghl-oauth-create-head-coach", "ghl-oauth-check-subscription", "ghl-oauth-preview-fulfillment", "ghl-oauth-reconcile-checkout", "ghl-oauth-check-state"].includes(route) ? "POST" : "GET";
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
      if (route === "ghl-oauth-preview-fulfillment") return await previewBuyerFulfillment(req, res);
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

  return { handle, agencyGrant, buyerGrant, readConsumerGrant };
}

module.exports = { createGhlOAuth, APP_ID, CALLBACK_PATH };
