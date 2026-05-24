# SMARTCoach / SMART Trak Project State

Last updated: 2026-05-19

Use this file as the starting point when resuming SMARTCoach work in a new chat.

Suggested resume prompt:

```text
Continue SMARTCoach from SMARTCOACH_PROJECT_STATE.md.
```

## Product Identity

- SMARTCoach is the mobile stopwatch app.
- SMART Trak is the desktop/CRM app used by coaches inside the GoHighLevel sub-account.
- The customer-facing Pro offer is SMARTCoach Pro: stopwatch plus SMART Trak.
- The Essential offer is SMARTCoach: stopwatch-only subscription.
- Avoid using "GHL" in coach-facing labels. Use SMART Trak or CRM connection only when needed.
- SMART Trak can run inside a GoHighLevel custom sidebar iframe.

## Current Source And Deployment

- Repo: `/Users/marcusmoore/Documents/Codex/2026-04-30/continue-with-smartcoach/smartcoach-repo`
- Production URL: `https://app.smartcoach-pro.com`
- Deployment: Vercel from GitHub `innovate-today/SMARTCoach`
- The user usually deploys by copying git commands into Terminal.
- Codex may have trouble writing to `.git`; give the user commit/push commands when needed.

Typical deploy commands:

```bash
cd /Users/marcusmoore/Documents/Codex/2026-04-30/continue-with-smartcoach/smartcoach-repo
git add <files>
git commit -m "<message>"
git push origin main
```

## Main Pages

- `index.html`: mobile SMARTCoach stopwatch app.
- `dashboard.html`: main SMART Trak dashboard.
- `training-calendar.html`: training calendar, plan days, status management.
- `plan-import.html`: Plan Entry page for upload, paste, or manual workout creation.
- `plan-builder.html`: guided plan builder, current fitness setup, and plan assignments.
- `meet-history.html`: meet schedule and meet-result comparison/history.
- `records.html`: school record board.
- `onboarding.html`: account setup helper.

## Backend Endpoints

Unified route:

- `api/smart-trak/[route].js`

Important endpoint modules:

- `api/ghl/sync-session.js`: stopwatch training sync.
- `api/ghl/meet-result.js`: meet result sync.
- `api/ghl/dashboard.js`: SMART Trak dashboard data.
- `api/ghl/training-plan.js`: training plans, plan days, assignments.
- `api/ghl/manual-mileage.js`: manual mileage/logged workout entry.
- `api/ghl/meets.js`: meet add/edit/delete/archive.
- `api/ghl/records.js`: school record board.
- `api/ghl/athletes.js`: active athlete list and contact creation.
- `api/ghl/athlete-best.js`: current fitness/PB/SB handling.
- `api/ghl/correction.js`: correction/void handling.

## Account Separation And Access

Status: mostly complete and tested.

Implemented:

- Account-specific environment variables.
- Product plan gating: Essential vs Pro.
- Pro setup-needed state if plan is Pro but CRM variables are missing.
- Access code protection for SMART Trak dashboard/API data.
- Setup helper page for generating Vercel variable names and customer links.
- Customer dashboard link can be hidden in setup helper to reduce accidental sharing.

Important variables:

- `SMARTCOACH_PRODUCT_PLAN_<ACCOUNT>`
- `GHL_PRIVATE_INTEGRATION_TOKEN_<ACCOUNT>`
- `GHL_LOCATION_ID_<ACCOUNT>`
- `SMARTCOACH_ACCESS_CODE_<ACCOUNT>`
- optional logo URL variable if configured for customer branding.

Known UX note:

- The access code may be requested again after logout/new browser/session. That is acceptable for security, but long term we need a cleaner auth/session model.

## SMART Trak Data Model

Detailed model files:

- `SMART_TRAK_DATA_MODEL.md`
- `SMART_TRAK_FIELD_BUILD_GUIDE.md`
- `smart_trak_object_mapping.json`
- `smart_trak_field_schema.json`

Core objects currently in use:

- Performance Records
- Season Records
- Meet Results
- Training Plans
- Meets
- Athlete Bests
- Records
- Training Plan Days

Contact fields in use:

- `contact.smartcoach_active`
- `contact.smartcoach_athlete_id`
- contact gender custom field was added and should be used when comparing girls to girls and boys to boys.

Naming cleanup:

- "Athlete Name Snapshot" was renamed to "Athlete Name".
- "Record Name" was removed from at least some objects as redundant.
- "Meet Name" was considered redundant with Meet. Avoid adding more duplicate name fields.

## Stopwatch App State

Implemented:

- Training groups and Meet groups are separated.
- Archive tab exists.
- Groups can be archived.
- Bulk archive for training and meet groups was requested and partially worked on.
- Active athletes are loaded from SMART Trak using `SMARTCoach Active = Yes`.
- A runner cannot be selected twice within the same group.
- A new athlete can be added from the app and should be created active in SMART Trak.
- Existing sync prevention asks/selects when trying to resync already synced runs.
- Sync modal only asks for fields that are still needed at sync time: mostly surface/weather/volume depending on plan context.
- Weather is saved into notes because there is no dedicated weather field.
- Rep/rest splits can be enabled in group settings.
- Back should save group settings automatically, not only Done.
- Pro-only SMART Trak sync should appear only when account and access are valid.

Important behavior:

- If the selected plan workout changes in-app, sync should use the newly selected workout, not the original plan default.
- Archived training plans should not appear in the app plan selector.
- Archived meets should not appear in app meet selectors.
- Meet selection should lead to adding athletes/runners for timing.

Known issues/parked:

- Records page school-record history currently keeps the current record and may only reliably keep one previous record. Parked for now.
- Some app access-code behavior may still need polish. The app showed green account status but sync was missing until refresh/fix.
- Need verify bulk archive behavior on the mobile app.

