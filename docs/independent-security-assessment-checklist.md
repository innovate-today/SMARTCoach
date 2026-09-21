# Independent Security Assessment Checklist

This checklist prepares Power Trak for an external review. Completion by the development team is not an independent attestation.

## Scope

- Production web application and APIs
- Rack PWA authentication and offline queue
- Account registry and Power Trak scoped storage
- Hosting, deployment, secrets, logs, backups, and operator access

## Tests Requested

- Authentication, session fixation, replay, expiration, and revocation
- Horizontal and vertical authorization across accounts, coaches, and rack devices
- API object-level authorization and mass-assignment testing
- Cross-origin, CSP, clickjacking, XSS, CSRF, injection, and dependency review
- Offline/local-storage exposure on lost or shared rack devices
- Rate limiting and credential-stuffing resistance
- Tenant isolation, storage permissions, backup restoration, and deletion verification
- Logging completeness and incident-response tabletop exercise

## Evidence Package

- Current architecture and data-flow diagram
- Data inventory and retention standard
- Access-control matrix
- Security event samples with student information removed
- Automated test results and deployment revision
- Hosting/storage encryption and backup evidence
- Subprocessor list and applicable agreements
- Incident-response plan and responsible contacts

## Exit Criteria

- No unresolved critical or high-severity findings
- Medium findings have documented owners and deadlines
- Authorization and tenant-isolation retests pass
- Final report is retained and available for school review under appropriate confidentiality terms

