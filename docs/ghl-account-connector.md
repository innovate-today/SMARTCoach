# HighLevel Account Connector

## Current Boundary

Private app `SMARTCoach Pro Account Connector`, app/version ID
`6abfe408797ba36482ddbe72`, targets Sub-Account and is installable by Agency only.
The original Agency-targeted provisioning app remains responsible for LocationCreate.

This implementation saves an encrypted Company OAuth grant, renews it on demand,
and obtains identity-verified tokens for individually installed buyer locations.
Selected authenticated read routes can use the buyer OAuth pilot. A separate admin
check writes and reads back only the buyer account-key custom value. It does NOT
replace saved PITs, generate coach credentials, or verify purchase-to-access
onboarding. A separate admin action can submit a welcome sign-in link; inbox
delivery remains independent. Other CRM consumers remain on their existing transport.

## Account-Key Write Verification

Admin/Setup's `Verify Account-Key Write` sends a same-origin, admin-header POST to
`/api/smart-trak/ghl-oauth-verify-write`. It requires prior buyer verification,
the exact saved location-derived account key, current single-location installation,
agency/location identity, and custom-value write permission. It creates or re-saves
only `account_key` with the saved buyer key, then independently reads the value back.
An existing conflicting nonempty key, duplicate key values, or foreign-location
value fails closed without a write. The operation does not change plan, PIT, coach
codes, athletes, or email delivery. Success proves this onboarding write only, not
all coach save operations or automatic fulfillment.

## Buyer Welcome Link Pilot

`Send Welcome Link` makes an admin-header, same-origin POST to
`ghl-oauth-send-welcome`. Buyer OAuth verifies the buyer identity only. Email
uses a separate seller token, the saved buyer owner email, and an exact
email/seller-location-matching contact (created with an owner tag if absent).
It refuses duplicate matching contacts. The email links to the buyer's Overview;
it neither sends nor rotates coach codes. Welcome instructions direct the buyer
to the separate SMARTCoach Access email for a personal code and phone-app setup,
then Overview sign-in and Account -> Staff Access for head-coach invitations.
Buyers missing the access email are directed to support before trying to sign in.
This copy does not establish that a personal code or access email was delivered.
HighLevel must use the established SMARTCoach Pro seller location
`QxwjWekSyUf7sDOFHPB4`, its authenticated email service, and an explicitly
configured `SMARTCOACH_WELCOME_FROM_EMAIL`. Set the dedicated server-only
`SMARTCOACH_WELCOME_SELLER_TOKEN` to that seller's PIT with locations.readonly,
contacts.readonly, contacts.write, and conversations/message.write permissions.
Never use a buyer token, infer the sender from a default CRM account, or install
the connector in additional locations without approval. Missing seller configuration
fails closed. Provider location/company and seller contact identity are checked
before sending. Confirm the From address is configured and authenticated in GHL;
the app's domain validation is not proof of SPF/DKIM/DMARC alignment or delivery.
Owner-selected onboarding From address is `info@smartcoach-pro.com`; support
instructions and buyer owner recipient remain `support@smartcoach-pro.com`.
The dedicated seller integration is `SMARTCoach Welcome Email`, with only the
four scopes above. Do not change the seller's domain-wide fallback header just
to set a per-message From address; verify the actual received header separately.

An attempt is durably recorded before message submission, preventing automatic
duplicates after uncertain failures. A message ID records provider acceptance,
not delivery. Repeated accepted requests do not resend. Uncertain attempts or
changed recipients require support review rather than a blind retry. This is an
admin-triggered pilot, not automatic purchase fulfillment. Verify the inbox and
Overview sign-in independently. Existing code recovery remains unchanged.
Legacy accepted messages sent from the buyer account block automatic resends;
review and separately authorize a corrected seller delivery. The preview identifies
the earlier message; a correction requires explicit confirmation and its exact
message ID. Only accepted legacy attempts qualify. The replacement retains the
complete original record as `priorDelivery`, even if transmission fails. Once a
seller attempt exists, retries stay blocked or idempotent. Do not erase history.

