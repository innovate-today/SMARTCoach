const crypto = require("crypto");

const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const GHL_ACCOUNT_KEY_CUSTOM_VALUE_NAME = "account_key";

const handlers = {
  "athlete-best": require("../ghl/athlete-best"),
  "athlete-calendar": require("../../lib/athlete-calendar"),
  "athlete-profile": require("../ghl/athlete-profile"),
  athletes: require("../ghl/athletes"),
  dashboard: require("../ghl/dashboard"),
  groups: require("../../lib/ghl-groups"),
  "manual-mileage": require("../ghl/manual-mileage"),
  correction: require("../ghl/correction"),
  "meet-result": require("../ghl/meet-result"),
  meets: require("../ghl/meets"),
  "sync-diagnostics": require("../../lib/sync-diagnostics"),
  "sync-session": require("../ghl/sync-session"),
  "training-plan": require("../ghl/training-plan"),
};
const {
  getGhlContext,
  requireProPlan,
  coachCodeAllowed,
  createCoachSession,
  coachSessionFromRequest,
  coachSessionSecretSource,
  coachSessionTtlSeconds,
  subscriptionAccessAllowed,
  subscriptionBlockedMessage,
} = require("../../lib/ghl-account");
const { registryConfigured, registryHealth, saveAccountRecord, loadAccountRecord, listAccountRecords, recordCoachDeviceSession, loadCoachDeviceUsage, saveAttendanceRecords, loadAttendanceRecords } = require("../../lib/account-registry");
const { checkSessionAttempt, recordSessionFailure, clearSessionFailures, requestIp } = require("../../lib/session-rate-limit");
const {
  normalizeProductPlan: normalizePlanKey,
  planDefinition,
  isProPlan,
  suggestedSubscriptionAmount: planSubscriptionAmount,
} = require("../../lib/smartcoach-plans");

module.exports = async function handler(req, res) {
  setSmartTrakSecurityHeaders(res);
  const route = Array.isArray(req.query.route) ? req.query.route[0] : req.query.route;
  const selected = handlers[route];

  if (route === "account-status") {
    return accountStatus(req, res);
  }

  if (route === "account-setup") {
    return accountSetup(req, res);
  }

  if (route === "account-automation") {
    return accountAutomation(req, res);
  }

  if (route === "account-automation-dry-run") {
    return accountAutomationDryRun(req, res);
  }

  if (route === "account-automation-health") {
    return accountAutomationHealth(req, res);
  }

  if (route === "account-stripe-webhook") {
    return accountStripeWebhook(req, res);
  }

  if (route === "account-registry") {
    return accountRegistry(req, res);
  }

  if (route === "account-session") {
    return accountSession(req, res);
  }

  if (route === "account-code-reset") {
    return accountCodeReset(req, res);
  }

  if (route === "account-staff") {
    return accountStaff(req, res);
  }

  if (route === "attendance") {
    await attachRegistryAccount(req);
    if (!requireProPlan(req, res)) return;
    await recordRequestCoachDevice(req).catch(() => {});
    return accountAttendance(req, res);
  }

  if (route === "docu-trak") {
    await attachRegistryAccount(req);
    if (!requireProPlan(req, res)) return;
    return accountDocuTrak(req, res);
  }

  if (route === "equipment-trak") {
    await attachRegistryAccount(req);
    if (!requireProPlan(req, res)) return;
    return accountEquipmentTrak(req, res);
  }

  if (!selected) {
    res.status(404).json({ error: "SMART Trak endpoint not found." });
    return;
  }

  if (route === "athlete-calendar") {
    return selected(req, res);
  }

  await attachRegistryAccount(req);
  if (!requireProPlan(req, res)) return;
  if (["sync-session", "meet-result", "manual-mileage", "correction"].includes(route)) {
    await recordRequestCoachDevice(req).catch(() => {});
  }

  return selected(req, res);
};

async function recordRequestCoachDevice(req) {
  const { accountKey, coachCodeVersion } = getGhlContext(req);
  const deviceId = cleanSetupText(headerValue(req, "x-smartcoach-device-id"));
  if (!deviceId) return;
  const session = coachSessionFromRequest(req, accountKey);
  const validSession = coachSessionVersionAllowed(session, coachCodeVersion) ? session : null;
  await recordCoachDeviceSession(accountKey, {
    deviceId,
    deviceLabel: cleanSetupText(headerValue(req, "x-smartcoach-device-label")),
    coachId: cleanSetupText(headerValue(req, "x-smartcoach-coach-id")),
    coachName: cleanSetupText(headerValue(req, "x-smartcoach-coach-name")),
    userAgent: headerValue(req, "user-agent"),
    coachIndex: validSession && Number(validSession.coachIndex) || 0,
  });
}

async function accountAttendance(req, res) {
  setAttendanceCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const { accountKey } = getGhlContext(req);

  try {
    if (req.method === "GET") {
      const attendance = await loadAttendanceRecords(accountKey, {
        start: firstQueryValue(req.query && req.query.start),
        end: firstQueryValue(req.query && req.query.end),
        group: firstQueryValue(req.query && req.query.group),
        groupId: firstQueryValue(req.query && req.query.groupId),
        athleteId: firstQueryValue(req.query && (req.query.athleteId || req.query.contactId)),
        athleteName: firstQueryValue(req.query && req.query.athleteName),
        status: firstQueryValue(req.query && req.query.status),
      });
      res.status(200).json({ success: true, attendance, count: attendance.length });
      return;
    }

    if (req.method === "POST" || req.method === "PATCH") {
      const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const records = attendanceRecordsFromPayload(payload);
      if (!records.length) {
        res.status(400).json({ error: "No attendance records were provided." });
        return;
      }
      const saved = await saveAttendanceRecords(accountKey, records);
      res.status(200).json({ success: !!saved.saved, attendance: records, ...saved });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Attendance save failed." });
  }
}

function attendanceRecordsFromPayload(payload) {
  if (Array.isArray(payload && payload.records)) return payload.records;
  const date = cleanSetupText(payload && payload.date).slice(0, 10);
  const groupId = cleanSetupText(payload && payload.groupId);
  const groupName = cleanSetupText(payload && payload.groupName);
  const runners = Array.isArray(payload && payload.runners) ? payload.runners : [];
  const runnerByKey = {};
  runners.forEach((runner) => {
    const item = runner || {};
    [item.runnerId, item.id, item.contactId, item.smartcoachAthleteId, item.name].map(cleanSetupText).filter(Boolean).forEach((key) => {
      runnerByKey[String(key)] = item;
    });
  });
  const out = [];
  (Array.isArray(payload && payload.checkpoints) ? payload.checkpoints : []).forEach((checkpoint, cpIndex) => {
    const cp = checkpoint || {};
    const checkpointId = cleanSetupText(cp.id) || `checkpoint_${cpIndex + 1}`;
    const checkpointName = cleanSetupText(cp.name) || (cpIndex ? `Checkpoint ${cpIndex + 1}` : "Practice Start");
    const records = cp.records && typeof cp.records === "object" ? cp.records : {};
    Object.keys(records).forEach((runnerKey) => {
      const row = records[runnerKey] || {};
      const runner = runnerByKey[runnerKey] || row || {};
      const status = cleanSetupText(row.status).toLowerCase();
      if (!status) return;
      out.push({
        date,
        groupId,
        groupName,
        checkpointId,
        checkpointName,
        athleteId: cleanSetupText(runner.contactId || runner.smartcoachAthleteId || runner.id || runner.runnerId || runnerKey),
        contactId: cleanSetupText(runner.contactId),
        smartcoachAthleteId: cleanSetupText(runner.smartcoachAthleteId),
        athleteName: cleanSetupText(runner.name || row.athleteName),
        status,
        note: cleanSetupText(row.note),
        source: cleanSetupText(row.source) || "coach",
        coachId: cleanSetupText(row.coachId || payload.coachId),
        coachName: cleanSetupText(row.coachName || payload.coachName),
        updatedAt: cleanSetupText(row.updatedAt) || new Date().toISOString(),
      });
    });
  });
  return out;
}

function setAttendanceCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-SMARTCoach-Account, X-SMARTCoach-Session, X-SMARTCoach-Access-Code, X-SMARTCoach-Device-Id, X-SMARTCoach-Device-Label");
}

async function accountDocuTrak(req, res) {
  setDocuTrakCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const { accountKey } = getGhlContext(req);

  try {
    if (req.method === "GET") {
      const existing = await loadAccountRecord(accountKey);
      res.status(200).json({ success: true, ...normalizeDocuTrak(existing && existing.record && existing.record.docuTrak) });
      return;
    }

    if (req.method !== "POST" && req.method !== "PATCH") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const existing = await loadAccountRecord(accountKey);
    if (!existing.configured || !existing.found || !existing.record) {
      res.status(404).json({ error: "Account registry record was not found." });
      return;
    }

    const current = normalizeDocuTrak(existing.record.docuTrak);
    const action = cleanSetupText(payload.action || payload.mode).toLowerCase();
    if (action === "save-items") {
      current.items = normalizeDocuItems(payload.items);
    } else if (action === "save-athlete") {
      const athleteId = cleanSetupText(payload.athleteId || payload.contactId);
      const athleteName = cleanSetupText(payload.athleteName || payload.name);
      const athleteKey = docuAthleteKey(athleteId, athleteName);
      if (!athleteKey) throw httpError(400, "Athlete is required.");
      current.records[athleteKey] = {
        athleteId,
        athleteName,
        updatedAt: new Date().toISOString(),
        items: normalizeDocuAthleteItems(payload.items || payload.records),
      };
    } else {
      throw httpError(400, "Docu Trak action is required.");
    }

    await saveAccountRecord(accountKey, {
      ...existing.record,
      docuTrak: current,
      lastDocuTrakSync: { savedAt: new Date().toISOString(), action },
    });
    res.status(200).json({ success: true, ...current });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Docu Trak save failed." });
  }
}

function normalizeDocuTrak(source) {
  const value = source && typeof source === "object" ? source : {};
  return {
    items: normalizeDocuItems(value.items),
    records: normalizeDocuRecords(value.records),
  };
}

function normalizeDocuItems(items) {
  const source = Array.isArray(items) && items.length ? items : defaultDocuItems();
  const seen = new Set();
  return source.map((item, index) => {
    const raw = typeof item === "string" ? { name: item } : item || {};
    const name = cleanSetupText(raw.name || raw.label || raw.title);
    if (!name) return null;
    const id = normalizeDocuItemId(raw.id || name || `item_${index + 1}`);
    if (!id || seen.has(id)) return null;
    seen.add(id);
    return {
      id,
      name,
      required: raw.required === false ? false : true,
      active: raw.active === false ? false : true,
      dueDate: cleanSetupText(raw.dueDate).slice(0, 10),
    };
  }).filter(Boolean);
}

function defaultDocuItems() {
  return [
    { id: "physical", name: "Physical", required: true, active: true },
    { id: "goals_form", name: "Goals Form", required: true, active: true },
    { id: "guidelines_expectations", name: "Guidelines / Expectations", required: true, active: true },
  ];
}

function normalizeDocuRecords(records) {
  const out = {};
  const source = records && typeof records === "object" ? records : {};
  Object.keys(source).forEach((key) => {
    const row = source[key] || {};
    const athleteKey = normalizeDocuRecordKey(key);
    if (!athleteKey) return;
    out[athleteKey] = {
      athleteId: cleanSetupText(row.athleteId),
      athleteName: cleanSetupText(row.athleteName),
      updatedAt: cleanSetupText(row.updatedAt),
      items: normalizeDocuAthleteItems(row.items),
    };
  });
  return out;
}

