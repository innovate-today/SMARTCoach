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

SMART Trak Pro access is allowed when subscription status is blank, `active`, or `trialing`. Setting the status to `past_due`, `paused`, `canceled`, or `incomplete` blocks Pro SMART Trak API access for that account. Blank status is currently allowed so existing customer accounts are not accidentally locked out during migration.

Pro accounts need all three:

- `SMARTCOACH_PRODUCT_PLAN_LINCOLNTRACK=pro`
- `GHL_PRIVATE_INTEGRATION_TOKEN_LINCOLNTRACK=...`
- `GHL_LOCATION_ID_LINCOLNTRACK=...`

Coach seat variables for Pro accounts:

- `SMARTCOACH_COACH_SEATS_LINCOLNTRACK=1`
- `SMARTCOACH_COACH_ACCESS_CODES_LINCOLNTRACK=coach_code_1`

Use `SMARTCOACH_COACH_SEATS_LINCOLNTRACK=3` and three comma-separated codes when the customer has the assistant coach add-on:

- `SMARTCOACH_COACH_ACCESS_CODES_LINCOLNTRACK=coach_code_1,coach_code_2,coach_code_3`

Each coach should receive one coach access code. Athlete limits are intentionally not enforced here; those stay controlled by GHL.

Legacy access-code support:

- `SMARTCOACH_ACCESS_CODE_LINCOLNTRACK=...`

Existing accounts that only use `SMARTCOACH_ACCESS_CODE_*` still work. New accounts should use `SMARTCOACH_COACH_SEATS_*` and `SMARTCOACH_COACH_ACCESS_CODES_*`.

Use the setup helper endpoint to generate the exact variables for a new account:

- `/api/smart-trak/account-setup?account=lincolntrack&plan=essential`
- `/api/smart-trak/account-setup?account=lincolntrack&plan=pro`
- `/api/smart-trak/account-setup?account=lincolntrack&plan=pro&coachSeats=3`

The helper does not expose secrets. It only returns the variable names that need to be added in Vercel.

The same setup helper is available as a simple internal page:

- `/onboarding.html`

The setup helper shows each production setup field as a separate Name and Value pair, plus the one SMART Trak link that should be added to the customer sub-account as a custom link or iframe. It also includes account-key and coach-code generators, copy-ready Stripe metadata and automation payloads, an internal system readiness check, plus an internal account lookup panel that can verify a saved registry record with the automation secret and load the customer subscription fields back into the setup form. Use **Save Registry Update** when a customer subscription or SMART Trak connection needs to be manually corrected before or after Stripe/GHL automation runs. Blank connection fields preserve the saved location ID, private integration token, coach access codes, and logo URL.

Optional internal setup protection:

- `SMARTCOACH_ADMIN_SETUP_CODE`

When this is set, `/onboarding.html` and `/api/smart-trak/account-setup` require the setup code before generating customer setup fields. This keeps customer setup links out of casual view while still allowing the helper to be used internally.

Coach session signing:

- `SMARTCOACH_SESSION_SECRET`

When this is set, SMART Trak can exchange a valid coach access code for a short-lived signed session token. The browser can then use the temporary session instead of sending the raw coach access code on every request. If this is not set, the server falls back to `SMARTCOACH_AUTOMATION_SECRET` or `SMARTCOACH_ADMIN_SETUP_CODE` for signing if either exists.

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

Stripe-style payloads are supported when the account key is placed in metadata:

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
        "accountKey": "lincolntrack"
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

Each saved registry record also stores a small `lastAutomationEvent` stamp with the last update source, event type, optional Stripe event/object IDs, and received time. This is shown in the internal account lookup to help troubleshoot whether the latest change came from manual setup, GHL automation, or a Stripe webhook.

You can verify a saved account with:

- `GET /api/smart-trak/account-registry?account=lincolntrack`

This endpoint also requires the automation secret. Account status reports whether the registry is configured and whether a record exists for the requested account.

## Deploy Order

1. Import this GitHub repo into Vercel.
2. Add the default account environment variables above.
3. Point `app.smartcoach-pro.com` to the Vercel project.
4. Test Share -> Sync to SMART Trak with one athlete who has saved times.
