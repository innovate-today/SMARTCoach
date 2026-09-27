const crypto = require("crypto");
const zlib = require("zlib");

const ROOT = "powertrak";
const CHUNK_SIZE = 250000;
const PAGE_BYTES = 2500000;

function storageError(message, statusCode = 502) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function mapBounded(items, callback) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await callback(items[index], index);
    }
  }));
  return results;
}

function describeSession(item) {
  const json = JSON.stringify(item);
  const digest = crypto.createHash("sha256").update(json).digest("hex");
  const compressed = zlib.gzipSync(Buffer.from(json)).toString("base64");
  const count = Math.ceil(compressed.length / CHUNK_SIZE);
  if (!item.id || !count || count > 200) throw storageError("Power Trak session is too large to save.", 413);
  return {
    ref: { id: item.id, date: item.date || "", updatedAt: item.updatedAt || "", status: item.status || "", workoutId: item.workoutId || "", groupId: item.groupId || "", athleteKeys: sessionAthleteKeys(item), digest, count, bytes: Buffer.byteLength(json) },
    chunks: Array.from({ length: count }, (_, index) => ({ namespace: `powertrak_session_${digest}_${index}`, immutable: true, ttlSeconds: 86400, record: { data: compressed.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE) } })),
  };
}

function sessionAthleteKeys(item) {
  const rows = item.athletes || item.rows || [];
  return Array.from(new Set(rows.flatMap((row) => [row.id, row.athleteId, row.smartcoachAthleteId, row.contactId, row.name, row.athleteName].filter(Boolean).map((value) => String(value).trim().replace(/\s+/g, " ").toLowerCase()))));
}

async function readSession(accountKey, ref, io) {
  if (!/^[a-f0-9]{64}$/.test(ref.digest) || !Number.isInteger(ref.count) || ref.count < 1 || ref.count > 200) throw storageError("Power Trak session index is invalid.");
  const chunks = await mapBounded(Array.from({ length: ref.count }, (_, index) => index), async (index) => {
    const saved = await io.load(accountKey, `powertrak_session_${ref.digest}_${index}`);
    if (!saved || !saved.found || !saved.record || typeof saved.record.data !== "string") throw storageError("Power Trak session storage is incomplete. Please retry.");
    return saved.record.data;
  });
  let json;
  try { json = zlib.gunzipSync(Buffer.from(chunks.join(""), "base64")).toString(); }
  catch (_) { throw storageError("Power Trak session could not be decoded."); }
  if (crypto.createHash("sha256").update(json).digest("hex") !== ref.digest) throw storageError("Power Trak session integrity check failed.");
  let item;
  try { item = JSON.parse(json); } catch (_) { throw storageError("Power Trak session could not be parsed."); }
  if (item.id !== ref.id) throw storageError("Power Trak session identity check failed.");
  return item;
}

function selectHistory(sessionRefs, rackRefs, version, options = {}) {
  const athleteKeys = [options.athleteId, options.athleteName].filter(Boolean).map((value) => String(value).trim().replace(/\s+/g, " ").toLowerCase());
  const matchesAthlete = (ref) => !athleteKeys.length || !Array.isArray(ref.athleteKeys) || athleteKeys.some((value) => ref.athleteKeys.includes(value));
  const sessionIds = options.sessionIds ? new Set(options.sessionIds) : null;
  const sessions = options.omitTesting ? [] : sessionRefs.filter((item) => matchesAthlete(item) && (!sessionIds || sessionIds.has(item.id)) && (!options.groupId || item.groupId === options.groupId) && (!options.start || item.date >= options.start) && (!options.end || item.date <= options.end));
  const ids = new Set(options.rackIds || []);
  const workoutIds = new Set(options.rackWorkoutIds || []);
  const racks = options.omitRacks ? [] : rackRefs.filter((item) => matchesAthlete(item) && (!options.activeOnly || item.status === "active" || ids.has(item.id) || workoutIds.has(item.workoutId)));
  if (!options.pageSize) return { sessions, racks, nextCursor: null, totalSessions: sessions.length, totalRacks: racks.length };
  const limit = Math.max(1, Math.min(Number(options.pageSize) || 50, 100));
  let offset = 0;
  const filter = crypto.createHash("sha256").update(JSON.stringify([options.groupId || "", options.start || "", options.end || "", !!options.activeOnly, !!options.omitTesting, !!options.omitRacks, Array.from(ids).sort(), Array.from(workoutIds).sort(), sessionIds ? Array.from(sessionIds).sort() : null, athleteKeys])).digest("hex").slice(0, 16);
  if (options.cursor) {
    let cursor;
    try { cursor = JSON.parse(Buffer.from(options.cursor, "base64url").toString()); }
    catch (_) { throw storageError("Power Trak history cursor is invalid.", 400); }
    if (cursor.version !== version) throw storageError("Power Trak history changed. Reload the first page.", 409);
    if (cursor.filter !== filter || !Number.isInteger(cursor.offset) || cursor.offset < 0 || cursor.offset > sessions.length + racks.length) throw storageError("Power Trak history cursor is invalid.", 400);
    offset = cursor.offset;
  }
  const combined = sessions.map((ref) => ({ ref, rack: false })).concat(racks.map((ref) => ({ ref, rack: true })));
  const selected = [];
  let bytes = 0;
  const budget = options.byteBudget == null ? PAGE_BYTES : options.byteBudget;
  while (offset < combined.length && selected.length < limit) {
    const item = combined[offset];
    if (selected.length && bytes + item.ref.bytes > budget) break;
    if (item.ref.bytes > budget) throw storageError("A Power Trak session exceeds the history page size. Contact support.", 413);
    selected.push(item); bytes += item.ref.bytes; offset++;
  }
  return {
    sessions: selected.filter((item) => !item.rack).map((item) => item.ref),
    racks: selected.filter((item) => item.rack).map((item) => item.ref),
    nextCursor: offset < combined.length ? Buffer.from(JSON.stringify({ version, filter, offset })).toString("base64url") : null,
    totalSessions: sessions.length, totalRacks: racks.length,
  };
}