function normalizeDocuAthleteItems(items) {
  const out = {};
  const source = items && typeof items === "object" ? items : {};
  Object.keys(source).forEach((id) => {
    const itemId = normalizeDocuItemId(id);
    if (!itemId) return;
    const item = source[id] || {};
    out[itemId] = {
      status: normalizeDocuStatus(item.status),
      receivedDate: cleanSetupText(item.receivedDate || item.date).slice(0, 10),
      note: cleanSetupText(item.note || item.notes).slice(0, 800),
      updatedAt: cleanSetupText(item.updatedAt) || new Date().toISOString(),
    };
  });
  return out;
}

function normalizeDocuStatus(value) {
  const status = cleanSetupText(value).toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_+|_+$/g, "");
  if (["complete", "missing", "waived", "not_required"].includes(status)) return status;
  return "missing";
}

function docuAthleteKey(athleteId, athleteName) {
  return normalizeDocuRecordKey(athleteId || athleteName);
}

function normalizeDocuRecordKey(value) {
  return cleanSetupText(value).toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120);
}

function normalizeDocuItemId(value) {
  return cleanSetupText(value).toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
}

function setDocuTrakCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-SMARTCoach-Account, X-SMARTCoach-Session, X-SMARTCoach-Access-Code");
}

async function accountEquipmentTrak(req, res) {
  setDocuTrakCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const { accountKey } = getGhlContext(req);

  try {
    if (req.method === "GET") {
      const existing = await loadAccountRecord(accountKey);
      res.status(200).json({ success: true, ...normalizeEquipmentTrak(existing && existing.record && existing.record.equipmentTrak) });
      return;
    }

    if (req.method !== "POST" && req.method !== "PATCH") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const existing = await loadAccountRecord(accountKey);
    if (!existing.configured || !existing.found || !existing.record) {
      res.status(404).json({ error: "Account registry record was not found." });
      return;
    }

    const current = normalizeEquipmentTrak(existing.record.equipmentTrak);
    const action = cleanSetupText(payload.action || payload.mode).toLowerCase();
    if (action === "save-items") {
      current.items = normalizeEquipmentItems(payload.items);
    } else if (action === "save-inventory") {
      current.inventory = normalizeEquipmentInventory(payload.inventory || payload.items);
    } else if (action === "save-athlete") {
      const athleteId = cleanSetupText(payload.athleteId || payload.contactId);
      const contactId = cleanSetupText(payload.contactId);
      const smartcoachAthleteId = cleanSetupText(payload.smartcoachAthleteId);
      const athleteName = cleanSetupText(payload.athleteName || payload.name);
      const athleteKey = docuAthleteKey(athleteId, athleteName);
      if (!athleteKey) throw httpError(400, "Athlete is required.");
      const previous = current.records[athleteKey];
      equipmentAthleteAliasKeys({ athleteId, contactId, smartcoachAthleteId, athleteName }).forEach((key) => {
        if (key && key !== athleteKey) delete current.records[key];
      });
      current.records[athleteKey] = {
        athleteId,
        contactId,
        smartcoachAthleteId,
        athleteName,
        updatedAt: new Date().toISOString(),
        items: normalizeEquipmentAthleteItems(payload.items || payload.records),
      };
      const duplicate = duplicateIssuedEquipment(current.records);
      if (duplicate) {
        if (previous) current.records[athleteKey] = previous;
        else delete current.records[athleteKey];
        throw httpError(409, `${duplicate.itemId} #${duplicate.number} is already issued to ${duplicate.firstAthlete}.`);
      }
    } else {
      throw httpError(400, "Equipment Trak action is required.");
    }

    await saveAccountRecord(accountKey, {
      ...existing.record,
      equipmentTrak: current,
      lastEquipmentTrakSync: { savedAt: new Date().toISOString(), action },
    });
    res.status(200).json({ success: true, ...current });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Equipment Trak save failed." });
  }
}

function normalizeEquipmentTrak(source) {
  const value = source && typeof source === "object" ? source : {};
  return {
    items: normalizeEquipmentItems(value.items),
    records: normalizeEquipmentRecords(value.records),
    inventory: normalizeEquipmentInventory(value.inventory),
  };
}

function normalizeEquipmentItems(items) {
  const source = Array.isArray(items) && items.length ? items : defaultEquipmentItems();
  const seen = new Set();
  return source.map((item, index) => {
    const raw = typeof item === "string" ? { name: item } : item || {};
    const name = cleanSetupText(raw.name || raw.label || raw.title);
    if (!name) return null;
    const id = normalizeDocuItemId(raw.id || name || `item_${index + 1}`);
    if (!id || seen.has(id)) return null;
    seen.add(id);
    return {
      id,
      name,
      active: raw.active === false ? false : true,
      trackSize: raw.trackSize === false ? false : true,
      trackNumber: raw.trackNumber === false ? false : true,
    };
  }).filter(Boolean);
}

function defaultEquipmentItems() {
  return [
    { id: "uniform_top", name: "Uniform Top", active: true, trackSize: true, trackNumber: false },
    { id: "uniform_shorts", name: "Uniform Shorts", active: true, trackSize: true, trackNumber: false },
    { id: "warmup", name: "Warmup", active: true, trackSize: true, trackNumber: true },
    { id: "watch", name: "Watch", active: true, trackSize: false, trackNumber: true },
    { id: "stretch_strap", name: "Stretch Strap", active: true, trackSize: false, trackNumber: false },
  ];
}

function equipmentAthleteAliasKeys(row) {
  const source = row || {};
  return [
    source.athleteId,
    source.contactId,
    source.smartcoachAthleteId,
    source.athleteName,
    source.name,
  ].map(normalizeDocuRecordKey).filter(Boolean);
}

function normalizeEquipmentRecords(records) {
  const out = {};
  const source = records && typeof records === "object" ? records : {};
  Object.keys(source).forEach((key) => {
    const row = source[key] || {};
    const athleteKey = normalizeDocuRecordKey(key);
    if (!athleteKey) return;
    out[athleteKey] = {
      athleteId: cleanSetupText(row.athleteId),
      contactId: cleanSetupText(row.contactId),
      smartcoachAthleteId: cleanSetupText(row.smartcoachAthleteId),
      athleteName: cleanSetupText(row.athleteName),
      updatedAt: cleanSetupText(row.updatedAt),
      items: normalizeEquipmentAthleteItems(row.items),
    };
  });
  return out;
}

function normalizeEquipmentAthleteItems(items) {
  const out = {};
  const source = items && typeof items === "object" ? items : {};
  Object.keys(source).forEach((id) => {
    const itemId = normalizeDocuItemId(id);
    if (!itemId) return;
    const item = source[id] || {};
    out[itemId] = {
      status: normalizeEquipmentStatus(item.status),
      size: cleanSetupText(item.size).slice(0, 80),
      number: cleanSetupText(item.number || item.itemNumber || item.inventoryId).slice(0, 80),
      issuedDate: cleanSetupText(item.issuedDate || item.date).slice(0, 10),
      returnedDate: cleanSetupText(item.returnedDate || item.returnDate).slice(0, 10),
      note: cleanSetupText(item.note || item.notes).slice(0, 800),
      updatedAt: cleanSetupText(item.updatedAt) || new Date().toISOString(),
    };
  });
  return out;
}

function normalizeEquipmentInventory(inventory) {
  const source = Array.isArray(inventory) ? inventory : [];
  return source.map((entry, index) => {
    const raw = entry || {};
    const itemId = normalizeDocuItemId(raw.itemId || raw.equipmentItemId || raw.item || raw.itemName);
    const itemName = cleanSetupText(raw.itemName || raw.name || raw.item).slice(0, 120);
    if (!itemId && !itemName) return null;
    const trackingType = normalizeInventoryTrackingType(raw.trackingType || raw.type);
    const quantity = Math.max(0, parseInt(raw.quantity, 10) || 0);
    const startNumber = cleanSetupText(raw.startNumber || raw.start || raw.from).slice(0, 40);
    const endNumber = cleanSetupText(raw.endNumber || raw.end || raw.to).slice(0, 40);
    return {
      id: normalizeDocuItemId(raw.id || `${itemId || itemName}_${index + 1}`) || `inventory_${index + 1}`,
      program: cleanSetupText(raw.program || raw.sport || raw.season).slice(0, 80),
      group: cleanSetupText(raw.group || raw.team || raw.gender).slice(0, 80),
      itemId,
      itemName,
      trackingType,
      size: cleanSetupText(raw.size).slice(0, 80),
      startNumber,
      endNumber,
      quantity: trackingType === "numbered" ? inventoryRangeCount(startNumber, endNumber) : quantity,
      note: cleanSetupText(raw.note || raw.notes).slice(0, 800),
      active: raw.active === false ? false : true,
      updatedAt: cleanSetupText(raw.updatedAt) || new Date().toISOString(),
    };
  }).filter(Boolean);
}

function normalizeInventoryTrackingType(value) {
  const type = cleanSetupText(value).toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_+|_+$/g, "");
  if (["numbered", "size_quantity", "count"].includes(type)) return type;
  return "numbered";
}

function inventoryRangeCount(start, end) {
  const a = parseInt(cleanSetupText(start), 10);
  const b = parseInt(cleanSetupText(end), 10);
  if (Number.isFinite(a) && Number.isFinite(b) && b >= a) return b - a + 1;
  return start ? 1 : 0;
}

function duplicateIssuedEquipment(records) {
  const seen = {};
  Object.keys(records || {}).forEach((athleteKey) => {
    const record = records[athleteKey] || {};
    Object.keys(record.items || {}).forEach((itemId) => {
      const item = record.items[itemId] || {};
      if (item.status !== "issued" || !item.number) return;
      const key = `${normalizeDocuItemId(itemId)}::${cleanSetupText(item.number).toLowerCase()}`;
      if (!seen[key]) {
        seen[key] = { itemId, number: item.number, firstAthlete: record.athleteName || athleteKey };
      } else if (!seen[key].duplicate) {
        seen[key].duplicate = true;
      }
    });
  });
  return Object.keys(seen).map((key) => seen[key]).find((row) => row.duplicate) || null;
}

function normalizeEquipmentStatus(value) {
  const status = cleanSetupText(value).toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_+|_+$/g, "");
  if (["not_issued", "issued", "returned", "lost_damaged", "not_required"].includes(status)) return status;
  return "not_issued";
}

