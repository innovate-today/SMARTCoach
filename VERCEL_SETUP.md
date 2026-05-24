# SMARTCoach + SMART Trak Vercel Setup

## Required Environment Variables

For the current launch path, configure production with `/onboarding.html` and the durable account registry. New customer accounts should be saved to the registry instead of adding a new set of Vercel variables for every coach.

At minimum, production should have:

- registry storage values, such as `KV_REST_API_URL` and `KV_REST_API_TOKEN`, or `SMARTCOACH_REGISTRY_REST_URL` and `SMARTCOACH_REGISTRY_REST_TOKEN`
- `SMARTCOACH_AUTOMATION_SECRET`
- `SMARTCOACH_ADMIN_SETUP_CODE`
- `SMARTCOACH_SESSION_SECRET`
- `SMARTCOACH_REQUIRE_COACH_ACCESS=true`
- `SMARTCOACH_STRIPE_WEBHOOK_SECRET` if direct Stripe webhooks are enabled

Default environment variables are still supported for the original/default SMARTCoach Pro account or migration fallback:

- `GHL_PRIVATE_INTEGRATION_TOKEN`
- `GHL_LOCATION_ID`
- `SMARTCOACH_PRODUCT_PLAN`

The browser app calls serverless SMART Trak endpoints. Those functions use private tokens, so private integration tokens are not exposed in `index.html`.

Use `SMARTCOACH_PRODUCT_PLAN=pro` only for the default SMARTCoach Pro account. New customers should use registry records created from `/onboarding.html`.

## Customer Account Setup

Every customer account uses an account key in the URL, for example:

- `/dashboard.html?account=lincolntrack`
- `/?account=lincolntrack`

For SMARTCoach Pro accounts, the SMART Trak custom link should point to the dashboard:

- `/dashboard.html?account=lincolntrack&embed=1`

Only one SMART Trak custom link is needed because the dashboard contains the Plan Builder button. The stopwatch link is mainly for mobile practice/meet timing.

For new customers, save these account values through `/onboarding.html` -> **Save Registry Update**. SMART Trak uses the saved registry record at runtime before falling back to account-specific Vercel variables.

Account-specific Vercel variables are still supported for migration or fallback. The fallback names are built by converting the account key to uppercase:

- `SMARTCOACH_PRODUCT_PLAN_LINCOLNTRACK`
- `GHL_PRIVATE_INTEGRATION_TOKEN_LINCOLNTRACK`
- `GHL_LOCATION_ID_LINCOLNTRACK`

Essential fallback accounts only need the plan variable:

- `SMARTCOACH_PRODUCT_PLAN_LINCOLNTRACK=essential`

Optional subscription tracking fallback variables:

- `SMARTCOACH_SUBSCRIPTION_STATUS_LINCOLNTRACK=active`
- `SMARTCOACH_BILLING_CADENCE_LINCOLNTRACK=monthly`
- `SMARTCOACH_SUBSCRIPTION_AMOUNT_LINCOLNTRACK=29.99`
- `SMARTCOACH_RENEWAL_DATE_LINCOLNTRACK=2026-06-21`
- `SMARTCOACH_STRIPE_CUSTOMER_ID_LINCOLNTRACK=cus_...`
- `SMARTCOACH_STRIPE_SUBSCRIPTION_ID_LINCOLNTRACK=sub_...`
- `SMARTCOACH_SUBSCRIPTION_NOTES_LINCOLNTRACK=optional internal notes`

These fields are for internal subscription tracking. In the current launch path, store them in the registry through `/onboarding.html` or the GHL Subscription Payload instead of adding per-customer Vercel variables. Only the safe summary fields are returned through account status. Athlete limits remain controlled in GHL.

SMART Trak Pro access is allowed when subscription status is blank, `active`, or `trialing`. Setting the status to `past_due`, `paused`, `canceled`, `incomplete`, `incomplete_expired`, or `unpaid` blocks Pro SMART Trak API access for that account. Blank status is currently allowed so existing customer accounts are not accidentally locked out during migration.

Account status separates setup readiness from access readiness. A customer can be fully configured while still showing `accessReady: false` when the subscription status is blocking Pro access. The same response includes `subscriptionBlockedReason` so support can see the plain-language reason immediately.

Account status also separates account access from device unlock. `accessReady: true` means the account setup and subscription allow SMART Trak. `deviceAccessReady: true` means the current browser or phone also has a valid coach session or accepted coach access code.

