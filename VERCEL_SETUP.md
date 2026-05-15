# SMARTCoach Vercel + GHL Setup

## Required Environment Variables

Set these in Vercel Project Settings -> Environment Variables:

- `GHL_PRIVATE_INTEGRATION_TOKEN`
- `GHL_LOCATION_ID`
- `SMARTCOACH_PRODUCT_PLAN`

The browser app calls `/api/ghl/sync-session`. That serverless function calls HighLevel with the private token, so the token is no longer exposed in `index.html`.

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

Pro accounts need all three:

- `SMARTCOACH_PRODUCT_PLAN_LINCOLNTRACK=pro`
- `GHL_PRIVATE_INTEGRATION_TOKEN_LINCOLNTRACK=...`
- `GHL_LOCATION_ID_LINCOLNTRACK=...`

Recommended before customer launch:

- `SMARTCOACH_ACCESS_CODE_LINCOLNTRACK=...`

The setup helper generates a suggested access code value. When this access code is set, SMARTCoach Pro API data for that account requires the browser session to provide the code. This is an early protection layer, not the final subscription/auth system.

Use the setup helper endpoint to generate the exact variables for a new account:

- `/api/smart-trak/account-setup?account=lincolntrack&plan=essential`
- `/api/smart-trak/account-setup?account=lincolntrack&plan=pro`

The helper does not expose secrets. It only returns the variable names that need to be added in Vercel.

The same setup helper is available as a simple internal page:

- `/onboarding.html`

The setup helper shows the Vercel variables as separate Name and Value fields, plus the one SMART Trak link that should be added to the customer sub-account as a custom link or iframe.

Optional internal setup protection:

- `SMARTCOACH_ADMIN_SETUP_CODE`

When this is set, `/onboarding.html` and `/api/smart-trak/account-setup` require the setup code before generating customer setup fields. This keeps customer setup links out of casual view while still allowing the helper to be used internally.

## Deploy Order

1. Import this GitHub repo into Vercel.
2. Add the default account environment variables above.
3. Point `app.smartcoach-pro.com` to the Vercel project.
4. Test Share -> SMARTCoach Pro Sync with one athlete who has saved times.
