const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const MEET_RESULT_SCHEMA_KEY = "custom_objects.meet_results";
const SMARTCOACH_ACTIVE_FIELD_ID = "xepTMFvtaTwFdLVrOeQH";
const SMARTCOACH_ATHLETE_ID_FIELD_ID = "Vi7fmpkblrGZqZFyNBI2";

module.exports = async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const token = process.env.GHL_PRIVATE_INTEGRATION_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;

  if (!token || !locationId) {
    res.status(500).json({ error: "GHL meet result sync is not configured on the server." });
    return;
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const meetResult = normalizeMeetResult(payload);
    const contact = await findOrCreateContact({ token, locationId, meetResult });
    const properties = buildMeetResultProperties({ contactId: contact.id, meetResult });
    const duplicate = await findDuplicateMeetResult({ token, locationId, sourceRecordId: properties.source_record_id });
    if (duplicate && !meetResult.forceDuplicateSync) {
      throw httpError(409, "This meet result appears to have already been saved.");
    }

    const record = await ghlFetch({
      token,
      path: `/objects/${encodeURIComponent(MEET_RESULT_SCHEMA_KEY)}/records`,
      method: "POST",
      body: { locationId, properties },
    });
    await addMeetResultNote({ token, contactId: contact.id, meetResult });

    res.status(200).json({
      success: true,
      athlete: meetResult.athleteName,
      contactId: contact.id,
      recordId: record.id || (record.record && record.record.id) || null,
      sourceRecordId: properties.source_record_id,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Meet result sync failed." });
  }
};

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function normalizeMeetResult(payload) {
  if (!payload || typeof payload !== "object") throw httpError(400, "Missing meet result payload.");

  const meetDate = payload.meetDate ? new Date(payload.meetDate) : new Date();
  const resultDisplay = clean(payload.resultDisplay);
  const athleteName = clean(payload.athleteName);

  if (!athleteName && !clean(payload.contactId)) throw httpError(400, "Athlete is required.");
  if (!clean(payload.meetName)) throw httpError(400, "Meet name is required.");
  if (!clean(payload.event)) throw httpError(400, "Event is required.");
  if (!resultDisplay) throw httpError(400, "Result is required.");

  return {
    athleteName,
    contactId: clean(payload.contactId),
    smartcoachAthleteId: clean(payload.smartcoachAthleteId),
    meetName: clean(payload.meetName),
    meetDate: validDate(meetDate) || new Date(),
    season: clean(payload.season) || "Unspecified",
    sport: clean(payload.sport) || "track",
    event: clean(payload.event),
    resultDisplay,
    resultMs: Number(payload.resultMs) || parseTimeToMs(resultDisplay) || null,
    wind: clean(payload.wind),
    splitsJson: clean(payload.splitsJson),
    isPr: truthy(payload.isPr),
    isSeasonBest: truthy(payload.isSeasonBest),
    coachRaceNotes: clean(payload.coachRaceNotes),
    sourceRecordId: clean(payload.sourceRecordId),
    forceDuplicateSync: payload.forceDuplicateSync === true,
  };
}

async function findOrCreateContact({ token, locationId, meetResult }) {
  if (meetResult.contactId) {
    const contact = await getContact({ token, contactId: meetResult.contactId });
    if (contact && contact.id) return contact;
  }

  const existing = await findExistingContact({ token, locationId, athleteName: meetResult.athleteName });
  if (existing) return existing;

  const nameParts = meetResult.athleteName.split(/\s+/);
  const firstName = nameParts.shift() || meetResult.athleteName;
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
  if (!contact || !contact.id) throw httpError(502, `GHL did not return a contact for ${meetResult.athleteName}.`);

  await markContactAsSmartCoachAthlete({ token, contact, meetResult });
  return contact;
}

async function getContact({ token, contactId }) {
  const result = await ghlFetch({ token, path: `/contacts/${encodeURIComponent(contactId)}`, method: "GET" });
  return result.contact || result;
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

async function markContactAsSmartCoachAthlete({ token, contact, meetResult }) {
  const smartcoachAthleteId = meetResult.smartcoachAthleteId || existingCustomFieldValue(contact, SMARTCOACH_ATHLETE_ID_FIELD_ID) || buildAthleteId(meetResult.athleteName || contactName(contact));

  try {
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
  } catch (error) {
    if (error.statusCode && error.statusCode >= 500) throw error;
  }
}

function buildMeetResultProperties({ contactId, meetResult }) {
  const seasonYear = meetResult.meetDate.getFullYear();
  const recordName = `${meetResult.athleteName} - ${meetResult.event} - ${meetResult.resultDisplay} - ${meetResult.meetName}`;
  const sourceRecordId = meetResult.sourceRecordId || buildSourceRecordId({ contactId, meetResult });

  return {
    meet_result: recordName,
    record_name: recordName,
    athlete_contact: contactId,
    athlete_name_snapshot: meetResult.athleteName,
    meet_name: meetResult.meetName,
    meet_date: dateOnly(meetResult.meetDate),
    season: optionValue(meetResult.season),
    season_year: seasonYear,
    sport: sportValue(meetResult.sport),
    event: meetResult.event,
    result_display: meetResult.resultDisplay,
    result_ms: meetResult.resultMs,
    wind: meetResult.wind,
    splits_json: meetResult.splitsJson || "[]",
    is_pr: meetResult.isPr ? "Yes" : "No",
    is_season_best: meetResult.isSeasonBest ? "Yes" : "No",
    coach_race_notes: meetResult.coachRaceNotes,
    source_system: "smartcoach_pro",
    source_record_id: sourceRecordId,
  };
}

async function addMeetResultNote({ token, contactId, meetResult }) {
  const lines = [
    `SMARTCoach Meet Result - ${dateOnly(meetResult.meetDate)}`,
    `Meet: ${meetResult.meetName} | Season: ${meetResult.season}`,
    `Event: ${meetResult.event} | Result: ${meetResult.resultDisplay}`,
    meetResult.wind ? `Wind: ${meetResult.wind}` : "",
    `Flags: PR ${meetResult.isPr ? "Yes" : "No"} | SB ${meetResult.isSeasonBest ? "Yes" : "No"}`,
  ].filter(Boolean);

  if (meetResult.splitsJson && meetResult.splitsJson !== "[]") lines.push(`Splits: ${meetResult.splitsJson}`);
  if (meetResult.coachRaceNotes) lines.push(`Notes: ${meetResult.coachRaceNotes}`);

  await ghlFetch({
    token,
    path: `/contacts/${encodeURIComponent(contactId)}/notes`,
    method: "POST",
    body: { body: lines.join("\n") },
  });
}

async function findDuplicateMeetResult({ token, locationId, sourceRecordId }) {
  if (!sourceRecordId) return null;
  try {
    const result = await ghlFetch({
      token,
      path: `/objects/${encodeURIComponent(MEET_RESULT_SCHEMA_KEY)}/records/search`,
      method: "POST",
      body: {
        locationId,
        page: 1,
        pageLimit: 1,
        filters: [
          {
            field: "source_record_id",
            operator: "eq",
            value: sourceRecordId,
          },
        ],
      },
    });
    return firstRecord(result);
  } catch (error) {
    if (error.statusCode && error.statusCode >= 500) throw error;
    return null;
  }
}

function buildSourceRecordId({ contactId, meetResult }) {
  return [
    "mr",
    slugValue(contactId || meetResult.athleteName),
    dateOnly(meetResult.meetDate).replace(/-/g, ""),
    slugValue(meetResult.event),
    slugValue(meetResult.meetName),
    slugValue(meetResult.resultDisplay),
  ].filter(Boolean).join("_");
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

function parseTimeToMs(value) {
  const text = clean(value).toLowerCase().replace(/s$/, "");
  const parts = text.split(":").map((part) => part.trim());
  if (!parts.length || parts.some((part) => part === "" || Number.isNaN(Number(part)))) return null;
  if (parts.length === 1) return Math.round(Number(parts[0]) * 1000);
  if (parts.length === 2) return Math.round((Number(parts[0]) * 60 + Number(parts[1])) * 1000);
  if (parts.length === 3) return Math.round((Number(parts[0]) * 3600 + Number(parts[1]) * 60 + Number(parts[2])) * 1000);
  return null;
}

function existingCustomFieldValue(contact, fieldId) {
  const fields = Array.isArray(contact && contact.customFields) ? contact.customFields : [];
  const field = fields.find((item) => item && (item.id === fieldId || item.fieldId === fieldId || item.field_id === fieldId || item.customFieldId === fieldId));
  if (!field) return "";
  const value = field.value || field.fieldValue || field.field_value;
  if (value && typeof value === "object") return clean(value.value || value.name || value.label || value.id);
  return value ? String(value) : "";
}

function contactName(contact) {
  return clean(contact.name) || `${clean(contact.firstName)} ${clean(contact.lastName)}`.trim();
}

function optionValue(value) {
  return clean(value).toLowerCase().replace(/&/g, "and").replace(/\+/g, "plus").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function sportValue(value) {
  const normalized = optionValue(value);
  if (normalized.indexOf("track") === 0) return "track";
  if (normalized.indexOf("cross") === 0) return "cross_country";
  return normalized || "track";
}

function buildAthleteId(name) {
  return `sca_${slugValue(name).replace(/-/g, "_") || "athlete"}`;
}

function slugValue(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function truthy(value) {
  return value === true || /^(yes|true|1|on)$/i.test(clean(value));
}

function validDate(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return value;
}

function dateOnly(value) {
  const date = validDate(value) || new Date();
  return date.toISOString().slice(0, 10);
}

function clean(value) {
  return String(value || "").trim();
}

function safeJson(text) {
  try { return JSON.parse(text); } catch (error) { return { message: text }; }
}

function firstRecord(result) {
  const candidates = [
    result && result.record,
    result && Array.isArray(result.records) && result.records[0],
    result && Array.isArray(result.items) && result.items[0],
    result && result.data && Array.isArray(result.data.records) && result.data.records[0],
    result && result.data && Array.isArray(result.data.items) && result.data.items[0],
  ];
  return candidates.find(Boolean) || null;
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