Automation, manual registry-save, and account registry lookup responses return the same readiness fields, so Stripe/GHL updates and internal support checks can confirm setup/access state without calling account status separately.

Coach-facing pages use `accessReady` during account checks, so a subscription-blocked Pro account stops with a clear access-blocked message instead of continuing into dashboard, roster, calendar, plan, history, records, or simulator data calls.

Pro fallback accounts need all three:

- `SMARTCOACH_PRODUCT_PLAN_LINCOLNTRACK=pro`
- `GHL_PRIVATE_INTEGRATION_TOKEN_LINCOLNTRACK=...`
- `GHL_LOCATION_ID_LINCOLNTRACK=...`

Coach seat fallback variables for Pro accounts:

- `SMARTCOACH_COACH_SEATS_LINCOLNTRACK=1`
- `SMARTCOACH_COACH_ACCESS_CODES_LINCOLNTRACK=coach_code_1`
- `SMARTCOACH_REQUIRE_COACH_ACCESS_LINCOLNTRACK=true`

Use `SMARTCOACH_COACH_SEATS_LINCOLNTRACK=3` and three comma-separated codes when the customer has the assistant coach add-on:

- `SMARTCOACH_COACH_ACCESS_CODES_LINCOLNTRACK=coach_code_1,coach_code_2,coach_code_3`

Each coach should receive one coach access code. Athlete limits are intentionally not enforced here; those stay controlled by GHL.

Automation does not silently create coach access codes for a new Pro account. Generate codes in `/onboarding.html` or save them through the manual registry setup flow, then give one code to each coach. Do not put coach codes in the recurring GHL subscription payload. A Pro account with coach access required and no saved coach code stays setup-incomplete.

Legacy access-code support:

- `SMARTCOACH_ACCESS_CODE_LINCOLNTRACK=...`

Existing accounts that only use `SMARTCOACH_ACCESS_CODE_*` still work. New registry accounts should use coach seats and coach access codes saved through `/onboarding.html`.

Recommended production security:

- `SMARTCOACH_REQUIRE_COACH_ACCESS=true`

Use the global setting after all active Pro accounts have coach access codes, or use the account-specific `SMARTCOACH_REQUIRE_COACH_ACCESS_ACCOUNTKEY=true` during migration. When required access is enabled, SMART Trak blocks a Pro account that has no coach access code configured instead of leaving the dashboard open.

Use the setup helper endpoint to generate the exact variables for a new account:

- `/api/smart-trak/account-setup?account=lincolntrack&plan=essential`
- `/api/smart-trak/account-setup?account=lincolntrack&plan=pro`
- `/api/smart-trak/account-setup?account=lincolntrack&plan=pro&coachSeats=3`

The helper does not expose secrets. It only returns the variable names that need to be added in Vercel.

The same setup helper is available as a simple internal page:

- `/onboarding.html`

The setup helper shows each production setup field as a separate Name and Value pair, plus the one SMART Trak link that should be added to the customer sub-account as a custom link or iframe. It also includes account-key and coach-code generators, copy-ready Stripe metadata, automation endpoint URLs, recommended Stripe webhook events, subscription-only automation payloads, an internal system readiness check, plus an internal account lookup panel that can verify a saved registry record with the automation secret and load the customer subscription fields back into the setup form.

Use **Test Setup First** before saving a customer account. It validates the account payload, subscription status, coach seats, coach codes, and generated setup fields without writing to the durable registry.

Use **Save Registry Update** when a customer subscription or SMART Trak connection needs to be manually corrected before or after Stripe/GHL automation runs. Blank connection fields preserve the saved location ID, private integration token, coach access codes, and logo URL.

Use **Check System** before launch. It reports one overall launch readiness result, launch blockers, and a plain-language checklist for:

- automation secret
- internal setup code
- durable account registry
- Stripe webhook signing secret
- dedicated coach session secret
- coach access enforcement
- parent email rollout gate

Use **Copy System Status** after Check System to save the launch-readiness result, blockers, production warnings, and setup/security checklist in the support notes before activating customers.

Use **Check Customer Access** in the **Live Smoke Test** section after saving a customer account. It calls the live account status endpoint for that account key and shows whether setup, subscription access, registry storage, and coach access-code requirements are ready before opening every coach page manually. A warning state means the account is ready but the current browser or phone still needs a coach access code. Use **Test Access Rules** to run no-save checks that active/trialing allow access while past due, unpaid, and canceled block access. The live smoke-test summary should say complete before a new coach account is turned on, and **Copy Smoke Status** can capture the current pass/missing checklist, launch sign-off, activation-record copy status, final activation-record copy status, coach invite, post-launch follow-up, and next action for support notes.