## Dashboard State

Implemented:

- SMART Trak dashboard with roster, training load, meet results, and completed workouts.
- Volume is more prominent than sync counts.
- Tabs reduce page length:
  - Roster Overview
  - Recent Meet Results
  - Training Load
- Training Load contains:
  - Volume by Athlete
  - Completed Workouts
- Completed workouts can be expanded by athlete.
- Top and bottom horizontal scrollbars were added for wide tables.
- Cards have hover shadow and improved layout.
- Manual mileage logging exists.
- Manual workout corrections and voids exist.
- Edits should update instantly whenever possible; this is now a product standard.
- Meet result corrections have event dropdowns to keep data clean.
- Time differences over 60 seconds should display in minutes where implemented.
- Info icons on column labels were added, with improved tooltip styling.

Important training-load behavior:

- For rep/rest workouts, target review should compare work reps against the target, not total elapsed stopwatch time.
- Rep/rest chips should show like the app: `Rep 1 00:28.2`, `Rest 1 00:15.3`.
- Rest is a standard color.
- Rep color should represent target review:
  - Fast = red
  - On target = green
  - Slow = a distinct non-red/non-green warning color
- This lets the UI avoid relying only on "too fast / too slow" pills.

Known issues/parked:

- Make sure every edit/void/delete updates the UI instantly without requiring refresh.
- Void/edit buttons have had iframe event issues before. Prefer direct event delegation that works in iframe.

## Training Calendar State

Implemented:

- Week and list views.
- Current week starts at top.
- Sticky controls/header behavior improved.
- Week view scrolls similarly to list view.
- Calendar has its own scroll area.
- Completed/skipped/scheduled quick status.
- Bulk status selection with checkboxes:
  - Select visible days.
  - Apply Scheduled, Completed, or Skipped.
- Select All added for list-view checkboxes.
- Manual entries default to Scheduled.
- Visible Mix strip can be hidden.
- Current plan selector can filter archived/past plans.
- Plans can be archived.
- Training Calendar has Log Mileage button.
- Plan days can be removed/deleted from calendar.

Known next-level needs:

- Coaches need to upload existing plans from spreadsheets.
- Coaches need to create plans daily, weekly, monthly, or season-long.
- Coaches often build a season one week at a time under the same plan name.
- Need a full-plan review/spreadsheet-like adjustment view before finalizing a generated/imported plan.

## Plan Entry / Manual Workout Builder

Recent direction:

- Replace the generic manual entry form with a runner-specific workout builder, especially for cross country and distance track.
- Support Sets and Repeating Sets.
- Include warmup and cooldown in m, mi, or min.
- Quality session row:
  - Reps
  - Distance in miles, meters, minutes, or seconds
  - Effort
  - Recovery between reps in jog/walk/time/distance
- Repeating sets:
  - outer repeat count
  - nested sets
- Easy/Recovery Run flow:
  - distance
  - optional post-run strides
  - workout notes
- Strides should only include:
  - reps
  - distance
  - recovery between reps
  - no effort field
- Number steppers should increment by whole numbers, but coaches can type decimals manually.
- Favorites:
  - save favorite
  - show favorites
  - delete favorite
  - prevent duplicate favorite names
  - favorite must save with the correct workout format, not always quality session
- Summary box should use cleaner SMART Trak styling:
  - no odd cyan header
  - black text for total/estimated total, not inverted black box.

Update from 2026-05-19 continuation:

- Plan Entry duplicate favorite names now show a blocking message instead of silently replacing the saved favorite.
- Quality-session repeat/set summaries and saved preview rows now say recovery is between reps.
- Browser-verified manual quality builder: repeat set summary, preview row details/targets, and duplicate favorite guard.
- App sync payload now derives top-level plan/workout fields from the selected runners' current plan context, so a newly selected in-app workout is the workout sent to SMART Trak when common across selected athletes.
- App meet selector filtering now ignores both archived statuses and explicit archived flags.
- Dashboard void actions now update roster latest meet/latest training snapshots and visible training totals locally after successful void, avoiding stale rows until refresh.
- Training Calendar remove-from-calendar now marks the day skipped/removed locally after the backend confirms and refreshes quietly afterward, so the day disappears from the current view without waiting on a full reload.
- Plan Builder Current Fitness Setup now has local athlete filtering for girls/boys/unlisted when gender is available, name sorting, and draft-safe fields so typed times survive filter/sort changes.
- Athlete roster API now includes a read-only gender display field, using the same contact gender/sex/division lookup as the dashboard, so Plan Builder filters can work without changing performance records or calculations.
- Plan Builder Plan Assignments now has the same girls/boys/unlisted filter and name sort, with hidden checked athletes preserved so filtered assignment saves do not accidentally drop athletes.
- Current Fitness Setup and Plan Assignments moved out of Plan Builder into a dedicated Planning Setup page (`plan-setup.html`), with navigation added from Dashboard, Training Calendar, Plan Entry, and Plan Builder.
- Plan Builder no longer loads assignment plans during page startup; it keeps the build questionnaire focused on draft plan creation and links coaches to Planning Setup when roster setup is needed.
- Header buttons now use Dashboard as the blue left anchor, smaller navigation padding, and a neutral separated Refresh action across the main SMART Trak pages.
- Plan Builder and Planning Setup now match the Plan Entry header pattern: "SMART Trak [Page Name]" beside the logo with a one-line description underneath.
- Planning Setup keeps the extra "Setup lives here" callout removed and uses clearer descriptions for Current Fitness Setup and Plan Assignments.
- Completed training sync now calculates per-athlete completed quality volume from explicit rep prescriptions such as `10 x 100m`, using completed work reps/laps where available and saving that value into each athlete's SMART Trak note.
- Dashboard volume parsing now understands rep-style volume text like `8 x 100m` and plain metric distances like `800m`, so completed quality work contributes to volume totals.
- Dashboard completed workout volume now corrects older quality records that saved the full planned range such as `800-1000m tempo`; when split data shows fewer completed work reps, the dashboard infers actual rep volume, for example `6 x 100m completed` becomes `0.4 mi`.
- Quality workout volume counts completed work reps only. Rep/rest recoveries, including walk-back or timed recovery chips, are excluded from dashboard actual volume unless a future separate recovery-distance metric is intentionally added.
- Planning Setup now has a Training Groups section for desktop group roster setup. Groups are stored in a hidden SMARTCoach system record inside the existing Training Plans object and are loaded by the phone app; phone-created or phone-edited training groups remain available and save back to the shared group roster.
- Plan Assignments now uses the shared Training Groups list for its group selector, and saving a plan assignment also updates that group's athlete roster so the group label is not just a plan label.

