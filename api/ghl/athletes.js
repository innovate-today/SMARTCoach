const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const SMARTCOACH_ACTIVE_FIELD_ID = "xepTMFvtaTwFdLVrOeQH";
const SMARTCOACH_ATHLETE_ID_FIELD_ID = "Vi7fmpkblrGZqZFyNBI2";
const { getGhlContext, requireProPlan } = require("../../lib/ghl-account");

const ATHLETE_FIELD_ALIASES = {
  gender: ["gender", "sex", "division"],
  grade: ["grade", "class", "graduation year", "graduation_year", "grad year"],
  parentGuardianName: ["parent_guardian_name", "parent guardian name", "parent/guardian name", "guardian name", "parent name"],
  parentGuardianEmail: ["parent_guardian_email", "parent guardian email", "parent/guardian email", "guardian email", "parent email"],
  parentGuardianPhone: ["parent_guardian_phone", "parent guardian phone", "parent/guardian phone", "guardian phone", "parent phone"],
  parentGuardian2Name: ["parent_guardian_2_name", "parent guardian 2 name", "parent/guardian 2 name", "guardian 2 name", "second parent name"],
  parentGuardian2Email: ["parent_guardian_2_email", "parent guardian 2 email", "parent/guardian 2 email", "guardian 2 email", "second parent email"],
  parentGuardian2Phone: ["parent_guardian_2_phone", "parent guardian 2 phone", "parent/guardian 2 phone", "guardian 2 phone", "second parent phone"],
  coachNotes: ["smartcoach_notes", "smartcoach athlete notes", "coach notes", "notes"],
};

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
      const includeContacts = /^(yes|true|1)$/i.test(clean(req.query && (req.query.includeContacts || req.query.allContacts)));
      const athletes = await listSmartCoachAthletes({ token, locationId, includeContacts });
      res.status(200).json({ success: true, athletes });
      return;
    }

    if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
      const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      const athlete = await createOrUpdateAthlete({ token, locationId, payload });
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
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-SMARTCoach-Account");
}

