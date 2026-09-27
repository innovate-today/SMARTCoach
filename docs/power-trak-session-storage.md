# Power Trak Session Storage

Power Trak now stores compressed, immutable individual testing and rack session
records behind an account-scoped versioned index. Workout definitions, catalog,
reservations, and other settings remain in the index metadata. The index still
grows with session count; this is not an unlimited-capacity database conversion.

## Reads and Saves

- History clients request pages of 50 records (maximum 100), with byte-budget
  limits. Existing leaderboard views aggregate their requested pages in-browser.
- Active rack refreshes and incremental saves read active or affected records,
  rather than completed history. Imports read the affected workout cohorts.
- `response=delta` returns changed records and explicit deleted IDs. Clients
  merge these into existing state without dropping unrelated history.
- Athlete snapshot requests filter Power Trak history by athlete identity.
- Older callers without pagination/delta options retain full-response behavior.
- A single session exceeding the page budget returns 413; sessions are not split
  across pages. Existing limits remain 1,000 tests and 2,000 rack sessions.

## Publication and Recovery

Session blobs are staged with a 24-hour expiry. An atomic compare-and-set checks
the previous index, persists staged blobs, and publishes the new index together.
Concurrent stale writes fail instead of overwriting newer history. Failed staging
does not replace the live index. Account-scoped keys isolate school data.

Multi-page readers receive stable index snapshots with a one-hour lifetime.
Replaced blobs have a 24-hour reader grace period. Expired cursors cause clients
to restart the read without presenting a partially loaded history.

The first successful save migrates legacy history and can take longer. Legacy
chunks are retained, but subsequent writes use the new format. Do not roll back
to a deployment without a version-2 reader after migration, including older
preview deployments sharing the production registry. Restoring a legacy pointer
would discard subsequent updates; use a forward-compatible rollback or an
explicitly validated recovery procedure.

## Validation Scope

Automated tests cover migration failure, incremental preservation, paging,
concurrent publication, account isolation, registry errors, and client merging.
Other SMART Trak collections are not migrated by this change. Production load
testing, subscriber-capacity measurement, and physical iOS recovery testing
remain separate work. These tests do not certify a subscriber ceiling.