Workout effort percentage guidance discussed:

- Easy/Recovery: roughly 60-75%
- Extensive Tempo: roughly 65-75%
- Intensive Tempo: roughly 75-85%
- Threshold: roughly 84-90%
- Interval / Aerobic Power: roughly 90-95%
- Repetition / Fast Reps: roughly 95-100% depending distance
- Speed Endurance / Special Endurance: event-specific, often 85-95%
- Race: competition target

The stopwatch should calculate each runner's target from current fitness and the planned effort/percentage range.

## Plan Builder State

Implemented:

- Guided plan builder page.
- Current fitness setup.
- Plan assignments:
  - assign plan to selected athletes.
  - support group plan plus athlete-level overrides.
- A coach can use SMART Trak to create/import plans, while the mobile app selects/uses them.

Needs improvement:

- Current Fitness Setup and Plan Assignments were moved off the Plan Builder page into Planning Setup.
- Better explanation is needed:
  - The builder creates a built-for-you plan from start to finish for a chosen period.
  - Coach reviews, adjusts, and approves before use.
- Current fitness setup should be sortable/filterable by girls and boys.
- Plan builder questions should include:
  - goal event/race distance
  - training age
  - current fitness
  - injury history
  - weekly volume capacity
  - speed vs aerobic profile
  - recovery ability
  - time of season
  - available training time
  - adaptation rate
  - terrain/surface, heat tolerance, strength/mobility, event doubling, schedule constraints.

## Meet History State

Implemented:

- Meet History combines Meets, Meet Results, and athletes.
- Can compare meets, events, athletes, and results across seasons.
- Results section has its own scroll.
- Sticky header added.
- Gender-aware comparison is required.

Important behavior:

- Compare girls to girls and boys to boys.
- Comparisons are by event and gender.
- If the contact gender field is available, use it.

Known/pending:

- Make sure gender is actually considered everywhere in fastest/rank/comparison logic.
- Meet results with first-ever event should count as a new best, not "No new best".
- Meet result corrections should update related records/bests where appropriate.

## Meets Management

Implemented:

- Dashboard Manage Meets modal.
- Add/edit/archive/delete meets.
- Archived status added to Meets object status dropdown.

Known issues:

- Manage Meets save/archive/delete needs instant UI updates.
- In iframe, archive buttons worked in browser but not inside desktop app at one point. Watch for event handler/iframe quirks.
- App select-meet dropdown should exclude archived meets.
- The meet season can be confusing if a meet date is in May but labeled Fall 2026. The app should trust the meet's stored season but the coach workflow should make this obvious.

## Records Page State

Product decision:

- Records page is a school record board.
- Record type should only be School Record.
- Record level/scope should effectively be School.
- Record owner is always the athlete who set the record.
- Current visible row is the current school record for event + gender.
- Row expands to show history/past records for that same event + gender.
- Coach can add school records manually, by paste, or by template upload.
- If a record is beaten by stopwatch or manually entered meet result, the old current record should be replaced by the new current record but preserved in history.

Implemented:

- SMART Trak Records page.
- School Record Tools hidden until opened.
- Quick add single record.
- Bulk tools/template upload/paste area.
- Edit/delete buttons.
- Gender field added to Records custom object.
- Table supports expanded history.

Known issue parked:

- Refresh may only keep one historical record under the current school record. This is acceptable for now but needs a real fix later.
- Need ensure faster time is always current for race events.
- Date display off-by-one was fixed in `records.html`.

## Branding

Implemented:

- SMART Trak logo image is used instead of ST/SC text badge in desktop views.
- Logo is a default placeholder.

Future:

- Customer logo URL from the account registry now applies across the main SMART Trak desktop pages: Dashboard, Athletes, Training Calendar, Planning Setup, Plan Entry, Plan Builder, Meet History, Records, and XC Simulator.
- Mobile app should use inverted colors: blue with white, compared with desktop white/blue.

## Future Planning Notes

Subscription/customer management:

- Added account setup fields for customer subscription information:
  - subscription status
  - billing cadence
  - subscription amount
  - renewal date
  - Stripe customer/subscription IDs
  - internal subscription notes
