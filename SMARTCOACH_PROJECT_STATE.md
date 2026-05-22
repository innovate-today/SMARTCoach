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

- Coaches should be able to upload their own logo for dashboard/desktop views.
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
- Account status includes `subscriptionBlockedReason`, and onboarding displays that reason when a configured account is blocked by billing status.
- Account automation/manual registry save/account registry lookup responses now return the same `setupReady`, `accessReady`, `subscriptionAccessAllowed`, and `subscriptionBlockedReason` signals as account status.
- Stopwatch, dashboard, Plan Builder, and Planning Setup now respect `accessReady: false` during account checks so blocked subscriptions stop cleanly instead of loading Pro data and failing later.
- Athletes, Training Calendar, Plan Entry, Meet History, Records, and XC Simulator now also check `accessReady` before loading SMART Trak data, so blocked subscriptions show a clear access-blocked message across the main coach pages.
- Added protected `account-automation` intake endpoint for GHL/Stripe automation payloads.
- Automation intake validates `SMARTCOACH_AUTOMATION_SECRET`, normalizes the customer account/subscription payload, and returns the setup fields plus registry record.
- Added signed coach session support behind `SMARTCOACH_SESSION_SECRET`.
- Dashboard now exchanges a valid coach access code for a temporary session token and stops sending the raw code on each dashboard request when a session exists.
- Coach session length is configurable with `SMARTCOACH_SESSION_TTL_SECONDS`, defaulting to 12 hours and clamped between 15 minutes and 7 days.
- Added server-side throttling for coach session/access-code attempts so repeated bad codes pause before another login attempt is accepted.
- Added optional required coach-access enforcement with `SMARTCOACH_REQUIRE_COACH_ACCESS` or account-specific `SMARTCOACH_REQUIRE_COACH_ACCESS_ACCOUNTKEY`. This blocks Pro SMART Trak access if a customer account has no coach access code configured.
- SMART Trak API responses now send no-store/security headers so account status, coach sessions, roster data, and training data are not cached by browsers or shared proxies.
- Coach-facing SMART Trak HTML pages now receive consistent Vercel no-store, noindex, no-referrer, and nosniff headers.
- Legacy `/api/ghl/*` SMART Trak routes now attach the durable account registry before Pro access checks, so automated subscription/account updates are enforced consistently even when an older page calls a GHL route directly.
- Dashboard, Plan Builder, and Planning Setup now call account status with the explicit account key, making customer account checks more reliable in embedded/custom-link contexts.
- Coach access prompts now stay open and show the server error when a login attempt fails, including rate-limit and missing coach-code setup messages.
- Added durable account registry support for Vercel KV / Upstash Redis REST.
- `account-automation` now saves the normalized customer account record to the registry when `SMARTCOACH_REGISTRY_REST_URL` and `SMARTCOACH_REGISTRY_REST_TOKEN` are configured.
- When a registry record exists, SMART Trak uses it as the live account source before falling back to Vercel environment variables. Automation can now update plan, subscription status, coach seats, coach access codes, location ID, token, and logo URL without a new Vercel variable for every customer change.
- `account-automation` merges later partial updates into the existing registry record, so Stripe/GHL subscription updates can change status, amount, renewal date, and Stripe IDs without wiping CRM connection fields or coach access codes.
- Added signed `account-stripe-webhook` intake for direct Stripe webhooks. It verifies `Stripe-Signature` with `SMARTCOACH_STRIPE_WEBHOOK_SECRET`, then reuses the safe registry merge logic. Stripe webhook requests now only return success after the registry save succeeds, so Stripe can retry if the durable registry is unavailable.
- Added protected `account-registry` read endpoint for verifying saved customer registry records.
- Added internal account lookup on `/onboarding.html` so a customer registry record can be checked by account key and automation secret, with subscription fields loaded back into the setup form.
- Added manual **Save Registry Update** action on `/onboarding.html` so internal support can correct a customer's plan/subscription fields in the durable registry without waiting for Stripe/GHL automation.
- Added optional SMART Trak connection fields to `/onboarding.html` for internal setup/support: location ID, private integration token, coach access codes, and logo URL. Blank fields preserve existing saved registry values.
- Added account-key and coach-code generators to `/onboarding.html` to reduce manual setup mistakes. Coach code generation respects one-coach vs three-coach Pro setup.
- Added copy-ready Stripe metadata and account automation JSON payloads to `/onboarding.html` so purchase/onboarding automation can be configured from the same account setup screen.
- Stripe/GHL automation account-key parsing accepts multiple account metadata aliases, including `accountKey` and `smartcoach_account_key`, so real checkout/subscription metadata is less brittle.
- Added protected `account-automation-health` endpoint and a `/onboarding.html` system readiness check for automation secret, durable registry, registry connection, Stripe webhook signing secret, signed coach sessions, dedicated session secret, and coach access enforcement. The readiness check now shows production warnings when sessions use fallback secrets, global coach access enforcement is off, the durable registry is missing, or the registry cannot be reached.
- `/onboarding.html` setup checklist now shows ready/missing/warning badges based on the current customer account signals, including durable registry saved, subscription access, coach codes, and account configuration.
- Registry account records now store a lightweight `lastAutomationEvent` stamp and a short `automationEventHistory` list showing recent update source, event type, optional Stripe event/object IDs, and received time. `/onboarding.html` lookup displays last source/event plus recent automation history.
- `/onboarding.html` manual registry save now only reports "saved" when the durable registry actually returns `saved: true`; otherwise it shows the registry setup problem.
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
- Need upload/import workflows for existing athlete data, race results, school records, training history, and plans.

Parent communication:

- Parent communication is planned.
- Need ways to email:
  - whole group
  - selected athletes' parents
  - one athlete's parent/parents
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

1. Finish manual workout builder flow for distance runners.
2. Verify app uses newly selected plan workout during sync.
3. Verify app excludes archived training plans and archived meets.
4. Make all dashboard/calendar/meet/record edits update instantly.
5. Clean Records page later if current history limitation becomes painful.
6. Continue testing full app + desktop flow with a test Pro account.

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
