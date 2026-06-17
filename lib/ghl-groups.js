const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const TRAINING_PLAN_SCHEMA_KEY = "custom_objects.training_plans";
const GROUPS_SOURCE_ID = "smartcoach_training_groups";
const GROUPS_BLOCK_LIMIT = 11500;
const { getGhlContext, requireProPlan } = require("./ghl-account");
const { attachRegistryAccount, setSmartTrakSecurityHeaders } = require("./smart-trak-request");
const { loadAccountRecord, saveAccountRecord } = require("./account-registry");

module.exports = async function handler(req, res) {
  setSmartTrakSecurityHeaders(res);
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  await attachRegistryAccount(req);

  if (!requireProPlan(req, res)) return;

  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { token, locationId, accountKey } = getGhlContext(req);
  if (!token || !locationId) {
    res.status(500).json({ error: "SMART Trak groups are not configured on the server." });
    return;
  }

  try {
    if (req.method === "GET") {
      const state = await loadGroupsState({ token, locationId, accountKey });
      res.status(200).json({ success: true, groups: state.groups, updatedAt: state.updatedAt });
      return;
    }

    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const incomingGroups = normalizeGroups(payload && payload.groups);
    const deleteGroupIds = normalizeDeleteGroupIds(payload && payload.deleteGroupIds);
    const existingState = await loadGroupsState({ token, locationId, accountKey });
    const groups = mergeGroups(existingState.groups, incomingGroups, deleteGroupIds);
    const state = await saveGroupsState({ token, locationId, accountKey, groups });
    res.status(200).json({ success: true, groups: state.groups, updatedAt: state.updatedAt });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Training groups request failed." });
  }
};

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-SMARTCoach-Account, X-SMARTCoach-Access-Code, X-SMARTCoach-Session");
}

async function loadGroupsState({ token, locationId, accountKey }) {
  if (accountKey && accountKey !== "default") {
    const existing = await loadAccountRecord(accountKey);
    const saved = existing && existing.record && existing.record.smartcoachGroups;
    if (saved && typeof saved === "object") {
      return {
        groups: normalizeGroups(saved.groups),
        updatedAt: clean(saved.updatedAt),
      };
    }
    return { groups: [], updatedAt: "" };
  }

  const record = await findGroupsRecord({ token, locationId });
  if (!record) return { groups: [], updatedAt: "" };
  const props = recordProperties(record);
  const parsed = parseGroupsBlock(prop(props, "school_constraints"));
  return {
    recordId: record.id || "",
    groups: normalizeGroups(parsed.groups),
    updatedAt: parsed.updatedAt || record.updatedAt || record.dateUpdated || "",
  };
}

async function saveGroupsState({ token, locationId, accountKey, groups }) {
  if (accountKey && accountKey !== "default") {
    const existing = await loadAccountRecord(accountKey);
    if (!existing.configured || !existing.found || !existing.record) {
      throw httpError(404, "Account registry record was not found.");
    }
    const updatedAt = new Date().toISOString();
    await saveAccountRecord(accountKey, {
      ...existing.record,
      smartcoachGroups: { groups, updatedAt },
      lastGroupsSync: { savedAt: updatedAt, count: groups.length },
    });
    return { groups, updatedAt };
  }

  const existing = await findGroupsRecord({ token, locationId });
  const updatedAt = new Date().toISOString();
  const properties = {
    training_plan: "SMARTCoach Training Groups",
    workout_title: "SMARTCoach Training Groups",
    workout_description: "System record for synced app and desktop training group rosters.",
    source_system: "SMARTCoach",
    source_record_id: GROUPS_SOURCE_ID,
    plan_scope: "team",
    approval_status: "approved",
    school_constraints: groupsBlockText({ groups, updatedAt }),
  };

  if (existing && existing.id) {
    await ghlFetch({
      token,
      path: `/objects/${encodeURIComponent(TRAINING_PLAN_SCHEMA_KEY)}/records/${encodeURIComponent(existing.id)}?locationId=${encodeURIComponent(locationId)}`,
      method: "PUT",
      body: { properties },
    });
  } else {
    await createGroupsRecord({ token, locationId, properties });
  }

  return { groups, updatedAt };
}

