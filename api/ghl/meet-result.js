const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
const MEET_RESULT_SCHEMA_KEY = "custom_objects.meet_results";
const SEASON_RECORD_SCHEMA_KEY = "custom_objects.season_records";
const ATHLETE_BEST_SCHEMA_KEY = "custom_objects.athlete_bests";
const RECORD_SCHEMA_KEY = "custom_objects.records";
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

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { token, locationId } = getGhlContext(req);

  if (!token || !locationId) {
    res.status(500).json({ error: "SMART Trak meet result sync is not configured on the server." });
    return;
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const meetResult = normalizeMeetResult(payload);
    const contact = await findOrCreateContact({ token, locationId, meetResult });
    const seasonSourceRecordId = buildSeasonSourceRecordId({ contactId: contact.id, meetResult });
    const existingSeasonRecord = await findObjectRecord({
      token,
      locationId,
      schemaKey: SEASON_RECORD_SCHEMA_KEY,
      sourceRecordId: seasonSourceRecordId,
    });
    const athleteBestSourceRecordId = buildAthleteBestSourceRecordId({ contactId: contact.id, meetResult });
    const athleteBestLookup = await findAthleteBestRecord({
      token,
      locationId,
      contactId: contact.id,
      event: meetResult.event,
    });
    const autoFlags = calculateMeetResultFlags({ existingSeasonRecord, athleteBestLookup, meetResult });
    meetResult.isSeasonBest = meetResult.isSeasonBest || autoFlags.isSeasonBest;
    meetResult.isPr = meetResult.isPr || autoFlags.isPr;
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
    const meetResultRecordId = record.id || (record.record && record.record.id) || null;
    await addMeetResultNote({ token, contactId: contact.id, meetResult });
    const seasonRecord = await upsertSeasonRecord({
      token,
      locationId,
      contactId: contact.id,
      meetResult,
      existing: existingSeasonRecord,
      sourceRecordId: seasonSourceRecordId,
    });
    const athleteBest = await upsertAthleteBest({
      token,
      locationId,
      contactId: contact.id,
      meetResult,
      existing: athleteBestLookup.record,
      sourceRecordId: athleteBestSourceRecordId,
      meetResultSourceRecordId: properties.source_record_id,
    });
    const records = await createRecordEntries({
      token,
      locationId,
      contactId: contact.id,
      meetResult,
      meetResultRecordId,
      meetResultSourceRecordId: properties.source_record_id,
    });

    res.status(200).json({
      success: true,
      athlete: meetResult.athleteName,
      contactId: contact.id,
      recordId: meetResultRecordId,
      sourceRecordId: properties.source_record_id,
      seasonRecord,
      athleteBest,
      records,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || "Meet result sync failed." });
  }
};

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-SMARTCoach-Account");
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
    meetRecordId: clean(payload.meetRecordId),
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
  if (!contact || !contact.id) throw httpError(502, `SMART Trak did not return a contact for ${meetResult.athleteName}.`);

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
  const splitLines = formatSplitsForNote(meetResult.splitsJson);

  const properties = {
    meet_result: recordName,
    athlete_contact: contactId,
    athlete_name_snapshot: meetResult.athleteName,
    meet_name: meetResult.meetName,
    meet_record_id: meetResult.meetRecordId,
    meet_date: dateOnly(meetResult.meetDate),
    season: optionValue(meetResult.season),
    season_year: seasonYear,
    sport: sportValue(meetResult.sport),
    event: meetResult.event,
    result_display: meetResult.resultDisplay,
    result_ms: meetResult.resultMs,
    wind: meetResult.wind,
    splits_json: splitLines.length ? splitLines.join("\n") : "",
    is_pr: meetResult.isPr ? "Yes" : "No",
    is_season_best: meetResult.isSeasonBest ? "Yes" : "No",
    coach_race_notes: meetResult.coachRaceNotes,
    source_system: "smartcoach_pro",
    source_record_id: sourceRecordId,
  };
  return properties;
}