`Update Owner Email Only` previews the saved recipient and explicitly confirms
the change to the owner/code-recovery destination. Its same-origin admin POST to
`ghl-oauth-update-owner-email` requires verified buyer OAuth and an unchanged
expected old email. It preserves the existing record except owner email and
clears a stale owner-contact reference when the email changes. It does not save
unloaded setup form defaults. A prior welcome attempt blocks this correction
until support has reviewed delivery. Changes require owner approval.

API reference: https://marketplace.gohighlevel.com/docs/ghl/conversations/send-a-new-message/index.html

## Configuration Before Installation

Configure these server-only environment variables in Vercel:

- `SMARTCOACH_ADMIN_SETUP_CODE`: required, accepted only through the setup-code header.
- `SMARTCOACH_GHL_OAUTH_CLIENT_ID`: client belonging to the connector app above.
- `SMARTCOACH_GHL_OAUTH_CLIENT_SECRET`: client secret; never commit or expose it.
- `SMARTCOACH_GHL_OAUTH_COMPANY_ID`: independently verified agency Company ID.
- `SMARTCOACH_GHL_OAUTH_ENCRYPTION_KEY`: a dedicated random 32-byte key, base64 encoded.
- `SMARTCOACH_GHL_OAUTH_REDIRECT_URI`: `https://app.smartcoach-pro.com/api/smart-trak/crm-connect-callback`.
- `SMARTCOACH_GHL_OAUTH_INSTALL_URL`: the connector's official Marketplace install URL, with its matching client_id.
- `SMARTCOACH_GHL_OAUTH_SCOPES`: exact space-separated approved scopes. Finalize these against the CRM operations before installation; do not grant all permissions.

An existing configured account registry is also required. Register the exact callback
URL in the connector Auth settings only after deploying the handler. Do not use the
site root as the callback. Do not repurpose the original provisioning app's client.
The neutral callback path is required because Marketplace white-label validation
rejects URLs containing a HighLevel reference, including `ghl` in the path.

## Authorization

### Audited Scope List

The existing CRM call sites and HighLevel's scope documentation support this
11-scope request for the planned buyer connector:

| Scope | Existing/planned operation |
| --- | --- |
| `oauth.readonly` | Verify the connector's installed buyer locations |
| `oauth.write` | Exchange agency authorization for installed-location access |
| `locations.readonly` | Verify the buyer location |
| `locations/customValues.readonly` | Find the SMARTCoach account-key custom value |
| `locations/customValues.write` | Save the buyer account-key custom value |
| `locations/customFields.readonly` | Read athlete field definitions |
| `contacts.readonly` | Read roster and owner contacts |
| `contacts.write` | Save athletes, contact tags/notes and owner contact |
| `objects/record.readonly` | Read/search training, meet and result records |
| `objects/record.write` | Save/correct training, meet and result records |
| `conversations/message.write` | Send approved access/calendar emails |

No user scopes, payments, location creation/deletion, object-schema editing,
custom-field editing, or unrelated marketing/calendar permissions are needed by
the inspected call sites. GHL scopes are coarser than SMARTCoach operations:
contacts.write includes campaign/workflow contact operations, and record.write
includes deletion. Application authorization must continue constraining use.
The scope list does not itself authorize sending email or modifying unrelated
locations, and has not been granted by an install.

Sources: https://marketplace.gohighlevel.com/docs/Authorization/Scopes/index.html
and https://marketplace.gohighlevel.com/docs/ghl/objects/search-object-records/ .

In Admin/Setup (`onboarding.html`), enter the admin Setup Code and select
Connect HighLevel Agency. POST `/api/smart-trak/ghl-oauth-start` requires a matching
Origin and the `x-smartcoach-setup-code` header. It sets a Secure, HttpOnly,
SameSite=Lax host-only cookie and returns an authorization URL with random state.
Authorize in the same browser. Obtain owner approval before the access grant.