async function createGroupsRecord({ token, locationId, properties }) {
  try {
    return await ghlFetch({
      token,
      path: `/objects/${encodeURIComponent(TRAINING_PLAN_SCHEMA_KEY)}/records`,
      method: "POST",
      body: { locationId, properties },
    });
  } catch (error) {
    const fallback = { ...properties };
    delete fallback.plan_scope;
    delete fallback.approval_status;
    return ghlFetch({
      token,
      path: `/objects/${encodeURIComponent(TRAINING_PLAN_SCHEMA_KEY)}/records`,
      method: "POST",
      body: { locationId, properties: fallback },
    });
  }
}

async function findGroupsRecord({ token, locationId }) {
  const result = await ghlFetch({
    token,
    path: `/objects/${encodeURIComponent(TRAINING_PLAN_SCHEMA_KEY)}/records/search`,
    method: "POST",
    body: { locationId, page: 1, pageLimit: 100 },
  });
  return recordsFromResult(result).find((record) => {
    const props = recordProperties(record);
    return prop(props, "source_record_id") === GROUPS_SOURCE_ID;
  }) || null;
}

function groupsBlockText(state) {
  const candidates = [
    compactGroupsPayload(state, "standard"),
    compactGroupsPayload(state, "tight"),
    compactGroupsPayload(state, "minimum"),
  ];
  for (const payload of candidates) {
    const block = wrapGroupsBlock(payload);
    if (block.length <= GROUPS_BLOCK_LIMIT) return block;
  }
  const block = wrapGroupsBlock(candidates[candidates.length - 1]);
  if (block.length > 12000) {
    throw httpError(413, "SMARTCoach groups are too large to save. Archive unused groups or split this roster into fewer shared groups, then try again.");
  }
  return block;
}

function wrapGroupsBlock(payload) {
  return ["[SMARTCoach Groups]", JSON.stringify(payload), "[/SMARTCoach Groups]"].join("\n");
}

function compactGroupsPayload(state, mode) {
  return {
    updatedAt: state.updatedAt,
    groups: (Array.isArray(state.groups) ? state.groups : []).map((group) => compactGroup(group, mode)).filter(Boolean),
  };
}

function compactGroup(group, mode) {
  const name = clean(group && group.name);
  if (!name) return null;
  const item = {
    id: clean(group.id) || `grp_${slugValue(name)}`,
    name,
  };
  if (mode === "standard") {
    item.type = clean(group.type) === "meet" ? "meet" : "training";
    if (clean(group.season)) item.season = clean(group.season);
    if (Number(group.seasonYear)) item.seasonYear = Number(group.seasonYear);
    if (group.archived) item.archived = true;
    if (clean(group.updatedAt)) item.updatedAt = clean(group.updatedAt);
  } else if (group.archived) {
    item.archived = true;
  }
  const athletes = compactAthletes(group.athletes, mode);
  if (athletes.length) item.athletes = athletes;
  return item;
}

function compactAthletes(athletes, mode) {
  return normalizeAthletes(athletes).map((athlete) => {
    const item = {};
    if (athlete.contactId) item.contactId = athlete.contactId;
    if (athlete.name) item.name = athlete.name;
    if (mode === "standard" && athlete.smartcoachAthleteId && !athlete.contactId) {
      item.smartcoachAthleteId = athlete.smartcoachAthleteId;
    }
    if (mode === "minimum") {
      if (item.contactId) return { contactId: item.contactId, name: item.name };
      if (athlete.smartcoachAthleteId) return { smartcoachAthleteId: athlete.smartcoachAthleteId, name: item.name };
    }
    return item;
  }).filter((athlete) => athlete.contactId || athlete.smartcoachAthleteId || athlete.name);
}

function parseGroupsBlock(text) {
  const match = clean(text).match(/\[SMARTCoach Groups\]\s*([\s\S]*?)\s*\[\/SMARTCoach Groups\]/i);
  if (!match) return { groups: [], updatedAt: "" };
  try {
    const parsed = JSON.parse(match[1]);
    return {
      groups: normalizeGroups(parsed.groups),
      updatedAt: clean(parsed.updatedAt),
    };
  } catch (error) {
    return { groups: [], updatedAt: "" };
  }
}

