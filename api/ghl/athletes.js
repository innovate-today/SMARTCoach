const crypto = require("crypto");
const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const ATHLETE_BEST_SCHEMA_KEY = "custom_objects.athlete_bests";
const SMARTCOACH_ACTIVE_FIELD_ID = "xepTMFvtaTwFdLVrOeQH";
const SMARTCOACH_ATHLETE_ID_FIELD_ID = "Vi7fmpkblrGZqZFyNBI2";
const CLASS_YEAR_TAG_PREFIX = "smartcoach-class-";
const { getGhlContext, requireProPlan } = require("../../lib/ghl-account");
const { attachRegistryAccount, setSmartTrakSecurityHeaders } = require("../../lib/smart-trak-request");

const ATHLETE_FIELD_ALIASES = {
  smartcoachActive: ["smartcoach active", "smartcoach_active", "active athlete", "athlete active"],
  smartcoachAthleteId: ["smartcoach athlete id", "smartcoach_athlete_id", "athlete id", "smartcoach id"],
  gender: ["gender", "sex", "division"],
  grade: ["graduation year", "graduation_year", "grad year", "class year", "class_year", "class", "grade"],
  parentGuardianName: ["parent_guardian_name", "parent guardian name", "parent/guardian name", "guardian name", "parent name"],
  parentGuardianEmail: ["parent_guardian_email", "parent guardian email", "parent/guardian email", "guardian email", "parent email"],
  parentGuardianPhone: ["parent_guardian_phone", "parent guardian phone", "parent/guardian phone", "guardian phone", "parent phone"],
  parentGuardian2Name: ["parent_guardian_2_name", "parent guardian 2 name", "parent/guardian 2 name", "guardian 2 name", "second parent name"],
  parentGuardian2Email: ["parent_guardian_2_email", "parent guardian 2 email", "parent/guardian 2 email", "guardian 2 email", "second parent email"],
  parentGuardian2Phone: ["parent_guardian_2_phone", "parent guardian 2 phone", "parent/guardian 2 phone", "guardian 2 phone", "second parent phone"],
  coachNotes: ["smartcoach_notes", "smartcoach athlete notes", "coach notes", "notes"],
};

async function handler(req, res) {
  setSmartTrakSecurityHeaders(res);
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  await attachRegistryAccount(req);

  if (!requireProPlan(req, res)) return;

  const { accountKey, token, locationId, activeAthleteLimit, productPlanLabel } = getGhlContext(req);

  if (!token || !locationId) {
    res.status(500).json({ error: "SMART Trak athlete roster is not configured on the server." });
    return;
  }

  try {
    if (req.method === "GET") {
      const includeContacts = /^(yes|true|1)$/i.test(clean(req.query && (req.query.includeContacts || req.query.allContacts)));
      const query = clean(req.query && (req.query.query || req.query.search));
      const athletes = await listSmartCoachAthletes({ token, locationId, includeContacts, query });
      const fitnessRows = await safeListAthleteFitnessRows({ token, locationId });
      attachCurrentFitnessRows(athletes, fitnessRows);
      if (clean(req.query && req.query.action) === "calendarLink") {
        const athleteId = clean(req.query && (req.query.athleteId || req.query.contactId));
        const athlete = athletes.find((item) => clean(item.id) === athleteId || clean(item.smartcoachAthleteId) === athleteId);
        if (!athlete) throw httpError(404, "Athlete was not found.");
        if (!athlete.smartcoachActive) throw httpError(403, "This athlete is not active.");
        const code = athleteAccessCode(accountKey, athlete.id);
        res.status(200).json({
          success: true,
          athlete: { id: athlete.id, name: athlete.name, smartcoachAthleteId: athlete.smartcoachAthleteId },
          code,
          url: `/athlete-calendar.html?account=${encodeURIComponent(accountKey)}&athlete=${encodeURIComponent(athlete.id)}&code=${encodeURIComponent(code)}`,
        });
        return;
      }
      res.status(200).json({ success: true, athletes });
      return;
    }

    if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
      const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      await enforceActiveAthleteLimit({ token, locationId, payload, activeAthleteLimit, productPlanLabel });
      const athlete = await createOrUpdateAthlete({ token, locationId, payload });
      res.status(200).json({ success: true, athlete });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Athlete roster request failed." });
  }
}

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-SMARTCoach-Account, X-SMARTCoach-Access-Code, X-SMARTCoach-Session");
}

