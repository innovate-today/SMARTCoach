# SMARTCoach / SMART Trak Project State

Last updated: 2026-05-27

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

- Repo: `/Users/marcusmoore/Documents/Codex/2026-05-19/continue-smartcoach-from-smartcoach-project-state/smartcoach-repo`
- Production URL: `https://app.smartcoach-pro.com`
- Deployment: Vercel from GitHub `innovate-today/SMARTCoach`
- Current working branch: `main`, pushed to `main` with `git -C smartcoach-repo push origin main:main`.
- Codex can usually push now. If GitHub DNS fails on the first try, retry once.

Current launch status:

- Code/security/setup cleanup is largely complete for the initial rollout path.
- Cleanup/launch prep is estimated at 90-95% complete.
- The previous Vercel Hobby serverless-function deployment blocker has been resolved in code by keeping the API function count within the Hobby limit.
- Production is serving the current SMART Trak route layout and current launch-validation pages as of 2026-05-26.
- Remaining launch readiness is primarily live validation with a real Pro test account in Vercel/GHL, especially tests that require the assigned coach access code.
- Treat additional cleanup as paused unless live validation exposes a blocker.
- Do not implement parked future ideas during this pass unless the user explicitly pulls one forward.
- Use `/live-launch-validation.html`, `LIVE_LAUNCH_VALIDATION.md`, and the Known Good Test Flow at the bottom of this file as the next practical launch checklist.

Latest handoff:

- Latest pushed code commit before this state update: `9e1bfcf Clean up future planning list`.
- Latest local commit when this handoff was checked: `9e1bfcf Clean up future planning list`.
- Repo was pushed to `main` after the future-planning cleanup.
- Latest docs/state maintenance in progress: keep `SMART_TRAK_COACH_HOW_TO.md` and this file updated after each feature or fix so new chats can resume without reconstructing history.
- Recent regression status: docs-only updates need `git diff --check`; code changes should continue to use `npm test` before push when practical.
- Weather page is now part of SMART Trak:
  - `/weather.html` provides live weather without an API key using Open-Meteo geocoding and forecast APIs.
  - Dashboard and Training Calendar include a Weather button.
  - Weather supports saved account-scoped browser locations, current conditions, hourly forecast, and daily forecast.
  - City/state searches such as `Orlando, FL` are parsed and matched against US state abbreviations/names.
- Relay support is now built across mobile and SMART Trak:
  - Mobile Meet flow supports meet > race > relay, four active-athlete leg selectors, Start/Lap/Finish relay timing, and relay result sync.
  - Dashboard and Training Calendar Log Race Result support relay result type, relay events, relay team, runner selectors, splits, and total time.
  - Dashboard Recent Meet Results can open relay details and edit relay event/team/total/splits; correction APIs allow relay edits without an individual athlete contact.
  - Relay events are in event dropdowns across mobile, Dashboard, Training Calendar, Records, Track Simulator, plan setup/builder, and backend training-plan options.
- Track Simulator is live at `/track-simulator.html` with SMART Trak season-best loading, manual/pasted entries, saved fields, multiple-event exclusion, Template CSV, scoring, and cleaned button presentation.
- Training Calendar supports dragging workouts and meets to another day.
- Meet History has a narrower Meets column and a white info bubble explaining meet selection and compare rows.
- Records page fixes are currently confirmed by the user:
  - Saved records survive refresh through direct rows plus durable server-side registry mirror/per-record keys.
  - Current/historical status is corrected so only the best current record for an event/gender stays current.
  - Records source diagnostics were changed back from detailed debug wording to the normal saved-record source display after troubleshooting.
- App workout sync was previously confirmed working on the real Pro test account: the user confirmed a `20.2` second Stevie Ray stopwatch workout appeared correctly in SMART Trak.
- Earlier live blocker fixes made after user retest:
  - Training Calendar now pulls saved Manage Meets records into the calendar as race/meet days, so races created from the Manage Meets popup are visible even when they are not attached to a training-plan day.
  - Records now recovers singular `Boy` / `Girl` gender values from saved record notes, preserving separate boys and girls records for the same event after reload.
  - Athletes no longer immediately reloads over the optimistic group assignment after saving, so the selected group should remain visible immediately after save.
- Phone app meet-result save now uses an Event dropdown for race distance selection and sends the selected event in both captured meet-result saves and scheduled meet-day syncs.
- Records reload now uses both GHL record listing paths and a full record identity key so different school records, such as Boy 400m and Boy 800m, should not collapse into one row after refresh.
- Records page now also keeps an account-scoped browser cache of records saved from that page and merges it after reload, protecting coaches from GHL list responses that only return the newest saved batch.
- Records table now renders each saved record row directly instead of collapsing records into one board row, and the Records Tools gender dropdown is limited to Boys and Girls with Boys as the default.
- Records edit/delete buttons now target the row's full identity key instead of relying only on a record ID, so cached or merged records open with their saved values instead of a blank edit modal.
- Records page no longer shows the History column or unused expansion controls now that each saved record is shown directly.
- `SMART_TRAK_COACH_HOW_TO.md` was added as the coach tutorial covering SMART Trak Dashboard, Athletes, Training Calendar, Meet History, Track Simulator, XC Simulator, Records, Manage Meets, Log Race Result, Log Miles, and the phone app Training/Meet/Archive/Settings/Sync workflows.
- The coach how-to guide was cleaned so it does not mention GHL or use "coach-facing" wording.
- Next practical step: deploy/retest those three live fixes, then continue the live Pro test-account validation pass with dashboard filtered-volume retests, manual mileage same-day edit retest, and phone app follow-up checks.

Latest SaaS/account setup truth:

- GHL SaaS is the intended account creation path. GHL creates/provisions the sub-account and applies the SMARTCoach snapshot; SMART Trak account automation stores the SMARTCoach account record and subscription/access state.
- The snapshot should include a custom value named `account_key` and a SMART Trak custom menu link using `https://app.smartcoach-pro.com/dashboard.html?account={{custom_values.account_key}}&embed=1`.
- GHL workflow webhook success was confirmed for `/api/smart-trak/account-automation`, creating a saved account record like `sc-qxwjweksyuf7sdofhpb4` from `locationId`.
- The GHL workflow payload should send billing/account fields only: `eventType`, `accountKey`, `locationId`, `plan`, `coachSeats`, `subscriptionStatus`, `billingCadence`, `source`, and `automationSecret` or the automation secret query parameter. Do not send private integration tokens or coach codes in the recurring subscription payload.
- After a new GHL sub-account exists, support still has to open `/onboarding.html`, load the account key, enter that sub-account's Location ID and Private Integration Token, generate/paste coach access code(s), and click Save Account Setup.
- Save Account Setup was confirmed to update the GHL custom value `account_key`; the confirmation message should say the value was updated.
- Current plan breakdown: Essential is $10/month or $100/year; Pro 25 is $45/month or $450/year; Pro 100 is $75/month or $750/year; Pro 200 is $150/month or $1500/year.
- Essential is stopwatch-only, requires an active code, and allows one active device session at a time. A new Essential login displaces the previous active device session.
- Pro plans enforce active-athlete limits in SMARTCoach code: Pro 25 has 25 active athletes, Pro 100 has 100, and Pro 200 has 200. Inactive/archived athletes do not count; delete should be reserved for mistakes/duplicates.
- Pro coach access allows up to 10 coach codes. The account owner is responsible for distributing codes, and schools should keep coach count low to protect clean synced data.
- Coach codes can be changed by support through onboarding/Save Account Setup, or by a coach from the Dashboard **Change Code** button when they know their current code. Code resets are limited to 2 times per month per account. A saved code change increments the coach-code session version so old signed Pro sessions stop unlocking access. Recurring subscription payloads should not include coach codes, so billing updates do not count as resets.
- A single coach access code can unlock both desktop SMART Trak and the SMARTCoach Pro Mobile App for the same coach/device workflow. The seat limit is about allowed coach codes, not counting the desktop and phone as two separate coaches.

Latest product direction:

- Training Calendar is now the primary place for one-day workouts, races, rest/off days, and notes.
- Upload/Paste Plan is for full-plan upload/paste workflows. Its Add Workouts description should say: "Add one-day workouts, races, rest days, or notes on the Training Calendar."
- Training Calendar header should use first-row actions in this order: Dashboard, Log Miles, Log Race Result, Manage Meets.
- Training Calendar should have a second row labeled `Training Setup:` with Athlete Setup, Upload/Paste Plan, Auto Build Plan, and Refresh. That second-row setup cluster belongs on Training Calendar only, not Dashboard, Athletes, or Meet History.
- Button rename standard: Planning Setup -> Athlete Setup, Plan Entry -> Upload/Paste Plan, Plan Builder -> Auto Build Plan.
- Training Calendar Log Race Result and Manage Meets should open their modals on the Training Calendar page, not navigate the coach to Dashboard.
- Number steppers for workout entry should move by whole numbers, while still allowing coaches to type decimals manually.

