# SMARTCoach + SMART Trak Vercel Setup

## Required Environment Variables

Set these in Vercel Project Settings -> Environment Variables:

- `GHL_PRIVATE_INTEGRATION_TOKEN`
- `GHL_LOCATION_ID`
- `SMARTCOACH_PRODUCT_PLAN`

The browser app calls serverless SMART Trak endpoints. Those functions use the private token, so the token is not exposed in `index.html`.

Use `SMARTCOACH_PRODUCT_PLAN=pro` for the default SMARTCoach Pro account.

## Customer Account Setup

Every customer account uses an account key in the URL, for example:

- `/dashboard.html?account=lincolntrack`
- `/?account=lincolntrack`

For SMARTCoach Pro accounts, the SMART Trak custom link should point to the dashboard:

- `/dashboard.html?account=lincolntrack&embed=1`

Only one SMART Trak custom link is needed because the dashboard contains the Plan Builder button. The stopwatch link is mainly for mobile practice/meet timing.

The app reads account-specific Vercel variables by converting the account key to uppercase:

- `SMARTCOACH_PRODUCT_PLAN_LINCOLNTRACK`
- `GHL_PRIVATE_INTEGRATION_TOKEN_LINCOLNTRACK`
- `GHL_LOCATION_ID_LINCOLNTRACK`

Essential accounts only need the plan variable:

- `SMARTCOACH_PRODUCT_PLAN_LINCOLNTRACK=essential`

Recommended subscription tracking variables:

- `SMARTCOACH_SUBSCRIPTION_STATUS_LINCOLNTRACK=active`
- `SMARTCOACH_BILLING_CADENCE_LINCOLNTRACK=monthly`
- `SMARTCOACH_SUBSCRIPTION_AMOUNT_LINCOLNTRACK=29.99`
- `SMARTCOACH_RENEWAL_DATE_LINCOLNTRACK=2026-06-21`
- `SMARTCOACH_STRIPE_CUSTOMER_ID_LINCOLNTRACK=cus_...`
- `SMARTCOACH_STRIPE_SUBSCRIPTION_ID_LINCOLNTRACK=sub_...`
- `SMARTCOACH_SUBSCRIPTION_NOTES_LINCOLNTRACK=optional internal notes`

These fields are for internal subscription tracking. Only the safe summary fields are returned through account status. Athlete limits remain controlled in GHL.

SMART Trak Pro access is allowed when subscription status is blank, `active`, or `trialing`. Setting the status to `past_due`, `paused`, `canceled`, `incomplete`, `incomplete_expired`, or `unpaid` blocks Pro SMART Trak API access for that account. Blank status is currently allowed so existing customer accounts are not accidentally locked out during migration.

Account status separates setup readiness from access readiness. A customer can be fully configured while still showing `accessReady: false` when the subscription status is blocking Pro access. The same response includes `subscriptionBlockedReason` so support can see the plain-language reason immediately.

Automation, manual registry-save, and account registry lookup responses return the same readiness fields, so Stripe/GHL updates and internal support checks can confirm setup/access state without calling account status separately.

Coach-facing pages use `accessReady` during account checks, so a subscription-blocked Pro account stops with a clear access-blocked message instead of continuing into dashboard, roster, calendar, plan, history, records, or simulator data calls.

Pro accounts need all three:

- `SMARTCOACH_PRODUCT_PLAN_LINCOLNTRACK=pro`
- `GHL_PRIVATE_INTEGRATION_TOKEN_LINCOLNTRACK=...`
- `GHL_LOCATION_ID_LINCOLNTRACK=...`

Coach seat variables for Pro accounts:

- `SMARTCOACH_COACH_SEATS_LINCOLNTRACK=1`
- `SMARTCOACH_COACH_ACCESS_CODES_LINCOLNTRACK=coach_code_1`
- `SMARTCOACH_REQUIRE_COACH_ACCESS_LINCOLNTRACK=true`

Use `SMARTCOACH_COACH_SEATS_LINCOLNTRACK=3` and three comma-separated codes when the customer has the assistant coach add-on:

- `SMARTCOACH_COACH_ACCESS_CODES_LINCOLNTRACK=coach_code_1,coach_code_2,coach_code_3`

