const NAMESPACE = /^buyerreadiness-[a-z0-9]{20}$/;

function createBuyerReadinessWorker(deps) {
  async function persist(state) {
    await deps.save(state);
    const confirmed = await deps.load();
    if (!confirmed || confirmed.cursor !== state.cursor || JSON.stringify(confirmed.pending) !== JSON.stringify(state.pending)) {
      throw new Error("Readiness worker readback failed.");
    }
  }

  async function run() {
    if (!deps.enabled()) return { status: "disabled", processed: 0 };
    const release = await deps.lock();
    try {
      let state = await deps.load() || { cursor: "0", pending: [] };
      if (!/^\d+$/.test(state.cursor) || !Array.isArray(state.pending) || state.pending.length > 1000
        || state.pending.some(name => !NAMESPACE.test(name))) throw new Error("Invalid readiness worker state.");
      if (!state.pending.length) {
        const page = await deps.scan(state.cursor);
        if (!/^\d+$/.test(page.cursor) || !Array.isArray(page.namespaces) || page.namespaces.length > 1000
          || page.namespaces.some(name => !NAMESPACE.test(name))) throw new Error("Invalid readiness scan.");
        state = { cursor: page.cursor, pending: [...new Set(page.namespaces)] };
        // Save the whole page before processing: SCAN's count is a hint, not a limit.
        await persist(state);
      }
      const namespace = state.pending[0];
      if (!namespace || !deps.enabled()) return { status: namespace ? "disabled" : "idle", processed: 0 };
      const job = await deps.loadJob(namespace);
      let result = { status: "not_queued" };
      if (job) {
        if (!job.locationId || namespace !== `buyerreadiness-${job.locationId.toLowerCase()}`
          || job.buyerAccountKey !== `sc-${job.locationId.toLowerCase()}` || job.signatureVerified !== true) {
          throw new Error("Readiness job identity mismatch.");
        }
        result = await deps.resume({ locationId: job.locationId, accountKey: job.buyerAccountKey });
      }
      await persist({ ...state, pending: state.pending.slice(1) });
      return { status: "processed", processed: 1, buyerStatus: result.status };
    } finally { await release(); }
  }
  return { run };
}

module.exports = { createBuyerReadinessWorker };