Latest known issues to retest after Vercel deploys latest code:

- Athletes page: adding an athlete with a group should save and keep the group visible immediately after save.
- New-account group leakage: if old test groups appear in a new sub-account, confirm whether the snapshot carried hidden SMARTCoach training group records or whether the group API needs stricter account scoping.
- Dashboard Training Load/Volume by Athlete should exclude archived groups from the Groups column.
- Dashboard cards should respect search/filter context. Example: searching for one athlete should make training load cards reflect that athlete or filtered set, not the whole roster.
- Confirm race volume counts into total volume, and document `Volume miles` as completed training/race volume converted to miles for the current filters.
- Manual Log Miles should treat bare numeric distance like `8` as miles or clearly force the unit. Same-day mileage edits must open the exact selected workout, not the first same-day mileage row.
- Phone app still needs a refresh button, a clearer drag handle for runner reordering, and reliable beep/vibrate on stopwatch button taps.

Typical deploy commands:

```bash
cd /Users/marcusmoore/Documents/Codex/2026-05-19/continue-smartcoach-from-smartcoach-project-state/smartcoach-repo
git add <files>
git commit -m "<message>"
git push origin main:main
```

## Main Pages

- `index.html`: mobile SMARTCoach stopwatch app.
- `dashboard.html`: main SMART Trak dashboard.
- `athletes.html`: coach-facing roster, athlete details, parent contact storage, and notes.
- `training-calendar.html`: training calendar, plan days, status management.
- `plan-import.html`: Upload/Paste Plan page for full-plan upload and paste workflows. Single-day workouts now belong on Training Calendar.
- `plan-setup.html`: Athlete Setup page for current fitness, training groups, and plan assignments.
- `plan-builder.html`: Auto Build Plan page for guided plan drafting.
- `meet-history.html`: meet schedule and meet-result comparison/history.
- `records.html`: school record board.
- `track-simulator.html`: track meet scoring simulator using saved opponent fields and SMART Trak season bests.
- `xc-simulator.html`: cross country scoring simulator using saved opponents and SMART Trak season bests.
- `weather.html`: live weather page with saved locations, current conditions, hourly forecast, and daily forecast.
- `athlete-calendar.html`: athlete-facing calendar portal for assigned workout completion, modification, and skip submissions.
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

- Account-specific environment variables plus customer account storage records.
- Product plan gating: Essential, Pro 25, Pro 100, and Pro 200.
- Pro setup-needed state if plan is Pro but CRM variables are missing; Essential setup requires an active coach code.
- Coach access-code protection for SMART Trak pages/API data, with signed browser sessions after a valid code is entered.
- Setup helper page for generating Vercel variable names and customer links.
- Customer dashboard link can be hidden in setup helper to reduce accidental sharing.

Important variables:

- `SMARTCOACH_PRODUCT_PLAN_<ACCOUNT>`
- `GHL_PRIVATE_INTEGRATION_TOKEN_<ACCOUNT>`
- `GHL_LOCATION_ID_<ACCOUNT>`
- `SMARTCOACH_COACH_ACCESS_CODES_<ACCOUNT>` or coach access codes saved through customer account storage
- `SMARTCOACH_REQUIRE_COACH_ACCESS=true`
- optional logo URL variable if configured for customer branding.

Known UX note:

- The coach access code may be requested again after logout/new browser/session. That is acceptable for security. Current pages exchange a valid code for a signed session token before loading SMART Trak data.

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
- Bulk archive exists for active Training groups and Meet groups, with archived groups moved to the Archive tab and saved through the shared group save path.
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
- Archived training plans are filtered out of the app plan selector.
- Archived meets are filtered out of app meet selectors.
- Meet selection should lead to adding athletes/runners for timing.

Known issues/parked:

- Records page multi-record save/current-historical behavior was fixed and user-confirmed after live retest. Keep it in the regression flow because GHL custom-object listing behavior has been inconsistent.
- Phone app account access now has a visible Account button, coach access-code prompt, and device unlock status. Post-launch phone follow-up should confirm first coach login, first sync, and bulk archive on an actual phone.
- Bulk archive is no longer a known unfinished feature; onboarding now tracks it as part of post-launch phone follow-up.

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
- Fastest/rank comparisons group by event plus normalized athlete gender.
- First-ever meet results for an event can auto-count as PB/SB when no prior best exists.

Important behavior:

- Compare girls to girls and boys to boys.
- Comparisons are by event and gender.
- If the contact gender field is available, use it.

Known/pending:

- Meet result corrections update linked Records entries when they can be matched. Full Athlete Best recalculation after corrections is still parked; coaches can manually adjust PB/SB flags during correction for now.

## Meets Management

Implemented:

- Dashboard Manage Meets modal.
- Add/edit/archive/delete meets.
- Archived status added to Meets object status dropdown.
- Manage Meets save, archive/restore, and delete update the visible meet manager list immediately after the server confirms.

Known issues:

- In iframe, archive buttons worked in browser but not inside desktop app at one point. Watch for event handler/iframe quirks.
- Auto-created meet/training seasons use the current mapping: Summer = June-July, Fall = August-November, Winter = December-January, Spring = February-May. If a meet has a saved season, app selectors should trust the stored season.

## Records Page State

Product decision:

- Records page is a school record board.
- Record type should only be School Record.
- Record level/scope should effectively be School.
- Record owner is always the athlete who set the record.
- Current visible row is the current school record for event + gender.
- Row expands to show history/past records for that same event + gender.
- Coach can add school records manually, by paste, or by template upload.
- Records page should be updated only through Records tools or bulk import tools. App stopwatch syncs and Log Race Result / meet-result entry do not need to auto-update the school record board.
- If a coach updates a school record through the Records tools, the old current record should be replaced by the new current record and, if practical, preserved in the expanded history.

Implemented:

- SMART Trak Records page.
- School Record Tools hidden until opened.
- Quick add single record.
- Bulk tools/template upload/paste area.
- Edit/delete buttons.
- Gender field added to Records custom object.
- Table supports expanded history.
- Saving a current record checks existing records for the same board and keeps the faster existing record current when appropriate.

Known issue parked:

- Refresh may only keep one historical record under the current school record. This is acceptable for now but needs a real fix later if record-board history becomes a launch priority.
- Date display off-by-one was fixed in `records.html`.

## Branding

Implemented:

- SMART Trak logo image is used instead of ST/SC text badge in desktop views.
- Logo is a default placeholder.

Future:

- Customer logo URL from the account registry now applies across the main SMART Trak desktop pages: Dashboard, Athletes, Training Calendar, Planning Setup, Plan Entry, Plan Builder, Meet History, Records, Track Simulator, and XC Simulator.
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
- Account automation, Save Account Setup, and account lookup responses now return the same `setupReady`, `accessReady`, `subscriptionAccessAllowed`, and `subscriptionBlockedReason` signals as account status.
- Stopwatch, dashboard, Plan Builder, and Planning Setup now respect `accessReady: false` during account checks so blocked subscriptions stop cleanly instead of loading Pro data and failing later.
- Athletes, Training Calendar, Plan Entry, Meet History, Records, Track Simulator, and XC Simulator now also check `accessReady` before loading SMART Trak data, so blocked subscriptions show a clear access-blocked message across the main coach pages.
- Added protected `account-automation` intake endpoint for GHL/Stripe automation payloads.
- Launch billing guidance now treats GHL's native Stripe integration as the preferred payment/subscription path, with SMART Trak receiving subscription/access updates from GHL automation. Direct Stripe webhooks remain available as an optional fallback.
- `/onboarding.html` now labels the recommended automation copy as the GHL workflow endpoint and GHL Subscription Payload, with direct Stripe webhook wording kept secondary.
- GHL workflow subscription status normalization now accepts common payment words like paid, payment failed, failed payment, cancelled, pending, and not paid. Unknown automation status text becomes `incomplete` so access is not accidentally allowed.
- Automation intake validates `SMARTCOACH_AUTOMATION_SECRET`, normalizes the customer account/subscription payload, and returns the setup fields plus customer account record.
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
- Legacy `/api/ghl/*` SMART Trak routes now attach customer account storage before Pro access checks, so automated subscription/account updates are enforced consistently even when an older page calls a GHL route directly.
- Account automation no longer silently generates coach access codes for new Pro accounts. Missing coach codes keep the account setup-incomplete so support must intentionally create and share coach codes.
- Dashboard, Plan Builder, and Planning Setup now call account status with the explicit account key, making customer account checks more reliable in embedded/custom-link contexts.
- Coach access prompts now stay open and show the server error when a login attempt fails, including rate-limit and missing coach-code setup messages.
- Added regression coverage for coach access-code rate limiting after repeated wrong attempts.
- Added customer account storage support for Vercel KV / Upstash Redis REST.
- Check System and setup docs now explain customer account storage in plain language, not as a coach-facing login feature.
- `/onboarding.html` now includes a Customer Account Storage setup panel with copy-ready Vercel variable names.
- `account-automation` now saves the normalized customer account record to customer account storage when `SMARTCOACH_REGISTRY_REST_URL` and `SMARTCOACH_REGISTRY_REST_TOKEN` are configured.
- Added regression coverage proving Vercel KV aliases (`KV_REST_API_URL`, `KV_REST_API_TOKEN`) and Upstash aliases (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) work as customer account storage without duplicate SMARTCOACH registry env vars.
- When a customer account record exists, SMART Trak uses it as the live account source before falling back to Vercel environment variables. Trusted setup can update plan, coach seats, coach access codes, location ID, token, and logo URL without a new Vercel variable for every customer change, while recurring GHL subscription automation should stay limited to billing/access fields.
- `account-automation` merges later partial updates into the existing customer account record, so Stripe/GHL subscription updates can change status, amount, renewal date, and Stripe IDs without wiping CRM connection fields or coach access codes.
- Added regression coverage so partial subscription automation updates preserve saved connection fields, coach access codes, parent email coach access, and logo URL.
- Added signed `account-stripe-webhook` intake for direct Stripe webhooks. It verifies `Stripe-Signature` with `SMARTCOACH_STRIPE_WEBHOOK_SECRET`, then reuses the safe customer account merge logic. Stripe webhook requests now only return success after the customer account update saves, so Stripe can retry if customer account storage is unavailable.
- Added regression coverage to verify missing or invalid Stripe webhook signatures are rejected before customer account storage is touched.
- Added protected `account-registry` read endpoint for verifying saved customer account records.
- Added regression coverage to verify missing or wrong automation secrets are rejected before customer account storage is touched.
- Added internal account lookup on `/onboarding.html` so a customer account record can be checked by account key and automation secret, with subscription fields loaded back into the setup form.
- Account lookup now shows a last-update card and coach/support friendly timestamps for customer account updates.
- Account lookup now displays hidden private tokens as `Saved` and coach access codes by saved count, so support can verify setup without exposing secret values.
- `/onboarding.html` now includes **Launch Security Values** with copy-ready Vercel field names, safe value notes, a browser-side generator for separate setup/automation/session secrets, and a copy-all security values action.
- The Launch Security Values parent-email row now copies only rollout/hold notes rather than the Vercel field name, reducing the chance of enabling unreleased parent email tools during initial rollout.
- Launch Security Values now has **Clear Generated Secrets** so setup staff can wipe generated setup/automation/session secrets from the page after saving them in Vercel.
- Copy Security Values now reminds setup staff to save the values in Vercel and then use Clear Generated Secrets.
- Added manual **Save Account Setup** action on `/onboarding.html` so internal support can correct a customer's plan/subscription fields in customer account storage without waiting for Stripe/GHL automation.
- Added optional SMART Trak connection fields to `/onboarding.html` for internal setup/support: location ID, private integration token, coach access codes, and logo URL. Blank fields preserve existing saved customer account values.
- Added account-key and coach-code generators to `/onboarding.html` to reduce manual setup mistakes. Coach code generation respects one-coach vs three-coach Pro setup.
- Added copy-ready Stripe metadata and account automation JSON payloads to `/onboarding.html` so purchase/onboarding automation can be configured from the same account setup screen.
- `/onboarding.html` now shows copy-ready production endpoint URLs for account automation and the signed Stripe webhook while keeping the full URLs hidden on screen.
- Added regression coverage for `SMARTCOACH_ADMIN_SETUP_CODE` so setup fields cannot be generated without the correct internal setup code.
- `/onboarding.html` now provides a copy-ready Stripe webhook event list for checkout, subscription, and invoice events needed to grant, update, or block account access.
- Stripe/GHL automation account-key parsing accepts multiple account metadata aliases, including `accountKey` and `smartcoach_account_key`, so real checkout/subscription metadata is less brittle.
- Stripe webhook processing now treats repeated Stripe event IDs as already handled, returns success for the retry, and avoids rewriting the customer account record for duplicate webhook deliveries.
- Added protected `account-automation-health` endpoint and a `/onboarding.html` system readiness check for automation secret, internal setup code, customer account storage, Stripe webhook signing secret, signed coach sessions, dedicated session secret, and coach access enforcement. The readiness check now shows production warnings when sessions use fallback secrets, global coach access enforcement is off, customer account storage is missing or unreachable, or the setup code is missing.
- The system readiness check also shows the parent email rollout gate. Initial rollout should keep `SMARTCOACH_PARENT_EMAIL_FEATURE_ENABLED` off, even if parent-email coach access is configured on an individual account.
- The system readiness check now reports one overall launch-readiness status plus launch blockers for automation secret, customer account storage, Stripe webhook signing secret, dedicated session secret, coach access enforcement, and parent-email rollout state.
- The system readiness check now includes a launch checklist with plain-language details for each automation/security requirement before initial rollout.
- `/onboarding.html` now has **Copy System Status** after Check System, so support can save launch readiness, blockers, warnings, and setup/security checklist results before sending coach invites.
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
- `/onboarding.html` setup checklist now shows ready/missing/warning badges based on the current customer account signals, including customer account record saved, subscription access, coach codes, and account configuration.
- Customer account records now store a lightweight `lastAutomationEvent` stamp and a short `automationEventHistory` list showing recent update source, event type, optional Stripe event/object IDs, and received time. `/onboarding.html` lookup displays last source/event plus recent account update history.
- `/onboarding.html` Save Account Setup now only reports "saved" when customer account storage actually returns `saved: true`; otherwise it shows the account-storage setup problem.
- `/onboarding.html` now warns before saving an incomplete Pro customer account record and names missing setup pieces such as location ID, private integration token, or coach access code.
- Added protected `account-automation-dry-run` and a **Test Setup First** button on `/onboarding.html` so internal setup can verify account access, subscription status, coach seats, coach codes, and generated setup fields without writing to customer account storage.
- Added **Check Customer Access** to the `/onboarding.html` Live Smoke Test so support can verify live account status, subscription access, account record source, and coach access-code readiness from the setup page before opening every coach page manually.
- Check Customer Access now includes direct links for Dashboard, Athletes, Training Calendar, Planning Setup, Plan Entry, Plan Builder, Meet History, Records, Track Simulator, and XC Simulator for the selected customer account.
- Check Customer Access now shows a warning state when the account is ready but the current browser/phone still needs a coach access code, so support does not confuse account readiness with device unlock.
- Added **Test Access Rules** to the `/onboarding.html` Live Smoke Test so support can verify, without saving changes, that active/trialing subscriptions allow access and blocked billing statuses block access.
- Added a live smoke-test completion summary to `/onboarding.html` so support can see whether all required live validation checks are complete before sending the coach invite; the checklist now covers core pages, advanced pages, a real saved workflow, subscription access, the activation record, and parent email staying off.
- Added **Copy Smoke Status** to `/onboarding.html` so support can paste the exact checked/missing live smoke-test items into notes during launch validation.
- Copy Smoke Status now also includes activation-record copy status, final activation-record copy status, coach invite copied status, post-launch follow-up progress, and the current next action, so the support note can cover the full launch state.
- Added a per-account launch sign-off to `/onboarding.html` so support can stamp the validation time, add a short launch note, and include that sign-off in the copied smoke-test status.
- The launch sign-off copy now clearly says it is required before copying the activation record or sending the coach invite.
- `Copy Activation Record` now also includes the live smoke-test sign-off fields, so the final customer support note records who validated launch readiness and when.
- `/onboarding.html` next-action guidance now keeps pointing support to the live smoke test or launch sign-off until both are complete, instead of saying the account is ready too early.
- The `/onboarding.html` live smoke-test checklist now persists in the browser per account key and includes a reset action, so setup progress survives refreshes without carrying over to a different customer.
- `/onboarding.html` now warns and blocks setup saves, setup previews, live access checks, and access-rule tests when the setup account key and lookup account key point to different customers.
- Added an **Activation Runbook** to `/onboarding.html` so each new customer setup has the same plain-language order: Check System, Test Setup First, Save Account Setup, add the single SMART Trak custom link, verify coach access, and complete the live smoke test.
- The Activation Runbook now includes a visible handoff status strip that follows smoke-test completion, launch sign-off, activation-record copy, coach-invite copy, and post-launch follow-up for the current account key.
- The Activation Runbook now ends with stamping launch sign-off and copying the activation record, so support has an internal handoff step before the coach invite is sent.
- The Activation Runbook now also includes a final **Send coach invite** step using Copy Coach Invite after validation and internal handoff are complete.
- The Activation Runbook now includes a post-launch **Confirm phone follow-up** step so the written activation flow matches the follow-up checklist.
- Added **Copy Activation Record** to `/onboarding.html` so support can paste a customer setup summary with account key, plan, subscription, Stripe IDs, recent account update, setup/access state, smoke-test progress, next action, customer link, status link, and coach page validation links.
- The live smoke-test checklist now describes Copy Activation Record as the support note that includes setup state, next action, customer links, coach invite status, and post-launch follow-up progress.
- Copy Activation Record now requires the live smoke validation checks to be complete and launch sign-off to be stamped; support should use Copy Smoke Status for partial launch notes.
- Copy Activation Record now treats the activation-record checklist row as the outcome of the copy action, avoiding a checklist deadlock and marking that row complete after a successful copy.
- `Copy Activation Record` now includes a coach-invite reminder so support saves the internal activation note before sending the coach-facing invite.
- Added **Copy Coach Invite** to `/onboarding.html` Customer Links so support can send a coach-facing access note with the customer link, account key, plan, and coach access-code instructions after validation is complete.
- Copy Coach Invite now refuses to copy until the live smoke-test checklist is complete and the launch sign-off is stamped, reducing the chance of inviting a coach before validation is done.
- Copy Coach Invite now also refuses to copy until Copy Activation Record has been used for the current account, keeping the internal handoff saved before the coach-facing invite is sent.
- Copy Coach Invite now saves a per-account copied timestamp in the setup browser, and later activation records show whether the invite has been copied.
- Copy Coach Invite now immediately refreshes the post-launch follow-up summary after the copied timestamp is saved, so the handoff screen updates without a refresh.
- Copy Activation Record now saves a per-account copied timestamp in the setup browser, and live smoke status plus next-action guidance show whether the internal activation note was saved before the coach invite is sent.
- Activation-record and coach-invite copied timestamps now save only after the copy action succeeds, so the handoff status does not advance on a failed clipboard action.
- Onboarding next-action guidance now advances through activation record saved, coach invite copied, and final handoff complete states so support can see the final launch step clearly.
- Added a per-account post-launch follow-up checklist to `/onboarding.html` for first coach login, first sync, and phone bulk archive; activation records now include this progress and next-action guidance points to it after the invite is copied.
- The post-launch follow-up summary now updates visually as pending or complete based on the first-login, first-sync, and phone bulk-archive checks.
- The post-launch follow-up summary now only shows complete after Copy Coach Invite has been recorded, so checked follow-up boxes cannot make the handoff look finished before the invite step.
- When post-launch follow-up is complete, the summary now shows the coach-invite copied timestamp alongside first-login, first-sync, and phone bulk-archive confirmation.
- Copied smoke-status and activation-record notes now flag when post-launch follow-up boxes are complete but Copy Coach Invite has not been recorded yet.
- After post-launch follow-up is complete, onboarding next-action guidance now reminds support to copy the final activation record before moving the account to normal monitoring.
- Copy Activation Record now titles the copied note `SMARTCoach Final Activation Record` once first coach login, first sync, and phone bulk archive are checked.
- Copy Activation Record now only treats the note as final after the coach invite has been copied and post-launch phone follow-up is complete.
- `VERCEL_SETUP.md` now describes the same final activation-record rule: coach invite copied plus post-launch phone follow-up complete.
- The activation handoff strip now uses the same final activation-record wording: coach invite copied plus first login, first sync, and phone bulk archive confirmed.
- Final activation record copies now save a separate per-account timestamp, allowing onboarding next-action guidance to move from final handoff to normal support monitoring.
- Copy Coach Invite now tells coaches where to enter the account key and coach access code on the phone app: Groups screen -> Account.
- Essential Copy Coach Invite now also tells stopwatch-only coaches where to enter the account key on the phone app.
- Copy Coach Invite no longer includes raw coach access-code values in the copied Pro invite; it tells the recipient to use their assigned code so one coach-facing note does not expose saved access codes.
- The `/onboarding.html` Activation Runbook now names the full launch blocker set: automation secret, setup code, customer account storage, Stripe webhook, coach session secret, coach access enforcement, and parent email rollout gate.
- Added `tests/automation-api.test.js` to verify setup previews do not save customer account records and duplicate Stripe webhook events do not rewrite already-handled account updates.
- Automation, Stripe webhook, and protected account lookup responses now hide private integration token and coach access-code values in returned account records, while the internal registry lookup remains available for support verification.
- Automation and setup preview responses now also redact private integration token and coach access-code values from generated environment rows, keeping setup field names visible without echoing saved secrets back in API responses.
- Onboarding setup rows now display redacted environment values as `Saved value hidden` and copy a value note instead of copying `__hidden__`, reducing the chance support pastes a redaction marker into Vercel.
- `VERCEL_SETUP.md` now documents that `Saved value hidden` and `__hidden__` are redaction markers, not values to paste, unless support is intentionally rotating a secret.
- The copied GHL workflow payload on `/onboarding.html` now includes subscription/account fields only and leaves SMART Trak private tokens and coach access codes out of the automation example.
- The onboarding payload card now labels that example as `GHL Subscription Payload` and states that setup secrets and coach codes are intentionally not included.
- `VERCEL_SETUP.md` recommended GHL automation example now excludes setup-only fields such as `locationId`, keeping the docs aligned with the subscription-only workflow payload.
- `VERCEL_SETUP.md` now explicitly says coach access codes belong in **Save Account Setup**, not the recurring GHL subscription payload.
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