Each coach should receive one coach access code. Athlete limits are intentionally not enforced here; those stay controlled by GHL.

Legacy access-code support:

- `SMARTCOACH_ACCESS_CODE_LINCOLNTRACK=...`

Existing accounts that only use `SMARTCOACH_ACCESS_CODE_*` still work. New accounts should use `SMARTCOACH_COACH_SEATS_*` and `SMARTCOACH_COACH_ACCESS_CODES_*`.

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

The setup helper shows each production setup field as a separate Name and Value pair, plus the one SMART Trak link that should be added to the customer sub-account as a custom link or iframe. It also includes account-key and coach-code generators, copy-ready Stripe metadata, automation endpoint URLs, recommended Stripe webhook events, automation payloads, an internal system readiness check, plus an internal account lookup panel that can verify a saved registry record with the automation secret and load the customer subscription fields back into the setup form.

Use **Test Setup First** before saving a customer account. It validates the account payload, subscription status, coach seats, coach codes, and generated setup fields without writing to the durable registry.

Use **Save Registry Update** when a customer subscription or SMART Trak connection needs to be manually corrected before or after Stripe/GHL automation runs. Blank connection fields preserve the saved location ID, private integration token, coach access codes, and logo URL.

Use **Check System** before launch. It reports one overall launch readiness result, launch blockers, and a plain-language checklist for:

- automation secret
- durable account registry
- Stripe webhook signing secret
- dedicated coach session secret
- coach access enforcement
- parent email rollout gate

Initial rollout should keep parent email tools off globally. Do not set `SMARTCOACH_PARENT_EMAIL_FEATURE_ENABLED=true` until parent communication is ready to release.

The setup checklist also shows ready/missing/warning badges based on the current customer account signals, so support can see whether registry, subscription, coach codes, and account configuration are ready.

Automation and Stripe webhook responses hide private integration tokens and coach access-code values. The internal protected account lookup can still verify that secrets are saved by showing `Saved` and saved counts instead of exposing the actual values.

Optional internal setup protection:

- `SMARTCOACH_ADMIN_SETUP_CODE`

When this is set, `/onboarding.html` and `/api/smart-trak/account-setup` require the setup code before generating customer setup fields. This keeps customer setup links out of casual view while still allowing the helper to be used internally.

Coach session signing:

- `SMARTCOACH_SESSION_SECRET`
- `SMARTCOACH_SESSION_TTL_SECONDS` optional, defaults to `43200` seconds / 12 hours

When this is set, SMART Trak can exchange a valid coach access code for a short-lived signed session token. The browser can then use the temporary session instead of sending the raw coach access code on every request. If this is not set, the server falls back to `SMARTCOACH_AUTOMATION_SECRET` or `SMARTCOACH_ADMIN_SETUP_CODE` for signing if either exists. Production should use a dedicated `SMARTCOACH_SESSION_SECRET` so coach sessions do not share automation/setup secrets.

Session length can be adjusted with `SMARTCOACH_SESSION_TTL_SECONDS`. Values are clamped between 15 minutes and 7 days. The recommended production value is the default 12 hours, which usually covers a practice day without leaving long-lived access sitting in the browser.

Coach access-code attempts are throttled per account and IP address. Repeated wrong codes are paused temporarily and return `429` with `Retry-After`, which helps protect customer dashboards from brute-force access-code guessing.

SMART Trak API responses are sent with no-store security headers so account status, coach session responses, roster data, and training data are not cached by browsers or shared proxies.

Coach-facing SMART Trak HTML pages are also served with no-store, noindex, no-referrer, and nosniff headers through `vercel.json`. This keeps embedded dashboard pages out of search indexes and reduces stale-page/cached-session surprises for coaches.

Legacy `/api/ghl/*` SMART Trak routes also attach the durable account registry before checking Pro access. That keeps direct older route calls aligned with the automated subscription/account registry, instead of falling back only to environment variables.

## Automation Intake

Set this secret before connecting GHL or Stripe automations:

- `SMARTCOACH_AUTOMATION_SECRET`