async function addMeetResultNote({ token, contactId, meetResult }) {
  const lines = [
    `SMARTCoach Meet Result - ${dateOnly(meetResult.meetDate)}`,
    `Meet: ${meetResult.meetName} | Season: ${meetResult.season}`,
    `Event: ${meetResult.event} | Result: ${meetResult.resultDisplay}`,
    meetResult.wind ? `Wind: ${meetResult.wind}` : "",
    `Flags: PR ${meetResult.isPr ? "Yes" : "No"} | SB ${meetResult.isSeasonBest ? "Yes" : "No"}`,
  ].filter(Boolean);

  const splits = formatSplitsForNote(meetResult.splitsJson);
  if (splits.length) lines.push("Splits:", ...splits);
  if (meetResult.coachRaceNotes) lines.push(`Notes: ${meetResult.coachRaceNotes}`);

  await ghlFetch({
    token,
    path: `/contacts/${encodeURIComponent(contactId)}/notes`,
    method: "POST",
    body: { body: lines.join("\n") },
  });
}

function formatSplitsForNote(splitsJson) {
  if (!splitsJson || splitsJson === "[]") return [];
  let splits;
  try {
    splits = typeof splitsJson === "string" ? JSON.parse(splitsJson) : splitsJson;
  } catch (error) {
    return [];
  }
  if (!Array.isArray(splits)) return [];
  return splits
    .map((split, index) => {
      const time = clean(split && split.time);
      if (!time) return "";
      const lap = Number(split && split.lap) || index + 1;
      return `Lap ${lap}: ${time}`;
    })
    .filter(Boolean);
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

async function upsertSeasonRecord({ token, locationId, contactId, meetResult, existing, sourceRecordId }) {
  const properties = buildSeasonRecordProperties({ contactId, meetResult, existing, sourceRecordId });

  if (existing && existing.id) {
    const updated = await ghlFetch({
      token,
      path: `/objects/${encodeURIComponent(SEASON_RECORD_SCHEMA_KEY)}/records/${encodeURIComponent(existing.id)}`,
      method: "PUT",
      body: { locationId, properties },
    });
    return {
      action: "updated",
      recordId: updated.id || (updated.record && updated.record.id) || existing.id,
      sourceRecordId,
    };
  }

  const created = await ghlFetch({
    token,
    path: `/objects/${encodeURIComponent(SEASON_RECORD_SCHEMA_KEY)}/records`,
    method: "POST",
    body: { locationId, properties },
  });
  return {
    action: "created",
    recordId: created.id || (created.record && created.record.id) || null,
    sourceRecordId,
  };
}

function buildSeasonRecordProperties({ contactId, meetResult, existing, sourceRecordId }) {
  const existingProperties = recordProperties(existing);
  const seasonYear = meetResult.meetDate.getFullYear();
  const recordName = `${meetResult.athleteName} - ${meetResult.season} ${seasonYear}`;
  const seasonSummary = updateSeasonSummaryForMeet({ existingProperties, meetResult });

  return {
    season_record: recordName,
    athlete_contact: contactId,
    athlete_name_snapshot: meetResult.athleteName,
    source_record_id: sourceRecordId,
    season: optionValue(meetResult.season),
    season_year: seasonYear,
    sport: sportValue(meetResult.sport),
    primary_event: existingProperties.primary_event || meetResult.event,
    practice_session_count: numberValue(existingProperties.practice_session_count),
    performance_record_count: numberValue(existingProperties.performance_record_count),
    meet_count: seasonSummary.meetCount,
    season_bests_json: formatSeasonBestsForField(seasonSummary.summary),
    injury_flag: existingProperties.injury_flag || "No",
    coach_season_notes: existingProperties.coach_season_notes || "",
    last_calculated_at: dateOnly(new Date()),
  };
}

function updateSeasonSummaryForMeet({ existingProperties, meetResult }) {
  const parsedSummary = parseJsonObject(existingProperties.season_bests_json);
  const summary = Object.keys(parsedSummary).length ? parsedSummary : parseReadableSeasonBests(existingProperties.season_bests_json);
  const meetBests = summary.meetBestsByEvent || {};
  const eventKey = optionValue(meetResult.event) || "event";
  const currentBest = meetBests[eventKey];

  if (meetResult.resultMs && (!currentBest || !Number(currentBest.ms) || meetResult.resultMs < Number(currentBest.ms))) {
    meetBests[eventKey] = {
      event: meetResult.event,
      display: meetResult.resultDisplay,
      ms: meetResult.resultMs,
      meetName: meetResult.meetName,
      meetDate: dateOnly(meetResult.meetDate),
      isPr: meetResult.isPr,
      isSeasonBest: meetResult.isSeasonBest,
    };
  }

  const recentMeets = Array.isArray(summary.recentMeets) ? summary.recentMeets : [];
  recentMeets.push({
    meetDate: dateOnly(meetResult.meetDate),
    meetName: meetResult.meetName,
    event: meetResult.event,
    resultDisplay: meetResult.resultDisplay,
  });

  summary.meetBestsByEvent = meetBests;
  summary.recentMeets = recentMeets.slice(-100);
  summary.meetCount = numberValue(existingProperties.meet_count) + 1;

  return {
    summary,
    meetCount: summary.meetCount,
  };
}

async function findObjectRecord({ token, locationId, schemaKey, sourceRecordId }) {
  try {
    const result = await ghlFetch({
      token,
      path: `/objects/${encodeURIComponent(schemaKey)}/records/search`,
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

async function findOptionalObjectRecord({ token, locationId, schemaKey, sourceRecordId }) {
  try {
    const result = await ghlFetch({
      token,
      path: `/objects/${encodeURIComponent(schemaKey)}/records/search`,
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
    return { available: true, record: firstRecord(result) || null };
  } catch (error) {
    if (error.statusCode && error.statusCode >= 500) throw error;
    return { available: true, record: null, lookupWarning: error.message || "Athlete Best lookup failed; create will be attempted." };
  }
}

async function findAthleteBestRecord({ token, locationId, contactId, event }) {
  try {
    const result = await ghlFetch({
      token,
      path: `/objects/${encodeURIComponent(ATHLETE_BEST_SCHEMA_KEY)}/records/search`,
      method: "POST",
      body: {
        locationId,
        page: 1,
        pageLimit: 100,
      },
    });
    const wantedEvent = optionValue(event);
    const record = recordsFromResult(result).find((item) => {
      const props = recordProperties(item);
      return recordValue(props, "athlete_contact") === contactId
        && optionValue(recordValue(props, "event")) === wantedEvent;
    }) || null;
    return { available: true, record };
  } catch (error) {
    if (error.statusCode && error.statusCode >= 500) throw error;
    return { available: true, record: null, lookupWarning: error.message || "Athlete Best lookup failed; create will be attempted." };
  }
}

function buildSeasonSourceRecordId({ contactId, meetResult }) {
  return `sr_${slugValue(contactId)}_${meetResult.meetDate.getFullYear()}_${optionValue(meetResult.season) || "season"}`;
}

function calculateMeetResultFlags({ existingSeasonRecord, athleteBestLookup, meetResult }) {
  const existingProperties = recordProperties(existingSeasonRecord);
  const parsedSummary = parseJsonObject(existingProperties.season_bests_json);
  const summary = Object.keys(parsedSummary).length ? parsedSummary : parseReadableSeasonBests(existingProperties.season_bests_json);
  const eventKey = optionValue(meetResult.event) || "event";
  const currentBest = summary && summary.meetBestsByEvent ? summary.meetBestsByEvent[eventKey] : null;
  const bestProperties = recordProperties(athleteBestLookup && athleteBestLookup.record);
  const existingPbMs = numberValue(recordValue(bestProperties, "personal_best_ms"));
  const existingSbMs = sameSeason(bestProperties, meetResult) ? numberValue(recordValue(bestProperties, "season_best_ms")) : 0;
  const seasonBestMs = numberValue(currentBest && currentBest.ms) || existingSbMs;
  const hasResult = !!meetResult.resultMs;
  const isSeasonBest = hasResult && (!seasonBestMs || meetResult.resultMs < seasonBestMs);
  const isPr = !!(athleteBestLookup && athleteBestLookup.available) && hasResult && (!existingPbMs || meetResult.resultMs < existingPbMs);
  return { isSeasonBest, isPr };
}

async function upsertAthleteBest({ token, locationId, contactId, meetResult, existing, sourceRecordId, meetResultSourceRecordId }) {
  const properties = buildAthleteBestProperties({
    contactId,
    meetResult,
    existing,
    sourceRecordId,
    meetResultSourceRecordId,
  });

  try {
    if (existing && existing.id) {
      const updated = await ghlFetch({
        token,
        path: `/objects/${encodeURIComponent(ATHLETE_BEST_SCHEMA_KEY)}/records/${encodeURIComponent(existing.id)}?locationId=${encodeURIComponent(locationId)}`,
        method: "PUT",
        body: { properties },
      });
      return {
        action: "updated",
        recordId: updated.id || (updated.record && updated.record.id) || existing.id,
        sourceRecordId,
      };
    }

    const created = await ghlFetch({
      token,
      path: `/objects/${encodeURIComponent(ATHLETE_BEST_SCHEMA_KEY)}/records`,
      method: "POST",
      body: { locationId, properties },
    });
    return {
      action: "created",
      recordId: created.id || (created.record && created.record.id) || null,
      sourceRecordId,
    };
  } catch (error) {
    if (error.statusCode && error.statusCode >= 500) throw error;
    return { action: "skipped", statusCode: error.statusCode || null, reason: error.message || "Athlete Best object is not configured yet." };
  }
}

function buildAthleteBestProperties({ contactId, meetResult, existing, sourceRecordId, meetResultSourceRecordId }) {
  const existingProperties = recordProperties(existing);
  const seasonYear = meetResult.meetDate.getFullYear();
  const event = meetResult.event;
  const recordName = `${meetResult.athleteName} - ${event} Bests`;
  const existingValue = (key) => recordValue(existingProperties, key);
  const existingPbMs = numberValue(existingValue("personal_best_ms"));
  const existingSbMs = sameSeason(existingProperties, meetResult) ? numberValue(existingValue("season_best_ms")) : 0;
  const isPb = meetResult.isPr === true;
  const isSb = meetResult.isSeasonBest === true;
  const today = dateOnly(new Date());

  const properties = {
    athlete_best: recordName,
    athlete_contact: contactId,
    athlete_name_snapshot: meetResult.athleteName,
    sport: sportValue(meetResult.sport),
    event,
    personal_best_display: isPb ? meetResult.resultDisplay : existingValue("personal_best_display"),
    personal_best_ms: isPb ? meetResult.resultMs : existingPbMs || null,
    personal_best_meet: isPb ? meetResult.meetName : existingValue("personal_best_meet"),
    personal_best_date: isPb ? dateOnly(meetResult.meetDate) : existingValue("personal_best_date"),
    personal_best_source_record_id: isPb ? meetResultSourceRecordId : existingValue("personal_best_source_record_id"),
    season: optionValue(meetResult.season),
    season_year: seasonYear,
    season_best_display: isSb ? meetResult.resultDisplay : sameSeason(existingProperties, meetResult) ? existingValue("season_best_display") : "",
    season_best_ms: isSb ? meetResult.resultMs : sameSeason(existingProperties, meetResult) ? existingSbMs || null : null,
    season_best_meet: isSb ? meetResult.meetName : sameSeason(existingProperties, meetResult) ? existingValue("season_best_meet") : "",
    season_best_date: isSb ? dateOnly(meetResult.meetDate) : sameSeason(existingProperties, meetResult) ? existingValue("season_best_date") : "",
    season_best_source_record_id: isSb ? meetResultSourceRecordId : sameSeason(existingProperties, meetResult) ? existingValue("season_best_source_record_id") : "",
    last_result_display: meetResult.resultDisplay,
    last_result_date: dateOnly(meetResult.meetDate),
    pb_updated_at: isPb ? today : existingValue("pb_updated_at"),
    sb_updated_at: isSb ? today : existingValue("sb_updated_at"),
    source_system: "smartcoach_pro",
  };
  return compactProperties(properties);
}

function buildAthleteBestSourceRecordId({ contactId, meetResult }) {
  return `ab_${slugValue(contactId)}_${slugValue(meetResult.event) || "event"}`;
}

function sameSeason(existingProperties, meetResult) {
  return optionValue(recordValue(existingProperties, "season")) === optionValue(meetResult.season)
    && Number(recordValue(existingProperties, "season_year")) === meetResult.meetDate.getFullYear();
}

function compactProperties(properties) {
  return Object.keys(properties).reduce((cleaned, key) => {
    const value = properties[key];
    if (value === "" || value === null || typeof value === "undefined") return cleaned;
    cleaned[key] = value;
    return cleaned;
  }, {});
}

async function createRecordEntries({ token, locationId, contactId, meetResult, meetResultRecordId, meetResultSourceRecordId }) {
  const entries = [];
  if (meetResult.isPr) entries.push("Personal Best");
  if (meetResult.isSeasonBest) entries.push("Season Best");

  const results = [];
  for (const type of entries) {
    const sourceRecordId = buildRecordSourceRecordId({ contactId, meetResult, type, meetResultSourceRecordId });
    const duplicate = await findObjectRecord({
      token,
      locationId,
      schemaKey: RECORD_SCHEMA_KEY,
      sourceRecordId,
    });
    if (duplicate && duplicate.id) {
      results.push({ action: "exists", type, recordId: duplicate.id, sourceRecordId });
      continue;
    }

    try {
      const properties = buildRecordProperties({
        contactId,
        meetResult,
        type,
        meetResultRecordId,
        meetResultSourceRecordId,
        sourceRecordId,
      });
      const created = await ghlFetch({
        token,
        path: `/objects/${encodeURIComponent(RECORD_SCHEMA_KEY)}/records`,
        method: "POST",
        body: { locationId, properties },
      });
      results.push({
        action: "created",
        type,
        recordId: created.id || (created.record && created.record.id) || null,
        sourceRecordId,
      });
    } catch (error) {
      if (error.statusCode && error.statusCode >= 500) throw error;
      results.push({ action: "skipped", type, statusCode: error.statusCode || null, reason: error.message || "Records object is not configured yet.", sourceRecordId });
    }
  }
  return results;
}

function buildRecordProperties({ contactId, meetResult, type, meetResultRecordId, meetResultSourceRecordId, sourceRecordId }) {
  const recordName = `${meetResult.athleteName} - ${type} - ${meetResult.event} - ${meetResult.resultDisplay}`;
  return compactProperties({
    record: recordName,
    record_type: optionValue(type),
    record_scope: "athlete",
    sport: sportValue(meetResult.sport),
    event: meetResult.event,
    result_display: meetResult.resultDisplay,
    result_ms: meetResult.resultMs,
    athlete_contact: contactId,
    athlete_name_snapshot: meetResult.athleteName,
    meet_name: meetResult.meetName,
    meet_record_id: meetResult.meetRecordId,
    meet_result_id: meetResultRecordId || meetResultSourceRecordId,
    record_date: dateOnly(meetResult.meetDate),
    season: optionValue(meetResult.season),
    season_year: meetResult.meetDate.getFullYear(),
    is_current: "Yes",
    record_notes: meetResult.coachRaceNotes,
    source_system: "smartcoach_pro",
    source_record_id: sourceRecordId,
  });
}

function buildRecordSourceRecordId({ contactId, meetResult, type, meetResultSourceRecordId }) {
  return [
    "rec",
    optionValue(type),
    slugValue(contactId || meetResult.athleteName),
    slugValue(meetResult.event),
    slugValue(meetResultSourceRecordId || buildSourceRecordId({ contactId, meetResult })),
  ].filter(Boolean).join("_");
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

function formatSeasonBestsForField(summary) {
  const lines = [
    `Practice Sessions: ${Number(summary && summary.practiceSessionCount) || 0}`,
    `Performance Records: ${Number(summary && summary.performanceRecordCount) || 0}`,
  ];

  if (summary && summary.lastSession) {
    lines.push("");
    lines.push("Last Session:");
    lines.push(`${summary.lastSession.sessionDate || ""} - ${summary.lastSession.groupName || ""} - ${summary.lastSession.workoutType || ""}`.replace(/\s+-\s+$/g, ""));
  }

  const practiceBests = summary && summary.practiceBestsByWorkoutType ? Object.keys(summary.practiceBestsByWorkoutType) : [];
  if (practiceBests.length) {
    lines.push("");
    lines.push("Practice Bests:");
    practiceBests.sort().forEach((key) => {
      const best = summary.practiceBestsByWorkoutType[key] || {};
      lines.push(`${best.workoutType || key}: ${best.display || ""}${best.sessionDate ? ` (${best.sessionDate})` : ""}`);
    });
  }

  const meetBests = summary && summary.meetBestsByEvent ? Object.keys(summary.meetBestsByEvent) : [];
  if (meetBests.length) {
    lines.push("");
    lines.push("Best Meet Results:");
    meetBests.sort().forEach((key) => {
      const best = summary.meetBestsByEvent[key] || {};
      lines.push(`${best.event || key}: ${best.display || ""}${best.meetName ? ` - ${best.meetName}` : ""}${best.meetDate ? ` (${best.meetDate})` : ""}`);
    });
  }

  const sessions = Array.isArray(summary && summary.sessions) ? summary.sessions.slice(-5) : [];
  if (sessions.length) {
    lines.push("");
    lines.push("Recent Sessions:");
    sessions.forEach((session) => {
      lines.push(`${session.sessionDate || ""} - ${session.groupName || ""} - ${session.workoutType || ""} - ${Number(session.performanceRecordCount) || 0} records`);
    });
  }

  const meets = Array.isArray(summary && summary.recentMeets) ? summary.recentMeets.slice(-5) : [];
  if (meets.length) {
    lines.push("");
    lines.push("Recent Meets:");
    meets.forEach((meet) => {
      lines.push(`${meet.meetDate || ""} - ${meet.meetName || ""} - ${meet.event || ""} - ${meet.resultDisplay || ""}`);
    });
  }

  return lines.join("\n");
}

function parseReadableSeasonBests(value) {
  const text = clean(value);
  const summary = {};
  if (!text) return summary;

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let section = "";
  lines.forEach((line) => {
    if (line === "Practice Bests:" || line === "Best Meet Results:" || line === "Recent Sessions:" || line === "Recent Meets:" || line === "Last Session:") {
      section = line.replace(/:$/, "");
      return;
    }

    const countMatch = line.match(/^(Practice Sessions|Performance Records):\s*(\d+)/i);
    if (countMatch) {
      if (/Practice Sessions/i.test(countMatch[1])) summary.practiceSessionCount = Number(countMatch[2]) || 0;
      if (/Performance Records/i.test(countMatch[1])) summary.performanceRecordCount = Number(countMatch[2]) || 0;
      return;
    }

    if (section === "Practice Bests") {
      const bestMatch = line.match(/^(.+?):\s*(.+?)(?:\s*\((\d{4}-\d{2}-\d{2})\))?$/);
      if (!bestMatch) return;
      const workoutType = bestMatch[1].trim();
      const display = bestMatch[2].trim();
      const key = optionValue(workoutType) || "workout";
      if (!summary.practiceBestsByWorkoutType) summary.practiceBestsByWorkoutType = {};
      summary.practiceBestsByWorkoutType[key] = {
        workoutType,
        display,
        ms: parseTimeToMs(display),
        sessionDate: bestMatch[3] || "",
      };
    }

    if (section === "Best Meet Results") {
      const bestMatch = line.match(/^(.+?):\s*(.+?)(?:\s+-\s+(.+?))?(?:\s*\((\d{4}-\d{2}-\d{2})\))?$/);
      if (!bestMatch) return;
      const event = bestMatch[1].trim();
      const display = bestMatch[2].trim();
      const key = optionValue(event) || "event";
      if (!summary.meetBestsByEvent) summary.meetBestsByEvent = {};
      summary.meetBestsByEvent[key] = {
        event,
        display,
        ms: parseTimeToMs(display),
        meetName: (bestMatch[3] || "").trim(),
        meetDate: bestMatch[4] || "",
      };
    }

    if (section === "Recent Meets") {
      const parts = line.split(" - ").map((part) => part.trim());
      if (parts.length < 4) return;
      if (!summary.recentMeets) summary.recentMeets = [];
      summary.recentMeets.push({
        meetDate: parts[0],
        meetName: parts[1],
        event: parts[2],
        resultDisplay: parts.slice(3).join(" - "),
      });
    }
  });

  return summary;
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

function recordsFromResult(result) {
  return [
    ...(Array.isArray(result && result.records) ? result.records : []),
    ...(Array.isArray(result && result.items) ? result.items : []),
    ...(Array.isArray(result && result.data && result.data.records) ? result.data.records : []),
    ...(Array.isArray(result && result.data && result.data.items) ? result.data.items : []),
  ];
}

function recordProperties(record) {
  if (!record) return {};
  return record.properties || record.fields || record.customFields || {};
}

function recordValue(props, key) {
  const keys = [key, `custom_objects.athlete_bests.${key}`];
  if (Array.isArray(props)) {
    for (const candidate of keys) {
      const field = props.find((item) => item && (item.key === candidate || item.fieldKey === candidate || item.id === candidate || item.fieldId === candidate || item.customFieldId === candidate));
      if (field) return cleanValue(field.value || field.fieldValue || field.field_value);
    }
    return "";
  }
  for (const candidate of keys) {
    const value = cleanValue(props && props[candidate]);
    if (value) return value;
  }
  return "";
}

function cleanValue(value) {
  if (Array.isArray(value)) return value.map(cleanValue).filter(Boolean).join(", ");
  if (value && typeof value === "object") return cleanValue(value.value || value.name || value.label || value.id);
  return String(value || "").trim();
}

function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    return {};
  }
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