- SMART Trak Pro API access is blocked when subscription status is `past_due`, `paused`, `canceled`, `incomplete`, `incomplete_expired`, or `unpaid`.
- Blank subscription status remains allowed during migration so current accounts do not get locked out.
- Account status now separates setup readiness from access readiness, so a configured SMART Trak account can still show blocked when subscription status prevents Pro access.
- Account status now also reports `deviceAccessReady`, `coachAccessUnlocked`, and `coachSessionActive`, so support can distinguish a ready account from a browser/phone that still needs a coach access code.
- Account status includes `subscriptionBlockedReason`, and onboarding displays that reason when a configured account is blocked by billing status.
- Account automation/manual registry save/account registry lookup responses now return the same `setupReady`, `accessReady`, `subscriptionAccessAllowed`, and `subscriptionBlockedReason` signals as account status.
- Stopwatch, dashboard, Plan Builder, and Planning Setup now respect `accessReady: false` during account checks so blocked subscriptions stop cleanly instead of loading Pro data and failing later.
- Athletes, Training Calendar, Plan Entry, Meet History, Records, and XC Simulator now also check `accessReady` before loading SMART Trak data, so blocked subscriptions show a clear access-blocked message across the main coach pages.
- Added protected `account-automation` intake endpoint for GHL/Stripe automation payloads.
- Launch billing guidance now treats GHL's native Stripe integration as the preferred payment/subscription path, with SMART Trak receiving subscription/access updates from GHL automation. Direct Stripe webhooks remain available as an optional fallback.
- `/onboarding.html` now labels the recommended automation copy as the GHL workflow endpoint and GHL Subscription Payload, with direct Stripe webhook wording kept secondary.
- GHL workflow subscription status normalization now accepts common payment words like paid, payment failed, failed payment, cancelled, pending, and not paid. Unknown automation status text becomes `incomplete` so access is not accidentally allowed.
- Automation intake validates `SMARTCOACH_AUTOMATION_SECRET`, normalizes the customer account/subscription payload, and returns the setup fields plus registry record.
- Added signed coach session support behind `SMARTCOACH_SESSION_SECRET`.
- Dashboard now exchanges a valid coach access code for a temporary session token and stops sending the raw code on each dashboard request when a session exists.
- Mobile stopwatch app now exposes the Account button on the Groups screen and prompts for a coach access code when the selected account requires SMART Trak access.
- Mobile Account settings now distinguish missing account keys, missing setup fields, missing coach codes, and subscription-blocked access so phone testing points to the right setup fix.
- Coach session length is configurable with `SMARTCOACH_SESSION_TTL_SECONDS`, defaulting to 12 hours and clamped between 15 minutes and 7 days.
- Added regression coverage so signed coach sessions cannot be reused across customer accounts and expire after the session window.
- Added server-side throttling for coach session/access-code attempts so repeated bad codes pause before another login attempt is accepted.
- Added optional required coach-access enforcement with `SMARTCOACH_REQUIRE_COACH_ACCESS` or account-specific `SMARTCOACH_REQUIRE_COACH_ACCESS_ACCOUNTKEY`. This blocks Pro SMART Trak access if a customer account has no coach access code configured.
- SMART Trak API responses now send no-store/security headers so account status, coach sessions, roster data, and training data are not cached by browsers or shared proxies.
- Coach-facing SMART Trak HTML pages now receive consistent Vercel no-store, noindex, no-referrer, and nosniff headers.
- Added regression coverage for API no-store headers and Vercel HTML noindex/no-cache headers.
- Legacy `/api/ghl/*` SMART Trak routes now attach the durable account registry before Pro access checks, so automated subscription/account updates are enforced consistently even when an older page calls a GHL route directly.
- Account automation no longer silently generates coach access codes for new Pro accounts. Missing coach codes keep the account setup-incomplete so support must intentionally create and share coach codes.
- Dashboard, Plan Builder, and Planning Setup now call account status with the explicit account key, making customer account checks more reliable in embedded/custom-link contexts.
- Coach access prompts now stay open and show the server error when a login attempt fails, including rate-limit and missing coach-code setup messages.
- Added regression coverage for coach access-code rate limiting after repeated wrong attempts.
- Added durable account registry support for Vercel KV / Upstash Redis REST.
- Check System and setup docs now explain the durable registry in plain language as customer account storage, not a coach-facing login feature.
- `/onboarding.html` now includes a Registry Setup Values panel with copy-ready Vercel variable names for customer account storage.
- `account-automation` now saves the normalized customer account record to the registry when `SMARTCOACH_REGISTRY_REST_URL` and `SMARTCOACH_REGISTRY_REST_TOKEN` are configured.
- Added regression coverage proving Vercel KV aliases (`KV_REST_API_URL`, `KV_REST_API_TOKEN`) and Upstash aliases (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) work as customer account storage without duplicate SMARTCOACH registry env vars.
- When a registry record exists, SMART Trak uses it as the live account source before falling back to Vercel environment variables. Trusted setup can update plan, coach seats, coach access codes, location ID, token, and logo URL without a new Vercel variable for every customer change, while recurring GHL subscription automation should stay limited to billing/access fields.
- `account-automation` merges later partial updates into the existing registry record, so Stripe/GHL subscription updates can change status, amount, renewal date, and Stripe IDs without wiping CRM connection fields or coach access codes.
- Added regression coverage so partial subscription automation updates preserve saved connection fields, coach access codes, parent email coach access, and logo URL.
- Added signed `account-stripe-webhook` intake for direct Stripe webhooks. It verifies `Stripe-Signature` with `SMARTCOACH_STRIPE_WEBHOOK_SECRET`, then reuses the safe registry merge logic. Stripe webhook requests now only return success after the registry save succeeds, so Stripe can retry if the durable registry is unavailable.
- Added regression coverage to verify missing or invalid Stripe webhook signatures are rejected before the durable registry is touched.
- Added protected `account-registry` read endpoint for verifying saved customer registry records.
- Added regression coverage to verify missing or wrong automation secrets are rejected before the durable registry is touched.
- Added internal account lookup on `/onboarding.html` so a customer registry record can be checked by account key and automation secret, with subscription fields loaded back into the setup form.
- Account lookup now shows a last-update card and coach/support friendly timestamps for registry updates and recent automation events.
- Account lookup now displays hidden private tokens as `Saved` and coach access codes by saved count, so support can verify setup without exposing secret values.
- `/onboarding.html` now includes **Launch Security Values** with copy-ready Vercel field names, safe value notes, a browser-side generator for separate setup/automation/session secrets, and a copy-all security values action.
- The Launch Security Values parent-email row now copies only rollout/hold notes rather than the Vercel field name, reducing the chance of enabling unreleased parent email tools during initial rollout.
- Launch Security Values now has **Clear Generated Secrets** so setup staff can wipe generated setup/automation/session secrets from the page after saving them in Vercel.
- Copy Security Values now reminds setup staff to save the values in Vercel and then use Clear Generated Secrets.
- Added manual **Save Registry Update** action on `/onboarding.html` so internal support can correct a customer's plan/subscription fields in the durable registry without waiting for Stripe/GHL automation.
- Added optional SMART Trak connection fields to `/onboarding.html` for internal setup/support: location ID, private integration token, coach access codes, and logo URL. Blank fields preserve existing saved registry values.
- Added account-key and coach-code generators to `/onboarding.html` to reduce manual setup mistakes. Coach code generation respects one-coach vs three-coach Pro setup.
- Added copy-ready Stripe metadata and account automation JSON payloads to `/onboarding.html` so purchase/onboarding automation can be configured from the same account setup screen.
- `/onboarding.html` now shows copy-ready production endpoint URLs for account automation and the signed Stripe webhook while keeping the full URLs hidden on screen.
- Added regression coverage for `SMARTCOACH_ADMIN_SETUP_CODE` so setup fields cannot be generated without the correct internal setup code.
- `/onboarding.html` now provides a copy-ready Stripe webhook event list for checkout, subscription, and invoice events needed to grant, update, or block account access.
- Stripe/GHL automation account-key parsing accepts multiple account metadata aliases, including `accountKey` and `smartcoach_account_key`, so real checkout/subscription metadata is less brittle.
- Stripe webhook processing now treats repeated Stripe event IDs as already handled, returns success for the retry, and avoids rewriting the customer registry record for duplicate webhook deliveries.
- Added protected `account-automation-health` endpoint and a `/onboarding.html` system readiness check for automation secret, internal setup code, durable registry, registry connection, Stripe webhook signing secret, signed coach sessions, dedicated session secret, and coach access enforcement. The readiness check now shows production warnings when sessions use fallback secrets, global coach access enforcement is off, the durable registry is missing, the setup code is missing, or the registry cannot be reached.
- The system readiness check also shows the parent email rollout gate. Initial rollout should keep `SMARTCOACH_PARENT_EMAIL_FEATURE_ENABLED` off, even if parent-email coach access is configured on an individual account.
- The system readiness check now reports one overall launch-readiness status plus launch blockers for automation secret, durable registry, Stripe webhook signing secret, dedicated session secret, coach access enforcement, and parent-email rollout state.
- The system readiness check now includes a launch checklist with plain-language details for each automation/security requirement before initial rollout.
- `/onboarding.html` now has **Copy System Status** after Check System, so support can save launch readiness, blockers, warnings, and setup/security checklist results before activating customers.
- Onboarding now labels per-coach parent email access as `Future Parent Email Coaches`, making clear that those values are only staged for a later release while parent email remains globally off for initial rollout.
- The Activation Runbook now tells support to use Copy System Status after Check System so system readiness is saved before customer activation steps continue.
- Copy System Status now clears stale system-readiness data when a new Check System starts or fails, so support cannot accidentally copy an old passing result after a failed check.
- Copied smoke-status, coach-invite, activation-runbook, and activation-record notes now ignore stale cached setup data when the active account key has changed.
- Copy SMART Trak Link now rebuilds the customer link from the active account key before copying, avoiding stale custom-link URLs after account-key edits.
- Customer links on `/onboarding.html` now resync when the account key changes, so Open SMART Trak, Stopwatch, and Account Status links follow the active customer account.
- The active-account helper now carries the selected plan and default customer links even before Generate or Lookup runs, keeping copied/opened onboarding links accurate for a fresh account key.
- The active-account helper now lets the current plan and coach-seat form selections override cached setup data, and the customer-link label refreshes when the plan changes.
- Plan and coach-seat changes on `/onboarding.html` now refresh customer links, the visible coach-seat result, setup checklist, and activation runbook from the current form state.
- The active-account snapshot now includes current subscription, logo, and parent-email form values so copied activation notes reflect edits made after lookup.
- The active-account snapshot now recalculates subscription allow/block state from the current subscription status field, so copied next-action guidance does not keep an old blocked status after form edits.
- Subscription field edits on `/onboarding.html` now refresh customer links, the setup checklist, and activation runbook from the current form state.
- Parent-email coach access and logo URL edits now trigger the same active setup refresh, so copied notes and checklist context stay aligned with support edits.
- `/onboarding.html` now includes a live smoke-test checklist for the real customer-account path after deploys.
- `/onboarding.html` setup checklist now shows ready/missing/warning badges based on the current customer account signals, including durable registry saved, subscription access, coach codes, and account configuration.
- Registry account records now store a lightweight `lastAutomationEvent` stamp and a short `automationEventHistory` list showing recent update source, event type, optional Stripe event/object IDs, and received time. `/onboarding.html` lookup displays last source/event plus recent automation history.
- `/onboarding.html` manual registry save now only reports "saved" when the durable registry actually returns `saved: true`; otherwise it shows the registry setup problem.
- `/onboarding.html` now warns before saving an incomplete Pro registry record and names missing setup pieces such as location ID, private integration token, or coach access code.
- Added protected `account-automation-dry-run` and a **Test Setup First** button on `/onboarding.html` so internal setup can verify account access, subscription status, coach seats, coach codes, and generated setup fields without writing to the registry.
- Added **Check Customer Access** to the `/onboarding.html` Live Smoke Test so support can verify live account status, subscription access, registry source, and coach access-code readiness from the setup page before opening every coach page manually.
- Check Customer Access now includes direct links for Dashboard, Athletes, Training Calendar, Planning Setup, Plan Entry, Plan Builder, Meet History, Records, and XC Simulator for the selected customer account.
- Check Customer Access now shows a warning state when the account is ready but the current browser/phone still needs a coach access code, so support does not confuse account readiness with device unlock.
- Added **Test Access Rules** to the `/onboarding.html` Live Smoke Test so support can verify, without saving changes, that active/trialing subscriptions allow access and past due/unpaid/canceled subscriptions block access.
- Added a live smoke-test completion summary to `/onboarding.html` so support can see whether all required live validation checks are complete before turning on a new coach account; the checklist now covers core pages, advanced pages, a real saved workflow, subscription access, the activation record, and parent email staying off.
- Added **Copy Smoke Status** to `/onboarding.html` so support can paste the exact checked/missing live smoke-test items into notes during launch validation.
- Copy Smoke Status now also includes activation-record copy status, final activation-record copy status, coach invite copied status, post-launch follow-up progress, and the current next action, so the support note can cover the full launch state.
- Added a per-account launch sign-off to `/onboarding.html` so support can stamp the validation time, add a short launch note, and include that sign-off in the copied smoke-test status.
- The launch sign-off copy now clearly says it is required before copying the activation record or sending the coach invite.
- `Copy Activation Record` now also includes the live smoke-test sign-off fields, so the final customer support note records who validated launch readiness and when.
- `/onboarding.html` next-action guidance now keeps pointing support to the live smoke test or launch sign-off until both are complete, instead of saying the account is ready too early.
- The `/onboarding.html` live smoke-test checklist now persists in the browser per account key and includes a reset action, so setup progress survives refreshes without carrying over to a different customer.
- `/onboarding.html` now warns and blocks setup saves, dry runs, live access checks, and access-rule tests when the setup account key and lookup account key point to different customers.
- Added an **Activation Runbook** to `/onboarding.html` so each new customer setup has the same plain-language order: Check System, Test Setup First, Save Registry Update, add the single SMART Trak custom link, verify coach access, and complete the live smoke test.
- The Activation Runbook now includes a visible handoff status strip that follows smoke-test completion, launch sign-off, activation-record copy, coach-invite copy, and post-launch follow-up for the current account key.
- The Activation Runbook now ends with stamping launch sign-off and copying the activation record, so support has a final handoff step before coach access is turned on.
- The Activation Runbook now also includes a final **Send coach invite** step using Copy Coach Invite after validation and internal handoff are complete.
- The Activation Runbook now includes a post-launch **Confirm first login and sync** step so the written activation flow matches the follow-up checklist.
- Added **Copy Activation Record** to `/onboarding.html` so support can paste a customer setup summary with account key, plan, subscription, Stripe IDs, recent automation update, setup/access state, smoke-test progress, next action, customer link, status link, and coach page validation links.
- The live smoke-test checklist now describes Copy Activation Record as the support note that includes setup state, next action, customer links, coach invite status, and post-launch follow-up progress.
- Copy Activation Record now requires the live smoke validation checks to be complete and launch sign-off to be stamped; support should use Copy Smoke Status for partial launch notes.
- Copy Activation Record now treats the activation-record checklist row as the outcome of the copy action, avoiding a checklist deadlock and marking that row complete after a successful copy.
- `Copy Activation Record` now includes a coach-invite reminder so support saves the internal activation note before sending the coach-facing invite.
- Added **Copy Coach Invite** to `/onboarding.html` Customer Links so support can send a coach-facing access note with the customer link, account key, plan, and coach access-code instructions after validation is complete.
- Copy Coach Invite now refuses to copy until the live smoke-test checklist is complete and the launch sign-off is stamped, reducing the chance of inviting a coach before validation is done.
- Copy Coach Invite now also refuses to copy until Copy Activation Record has been used for the current account, keeping the internal handoff saved before coach-facing access is sent.
- Copy Coach Invite now saves a per-account copied timestamp in the setup browser, and later activation records show whether the invite has been copied.
- Copy Coach Invite now immediately refreshes the post-launch follow-up summary after the copied timestamp is saved, so the handoff screen updates without a refresh.
- Copy Activation Record now saves a per-account copied timestamp in the setup browser, and live smoke status plus next-action guidance show whether the internal activation note was saved before the coach invite is sent.
- Activation-record and coach-invite copied timestamps now save only after the copy action succeeds, so the handoff status does not advance on a failed clipboard action.
- Onboarding next-action guidance now advances through activation record saved, coach invite copied, and activation complete states so support can see the final launch step clearly.
- Added a per-account post-launch follow-up checklist to `/onboarding.html` for first coach login and first sync; activation records now include this progress and next-action guidance points to it after the invite is copied.
- The post-launch follow-up summary now updates visually as pending or complete based on the first-login and first-sync checks.
- The post-launch follow-up summary now only shows complete after Copy Coach Invite has been recorded, so checked follow-up boxes cannot make the handoff look finished before the invite step.
- When post-launch follow-up is complete, the summary now shows the coach-invite copied timestamp alongside first-login and first-sync confirmation.
- Copied smoke-status and activation-record notes now flag when post-launch follow-up boxes are complete but Copy Coach Invite has not been recorded yet.
- After post-launch follow-up is complete, onboarding next-action guidance now reminds support to copy the final activation record before moving the account to normal monitoring.
- Copy Activation Record now titles the copied note `SMARTCoach Final Activation Record` once first coach login and first sync are both checked.
- Copy Activation Record now only treats the note as final after the coach invite has been copied and first-login/first-sync follow-up is complete.
- `VERCEL_SETUP.md` now describes the same final activation-record rule: coach invite copied plus first-login/first-sync follow-up complete.
- The activation handoff strip now uses the same final activation-record wording: coach invite copied plus first login and first sync confirmed.
- Final activation record copies now save a separate per-account timestamp, allowing onboarding next-action guidance to move from final handoff to normal support monitoring.
- Copy Coach Invite now tells coaches where to enter the account key and coach access code on the phone app: Groups screen -> Account.
- Essential Copy Coach Invite now also tells stopwatch-only coaches where to enter the account key on the phone app.
- Copy Coach Invite no longer includes raw coach access-code values in the copied Pro invite; it tells the recipient to use their assigned code so one coach-facing note does not expose saved access codes.
- The `/onboarding.html` Activation Runbook now names the full launch blocker set: automation secret, setup code, durable registry, Stripe webhook, coach session secret, coach access enforcement, and parent email rollout gate.
- Added `tests/automation-api.test.js` to verify automation dry runs do not save registry records and duplicate Stripe webhook events do not rewrite already-handled account updates.
- Automation, Stripe webhook, and protected account lookup responses now hide private integration token and coach access-code values in returned account records, while the internal registry lookup remains available for support verification.
- Automation and dry-run setup responses now also redact private integration token and coach access-code values from generated environment rows, keeping setup field names visible without echoing saved secrets back in API responses.
- Onboarding setup rows now display redacted environment values as `Saved value hidden` and copy a value note instead of copying `__hidden__`, reducing the chance support pastes a redaction marker into Vercel.
- `VERCEL_SETUP.md` now documents that `Saved value hidden` and `__hidden__` are redaction markers, not values to paste, unless support is intentionally rotating a secret.
- The copied GHL workflow payload on `/onboarding.html` now includes subscription/account fields only and leaves SMART Trak private tokens and coach access codes out of the automation example.
- The onboarding payload card now labels that example as `GHL Subscription Payload` and states that setup secrets and coach codes are intentionally not included.
- `VERCEL_SETUP.md` recommended GHL automation example now excludes setup-only fields such as `locationId`, keeping the docs aligned with the subscription-only workflow payload.
- `VERCEL_SETUP.md` now explicitly says coach access codes belong in the manual registry setup flow, not the recurring GHL subscription payload.
- Live smoke-test and launch validation wording now explicitly refer to the GHL Subscription Payload and require confirming private tokens and coach access codes stay out of that copied workflow payload.
- `/onboarding.html` now labels the copied automation endpoint as the GHL Subscription Endpoint so support does not confuse recurring billing updates with one-time setup secrets.
- Updated `VERCEL_SETUP.md` and `README.md` so production setup docs match the current onboarding helper, launch-readiness check, Stripe webhook events, hidden secret behavior, and regression tests.
- `VERCEL_SETUP.md` now includes a launch validation checklist for the required live Pro test account pass before calling automation/security complete for rollout.
- Live smoke-test wording now says all required checks should pass instead of hard-coding a checklist count, so the setup guide stays accurate as launch validation evolves.
- Added `tests/run-all.js` as the single regression command for automation/account tests, server-side syntax checks, and coach-facing page script parsing. Run it with `node tests/run-all.js`.
- Added a minimal `package.json` so the full regression check can also run with `npm test`.
- `npm test` now also validates project JSON config files including `package.json`, `vercel.json`, and SMART Trak schema/mapping JSON.
- Added a GitHub Actions regression workflow so pushes and pull requests run `npm test` automatically.
- Added regression coverage for the parent-email release gate, so per-coach email settings stay hidden until the global rollout flag is intentionally enabled.
- Added `tests/ghl-account.test.js` as a lightweight regression check for subscription gating, Essential blocking, coach access-code checks, and signed coach-session acceptance. Run it with `node tests/ghl-account.test.js`.
- Need cleaner onboarding after purchase:
  - coach buys on website
  - account key generated
  - setup helper variables generated
  - SMART Trak custom link created
  - app/dashboard use customer-specific account.