Then GHL automation or a trusted internal workflow can call:

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
  "stripeSubscriptionId": "sub_...",
  "locationId": "ghl_location_id"
}
```

The endpoint validates the automation secret, normalizes the account data, saves it to the durable registry when registry variables are configured, and returns the exact setup fields needed for the account. Later automation calls can send only subscription/billing fields for the same `accountKey`; SMART Trak merges those updates into the existing registry record so the customer's location ID, token, coach seats, and coach access codes are preserved.

Stripe-style payloads are supported when the account key is placed in metadata. Preferred keys are `accountKey` or `smartcoach_account_key`; both can be added if the Stripe setup screen allows multiple metadata fields.

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

For direct Stripe webhooks, use the signed Stripe route instead:

- `POST /api/smart-trak/account-stripe-webhook`

Set this Vercel variable first:

- `SMARTCOACH_STRIPE_WEBHOOK_SECRET`

Use the signing secret from the Stripe webhook endpoint settings. The route verifies `Stripe-Signature` before updating the account registry. Put the SMARTCoach account key in Stripe metadata as `accountKey` so the webhook knows which customer account to update.

Recommended Stripe events for the webhook endpoint:

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

Add these Vercel environment variables:

- `SMARTCOACH_REGISTRY_REST_URL`
- `SMARTCOACH_REGISTRY_REST_TOKEN`
- `SMARTCOACH_REGISTRY_PREFIX` optional, defaults to `smartcoach:account:`

Vercel KV/Upstash aliases are also supported:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

When the registry is configured, `POST /api/smart-trak/account-automation` saves the normalized account record automatically. SMART Trak uses that saved record as the runtime account source before falling back to account-specific Vercel environment variables. That means plan, subscription status, coach seats, coach access codes, location ID, token, and logo URL can be updated by automation without adding a new Vercel variable for each customer update.

Each saved registry record also stores a small `lastAutomationEvent` stamp and a short `automationEventHistory` list with recent update source, event type, optional Stripe event/object IDs, and received time. This is shown in the internal account lookup to help troubleshoot whether recent changes came from manual setup, GHL automation, or a Stripe webhook.

You can verify a saved account with:

- `GET /api/smart-trak/account-registry?account=lincolntrack`

This endpoint also requires the automation secret. Account status reports whether the registry is configured and whether a record exists for the requested account.

## Deploy Order

1. Import this GitHub repo into Vercel.
2. Add the default account environment variables above.
3. Point `app.smartcoach-pro.com` to the Vercel project.
4. Open `/onboarding.html` and run **Check System** with the automation secret.
5. Fix any launch blockers before selling or activating a customer account.
6. Create a live internal Pro test account in GHL/SMART Trak.
7. Use **Test Setup First** for that account.
8. Save the account to the durable registry.
9. Add the SMART Trak custom link to that test subaccount.
10. Test Share -> Sync to SMART Trak with one athlete who has saved times.
11. Send at least one Stripe test-mode checkout/subscription event to the signed Stripe webhook and confirm the registry lookup shows the automation event.

## Launch Validation Checklist

Before calling automation/security complete for rollout, verify this with a real test Pro account:

- **System readiness:** `/onboarding.html` -> **Check System** reports `Ready for initial rollout`.
- **Registry write:** **Save Registry Update** returns saved and account lookup shows the account as saved.
- **Subscription allow:** account status shows `accessReady: true` for `active` or `trialing`.
- **Subscription block:** changing status to `past_due`, `unpaid`, or `canceled` blocks SMART Trak with a clear access message.
- **Coach access:** a valid coach code creates a signed session; wrong codes are rejected and rate-limited after repeated attempts.
- **Stripe webhook:** Stripe test event updates the durable registry and appears in recent automation history.
- **Stripe retry:** resending the same Stripe event returns success without rewriting the account record.
- **No secret exposure:** automation responses and account lookup show saved/hidden status for private tokens and coach access codes instead of exposing values.
- **Customer link:** the GHL custom link opens the correct account dashboard with the customer account key.
- **Stopwatch sync:** one completed stopwatch workout syncs into SMART Trak for a test athlete.
- **Parent email rollout:** parent email remains hidden unless `SMARTCOACH_PARENT_EMAIL_FEATURE_ENABLED=true` is intentionally set later.

Before pushing security/account changes, run:

- `node tests/ghl-account.test.js`
- `node tests/automation-api.test.js`