- Initial meets-only field event tracking is implemented across SMARTCoach Pro Mobile App and SMART Trak.
- Supported event targets: high jump, long jump, triple jump, pole vault, shot put, discus, javelin, and hammer, with possible later expansion for indoor weight throw, turbo jav, and multi-event support.
- Keep field events in meet-result workflows first, not daily training workouts:
  - SMARTCoach Pro Mobile App Meet section
  - SMART Trak Log Race/Meet Result
  - Meet History
  - Athlete detail modal
  - Records
  - Track Simulator
- Field result type exists alongside Race and Relay. Field result forms capture athlete, event, mark, attempts, notes, optional wind, and optional video URL.
- Start video support as a URL field rather than file upload. Coaches can link Hudl, YouTube unlisted, Google Drive, iCloud, or similar services before SMARTCoach owns file storage.
- Attempt tracking:
  - SMARTCoach Pro Mobile App meet groups can capture legal/foul/pass attempts during the event.
  - High jump and pole vault can later use height rows with make/miss/pass sequences such as O, XO, XXO, XXX.
- Meet History columns can remain mostly the same. Field rows show the mark in Result and open a detail modal with event, mark, attempts, wind, notes, video link, meet, and date.
- Records support must compare field marks as higher/farther is better, while running events still use lower time is better.
- Normalize field marks internally for comparison while preserving the coach's display text. Support feet-inches like `18-04.5`, text feet/inches like `18' 4.5"`, metric like `5.60m`, and throwing marks.
- Recommended build order:
  1. Add field events to all event dropdowns.
  2. Add Field result type to desktop Log Race/Meet Result.
  3. Save field marks into Meet History.
  4. Add field result detail/edit modal support.
  5. Add Records comparison logic for field marks.
  6. Add mobile Meet section field-event logging.
  7. Add video URL.
  8. Add structured attempts.
  9. Add Track Simulator field-event support.

Hooked runner / nested timing groups:

- Implemented in the SMARTCoach Pro Mobile App timing rows.
- Allows coaches to temporarily hook/nest runners inside one workout group during active timing so one Start/End Rep/Rest action controls several athletes who are currently running together.
- Use case: a 10-runner group starts 8 reps together. After rep 3, the pack splits into subgroups such as 5, 2, 2, and 1. Coaches should be able to control each subgroup with one tap while still syncing individual athlete results normally.
- Proposed mobile interaction:
  - Coach drags runners into the desired order.
  - Coach slides a runner row to reveal hook color choices instead of slide-to-delete.
  - Available hook colors: blue, red, yellow, green, black.
  - Assign the same color to runners who should be controlled together.
  - Hooked runners show a clear outline/accent in the assigned color.
  - Tapping Start/End Rep/Rest on any runner in a hook controls every runner in that hook.
  - Unhooked runners continue to work exactly as they do now.