async function accountStatus(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const registry = await attachRegistryAccount(req);
  const { accountKey, token, locationId, productPlan, productPlanLabel, activeAthleteLimit, accessCode, coachSeats, coachAccessCodes, coachCodeVersion, requireCoachAccess, subscription, logoUrl } = getGhlContext(req);
  const coachSession = coachSessionFromRequest(req, accountKey);
  const currentCoachSession = coachSessionVersionAllowed(coachSession, coachCodeVersion) ? coachSession : null;
  const proPlan = isProPlan(productPlan);
  const essentialSessionActive = productPlan === "essential" ? essentialSessionMatches(coachSession, registry.record) : false;
  const suffix = accountKey.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const tokenKey = accountKey === "default" ? "GHL_PRIVATE_INTEGRATION_TOKEN" : `GHL_PRIVATE_INTEGRATION_TOKEN_${suffix}`;
  const locationKey = accountKey === "default" ? "GHL_LOCATION_ID" : `GHL_LOCATION_ID_${suffix}`;
  const coachAccessKey = accountKey === "default" ? "SMARTCOACH_COACH_ACCESS_CODES" : `SMARTCOACH_COACH_ACCESS_CODES_${suffix}`;
  const configuredCoachCodes = coachAccessCodes && coachAccessCodes.length ? coachAccessCodes.length : accessCode ? 1 : 0;
  const allowedCodes = coachAccessCodes && coachAccessCodes.length ? coachAccessCodes : accessCode ? [accessCode] : [];
  const providedAccessCode = String(headerValue(req, "x-smartcoach-access-code") || "").trim();
  const accessCodeAccepted = !!(providedAccessCode && allowedCodes.some((code) => safeEqual(providedAccessCode, code)));
  const crmConfigured = !!(token && locationId);
  const coachAccessConfigured = (!requireCoachAccess && proPlan) || configuredCoachCodes > 0;
  const configured = proPlan ? (crmConfigured && coachAccessConfigured) : coachAccessConfigured;
  const subscriptionAllowed = subscriptionAccessAllowed(subscription);
  const subscriptionBlockedReason = subscriptionAllowed ? "" : subscriptionBlockedMessage(subscription);
  const coachAccessRequired = !proPlan || configuredCoachCodes > 0 || !!requireCoachAccess;
  const coachAccessUnlocked = !coachAccessRequired || (proPlan ? !!currentCoachSession : essentialSessionActive) || accessCodeAccepted;
  const deviceAccessReady = configured && subscriptionAllowed && coachAccessUnlocked;
  if (deviceAccessReady) await recordRequestCoachDevice(req).catch(() => {});
  const coachDeviceUsage = configured ? await loadCoachDeviceUsage(accountKey) : undefined;
  const coachStaff = normalizeCoachStaff(registry.record && registry.record.coachStaff);
  const missing = [];
  if (proPlan && !token) missing.push({ label: "Private integration token", key: tokenKey });
  if (proPlan && !locationId) missing.push({ label: "Location ID", key: locationKey });
  if (requireCoachAccess && configuredCoachCodes < 1) missing.push({ label: "Coach access codes", key: coachAccessKey });
  res.status(configured ? 200 : 404).json({
    success: configured && subscriptionAllowed,
    accountKey,
    productPlan,
    productPlanLabel,
    activeAthleteLimit,
    configured,
    setupReady: configured,
    accessReady: configured && subscriptionAllowed,
    deviceAccessReady,
    crmConfigured,
    coachSeats,
    coachAccessCodesConfigured: configuredCoachCodes,
    coach: currentCoachSession ? {
      index: Number(currentCoachSession.coachIndex) || 0,
      label: `Coach ${(Number(currentCoachSession.coachIndex) || 0) + 1}`,
      parentEmailAllowed: parentEmailFeatureReleased() && !!currentCoachSession.parentEmailAllowed,
    } : null,
    coachSessionActive: proPlan ? !!currentCoachSession : essentialSessionActive,
    coachDeviceUsage,
    coachStaff,
    coachAccessUnlocked,
    coachAccessCodeAccepted: accessCodeAccepted,
    parentEmailToolsAllowed: parentEmailFeatureReleased() && !!(currentCoachSession && currentCoachSession.parentEmailAllowed),
    accessCodeRequired: coachAccessRequired,
    coachAccessRequired,
    accessCodeMissing: !!requireCoachAccess && configuredCoachCodes < 1,
    subscription: publicSubscriptionSummary(subscription),
    subscriptionAccessAllowed: subscriptionAllowed,
    subscriptionBlockedReason,
    registry: {
      configured: !!registry.configured,
      found: !!registry.found,
      source: registry.found ? "registry" : "environment",
      updatedAt: registry.record && registry.record.updatedAt || "",
      error: registry.error || undefined,
    },
    logoUrl: logoUrl || "",
    missingVariables: configured ? [] : missing.map((item) => item.key),
    missingSetupFields: configured ? [] : missing,
    error: configured ? subscriptionBlockedReason || (!coachAccessUnlocked ? "Active coach code needed." : undefined) : `SMARTCoach account "${accountKey}" is not configured.`,
  });
}

async function accountStaff(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const accountKey = normalizeSetupAccountKey(
    firstQueryValue(req.query && (req.query.account || req.query.tenant || req.query.key))
  ) || normalizeSetupAccountKey(headerValue(req, "x-smartcoach-account")) || "default";

  try {
    const existing = await loadAccountRecord(accountKey);
    if (!existing.configured || !existing.found || !existing.record) {
      throw httpError(404, "Account registry record was not found.");
    }

    if (req.method === "GET") {
      res.status(200).json({ success: true, accountKey, coachStaff: normalizeCoachStaff(existing.record.coachStaff) });
      return;
    }

    if (req.method !== "POST" && req.method !== "PATCH") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    await attachRegistryAccountForKey(req, accountKey);
    const { coachCodeVersion, coachAccessCodes, accessCode } = getGhlContext(req);
    const session = coachSessionFromRequest(req, accountKey);
    const sessionAllowed = coachSessionVersionAllowed(session, coachCodeVersion);
    const providedAccessCode = cleanSetupText(headerValue(req, "x-smartcoach-access-code"));
    const allowedCodes = coachAccessCodes && coachAccessCodes.length ? coachAccessCodes : accessCode ? [accessCode] : [];
    const codeAllowed = providedAccessCode && allowedCodes.some((code) => safeEqual(providedAccessCode, code));
    if (!sessionAllowed && !codeAllowed) {
      throw httpError(401, "Active coach access is required to update staff.");
    }

    const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const coachStaff = normalizeCoachStaff(payload.coachStaff || payload.staff || payload.coaches);
    await saveAccountRecord(accountKey, {
      ...existing.record,
      coachStaff,
      lastStaffSync: { savedAt: new Date().toISOString(), count: coachStaff.length },
    });
    res.status(200).json({ success: true, accountKey, coachStaff });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Staff save failed." });
  }
}

function normalizeCoachStaff(items) {
  const source = Array.isArray(items) ? items : [];
  const seen = new Set();
  return source.map((item, index) => {
    const raw = typeof item === "string" ? { name: item } : item || {};
    const name = cleanSetupText(raw.name || raw.coachName || raw.label).slice(0, 120);
    if (!name) return null;
    const id = normalizeDocuRecordKey(raw.id || raw.coachId || name || `coach_${index + 1}`) || `coach_${index + 1}`;
    if (seen.has(id)) return null;
    seen.add(id);
    return {
      id,
      name,
      active: raw.active === false ? false : true,
      role: cleanSetupText(raw.role).slice(0, 80),
      updatedAt: cleanSetupText(raw.updatedAt) || new Date().toISOString(),
    };
  }).filter(Boolean).slice(0, 25);
}

function essentialSessionMatches(session, accountRecord) {
  if (!session || !accountRecord || accountRecord.productPlan !== "essential") return false;
  const active = accountRecord.essentialActiveSession || {};
  if (!active.sessionId || !session.sessionId || !safeEqual(String(active.sessionId), String(session.sessionId))) return false;
  const expiresAt = Date.parse(active.expiresAtIso || active.expiresAt || "");
  return !Number.isFinite(expiresAt) || expiresAt > Date.now();
}

function coachSessionVersionAllowed(session, expectedVersion) {
  const version = Number(expectedVersion) || 0;
  if (!session) return false;
  if (!version) return true;
  return Number(session.coachCodeVersion) === version;
}

function accountSetup(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!setupAdminAllowed(req)) {
    res.status(401).json({
      error: "Setup code is required.",
      adminSetupCodeRequired: true,
    });
    return;
  }

  const requestedKey = firstQueryValue(req.query && (req.query.account || req.query.tenant || req.query.key)) || "customer";
  const accountKey = normalizeSetupAccountKey(requestedKey) || "customer";
  const requestedPlan = firstQueryValue(req.query && (req.query.plan || req.query.productPlan)) || "pro";
  const productPlan = normalizeSetupProductPlan(requestedPlan);
  const requestedCoachSeats = firstQueryValue(req.query && (req.query.coachSeats || req.query.coaches || req.query.seats)) || "1";
  const coachSeats = normalizeSetupCoachSeats(requestedCoachSeats, productPlan);
  const subscription = setupSubscriptionFromQuery(req.query || {}, productPlan);
  const suffix = accountKey.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const { token, locationId } = getGhlContext({ query: { account: accountKey }, headers: {} });
  const configured = !!(token && locationId);

  const env = [
    {
      key: `SMARTCOACH_PRODUCT_PLAN_${suffix}`,
      value: productPlan,
      required: true,
      label: "Plan",
      description: "Controls whether this account is Essential or Pro.",
    },
    {
      key: `SMARTCOACH_SUBSCRIPTION_STATUS_${suffix}`,
      value: subscription.status,
      required: false,
      recommended: true,
      label: "Subscription status",
      description: "Internal customer subscription status: active, trialing, past_due, paused, canceled, incomplete, incomplete_expired, or unpaid.",
    },
    {
      key: `SMARTCOACH_BILLING_CADENCE_${suffix}`,
      value: subscription.billingCadence,
      required: false,
      recommended: true,
      label: "Billing cadence",
      description: "Internal billing cadence for this customer: monthly or annual.",
    },
    {
      key: `SMARTCOACH_SUBSCRIPTION_AMOUNT_${suffix}`,
      value: subscription.amount,
      required: false,
      recommended: true,
      label: "Subscription amount",
      description: "Internal monthly or annual subscription amount. Active athlete limits are enforced by SMARTCoach.",
    },
    {
      key: `SMARTCOACH_RENEWAL_DATE_${suffix}`,
      value: subscription.renewalDate,
      required: false,
      recommended: true,
      label: "Renewal date",
      description: "Internal next renewal or billing date in YYYY-MM-DD format.",
    },
    {
      key: `SMARTCOACH_STRIPE_CUSTOMER_ID_${suffix}`,
      value: subscription.stripeCustomerId,
      required: false,
      label: "Stripe customer ID",
      description: "Optional internal billing reference. This is not shown in the coach-facing app.",
    },
    {
      key: `SMARTCOACH_STRIPE_SUBSCRIPTION_ID_${suffix}`,
      value: subscription.stripeSubscriptionId,
      required: false,
      label: "Stripe subscription ID",
      description: "Optional internal subscription reference. This is not shown in the coach-facing app.",
    },
    {
      key: `SMARTCOACH_SUBSCRIPTION_NOTES_${suffix}`,
      value: subscription.notes,
      required: false,
      label: "Subscription notes",
      description: "Optional internal notes about this customer subscription.",
    },
  ];
  if (isProPlan(productPlan)) {
    env.push(
      {
        key: `GHL_PRIVATE_INTEGRATION_TOKEN_${suffix}`,
        value: "paste_customer_private_integration_token",
        required: true,
        label: "Private integration token",
        description: "Customer SMART Trak private integration token.",
      },
      {
        key: `GHL_LOCATION_ID_${suffix}`,
        value: "paste_customer_location_id",
        required: true,
        label: "Location ID",
        description: "Customer SMART Trak sub-account location ID.",
      }
    );
  }
  env.push(
    {
      key: `SMARTCOACH_COACH_SEATS_${suffix}`,
      value: String(coachSeats),
      required: true,
      label: "Coach seats",
      description: isProPlan(productPlan) ? "Pro accounts use one shared coach code and include up to 10 assistant coach seats. Keep staff access tight to protect clean data." : "Essential allows one active device session at a time.",
    },
    {
      key: `SMARTCOACH_COACH_ACCESS_CODES_${suffix}`,
      value: suggestedCoachAccessCodes(accountKey, coachSeats, productPlan).join(","),
      required: true,
      label: "Coach access codes",
      description: isProPlan(productPlan) ? `Share the coach code only with active staff. This account is set for ${coachSeats} assistant coach seat${coachSeats === 1 ? "" : "s"}.` : "Essential requires an active code and allows one active device at a time.",
    },
    {
      key: `SMARTCOACH_REQUIRE_COACH_ACCESS_${suffix}`,
      value: "true",
      required: true,
      label: "Require coach access",
      description: "Blocks SMARTCoach until this account has an active coach access code configured.",
    }
  );
  if (isProPlan(productPlan)) {
    env.push(
      {
        key: `SMARTCOACH_PARENT_EMAIL_COACH_ACCESS_${suffix}`,
        value: "",
        required: false,
        label: "Future parent email coaches",
        description: "Optional future release only. Use coach numbers like 1 or 1,3; tools stay hidden until the global parent email release flag is turned on.",
      }
    );
  }

  res.status(200).json({
    success: true,
    accountKey,
    productPlan,
    productPlanLabel: planDefinition(productPlan).label,
    activeAthleteLimit: planDefinition(productPlan).activeAthleteLimit,
    coachSeats,
    coachAccessCodesConfigured: coachSeats,
    subscription: publicSubscriptionSummary(subscription),
    configured,
    setupState: !isProPlan(productPlan) ? configured ? "essential-ready" : "essential-code-needed" : configured ? "pro-ready" : "pro-setup-needed",
    environment: env,
    accountUrl: `/?account=${encodeURIComponent(accountKey)}`,
    dashboardUrl: `/dashboard.html?account=${encodeURIComponent(accountKey)}`,
    ghlCustomLinkUrl: `/dashboard.html?account=${encodeURIComponent(accountKey)}&embed=1`,
    planBuilderUrl: `/plan-builder.html?account=${encodeURIComponent(accountKey)}`,
  });
}