The live smoke-test checklist and launch sign-off fields are saved in the browser per account key, so a refresh does not clear setup progress for the customer being validated. Use **Stamp Now** to add the validation time before copying the smoke status. Use **Reset Checklist** only when restarting that account's smoke test.

If the setup form and account lookup show different account keys, `/onboarding.html` warns and blocks saving, dry runs, and live access checks until they match. This prevents validating or saving the wrong coach account during activation.

After generating or saving a customer account, use the **Activation Runbook** panel for the exact support order: Check System, Copy System Status, Test Setup First, Save Registry Update, add the single SMART Trak custom link, verify coach access, complete the live smoke test, stamp and save the activation handoff, send the coach invite, then confirm first login, first sync, and phone bulk archive. Check System should show no launch blockers for the automation secret, setup code, durable registry, Stripe webhook, coach session secret, coach access enforcement, and parent email rollout gate.

The Activation Runbook includes a handoff status strip that follows the same account key as the live smoke checklist. It shows whether smoke testing is complete, launch sign-off is stamped, the activation record has been copied, the coach invite has been copied, and post-launch phone follow-up is complete.

Use **Copy Activation Record** after the customer passes the live smoke validation checks and launch sign-off is stamped. It creates a plain support-note summary with the account key, plan, coach seats, subscription, Stripe IDs, registry/setup/access state, recent automation update, live smoke-test progress, launch sign-off, activation-record copied time, final activation-record copied time, coach-invite reminder or copied time, post-launch follow-up progress, next action, and customer link. The copied time is saved locally per account only after the copy succeeds, and the activation-record checklist item is marked complete automatically, so next-action guidance can confirm the internal activation note was saved before the coach invite is sent. If launch validation is still in progress, use **Copy Smoke Status** instead. The next action will continue pointing to the live smoke test, launch sign-off, activation record, coach invite, post-launch phone follow-up, and the final activation record after follow-up is complete. Once the coach invite is copied and first login, first sync, and phone bulk archive are checked, the copied note is titled `SMARTCoach Final Activation Record`; after that final note is copied, the handoff status moves to normal support monitoring.

Use **Copy Coach Invite** from the Customer Links section after launch validation is complete. It will not copy until the live smoke-test checklist is complete, the launch sign-off is stamped, and the activation record has been copied. It creates a short coach-facing note with the SMARTCoach link, account key, and coach access-code instructions for the purchased plan, including where to enter the account key and coach code on the phone app. Give each coach only their own assigned code rather than sharing the full saved code list in a copied invite. Essential invites also tell the coach where to enter the account key for stopwatch-only access. The copied time and post-launch follow-up checks are saved locally per account, update the follow-up summary, and appear in later activation records.

Initial rollout should keep parent email tools off globally. Do not set `SMARTCOACH_PARENT_EMAIL_FEATURE_ENABLED=true` until parent communication is ready to release.

Regression tests verify that coach-specific parent email settings stay hidden while the global parent email release gate is off.

The setup checklist also shows ready/missing/warning badges based on the current customer account signals, so support can see whether registry, subscription, coach codes, and account configuration are ready.

Automation, Stripe webhook, and protected account lookup responses hide private integration tokens and coach access-code values. The internal lookup can still verify that secrets are saved by showing `Saved` and saved counts instead of exposing the actual values. If a setup row shows `Saved value hidden`, do not paste that text or `__hidden__` into Vercel; only replace the value when intentionally rotating the token or coach codes.

Optional internal setup protection:

- `SMARTCOACH_ADMIN_SETUP_CODE`

When this is set, `/onboarding.html` and `/api/smart-trak/account-setup` require the setup code before generating customer setup fields. This keeps customer setup links out of casual view while still allowing the helper to be used internally.

The system readiness check treats this setup code as a launch requirement. Production should not show `Ready for initial rollout` unless `SMARTCOACH_ADMIN_SETUP_CODE` is set.

Regression tests verify setup fields cannot be generated without the correct setup code when `SMARTCOACH_ADMIN_SETUP_CODE` is configured.

Coach session signing:

- `SMARTCOACH_SESSION_SECRET`
- `SMARTCOACH_SESSION_TTL_SECONDS` optional, defaults to `43200` seconds / 12 hours

