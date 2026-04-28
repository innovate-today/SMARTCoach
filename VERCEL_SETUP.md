# SMARTCoach Vercel + GHL Setup

## Required Environment Variables

Set these in Vercel Project Settings -> Environment Variables:

- `GHL_PRIVATE_INTEGRATION_TOKEN`
- `GHL_LOCATION_ID`

The browser app calls `/api/ghl/sync-session`. That serverless function calls HighLevel with the private token, so the token is no longer exposed in `index.html`.

## Deploy Order

1. Import this GitHub repo into Vercel.
2. Add the two environment variables above.
3. Point `app.smartcoach-pro.com` to the Vercel project.
4. Test Share -> SMART Trak Sync with one athlete who has saved times.