The callback checks cookie binding, ten-minute expiry, one-time registry state,
Company token type, expected agency identity, optional returned app identity,
and exact scopes. It refuses all-location and future-location approvals in this
initial release. The token exchange uses the documented v3 OAuth endpoint.
HTTP 200 means only agency authorization was saved, never buyer onboarding.

Tokens are AES-256-GCM encrypted in a separate account-scoped registry record,
with app/agency identity as authenticated data. No token, authorization code,
or provider response appears in endpoint responses or application usage audit.
Hosting-layer access logs may contain callback query parameters; restrict their
access and retention. Callback responses are no-store and no-referrer.

Check HighLevel Connection returns only status, app ID, and expiry. It does not
refresh or return credentials. `agencyGrant()` performs locked, on-demand refresh
within two minutes of expiry. Refresh attempts mark the saved grant as requiring
reauthorization before consuming a single-use refresh token. If an exchange or
save is interrupted, reauthorize; do not retry the old refresh token. Keep the
encryption key stable; losing/rotating it requires reauthorization.

## Remaining Work

### Buyer OAuth Verification

Admin/Setup now includes Verify Buyer OAuth. Supply the existing location-based
account key, its confirmed Location ID, and the admin Setup Code. The POST
`ghl-oauth-verify-buyer` route requires the same-origin admin header, a saved matching
buyer record, and a buyer location distinct from the seller. It confirms installation
through the agency's installed-locations API, validates location-token identity and
scopes, and reads location details, custom values, custom fields and one contact.
Contact listing uses its documented 2023-02-21 version (deprecated upstream).

Buyer grants are encrypted separately under `buyergrant-<locationId>`. Reuse checks
the current installation and mapping; near expiry, a new token is requested through
the agency grant instead of consuming a location refresh token. Verification never
overwrites the PIT, changes subscriptions,
creates coach credentials, sends email, or marks onboarding complete. Live renewal
and INSTALL event reconciliation remain separate work.

### Read-Only Consumer Rollout

`SMARTCOACH_GHL_OAUTH_READ_ACCOUNTS` is an exact comma/space-separated allowlist
of verified buyer account keys. For those accounts, authenticated GET requests to
the smart-trak athletes, dashboard, groups, meets, training-plan, athlete-best and
athlete-profile routes resolve the encrypted buyer grant before invoking existing
CRM consumers. `X-SMARTCoach-CRM-Auth: oauth` identifies the selected transport,
without exposing a token. A missing or revoked grant fails closed, not back to PIT.
The PIT remains stored and is used by writes, other routes, legacy direct GHL routes,
public links and non-allowlisted accounts. Removing the allowlist entry rolls back
the pilot. This is not a completed OAuth migration or automatic onboarding.

1. Configure client, scopes, agency identity and secrets, deploy, then obtain approval to authorize only the intended buyer installation.
2. Verify real token response and refresh behavior; mock tests do not establish live connectivity.
3. Add verified INSTALL handling for this connector, matching app/company/location identity and an existing valid checkout-to-buyer mapping. Handle event arrival order and duplicate delivery safely.
4. Obtain location tokens only for confirmed installed buyer locations, validating returned location identity. Add renewal to CRM consumers before replacing any PIT.
5. Verify private-app future-install eligibility in the actual UI. Enabling it later requires an explicit access-scope decision and changes to this release's default rejection.
6. Reconcile Trialing versus Active, verify coach creation, welcome-email delivery to the verified owner, Overview destination, and approved clean purchase-to-access validation.

## Sources

- https://marketplace.gohighlevel.com/docs/Authorization/TargetUserSubAccount/index.html
- https://marketplace.gohighlevel.com/docs/ghl/oauth/get-access-token/index.html
- https://marketplace.gohighlevel.com/docs/ghl/oauth/get-location-access-token/

Run `node tests/ghl-oauth.test.js` or the full `npm test` suite.
