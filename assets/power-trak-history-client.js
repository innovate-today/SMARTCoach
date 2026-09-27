(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PowerTrakHistoryClient = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function withQuery(url, values) {
    const parsed = new URL(url, typeof location !== "undefined" ? location.href : "https://app.smartcoach-pro.com");
    Object.entries(values).forEach(([key, value]) => value == null ? parsed.searchParams.delete(key) : parsed.searchParams.set(key, value));
    return String(url).startsWith("/") ? parsed.pathname + parsed.search + parsed.hash : parsed.href;
  }

  function mergeRows(current, incoming, deleted) {
    const rows = new Map((current || []).map((item) => [item.id, item]));
    (deleted || []).forEach((id) => rows.delete(id));
    (incoming || []).forEach((item) => rows.set(item.id, item));
    return Array.from(rows.values());
  }

  function mergeDelta(data, current) {
    if (!data.historyDelta) return data;
    return { ...data,
      sessions: mergeRows(current.sessions, data.sessions, data.deletedSessionIds).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))),
      rackSessions: mergeRows(current.rackSessions, data.rackSessions, data.deletedRackSessionIds).sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || ""))),
    };
  }

  async function readHistory(url, options, fetchImpl) {
    // A changing account index invalidates a cursor; restart without publishing partial data.
    for (let attempt = 0; attempt < 3; attempt++) {
      let cursor = null, first = null, sessions = [], racks = [], restart = false;
      do {
        const response = await fetchImpl(withQuery(url, { pageSize: 50, cursor }), options);
        const data = await response.json();
        if (!response.ok) {
          if (response.status === 409 && cursor) { restart = true; break; }
          throw new Error(data.error || "Power Trak history could not be loaded.");
        }
        if (!first) first = data;
        sessions = sessions.concat(data.sessions || []);
        racks = racks.concat(data.rackSessions || []);
        cursor = data.historyPage && data.historyPage.nextCursor;
      } while (cursor);
      if (!restart) return { ...first, sessions: mergeRows([], sessions), rackSessions: mergeRows([], racks) };
    }
    throw new Error("Power Trak history is changing. Wait a moment and refresh.");
  }

  return { withQuery, mergeDelta, readHistory };
});