async function accountAutomation(req, res) {
  setAutomationHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!automationAllowed(req)) {
    res.status(401).json({
      error: "Automation secret is required.",
      automationSecretRequired: true,
      automationDebug: automationSecretDebug(req),
    });
    return;
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const result = await saveAutomationAccount(payload, { source: "automation" });
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message || "Could not process automation payload." });
  }
}

async function accountAutomationDryRun(req, res) {
  setAutomationHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!automationAllowed(req)) {
    res.status(401).json({
      error: "Automation secret is required.",
      automationSecretRequired: true,
    });
    return;
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const result = await previewAutomationAccount(payload, { source: "automation-dry-run", dryRun: true });
    res.status(200).json({
      success: true,
      dryRun: true,
      ...result,
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message || "Could not test automation payload." });
  }
}

async function accountAutomationHealth(req, res) {
  setAutomationHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (!automationAllowed(req)) {
    res.status(401).json({
      error: "Automation secret is required.",
      automationSecretRequired: true,
    });
    return;
  }

  const automationSecretConfigured = !!cleanSetupText(process.env.SMARTCOACH_AUTOMATION_SECRET);
  const setupCodeConfigured = !!cleanSetupText(process.env.SMARTCOACH_ADMIN_SETUP_CODE);
  const registryStatus = await registryHealth();
  const registryReady = !!(registryStatus.configured && registryStatus.reachable);
  const stripeWebhookReady = !!cleanSetupText(process.env.SMARTCOACH_STRIPE_WEBHOOK_SECRET);
  const dedicatedSessionSecretConfigured = !!cleanSetupText(process.env.SMARTCOACH_SESSION_SECRET);
  const sessionSigningSource = coachSessionSecretSource();
  const sessionSigningReady = !!sessionSigningSource;
  const coachAccessEnforcementConfigured = normalizeSetupBoolean(process.env.SMARTCOACH_REQUIRE_COACH_ACCESS, false);
  const parentEmailReleased = parentEmailFeatureReleased();
  const launchChecks = [
    {
      key: "automationSecret",
      label: "Automation secret",
      ready: automationSecretConfigured,
      detail: automationSecretConfigured ? "Protected setup endpoints can accept trusted automation calls." : "Set SMARTCOACH_AUTOMATION_SECRET before connecting setup automation.",
    },
    {
      key: "setupCode",
      label: "Setup page protection",
      ready: setupCodeConfigured,
      detail: setupCodeConfigured ? "Internal setup field generation requires the setup code." : "Set SMARTCOACH_ADMIN_SETUP_CODE so customer setup fields are not casually available.",
    },
    {
      key: "registry",
      label: "Durable account registry",
      ready: registryReady,
      detail: registryReady ? "Customer account records can survive deployments and be updated by automation." : registryStatus.configured ? "Registry is configured but cannot be reached." : "Connect Vercel KV or Upstash Redis registry variables.",
    },
    {
      key: "stripeWebhook",
      label: "Stripe webhook",
      ready: stripeWebhookReady,
      detail: stripeWebhookReady ? "Stripe signatures can be verified before subscription updates are accepted." : "Set SMARTCOACH_STRIPE_WEBHOOK_SECRET from the Stripe webhook endpoint.",
    },
    {
      key: "sessionSecret",
      label: "Coach sessions",
      ready: dedicatedSessionSecretConfigured,
      detail: dedicatedSessionSecretConfigured ? "Coach sessions use a dedicated signing secret." : "Set SMARTCOACH_SESSION_SECRET so sessions do not reuse setup secrets.",
    },
    {
      key: "coachAccess",
      label: "Coach access enforcement",
      ready: coachAccessEnforcementConfigured,
      detail: coachAccessEnforcementConfigured ? "Pro accounts require a coach access code or signed coach session." : "Set SMARTCOACH_REQUIRE_COACH_ACCESS=true before launch.",
    },
    {
      key: "parentEmail",
      label: "Parent email release",
      ready: !parentEmailReleased,
      detail: parentEmailReleased ? "Parent email tools are globally enabled before the first rollout." : "Parent email tools remain hidden until intentionally released.",
    },
  ];
  const launchBlockers = [];
  const productionWarnings = [];
  if (!automationSecretConfigured) launchBlockers.push("Automation secret is missing.");
  if (!setupCodeConfigured) launchBlockers.push("Internal setup code is missing.");
  if (!registryReady) launchBlockers.push(registryStatus.configured ? "Account registry is not reachable." : "Durable account registry is not connected.");
  if (!stripeWebhookReady) launchBlockers.push("Stripe webhook signing secret is missing.");
  if (!dedicatedSessionSecretConfigured) launchBlockers.push("Dedicated coach session secret is missing.");
  if (!coachAccessEnforcementConfigured) launchBlockers.push("Coach access enforcement is not turned on.");
  if (parentEmailReleased) launchBlockers.push("Parent email tools are globally enabled before initial rollout.");
  if (!dedicatedSessionSecretConfigured) {
    productionWarnings.push("Set SMARTCOACH_SESSION_SECRET so coach sessions do not reuse automation or setup secrets.");
  }
  if (!setupCodeConfigured) {
    productionWarnings.push("Set SMARTCOACH_ADMIN_SETUP_CODE so internal customer setup field generation requires a setup code.");
  }
  if (!coachAccessEnforcementConfigured) {
    productionWarnings.push("Set SMARTCOACH_REQUIRE_COACH_ACCESS=true after Pro accounts have a shared coach code.");
  }
  if (!registryStatus.configured) {
    productionWarnings.push("Connect the durable account registry so Stripe and setup automation survive deployments.");
  } else if (!registryStatus.reachable) {
    productionWarnings.push("Fix the durable account registry connection so Stripe and setup automation can save customer updates.");
  }
  if (parentEmailReleased) {
    productionWarnings.push("Parent email tools are globally enabled. Keep SMARTCOACH_PARENT_EMAIL_FEATURE_ENABLED off until parent communication is ready for rollout.");
  }
  res.status(200).json({
    success: true,
    launchReady: launchBlockers.length === 0,
    launchBlockers,
    launchChecks,
    automationSecretConfigured,
    setupCodeConfigured,
    registryConfigured: !!registryStatus.configured,
    registryReachable: !!registryStatus.reachable,
    registryError: registryStatus.error || "",
    stripeWebhookConfigured: stripeWebhookReady,
    dedicatedSessionSecretConfigured,
    sessionSigningConfigured: sessionSigningReady,
    sessionSigningSource,
    sessionTtlSeconds: coachSessionTtlSeconds(),
    coachAccessEnforcementConfigured,
    parentEmailFeatureReleased: parentEmailReleased,
    productionWarnings,
    readyForManualRegistryUpdates: automationSecretConfigured && registryReady,
    readyForStripeWebhooks: automationSecretConfigured && registryReady && stripeWebhookReady,
    readyForSignedCoachSessions: sessionSigningReady,
    checks: [
      { key: "automationSecret", label: "Automation secret", configured: automationSecretConfigured },
      { key: "setupCode", label: "Internal setup code", configured: setupCodeConfigured },
      { key: "registry", label: "Durable account registry", configured: !!registryStatus.configured },
      { key: "registryConnection", label: "Registry connection", configured: registryReady },
      { key: "stripeWebhook", label: "Stripe webhook signing secret", configured: stripeWebhookReady },
      { key: "sessionSigning", label: "Coach session signing", configured: sessionSigningReady },
      { key: "dedicatedSessionSecret", label: "Dedicated session secret", configured: dedicatedSessionSecretConfigured },
      { key: "coachAccessEnforcement", label: "Coach access enforcement", configured: coachAccessEnforcementConfigured },
      { key: "parentEmailReleaseGate", label: "Parent email release gate off", configured: !parentEmailReleased },
    ],
  });
}

async function accountStripeWebhook(req, res) {
  setAutomationHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const secret = cleanSetupText(process.env.SMARTCOACH_STRIPE_WEBHOOK_SECRET);
    if (!secret) throw httpError(500, "Stripe webhook signing secret is not configured.");
    const signature = headerValue(req, "stripe-signature");
    if (!signature) throw httpError(401, "Stripe signature is required.");
    const rawBody = await requestBodyText(req);
    verifyStripeSignature(rawBody, signature, secret);
    const payload = JSON.parse(rawBody || "{}");
    const result = await saveAutomationAccount(payload, { source: "stripe-webhook", skipDuplicateEvents: true });
    if (!result.duplicateAutomationEvent && (!result.registry || !result.registry.saved)) {
      throw httpError(
        503,
        (result.registry && (result.registry.reason || result.registry.error)) ||
          "Stripe webhook could not save the account registry update."
      );
    }
    res.status(200).json({
      success: true,
      stripeWebhookVerified: true,
      stripeWebhookDuplicate: !!result.duplicateAutomationEvent,
      ...result,
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message || "Could not process Stripe webhook." });
  }
}

async function saveAutomationAccount(payload, options = {}) {
  const accountKey = automationAccountKey(payload);
  if (!accountKey) throw httpError(400, "Account key is required.");
  const existing = await loadExistingAccountRecord(accountKey);
  const account = accountAutomationRecord(payload, existing, options);
  const suffix = account.accountKey.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const environment = accountEnvironmentRows({ suffix, account, includeCrm: isProPlan(account.productPlan) });
  if (options.skipDuplicateEvents && automationEventAlreadyRecorded(existing, account.lastAutomationEvent)) {
    return automationAccountResult(account, {
      configured: registryConfigured(),
      saved: false,
      duplicate: true,
      reason: "Duplicate automation event. Registry record was already updated.",
    }, {
      duplicateAutomationEvent: true,
      environment,
    });
  }
  const registryResult = await saveAccountRecord(account.accountKey, account);
  const customValueSync = await syncAccountKeyCustomValue(account);
  return automationAccountResult(account, registryResult, { environment, customValueSync });
}