- Hooking must be available before and during the workout. It should not require stopping the workout.
- Hooking must also support live changes while a rep/rest is actively running, because packs often split mid-rep. Example: during a 1-mile interval, runners 1-5 start hooked; on lap 3 runners 1-3 pull away while runners 4 and 5 separate. The coach should be able to keep 1-3 hooked for the shared finish while unhooking 4 and 5 so each can receive an individual finish time for that same rep.
- Hooks should be treated as a live control-group state for the next timing action, not as a permanent athlete grouping. Coaches may reset hooks between reps as fatigue changes the pack, such as 1-3 hooked, 4 unhooked, 5 unhooked, 6-7 hooked, 8-9 hooked, and 10 unhooked.
- Mid-rep hook edits should not rewrite already-recorded split/lap history. They should only determine which runners receive the next Start, End Rep, Lap, or Rest action after the hook change.
- Sync should remain normal: each athlete keeps individual saved reps/rests, but shared hook actions stamp matching times to every runner in the hook.
- Important UX safeguards:
  - Include a visible Unhook action.
  - Allow active timing hook changes, but make the active hook state very visible so the coach knows which athletes will receive the next timing action.
  - Make colors colorblind-friendly with labels or patterns, not color alone.
  - Consider a quick `Hook Mode` toggle so normal row interactions stay simple.

Relays:

- Implemented across SMARTCoach Pro Mobile App and SMART Trak.
- One relay entry can be timed with four runners attached.
- Each split is tied to the runner/leg.
- All four runners attach to the final relay time.

Cross country competition simulator:

- Implemented as `/xc-simulator.html`.
- Enter/copy top seven athletes and times for multiple teams.
- Score top five with sixth/seventh as displacers.
- Keep running weekly competitor lists to see team ranking over time.
- Future enhancement: improve copy/paste from common result websites.

Track simulator:

- Implemented as `/track-simulator.html`.
- Compares hypothetical track meet outcomes by event, athlete, team, and projected points.
- Supports saved competitor fields/entries so coaches can update week to week.
- Uses SMART Trak season bests for the coach's team where possible.

Help assistant:

- Future idea: SMARTCoach Pro help button for instructions, subscription questions, and how-to guidance.

Athlete training calendar:

- Initial implementation added as `/athlete-calendar.html`.
- Athletes can view assigned training, then mark each workout as completed, adjusted, or skipped.
- Athlete actions should update the coach-facing SMART Trak Training Calendar.
- Athlete access uses a unique athlete link/code generated from the Athletes page.
- Current scope: athletes can view workouts assigned directly to them or to one of their training groups, then submit Complete, Modify, or Skip.
- Submitted updates save into SMART Trak as athlete-submitted completed workout records; skipped submissions require notes and modified submissions can include actual volume/time.
- Future enhancement: add richer coach calendar summary counts and optional coach approval.

## Remaining Launch Parked Items

These are intentionally not blocking the current launch path unless the user re-prioritizes them. This section is a planning list only; do not implement these ideas during launch cleanup unless the user explicitly asks for that item next.

- Records page deeper historical record retention after refresh is parked; faster-current checks exist.
- Meet-result corrections update linked Records entries, but full Athlete Best recalculation after corrections is parked.
- Parent email tools stay unreleased for initial rollout.
- Deeper import workflows for race results, school records, training history, and plans remain future work.
- Plan Builder full-plan review/spreadsheet-style adjustment remains future work.
- SMARTCoach Pro help button/assistant remains future work for instructions, subscription questions, and how-to guidance.
- Athlete-facing training calendar initial portal is implemented; future work is richer coach calendar response summaries, optional approval, and athlete access management controls.
- Field-event tracking initial support is implemented; future work is deeper vertical-jump height progression, place/scoring, and richer field-event analytics.

## Recent Launch Cleanup Log

Completed or intentionally narrowed items from the launch cleanup pass:

