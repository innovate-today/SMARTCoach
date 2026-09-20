(function initPowerTrakRackSync(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PowerTrakRackSync = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function powerTrakRackSyncFactory() {
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  async function flush(items, send) {
    const queue = Array.isArray(items) ? items : [];
    const synced = [];
    const failed = [];

    for (const item of queue) {
      const rack = clone(item);
      try {
        const data = await send(rack);
        synced.push({ rack, data });
      } catch (error) {
        failed.push({ rack, error });
      }
    }

    return {
      synced,
      failed,
      remaining: failed.map((item) => clone(item.rack)),
    };
  }

  return { flush };
}));