async function loadSessionState(accountKey, root, io, options = {}) {
  if (options.cursor) {
    let cursor;
    try { cursor = JSON.parse(Buffer.from(options.cursor, "base64url").toString()); }
    catch (_) { throw storageError("Power Trak history cursor is invalid.", 400); }
    if (cursor.version !== root.version) {
      if (!/^[a-f0-9-]{36}$/.test(String(cursor.version || ""))) throw storageError("Power Trak history changed. Reload the first page.", 409);
      const saved = await io.load(accountKey, `powertrak_index_${cursor.version}`);
      if (!saved || !saved.record || saved.record.storageVersion !== 2 || saved.record.version !== cursor.version) throw storageError("Power Trak history snapshot expired. Reload the first page.", 409);
      root = saved.record;
    }
  }
  if (!root.metadata || !Array.isArray(root.sessionRefs) || !Array.isArray(root.rackSessionRefs) || !/^[a-f0-9-]{36}$/.test(String(root.version || ""))) throw storageError("Power Trak session index is invalid.");
  const byteBudget = Math.min(PAGE_BYTES, 3500000 - Buffer.byteLength(JSON.stringify(root.metadata || {})) - 100000);
  if (options.pageSize && byteBudget < 0) throw storageError("Power Trak account settings exceed the page size. Contact support.", 413);
  const selection = selectHistory(root.sessionRefs || [], root.rackSessionRefs || [], root.version, { ...options, byteBudget });
  // Snapshot only multi-page readers, rather than copying an index on every set save.
  if (options.pageSize && !options.cursor && selection.nextCursor) {
    await io.saveBatch(accountKey, [{ namespace: `powertrak_index_${root.version}`, record: root, ttlSeconds: 3600 }]);
  }
  const refs = selection.sessions.concat(selection.racks);
  let reader = io;
  if (io.loadBatch && refs.length) {
    const namespaces = Array.from(new Set(refs.flatMap((ref) => {
      if (!/^[a-f0-9]{64}$/.test(ref.digest) || !Number.isInteger(ref.count) || ref.count < 1 || ref.count > 200) throw storageError("Power Trak session index is invalid.");
      return Array.from({ length: ref.count }, (_, index) => `powertrak_session_${ref.digest}_${index}`);
    })));
    const batches = [];
    for (let index = 0; index < namespaces.length; index += 10) batches.push(namespaces.slice(index, index + 10));
    const cache = new Map();
    await mapBounded(batches, async (batch) => {
      const loaded = await io.loadBatch(accountKey, batch);
      batch.forEach((namespace, index) => cache.set(namespace, loaded[index]));
    });
    reader = { load: async (_account, namespace) => cache.get(namespace) };
  }
  const values = await mapBounded(refs, (ref) => readSession(accountKey, ref, reader));
  return {
    ...root.metadata,
    powerTrakSessions: values.slice(0, selection.sessions.length),
    powerTrakRackSessions: values.slice(selection.sessions.length),
    _powerHistory: { nextCursor: selection.nextCursor, totalSessions: selection.totalSessions, totalRacks: selection.totalRacks, storedSessionCount: (root.sessionRefs || []).length, storedRackCount: (root.rackSessionRefs || []).length, version: root.version },
  };
}

