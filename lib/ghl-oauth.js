const crypto = require("crypto");
const registry = require("./account-registry");

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

  async function callback(req, res) {
    const settings = cfg();
    const state = req.query && req.query.state;
    const code = req.query && req.query.code;
    const cookies = String(req.headers.cookie || "").split(";").map((item) => item.trim());
    const cookie = cookies.find((item) => item.startsWith(`${COOKIE}=`));
    if (typeof state !== "string" || !/^[a-f0-9]{64}$/.test(state) || !equal(cookie && cookie.slice(COOKIE.length + 1), state)) {
      throw failure(400, "HighLevel authorization state was not accepted. Start a new connection.");
    }
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
    try {
      const response = await fetcher(`https://services.leadconnectorhq.com${path}`, {
        ...options,
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json", Version: "v3", ...options.headers },
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error("Rejected");
      return await response.json();
    } catch (_) {
      throw failure(502, "HighLevel buyer verification request failed.");
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
      if (!grant || grant.expiresAt <= now() + 120000) {
        // Reissue through the verified agency grant rather than consume a location refresh token.
        grant = await providerJson("/oauth/location-token", agency.access_token, {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ companyId: settings.companyId, locationId }).toString(),
        });
        const scopes = new Set(String(grant.scope || "").split(/\s+/).filter(Boolean));
        if (grant.locationId !== locationId || grant.token_type !== "Bearer" || !grant.access_token
          || (grant.companyId && grant.companyId !== settings.companyId)
          || (grant.appId && grant.appId !== APP_ID) || (grant.versionId && grant.versionId !== APP_ID)
          || !Number.isFinite(Number(grant.expires_in)) || Number(grant.expires_in) <= 120
          || settings.scopes.filter((scope) => !scope.startsWith("oauth.")).some((scope) => !scopes.has(scope))
          || [...scopes].some((scope) => !settings.scopes.includes(scope))) {
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

  async function sendBuyerWelcome(req, res) {
    admin(req);
    const settings = cfg();
    if (req.headers.origin !== settings.redirect.origin) throw failure(403, "Send the welcome email from the SMARTCoach admin page.");
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { accountKey, locationId } = body;
    const grant = await readConsumerGrant(accountKey, locationId);
    const required = ["contacts.readonly", "contacts.write", "conversations/message.write"];
    const scopes = String(grant.scope || "").split(/\s+/);
    if (required.some((scope) => !settings.scopes.includes(scope) || !scopes.includes(scope))) {
      throw failure(403, "Buyer contact and email permissions are required.");
    }
    const namespace = `buyerwelcome-${locationId}`;
    const result = await locked(namespace, async () => {
      const account = (await store.loadAccountRecord(accountKey)).record;
      const ownerEmail = String(account.accountOwnerEmail || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) throw failure(422, "Save a valid account-owner email before sending a welcome email.");
      const codes = Array.isArray(account.coachAccessCodes) ? account.coachAccessCodes.filter(Boolean) : [];
      if (!codes.length && !account.accessCode) throw failure(422, "Configure coach access before sending a welcome email.");
      const overviewUrl = `https://app.smartcoach-pro.com/overview.html?account=${encodeURIComponent(accountKey)}`;
      if (body.preview === true) return { preview: true, ownerEmail, overviewUrl };
      if (body.expectedOwnerEmail !== ownerEmail) throw failure(409, "Confirm the saved welcome recipient before sending.");
      const previous = await load(namespace);
      if (previous) {
        if (previous.buyerAccountKey !== accountKey || previous.ownerEmail !== ownerEmail) throw failure(409, "Welcome recipient changed. Review the previous delivery before sending again.");
        if (previous.status !== "accepted") throw failure(409, "A welcome send was already attempted. Check HighLevel delivery before retrying.");
        return { ...previous, alreadyAccepted: true };
      }
      const contactData = await providerJson(`/contacts/?${new URLSearchParams({ locationId, query: ownerEmail, limit: "100" })}`, grant.access_token, { headers: { Version: "2023-02-21" } });
      if (!Array.isArray(contactData.contacts)) throw failure(502, "Buyer owner contact could not be verified.");
      const matches = contactData.contacts.filter((contact) => String(contact.email || "").trim().toLowerCase() === ownerEmail);
      if (matches.length > 1) throw failure(409, "Multiple owner contacts matched. Resolve duplicates before sending.");
      let contact = matches[0];
      if (!contact) {
        const created = await providerJson("/contacts/", grant.access_token, {
          method: "POST", headers: { "Content-Type": "application/json", Version: "2023-02-21" },
          body: JSON.stringify({ locationId, email: ownerEmail, firstName: "SMARTCoach", lastName: "Account Owner", tags: ["smartcoach-account-owner"], source: "SMARTCoach welcome" }),
        });
        contact = created.contact;
      }
      if (!contact || !contact.id || contact.locationId !== locationId || String(contact.email || "").trim().toLowerCase() !== ownerEmail) {
        throw failure(403, "Welcome contact did not match the saved buyer location and owner email.");
      }
      await buyerMapping(accountKey, locationId);
      const latest = (await store.loadAccountRecord(accountKey)).record;
      if (String(latest.accountOwnerEmail || "").trim().toLowerCase() !== ownerEmail) throw failure(409, "Welcome recipient changed during verification.");
      // Persist before transmission: a timeout must never automatically send a duplicate email.
      const attempt = { buyerAccountKey: accountKey, locationId, ownerEmail, overviewUrl, status: "attempted", attemptedAt: now() };
      await save(namespace, attempt);
      const sent = await providerJson("/conversations/messages", grant.access_token, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "Email", contactId: contact.id, emailTo: ownerEmail, status: "pending",
          subject: "Welcome to SMARTCoach Pro - your sign-in link",
          html: `<p>Welcome to SMARTCoach Pro.</p><p><a href="${overviewUrl}">Open SMART Trak Overview</a></p><p>Sign in with your existing coach access code. This email does not change your code.</p><p>For help, contact support@smartcoach-pro.com.</p>` }),
      });
      if (!sent.messageId) throw failure(502, "Welcome email acceptance could not be confirmed. Check HighLevel before retrying.");
      const accepted = { ...attempt, status: "accepted", messageId: sent.messageId, acceptedAt: now() };
      await save(namespace, accepted);
      return accepted;
    });
    if (result.preview) return res.status(200).json(result);
    res.status(200).json({ welcomeAccepted: true, deliveryVerified: false, buyerProvisioningVerified: false,
      alreadyAccepted: !!result.alreadyAccepted, messageId: result.messageId, overviewUrl: result.overviewUrl });
  }

  async function handle(route, req, res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    const expectedMethod = ["ghl-oauth-start", "ghl-oauth-verify-buyer", "ghl-oauth-verify-write", "ghl-oauth-send-welcome"].includes(route) ? "POST" : "GET";
    if (req.method !== expectedMethod) {
      res.setHeader("Allow", expectedMethod);
      return res.status(405).json({ error: "Method not allowed." });
    }
    try {
      if (route === "ghl-oauth-start") return await start(req, res);
      if (route === "crm-connect-callback") return await callback(req, res);
      if (route === "ghl-oauth-verify-buyer") return await verifyBuyer(req, res);
      if (route === "ghl-oauth-verify-write") return await verifyBuyerWrite(req, res);
      if (route === "ghl-oauth-send-welcome") return await sendBuyerWelcome(req, res);
      return await status(req, res);
    } catch (error) {
      return res.status(error.statusCode || 503).json({ error: error.statusCode ? error.message : "HighLevel connection is unavailable." });
    }
  }

  return { handle, agencyGrant, buyerGrant, readConsumerGrant };
}

module.exports = { createGhlOAuth, APP_ID, CALLBACK_PATH };