1. Manual calendar builder is aligned for distance runners: Add Activity opens Easy Run, Quality Session, Race, and Rest/Day Off choices; Race keeps Planned Volume and Target fields visible; Quality uses the set builder/summary; Easy supports distance plus optional strides.
2. App plan selection now waits for plan workout days to load before **Use Selected Plan** can apply, and it refuses to assign a plan without a selected/upcoming workout day. This prevents sync from using a stale or plan-name-only workout context.
3. Phone app now gates calendar meet/race imports behind loaded active plan and active meet lists, skips days tied to archived plans, and skips days linked to archived meets.
4. Dashboard race result entry now updates the visible dashboard immediately after the server save succeeds; calendar, records, meet manager, manual mileage, edits, and voids already update local rows after successful saves.
5. Clean Records page later if current history limitation becomes painful.
6. Latest smoke check passed across phone app, dashboard, athletes, calendar, planning, meet history, records, XC simulator, onboarding, API files, and account/security regression tests. Next full-flow pass should use a live test Pro account in Vercel/GHL and include launch security values, Clear Generated Secrets, parent email off, all coach pages, stopwatch sync, subscription automation, and Copy Activation Record.
7. Onboarding/support setup refreshes immediately when location ID, private token presence, coach access codes, subscription fields, parent-email access, logo, or plan/seat values change; the private token still stays out of copied notes and records.
8. Copy Activation Record now requires a fresh system readiness check that says Ready for initial rollout, so activation cannot be recorded while security, customer account storage, Stripe webhook, coach session, coach access, or parent-email launch blockers remain.
9. Copy Coach Invite now uses the same system readiness gate, preventing coach invites from being sent if launch settings changed after activation.
10. Activation handoff status now shows the system readiness requirement directly and refreshes when Check System starts, succeeds, or fails.
11. Copy Smoke Status now includes system readiness, so partial or final smoke notes capture whether launch security was checked and ready.
12. Changing the setup or lookup account key now clears the prior system readiness result, forcing a fresh Check System for the active customer before activation or coach invite copy.
13. Critical setup edits now clear copied activation/invite/follow-up state, including generated coach-code changes and accounts loaded through Load Into Form, so support has to recopy handoff notes after access or subscription details change.
14. When copied activation state is cleared, the live smoke checklist's activation-record row is also unchecked so the visible checklist matches the saved handoff state.
15. Activation record and coach invite copy now also require customer-account readiness: account key, saved customer account record, allowed subscription, SMART Trak connection fields, coach access codes, and configured account status.
16. Setup previews no longer count as a saved customer account record for activation/coach-invite handoff; Save Account Setup and lookup confirmation are required.
17. Critical setup edits now mark the account as having unsaved setup changes, blocking activation/coach-invite copy until Save Account Setup runs again.
18. Setup preview results now keep the unsaved setup marker visible through lookup/setup rendering, while saved account results clear it as the new baseline.
19. Unsaved setup changes now appear in Next Action, the readiness banner, and the setup checklist so support sees Save Account Setup as the required next step.
20. Setup preview lookup/setup panels now label themselves as previews instead of saved customer account records.
21. Default activation handoff and smoke-checklist copy now names system readiness and saved customer setup before Copy Activation Record.
22. Account lookup now distinguishes saved, preview, and not-found customer account states in the panel title.
23. Athletes parent-email action buttons are hidden in the raw page markup as well as runtime gating, preventing any first-render flash during the initial rollout.
24. Athletes parent-contact info tips now say contact details are stored with the roster and parent messaging stays off until that feature is intentionally released.
25. XC Simulator now has its own coach access-code prompt, so coaches can unlock season-best loading there instead of being sent back to Dashboard first.
26. Planning Setup and Plan Builder now also have direct coach access-code prompts, keeping Pro setup pages consistent with the other SMART Trak pages.
27. Planning Setup and Plan Builder access prompts now submit with the Enter key, matching the rest of the coach pages.
28. Planning Setup validation now says plan end date instead of peak date, keeping the page copy aligned with the current field label.
29. Stopwatch settings fallback files now label the editable name as Group Name instead of Workout Name, matching the current app settings screen.
30. Stopwatch settings fallback files now also use the current Splits on Detail Line and Beep/Vibrate on All Button Taps labels.
31. Onboarding live smoke validation now splits stopwatch sync, standalone race result, and XC Simulator scoring into separate required launch checks, matching the Vercel setup guide.
32. Phone bulk archive is documented as implemented for Training and Meet groups, with only live phone smoke testing remaining.
33. Manage Meets instant UI update warning was cleared; save, archive/restore, and delete now update the visible manager list after confirmed saves.
34. Archived training plans and archived meets are documented as filtered out of phone app selectors.
35. Meet season note now reflects the current month mapping and says saved meet seasons are trusted when already stored.
36. Meet History pending notes were narrowed: event/gender ranking and first-ever PB/SB behavior are implemented; meet-result corrections update linked Records entries, while full Athlete Best recalculation after corrections remains parked.
37. Records page parked notes were narrowed: faster-current checks exist, while deeper historical record retention after refresh remains parked.
38. Onboarding post-launch follow-up now includes phone bulk archive alongside first coach login and first sync.
39. Vercel launch validation checklist now has an explicit post-launch phone follow-up bullet before final activation record copy.
40. Vercel deploy order now continues past the first activation record through Copy Coach Invite, post-launch phone follow-up, final activation record, and normal support monitoring.
41. README now points new operators to the same `/onboarding.html` launch path before calling a customer account done.
42. README now includes `npm test` as the top-level verification command before pushing changes.
43. `VERCEL_SETUP.md` now leads with the customer-account-storage launch model and treats account-specific Vercel variables as default-account/migration fallback.
44. `VERCEL_SETUP.md` customer account setup now says new customer values should be saved through `/onboarding.html`, with account-specific Vercel names documented as fallback references.
45. `VERCEL_SETUP.md` now plainly separates the recurring GHL Subscription Payload from one-time/private setup values: billing and access fields can be automated, while location ID, private token, setup code, session secret, automation secret, and coach codes stay in protected setup.
46. Onboarding activation runbook now says to save the handoff before sending the coach invite instead of "turning on coach access," keeping support wording aligned with subscription and coach-code gates.
47. `VERCEL_SETUP.md` live smoke wording now says validation should be complete before the coach invite is sent, avoiding the impression that access is manually turned on outside the subscription/setup gates.
48. Onboarding and setup docs now use "send the coach invite" instead of "turn on" language, matching the actual gated access model.
49. Copy Coach Invite now gives Pro coaches a simple first-use path: start on Dashboard, manage roster in Athletes, and use Training Calendar for daily work.
50. Copy Activation Record now labels the copied activation record as an internal support note only, so the coach-facing invite stays separate from setup/support details.
51. Copied post-launch follow-up text now says when the coach invite was copied and when the account is ready for the final activation record.
52. Test Access Rules now checks every blocked launch subscription state shown in onboarding: past due, paused, unpaid, canceled, incomplete, and incomplete expired.
53. Account setup save and setup preview status messages now distinguish subscription-blocked access from incomplete setup, so support sees billing/status blockers separately from missing token/location/coach-code setup.
54. Check Customer Access status messages now distinguish a fully unlocked device from an account that is ready but still needs the coach code entered on that browser or phone.
55. Account lookup only shows **Load Into Form** for saved customer account records or setup previews, preventing support from loading an empty not-found account record into setup.
56. README now points operators to **Remaining Launch Parked Items** in this project state file so future work is not mistaken for launch blockers.
57. Remaining Launch Parked Items previously included Track Simulator and the SMARTCoach Pro help button/assistant, so the canonical parked list matched the then-current future-work list.
58. Onboarding live-smoke checklist now says blocked billing statuses should block SMART Trak, matching the broader Test Access Rules coverage instead of naming only three statuses.
59. Test Access Rules progress text and project-state wording now use the same broad blocked-billing language as the actual access-rule coverage.
60. Onboarding system and customer-access results now label registry state as customer account storage/account record so support sees the launch meaning instead of internal storage jargon.
61. Onboarding and setup docs now use **Save Account Setup** for the customer-account save action, while internal code names still use registry terms where appropriate.
62. `VERCEL_SETUP.md` now uses customer account storage/account record wording throughout the active launch guide while keeping endpoint and variable names unchanged.
63. Onboarding account-storage copy/status messages now say account storage/account changes instead of registry URL/token/prefix or registry changes.
64. The Launch Security Values parent-email row now displays as a hold note rather than a Vercel setup field, and the everyday onboarding UI no longer shows the parent-email feature flag name during initial rollout.
65. Parent-email launch hold copy now uses plain support language: keep parent email tools off for initial rollout.
66. Onboarding setup-needed and checklist wording now points support to Save Account Setup for normal customer setup instead of implying every customer change needs Vercel variables and a redeploy.
67. Onboarding setup preview labels now distinguish normal customer activation from fallback Vercel variables, so support sees Save Account Setup as the main path.
68. Activation handoff wording now says Copy Coach Invite only after validation and the internal activation record are saved, making the coach-facing invite sequence explicit.
69. Onboarding subscription checklist wording now separates billing-allowed account access from browser/phone coach-code unlock.
70. Onboarding lookup, live-smoke, access-rule, and activation-record labels now say account access/account allowed instead of plain access/allowed, reducing confusion with device unlock.
71. Onboarding page subtitle now describes the current launch job: save customer setup, validate readiness, and copy coach-facing links.
72. Onboarding checklist status labels now say save needed/fallback deploy only instead of manual setup/redeploy after vars, keeping account storage as the normal launch path.
73. `VERCEL_SETUP.md` now uses **Save Account Setup** instead of "manual account setup flow" for coach codes, private tokens, and protected setup values.
74. Onboarding system readiness and copied system status now label saved account updates as **Save Account Setup** instead of manual account updates.
75. `VERCEL_SETUP.md` now uses customer account record / **Save Account Setup** wording in remaining active setup and optional Stripe webhook sections.
76. Onboarding now labels the GHL/Stripe payload panel as **Subscription Update Payloads** and **Subscription Update Endpoints**, making its purpose clearer while preserving copy-ready endpoint details.
77. Copied activation records now say last account update source/event instead of last automation source/event.
78. Onboarding account lookup now labels the update history section **Recent Account Updates** instead of Recent Automation.
79. Onboarding account lookup now uses **Load Into Form**, **Customer setup preview**, and clearer last-update labels so support can understand saved or previewed account details without internal wording.
80. Onboarding system and setup preview wording now uses **Launch System**, **Preview**, and recent account update language instead of dry-run/automation-history wording in the support-facing flow.
81. Live smoke-test account cards now say **Account Source** instead of **Record Source**, so support can tell where the customer account was loaded from.
82. Live smoke-test checklist now says **Customer setup preview passes** instead of dry-run wording.
83. `VERCEL_SETUP.md` launch validation now explicitly checks **Test Setup First** before Save Account Setup and says GHL updates should appear as recent account updates.
84. Project state now shows `main` as the active branch, uses `git push origin main:main`, and states that the next launch-readiness step is live validation with a real Pro test account.
85. Added `LIVE_LAUNCH_VALIDATION.md` as a short operator checklist for the real Pro test account pass before initial rollout.
86. Live launch validation checklist now includes adding/verifying the SMART Trak custom link and reopening the account after the GHL Subscription Payload update.
87. Live launch validation checklist now includes a fill-in validation record and final rollout decision fields.
88. Live launch validation checklist now includes an issue log for blockers, owners, status, and retest notes found during the real Pro test pass.
89. Live launch validation checklist now includes stop/go rules and a retest rule for any code, setup, GHL workflow, or Vercel environment change.
90. Live launch validation checklist now starts with prerequisites for latest Vercel deploy, custom domain, customer account storage, launch security values, parent email off, GHL Subscription Payload, and a real Pro test account.
91. Live launch validation checklist now includes first-week monitoring checks for custom-link return, coach-code unlock, first sync, first race result, subscription updates, blocked billing, parent email off, and support issue logging.
92. `VERCEL_SETUP.md` launch validation now points operators to `LIVE_LAUNCH_VALIDATION.md` for the shorter recordable live-pass checklist.
93. GitHub Actions regression workflow now triggers on `main` pushes and `main` pull requests only, matching the current deployment branch.
94. Launch docs and workflow references have been checked for stale branch/setup wording; remaining launch-readiness work is the live Pro test account validation, not more cleanup.
95. Onboarding live smoke tools now include a direct live-validation link, so support can open the recordable live Pro test checklist from the setup page.
96. Added `live-launch-validation.html` as a support-facing live validation page and pointed onboarding to it, while keeping `LIVE_LAUNCH_VALIDATION.md` as the markdown source.
97. Live launch validation page now saves checklist progress, validation record fields, and issue-log fields locally in the browser, with Print and Reset controls for the live pass.
98. Live launch validation page now includes first-week monitoring and retest-rule sections, matching the markdown checklist source on the support-facing page.
99. Live launch validation page now has Copy Summary, giving support a paste-ready note with validation record fields, checklist progress, and issue-log entries.
100. README and current project status now point operators to `/live-launch-validation.html` as the primary support-facing live Pro validation checklist, with `LIVE_LAUNCH_VALIDATION.md` kept as the source/reference.
101. Onboarding now opens `/live-launch-validation.html` with the active account key, and the validation page saves checklist progress separately per account key.
102. Live validation page now sends **Open Setup** back to `/onboarding.html` with the same account key, keeping support on the same customer record while moving between setup and validation.
103. Live validation page now displays the active account scope above the validation record so support can confirm the checklist belongs to the customer being tested.
104. `VERCEL_SETUP.md` now documents the account-scoped `/live-launch-validation.html?account=<account-key>` flow, including Copy Summary and returning to onboarding for the same customer.
105. Current launch-readiness estimate is now recorded as 90-95% complete, with the remaining 5-10% identified as live Pro test account validation rather than more cleanup.
106. Live validation page now includes account-scoped quick links for Dashboard and Account Status so support can jump directly to the customer being validated.
107. `VERCEL_SETUP.md` now also mentions the live validation page's account-scoped Dashboard and Account Status quick links.
108. Live validation page now includes an account-scoped Stopwatch quick link, and `VERCEL_SETUP.md` names it alongside Dashboard and Account Status.
109. Live validation page now includes **Copy Validation Link** for saving or reopening the account-scoped checklist URL, and `VERCEL_SETUP.md` documents it.
110. Live validation page now includes account-scoped Coach Page Links for Dashboard, Athletes, Training Calendar, Planning Setup, Plan Entry, Plan Builder, Meet History, Records, Track Simulator, and XC Simulator.
111. Live validation Copy Summary now includes the account-scoped validation link, setup link, stopwatch link, dashboard/status links, and coach-page validation links.
112. Regression tests now verify the live validation page keeps its required account-scoped support actions and coach-page validation links.
113. `LIVE_LAUNCH_VALIDATION.md` now points operators to the account-scoped HTML validation page and starts setup from the same account-specific flow.
114. Launch cleanup is now explicitly paused unless the live Pro validation pass exposes a blocker; the next practical work should be production validation, not more prep polishing.
115. Production retest on 2026-05-26 confirmed the Vercel function-limit fix is live: the old `/api/ghl/sync-diagnostics` route returns 404, the unified `/api/smart-trak/sync-diagnostics` route exists and requires coach access, the live validation page loads, the real Pro test account record is active/configured from registry storage, parent email tools are off, and current Training Calendar / Upload-Paste wording is deployed. Remaining validation requires the assigned coach code for live SMART Trak page/API workflows.
116. User live retest found three blockers: Manage Meets races did not appear on Training Calendar, same-event boys/girls records could collapse after reload, and Athletes group assignment did not remain visible immediately after save. Local fixes are in place for all three and should be deployed/retested.
117. Phone app meet-result save now replaces the Event text/prompt flow with a race dropdown and includes the selected event in meet-result sync payloads.
118. Added `SMART_TRAK_COACH_HOW_TO.md` as a coach tutorial for each SMART Trak page, the main popup tools, and the phone app workflows.
119. Cleaned the coach how-to guide so it uses coach-ready language and does not mention GHL or "coach-facing".
120. Records reload issue retested by user with Boy 400m plus Boy 800m: only one record remained after refresh. Backend Records listing now combines search and direct GHL list endpoints, dedupes by full record identity instead of a weak fallback, and includes gender in manual source IDs.
121. User retested by adding three more records; the newest records stayed but earlier records disappeared after refresh. Records page now stores account-scoped saved records in browser storage and merges them with server records on reload, including cache updates for single save, bulk save, edit, and delete.
122. User retested again and still only saw the last saved record after refresh. Records page now renders individual record rows instead of collapsing records into board groups, and Records Tools gender choices are now only Boys and Girls.
123. Records edit modal opened blank because row actions depended on `recordId`, which can be missing or mismatched for cached/merged rows. Edit/delete actions now use the row identity key and fall back to removing local-only rows from the view.
124. Records page cleanup: removed the History column and unused expansion/history helpers after switching the page to direct record rows.
125. SMART Trak event lists now include 100m, 100H, 110H, 200m, 300m, 300H, and 400H wherever the app presents race/event options, including Records, Dashboard meet tools, Training Calendar race results, plan setup/builder/import, phone meet setup/save/sync pickers, and backend plan option/distance mapping.
126. Training Calendar now opens the same day detail modal for meets created from Manage Meets as it does for calendar-created meet days. Editing, quick status changes, and Remove from Calendar on those Manage Meets cards save back to the saved meet record.
127. Records edit no longer leaves a duplicate pre-edit row in the browser cache. Record merging now dedupes by saved record id/source id before falling back to the full row identity, and edit save replaces the original row plus any stale cached copy.
128. Meet History layout now uses a narrower Meets column and a slightly more compact Results table so the Results section fits better on desktop without horizontal scrolling.
129. Meet History now shows an info marker beside Meets to explain that selecting a meet filters the Results panel and compare rows compare the same meet across dates.
130. Added `/track-simulator.html`, a Track Meet Simulator similar to XC Simulator. It supports manual/pasted entries, SMART Trak season-best loading, saved competitor fields, configurable scoring tables, optional max scorers per team per event, team scores, event results, and copyable output. Dashboard, Meet History, XC Simulator, onboarding coach links, live validation links, README, Vercel setup, and regression tests now include Track Simulator.
131. Track Simulator now supports excluding multiple events from scoring and SMART Trak season-best loading, plus a Template CSV download that respects the current event filter and excluded events.
132. Records backend listing now keeps paging through GHL custom-object results until an empty or duplicate page instead of stopping after the first short batch, and it recognizes more record ID response shapes. This is meant to prevent the Records page from showing only the newest saved record when GHL caps or reshapes list responses.
133. Records now mirrors records saved through the Records page into the durable account registry and merges that server-side mirror on load. This is a stronger fallback for the live issue where GHL returns only the latest Records custom-object row after refresh.
134. Records mirror was changed from rewriting one shared account-record array to per-record registry keys plus an index. This prevents quick sequential saves from overwriting the mirror with only the latest saved record.
135. Records mirror now also scans per-record registry keys in case the index set is missing, and Records API/page responses surface mirror diagnostics so the live page can report whether GHL count, mirror count, or registry status is the blocker.
136. Records row loading, current/historical status correction, and saved-source display were live retested and confirmed fixed by the user.
137. Training Calendar now supports dragging workouts and meets to another day.
138. Meet History info bubble was adjusted to match the app's white bubble style and overlay above the list without pushing content.
139. Mobile meet timing now supports relays inside the meet > race flow, with four active-athlete leg selectors, Start/Lap/Finish Relay timing, and relay result sync to SMART Trak.
140. SMART Trak Log Race Result and relay edit flows support relay type, relay events, relay team, runner names, splits, total time, meet, and date.
141. Relay events are included everywhere event dropdowns are used, including the mobile app, Dashboard, Training Calendar, Records, Track Simulator, and plan tools.
142. Added `/weather.html`, a live Weather page with saved locations, current conditions, hourly forecast, daily forecast, Dashboard/Training Calendar buttons, and improved `city, state` searches.
143. Updated `SMART_TRAK_COACH_HOW_TO.md` so the coach guide stays current with Weather, Track Simulator, relay support, mobile relay timing, Records, Meet History, and Training Calendar updates.
144. Updated the how-to guide naming from Phone App/phone app to SMARTCoach Pro Mobile App for consistent product language.
145. Renamed the how-to guide title to SMARTCoach Pro & SMART Trak How To Guide.
146. Cleaned the future-planning list so completed relay support and XC Simulator work are no longer presented as unfinished future items.
147. Added initial Athlete Calendar portal at `/athlete-calendar.html`, plus `/api/smart-trak/athlete-calendar` inside the unified SMART Trak API route. Coaches can copy a unique athlete link from Athletes; athletes can view assigned workouts and submit Complete, Modify, or Skip without a coach access code. The handler lives in `lib/athlete-calendar.js` so the deployment stays within the Vercel Hobby serverless-function limit. Calendar link generation was moved onto the existing `/api/smart-trak/athletes?action=calendarLink` path after the new athlete-calendar route returned Vercel plain server-error text during live link creation.
148. Training Calendar Week View now has Previous Week and Next Week controls so coaches can schedule future weeks directly from the calendar grid.
149. Training Calendar day updates now retry without rejected option fields when GHL rejects a saved option value, fixing remove/status updates for saved Easy/Recovery Run days. Calendar items can also be copied from the day modal and pasted onto another date.
150. Training Calendar copy/paste is now surfaced directly on the week calendar: each workout/meet card has a copy button, and each day header has a visible Paste button so coaches do not have to open the Add menu to paste.
151. Add Easy Run now defaults the Distance field to a real value of 5 mi instead of showing 5 as a placeholder, preventing blank planned volume when coaches leave the default visible value unchanged.
152. Athlete Calendar access now uses the same active-athlete rule as the coach Athletes page: athletes with a SMARTCoach athlete id or `smartcoach-athlete` tag are accepted unless explicitly inactive. The athlete-calendar loader also reads contact and custom object field values more defensively when GHL returns object-shaped field values.
153. Athlete Calendar now merges duplicate visible cards for the same athlete/date/title/group, keeping the richer scheduled workout details while showing the submitted status. Athlete submissions also include the original training-plan day id/source id so future complete/skip updates can update the linked calendar day status instead of appearing as a duplicate day.
154. Athlete Calendar submissions now send `Track` as the sync surface instead of `Unspecified`, preventing GHL from rejecting completed athlete updates when the Surface field only allows saved surface options.
155. Athlete Calendar cards now show a clear submitted indicator after a workout is Completed, Modified, or Skipped, including a tinted card state and selected action button so athletes can tell what they already submitted.
156. Athlete Calendar now marks a card locally immediately after a successful submission, so athletes see the submitted state even if GHL calendar status takes time to reflect the update. Athlete notes are also carried into the linked Training Calendar day coach notes as `Athlete note: ...`, while still syncing into the performance/training note.
157. Athlete Calendar submitted states now use stronger, consistent card colors and status-pill colors for Completed, Modified, and Skipped, with the indicator wording changed to `Athlete submitted: ...`.
158. How To guide updated with Athlete Calendar submitted-card indicators and where coaches can read athlete notes.
159. Added the GHL Conversation AI SMARTCoach Help widget through `/assets/smartcoach-help-widget.js`, loading widget id `6a1785dc1b5a98ef9df8eae9` across SMARTCoach HTML pages. The How To guide now includes SMARTCoach Help usage examples and notes that billing questions are outside the help scope.
160. SMARTCoach Help widget loader now forces GHL chat-widget layers above the full-screen mobile app screens so the help icon remains visible after the splash screen.
161. Removed the SMARTCoach Help widget from the SMARTCoach Pro Mobile App pages (`app.html` and `SMARTCoach.html`) because the GHL chat window is too large for the mobile timing workflow. The widget remains on desktop SMART Trak pages.
162. Added live hook timing controls to the SMARTCoach Pro Mobile App. Coaches can swipe a runner row to assign blue/red/yellow/green/black hooks, clear hooks, and use Start/Stop/Lap/End Rep/End Rest on any hooked runner to apply the same timing action and timestamp to the whole hooked pack. Hook state can change while timers are running and does not rewrite already-recorded splits.
163. Removed the SMARTCoach Help widget from the main SMARTCoach Pro Mobile App entry page (`index.html`) so the chat bubble no longer appears on the mobile splash screen. The help widget remains on desktop SMART Trak pages.
164. Training Calendar Add Calendar Day language now uses `Plan Source` with `Manual calendar entry` instead of `Add To Plan` / `Standalone calendar activity`, clarifying that coaches can manually enter their real weekly plan without attaching it to an uploaded, pasted, or auto-built saved plan.
165. Training Calendar Easy Run add modal now hides Planned Volume and Effort/Type because distance and the Easy Run tab already define those values. Easy days still save `Easy/Recovery Run` and derive planned volume from the distance field.
166. Training Calendar Race add modal now hides Effort/Type and Target because race days save those defaults internally. Planned Volume is hidden for Track races and shown for Cross Country races, where distance such as 2 mile or 5K is useful.
167. Training Calendar Rest / Day Off add modal now hides Effort/Type, Planned Volume, Target, and Details while still saving the off-day defaults internally.
168. SaaS plan enforcement started: shared plan definitions now cover Essential, Pro 25, Pro 100, and Pro 200 with the latest prices; onboarding exposes those tiers; Essential now requires an active code and one active device session; Pro athlete creation/reactivation is capped by active-athlete plan limit; the how-to guide documents the plan/pricing/limit rules.
169. Coach-code reset guard added: changing saved coach access codes through account setup is limited to 2 changes per month per account, with reset history stored on the account record. Saved code changes also increment a coach-code session version so old signed Pro sessions no longer unlock access. Generate Coach Codes now warns that saving changed codes counts toward the monthly reset limit.
170. Dashboard now has a coach-facing **Change Code** button. A coach can enter the current code plus a new code to replace only their own code, keep other coach codes intact, consume one monthly reset, get a fresh session, and invalidate older signed sessions.
171. Onboarding now has a **Subscriber Accounts** support list. It scans saved account registry records, shows account key, plan, subscription, coach-code count, setup readiness, and update time without exposing secrets. Support can search, load an account into setup, copy the account key, or open SMART Trak for that subscriber.
172. Field event support started for meet results. Dashboard Log Race Result, Training Calendar Log Race Result, and the SMARTCoach Pro Mobile App Save Meet Results modal now support **Field Event** results for High Jump, Long Jump, Triple Jump, Pole Vault, Shot Put, Discus, Javelin, and Hammer. Field results attach to an athlete, meet, and date, save official mark, attempts, video link, wind, and notes through the existing meet-result sync route, and Dashboard field rows can be opened for mark/attempt/video detail and edited later. Field events were also added to Records, Track Simulator, and plan event dropdowns.
173. Added live field-event capture inside SMARTCoach Pro Mobile App meet groups. The bottom tray now changes unused Sort/Sum actions to **Field** and **Results** during meets. **Field** opens the field-event workflow for recording attempts during the event, then **Results** saves queued field results to SMART Trak through the existing meet-result route and marks them saved locally.
174. Updated SMARTCoach Pro Mobile App live field-event capture from single-athlete entry to a field-event workflow inspired by the training group layout. Coaches tap **Field**, add field events such as Long Jump, open an event flight, add multiple athletes, tap **Attempt** on each athlete row, use **i** to review/delete attempts, and use **Save Flight Results** to queue the whole flight. Horizontal jumps and throws support distance/legal/foul/pass plus best mark display; vertical jumps support height with Make/Miss/Pass. Live mobile field capture no longer asks for video links.
175. Refined the SMARTCoach Pro Mobile App field-event flight screen. Save Flight Results moved to the top, the athlete list scrolls for larger flights, athlete rows now show labeled Last and Best values side by side, the **i** button sits next to Attempt, attempt/wind inputs request a decimal keyboard, and the attempt detail page can edit/correct or delete attempts.
176. Tightened the SMARTCoach Pro Mobile App field-event flight layout again: top Save is now a compact header-style button, athlete row controls stay on one line, delete uses the standard red circle button, Best recalculates from captured legal/made attempts, vertical jumps use **O/X/P**, and the attempts detail page groups vertical jumps by height, such as `5-6 X X O`.
177. Adjusted SMARTCoach Pro Mobile App vertical jump capture so High Jump and Pole Vault rows show **Current** height and **Attempt** pattern instead of Last/Best. The attempt modal now has explicit **-** and **.** mark-entry buttons for phone keyboards, and editing an attempt opens a clear **Save Correction** state.
178. Reworked SMARTCoach Pro Mobile App field attempt entry again so the attempt modal uses a built-in mark pad with numbers, **-**, **.**, Del, and Clear instead of relying on the phone keyboard. Attempt edit/delete actions now carry the exact athlete key into the correction flow so editing does not drift back to a blank add-attempt state.

