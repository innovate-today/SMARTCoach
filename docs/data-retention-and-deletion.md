# Data Retention and Deletion Standard

Last reviewed: 2026-09-21

## Default Retention

- Power Trak exercise results: retained while the school account is active so coaches can review athlete progression.
- Security activity: up to 180 days.
- Aggregated API operational metrics: 14 days.
- Offline rack queue: retained only on the rack iPad until synchronization or manual browser-data removal.
- Revoked device records: retained for security history and may be removed during account closure.

## School-Controlled Deletion

Coaches can delete saved Power Trak sessions and individual recorded sets through the application. Account closure or a verified school deletion request must remove account-scoped Power Trak records, device registrations, security logs, and other tenant records from active storage.

## Backups and Restoration

Production storage and hosting backups must use provider encryption and access controls. Restore access is limited to authorized operators. A restore test should be completed at least annually and after a material storage change. Deletion from backup media follows the provider's backup-expiration cycle; deleted data must not be restored into active service except for documented disaster recovery.

## Review

The school and system owner should review retention annually. Shorter school or state requirements take precedence when contractually accepted.

