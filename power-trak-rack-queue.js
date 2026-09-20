(function initPowerTrakRackQueue(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PowerTrakRackQueue = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function powerTrakRackQueueFactory() {
  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function merge(items, rack) {
    const current = Array.isArray(items) ? items : [];
    if (!rack || !rack.id) return current.map(clone);
    return current.filter((item) => item && item.id !== rack.id).map(clone).concat(clone(rack));
  }

  function remove(items, rackId) {
    return (Array.isArray(items) ? items : []).filter((item) => item && item.id !== rackId).map(clone);
  }

  return { merge, remove };
}));