When this is set, SMART Trak can exchange a valid coach access code for a short-lived signed session token. The browser can then use the temporary session instead of sending the raw coach access code on every request. If this is not set, the server falls back to `SMARTCOACH_AUTOMATION_SECRET` or `SMARTCOACH_ADMIN_SETUP_CODE` for signing if either exists. Production should use a dedicated `SMARTCOACH_SESSION_SECRET` so coach sessions do not share automation/setup secrets.

Session length can be adjusted with `SMARTCOACH_SESSION_TTL_SECONDS`. Values are clamped between 15 minutes and 7 days. The recommended production value is the default 12 hours, which usually covers a practice day without leaving long-lived access sitting in the browser.

Regression tests verify signed coach sessions cannot be reused for another account and expire after their allowed session window.

Coach access-code attempts are throttled per account and IP address. Repeated wrong codes are paused temporarily and return `429` with `Retry-After`, which helps protect customer dashboards from brute-force access-code guessing.

Regression tests verify the coach access-code pause after repeated wrong attempts.

SMART Trak API responses are sent with no-store security headers so account status, coach session responses, roster data, and training data are not cached by browsers or shared proxies.

Coach-facing SMART Trak HTML pages are also served with no-store, noindex, no-referrer, and nosniff headers through `vercel.json`. This keeps embedded dashboard pages out of search indexes and reduces stale-page/cached-session surprises for coaches.

Regression tests verify both API no-store headers and Vercel HTML page noindex/no-cache headers.

Legacy `/api/ghl/*` SMART Trak routes also attach the durable account registry before checking Pro access. That keeps direct older route calls aligned with the automated subscription/account registry, instead of falling back only to environment variables.

## Automation Intake

Recommended launch flow: let GHL handle Stripe payments/subscriptions through its native Stripe integration, then have a GHL workflow call SMART Trak's protected account automation endpoint when a customer buys, renews, fails payment, or cancels. SMART Trak should not be the payment processor; it should only receive the subscription/access result and update the customer account registry.

Set this secret before connecting GHL automations:

- `SMARTCOACH_AUTOMATION_SECRET`

Then a GHL workflow or a trusted internal workflow can call:

- `POST /api/smart-trak/account-automation`

Send the secret as either:

- `Authorization: Bearer your_secret`
- `X-SMARTCoach-Automation-Secret: your_secret`

Example payload:

```json
{
  "accountKey": "lincolntrack",
  "productPlan": "pro",
  "coachSeats": 3,
  "subscriptionStatus": "active",
  "billingCadence": "monthly",
  "subscriptionAmount": "39.99",
  "renewalDate": "2026-06-21",
  "stripeCustomerId": "cus_...",
  "stripeSubscriptionId": "sub_..."
}
```

For the recommended GHL workflow action, use:

- Method: `POST`
- URL: `/api/smart-trak/account-automation`
- Header: `X-SMARTCoach-Automation-Secret: your_secret`
- Body type: raw JSON

Send the customer's SMARTCoach account key plus subscription fields from the GHL/Stripe payment record. If GHL does not have a Stripe field available, leave it blank; the registry merge will preserve already saved values. Do not include SMART Trak private integration tokens or coach access codes in the copied GHL workflow payload; those stay in the saved registry setup flow.

Subscription status accepts the internal values `active`, `trialing`, `past_due`, `paused`, `canceled`, `incomplete`, `incomplete_expired`, and `unpaid`. Common workflow wording such as `paid`, `payment failed`, `failed payment`, `cancelled`, `pending`, and `not paid` is normalized automatically. Unknown status text is treated as `incomplete` so access is not accidentally left open.

The endpoint validates the automation secret, normalizes the account data, saves it to the durable registry when registry variables are configured, and returns the exact setup fields needed for the account. The recommended GHL subscription workflow should send only subscription/billing fields for the same `accountKey`; SMART Trak merges those updates into the existing registry record so the customer's location ID, token, coach seats, and coach access codes are preserved.

Missing or wrong automation secrets are rejected before the durable account registry is read or written.

Regression tests verify partial subscription updates preserve saved SMART Trak connection fields and coach access codes.

Stripe-style payloads are supported when the account key is placed in metadata. This is mainly useful when passing Stripe subscription data through GHL workflows or for the optional direct Stripe webhook fallback. Preferred keys are `accountKey` or `smartcoach_account_key`; both can be added if the Stripe setup screen allows multiple metadata fields.