Standalone SMART Trak:

- SMARTCoach Pro should be valuable even if a customer does not use the stopwatch app.
- Desktop needs easy manual entry for:
  - athletes
  - meets
  - meet results
  - training sessions
  - mileage
  - records
  - season data.

Data import:

- New customers will often have years of spreadsheets.
- Athletes page now has a lightweight roster import path: paste CSV/TSV rows, load an example, download a template, and save athlete/parent rows through the same SMART Trak athlete record flow.
- Still need deeper upload/import workflows for race results, school records, training history, and plans.

Parent communication:

- Athletes page now has lightweight parent email actions for the current filtered roster view:
  - open a mail draft with parent emails in BCC
  - copy parent emails to clipboard
- Athlete detail now has a one-athlete parent email action when a parent email is saved.
- Athletes page now includes a group filter, so coaches can filter to a training group and email/copy those parents without manually searching.
- Athletes page now supports selecting specific athletes; Email Parents and Copy Parent Emails use selected athletes when any are checked, otherwise they use the current filtered view.
- Parent email tools are not part of the initial rollout. They stay globally unreleased unless `SMARTCOACH_PARENT_EMAIL_FEATURE_ENABLED=true` is set later; until then, normal accounts do not show email controls or athlete selection checkboxes even if a coach is configured in `Future Parent Email Coaches`.
- Athletes page roster filter now says `With parent contact` and matches any saved guardian name, email, or phone, so parent setup remains useful without presenting unreleased parent-email tooling.
- Full parent communication is still planned.
- Later need deeper ways to email:
  - richer group/parent message templates and delivery history
