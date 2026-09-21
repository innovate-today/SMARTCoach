# Power Trak School Security Overview

Last reviewed: 2026-09-21

## Data Scope

Power Trak stores athlete names or roster identifiers, workout assignments, exercises, completed repetitions, load or result values, and timestamps. It does not require addresses, Social Security numbers, academic grades, medical records, or payment information. Because names are linked to workout results, schools should still treat the records as identifiable student information.

## Access Controls

- Coaches authenticate with account credentials and role-aware sessions.
- Rack iPads receive a signed `power-rack` session, not a coach session.
- Rack sessions expire after 24 hours and are bound to the registered rack device ID.
- Rack devices can read only the active roster fields, groups, workout templates, provisional athletes, active rack sessions, and reservations required for the workout.
- Rack devices cannot access dashboards, meet history, imports, staff settings, or coach-managed roster mutations.
- Rack writes are limited to that device's sessions and explicit rack actions.
- Head coaches can remotely sign out one rack iPad or every rack iPad.
- Athlete reservations prevent one athlete from being active on two racks simultaneously.

## Technical Safeguards

- TLS/HTTPS is required by production hosting.
- Session tokens are HMAC-SHA256 signed, account-bound, expiring, and version checked.
- Account data uses tenant-scoped keys and mutation locks.
- Power Trak responses are not cached and are excluded from search indexing.
- The rack page denies framing, disables unneeded browser capabilities, restricts form and connection destinations, and applies a Content Security Policy.
- Power Trak API cross-origin access is limited to the production application origin and local development.
- Login, denial, rack write, and revocation events are retained in the security activity log for up to 180 days.

## School Responsibilities

- Limit coach credentials to authorized staff and remove access promptly when roles change.
- Keep rack iPads physically controlled and use device passcodes or managed-device controls.
- Sign out lost, reassigned, or retired rack iPads from Staff Access.
- Review security activity periodically and report unexpected events.
- Establish the school's retention period and submit deletion requests when records are no longer required.

## Vendor Review Evidence

The repository includes automated authorization, session-signing, security-header, offline-sync, tenant-scoping, and mutation-lock tests. A school or independent assessor may request architecture, data-flow, subprocessors, backup/restore, vulnerability-management, and incident-response evidence from the system owner.

