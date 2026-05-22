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

The setup helper shows each production setup field as a separate Name and Value pair, plus the one SMART Trak link that should be added to the customer sub-account as a custom link or iframe.

Optional internal setup protection:

- `SMARTCOACH_ADMIN_SETUP_CODE`

When this is set, `/onboarding.html` and `/api/smart-trak/account-setup` require the setup code before generating customer setup fields. This keeps customer setup links out of casual view while still allowing the helper to be used internally.

## Deploy Order

1. Import this GitHub repo into Vercel.
2. Add the default account environment variables above.
3. Point `app.smartcoach-pro.com` to the Vercel project.
4. Test Share -> Sync to SMART Trak with one athlete who has saved times.