- Coach should not have to find parent emails manually.

Community/media:

- Future idea: attach image/video and sync/post to SMARTCoach Pro community when a PR/new record happens.

Field events:

- Future idea: meets-only field event tracking.
- Examples: high jump, long jump, triple jump, pole vault, shot, discus, javelin, hammer.
- Track makes/misses/attempts, video, and notes.

Relays:

- Future idea: relay support.
- Time one relay entry with four runners attached.
- Each split should be tied to the runner/leg.
- All four runners attach to the final relay time.

Cross country competition simulator:

- Future idea: hypothetical results vs other teams.
- Enter/copy top seven athletes and times for multiple teams.
- Score top five with sixth/seventh as displacers.
- Keep running weekly competitor lists to see team ranking over time.
- Need copy/paste from common result websites.

Track simulator:

- Future idea: page similar to the XC Simulator.
- Compare hypothetical track meet outcomes by event, athlete, team, and projected points.
- Should support saving competitor fields/entries so coaches can update week to week.
- Use SMART Trak season bests for the coach's team where possible.

Help assistant:

- Future idea: SMARTCoach Pro help button for instructions, subscription questions, and how-to guidance.

## Current High-Priority Cleanup List

1. Manual calendar builder is aligned for distance runners: Add Activity opens Easy Run, Quality Session, Race, and Rest/Day Off choices; Race keeps Planned Volume and Target fields visible; Quality uses the set builder/summary; Easy supports distance plus optional strides.
2. App plan selection now waits for plan workout days to load before **Use Selected Plan** can apply, and it refuses to assign a plan without a selected/upcoming workout day. This prevents sync from using a stale or plan-name-only workout context.
3. Phone app now gates calendar meet/race imports behind loaded active plan and active meet lists, skips days tied to archived plans, and skips days linked to archived meets.
4. Dashboard race result entry now updates the visible dashboard immediately after the server save succeeds; calendar, records, meet manager, manual mileage, edits, and voids already update local rows after successful saves.
5. Clean Records page later if current history limitation becomes painful.
6. Latest smoke check passed across phone app, dashboard, athletes, calendar, planning, meet history, records, XC simulator, onboarding, API files, and account/security regression tests. Next full-flow pass should use a live test Pro account in Vercel/GHL and include launch security values, Clear Generated Secrets, parent email off, all coach pages, stopwatch sync, subscription automation, and Copy Activation Record.
7. Onboarding/support setup refreshes immediately when location ID, private token presence, coach access codes, subscription fields, parent-email access, logo, or plan/seat values change; the private token still stays out of copied notes and records.
8. Copy Activation Record now requires a fresh system readiness check that says Ready for initial rollout, so activation cannot be recorded while security, registry, Stripe webhook, coach session, coach access, or parent-email launch blockers remain.
9. Copy Coach Invite now uses the same system readiness gate, preventing coach access notes from being sent if launch settings changed after activation.
10. Activation handoff status now shows the system readiness requirement directly and refreshes when Check System starts, succeeds, or fails.
11. Copy Smoke Status now includes system readiness, so partial or final smoke notes capture whether launch security was checked and ready.
12. Changing the setup or lookup account key now clears the prior system readiness result, forcing a fresh Check System for the active customer before activation or coach invite copy.
13. Critical setup edits now clear copied activation/invite/follow-up state, including generated coach-code changes and accounts loaded through Use In Form, so support has to recopy handoff notes after access or subscription details change.
14. When copied activation state is cleared, the live smoke checklist's activation-record row is also unchecked so the visible checklist matches the saved handoff state.
15. Activation record and coach invite copy now also require customer-account readiness: account key, saved registry record, allowed subscription, SMART Trak connection fields, coach access codes, and configured account status.
16. Dry-run setup previews no longer count as a saved registry record for activation/coach-invite handoff; Save Registry Update and lookup confirmation are required.
17. Critical setup edits now mark the account as having unsaved setup changes, blocking activation/coach-invite copy until Save Registry Update runs again.
18. Dry-run results now keep the unsaved setup marker visible through lookup/setup rendering, while saved registry results clear it as the new baseline.
19. Unsaved setup changes now appear in Next Action, the readiness banner, and the setup checklist so support sees Save Registry Update as the required next step.
20. Dry-run lookup/setup panels now label themselves as dry-run previews instead of saved customer account records.
21. Default activation handoff and smoke-checklist copy now names system readiness and saved customer setup before Copy Activation Record.
22. Account lookup now distinguishes saved, dry-run, and not-found registry states in the panel title.
23. Athletes parent-email action buttons are hidden in the raw page markup as well as runtime gating, preventing any first-render flash during the initial rollout.
24. Athletes parent-contact info tips now say contact details are stored with the roster and parent messaging stays off until that feature is intentionally released.
25. XC Simulator now has its own coach access-code prompt, so coaches can unlock season-best loading there instead of being sent back to Dashboard first.
26. Planning Setup and Plan Builder now also have direct coach access-code prompts, keeping Pro setup pages consistent with the other SMART Trak pages.

## Known Good Test Flow

Use this as a regression test:

1. Create/activate athletes in SMART Trak.
2. Confirm app athlete dropdown shows only active athletes.
3. Create or import a training plan.
4. Assign plan to a group or selected athletes.
5. Open app and choose plan/group.
6. Select a workout from the next 5 days.
7. Time a rep/rest workout.
8. Sync to SMART Trak.
9. Confirm:
   - contact note created
   - performance record created
   - plan day updates if linked
   - dashboard completed workout appears
   - reps/rests display clearly
   - target review compares reps, not total time
10. Create a meet result and confirm:
   - meet result created
   - athlete best updates
   - first result for an event becomes PB/SB
   - meet history shows correct event/gender comparison.

## Notes For Future Codex Sessions

- Read this file first.
- Then inspect the relevant page/backend only for the task at hand.
- Do not rework the whole app unless asked.
- Keep changes scoped.
- Use `rg` for searches.
- Use `apply_patch` for edits.
- Ignore unrelated dirty files unless they affect the current task.
- After frontend edits, provide the user direct confirmation steps.