```json
{
  "data": {
    "object": {
      "object": "subscription",
      "id": "sub_...",
      "status": "past_due",
      "customer": "cus_...",
      "current_period_end": 1787356800,
      "metadata": {
        "accountKey": "lincolntrack",
        "smartcoach_account_key": "lincolntrack"
      },
      "items": {
        "data": [
          {
            "price": {
              "unit_amount": 3999,
              "recurring": {
                "interval": "month"
              }
            }
          }
        ]
      }
    }
  }
}
```

Direct Stripe webhooks are optional. Use the signed Stripe route only if SMART Trak needs to receive Stripe events directly instead of receiving subscription status from a GHL workflow:

- `POST /api/smart-trak/account-stripe-webhook`

Set this Vercel variable first:

- `SMARTCOACH_STRIPE_WEBHOOK_SECRET`

Use the signing secret from the Stripe webhook endpoint settings. The route verifies `Stripe-Signature` before updating the account registry. Put the SMARTCoach account key in Stripe metadata as `accountKey` so the webhook knows which customer account to update.

Invalid or missing Stripe signatures are rejected before the durable account registry is read or written.

Recommended Stripe events for the optional direct webhook endpoint:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

Stripe webhooks only return success after the account registry update is saved. If the registry is missing or unavailable, the webhook returns an error so Stripe can retry the subscription update instead of marking it handled.

Repeated Stripe events with the same Stripe event ID are treated as already handled. The webhook returns success for the retry and does not rewrite the existing registry record.

## Durable Account Registry

For automated onboarding/subscription updates, add a small persistent registry. The current implementation supports a Vercel KV / Upstash Redis REST store.

Plain meaning: this registry is where SMART Trak saves each customer account record after purchase. It stores the account key, subscription status, coach seats, coach access codes, SMART Trak connection, and optional logo URL. With the registry connected, adding a new customer does not require new Vercel variables or a redeploy.

Add these Vercel environment variables:

- `SMARTCOACH_REGISTRY_REST_URL`
- `SMARTCOACH_REGISTRY_REST_TOKEN`
- `SMARTCOACH_REGISTRY_PREFIX` optional, defaults to `smartcoach:account:`

Vercel KV/Upstash aliases are also supported:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

If Vercel creates `KV_REST_API_URL` and `KV_REST_API_TOKEN` automatically, those are enough. You can either leave them as-is or copy the same values into `SMARTCOACH_REGISTRY_REST_URL` and `SMARTCOACH_REGISTRY_REST_TOKEN` for clarity.

Regression tests cover both Vercel KV names and Upstash Redis names so customer account storage keeps working even when Vercel supplies the storage variables automatically.

The `/onboarding.html` page also shows these registry setup field names in **Registry Setup Values** so internal support can copy the names while setting up Vercel.

The `/onboarding.html` page also includes **Launch Security Values** with copy-ready field names and safe value notes for `SMARTCOACH_ADMIN_SETUP_CODE`, `SMARTCOACH_AUTOMATION_SECRET`, `SMARTCOACH_STRIPE_WEBHOOK_SECRET`, `SMARTCOACH_SESSION_SECRET`, and `SMARTCOACH_REQUIRE_COACH_ACCESS`. The parent-email rollout row is intentionally a hold note only: do not add `SMARTCOACH_PARENT_EMAIL_FEATURE_ENABLED` for initial rollout. Use **Generate Launch Secrets** there to create separate setup, automation, and session secret values, then **Copy Security Values** to paste the generated values into Vercel before running **Check System** for launch readiness. After the values are saved in Vercel, use **Clear Generated Secrets** so those one-time values are no longer visible on the setup screen.

When the registry is configured, `POST /api/smart-trak/account-automation` saves the normalized account record automatically. SMART Trak uses that saved record as the runtime account source before falling back to account-specific Vercel environment variables. Trusted setup can save plan, coach seats, coach access codes, location ID, token, and logo URL without adding a new Vercel variable for each customer update. The recurring GHL Subscription Payload should remain limited to subscription/access fields.

Each saved registry record also stores a small `lastAutomationEvent` stamp and a short `automationEventHistory` list with recent update source, event type, optional Stripe event/object IDs, and received time. This is shown in the internal account lookup to help troubleshoot whether recent changes came from manual setup, GHL automation, or a Stripe webhook.

You can verify a saved account with:

- `GET /api/smart-trak/account-registry?account=lincolntrack`

This endpoint also requires the automation secret. Account status reports whether the registry is configured and whether a record exists for the requested account.

## Deploy Order