async function enforceActiveAthleteLimit({ token, locationId, payload, activeAthleteLimit, productPlanLabel }) {
  const limit = Number(activeAthleteLimit) || 0;
  if (!limit) return;
  const wantsActive = !payload || !Object.prototype.hasOwnProperty.call(payload, "smartcoachActive") || truthy(payload.smartcoachActive);
  if (!wantsActive) return;
  const activeAthletes = await listSmartCoachAthletes({ token, locationId, includeContacts: false });
  const contactId = clean(payload && payload.contactId);
  const athleteId = clean(payload && payload.smartcoachAthleteId);
  const name = clean(payload && payload.name).toLowerCase();
  const alreadyActive = activeAthletes.some((athlete) =>
    (contactId && clean(athlete.id) === contactId) ||
    (athleteId && clean(athlete.smartcoachAthleteId) === athleteId) ||
    (name && clean(athlete.name).toLowerCase() === name)
  );
  if (alreadyActive || activeAthletes.length < limit) return;
  throw httpError(403, `${productPlanLabel || "This plan"} allows ${limit} active athlete${limit === 1 ? "" : "s"}. Archive or mark an athlete inactive before adding another active athlete.`);
}

async function listSmartCoachAthletes({ token, locationId, includeContacts = false, query = "" }) {
  const rosterFieldIds = await resolveRosterFieldIds({ token, locationId });
  const searchParam = query ? `&query=${encodeURIComponent(query)}` : "";
  const result = await ghlFetch({
    token,
    path: `/contacts/?locationId=${encodeURIComponent(locationId)}&limit=100${searchParam}`,
    method: "GET",
  });

  const contacts = contactsFromResult(result);
  if (query && !contacts.length) {
    const fallback = await ghlFetch({
      token,
      path: "/contacts/search",
      method: "POST",
      body: {
        locationId,
        page: 1,
        pageLimit: 100,
        query,
      },
    });
    contacts.push(...contactsFromResult(fallback));
  }

  return uniqueContacts(contacts)
    .map((contact) => normalizeContact(contact, { rosterFieldIds }))
    .filter((athlete) => !athlete.excludedSystemContact)
    .filter((athlete) => athlete.smartcoachActive || athlete.smartcoachRosterMember || (includeContacts && athlete.smartcoachSetupCandidate))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function safeListAthleteFitnessRows({ token, locationId }) {
  try {
    return await listAthleteFitnessRows({ token, locationId });
  } catch (error) {
    return [];
  }
}

async function listAthleteFitnessRows({ token, locationId }) {
  const result = await searchAthleteBestRecords({ token, locationId, page: 1, pageLimit: 100 });
  return recordsFromResult(result).map((record) => {
    const props = recordProperties(record);
    const event = prop(props, "event");
    const display = prop(props, "last_result_display") || prop(props, "season_best_display") || prop(props, "personal_best_display");
    const date = prop(props, "last_result_date") || prop(props, "season_best_date") || prop(props, "personal_best_date");
    return {
      recordId: record.id || "",
      contactId: prop(props, "athlete_contact"),
      athleteName: prop(props, "athlete_name_snapshot"),
      sport: prop(props, "sport") || sportForFitnessEvent(event),
      event,
      resultDisplay: display,
      resultDate: date,
      label: [event, display].filter(Boolean).join(" "),
    };
  }).filter((row) => row.contactId && row.event && row.resultDisplay);
}

async function searchAthleteBestRecords({ token, locationId, page, pageLimit }) {
  const path = `/objects/${encodeURIComponent(ATHLETE_BEST_SCHEMA_KEY)}/records/search`;
  try {
    return await ghlFetch({
      token,
      path,
      method: "POST",
      body: { locationId, page, pageLimit },
    });
  } catch (error) {
    if (!isLocationIdBodyError(error)) throw error;
    return searchAthleteBestRecordsWithoutBodyLocation({ token, path, locationId, page, pageLimit });
  }
}

async function searchAthleteBestRecordsWithoutBodyLocation({ token, path, locationId, page, pageLimit }) {
  try {
    return await ghlFetch({
      token,
      path: `${path}?locationId=${encodeURIComponent(locationId)}`,
      method: "POST",
      body: { page, pageLimit },
    });
  } catch (error) {
    if (!isLocationIdBodyError(error)) throw error;
    return ghlFetch({
      token,
      path,
      method: "POST",
      body: { page, pageLimit },
    });
  }
}

function attachCurrentFitnessRows(athletes, fitnessRows) {
  const rowsByContact = {};
  (fitnessRows || []).forEach((row) => {
    const key = clean(row.contactId);
    if (!key) return;
    if (!rowsByContact[key]) rowsByContact[key] = [];
    rowsByContact[key].push(row);
  });
  (athletes || []).forEach((athlete) => {
    const rows = (rowsByContact[clean(athlete.id)] || []).sort((a, b) => String(b.resultDate || "").localeCompare(String(a.resultDate || "")));
    athlete.currentFitnessRows = rows;
    athlete.currentFitness = rows[0] || athlete.currentFitness || null;
  });
}

function contactsFromResult(result) {
  return [
    ...(Array.isArray(result && result.contacts) ? result.contacts : []),
    ...(Array.isArray(result && result.items) ? result.items : []),
    ...(Array.isArray(result && result.data && result.data.contacts) ? result.data.contacts : []),
    ...(Array.isArray(result && result.data && result.data.items) ? result.data.items : []),
    ...(Array.isArray(result && result.contact) ? result.contact : []),
  ];
}

function uniqueContacts(contacts) {
  const seen = {};
  return contacts.filter((contact) => {
    const key = clean(contact && contact.id) || contactName(contact).toLowerCase();
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
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
  const smartcoachAthleteId = clean(payload && payload.smartcoachAthleteId) || existingCustomFieldValueByIdsOrNames(contact, fieldIdsWithFallback(rosterFieldIds.smartcoachAthleteId, SMARTCOACH_ATHLETE_ID_FIELD_ID), ATHLETE_FIELD_ALIASES.smartcoachAthleteId) || buildAthleteId(athleteName || contactName(contact));
  const activeValue = payload && Object.prototype.hasOwnProperty.call(payload, "smartcoachActive")
    ? (truthy(payload.smartcoachActive) ? "Yes" : "No")
    : "Yes";
  const customFields = [];

  addCustomFieldValue(customFields, fieldIdsWithFallback(rosterFieldIds.smartcoachActive, SMARTCOACH_ACTIVE_FIELD_ID), activeValue);
  addCustomFieldValue(customFields, fieldIdsWithFallback(rosterFieldIds.smartcoachAthleteId, SMARTCOACH_ATHLETE_ID_FIELD_ID), smartcoachAthleteId);
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

  if (clean(payload && payload.grade)) {
    await addTags({ token, contactId: contact.id, tags: [classYearTag(payload.grade)] });
  }
}

function addCustomFieldValue(customFields, fieldIds, value) {
  const id = fieldId(fieldIds);
  if (!id || typeof value === "undefined") return;
  customFields.push({ id, value: clean(value) });
}

function fieldId(fieldIds) {
  return Array.isArray(fieldIds) && fieldIds.length ? fieldIds[0] : "";
}

function fieldIdsWithFallback(fieldIds, fallbackId) {
  const ids = Array.isArray(fieldIds) ? fieldIds.slice() : [];
  if (fallbackId && !ids.includes(fallbackId)) ids.push(fallbackId);
  return ids;
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
  const tags = Array.isArray(contact.tags) ? contact.tags : [];
  const smartcoachActiveValue = existingCustomFieldValueByIdsOrNames(contact, fieldIdsWithFallback(rosterFieldIds.smartcoachActive, SMARTCOACH_ACTIVE_FIELD_ID), ATHLETE_FIELD_ALIASES.smartcoachActive);
  const smartcoachAthleteId = existingCustomFieldValueByIdsOrNames(contact, fieldIdsWithFallback(rosterFieldIds.smartcoachAthleteId, SMARTCOACH_ATHLETE_ID_FIELD_ID), ATHLETE_FIELD_ALIASES.smartcoachAthleteId);
  const explicitlyInactive = isInactiveValue(smartcoachActiveValue);
  const hasAthleteTag = tags.some((tag) => clean(tag).toLowerCase() === "smartcoach-athlete");
  const excludedSystemContact = isExcludedSystemContact(tags) || isSmartCoachSupportContact(contact);
  const smartcoachRosterMember = !excludedSystemContact && hasAthleteTag;
  const smartcoachActive = smartcoachRosterMember && (isActiveValue(smartcoachActiveValue) || (!explicitlyInactive && Boolean(smartcoachAthleteId || hasAthleteTag)));
  const setupFields = {
    gender: contactGender(contact, rosterFieldIds.gender),
    grade: classYearFromTags(contact) || contactFieldByIdsOrNames(contact, rosterFieldIds.grade, ATHLETE_FIELD_ALIASES.grade),
    parentGuardianName: contactFieldByIdsOrNames(contact, rosterFieldIds.parentGuardianName, ATHLETE_FIELD_ALIASES.parentGuardianName),
    parentGuardianEmail: contactFieldByIdsOrNames(contact, rosterFieldIds.parentGuardianEmail, ATHLETE_FIELD_ALIASES.parentGuardianEmail),
    parentGuardianPhone: contactFieldByIdsOrNames(contact, rosterFieldIds.parentGuardianPhone, ATHLETE_FIELD_ALIASES.parentGuardianPhone),
    parentGuardian2Name: contactFieldByIdsOrNames(contact, rosterFieldIds.parentGuardian2Name, ATHLETE_FIELD_ALIASES.parentGuardian2Name),
    parentGuardian2Email: contactFieldByIdsOrNames(contact, rosterFieldIds.parentGuardian2Email, ATHLETE_FIELD_ALIASES.parentGuardian2Email),
    parentGuardian2Phone: contactFieldByIdsOrNames(contact, rosterFieldIds.parentGuardian2Phone, ATHLETE_FIELD_ALIASES.parentGuardian2Phone),
    coachNotes: contactFieldByIdsOrNames(contact, rosterFieldIds.coachNotes, ATHLETE_FIELD_ALIASES.coachNotes),
  };
  const hasRosterSetupData = Object.keys(setupFields).some((key) => clean(setupFields[key]));
  const smartcoachSetupCandidate = !excludedSystemContact && Boolean(contactName(contact)) && Boolean(smartcoachAthleteId || smartcoachActiveValue || hasRosterSetupData);
  return {
    id: contact.id,
    name: contactName(contact),
    firstName: clean(contact.firstName),
    lastName: clean(contact.lastName),
    email: clean(contact.email),
    phone: clean(contact.phone),
    gender: setupFields.gender,
    grade: setupFields.grade,
    parentGuardianName: setupFields.parentGuardianName,
    parentGuardianEmail: setupFields.parentGuardianEmail,
    parentGuardianPhone: setupFields.parentGuardianPhone,
    parentGuardian2Name: setupFields.parentGuardian2Name,
    parentGuardian2Email: setupFields.parentGuardian2Email,
    parentGuardian2Phone: setupFields.parentGuardian2Phone,
    coachNotes: setupFields.coachNotes,
    smartcoachActive,
    smartcoachActiveValue,
    smartcoachAthleteId,
    tags,
    smartcoachRosterMember,
    excludedSystemContact,
    smartcoachSetupCandidate,
  };
}

function isExcludedSystemContact(tags) {
  return (Array.isArray(tags) ? tags : []).some((tag) => {
    const value = clean(tag).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
    return value === "live chat" ||
      value === "voice chat" ||
      value === "support" ||
      value === "smartcoach account owner" ||
      value === "smartcoach feedback" ||
      value === "smartcoach bug trak" ||
      value === "smartcoach idea trak";
  });
}

function isSmartCoachSupportContact(contact) {
  const emails = [contact && contact.email, contact && contact.emailLowerCase, contact && contact.primaryEmail].map(clean).map((email) => email.toLowerCase());
  return emails.some((email) => email === "support@smartcoach-pro.com");
}

function classYearFromTags(contact) {
  const tags = Array.isArray(contact && contact.tags) ? contact.tags : [];
  const matches = tags.map(clean).filter((tag) => tag.toLowerCase().indexOf(CLASS_YEAR_TAG_PREFIX) === 0);
  if (!matches.length) return "";
  const years = matches.map((tag) => tag.slice(CLASS_YEAR_TAG_PREFIX.length).replace(/_/g, " ")).filter(Boolean);
  const numericYears = years.map((year) => Number(year)).filter((year) => Number.isFinite(year));
  if (numericYears.length) return String(Math.max(...numericYears));
  return years[years.length - 1] || "";
}

function classYearTag(value) {
  return `${CLASS_YEAR_TAG_PREFIX}${clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`;
}

function contactGender(contact, genderFieldIds = []) {
  const fieldValue = (genderFieldIds || []).map((fieldId) => existingCustomFieldValue(contact, fieldId)).find(Boolean);
  return clean(contact && (contact.gender || contact.sex || contact.genderIdentity)) || fieldValue || existingCustomFieldValueByName(contact, ATHLETE_FIELD_ALIASES.gender);
}

function contactFieldByIdsOrNames(contact, fieldIds = [], names = []) {
  return (fieldIds || []).map((fieldId) => existingCustomFieldValue(contact, fieldId)).find(Boolean) || existingCustomFieldValueByName(contact, names);
}

function existingCustomFieldValueByIdsOrNames(contact, fieldIds = [], names = []) {
  return contactFieldByIdsOrNames(contact, fieldIds, names);
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

function isInactiveValue(value) {
  return /^(no|n|false|inactive|0|off)$/i.test(clean(value));
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

function recordsFromResult(result) {
  return [
    ...(Array.isArray(result && result.records) ? result.records : []),
    ...(Array.isArray(result && result.items) ? result.items : []),
    ...(Array.isArray(result && result.data && result.data.records) ? result.data.records : []),
    ...(Array.isArray(result && result.data && result.data.items) ? result.data.items : []),
  ];
}

function recordProperties(record) {
  return (record && (record.properties || record.fields || record.customFields)) || {};
}

function prop(props, key) {
  return clean(props && (props[key] || props[`custom_objects.athlete_bests.${key}`]));
}

function optionValue(value) {
  return clean(value).toLowerCase().replace(/&/g, "and").replace(/\+/g, "plus").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function sportForFitnessEvent(event) {
  const normalized = optionValue(event);
  return ["4k", "5k", "8k", "10k", "15k", "half_marathon", "marathon"].includes(normalized) ? "cross_country" : "track";
}

function isLocationIdBodyError(error) {
  return /property\s+locationId\s+should\s+not\s+exist|locationId\s+should\s+not\s+exist/i.test(error && error.message || "");
}

function athleteAccessCode(accountKey, athleteId) {
  const secret = clean(process.env.SMARTCOACH_ATHLETE_ACCESS_SECRET || process.env.SMARTCOACH_SESSION_SECRET || process.env.SMARTCOACH_AUTOMATION_SECRET || "smartcoach-athlete-calendar");
  return crypto.createHmac("sha256", secret).update(`${clean(accountKey).toLowerCase()}:${clean(athleteId)}`).digest("hex").slice(0, 12);
}

function clean(value) {
  if (value && typeof value === "object") return clean(value.value || value.name || value.label || value.id);
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

module.exports = handler;
module.exports.listSmartCoachAthletes = listSmartCoachAthletes;
