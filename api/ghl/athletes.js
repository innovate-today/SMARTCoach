const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const SMARTCOACH_ACTIVE_FIELD_ID = "xepTMFvtaTwFdLVrOeQH";
const SMARTCOACH_ATHLETE_ID_FIELD_ID = "Vi7fmpkblrGZqZFyNBI2";

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const token = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;

  if (!token || !locationId) {
    res.status(500).json({ error: "GHL athlete roster is not configured on the server." });
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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function listActiveAthletes({ token, locationId }) {
  const result = await ghlFetch({
    token,
    path: `/contacts/?locationId=${encodeURIComponent(locationId)}&limit=100`,
    method: "GET",
  });

  return (result.contacts || [])
    .map(normalizeContact)
    .filter((athlete) => athlete.smartcoachActive)
    .sort((a, b) => a.name.localeCompare(b.name));
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
    throw httpError(502, `GHL did not return a contact for ${athleteName}.`);
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

function normalizeContact(contact) {
  const smartcoachActiveValue = existingCustomFieldValue(contact, SMARTCOACH_ACTIVE_FIELD_ID);
  return {
    id: contact.id,
    name: contactName(contact),
    firstName: clean(contact.firstName),
    lastName: clean(contact.lastName),
    smartcoachActive: isActiveValue(smartcoachActiveValue),
    smartcoachActiveValue,
    smartcoachAthleteId: existingCustomFieldValue(contact, SMARTCOACH_ATHLETE_ID_FIELD_ID),
    tags: Array.isArray(contact.tags) ? contact.tags : [],
  };
}

function contactName(contact) {
  return clean(contact.name) || `${clean(contact.firstName)} ${clean(contact.lastName)}`.trim();
}

function existingCustomFieldValue(contact, fieldId) {
  const fields = Array.isArray(contact && contact.customFields) ? contact.customFields : [];
  const field = fields.find((item) => {
    if (!item) return false;
    return item.id === fieldId || item.fieldId === fieldId || item.field_id === fieldId;
  });
  if (!field) return "";
  const value = field.value || field.fieldValue || field.field_value;
  return value ? String(value) : "";
}

function isActiveValue(value) {
  return /^(yes|true|active|1)$/i.test(clean(value));
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