function automationAccountResult(account, registryResult, extra = {}) {
  const subscriptionAllowed = subscriptionAccessAllowed(account.subscription);
  const setupReady = accountSetupReady(account);
  const subscriptionBlockedReason = subscriptionAllowed ? "" : subscriptionBlockedMessage(account.subscription);
  return {
    ...extra,
    accountKey: account.accountKey,
    productPlan: account.productPlan,
    productPlanLabel: planDefinition(account.productPlan).label,
    activeAthleteLimit: planDefinition(account.productPlan).activeAthleteLimit,
    coachSeats: account.coachSeats || 1,
    subscription: publicSubscriptionSummary(account.subscription),
    subscriptionAccessAllowed: subscriptionAllowed,
    subscriptionBlockedReason,
    setupReady,
    accessReady: setupReady && subscriptionAllowed,
    registry: registryResult,
    ghlCustomValueSync: extra.customValueSync || customValueSyncSkipped("Not attempted."),
    accountRegistryRecord: publicAccountRecord(account),
    environment: publicEnvironmentRows(extra.environment || accountEnvironmentRows({
      suffix: account.accountKey.toUpperCase().replace(/[^A-Z0-9]/g, "_"),
      account,
      includeCrm: isProPlan(account.productPlan),
    })),
    dashboardUrl: `/dashboard.html?account=${encodeURIComponent(account.accountKey)}`,
    ghlCustomLinkUrl: `/dashboard.html?account=${encodeURIComponent(account.accountKey)}&embed=1`,
    accountUrl: `/?account=${encodeURIComponent(account.accountKey)}`,
  };
}

async function syncAccountKeyCustomValue(account) {
  if (!account || account.productPlan === "essential") return customValueSyncSkipped("Essential accounts do not need a SMART Trak custom value.");
  if (!account.token || !account.locationId) return customValueSyncSkipped("Missing Location ID or Private Integration Token.");
  try {
    const existing = await findGhlCustomValue({
      token: account.token,
      locationId: account.locationId,
      name: GHL_ACCOUNT_KEY_CUSTOM_VALUE_NAME,
    });
    if (existing && existing.id) {
      const updated = await ghlRequest({
        token: account.token,
        path: `/locations/${encodeURIComponent(account.locationId)}/customValues/${encodeURIComponent(existing.id)}`,
        method: "PUT",
        body: { name: existing.name || GHL_ACCOUNT_KEY_CUSTOM_VALUE_NAME, value: account.accountKey },
      });
      return customValueSyncSuccess("updated", updated, account.accountKey);
    }
    const created = await ghlRequest({
      token: account.token,
      path: `/locations/${encodeURIComponent(account.locationId)}/customValues`,
      method: "POST",
      body: { name: GHL_ACCOUNT_KEY_CUSTOM_VALUE_NAME, value: account.accountKey },
    });
    return customValueSyncSuccess("created", created, account.accountKey);
  } catch (error) {
    return {
      attempted: true,
      success: false,
      name: GHL_ACCOUNT_KEY_CUSTOM_VALUE_NAME,
      fieldKey: `{{custom_values.${GHL_ACCOUNT_KEY_CUSTOM_VALUE_NAME}}}`,
      value: account.accountKey || "",
      error: error.message || "Could not sync GHL account key custom value.",
    };
  }
}

async function findGhlCustomValue({ token, locationId, name }) {
  const data = await ghlRequest({
    token,
    path: `/locations/${encodeURIComponent(locationId)}/customValues`,
    method: "GET",
  });
  const values = Array.isArray(data && data.customValues) ? data.customValues :
    Array.isArray(data && data.custom_values) ? data.custom_values :
    Array.isArray(data && data.values) ? data.values :
    Array.isArray(data) ? data : [];
  const target = normalizeCustomValueName(name);
  return values.find((item) => {
    const fieldKey = String(item && (item.fieldKey || item.field_key || item.key) || "");
    return normalizeCustomValueName(item && item.name) === target ||
      normalizeCustomValueName(fieldKey.replace(/^.*custom_values\.?/i, "")) === target ||
      fieldKey.includes(`custom_values.${name}`) ||
      fieldKey.includes(`custom_values_${name}`);
  }) || null;
}

function normalizeCustomValueName(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function customValueSyncSuccess(action, data, accountKey) {
  const customValue = data && (data.customValue || data.custom_value || data);
  return {
    attempted: true,
    success: true,
    action,
    id: String(customValue && (customValue.id || customValue._id) || ""),
    name: String(customValue && customValue.name || GHL_ACCOUNT_KEY_CUSTOM_VALUE_NAME),
    fieldKey: String(customValue && (customValue.fieldKey || customValue.field_key || customValue.key) || `{{custom_values.${GHL_ACCOUNT_KEY_CUSTOM_VALUE_NAME}}}`),
    value: accountKey || "",
  };
}

function customValueSyncSkipped(reason) {
  return {
    attempted: false,
    success: false,
    name: GHL_ACCOUNT_KEY_CUSTOM_VALUE_NAME,
    fieldKey: `{{custom_values.${GHL_ACCOUNT_KEY_CUSTOM_VALUE_NAME}}}`,
    value: "",
    reason,
  };
}

async function previewAutomationAccount(payload, options = {}) {
  const accountKey = automationAccountKey(payload);
  if (!accountKey) throw httpError(400, "Account key is required.");
  const existing = await loadExistingAccountRecord(accountKey);
  const account = accountAutomationRecord(payload, existing, options);
  const suffix = account.accountKey.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const environment = accountEnvironmentRows({ suffix, account, includeCrm: isProPlan(account.productPlan) });
  const subscriptionAllowed = subscriptionAccessAllowed(account.subscription);
  const setupReady = accountSetupReady(account);
  const subscriptionBlockedReason = subscriptionAllowed ? "" : subscriptionBlockedMessage(account.subscription);
  return {
    accountKey: account.accountKey,
    productPlan: account.productPlan,
    productPlanLabel: planDefinition(account.productPlan).label,
    activeAthleteLimit: planDefinition(account.productPlan).activeAthleteLimit,
    coachSeats: account.coachSeats || 1,
    subscription: publicSubscriptionSummary(account.subscription),
    subscriptionAccessAllowed: subscriptionAllowed,
    subscriptionBlockedReason,
    setupReady,
    accessReady: setupReady && subscriptionAllowed,
    registry: {
      configured: registryConfigured(),
      saved: false,
      dryRun: true,
      reason: "Dry run only. No registry record was saved.",
    },
    accountRegistryRecord: publicAccountRecord(account),
    environment: publicEnvironmentRows(environment),
    dashboardUrl: `/dashboard.html?account=${encodeURIComponent(account.accountKey)}`,
    ghlCustomLinkUrl: `/dashboard.html?account=${encodeURIComponent(account.accountKey)}&embed=1`,
    accountUrl: `/?account=${encodeURIComponent(account.accountKey)}`,
  };
}

function accountSetupReady(account) {
  const source = account || {};
  const codes = Array.isArray(source.coachAccessCodes) ? source.coachAccessCodes : [];
  const coachAccessReady = source.requireCoachAccess === false || codes.length > 0;
  if (!isProPlan(source.productPlan)) return coachAccessReady;
  return !!(source.token && source.locationId && coachAccessReady);
}

function publicAccountRecord(account) {
  const source = account || {};
  return {
    ...source,
    token: source.token ? "__hidden__" : "",
    accessCode: source.accessCode ? "__hidden__" : "",
    coachAccessCodes: Array.isArray(source.coachAccessCodes) ? source.coachAccessCodes.map(() => "__hidden__") : [],
    essentialActiveSession: source.essentialActiveSession ? { active: true, expiresAtIso: source.essentialActiveSession.expiresAtIso || "" } : undefined,
    privateIntegrationToken: undefined,
  };
}

function publicEnvironmentRows(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const key = String(row && row.key || "");
    if (/GHL_PRIVATE_INTEGRATION_TOKEN|SMARTCOACH_COACH_ACCESS_CODES|SMARTCOACH_LEGACY_ACCESS_CODE/i.test(key)) {
      const value = String(row.value || "");
      if (value && !/^paste_/i.test(value)) return { ...row, value: "__hidden__" };
    }
    return row;
  });
}