async function listSmartCoachAthletes({ token, locationId, includeContacts = false }) {
  const rosterFieldIds = await resolveRosterFieldIds({ token, locationId });
  const result = await ghlFetch({
    token,
    path: `/contacts/?locationId=${encodeURIComponent(locationId)}&limit=100`,
    method: "GET",
  });

  return (result.contacts || [])
    .map((contact) => normalizeContact(contact, { rosterFieldIds }))
    .filter((athlete) => includeContacts || athlete.smartcoachActive || (athlete.smartcoachAthleteId && athlete.tags.indexOf("smartcoach-athlete") >= 0))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function resolveRosterFieldIds({ token, locationId }) {
  try {
    const result = await ghlFetch({
      token,
      path: `/locations/${encodeURIComponent(locationId)}/customFields`,
      method: "GET",
    });
    const fields = customFieldsFromResult(result);
    return Object.keys(ATHLETE_FIELD_ALIASES).reduce((memo, key) => {
      memo[key] = matchingContactFieldIds(fields, ATHLETE_FIELD_ALIASES[key]);
      return memo;
    }, {});
  } catch (error) {
    return {};
  }
}

async function createOrUpdateAthlete({ token, locationId, payload }) {
  const rosterFieldIds = await resolveRosterFieldIds({ token, locationId });
  const firstName = clean(payload && payload.firstName);
  const lastName = clean(payload && payload.lastName);
  const name = clean(payload && payload.name) || `${firstName} ${lastName}`.trim();
  const contactId = clean(payload && payload.contactId);

  if (!name && !contactId) {
    throw httpError(400, "Athlete name or contact ID is required.");
  }

  const contact = contactId
    ? await getContact({ token, contactId })
    : await findOrCreateContact({ token, locationId, athleteName: name });

  await addTags({ token, contactId: contact.id, tags: ["smartcoach-athlete"] });
  await updateAthleteContact({
    token,
    contact,
    athleteName: name || contactName(contact),
    payload,
    rosterFieldIds,
  });

  const updated = await getContact({ token, contactId: contact.id });
  return normalizeContact(updated, { rosterFieldIds });
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

async function updateAthleteContact({ token, contact, athleteName, payload, rosterFieldIds }) {
  const smartcoachAthleteId = clean(payload && payload.smartcoachAthleteId) || existingCustomFieldValue(contact, SMARTCOACH_ATHLETE_ID_FIELD_ID) || buildAthleteId(athleteName || contactName(contact));
  const activeValue = payload && Object.prototype.hasOwnProperty.call(payload, "smartcoachActive")
    ? (truthy(payload.smartcoachActive) ? "Yes" : "No")
    : "Yes";
  const customFields = [
    { id: SMARTCOACH_ACTIVE_FIELD_ID, value: activeValue },
    { id: SMARTCOACH_ATHLETE_ID_FIELD_ID, value: smartcoachAthleteId },
  ];

  addCustomFieldValue(customFields, rosterFieldIds.gender, payload && payload.gender);
  addCustomFieldValue(customFields, rosterFieldIds.grade, payload && payload.grade);
  addCustomFieldValue(customFields, rosterFieldIds.parentGuardianName, payload && payload.parentGuardianName);
  addCustomFieldValue(customFields, rosterFieldIds.parentGuardianEmail, payload && payload.parentGuardianEmail);
  addCustomFieldValue(customFields, rosterFieldIds.parentGuardianPhone, payload && payload.parentGuardianPhone);
  addCustomFieldValue(customFields, rosterFieldIds.parentGuardian2Name, payload && payload.parentGuardian2Name);
  addCustomFieldValue(customFields, rosterFieldIds.parentGuardian2Email, payload && payload.parentGuardian2Email);
  addCustomFieldValue(customFields, rosterFieldIds.parentGuardian2Phone, payload && payload.parentGuardian2Phone);
  addCustomFieldValue(customFields, rosterFieldIds.coachNotes, payload && payload.coachNotes);

  const body = { customFields };
  const cleanFirst = clean(payload && payload.firstName);
  const cleanLast = clean(payload && payload.lastName);
  const cleanEmail = clean(payload && payload.email);
  const cleanPhone = clean(payload && payload.phone);
  if (cleanFirst) body.firstName = cleanFirst;
  if (cleanFirst || cleanLast) body.lastName = cleanLast;
  if (cleanEmail) body.email = cleanEmail;
  if (cleanPhone) body.phone = cleanPhone;

  await ghlFetch({
    token,
    path: `/contacts/${encodeURIComponent(contact.id)}`,
    method: "PUT",
    body,
  });
}

function addCustomFieldValue(customFields, fieldIds, value) {
  const id = Array.isArray(fieldIds) && fieldIds.length ? fieldIds[0] : "";
  if (!id || typeof value === "undefined") return;
  customFields.push({ id, value: clean(value) });
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
  const rosterFieldIds = options.rosterFieldIds || {};
  const smartcoachActiveValue = existingCustomFieldValue(contact, SMARTCOACH_ACTIVE_FIELD_ID);
  return {
    id: contact.id,
    name: contactName(contact),
    firstName: clean(contact.firstName),
    lastName: clean(contact.lastName),
    email: clean(contact.email),
    phone: clean(contact.phone),
    gender: contactGender(contact, rosterFieldIds.gender),
    grade: contactFieldByIdsOrNames(contact, rosterFieldIds.grade, ATHLETE_FIELD_ALIASES.grade),
    parentGuardianName: contactFieldByIdsOrNames(contact, rosterFieldIds.parentGuardianName, ATHLETE_FIELD_ALIASES.parentGuardianName),
    parentGuardianEmail: contactFieldByIdsOrNames(contact, rosterFieldIds.parentGuardianEmail, ATHLETE_FIELD_ALIASES.parentGuardianEmail),
    parentGuardianPhone: contactFieldByIdsOrNames(contact, rosterFieldIds.parentGuardianPhone, ATHLETE_FIELD_ALIASES.parentGuardianPhone),
    parentGuardian2Name: contactFieldByIdsOrNames(contact, rosterFieldIds.parentGuardian2Name, ATHLETE_FIELD_ALIASES.parentGuardian2Name),
    parentGuardian2Email: contactFieldByIdsOrNames(contact, rosterFieldIds.parentGuardian2Email, ATHLETE_FIELD_ALIASES.parentGuardian2Email),
    parentGuardian2Phone: contactFieldByIdsOrNames(contact, rosterFieldIds.parentGuardian2Phone, ATHLETE_FIELD_ALIASES.parentGuardian2Phone),
    coachNotes: contactFieldByIdsOrNames(contact, rosterFieldIds.coachNotes, ATHLETE_FIELD_ALIASES.coachNotes),
    smartcoachActive: isActiveValue(smartcoachActiveValue),
    smartcoachActiveValue,
    smartcoachAthleteId: existingCustomFieldValue(contact, SMARTCOACH_ATHLETE_ID_FIELD_ID),
    tags: Array.isArray(contact.tags) ? contact.tags : [],
  };
}

function contactGender(contact, genderFieldIds = []) {
  const fieldValue = (genderFieldIds || []).map((fieldId) => existingCustomFieldValue(contact, fieldId)).find(Boolean);
  return clean(contact && (contact.gender || contact.sex || contact.genderIdentity)) || fieldValue || existingCustomFieldValueByName(contact, ATHLETE_FIELD_ALIASES.gender);
}

function contactFieldByIdsOrNames(contact, fieldIds = [], names = []) {
  return (fieldIds || []).map((fieldId) => existingCustomFieldValue(contact, fieldId)).find(Boolean) || existingCustomFieldValueByName(contact, names);
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
  const wanted = names.map(normalizeFieldLabel).filter(Boolean);
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
    ].map(normalizeFieldLabel);
    return labels.some((label) => wanted.includes(label) || wanted.includes(label.split(".").pop()));
  });
  return field ? fieldValue(field) : "";
}

function matchingContactFieldIds(fields, names) {
  const wanted = names.map(normalizeFieldLabel).filter(Boolean);
  return fields.filter((field) => {
    const labels = [
      field.id,
      field.key,
      field.fieldKey,
      field.field_key,
      field.name,
      field.fieldName,
      field.field_name,
      field.label,
    ].map(normalizeFieldLabel);
    return labels.some((label) => wanted.includes(label) || wanted.includes(label.split(".").pop()));
  }).map((field) => clean(field.id || field.fieldId || field.customFieldId)).filter(Boolean);
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

function truthy(value) {
  if (typeof value === "boolean") return value;
  return /^(yes|y|true|active|1|on)$/i.test(clean(value));
}

function normalizeFieldLabel(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
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
