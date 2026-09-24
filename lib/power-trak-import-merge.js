const crypto = require("crypto");

function imported(session) {
  return session && String(session.id || "").startsWith("power_import_");
}

function athleteKey(athlete) {
  return String(athlete && athlete.name || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function resultKey(result) {
  return [result.exerciseName, result.round, result.rep, result.actualValue, result.unit, result.completedAt]
    .map((part) => String(part == null ? "" : part).trim().toLowerCase()).join("|");
}

function mergePowerImportSessions(existing, incoming) {
  const importedIncoming = (incoming || []).filter(imported);
  if (!importedIncoming.length) return { sessions: existing || [], merged: [] };
  const affected = new Set(importedIncoming.map((session) => session.workoutId));
  const retained = (existing || []).filter((session) => !imported(session) || !affected.has(session.workoutId));
  const byWorkout = new Map();

  [...(existing || []).filter((session) => imported(session) && affected.has(session.workoutId)), ...importedIncoming]
    .forEach((session) => {
      let group = byWorkout.get(session.workoutId);
      if (!group) {
        group = { template: session, athletes: new Map() };
        byWorkout.set(session.workoutId, group);
      }
      (session.athletes || []).forEach((athlete) => {
        const key = athleteKey(athlete);
        if (!key) return;
        let entry = group.athletes.get(key);
        if (!entry) {
          entry = { ...athlete, results: [], seen: new Set() };
          group.athletes.set(key, entry);
        }
        (athlete.results || []).forEach((result) => {
          const fingerprint = resultKey(result);
          if (entry.seen.has(fingerprint)) return;
          entry.seen.add(fingerprint);
          entry.results.push(result);
        });
      });
    });

  const merged = [];
  byWorkout.forEach(({ template, athletes }, workoutId) => {
    const sorted = Array.from(athletes.values()).sort((a, b) => athleteKey(a).localeCompare(athleteKey(b)));
    for (let offset = 0; offset < sorted.length; offset += 4) {
      const chunk = sorted.slice(offset, offset + 4).map(({ seen, ...athlete }) => ({
        ...athlete,
        completedReps: athlete.results.length,
      }));
      const identity = [workoutId, ...chunk.map(athleteKey)].join("|");
      merged.push({
        ...template,
        id: `power_import_v2_${crypto.createHash("sha256").update(identity).digest("hex").slice(0, 24)}`,
        rackName: `Imported Report ${Math.floor(offset / 4) + 1}`,
        athletes: chunk,
      });
    }
  });
  return { sessions: retained.concat(merged), merged };
}

module.exports = { mergePowerImportSessions };
