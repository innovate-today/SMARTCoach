const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const SMARTCOACH_ACTIVE_FIELD_ID = "xepTMFvtaTwFdLVrOeQH";
const SMARTCOACH_ATHLETE_ID_FIELD_ID = "Vi7fmpkblrGZqZFyNBI2";
const { getGhlContext, requireProPlan } = require("../../lib/ghl-account");

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (!requireProPlan(req, res)) return;

  const { token, locationId } = getGhlContext(req);

  if (!token || !locationId) {
    res.status(500).json({ error: "SMART Trak athlete roster is not configured on the server." });
    return;
  }

  try {
    if (req.method === "GET") {
      const athletes = await listActiveAthletes({ token, locationId });
      res.status(200).json({ success: true, athletes });
      return;
    }

    if (req.method === "POST") {
      const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const athlete = await createOrActivateAthlete({ token, locationId, payload });
      res.status(200).json({ success: true, athlete });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Athlete roster request failed." });
  }
};

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-SMARTCoach-Account");
}

async function listActiveAthletes({ token, locationId }) {
  const genderFieldIds = await listContactFieldIds({ token, locationId, names: ["gender", "sex", "division"] });
  const result = await ghlFetch({
    token,
    path: `/contacts/?locationId=${encodeURIComponent(locationId)}&limit=100`,
    method: "GET",
  });

  return (result.contacts || [])
    .map((contact) => normalizeContact(contact, { genderFieldIds }))
    .filter((athlete) => athlete.smartcoachActive || (athlete.smartcoachAthleteId && athlete.tags.indexOf("smartcoach-athlete") >= 0))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function listContactFieldIds({ token, locationId, names }) {
  try {
    const result = await ghlFetch({
      token,
      path: `/locations/${encodeURIComponent(locationId)}/customFields`,
      method: "GET",
    });
    const wanted = names.map((name) => clean(name).toLowerCase()).filter(Boolean);
    return customFieldsFromResult(result).filter((field) => {
      const labels = [
        field.id,
        field.key,
        field.fieldKey,
        field.field_key,
        field.name,
        field.fieldName,
        field.field_name,
        field.label,
      ].map((value) => clean(value).toLowerCase());
      return labels.some((label) => {
        if (wanted.includes(label)) return true;
        const simple = label.split(".").pop().split("_").pop();
        return wanted.includes(simple);
      });
    }).map((field) => clean(field.id || field.fieldId || field.customFieldId)).filter(Boolean);
  } catch (error) {
    return [];
  }
}

async function createOrActivateAthlete({ token, locationId, payload }) {
  const name = clean(payload && payload.name);
  const contactId = clean(payload && payload.contactId);

  if (!name && !contactId) {
    throw httpError(400, "Athlete name or contact ID is required.");
  }

  const contact = contactId
    ? await getContact({ token, contactId })
    : await findOrCreateContact({ token, locationId, athleteName: name });

  await addTags({ token, contactId: contact.id, tags: ["smartcoach-athlete"] });
  await updateSmartCoachFields({ token, contact, athleteName: name || contact.name || contact.firstName || "" });

  const updated = await getContact({ token, contactId: contact.id });
  return normalizeContact(updated);
}

async function findOrCreateContact({ token, locationId, athleteName }) {
  const existing = await findExistingContact({ token, locationId, athleteName });
  if (existing) return existing;

  const nameParts = athleteName.split(/\s+/);
  const firstName = nameParts.shift() || athleteName;
  const lastName = nameParts.join(" ");
  const created = await ghlFetch({
    token,
    path: "/contacts/",
    method: "POST",
    body: {
      firstName,
      lastName,
      locationId,
      source: "SMARTCoach",
      tags: ["smartcoach-athlete"],
    },
  });

  const contact = created.contact || created;
  if (!contact || !contact.id) {
    throw httpError(502, `SMART Trak did not return a contact for ${athleteName}.`);
  }
  return contact;
}

async function findExistingContact({ token, locationId, athleteName }) {
  const result = await ghlFetch({
    token,
    path: `/contacts/?locationId=${encodeURIComponent(locationId)}&query=${encodeURIComponent(athleteName)}&limit=10`,
    method: "GET",
  });

  const normalizedName = athleteName.toLowerCase();
  return (result.contacts || []).find((contact) => contactName(contact).toLowerCase() === normalizedName) || null;
}

async function getContact({ token, contactId }) {
  const result = await ghlFetch({
    token,
    path: `/contacts/${encodeURIComponent(contactId)}`,
    method: "GET",
  });

  return result.contact || result;
}

async function addTags({ token, contactId, tags }) {
  try {
    await ghlFetch({
      token,
      path: `/contacts/${encodeURIComponent(contactId)}/tags`,
      method: "POST",
      body: { tags },
    });
  } catch (error) {
    if (error.statusCode !== 404) throw error;
  }
}

async function updateSmartCoachFields({ token, contact, athleteName }) {
  const smartcoachAthleteId = existingCustomFieldValue(contact, SMARTCOACH_ATHLETE_ID_FIELD_ID) || buildAthleteId(athleteName || contactName(contact));

  await ghlFetch({
    token,
    path: `/contacts/${encodeURIComponent(contact.id)}`,
    method: "PUT",
    body: {
      customFields: [
        { id: SMARTCOACH_ACTIVE_FIELD_ID, value: "Yes" },
        { id: SMARTCOACH_ATHLETE_ID_FIELD_ID, value: smartcoachAthleteId },
      ],
    },
  });
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

  if (!response.ok) {
    throw httpError(response.status, data.message || data.error || `GHL request failed with ${response.status}.`);
  }

  return data;
}

function normalizeContact(contact, options = {}) {
  const smartcoachActiveValue = existingCustomFieldValue(contact, SMARTCOACH_ACTIVE_FIELD_ID);
  return {
    id: contact.id,
    name: contactName(contact),
    firstName: clean(contact.firstName),
    lastName: clean(contact.lastName),
    gender: contactGender(contact, options.genderFieldIds),
    smartcoachActive: isActiveValue(smartcoachActiveValue),
    smartcoachActiveValue,
    smartcoachAthleteId: existingCustomFieldValue(contact, SMARTCOACH_ATHLETE_ID_FIELD_ID),
    tags: Array.isArray(contact.tags) ? contact.tags : [],
  };
}

function contactGender(contact, genderFieldIds = []) {
  const fieldValue = genderFieldIds.map((fieldId) => existingCustomFieldValue(contact, fieldId)).find(Boolean);
  return clean(
    contact && (contact.gender || contact.sex || contact.genderIdentity)
  ) || fieldValue || existingCustomFieldValueByName(contact, ["gender", "sex", "division"]);
}

function contactName(contact) {
  return clean(contact.name) || `${clean(contact.firstName)} ${clean(contact.lastName)}`.trim();
}

function existingCustomFieldValue(contact, fieldId) {
  const fields = customFieldList(contact);
  const field = fields.find((item) => {
    if (!item) return false;
    return item.id === fieldId || item.fieldId === fieldId || item.field_id === fieldId || item.customFieldId === fieldId;
  });
  if (!field) return "";
  return fieldValue(field);
}

function existingCustomFieldValueByName(contact, names) {
  const wanted = names.map((name) => clean(name).toLowerCase()).filter(Boolean);
  const field = customFieldList(contact).find((item) => {
    if (!item) return false;
    const labels = [
      item.id,
      item.fieldId,
      item.field_id,
      item.customFieldId,
      item.key,
      item.fieldKey,
      item.field_key,
      item.name,
      item.fieldName,
      item.field_name,
      item.label,
    ].map((value) => clean(value).toLowerCase());
    return labels.some((label) => {
      if (wanted.includes(label)) return true;
      const simple = label.split(".").pop().split("_").pop();
      return wanted.includes(simple);
    });
  });
  return field ? fieldValue(field) : "";
}

function isActiveValue(value) {
  return /^(yes|y|true|active|1|on)$/i.test(clean(value));
}

function customFieldList(contact) {
  if (!contact) return [];
  if (Array.isArray(contact.customFields)) return contact.customFields;
  if (Array.isArray(contact.customField)) return contact.customField;
  if (Array.isArray(contact.customFieldsData)) return contact.customFieldsData;
  if (contact.customFields && typeof contact.customFields === "object") {
    return Object.keys(contact.customFields).map((key) => ({
      id: key,
      value: contact.customFields[key],
    }));
  }
  return [];
}

function customFieldsFromResult(result) {
  return [
    ...(Array.isArray(result && result.customFields) ? result.customFields : []),
    ...(Array.isArray(result && result.fields) ? result.fields : []),
    ...(Array.isArray(result && result.data && result.data.customFields) ? result.data.customFields : []),
    ...(Array.isArray(result && result.data && result.data.fields) ? result.data.fields : []),
  ];
}

function fieldValue(field) {
  const value = firstPresent([
    field.value,
    field.fieldValue,
    field.field_value,
    field.valueString,
    field.value_string,
  ]);

  if (Array.isArray(value)) {
    return value.map(fieldValuePart).filter(Boolean).join(", ");
  }
  return fieldValuePart(value);
}

function fieldValuePart(value) {
  if (value === null || typeof value === "undefined") return "";
  if (typeof value === "object") {
    return clean(value.value || value.name || value.label || value.key || value.id);
  }
  return clean(value);
}

function firstPresent(values) {
  for (const value of values) {
    if (value !== null && typeof value !== "undefined" && value !== "") return value;
  }
  return "";
}

function buildAthleteId(name) {
  return `sca_${slugValue(name).replace(/-/g, "_") || "athlete"}`;
}

function slugValue(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function clean(value) {
  return String(value || "").trim();
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch (error) {
    return { message: text };
  }
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