1. Import this GitHub repo into Vercel.
2. Open `/onboarding.html`, use **Launch Security Values** -> **Generate Launch Secrets**, add the security values plus registry values in Vercel Production, then use **Clear Generated Secrets** after the Vercel values are saved.
3. Point `app.smartcoach-pro.com` to the Vercel project.
4. Open `/onboarding.html` and run **Check System** with the automation secret.
5. Fix any launch blockers before selling or activating a customer account.
6. Create a live internal Pro test account in GHL/SMART Trak.
7. Use **Test Setup First** for that account.
8. Save the account to the durable registry.
9. Add the SMART Trak custom link to that test subaccount.
10. Follow the `/onboarding.html` **Activation Runbook** for that test account.
11. Test Share -> Sync to SMART Trak with one athlete who has saved times.
12. Log one standalone race result and confirm it reaches Dashboard, Meet History, and athlete bests.
13. Load My Season Best in XC Simulator, load a saved field, and score one simulated meet.
14. Trigger the GHL Subscription Payload workflow once and confirm the registry lookup shows the automation event. Confirm the copied GHL payload did not include private tokens or coach access codes. If using the optional direct Stripe webhook fallback, also send one Stripe test-mode checkout/subscription event.
15. Use **Copy Activation Record** and save the support note for the test account.
16. Use **Copy Coach Invite** only after validation is complete and the activation record has been saved.
17. After the invite is sent, complete post-launch phone follow-up: first coach login, first sync, and phone bulk archive.
18. Use **Copy Activation Record** again to save the final activation record, then move the account to normal support monitoring.

## Launch Validation Checklist

Before calling automation/security complete for rollout, verify this with a real test Pro account:

- **System readiness:** `/onboarding.html` -> **Check System** reports `Ready for initial rollout`.
- **Launch security values:** Vercel Production has separate setup, automation, and session secrets; coach access enforcement is true; parent email feature flag is not set.
- **Live smoke test:** `/onboarding.html` -> **Live Smoke Test** -> **Check Customer Access** reports the test customer account is ready, then use the generated coach page links to complete the required checklist after deploy. Use **Copy Smoke Status** if the checklist needs to be saved before every item is complete. Save the activation record after launch sign-off, then save the final activation record after the coach invite is copied and post-launch follow-up is complete.
- **Registry write:** **Save Registry Update** returns saved and account lookup shows the account as saved.
- **Subscription allow/block:** `/onboarding.html` -> **Live Smoke Test** -> **Test Access Rules** passes, proving `active` and `trialing` allow access while `past_due`, `unpaid`, and `canceled` block access without saving those test statuses.
- **Coach access:** a valid coach code creates a signed session; wrong codes are rejected and rate-limited after repeated attempts.
- **GHL subscription automation:** the GHL Subscription Payload updates the durable registry and appears in recent automation history, while private tokens and coach access codes remain in the manual registry setup flow.
- **Optional Stripe webhook:** if enabled, a Stripe test event updates the durable registry; resending the same Stripe event returns success without rewriting the account record.
- **No secret exposure:** automation responses and account lookup show saved/hidden status for private tokens and coach access codes instead of exposing values. Redacted setup rows should show `Saved value hidden` and should not copy `__hidden__` as a pasteable value.
- **Customer link:** the GHL custom link opens the correct account dashboard with the customer account key.
- **Coach pages:** Dashboard, Athletes, Training Calendar, Planning Setup, Plan Entry, Plan Builder, Meet History, Records, and XC Simulator load for the test account without setup-needed errors.
- **Stopwatch sync:** one completed stopwatch workout syncs into SMART Trak for a test athlete.
- **Standalone race result:** one manually logged race result updates Dashboard, Meet History, and the athlete bests.
- **XC Simulator:** My Season Best loads the coach's team, a saved field can be loaded, and scoring produces complete team results.
- **Post-launch phone follow-up:** after the coach invite is sent, confirm first coach login, first sync, and phone bulk archive before copying the final activation record.
- **Support handoff:** **Copy Activation Record** includes the account key, subscription, Stripe IDs when available, setup/access state, smoke progress, launch sign-off, coach-invite reminder or copied time, post-launch follow-up, next action, customer link, status link, and coach page validation links.
- **Parent email:** parent email tools remain hidden for initial rollout.

Before pushing security/account changes, run:

- `npm test`

GitHub Actions also runs this same regression command on pushes and pull requests, so GitHub can catch account/security regressions before or alongside Vercel deployment.