## Known Good Test Flow

Use this as the current launch regression test:

1. In `onboarding.html`, run Check System and confirm it says Ready for initial rollout.
2. For a live Pro test account, run Test Setup First, then Save Account Setup.
3. Lookup the account and confirm the customer account record is saved with subscription, coach seats, SMART Trak connection, and coach access-code readiness.
4. Check Customer Access and confirm account access, account source, SMART Trak connection, and device/coach-code status.
5. Open Dashboard, Athletes, Training Calendar, Athlete Setup, Upload/Paste Plan, Auto Build Plan, Meet History, Records, Track Simulator, XC Simulator, and Weather with the customer account key.
6. Confirm pages that need a coach code show their own access prompt and unlock after the assigned code.
7. Create/activate athletes in SMART Trak and confirm app athlete dropdowns show only active athletes.
8. Create or import a plan, build a training group, assign the plan to a group or selected athletes, and confirm the Training Calendar shows the plan days.
9. Open the phone app with the customer account key, choose group/plan, select an upcoming workout, time a rep/rest workout, and sync.
10. Confirm Dashboard volume, completed workout details, splits, athlete latest training, and Training Calendar status update after sync.
11. Log one standalone race result and confirm Dashboard, Meet History, and athlete bests update.
12. Log one relay result from SMART Trak and one relay result from mobile meet timing; confirm relay detail/edit support shows relay type, total time, runners, and splits.
13. Add one field event result from Dashboard Log Race Result and one from the SMARTCoach Pro Mobile App Field flow. Confirm Dashboard and Meet History show the field mark, and Dashboard detail/edit shows attempts.
14. Add multiple Records rows for the same event/gender with different marks and confirm only the best stays current after refresh.
15. Load My Season Bests in Track Simulator and My Season Best in XC Simulator, load saved fields, and score both simulated meets.
16. Search Weather by city and city/state, save a location, refresh, and confirm current/hourly/daily forecast cards render.
17. Trigger the GHL Subscription Payload once and confirm account lookup shows the recent account update without exposing private tokens or coach access codes.
18. Confirm parent email controls remain hidden/off for initial rollout.
19. Complete live smoke-test checks, stamp launch sign-off, copy the activation record, copy the coach invite, and complete the post-launch first-login/first-sync/bulk-archive follow-up.

## Notes For Future Codex Sessions

- Read this file first.
- Then inspect the relevant page/backend only for the task at hand.
- Do not rework the whole app unless asked.
- Keep changes scoped.
- Use `rg` for searches.
- Use `apply_patch` for edits.
- Ignore unrelated dirty files unless they affect the current task.
- After frontend edits, provide the user direct confirmation steps.