function normalizeGroups(groups) {
  const seen = {};
  return (Array.isArray(groups) ? groups : []).map((group) => {
    const name = clean(group && group.name);
    if (!name) return null;
    const id = clean(group.id) || `grp_${slugValue(name)}`;
    if (seen[id]) return null;
    seen[id] = true;
    return {
      id,
      name,
      type: clean(group.type) === "meet" ? "meet" : "training",
      season: clean(group.season),
      seasonYear: Number(group.seasonYear) || null,
      archived: !!group.archived,
      athletes: normalizeAthletes(group.athletes),
      updatedAt: clean(group.updatedAt),
    };
  }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}

function mergeGroups(existingGroups, incomingGroups, deleteGroupIds) {
  const deleted = {};
  deleteGroupIds.forEach((id) => {
    if (id) deleted[id] = true;
  });
  const byKey = new Map();
  const nameToKey = new Map();
  normalizeGroups(existingGroups).forEach((group) => {
    const key = groupMergeKey(group);
    if (key && !deleted[group.id]) {
      byKey.set(key, group);
      const nameKey = groupNameKey(group);
      if (nameKey) nameToKey.set(nameKey, key);
    }
  });
  normalizeGroups(incomingGroups).forEach((group) => {
    if (deleted[group.id]) return;
    const nameKey = groupNameKey(group);
    const previousNameKey = nameKey ? nameToKey.get(nameKey) : "";
    const key = previousNameKey || groupMergeKey(group);
    if (!key) return;
    const previous = byKey.get(key) || {};
    byKey.set(key, {
      ...previous,
      ...group,
      athletes: group.athletes,
      updatedAt: group.updatedAt || previous.updatedAt,
    });
    if (nameKey) nameToKey.set(nameKey, key);
  });
  return normalizeGroups(Array.from(byKey.values()));
}

function groupMergeKey(group) {
  const id = clean(group && group.id);
  if (id) return `id:${id}`;
  const name = clean(group && group.name).toLowerCase();
  return name ? `name:${name}` : "";
}

function normalizeDeleteGroupIds(values) {
  return (Array.isArray(values) ? values : []).map((value) => clean(value)).filter(Boolean);
}

function groupNameKey(group) {
  const name = clean(group && group.name).toLowerCase();
  return name ? `name:${name}` : "";
}

function normalizeAthletes(athletes) {
  const seen = {};
  return (Array.isArray(athletes) ? athletes : []).map((athlete) => {
    const contactId = clean(athlete && athlete.contactId);
    const name = clean(athlete && athlete.name);
    const key = contactId || name.toLowerCase();
    if (!key || seen[key]) return null;
    seen[key] = true;
    return {
      contactId,
      smartcoachAthleteId: clean(athlete && athlete.smartcoachAthleteId),
      name,
    };
  }).filter((athlete) => athlete.name || athlete.contactId);
}

async function ghlFetch({ token, path, method, body }) {
  const response = await fetch(`${GHL_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Version: GHL_VERSION,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text ? safeJson(text) : {};
  if (!response.ok) throw httpError(response.status, data.message || data.error || `GHL request failed with ${response.status}.`);
  return data;
}

function recordsFromResult(result) {
  return [
    ...(Array.isArray(result && result.records) ? result.records : []),
    ...(Array.isArray(result && result.items) ? result.items : []),
    ...(Array.isArray(result && result.data && result.data.records) ? result.data.records : []),
    ...(Array.isArray(result && result.data && result.data.items) ? result.data.items : []),
  ];
}

function recordProperties(record) {
  return (record && (record.properties || record.customFields || record.data && record.data.properties)) || {};
}

function prop(props, key) {
  const keys = [key, `custom_objects.training_plans.${key}`];
  for (const item of keys) {
    const value = props && props[item];
    const normalized = propValue(value);
    if (normalized) return normalized;
  }
  return "";
}

function propValue(value) {
  if (Array.isArray(value)) return value.map(propValue).filter(Boolean).join(", ");
  if (value && typeof value === "object") return clean(value.value || value.name || value.label || value.id);
  return clean(value);
}

function slugValue(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "group";
}

function clean(value) {
  return String(value || "").trim();
}

function safeJson(text) {
  try { return JSON.parse(text); } catch (error) { return { message: text }; }
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