function selectLegacyState(state, options = {}) {
  const sessions = state.powerTrakSessions || [], racks = state.powerTrakRackSessions || [];
  const version = crypto.createHash("sha256").update(JSON.stringify([sessions, racks])).digest("hex");
  const ref = (item) => ({ ...item, athleteKeys: sessionAthleteKeys(item), bytes: Buffer.byteLength(JSON.stringify(item)) });
  const metadata = { ...state }; delete metadata.powerTrakSessions; delete metadata.powerTrakRackSessions;
  const byteBudget = Math.min(PAGE_BYTES, 3500000 - Buffer.byteLength(JSON.stringify(metadata)) - 100000);
  const selection = selectHistory(sessions.map(ref), racks.map(ref), version, { ...options, byteBudget });
  const sessionIds = new Set(selection.sessions.map((item) => item.id)), rackIds = new Set(selection.racks.map((item) => item.id));
  return { ...state, powerTrakSessions: sessions.filter((item) => sessionIds.has(item.id)), powerTrakRackSessions: racks.filter((item) => rackIds.has(item.id)), _powerHistory: { nextCursor: selection.nextCursor, totalSessions: selection.totalSessions, totalRacks: selection.totalRacks, version } };
}

async function saveSessionState(accountKey, state, io, options = {}) {
  const current = await io.load(accountKey, ROOT);
  if (options.expectedRootToken) {
    const record = current && current.record;
    const token = record && (record.version || record.chunkManifest && record.chunkManifest.digest || record.updatedAt) || "";
    if (Boolean(record) !== options.expectedRootToken.present || token !== options.expectedRootToken.token) {
      const error = storageError("Power Trak history changed during this save. Please retry.", 503);
      error.code = "POWER_TRAK_BUSY";
      throw error;
    }
  }
  const old = current && current.record && current.record.storageVersion === 2 ? current.record : null;
  if (options.expectedVersion && (!old || old.version !== options.expectedVersion)) {
    const error = storageError("Power Trak history changed during this save. Please retry.", 503);
    error.code = "POWER_TRAK_BUSY";
    throw error;
  }
  if (options.partial && !old) throw storageError("Power Trak history needs a full save before incremental updates.", 409);
  const pending = [];
  function refsFor(items, previous, deletedIds, rack) {
    const previousById = new Map((previous || []).map((ref) => [ref.id, ref]));
    const result = options.partial ? new Map(previousById) : new Map();
    (deletedIds || []).forEach((id) => result.delete(id));
    for (const item of items || []) {
      const described = describeSession(item);
      const prior = previousById.get(item.id);
      if (!prior || prior.digest !== described.ref.digest) pending.push(...described.chunks);
      result.set(item.id, described.ref);
    }
    return Array.from(result.values()).sort((a, b) => (rack ? 0 : String(b.date).localeCompare(String(a.date))) || String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  }
  const sessionRefs = refsFor(state.powerTrakSessions, old && old.sessionRefs, options.deleteIds);
  const rackSessionRefs = refsFor(state.powerTrakRackSessions, old && old.rackSessionRefs, options.deleteRackSessionIds, true);
  if (sessionRefs.length > 1000) throw storageError("Power Trak testing history has reached its session limit. Contact support.", 413);
  if (rackSessionRefs.length > 2000) throw storageError("Power Trak history has reached its session limit. Contact support before importing more.", 413);
  const metadata = { ...state };
  delete metadata.powerTrakSessions; delete metadata.powerTrakRackSessions; delete metadata._powerHistory;
  // Immutable session blobs are written before switching the account index.
  const batches = [];
  for (let index = 0; index < pending.length; index += 3) batches.push(pending.slice(index, index + 3));
  await mapBounded(batches, (batch) => io.saveBatch(accountKey, batch));
  const root = { storageVersion: 2, version: crypto.randomUUID(), metadata, sessionRefs, rackSessionRefs };
  const saved = await io.saveRoot(accountKey, ROOT, root, current && current.record || null, Array.from(new Set(pending.map((item) => item.namespace))));
  if (!saved || saved.saved === false) throw storageError("Power Trak session index could not be saved.", 503);
  if (old && io.expire) {
    const retained = new Set(sessionRefs.concat(rackSessionRefs).map((ref) => ref.digest));
    const retired = (old.sessionRefs || []).concat(old.rackSessionRefs || []).filter((ref) => !retained.has(ref.digest));
    const namespaces = Array.from(new Set(retired.flatMap((ref) => Array.from({ length: ref.count }, (_, index) => `powertrak_session_${ref.digest}_${index}`))));
    if (namespaces.length) await io.expire(accountKey, namespaces, 86400, root.version).catch(() => console.warn("Power Trak retired-session cleanup will require retry."));
  }
  return { sessionCount: sessionRefs.length, rackSessionCount: rackSessionRefs.length };
}

module.exports = { loadSessionState, saveSessionState, selectLegacyState };
