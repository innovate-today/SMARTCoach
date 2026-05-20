const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const TRAINING_PLAN_SCHEMA_KEY = "custom_objects.training_plans";
const GROUPS_SOURCE_ID = "smartcoach_training_groups";
const { getGhlContext, requireProPlan } = require("../../lib/ghl-account");

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (!requireProPlan(req, res)) return;

  if (req.method !== "GET" && req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { token, locationId } = getGhlContext(req);
  if (!token || !locationId) {
    res.status(500).json({ error: "SMART Trak groups are not configured on the server." });
    return;
  }

  try {
    if (req.method === "GET") {
      const state = await loadGroupsState({ token, locationId });
      res.status(200).json({ success: true, groups: state.groups, updatedAt: state.updatedAt });
      return;
    }

    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const groups = normalizeGroups(payload && payload.groups);
    const state = await saveGroupsState({ token, locationId, groups });
    res.status(200).json({ success: true, groups: state.groups, updatedAt: state.updatedAt });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Training groups request failed." });
  }
};

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-SMARTCoach-Account, X-SMARTCoach-Access-Code");
}

async function loadGroupsState({ token, locationId }) {
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

async function saveGroupsState({ token, locationId, groups }) {
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
  return [
    "[SMARTCoach Groups]",
    JSON.stringify({ updatedAt: state.updatedAt, groups: state.groups }, null, 2),
    "[/SMARTCoach Groups]",
  ].join("\n");
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