async function ghlRequest({ token, path, method = "GET", body }) {
  const response = await fetch(`${GHL_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: GHL_VERSION,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    data = { message: text };
  }
  if (!response.ok) {
    throw httpError(response.status, data.message || data.error || `GHL request failed with ${response.status}.`);
  }
  return data;
}

async function accountRegistry(req, res) {
  setAutomationHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (!automationAllowed(req)) {
    res.status(401).json({
      error: "Automation secret is required.",
      automationSecretRequired: true,
    });
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const action = cleanSetupText(firstQueryValue(req.query && req.query.action));
    if (action === "list") {
      const result = await listAccountRecords({ limit: firstQueryValue(req.query && req.query.limit) });
      res.status(200).json({
        success: true,
        registry: { configured: !!result.configured },
        accounts: result.accounts || [],
        count: result.count || 0,
      });
      return;
    }
    const accountKey = normalizeSetupAccountKey(firstQueryValue(req.query && (req.query.account || req.query.tenant || req.query.key)));
    if (!accountKey) throw httpError(400, "Account key is required.");
    const result = await loadAccountRecord(accountKey);
    const record = result.record || null;
    const publicRecord = record ? publicAccountRecord(record) : null;
    const setupReady = result.found ? accountSetupReady(record) : false;
    const subscriptionAllowed = result.found ? subscriptionAccessAllowed(record && record.subscription) : false;
    const subscriptionBlockedReason = result.found && !subscriptionAllowed ? subscriptionBlockedMessage(record && record.subscription) : "";
    res.status(result.found ? 200 : 404).json({
      success: !!result.found,
      accountKey,
      setupReady,
      accessReady: setupReady && subscriptionAllowed,
      subscriptionAccessAllowed: subscriptionAllowed,
      subscriptionBlockedReason,
      registry: {
        configured: !!result.configured,
        found: !!result.found,
        key: result.key || "",
        error: result.error || undefined,
      },
      accountRegistryRecord: publicRecord,
      error: result.found ? undefined : result.configured ? "Account registry record was not found." : "Account registry is not configured.",
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message || "Could not load account registry record." });
  }
}

async function accountSession(req, res) {
  setSessionHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const accountKey = normalizeSetupAccountKey(
      firstPayloadValue(payload, ["accountKey", "account", "tenant", "key"]) ||
        firstQueryValue(req.query && (req.query.account || req.query.tenant || req.query.key))
    ) || "default";
    const accessCode = cleanSetupText(firstPayloadValue(payload, ["accessCode", "coachAccessCode", "code"]));
    const ip = requestIp(req);
    const attempt = checkSessionAttempt({ accountKey, ip });
    if (!attempt.allowed) {
      res.setHeader("Retry-After", String(attempt.retryAfterSeconds || 900));
      res.status(429).json({
        error: "Too many access attempts. Wait a few minutes, then try again.",
        retryAfterSeconds: attempt.retryAfterSeconds,
      });
      return;
    }
    await attachRegistryAccountForKey(req, accountKey);
    const access = coachCodeAllowed({ query: { account: accountKey }, headers: req.headers || {}, smartcoachRegistryAccount: req.smartcoachRegistryAccount }, accessCode);
    if (!access.allowed) {
      const failure = recordSessionFailure({ accountKey, ip });
      if (failure.blocked) res.setHeader("Retry-After", String(failure.retryAfterSeconds || 900));
      res.status(access.statusCode || 401).json(access);
      return;
    }
    clearSessionFailures({ accountKey, ip });
    const parentEmailAllowed = parentEmailFeatureReleased() && !!access.parentEmailAllowed;
    const sessionId = crypto.randomBytes(12).toString("hex");
    const session = createCoachSession(accountKey, { coachIndex: access.coachIndex, parentEmailAllowed, sessionId, coachCodeVersion: access.coachCodeVersion });
    if (!session) {
      res.status(500).json({
        error: "SMART Trak session signing is not configured.",
        sessionSecretRequired: true,
      });
      return;
    }
    if (access.productPlan === "essential") {
      const existing = (await loadExistingAccountRecord(accountKey)) || req.smartcoachRegistryAccount || {};
      await saveAccountRecord(accountKey, {
        ...existing,
        accountKey,
        productPlan: "essential",
        essentialActiveSession: {
          sessionId,
          coachIndex: access.coachIndex || 0,
          createdAt: new Date().toISOString(),
          expiresAt: session.expiresAt,
          expiresAtIso: session.expiresAtIso,
        },
      });
    }
    const deviceId = cleanSetupText(firstPayloadValue(payload, ["deviceId", "clientDeviceId"]));
    const deviceLabel = cleanSetupText(firstPayloadValue(payload, ["deviceLabel", "deviceName"]));
    const usage = await recordCoachDeviceSession(accountKey, {
      deviceId,
      deviceLabel,
      userAgent: headerValue(req, "user-agent"),
      coachIndex: access.coachIndex || 0,
      expiresAtIso: session.expiresAtIso,
    }).catch((error) => ({ saved: false, error: error.message || "Device usage could not be saved." }));
    res.status(200).json({
      success: true,
      accountKey,
      productPlan: access.productPlan,
      coachSeats: access.coachSeats,
      coachIndex: access.coachIndex,
      parentEmailAllowed,
      sessionToken: session.token,
      expiresAt: session.expiresAt,
      expiresAtIso: session.expiresAtIso,
      coachDeviceUsageUpdated: !!(usage && usage.saved),
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message || "Could not create coach session." });
  }
}

async function accountCodeReset(req, res) {
  setSessionHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const accountKey = normalizeSetupAccountKey(
      firstPayloadValue(payload, ["accountKey", "account", "tenant", "key"]) ||
        firstQueryValue(req.query && (req.query.account || req.query.tenant || req.query.key))
    ) || "default";
    const currentCode = cleanSetupText(firstPayloadValue(payload, ["currentCode", "accessCode", "coachAccessCode", "code"]));
    const newCode = cleanSetupText(firstPayloadValue(payload, ["newCode", "newAccessCode", "newCoachAccessCode"]));
    if (!currentCode || !newCode) throw httpError(400, "Current code and new code are required.");
    if (newCode.length < 6) throw httpError(400, "New code must be at least 6 characters.");
    if (safeEqual(currentCode, newCode)) throw httpError(400, "New code must be different from the current code.");

    const result = await attachRegistryAccountForKey(req, accountKey);
    const existing = result && result.found && result.record ? result.record : null;
    if (!existing) throw httpError(404, "Account registry record was not found. Save Account Setup before changing the shared coach code.");

    const access = coachCodeAllowed({ query: { account: accountKey }, headers: req.headers || {}, smartcoachRegistryAccount: existing }, currentCode);
    if (!access.allowed) {
      res.status(access.statusCode || 401).json(access);
      return;
    }

    const coachSeats = normalizeSetupCoachSeats(existing.coachSeats || access.coachSeats || 1, existing.productPlan);
    const currentCodes = normalizeSetupCoachCodes(existing.coachAccessCodes || [], accountKey, coachSeats, existing.productPlan);
    if (!currentCodes.length) throw httpError(503, "No active coach code is configured for this account.");
    const coachIndex = currentCodes.findIndex((code) => safeEqual(code, currentCode));
    if (coachIndex < 0) throw httpError(401, "Current coach code was not accepted.");
    if (currentCodes.some((code, index) => index !== coachIndex && safeEqual(code, newCode))) {
      throw httpError(400, "New code is already assigned to another coach.");
    }

    const nextCodes = currentCodes.slice();
    nextCodes[coachIndex] = newCode;
    const coachCodeChange = coachCodeChangeState(existing, nextCodes, { source: "coach-self-service" });
    const nextCoachCodeVersion = (Number(existing.coachCodeVersion) || 0) + 1;
    const sessionId = crypto.randomBytes(12).toString("hex");
    const parentEmailAllowed = parentEmailFeatureReleased() && !!(Array.isArray(existing.parentEmailCoachAccess) && existing.parentEmailCoachAccess[coachIndex]);
    const session = createCoachSession(accountKey, { coachIndex, parentEmailAllowed, sessionId, coachCodeVersion: nextCoachCodeVersion });
    if (!session) {
      res.status(500).json({
        error: "SMART Trak session signing is not configured.",
        sessionSecretRequired: true,
      });
      return;
    }

    const updated = {
      ...existing,
      accountKey,
      coachAccessCodes: nextCodes,
      coachCodeChangeHistory: coachCodeChange.history,
      lastCoachCodeChange: coachCodeChange.latest || existing.lastCoachCodeChange || null,
      coachCodeVersion: nextCoachCodeVersion,
    };
    if (existing.productPlan === "essential") {
      updated.essentialActiveSession = {
        sessionId,
        coachIndex,
        createdAt: new Date().toISOString(),
        expiresAt: session.expiresAt,
        expiresAtIso: session.expiresAtIso,
      };
    }
    const registry = await saveAccountRecord(accountKey, updated);
    res.status(200).json({
      success: true,
      accountKey,
      productPlan: normalizeSetupProductPlan(existing.productPlan),
      coachIndex,
      coachCodeVersion: nextCoachCodeVersion,
      sessionToken: session.token,
      expiresAt: session.expiresAt,
      expiresAtIso: session.expiresAtIso,
      registry,
    });
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message || "Could not change coach code." });
  }
}

async function attachRegistryAccount(req) {
  const accountKey = accountKeyFromRequest(req);
  return attachRegistryAccountForKey(req, accountKey);
}

async function attachRegistryAccountForKey(req, accountKeyValue) {
  const accountKey = normalizeSetupAccountKey(accountKeyValue) || "default";
  let result = { configured: registryConfigured(), found: false, record: null };
  try {
    result = await loadAccountRecord(accountKey);
    if (result && result.found && result.record) {
      req.smartcoachRegistryAccount = result.record;
    }
  } catch (error) {
    result = { configured: true, found: false, record: null, error: error.message || "Registry could not be checked." };
  }
  return result;
}

function accountKeyFromRequest(req) {
  return (
    headerValue(req, "x-smartcoach-account") ||
    firstQueryValue(req.query && (req.query.account || req.query.tenant || req.query.key)) ||
    "default"
  );
}

function firstQueryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeSetupAccountKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

function normalizeSetupProductPlan(value) {
  return normalizePlanKey(value);
}

function normalizeSetupCoachSeats(value, productPlan) {
  const seats = Number(String(value || "").trim());
  const max = productPlan === "essential" ? 1 : 10;
  if (!Number.isFinite(seats) || seats < 1) return 1;
  return Math.max(1, Math.min(Math.floor(seats), max));
}

function setupSubscriptionFromQuery(query, productPlan) {
  const billingCadence = normalizeSetupBillingCadence(firstQueryValue(query.billingCadence || query.cadence) || "monthly");
  return {
    status: normalizeSetupSubscriptionStatus(firstQueryValue(query.subscriptionStatus || query.status) || "active"),
    billingCadence,
    amount: cleanSetupText(firstQueryValue(query.subscriptionAmount || query.amount) || suggestedSubscriptionAmount(productPlan, query.coachSeats || query.coaches || query.seats, billingCadence)),
    renewalDate: cleanSetupText(firstQueryValue(query.renewalDate || query.renewsOn || query.nextBillingDate)),
    stripeCustomerId: cleanSetupText(firstQueryValue(query.stripeCustomerId || query.customerId)),
    stripeSubscriptionId: cleanSetupText(firstQueryValue(query.stripeSubscriptionId || query.subscriptionId)),
    notes: cleanSetupText(firstQueryValue(query.subscriptionNotes || query.notes)),
  };
}

async function loadExistingAccountRecord(accountKey) {
  try {
    const result = await loadAccountRecord(accountKey);
    return result && result.found && result.record ? result.record : null;
  } catch (error) {
    return null;
  }
}

function accountAutomationRecord(payload, existingRecord, options = {}) {
  const existing = existingRecord || {};
  const existingSubscription = existing.subscription || {};
  const accountKey = automationAccountKey(payload);
  if (!accountKey) throw httpError(400, "Account key is required.");
  const productPlanValue = firstAutomationValue(payload, ["productPlan", "plan", "subscriptionPlan"]);
  const productPlan = productPlanValue ? normalizeSetupProductPlan(productPlanValue) : normalizeSetupProductPlan(existing.productPlan || "pro");
  const coachSeatsValue = firstAutomationValue(payload, ["coachSeats", "coaches", "seats"]);
  const coachSeats = coachSeatsValue ? normalizeSetupCoachSeats(coachSeatsValue, productPlan) : normalizeSetupCoachSeats(existing.coachSeats || 1, productPlan);
  const statusValue = firstAutomationValue(payload, ["subscriptionStatus", "status"]);
  const billingValue = firstAutomationValue(payload, ["billingCadence", "billingInterval", "cadence", "interval"]);
  const amountValue = firstAutomationValue(payload, ["subscriptionAmount", "amount", "price", "unitAmount", "unit_amount"]);
  const renewalValue = firstAutomationValue(payload, ["renewalDate", "renewsOn", "nextBillingDate", "currentPeriodEnd", "current_period_end"]);
  const stripeCustomerValue = firstAutomationValue(payload, ["stripeCustomerId", "customerId", "customer"]);
  const stripeSubscriptionValue = firstAutomationValue(payload, ["stripeSubscriptionId", "subscriptionId", "subscription"]);
  const notesValue = firstAutomationValue(payload, ["subscriptionNotes", "notes"]);
  const subscription = {
    status: statusValue ? normalizeSetupSubscriptionStatus(statusValue) : existingSubscription.status || "active",
    billingCadence: billingValue ? normalizeSetupBillingCadence(billingValue) : existingSubscription.billingCadence || "monthly",
    amount: amountValue ? normalizeMoneyAmount(amountValue) : existingSubscription.amount || suggestedSubscriptionAmount(productPlan, coachSeats, billingValue ? normalizeSetupBillingCadence(billingValue) : existingSubscription.billingCadence || "monthly"),
    renewalDate: renewalValue ? normalizeDateValue(renewalValue) : existingSubscription.renewalDate || "",
    stripeCustomerId: cleanSetupText(stripeCustomerValue || existingSubscription.stripeCustomerId),
    stripeSubscriptionId: cleanSetupText(stripeSubscriptionValue || existingSubscription.stripeSubscriptionId),
    notes: cleanSetupText(notesValue || existingSubscription.notes),
  };
  const coachCodesValue = firstAutomationValue(payload, ["coachAccessCodes", "coachCodes", "accessCodes"]);
  const coachCodes = coachCodesValue ? normalizeSetupCoachCodes(coachCodesValue, accountKey, coachSeats, productPlan) : normalizeSetupCoachCodes(existing.coachAccessCodes || [], accountKey, coachSeats, productPlan);
  const coachCodeChange = coachCodeChangeState(existing, coachCodes, options);
  const parentEmailCoachAccessValue = firstAutomationValue(payload, ["parentEmailCoachAccess", "parentEmailCoachIndexes", "parentEmailCoaches"]);
  const parentEmailCoachAccess = parentEmailCoachAccessValue ? normalizeParentEmailCoachAccess(parentEmailCoachAccessValue, coachSeats, productPlan) : normalizeParentEmailCoachAccess(existing.parentEmailCoachAccess || [], coachSeats, productPlan);
  const tokenValue = firstAutomationValue(payload, ["ghlToken", "privateIntegrationToken", "token"]);
  const locationValue = firstAutomationValue(payload, ["locationId", "ghlLocationId"]);
  const logoValue = firstAutomationValue(payload, ["logoUrl", "brandLogoUrl", "schoolLogoUrl"]);
  const requireCoachAccessValue = firstAutomationValue(payload, ["requireCoachAccess", "coachAccessRequired", "requireAccessCode"]);
  const requireCoachAccess = normalizeSetupBoolean(requireCoachAccessValue, existing.requireCoachAccess !== undefined ? existing.requireCoachAccess : true);
  const event = automationEventSummary(payload, options);
  const automationEventHistory = automationEventHistoryFor(existing.automationEventHistory, event);
  return {
    accountKey,
    productPlan,
    token: cleanSetupText(tokenValue || existing.token),
    locationId: cleanSetupText(locationValue || existing.locationId),
    coachSeats,
    coachAccessCodes: coachCodes,
    parentEmailCoachAccess: isProPlan(productPlan) ? parentEmailCoachAccess : [],
    requireCoachAccess,
    subscription,
    logoUrl: cleanSetupText(logoValue || existing.logoUrl),
    coachCodeChangeHistory: coachCodeChange.history,
    lastCoachCodeChange: coachCodeChange.latest || existing.lastCoachCodeChange || null,
    coachCodeVersion: coachCodeChange.changed && !options.dryRun ? (Number(existing.coachCodeVersion) || 0) + 1 : Number(existing.coachCodeVersion) || 0,
    lastAutomationEvent: event,
    automationEventHistory,
  };
}

function coachCodeChangeState(existing, nextCodes, options = {}) {
  const currentCodes = normalizeSetupCoachCodes(existing && existing.coachAccessCodes || [], existing && existing.accountKey || "", existing && existing.coachSeats || 1, existing && existing.productPlan);
  const incomingCodes = Array.isArray(nextCodes) ? nextCodes : [];
  const history = Array.isArray(existing && existing.coachCodeChangeHistory) ? existing.coachCodeChangeHistory.filter(Boolean) : [];
  if (!currentCodes.length || !incomingCodes.length || codesMatch(currentCodes, incomingCodes)) {
    return { changed: false, history, latest: null };
  }
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthlyChanges = history.filter((item) => String(item && item.month || "").slice(0, 7) === monthKey);
  if (monthlyChanges.length >= 2) {
    throw httpError(429, "Coach code reset limit reached for this month. Coach codes can be changed 2 times per month.");
  }
  const latest = {
    changedAt: new Date().toISOString(),
    month: monthKey,
    source: cleanSetupText(options.source || "manual"),
  };
  return {
    changed: true,
    history: options.dryRun ? history : [latest, ...history].slice(0, 24),
    latest: options.dryRun ? null : latest,
  };
}

function codesMatch(left, right) {
  const a = (Array.isArray(left) ? left : []).map(cleanSetupText).filter(Boolean).sort();
  const b = (Array.isArray(right) ? right : []).map(cleanSetupText).filter(Boolean).sort();
  if (a.length !== b.length) return false;
  return a.every((code, index) => safeEqual(code, b[index]));
}

function automationAccountKey(payload) {
  return normalizeSetupAccountKey(
    firstAutomationValue(payload, [
      "accountKey",
      "smartcoachAccountKey",
      "smartCoachAccountKey",
      "smarttrakAccountKey",
      "smartTrakAccountKey",
      "smartcoach_account_key",
      "smartcoachAccount",
      "smartcoach_account",
      "smarttrak_account_key",
      "account",
      "tenant",
      "key",
      "locationName",
      "companyName",
      "client_reference_id",
      "clientReferenceId",
    ])
  );
}

function automationEventSummary(payload, options = {}) {
  const root = payload || {};
  const object = root.data && root.data.object || {};
  const sourceValue = firstAutomationValue(payload, ["updateSource", "source", "automationSource"]);
  const source = cleanSetupText(sourceValue || options.source || "automation");
  return {
    source,
    eventType: cleanSetupText(root.type || firstAutomationValue(payload, ["eventType", "event", "trigger"]) || object.object || "account_update"),
    stripeEventId: cleanSetupText(root.id && String(root.id).startsWith("evt_") ? root.id : ""),
    stripeObjectId: cleanSetupText(object.id || ""),
    receivedAt: new Date().toISOString(),
  };
}

function automationEventHistoryFor(existingHistory, event) {
  const history = Array.isArray(existingHistory) ? existingHistory.filter(Boolean) : [];
  const current = event || {};
  const key = automationEventKey(current);
  const withoutDuplicate = key ? history.filter((item) => automationEventKey(item) !== key) : history;
  return [current, ...withoutDuplicate].slice(0, 10);
}

function automationEventAlreadyRecorded(existingRecord, event) {
  const key = automationEventKey(event);
  if (!key || !existingRecord) return false;
  const history = Array.isArray(existingRecord.automationEventHistory) ? existingRecord.automationEventHistory : [];
  const events = [existingRecord.lastAutomationEvent, ...history].filter(Boolean);
  return events.some((item) => automationEventKey(item) === key);
}

function automationEventKey(event) {
  const source = event || {};
  if (source.stripeEventId) return `stripe:${source.stripeEventId}`;
  if (source.stripeObjectId && source.eventType) return `${source.eventType}:${source.stripeObjectId}`;
  if (source.source && source.eventType && source.receivedAt) return `${source.source}:${source.eventType}:${source.receivedAt}`;
  return "";
}

function accountEnvironmentRows({ suffix, account, includeCrm }) {
  const rows = [
    {
      key: `SMARTCOACH_PRODUCT_PLAN_${suffix}`,
      value: account.productPlan,
      required: true,
      label: "Plan",
      description: "Controls whether this account is Essential or Pro.",
    },
    {
      key: `SMARTCOACH_SUBSCRIPTION_STATUS_${suffix}`,
      value: account.subscription.status,
      required: false,
      recommended: true,
      label: "Subscription status",
      description: "Internal customer subscription status: active, trialing, past_due, paused, canceled, incomplete, incomplete_expired, or unpaid.",
    },
    {
      key: `SMARTCOACH_BILLING_CADENCE_${suffix}`,
      value: account.subscription.billingCadence,
      required: false,
      recommended: true,
      label: "Billing cadence",
      description: "Internal billing cadence for this customer: monthly or annual.",
    },
    {
      key: `SMARTCOACH_SUBSCRIPTION_AMOUNT_${suffix}`,
      value: account.subscription.amount,
      required: false,
      recommended: true,
      label: "Subscription amount",
      description: "Internal monthly or annual subscription amount. Active athlete limits are enforced by SMARTCoach.",
    },
    {
      key: `SMARTCOACH_RENEWAL_DATE_${suffix}`,
      value: account.subscription.renewalDate,
      required: false,
      recommended: true,
      label: "Renewal date",
      description: "Internal next renewal or billing date in YYYY-MM-DD format.",
    },
    {
      key: `SMARTCOACH_STRIPE_CUSTOMER_ID_${suffix}`,
      value: account.subscription.stripeCustomerId,
      required: false,
      label: "Stripe customer ID",
      description: "Optional internal billing reference. This is not shown in the coach-facing app.",
    },
    {
      key: `SMARTCOACH_STRIPE_SUBSCRIPTION_ID_${suffix}`,
      value: account.subscription.stripeSubscriptionId,
      required: false,
      label: "Stripe subscription ID",
      description: "Optional internal subscription reference. This is not shown in the coach-facing app.",
    },
    {
      key: `SMARTCOACH_SUBSCRIPTION_NOTES_${suffix}`,
      value: account.subscription.notes,
      required: false,
      label: "Subscription notes",
      description: "Optional internal notes about this customer subscription.",
    },
  ];
  rows.push(
    {
      key: `SMARTCOACH_COACH_SEATS_${suffix}`,
      value: String(account.coachSeats || 1),
      required: true,
      label: "Coach seats",
      description: isProPlan(account.productPlan) ? "Pro accounts use one shared coach code and include up to 10 assistant coach seats. Keep staff access tight to protect clean data." : "Essential allows one active device session at a time.",
    },
    {
      key: `SMARTCOACH_COACH_ACCESS_CODES_${suffix}`,
      value: (account.coachAccessCodes || []).join(","),
      required: true,
      label: "Coach access codes",
      description: isProPlan(account.productPlan) ? `Share the code only with active staff. This account is set for ${account.coachSeats || 1} assistant coach seat${(account.coachSeats || 1) === 1 ? "" : "s"}.` : "Essential requires an active code and allows one active device at a time.",
    },
    {
      key: `SMARTCOACH_REQUIRE_COACH_ACCESS_${suffix}`,
      value: account.requireCoachAccess === false ? "false" : "true",
      required: true,
      label: "Require coach access",
      description: "Blocks SMARTCoach until this account has an active coach access code configured.",
    }
  );
  if (includeCrm) {
    rows.push(
      {
        key: `GHL_PRIVATE_INTEGRATION_TOKEN_${suffix}`,
        value: account.token || "paste_customer_private_integration_token",
        required: true,
        label: "Private integration token",
        description: "Customer SMART Trak private integration token.",
      },
      {
        key: `GHL_LOCATION_ID_${suffix}`,
        value: account.locationId || "paste_customer_location_id",
        required: true,
        label: "Location ID",
        description: "Customer SMART Trak sub-account location ID.",
      },
      {
        key: `SMARTCOACH_PARENT_EMAIL_COACH_ACCESS_${suffix}`,
        value: parentEmailAccessIndexes(account.parentEmailCoachAccess).join(","),
        required: false,
        label: "Future parent email coaches",
        description: "Optional future release only. Use coach numbers like 1 or 1,3; tools stay hidden until the global parent email release flag is turned on.",
      }
    );
  }
  return rows;
}

function publicSubscriptionSummary(subscription) {
  const source = subscription || {};
  return {
    status: source.status || "",
    billingCadence: source.billingCadence || "",
    amount: source.amount || "",
    renewalDate: source.renewalDate || "",
  };
}

function normalizeSetupSubscriptionStatus(value) {
  const status = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  const aliases = {
    paid: "active",
    current: "active",
    subscribed: "active",
    trial: "trialing",
    trial_period: "trialing",
    payment_failed: "past_due",
    failed_payment: "past_due",
    failed: "past_due",
    overdue: "past_due",
    pastdue: "past_due",
    cancelled: "canceled",
    cancel: "canceled",
    stopped: "canceled",
    ended: "canceled",
    pause: "paused",
    suspended: "paused",
    open: "incomplete",
    pending: "incomplete",
    expired: "incomplete_expired",
    not_paid: "unpaid",
    no_payment: "unpaid",
  };
  const normalized = aliases[status] || status;
  return ["active", "trialing", "past_due", "paused", "canceled", "incomplete", "incomplete_expired", "unpaid"].includes(normalized) ? normalized : "incomplete";
}

function normalizeSetupBillingCadence(value) {
  const cadence = String(value || "").trim().toLowerCase();
  return cadence === "annual" || cadence === "year" || cadence === "yearly" ? "annual" : "monthly";
}

function normalizeSetupBoolean(value, fallback) {
  const raw = String(value === undefined || value === null ? "" : value).trim().toLowerCase();
  if (!raw) return !!fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return !!fallback;
}

function parentEmailFeatureReleased() {
  return normalizeSetupBoolean(process.env.SMARTCOACH_PARENT_EMAIL_FEATURE_ENABLED, false);
}

function normalizeMoneyAmount(value) {
  const raw = cleanSetupText(value);
  if (!raw) return "";
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && Math.abs(numeric) >= 100 && !raw.includes(".")) {
    return (numeric / 100).toFixed(2);
  }
  return raw;
}

function normalizeDateValue(value) {
  const raw = cleanSetupText(value);
  if (!raw) return "";
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 1000000000) {
    const milliseconds = numeric > 100000000000 ? numeric : numeric * 1000;
    return new Date(milliseconds).toISOString().slice(0, 10);
  }
  return raw;
}

function cleanSetupText(value) {
  return String(value || "").trim();
}

function normalizeSetupCoachCodes(value, accountKey, coachSeats, productPlan) {
  const codes = [];
  const add = (item) => {
    const code = cleanSetupText(item);
    if (code && !codes.includes(code)) codes.push(code);
  };
  if (Array.isArray(value)) value.forEach(add);
  else if (value) cleanSetupText(value).split(/[\n,]+/).forEach(add);
  return codes.slice(0, normalizeSetupCoachSeats(coachSeats, productPlan));
}

function normalizeParentEmailCoachAccess(value, coachSeats, productPlan) {
  const seats = normalizeSetupCoachSeats(coachSeats, productPlan);
  const allowed = Array.from({ length: seats }, () => false);
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const raw = cleanSetupText(item).toLowerCase();
      if (["1", "true", "yes", "on", "allow", "allowed", "enabled"].includes(raw)) allowed[index] = true;
      else {
        const number = Number(raw);
        if (Number.isFinite(number) && number >= 1 && number <= seats) allowed[number - 1] = true;
      }
    });
    return allowed;
  }
  const raw = cleanSetupText(value);
  if (!raw) return allowed;
  if (/^(all|true|yes|on|enabled)$/i.test(raw)) return allowed.map(() => true);
  raw.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean).forEach((item, index) => {
    const key = item.toLowerCase();
    if (["true", "yes", "on", "allow", "allowed", "enabled"].includes(key)) allowed[index] = true;
    const match = key.match(/(?:coach)?\s*(\d+)/);
    const number = match ? Number(match[1]) : Number(key);
    if (Number.isFinite(number) && number >= 1 && number <= seats) allowed[number - 1] = true;
  });
  return allowed;
}

function parentEmailAccessIndexes(value) {
  return (Array.isArray(value) ? value : []).map((allowed, index) => allowed ? String(index + 1) : "").filter(Boolean);
}

function suggestedSubscriptionAmount(productPlan, coachSeatsValue, billingCadence) {
  return planSubscriptionAmount(productPlan, billingCadence);
}

function setupAdminAllowed(req) {
  const expected = String(process.env.SMARTCOACH_ADMIN_SETUP_CODE || "").trim();
  if (!expected) return true;
  const provided = String((req.headers && (req.headers["x-smartcoach-setup-code"] || req.headers["X-SMARTCoach-Setup-Code"])) || firstQueryValue(req.query && req.query.setupCode) || "").trim();
  return provided && safeEqual(provided, expected);
}

function automationAllowed(req) {
  const expected = cleanSetupText(process.env.SMARTCOACH_AUTOMATION_SECRET);
  if (!expected) return false;
  const auth = cleanSetupText(req.headers && (req.headers.authorization || req.headers.Authorization));
  const bearer = auth.replace(/^Bearer\s+/i, "");
  const payload = requestBodyObject(req);
  const provided = cleanSetupText(
    (req.headers && (req.headers["x-smartcoach-automation-secret"] || req.headers["X-SMARTCoach-Automation-Secret"])) ||
      bearer ||
      firstQueryValue(req.query && req.query.automationSecret) ||
      firstQueryValue(req.query && req.query.secret) ||
      firstQueryValue(req.query && req.query.token) ||
      firstAutomationValue(payload, ["automationSecret", "smartcoachAutomationSecret", "SMARTCOACH_AUTOMATION_SECRET", "secret", "token"])
  );
  return provided && safeEqual(provided, expected);
}

function automationSecretDebug(req) {
  const headers = req && req.headers || {};
  const payload = requestBodyObject(req);
  const customData = payload && (payload.customData || payload.custom_data) || {};
  return {
    expectedConfigured: !!cleanSetupText(process.env.SMARTCOACH_AUTOMATION_SECRET),
    queryKeys: Object.keys(req && req.query || {}).sort(),
    hasQueryAutomationSecret: !!firstQueryValue(req && req.query && req.query.automationSecret),
    hasQuerySecret: !!firstQueryValue(req && req.query && req.query.secret),
    hasQueryToken: !!firstQueryValue(req && req.query && req.query.token),
    hasAutomationHeader: !!(headers["x-smartcoach-automation-secret"] || headers["X-SMARTCoach-Automation-Secret"]),
    hasAuthorizationHeader: !!(headers.authorization || headers.Authorization),
    bodyKeys: Object.keys(payload || {}).sort(),
    customDataKeys: customData && typeof customData === "object" ? Object.keys(customData).sort() : [],
    hasNestedAutomationSecret: !!firstAutomationValue(payload, ["automationSecret", "smartcoachAutomationSecret", "SMARTCOACH_AUTOMATION_SECRET", "secret", "token"]),
  };
}

function requestBodyObject(req) {
  if (!req || !req.body) return {};
  if (typeof req.body === "object" && !Buffer.isBuffer(req.body)) return req.body;
  try {
    const text = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body || "");
    return text ? JSON.parse(text) : {};
  } catch (error) {
    return {};
  }
}

function setAutomationHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Stripe-Signature, X-SMARTCoach-Automation-Secret");
}

function setSessionHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-SMARTCoach-Account, X-SMARTCoach-Access-Code, X-SMARTCoach-Session");
}

function setSmartTrakSecurityHeaders(res) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
}

function firstPayloadValue(payload, keys) {
  for (const key of keys) {
    const value = payload && payload[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function firstAutomationValue(payload, keys) {
  const candidates = automationPayloadCandidates(payload);
  for (const source of candidates) {
    for (const key of keys) {
      const value = source && source[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") return value;
    }
  }
  const nestedValue = findNestedAutomationValue(payload, keys);
  if (nestedValue !== undefined && nestedValue !== null && String(nestedValue).trim() !== "") return nestedValue;
  const stripeObject = payload && payload.data && payload.data.object;
  for (const key of keys) {
    const value = stripeNestedValue(stripeObject, key);
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}

function automationPayloadCandidates(payload) {
  const root = payload || {};
  const object = root.data && root.data.object || {};
  return [
    root,
    root.account,
    root.customer,
    root.subscription,
    root.customData,
    root.custom_data,
    root.metadata,
    object,
    object.metadata,
    object.customer_details,
    object.subscription_details && object.subscription_details.metadata,
    object.price,
    object.plan,
    object.recurring,
  ].filter(Boolean);
}

function findNestedAutomationValue(source, keys, seen = new Set()) {
  if (!source || typeof source !== "object") return "";
  if (seen.has(source)) return "";
  seen.add(source);
  const wanted = new Set(keys.map((key) => normalizeAutomationKey(key)));
  if (Array.isArray(source)) {
    for (const item of source) {
      if (item && typeof item === "object") {
        const pairKey = item.key || item.name || item.field || item.label;
        const pairValue = item.value || item.val || item.text;
        if (pairKey && wanted.has(normalizeAutomationKey(pairKey)) && pairValue !== undefined && pairValue !== null && String(pairValue).trim() !== "") return pairValue;
      }
      const nested = findNestedAutomationValue(item, keys, seen);
      if (nested !== undefined && nested !== null && String(nested).trim() !== "") return nested;
    }
    return "";
  }
  for (const [key, value] of Object.entries(source)) {
    if (wanted.has(normalizeAutomationKey(key)) && value !== undefined && value !== null && String(value).trim() !== "") return value;
    const nested = findNestedAutomationValue(value, keys, seen);
    if (nested !== undefined && nested !== null && String(nested).trim() !== "") return nested;
  }
  return "";
}

function normalizeAutomationKey(key) {
  return String(key || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function stripeNestedValue(object, key) {
  const source = object || {};
  if (key === "billingCadence" || key === "billingInterval" || key === "cadence" || key === "interval") {
    return source.items && source.items.data && source.items.data[0] && source.items.data[0].price && source.items.data[0].price.recurring && source.items.data[0].price.recurring.interval ||
      source.plan && source.plan.interval ||
      source.price && source.price.recurring && source.price.recurring.interval;
  }
  if (key === "subscriptionAmount" || key === "amount" || key === "price" || key === "unitAmount" || key === "unit_amount") {
    return source.amount_total || source.amount_paid || source.unit_amount ||
      source.items && source.items.data && source.items.data[0] && source.items.data[0].price && source.items.data[0].price.unit_amount ||
      source.plan && source.plan.amount ||
      source.price && source.price.unit_amount;
  }
  if (key === "renewalDate" || key === "renewsOn" || key === "nextBillingDate" || key === "currentPeriodEnd" || key === "current_period_end") {
    return source.current_period_end || source.currentPeriodEnd;
  }
  if (key === "stripeSubscriptionId" || key === "subscriptionId" || key === "subscription") {
    return typeof source.subscription === "string" ? source.subscription : source.id && String(source.object || "").includes("subscription") ? source.id : "";
  }
  return "";
}

async function requestBodyText(req) {
  if (typeof req.body === "string") return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  if (req.rawBody) return Buffer.isBuffer(req.rawBody) ? req.rawBody.toString("utf8") : String(req.rawBody);
  if (req.body && typeof req.body === "object") return JSON.stringify(req.body);
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function verifyStripeSignature(rawBody, signatureHeader, secret) {
  const parts = stripeSignatureParts(signatureHeader);
  const timestamp = parts.t && parts.t[0];
  const signatures = parts.v1 || [];
  if (!timestamp || !signatures.length) throw httpError(401, "Stripe signature is invalid.");
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) throw httpError(401, "Stripe signature timestamp is invalid.");
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds);
  if (ageSeconds > 5 * 60) throw httpError(401, "Stripe signature is too old.");
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
  if (!signatures.some((signature) => safeEqual(signature, expected))) {
    throw httpError(401, "Stripe signature could not be verified.");
  }
}

function stripeSignatureParts(header) {
  return String(header || "").split(",").reduce((parts, item) => {
    const index = item.indexOf("=");
    if (index < 1) return parts;
    const key = item.slice(0, index).trim();
    const value = item.slice(index + 1).trim();
    if (!parts[key]) parts[key] = [];
    parts[key].push(value);
    return parts;
  }, {});
}

function headerValue(req, name) {
  const headers = (req && req.headers) || {};
  return headers[name] || headers[name.toLowerCase()] || "";
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function safeEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

function suggestedAccessCode(accountKey) {
  const seed = `${accountKey || "customer"}-${Date.now()}-${Math.random()}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `sc-${String(hash >>> 0).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function suggestedCoachAccessCodes(accountKey, coachSeats, productPlan) {
  normalizeSetupCoachSeats(coachSeats, productPlan);
  return [suggestedAccessCode(accountKey)];
}
