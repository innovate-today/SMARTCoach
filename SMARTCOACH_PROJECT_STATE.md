# SMARTCoach / SMART Trak Project State

Last updated: 2026-07-08

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

- Assistant coach access setup has moved from the starting generic shared-link/shared-code version to named assistant invite links. Staff Access stores assistant name/email plus invite token/status fields on the saved `coachStaff` record, and the redundant generic **Share Assistant Access** panel was removed so assistant sharing happens from each coach row.
- Staff Access can create/copy a private SMART Trak invite for a named assistant, revoke it, or restore it. Opening `/dashboard.html?account=...&invite=...` exchanges the invite token through `/api/smart-trak/account-session` for the normal signed coach session. Revoked, inactive, or unknown invite tokens are rejected.
- Accepted staff invite links now write an `inviteLastUsedAt` audit timestamp back to the saved `coachStaff` row, and Staff Access displays used invite status so head coaches can see whether an assistant invite was actually opened.
- Staff Access now lets coaches set a staff role (`Head Coach`, `Assistant Coach`, `Volunteer Coach`, or `Staff`) and mark each coach Active/Inactive. Inactive staff rows stay saved for reference, but invite copy is disabled in the UI and backend invite validation already rejects inactive staff.
- Staff Access modal layout was widened specifically for the expanded coach rows, with tablet/mobile row wrapping so name, email, role, active status, invite status, and invite actions no longer squeeze together.
- Staff Access coach rows now use a two-line layout: editable name/email/role/status controls on the first line, then invite status, invite activity chips, and actions on the second line. Activity chips are built from the saved invite created/copied/used/revoked timestamps.
- Staff Access Coaches panel now summarizes Active staff, Inactive staff, Invites used, and Revoked invites from the saved `coachStaff` rows so head coaches can audit staff access at a glance.
- Staff Access is now head-coach-only: account-status derives `staffAdminAllowed` from coach index 0 or saved role `Head Coach`; the Dashboard hides/disables the Staff Access button for assistant sessions; staff save and shared-code reset endpoints enforce the same backend rule. Temporary recovery codes still go to the saved account owner email.
- Staff Access coach rows now include **Access Type** with **Full Access** or **App Only**. Full Access coaches can receive SMART Trak invite links and use the app. App Only coaches stay available in the phone app coach picker, but row-level SMART Trak invite creation is disabled and backend invite validation rejects App Only staff invite tokens. Inactive coaches are removed from the app picker and cannot use staff invite links.
- Staff Access now supports named personal coach codes. Head coaches can create/reset a code from each staff row; SMARTCoach stores only a hash, returns only code status/timestamps, and copies the plaintext code only at creation/reset time. Named Full Access codes unlock SMART Trak and the phone app; named App Only codes unlock the phone app but are rejected for desktop SMART Trak sessions. The existing shared account code remains as a fallback/recovery path during transition. Personal-code, active-status, and access-type changes bump the coach session version and return a refreshed head-coach session so old remembered access is invalidated without kicking the head coach out mid-save.
- The Staff Access Create Code / Reset Code clipboard message is now a send-ready **SMARTCoach Access** note that includes the personal code, phone app URL, code-entry instruction, access type, and the desktop SMART Trak link for Full Access coaches.
- Staff Access Copy Invite now also creates/resets that Full Access coach's personal code and copies a combined **SMARTCoach Access** message with the personal code plus the SMART Trak invite link, so head coaches do not need to send two separate messages.
- Account status and account-staff GET responses strip invite tokens unless the dashboard is already unlocked by an active coach session, so invite secrets are not exposed by public account-status checks.
- Coach-facing Staff Access copy and onboarding handoff copy were cleaned so they do not mention GHL. Coach-facing material should continue to say account workspace, custom menu link, SMART Trak, or SMARTCoach instead.
- Copy Coach Invite now includes SMARTCoach Phone App install instructions for iPhone/Safari and Android/Chrome, including the phone app URL and Add to Home Screen / Install app steps, so new coaches know how to add the stopwatch app to their phone.
- Staff Access row-level assistant invite messages now also include the SMARTCoach Phone App install instructions. This is the **Copy Invite** message generated from a named coach row, separate from the onboarding **Copy Coach Invite** message.
- The coach How To Guide now includes the same SMARTCoach Phone App install steps so the guide matches the new coach invite email.
- `SMART_TRAK_COACH_HOW_TO.md` was updated for named assistant invite links because Staff Access is coach-facing.
- Latest local code commit before this state update: Speed Trak roster matching and mobile Speed Metrics save clarity.
- Athlete Setup now keeps inactive athletes out of the current fitness, group setup, and plan assignment lists so planning controls focus on athletes who are currently active.
- Speed Trak manual entry and spreadsheet imports now try to match typed/uploaded athlete names to saved roster athletes. Matched rows preserve roster identifiers/status to reduce duplicate athlete entries, and the import template/preview includes optional **Roster Status** for historical active/inactive marks.
- Training Calendar Speed Metrics workouts now save a fuller coach-facing breakdown like easy and quality workouts: zone/focus, timed distance, planned reps, work volume, and time-plus-stride-count instructions. Speed work volume is the timed sprint/runway distance only, such as `5 x 30 m = 150 m`, with no warmup/cooldown included.
- Dashboard training load now counts saved Speed Metrics practice sessions by converting Field Practice Speed Metrics rows into completed workout rows. One saved speed session counts as one completed workout for every athlete with at least one saved rep, and speed volume is the timed sprint/runway distance only.
- Dashboard Training Load filter-context and archived-group behavior was traced and locked with regression coverage: search/filter/date/season context feeds the training rows, completed volume rows, summary cards, status text, and Volume by Athlete rows; archived training groups stay out of the Groups column and manual mileage group selector.
- Dashboard Completed Workouts now lets coaches **Edit** or **Void** sprint/Speed Metrics workout rows. These rows are synthesized from saved Field Practice Speed Metrics sessions, so edits/voids update the matching athlete's speed reps inside the saved Field Practice session instead of using the normal performance-record correction endpoint. Voiding a sprint workout removes only that athlete's reps from the saved sprint practice and keeps the other athletes' reps intact.
- Dashboard Completed Workouts sprint/Speed Metrics detail rows display completed volume in meters, such as `2 x 20m completed`, instead of appending a rounded miles value. The converted miles value is still kept behind the scenes for dashboard totals and sorting.
- Dashboard now has a **Speed / sprints** filter. In that speed-only view, Training Load Summary, Volume by Athlete, roster week-volume cells, athlete detail volume, Completed Workouts summary rows, and the status line display sprint volume in meters. Mixed/all-activity views stay in miles so distance runs, races, and sprint work are not combined into an unclear unit.
- Dashboard **What's New** now includes approved **Speed Metrics** and **Speed Trak** groups, and the What's New version was bumped so coaches see the speed-workflow update.
- Athlete Calendar and Miles Board public/share URLs now suppress the desktop Feedback pill and SMARTCoach Help/webchat bubble. Athlete Calendar no longer loads the shared help widget directly, and the widget also has a URL guard for `/athlete-calendar` and `/miles-board` as a backstop. Speed Trak was intentionally left out of this change per the narrowed follow-up request.
- Speed Trak now has **Share Board** for a read-only public Speed Trak leaderboard at `/speed-board.html`. The share flow mirrors Miles Trak: account-saved sharing settings, active/off toggle, resettable signed link, challenge layers for Top Velocity/Fastest Time/Consistency/Game Score, coach message, public display mode, and no edit/delete/save actions on the public board. The public API reads saved Field Practice Speed Metrics rows, sanitizes them into one leaderboard row per athlete, and ranks by the selected Speed Trak metric/gender/year filters.
- SMARTCoach mobile Speed Metrics now gives clearer rep feedback after time/stride entry and labels the session sync button **Save to SMART Trak** so coaches know the session is being sent back to SMART Trak/Speed Trak.
- Mobile Speed Metrics rep controls now place **+ Add Rep** and **Remove Rep** side by side under each rep, make Add visually primary, and require confirmation before removing a rep.
- `npm test` passed after building the Speed Trak public board and share-link flow.
- Previous local code commit before this state update: Speed Trak add/edit/delete result management.
- Speed Trak now supports coach-managed one-off result corrections: **Add Result** creates a manual speed mark, and row-level **Edit** / **Delete** lets coaches correct or remove saved Speed Metrics marks without reimporting a spreadsheet.
- Recent local commit `b2a5828 Clarify Speed Metrics practice instructions` changed the Training Calendar Speed Metrics description so coaches are directed to open Speed Metrics in the SMARTCoach app, time or manually enter each rep, add stride count, and let SMART Trak calculate velocity, average stride length, and stride frequency.
- Training Calendar activity sorting now lets an edited **Quality Session** win over leftover speed labels such as Acceleration, so a workout changed from Speed Metrics to Quality no longer remains in the Speed filter. Regression coverage was added.
- Speed Metrics now includes **Max Velocity** as an effort/focus option.
- Training Calendar has **Month View** and an activity type filter for Easy, Quality, Speed, Race, and Rest.
- Mobile Speed Metrics now uses a coach-usable session flow: group athletes are listed up front, tapping a name opens that athlete while collapsing the rest, each athlete can have timed reps started/stopped directly in the app, and manual time/stride/note entry remains available.
- Speed Metrics athlete removal is session-only. **Remove From Session** removes the athlete and their reps from the current practice session without removing that athlete from the SMART Trak training group; group add/remove stays in SMART Trak.
- Speed Metrics session results now print at the bottom of the speed screen, so the footer keeps the coach focused on saving the session.
- Training Calendar now includes a **Speed Metrics** activity choice for fly zones, acceleration zones, max velocity, and runway timing. It saves through the existing workout/calendar path using allowed speed-work effort types while preserving coach-facing Speed Metrics details, planned reps, timed distance, and time-plus-stride-count instructions.
- Field Practice now includes a **Runway / Speed Metrics** panel. Coaches can choose a zone/focus, timed distance, unit, and group/athlete, then enter each athlete's time and stride count. SMART Trak calculates velocity, average stride length, and stride frequency, saves those rows with the field practice, and includes them in the athlete preview.
- SMARTCoach mobile Training now has a full Speed Metrics capture flow. A coach can open a group, choose Speed Metrics, preload athletes from the group/calendar speed workout, add rep rows per athlete, enter time plus stride count, review velocity/stride length/stride frequency, and save the same field-practice record back to SMART Trak.
- The mobile Speed Metrics view is intentionally compact: it shows session setup and speed capture only, while field-event-only controls such as routine drills, no-jump setup, height, jump attempts, athlete summaries, and athlete preview stay hidden from that speed workflow.
- Field Practice remains the practice-side workflow for field-event drills, individual athlete summaries, optional jump attempts, and now sprint/runway metrics. The coach how-to was updated so Field Practice is no longer described as pole-vault-only.
- `npm test` passed after the latest Speed Metrics/calendar filter changes.
- `README.md` still had an unrelated pre-existing local modification and was intentionally left uncommitted.
- Push command for the latest code commits remains `git -C smartcoach-repo push origin main:main`. The local environment may still fail to push with GitHub credential errors, in which case the user should run the command locally.
- Previous handoff before Speed Metrics: `85a4aa1 Add coach-issued equipment tracking`.
- `85a4aa1` adds a Coach Issued workflow to Equipment Trak so coaches can assign watches/radios/gear to staff without creating athlete/contact rows. Coach-issued items count against inventory availability, appear in issued reports/CSV, are duplicate-protected against athlete-issued items, and carry forward during equipment season rollover if still issued/lost.
- `npm test` passed after `85a4aa1`.
- Marketing/sales website work is now in progress:
  - `/sales.html` is the public marketing page for SMARTCoach Pro, SMARTCoach Essential, and SMART Trak.
  - The page uses real product screenshots from SMART Trak and SMARTCoach instead of CSS mockup imagery.
  - The page uses current product truth: Essential stopwatch-only pricing, Pro 25/100/200 pricing, active-athlete limits, coach-code limits, SMART Trak as the desktop command center, Training Calendar as the primary day-to-day workflow, and SaaS account setup wording.
  - `vercel.json` now keeps private app/support HTML pages noindexed/no-cache while leaving `sales.html` available as the public sales page.
- Records retention fix in progress after user reported on 2026-05-30 that the Records page was only keeping 2 records again:
  - Durable school-record mirror now writes a JSON manifest key in customer account storage in addition to per-record item keys and the Redis set index.
  - Records mirror loading now unions the set index, manifest, and scanned item keys, so records can still load if one registry discovery path misses entries.
  - The manifest bootstraps from existing index/scan results when updated, helping accounts with existing mirrored per-record keys.
  - Records diagnostics tooltip now includes manifest count.
  - Added regression coverage where SMEMBERS and SCAN return no records but four school records still load through the manifest.
  - Records page display logic was simplified to a running list: every saved row remains visible, and Current/Historical is derived from the best saved result for the same sport + event + gender.
  - Removed local current-record mutation during save/edit flows so the page no longer carries separate board/history state in the browser.
  - Records API comparison now treats field events as higher/farther is better while race events remain lower time is better.
  - Relay support was added to Records: relay events show Leg 1-4 fields in Quick Add/Edit, bulk import supports Leg 1-4 columns, relay rows display all four runners, search matches relay runners, and the API stores relay legs as structured record-note lines while preserving them in the durable mirror.
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
- Current plan breakdown: Essential is $10/month or $100/year; Pro 25 is $45/month or $450/year; Pro 100 is $75/month or $750/year; Pro 200 is $135/month or $1350/year; Pro Unlimited is a Custom/manual offer for programs that need unlimited active athletes.
- Beta customers can use a 30-day Pro 100 trial. GHL controls trial expiration and sends SMARTCoach `trialing`, then `active` after payment or a blocked status such as `canceled`/`past_due` if payment does not complete.
- Essential is stopwatch-only, requires an active code, and allows one active device session at a time. A new Essential login displaces the previous active device session.
- Pro plans enforce active-athlete limits in SMARTCoach code: Pro 25 has 25 active athletes, Pro 100 has 100, Pro 200 has 200, and Pro Unlimited has no active-athlete cap. Inactive/archived athletes do not count; delete should be reserved for mistakes/duplicates. Downgrades to a lower capped plan are blocked until the active roster is at or below the requested plan's athlete limit; SMARTCoach does not automatically choose athletes to deactivate.
- Pro coach access uses one shared coach code with up to 10 assistant coach seats. The account owner is responsible for sharing the code only with active staff, and schools should keep staff/device access tight to protect clean synced data.
- The shared coach code can be changed by support through onboarding/Save Account Setup, by a coach from the Dashboard **Staff Access** button when they know the current code, or by using the protected recovery code when the current code is lost. Code resets are limited to 2 times per month per account. A saved code change increments the coach-code session version so old signed Pro sessions stop unlocking access. Recurring subscription payloads should not include coach codes, so billing updates do not count as resets.
- A single shared coach access code can unlock both desktop SMART Trak and the SMARTCoach Pro Mobile App for the same coach/device workflow. Staff Access shows device-usage counts so head coaches can spot unexpected syncing activity.

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
- `sales.html`: public marketing/sales page for SMARTCoach Pro, SMARTCoach Essential, and SMART Trak.

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
- Product plan gating: Essential, Pro 25, Pro 100, Pro 200, and Pro Unlimited.
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
- Manual mileage logging exists, including Quality Session entries with warmup, cooldown, sets, rest, rep splits, and notes.
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
- Coach session length is configurable with `SMARTCOACH_SESSION_TTL_SECONDS`, defaulting to 30 days and clamped between 15 minutes and 30 days. SMART Trak and the phone app show **Remember this device for 30 days** when the coach enters the shared code.
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
- Parent email is not the preferred future path because sending from SMARTCoach would require a separate domain and would sit outside normal school email.
- Future parent communication should focus on parent contact organization, copy/export contact lists, coach-copy message text, possible SMS/manual message support if allowed, and workflows that help the coach communicate without SMARTCoach becoming the official email sender.
- Coach should not have to find parent contact details manually.

Community/media:

- GHL Community is not the preferred default path because it requires a domain.
- Future idea: build a simple SMART Trak team highlights or achievement feed, attach PR/record media links to athlete profiles, create coach-controlled share cards, or support a different community approach that does not depend on GHL Community unless domain/community setup becomes worthwhile.
- Future product-module idea: **Community Trak** as a subscriber community for coaching discussions, best practices, resource sharing, program-building ideas, Q&A, and networking. This could become a major retention tool because coaches learn from each other as much as from software.

Future SMART Trak product modules:

- **Attendance Trak**: program accountability module for daily attendance, excused absences, unexcused absences, attendance reports, and eligibility monitoring.
- **Equipment Trak**: inventory-management module for uniforms, warmups, watches, timing chips, issued equipment, and returns tracking.
- **Docu Trak**: compliance-management module for physicals, medical forms, goal sheets, team agreements, parent acknowledgements, and missing-document alerts.
- **Ideas Trak**: product-feedback module where coaches can submit ideas, vote on features, comment on suggestions, view the roadmap, and join beta testing.

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

- Implemented through the GHL Conversation AI SMARTCoach Help widget on desktop SMART Trak pages, using the SMARTCoach knowledge base.
- Future work is knowledge-base/content improvement, not a separate assistant build. Billing questions remain outside SMARTCoach Help.

Athlete training calendar:

- Initial implementation added as `/athlete-calendar.html`.
- Athletes can view assigned training, then mark each workout as completed, adjusted, or skipped.
- Athlete actions should update the coach-facing SMART Trak Training Calendar.
- Athlete access uses a unique athlete link/code generated from the Athletes page.
- Current scope: athletes can view workouts assigned directly to them or to one of their training groups, then submit Complete, Modify, or Skip.
- Submitted updates save into SMART Trak as athlete-submitted completed workout records; skipped submissions require notes and modified submissions can include actual volume/time.
- Future enhancement: add richer coach calendar response summaries, filters for athlete-submitted updates, a clearer coach review view for notes/corrections, optional coach approval before athlete updates fully count, and athlete access management controls.

## Remaining Launch Parked Items

These are intentionally not blocking the current launch path unless the user re-prioritizes them. This section is a planning list only; do not implement these ideas during launch cleanup unless the user explicitly asks for that item next.

- Records page deeper historical record retention after refresh is parked; faster-current checks exist.
- Meet-result corrections update linked Records entries, but full Athlete Best recalculation after corrections is parked.
- Parent email tools stay unreleased for initial rollout; future parent communication should avoid relying on SMARTCoach-sent email unless a domain/sending strategy is intentionally added.
- Deeper import workflows for race results, school records, training history, and plans remain future work.
- Plan Builder full-plan review/spreadsheet-style adjustment remains future work.
- SMARTCoach Help is implemented through GHL Conversation AI; future work is knowledge-base improvement.
- Athlete-facing training calendar initial portal is implemented; future work is richer coach calendar response summaries, optional approval, review filters, and athlete access management controls.
- Field-event tracking initial support is implemented; future work is deeper vertical-jump height progression, place/scoring, and richer field-event analytics.
- Community/media remains future work, but GHL Community is not the default path because it requires a domain; prefer a lightweight in-app highlights/feed or share-card approach first.
- Future SMART Trak product modules are parked: Attendance Trak, Equipment Trak, Docu Trak, Community Trak, and Ideas Trak.

Attendance Trak:

- Initial mobile-first attendance tracking is implemented inside the SMARTCoach Pro Mobile App group screen.
- Training groups now have an **Attend** tray action that opens a full-screen Attendance sheet for the current group and date.
- Attendance supports multiple checkpoints per day, starting with **Practice Start** and allowing additions such as **Weight Room**.
- Each athlete can be marked Present, Late, Excused, or Absent per checkpoint, with a Mark All Present shortcut.
- When a runner is marked absent and later records a timed workout on the same day, the first checkpoint auto-updates to Late with an audit note. If the runner was unmarked, workout activity auto-marks Present.
- Current scope is local mobile attendance workflow. Future work should sync attendance to SMART Trak, add desktop Attendance Trak reporting/editing, and add eligibility/absence summaries.

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
179. Field-event mobile sheets are now full-height screens. Field attempt review rows use larger attempt/mark text with smaller edit/delete buttons, the field attempt modal closes after adding or correcting an attempt, Settings includes a feet/inches vs meters field-mark preference, and vertical jumps require an explicit **Result** selection of O/X/P instead of defaulting to a make.
180. Cleaned up SMARTCoach Pro Mobile App vertical jump attempt history. Each height now shows as one score-sheet style row with a fixed height column and tappable O/X/P chips for editing, plus compact delete controls underneath so rows no longer wrap into crowded edit/delete button clusters.
181. Mobile field-event flight Save now reads **Save to SMART Trak** and attempts to sync directly to SMART Trak Meet Results in one step. If SMART Trak is unavailable or the request fails, the field results remain saved on the device with a retry message telling the coach to tap **Save to SMART Trak** later.
182. SMART Trak meet-result sync now auto-tags field event marks as PB/SB when the saved mark is the athlete's best saved mark for that field event ever or in the current season. This applies to field results saved from SMARTCoach Pro Mobile App and desktop Log Race Result.
183. Cleaned the SMARTCoach Pro Mobile App meet timing screen by removing the inline Relay and Field Events bands above the runner rows. Field remains available from the bottom tray, and the old Results tray slot now opens the Relay controls sheet with the same relay on/off, leg selection, and timing behavior.
184. Simplified the SMARTCoach Pro Mobile App meet tray: tapping **Relay** now activates relay timing and opens the relay controls directly, with a separate Turn Off Relay recovery button inside the sheet. The Plan tray button is hidden on meet timing screens, and Field/Relay tray icons now use event-specific symbols instead of Sort/Sum icons.
185. Updated SMARTCoach Pro Mobile App meet tray icons again: Field uses a trending-up icon and Relay uses a four-person relay-team grid icon while preserving the app's blue tray stroke style.
186. Cleaned SMARTCoach Pro Mobile App bottom trays by context. Training group timing hides the unused Sort and Sum buttons, meet list view hides Plan, and Archive list view leaves only Delete so coaches see fewer inactive controls.
187. Adjusted SMARTCoach Pro Mobile App hooked runner rows so the hook pill no longer squeezes the athlete name. Hook labels move below the name lane, active timing rows hide the unused info/delete controls while timing so the athlete name and End/Stop buttons stay on one compact row, and the timer screen no longer shows the Plan or Status bands because Plan remains in the tray and Sync/Save remains in the top-right action.
188. Fixed SMARTCoach Pro Mobile App individual runner Start/Stop controls so they now toggle the same active-row layout as the main Start/Stop buttons. The info/delete buttons disappear while that runner is timing and return immediately when the runner is stopped.
189. Restored relay timing controls inside the SMARTCoach Pro Mobile App Relay sheet. The sheet now includes Start/Stop, Lap/Finish, and Reset controls directly above the relay leg list, and the old Turn Off Relay button is no longer shown there.
190. SMART Trak relay result sync now auto-tags **SB** when the relay time is the fastest saved result for that relay event in the current season. Relay results do not use PB tags.
191. Kept `SMART_TRAK_COACH_HOW_TO.md` coach-facing by removing implementation/vendor wording from SMARTCoach Help. The guide now describes SMARTCoach Help as in-app product/workflow help without naming the underlying live-chat provider or AI setup.
192. Contacts tagged `live chat` are excluded from SMARTCoach athlete/roster loaders so temporary help-chat contacts do not appear on Athletes, Dashboard, app athlete pickers, or Athlete Calendar lookup while the cleanup automation waits to delete them.
193. Dashboard Training Load / Completed Workouts search now includes saved roster group membership, not only group names recorded on completed workout rows. Searching groups like Middle School, High School, MS Distance, or HS Sprints now pulls matching athletes/workouts more reliably.
194. Training Calendar manual Quality Session builder now supports rest inside workouts. Coaches can add a standalone Rest Set row and repeating-set blocks now include Recovery Between Sets, with summary/details/target text preserving both recovery between reps and rest between repeated sets.
195. Training Calendar Quality Session recovery/rest dropdowns now match the fuller manual-workout recovery list: min/sec/m/mi/km jog or walk, plus `sec rest`.
196. SMARTCoach Pro Mobile App plan/workout sheet is now full-screen. The app now treats group-assigned manual Training Calendar workouts as runnable SMART Trak Calendar workouts, auto-attaching the next upcoming workout to the matching timing group and showing those calendar workouts in the selector. The hidden SMARTCoach Training Groups roster record is filtered out of the training-plan selector.
197. SMARTCoach Pro Mobile App target calculations now preserve the planned rep distance from manual calendar workouts when the workout text has reps but no explicit target percent. Examples such as `3 x 1 mi @ Threshold`, `3 x 1 mile @ Threshold`, and `2 x 200 m @ Threshold` now calculate the target from the actual rep distance instead of falling back to the generic 400m rule.
198. SMARTCoach Pro Mobile App current-fitness target selection now matches Dashboard current fitness: athlete targets prefer the Athlete Best `last_result_display` / `last_result_date` before season best or personal best, so manually changed current fitness values flow into mobile target calculations.
199. SMARTCoach Pro Mobile App current-fitness reads are now fresher after Athlete Setup changes: the athlete-profile API sends `Cache-Control: no-store`, the app profile cache is shortened, and sync target calculations force a fresh athlete profile instead of reusing a cached target for the same workout plan.
200. SMARTCoach Pro Mobile App time parsing now supports pace/formatted current-fitness text such as `7:09/mile` or `1600m 7:09`, extracting the actual clock time before calculating targets so current-fitness paces no longer become tiny second-based target ranges.
201. SMARTCoach Pro Mobile App current-fitness parsing now also treats decimal pace text such as `7.09/mile` or `7.09` on 1600m/mile fitness rows as `7:09` instead of `7.09` seconds, and the app version/build stamp was bumped so phones can confirm the refreshed bundle.
202. Athlete Setup now signals saved current-fitness changes to any open Dashboard, and Dashboard reloads with cache-busted no-store requests so completed-workout current-fitness columns use refreshed Athlete Best values instead of a stale dashboard response.
203. SMARTCoach Pro Mobile App current-fitness selection now chooses the newest non-future Athlete Best row first, so a newly saved 1 Mile current fitness from Athlete Setup overrides an older race-derived 5K row; workout-preferred events only break same-date ties.
204. SMARTCoach Pro Mobile App now reconciles shared training groups against the live SMART Trak athlete roster. If a GHL contact is deleted or no longer returned by the athlete endpoint, the app removes that runner from synced training groups after refresh and no longer writes the stale runner back into the shared group record.
205. SMART Trak now tracks shared coach-code device usage without exposing the code. Staff Access shows assistant coach seat allowance, active devices seen in the last 30 days, devices seen this week, and last device activity. Device usage updates when a coach unlocks with the shared code and when a device uploads/saves SMART Trak data.
206. `SMART_TRAK_COACH_HOW_TO.md` now documents Staff Access, explains that Pro accounts use a shared coach code with up to 10 assistant coach seats, and tells head coaches to rotate the code if device activity is higher than expected.
207. Staff Access was moved out of a main Dashboard card and into the shared coach-code modal. The old **Change Code** button now reads **Staff Access**, uses the quieter utility-action styling, and opens the device-usage summary plus code-change form.
208. The how-to guide now reflects the quieter Dashboard placement for Staff Access after Refresh and clarifies that Assistant coach seats shows the up-to-10 staff allowance.
209. SMARTCoach Pro Unlimited was added as a Custom/manual Pro plan with unlimited active athletes, the shared Pro 200 amount was corrected to $135/month and $1350/year, and onboarding/marketing/docs now describe GHL-owned 7-day Pro trials with credit card required and cancellation/export guidance that tells coaches to export before cancelling.
210. Coach access now defaults to a 30-day signed session. SMART Trak and the phone app show **Remember this device for 30 days**, storing the signed session on trusted devices while shared-code resets still invalidate old sessions immediately.
211. Training Calendar Add Calendar Day now lets coaches select multiple active training groups with checkboxes. Saving creates one matching calendar workout per selected group in the same save, so coaches can assign the same Easy Run, Quality Session, Race, or Rest Day to several groups at once.
212. Training Calendar edits now use the same coach-facing modal as Add Calendar Day. Coaches see the familiar Easy Run, Quality Session, Race, and Rest Day layout when adjusting a workout, while the save path still updates the selected calendar item only so edits do not create duplicate workouts.
213. SMARTCoach Pro Mobile App easy-run targets now recognize calendar labels and target text like `Easy run`, `Recovery run`, and `Conversational` as Easy/Recovery Run instead of falling through to the generic 400m interval rule. Easy and long-run targets now display as pace per mile from current fitness, and the app version stamp was bumped so phones can confirm the refreshed bundle.
214. SMARTCoach Pro Mobile App Sync to SMART Trak sheet is now full-screen with a scrollable body, so larger groups can review all selected runners while the Sync and Close buttons stay fixed at the bottom. The sync logic still sends every checked runner in the list.
215. SMARTCoach Pro Mobile App now allows native pinch-to-zoom by relaxing the mobile viewport from locked scaling to user-scalable up to 5x, making modal/bottom sheets easier for coaches to enlarge on phones.
216. SMARTCoach Pro Mobile App workout selector now hides coach/audit meta notes such as `Copied on Training Calendar from...` from the visible workout text while preserving those notes in SMART Trak.
217. Dashboard Completed Workouts now surfaces athlete-submitted Athlete Calendar notes as an explicit **Athlete Note** column in the expanded workout detail table and includes the same field in training CSV export.
218. SMART Trak coach access sessions are now shared consistently across pages. Athletes, Training Calendar, Plans, Meet History, Records, and Simulators read the same 7-day remembered session created from Dashboard/SMARTCoach access, so coaches are not asked for the code again when moving between pages.
219. SMARTCoach Pro Mobile App settings save now reads the **Remember this device for 30 days** checkbox inside the save handler, fixing the `rememberInput` error that stopped account/code validation before login could complete.
220. SMARTCoach Pro Mobile App Training groups no longer move into Archive just because the automatic season changed, such as Spring 2026 to Summer 2026 on June 1. Active training groups stay on the Training tab until the coach explicitly archives them.
221. SMARTCoach Pro Mobile App group tabs no longer use hard-coded season boundaries for visibility. Training shows active training groups, Meets shows active meet groups, and Archive shows only groups/meets the coach explicitly archived; automatic Spring/Summer/Fall/Winter labels remain only defaults/metadata.
222. Attendance Trak started in the SMARTCoach Pro Mobile App: training groups have an **Attend** tray action with date-based attendance sheets, multiple checkpoints, Present/Late/Excused/Absent marks, Mark All Present, and workout-aware auto-updates from Absent to Late or blank to Present.
223. SMARTCoach Pro Mobile App Groups screen now supports the daily attendance workflow directly: tap **Attend**, choose the training group, and complete attendance. The main Groups tray no longer shows Delete; permanent Delete is only available from the Archive tab and asks which archived group to remove.
224. Attendance Trak now syncs saved mobile attendance into SMART Trak account storage. Desktop SMART Trak has a new **Attendance** page for date/group/status filtering, status/note edits, summary counts, and CSV export, and the Athletes page detail modal shows each athlete's recent attendance results with a link to the full report.
225. Attendance Trak is now treated as an Athletes-page workflow instead of a main Dashboard destination. The Dashboard nav no longer shows Attendance, Attendance Trak adds an attendance percentage card, and row corrections use an **Update** action for edited status/notes.
226. Attendance Trak desktop filtering now includes a dedicated Checkpoint dropdown so coaches can isolate marks from Practice Start, Weight Room, or any renamed attendance checkpoint.
227. Docu Trak started on the SMART Trak Athletes page: coaches can define account-specific checklist items such as Physical, Goals Form, and Guidelines / Expectations, then mark each athlete Missing, Complete, Waived, or Not Required with dates and notes from the athlete detail modal.
228. Docu Trak setup is now coach-facing: the Athletes table has a per-athlete **Docu Trak** action that opens the detail modal, and the Docu Trak card has a **Setup** button with row-based add/remove requirements instead of a one-item-per-line text box.
229. Athlete detail attendance now stays summary-only: compact cards show Present, Late, Absent, Excused, and Attendance %, with the full row list left on the Attendance Trak page.
230. `SMART_TRAK_COACH_HOW_TO.md` is updated for completed Attendance Trak and Docu Trak workflows: Athletes detail shows attendance summary cards, the full attendance report lives on Attendance, and Docu Trak uses row-based setup plus per-athlete checklist saves from the Athletes page.
231. Attendance Trak now supports **Checked Out** for meet-day or parent checkout checkpoints. Mobile attendance, SMART Trak Attendance filters/editing, athlete detail summary cards, and attendance percentage math treat Checked Out as an accounted-for status rather than an absence.
232. Equipment Trak started on the SMART Trak Athletes page. Coaches can define account-specific issued equipment items, choose whether each item tracks size and/or number/ID, then mark each athlete Not Issued, Issued, Returned, Lost / Damaged, or Not Required with size, number, issued date, returned date, and notes from the athlete detail modal.
233. Equipment Trak now includes an **Equipment Lookup** modal on the Athletes page so coaches can search found gear by item, number/ID, athlete, size, status, issued/returned dates, or notes. The Athletes table equipment badge now says **needs return** for currently issued gear instead of implying it was returned.
234. Equipment Lookup has been expanded into **Inventory Reports** on the Athletes page. Coaches can view summary cards for issued, needs return, returned, and lost/damaged equipment, filter by status and item type, search found gear, click into an athlete's Equipment Trak record, and export the current report to CSV.
235. Equipment Trak now separates **Equipment Issued** from true **Equipment Inventory**. Inventory batches can track numbered ranges, size quantities, and simple counts; reports show total, available, issued, and lost/damaged counts. Numbered gear cannot be actively issued to two athletes with the same item number.
236. Equipment Trak reports now support sortable columns in both **Equipment Issued** and **Equipment Inventory**. Issued can sort by athlete, item, status, size, number/ID, dates, and notes; Inventory can sort by program, item, group, type, size, range/quantity, total, issued, available, and lost/damaged counts.
237. Dashboard Activity range now supports preset ranges plus a **Custom range** with exact start and end dates. The selected range drives dashboard summaries, meet rows, training rows, volume reporting, exports, and saved dashboard view state.
238. Equipment Inventory setup now has faster row-entry controls: coaches can copy a single inventory row or use **Copy Girls to Boys** to duplicate all current Girls inventory rows as Boys rows, then adjust quantities or number ranges before saving.
239. Equipment Trak now includes an **Issue Sheet** tab for equipment handout day. The sheet shows one athlete per row with configured equipment items as columns, supports search/group filtering, row saves, and full visible sheet saves while preserving duplicate numbered-item protection.
240. Equipment Trak Issue Sheet now uses size dropdowns and sortable row headers for Athlete, Grade, and Groups so coaches can work the sheet in grade/group order on equipment issue day.
241. The SMARTCoach mobile app Groups tray now uses **Add / Account / Refresh / Attend / Equip / Archive**. The previous Plan shortcut was removed from the Groups tray because plan selection happens after a group is opened.
242. The SMARTCoach mobile app now includes an **Equip** workflow for equipment issue day. Coaches choose a training group, update each athlete's Equipment Trak items from mobile cards, and save one athlete or the full visible group back to SMART Trak while preserving duplicate numbered-item protection.
243. Mobile Equipment Trak now includes a quick lookup search for found gear. Coaches can search by item name, number / ID, athlete, size, status, or note, such as **backpack 45**, and numbered equipment inputs request the phone number keyboard.
244. Staff Access now includes a coach-name list for shared-code accounts. The SMARTCoach app prompts unlocked devices with **Select Coach** / **Which Coach Are You?**, remembers the selected coach per account/device, and sends that coach label with app saves and syncs so future reports can show who completed activity such as workout syncs and meet-day checkouts.
245. SMARTCoach app account unlock now re-checks account status after a successful coach-code session is created, so devices that were already entering or refreshing an active code still receive the **Which Coach Are You?** prompt when no coach name has been saved on that device.
246. Staff Access now warns the head coach when the shared code has been used by active devices that have not selected a coach name. The warning gives the coach the practical choice to add missing coach names or rotate the shared code if the activity looks unexpected.
247. The SMARTCoach app coach picker now always includes **Not Listed**. Choosing it does not save a coach identity, keeps the device unassigned for Staff Access warnings, and allows the prompt to return on the next login/identify cycle so the head coach can add the missing coach or rotate the code.
248. **Not Listed** no longer suppresses the coach identity prompt for the rest of the app session. It only prevents an immediate reopen after the tap, so a refresh or later account check asks **Which Coach Are You?** again whenever the device still has no saved coach name.
249. SMARTCoach app Refresh now sets an explicit one-time coach-identity check before reloading. After the refreshed account status returns, the app forces **Which Coach Are You?** if the device is unlocked but still has no saved coach name.
250. SMARTCoach app coach picker now uses its own HTML escape helper instead of the desktop-only `esc()` helper, fixing the settings/account check crash that hid the access-code entry row.
251. Attendance Trak reporting now surfaces selected coach identity as **Coach / Source**. The Attendance page search and CSV export include coach names, while rows without a selected coach fall back to the generic source.
252. Shared SMARTCoach Groups storage now writes compact group JSON instead of pretty-printed roster blocks. This preserves group/athlete membership while keeping Select All and larger rosters under the platform's 12,000-character record limit.
253. Account setup now preserves the exact `proUnlimited` plan key from the onboarding dropdown instead of normalizing it back to Pro 25, so SMARTCoach Pro Unlimited saves as a custom unlimited-athlete Pro account.
254. Account setup now clears stale standard-plan billing amounts when switching an account to SMARTCoach Pro Unlimited. If the saved amount is an old tier amount such as 45.00, Unlimited saves the subscription amount as Custom.
255. Completed-workout corrections now update the SMART Trak training mirror as well as the live GHL performance record. This prevents edited Training Load / Completed Workouts rows from temporarily duplicating on screen or reverting to stale mirror data after refresh.
256. Weather saved locations now persist to the SMARTCoach account record instead of only device local storage, with local storage as a fallback. Hourly and daily forecast cards also use condition-based tinting for clear, cloudy, fog, rain, heavy rain, storm, and snow days.
257. New customer accounts no longer load snapshot-seeded Training, Meet, or Archive groups. For named SMARTCoach accounts, Groups and scheduled Meets now read/write account-scoped registry data; copied hidden GHL system records are ignored unless using the default/dev account fallback. The phone app also prunes locally cached shared training groups when Refresh receives a blank/new account group list.
258. Docu Trak now supports season rollover. Account Docu Trak records include an active season plus archived prior seasons; the Athletes page Docu Trak Setup modal shows the active season, can start a new sport/year season, copies selected requirements forward, and resets athlete document statuses for the new season.
259. Docu Trak Setup now lets coaches edit the current season's sport, year, and season name without starting a new season or resetting athlete document statuses.
260. Equipment Trak now supports season rollover with an inventory-pool choice. Coaches can start a new Equipment season, copy the inventory list forward, and carry forward only still-issued or lost/damaged gear from the same pool. This lets schools keep Cross Country and Track inventories separate, while schools that share gear can use the General pool to keep numbered items blocked across programs.
261. Equipment Inventory rows now include sharing rules for numbered gear: **Separate sport** vs **Shared sports** and **Separate gender** vs **Shared genders**. Saved issued items carry sport/gender context, so schools can support duplicate numbers such as Girls Backpack #2 and Boys Backpack #2 when those are separate physical items, while still blocking duplicates when a backpack pool is shared.
262. Equipment Trak normalization now recovers older saved inventory rows when the active equipment season has an empty inventory list. This protects inventory entered before the season/sharing-rule structure from disappearing in the coach-facing view.
263. Equipment Trak archived seasons are now reachable from the Equipment Trak modal. The season header shows buttons for archived seasons, and opening one activates that season so issued gear, issue sheet, and inventory all switch together.
264. Equipment Trak recovery now also restores older issued records and item definitions when the opened/active season is empty. POST responses return the normalized recovered season so opening an archived season or refreshing the modal does not show a blank shell while older data still exists.
265. Staff Access now includes a lost-code recovery path. Coaches can replace the shared coach code with either the current code or the protected recovery/setup code; the old code is never displayed, and successful recovery still increments the coach-code session version so old signed sessions stop working.
266. Staff Access can now send a short-lived temporary shared-code recovery code to the saved account owner email. The head coach enters that temporary code, then creates a new memorable shared coach code; SMARTCoach stores only a hash of the temporary code, expires it after 30 minutes, and marks it used after a successful reset. Account setup now stores account owner email/phone for this recovery workflow.
267. Added `/account-access.html` as a self-service access-code recovery page for Essential app-only accounts and Pro shared-code accounts. Coaches enter the account key, send a temporary code to the saved account owner email, then create a new memorable access code without seeing the old code. Successful reset creates a fresh signed session and invalidates old sessions.
268. Coach access remembered-device wording now uses 30 days in the SMARTCoach app, SMART Trak access modal, and coach guide.
269. Records bulk import no longer requires an exact date. Gender, event, result, and year are required; Date remains optional. Year-only date values are treated as the season year instead of being converted into a fake January 1 record date.
270. Records Tools now includes a guarded **Delete All Records** action for clearing a bad import before a fresh upload. It requires a confirmation and typed `DELETE ALL`, deletes GHL rows when record IDs are available, clears mirrored record IDs/source IDs, and clears the local Records cache.
271. Records bulk import now supports both relay-aware templates with Leg 1-4 columns and simpler templates without relay-leg columns. In the simpler layout, Meet, Date, Season, Year, Previous Record, Previous Holder, and Notes no longer shift into relay runner fields.
272. Records table and bulk import preview now show Sport as its own column so Track and Cross Country records remain visually distinct after import.
273. Records bulk import no longer silently defaults missing Sport values to Track. Bulk Import now includes a Sport for blank rows selector, and the Records API/registry preserve blank sport values instead of converting them to Track.
274. Records bulk import now skips exact duplicate pasted rows during preview, keeps a clear records-saved message after Save, and renders the saved records immediately from the successful save response instead of requiring a manual refresh.
275. Meet History now has a top **Import History** button plus an Import Meet History panel for onboarding historical results. Coaches can paste spreadsheet rows, upload CSV/TSV/text exports, use screenshot/photo upload as a reference path, preview rows, skip exact duplicate pasted rows, and save historical results without creating active athletes. Imported gender is stored in notes and read back for event comparisons. The save action reuses the existing meet-result API route so it does not add another Vercel serverless function.
276. Meet History Import now includes an **Athletic.net Paste** mode for Season Bests text. It reads event headers such as 2 Miles and 5,000 Meters, gender sections, grade, athlete, mark, date, and meet from Athletic.net's copied layout, then infers historical class year from the season year/grade so a Fall 2023 9th grader is saved as class of 2027.
277. Athletic.net Meet History Import also supports the Athletic.net **Results Grid** layout with athlete rows and meet-date columns. The importer cross-references the Meet List to convert date columns into meet names/dates, reads Race Distances to map subscripted result cells to events such as 2 Mile or 5000m, skips Athletic.net initials/avatar columns, infers gender from pasted Mens/Womens tab text when present, and provides a Default Gender fallback when the pasted grid starts at the table.
278. Athletic.net Results Grid import now handles copied Meet List rows with checkbox/icon columns or a combined Meet List/Key header, so meet dates do not fall back into the Meet column. Grade detection also tolerates hidden initials/avatar columns so historical class year is still inferred.
279. Athletic.net Results Grid import no longer treats plain grade numbers as result cells. This prevents row shifts where the athlete preview becomes a time/result and keeps grade/class-year inference intact. Meet List parsing also supports date-only lines followed by the meet name on the next line.
280. Meet History Athletic.net Import now supports Athletic.net **Event Records** text for track and field seasons. It reads Mens/Womens sections, event headers, track times, field marks, PB flags, dates, meet names, grades/class years, and relay blocks with runner names. Event names normalize to SMART Trak-style labels such as 100m, 400m, Shot Put, High Jump, and 4x100 Relay. The coach guide documents Results Grid and Event Records imports.
281. Athletic.net Event Records imports now support a pasted season calendar/meet reference list below the records. When Athletic.net cuts off meet names in the copied records, SMART Trak uses the result date to replace the shortened name with the full calendar meet name. The reference parser handles separate date/name lines and multi-day date ranges such as Apr 30-May 1 pointing to one meet.
282. Athletic.net Event Records meet-reference parsing now also handles compact no-weekday multi-day ranges such as `Apr 30-May 1`, so a result dated Apr 30 can repair a shortened meet name from that calendar entry. Added a regression check in `tests/run-all.js`; `npm test` passed on 2026-06-04.
283. Meet History now has a Sport filter in the top search/filter bar, between Search and Season. `All sports` is the default and preserves the existing result count; selecting Track or Cross Country filters visible rows. The filter recovers sport from Athletic.net import notes and event names when older rows do not have a saved Sport value. Added toolbar-placement coverage in `tests/run-all.js`; `npm test` passed on 2026-06-04. Production still needs the local commits pushed/deployed after this handoff.
284. Fixed Meet History historical imports disappearing on reload. The dashboard API now includes unmatched historical meet-result records, not only records linked to active athlete contacts and relays. Historical imports are detected from `Result Type: Historical Import`, `mhi_` source IDs, or Athletic.net/historical notes. Added regression coverage in `tests/run-all.js`; `npm test` passed on 2026-06-04.
285. Meet History now attaches unlisted/unspecified imported seasons to their correct year in the Season filter/display by falling back to saved `seasonYear` or meet date year. New historical imports save the year as the season label when the pasted source does not provide a meaningful season. Added regression coverage in `tests/run-all.js`; `npm test` passed on 2026-06-04.
286. Follow-up for imported seasons: the dashboard meet-result response now returns saved `season` and `seasonYear`, and the immediate historical-import save response returns those fields too. This lets existing imported rows move out of `Unlisted` into their year in the Meet History Season dropdown after reload. Regression coverage now checks both response paths; `npm test` passed on 2026-06-04.
287. Second follow-up for imported seasons: the dashboard field map now includes the Meet Result object field IDs for `season` (`E7WkU0NjC48zZzSNMlMJ`) and `season_year` (`jImFId2bLt2Hhox7TTDR`), so existing GHL records returned by field ID can populate the Season dropdown by year instead of Unlisted. Regression coverage now locks those IDs; `npm test` passed on 2026-06-04.
288. Third follow-up for imported seasons: Meet History result-created meet groups now inherit `season` and `seasonYear` from their result rows, and season filtering checks each result row before deciding whether to keep a group. This fixes year filters still acting like imported groups were Unlisted even after the API returned season years. Regression coverage now checks group season inheritance and row-level season filtering; `npm test` passed on 2026-06-04.
289. Dashboard Activity Range card layout was cleaned up so the range selector and custom start/end date inputs stack within the card instead of squeezing into one horizontal row. Added regression coverage in `tests/run-all.js`; `npm test` passed on 2026-06-04.
290. Dashboard Manage Meets modal now includes a Sport dropdown with Track and Cross Country, saves/edits sport through the account-backed Meets API, preserves sport during archive/restore, and passes sport when Log Race Result auto-creates a meet. Meet cards show sport in their metadata. Added regression coverage in `tests/run-all.js`; `npm test` passed on 2026-06-04.
291. Weather saved-location UX now treats account-storage failures as a local-device save fallback instead of a red error. The weather page sends the account header when saving locations, the weather-locations API returns `saved:false` with success if account registry storage is unavailable, and the UI says the location was saved/removed on this device. Added regression coverage in `tests/run-all.js`; `npm test` passed on 2026-06-04.
292. Training Calendar quality-workout edits now hydrate the edit builder from the saved workout details/targets instead of showing the default `2 x 1 mi @ Threshold` row. Saved lines such as `2 x 100 m @ Repetition with 1 min (jog) recovery between reps` now reopen with 100 meters, Repetition effort, and the saved recovery in the builder summary. Added regression coverage in `tests/run-all.js`; `npm test` passed on 2026-06-04.
293. Dashboard completed-workout split display now keeps plain SMARTCoach lap splits as laps even when the workout type says Easy Recovery Run. SMART Trak only infers alternating Rep/Rest from plain Lap labels when the workout text explicitly looks like an interval set such as `2 x 1 Mile` with recovery; synced Rep/Rest labels from the phone app still stay Rep/Rest. Added regression coverage in `tests/run-all.js`; `npm test` passed on 2026-06-05.
294. The public sales page workflow section now uses the four coach-facing cards Plan, Time, Analyze, and Engage with the newer coach-facing product areas included under the right headings: Athlete Setup/current fitness/plan assignments, Attendance Trak, Equipment Trak, Athletic.net imports, relay and field-event review, Docu Trak, Staff Access device review, and recovery-code support. `npm test` passed on 2026-06-05, and a local browser check confirmed the four cards render without horizontal overflow.
295. Meet History meet sidebar now sorts meets chronologically by meet date, oldest to newest, with undated/invalid-date meets after dated meets. Added regression coverage in `tests/run-all.js`; `npm test` passed on 2026-06-05.
296. Meet History performance was improved for large historical imports. The page now caches grouped meets and prior-result comparison lookups between data loads, caches row search text, invalidates those caches after fresh loads/import saves, and debounces search input so large histories do not re-filter/re-render on every keystroke. Added regression coverage in `tests/run-all.js`; `npm test` passed on 2026-06-05.
297. The same typed-search performance guard was extended across the larger coach-facing pages: Records, Attendance, Dashboard, Training Calendar, and the Athletes Equipment Lookup now debounce heavy table rebuilds while typing. Records also reuses the current-record status map inside one render instead of calculating it twice. Added regression coverage in `tests/run-all.js`; `npm test` passed on 2026-06-05.
298. Field event no-mark saves are supported. Long Jump, Triple Jump, Shot Put, Discus, Javelin, and Hammer can save an athlete with all foul/pass attempts as `NM`, while High Jump and Pole Vault continue to save all-miss/pass results as `NH`. The mobile field-flight flow, mobile Save Meet Results field form, Dashboard Log Race Result, Training Calendar Log Race Result, and meet-result API all accept this no-legal-attempt path. Added regression coverage in `tests/run-all.js`; `npm test` passed on 2026-06-05.
299. Keep Trak was added as an account-backed practice briefing notes workflow. Desktop `/keep-trak.html` lets coaches create, edit, complete/reopen, and delete notes; the SMARTCoach mobile app adds a **Keep** action on the Groups toolbar for create/view/complete without delete. Notes store in the account registry under `keepTrakNotes`, are capped at 1500 records per account, and incomplete notes from earlier dates carry forward until completed. Dashboard and Training Calendar link to Keep Trak, `vercel.json` marks the page noindex/no-cache, and `SMART_TRAK_COACH_HOW_TO.md` documents the workflow.
300. Keep Trak copy/display cleanup: the desktop page title now reads **Keep Trak** instead of **SMART Trak Keep Trak**, the subtitle removes coach follow-through wording, and mobile note cards no longer repeat the note's first line in both the black header and white body. New mobile notes save without an auto-generated duplicate title, and older duplicate-title notes render with the generic **Briefing note** header. `npm test` passed on 2026-06-06.
301. Keep Trak desktop header is sticky, the desktop Title field was removed, and both desktop/mobile note textareas enforce the 4,000-character note limit that the registry already normalizes. The desktop note form now shows a live character counter. `SMART_TRAK_COACH_HOW_TO.md` documents the limit and no-title workflow.
302. Keep Trak desktop now checks for notes older than 30 days on page open and shows a 30-Day Cleanup panel when any exist. Old notes are selected by default; coaches can delete selected notes, select all, or dismiss with Not Now. The cleanup uses the existing Keep Trak delete path instead of adding another endpoint.
303. Keep Trak desktop delete actions now use an in-page confirmation dialog instead of the browser-native embedded-page alert, so the message can say **Delete Keep Trak note?** or **Delete old Keep Trak notes?** with SMART Trak-styled Cancel/Delete buttons. Regression coverage rejects `confirm()` on `keep-trak.html`; `npm test` passed on 2026-06-06.
304. Keep Trak notes now support quick plain-text bullets on both desktop and the SMARTCoach app. The **Add Bullet** control inserts a `- ` line at the cursor so coaches can keep one daily note with talking points/checklists instead of creating multiple notes. The coach guide documents the workflow.
305. SMARTCoach app Groups tray cleanup: the duplicate bottom-tray **Add** button is hidden because the top-left **Add** action already creates groups/meets. Archive remains in the tray for active Training/Meets views, keeping the toolbar focused on daily actions.
306. Keep Trak light-mode layout moved closer to the original proposed design without changing storage/API behavior. Desktop now has day cards, a day header, and Add Note buttons that reveal the Add/Edit panel; the SMARTCoach app Keep modal now includes Yesterday/Today/Tomorrow quick date buttons. The guide documents the new date-selection flow.
307. SMARTCoach app Keep modal layout cleanup: **Add Bullet** and **Save Note** now sit on the same row, while note-card **Complete** uses a green action style and **Reopen** uses a neutral style so those actions no longer look like the primary save button.
308. SMARTCoach app Attendance now gives each checkpoint its own **Mark All Present** action in the checkpoint header. The shortcut fills only that checkpoint, so added checkpoints such as Weight Room or Meet Checkout can be marked present independently from Practice Start. Regression coverage and the coach how-to were updated.
309. SMARTCoach app Attendance checkpoint readability was improved: checkpoint headers now render as black bars with white text, while athlete rows use gray name bars with black text so added checkpoints stand apart from the athlete list.
310. Meet History now normalizes loaded and newly imported rows into cached view fields before filtering/rendering. Sport filtering recovers Track/Cross Country from saved sport values, Athletic.net import notes, event type, and Fall distance context; season filtering recovers year labels from saved `seasonYear` or meet date and date-based season inference now wins over stale import defaults. Meet History also caches filtered groups and parsed result times to reduce repeated work on larger imported datasets.
311. Meet History sport recovery was widened for already-imported Cross Country rows that were accidentally saved with a Track/unknown sport value. XC meet names, fall meet dates, and XC distance events such as 5K, 5000m, and 2 Mile can now override a bad saved sport label, while track-only events such as relays, hurdles, and field events still recover as Track. Coaches should not delete and re-import solely to fix these older sport labels.
312. Meet History Cross Country recovery now treats XC/fall meet context as authoritative for non-track-only events, even when the saved sport value says Track. Exact duplicate loaded result rows are also suppressed in the Meet History view by athlete/gender/meet/date/event/result so duplicate imports do not inflate visible counts, without deleting stored records.
313. Athletic.net Meet History Results Grid / full season table / Season Bests imports no longer inherit the import panel's Default Sport. Those layouts are treated as Cross Country unless a row is clearly track-only, and the Meet History view applies the same rule to already-saved rows. This explains the prior live symptom where all 1000 imported Results Grid rows appeared under Track and none appeared under Cross Country.
314. Meet History sport recovery now includes the current data-specific season windows: result rows dated August-November classify as Cross Country, while rows dated February-May classify as Track. The date rule is checked before saved sport labels, so older rows saved with the wrong sport can still filter correctly.
315. Meet History cleanup assumptions were rolled back to restart from raw saved data. The page no longer infers sport from date/event/import notes, no longer forces Athletic.net Results Grid imports to Cross Country, and no longer suppresses exact duplicate rows in the view. Sport filtering now reflects the saved sport value only, while cached search/result fields remain for page performance.
316. Account Status now supports optional location verification with `expectedLocationId` / `locationId` query input or the `X-SMARTCoach-Expected-Location` header. The response returns a masked expected/resolved location and a boolean match flag without exposing tokens, so live Meet History investigations can confirm whether the current account maps to the intended GHL location before touching imported result data.
317. Meet History now includes a coach-facing **Data Audit** button for raw import troubleshooting. The audit panel summarizes loaded result rows by saved sport value, date window, import note type, season, top events, top meets, duplicate candidates, scheduled meet count, and active account key without changing filters or saved data.
318. Athletic.net Results Grid imports now preserve the first meet reference when the Meet List has duplicate dates, so a checked Aug 20 boys meet is not overwritten by a later same-date unchecked meet such as Southlake Carroll 3200. Meet History date-only display now renders local calendar dates so Aug 20 does not appear as Aug 19, and regression coverage protects both cases.
319. Meet History imported result rows now have coach-facing **Edit** and **Void** actions. The editor can correct saved meet name, date, sport, season, season year, event, result, PB/SB flags, and notes through the existing correction API, including historical imports that do not have active athlete contacts. Voids hide bad imported rows after a saved audit note, so coaches can repair wrong Athletic.net mappings without deleting an entire import.
320. Meet History import was simplified to reliable spreadsheet paths only. The coach-facing Data Audit button/panel, Athletic.net Import mode, screenshot/photo upload mode, and Athletic.net auto-detection route were removed from the page. Coaches can now import history only by uploading the CSV/TSV/template file or pasting spreadsheet/template rows, with regression coverage checking that the removed controls stay hidden.
321. Account owner recovery contacts tagged `smartcoach-account-owner` are now excluded from athlete rosters everywhere roster contacts are normalized: Athletes, Dashboard, and Athlete Calendar. This prevents a head coach/contact created by password recovery from appearing as an athlete even if the contact exists in GHL. Regression coverage verifies the owner tag remains excluded.
322. Keep Trak notes can now be edited from the SMARTCoach app Keep screen: tapping Edit loads the note back into the composer and Save Edit updates the same saved note, including coach/date/body changes. Attendance records now carry explicit sport, season, and season year values from the app attendance modal; the desktop Attendance page can filter, edit, and export those fields so Cross Country and Off Season Track can run at the same time without month-based assumptions. Regression coverage verifies both changes.
323. Desktop Attendance delete now uses an in-page confirmation dialog instead of the browser embedded-page alert. The dialog shows a clean coach-facing message plus athlete/date/season/group/checkpoint details, supports cancel, overlay click, and Escape, and regression coverage prevents `confirm()` from returning on the Attendance page.
324. The coach how-to guide now documents the latest Keep Trak and Attendance Trak workflows: SMARTCoach app Keep notes can be edited with Save Edit, Attendance marks include sport/season/season year, desktop Attendance can filter/edit/export those season fields, and deletes now show a clear confirmation with attendance details.
325. The Dashboard title now includes a **What's New** pill with an unread count and a compact update drawer. The drawer lists recent coach-facing updates by area, including Keep Trak, Attendance Trak, Meet History, and Coach Access, and uses account-scoped browser storage to remember when updates have been marked seen. The coach how-to guide and regression coverage were updated.
326. Upload/Paste Plan now supports assigning the same uploaded or pasted plan to multiple training groups. Coaches still choose one main Assigned Group for normal use, with an optional **Also Assign To** checkbox list for extra groups. Create-new saves one matching plan per selected group with that group's own calendar days; append-to-existing remains single-plan to avoid accidentally adding days to unrelated plans. The coach how-to guide and regression coverage were updated.
327. Desktop-only **Bug Trak** was added for beta feedback. The shared desktop help widget now shows a small Bug Trak button that opens a report form with area, urgency, summary, details, expected result, and optional coach contact fields. Reports post to `/api/smart-trak/bug-trak`, save to the customer account record under `bugTrakReports`, and optionally forward to `SMARTCOACH_BUGTRAK_WEBHOOK_URL` so a GHL workflow can create an immediate internal notification. This was not added to What's New; future What's New additions require explicit approval.
328. Bug Trak webhook notifications now include flat GHL-friendly top-level fields (`bugSummary`, `bugDetails`, `bugExpected`, `bugUrgency`, `bugArea`, `bugPage`, `bugCoachName`, `bugCoachEmail`, etc.) while still keeping the nested `report` object. This lets GHL workflow notifications use field-picker values directly instead of depending on nested `report.*` paths.
329. Bug Trak webhook payloads now also include prebuilt notification strings: `bugNotificationTitle`, `bugNotificationBody`, and `bugNotificationText`. These are intended for GHL Internal Notification actions when individual webhook fields render as `[object Object]`.
330. Coach how-to guide cleanup: setup-only Bug Trak/GHL field names were removed from `SMART_TRAK_COACH_HOW_TO.md`. The how-to should stay coach-facing; implementation/setup details belong in `VERCEL_SETUP.md` or project state.
331. Bug Trak webhook payloads now include extra plain-text aliases (`title`, `message`, `text`, `notificationTitle`, `notificationBody`, `notificationText`, `bugTrakTitle`, `bugTrakMessage`, and `bugTrakText`) so GHL Internal Notification actions can use a simple string field when the webhook picker renders object values as `[object Object]`. Setup guidance stays in `VERCEL_SETUP.md`, not the coach how-to.
332. Bug Trak GHL setup note updated with the confirmed working Internal Notification template using flat `{{inboundWebhookRequest.bug...}}` merge fields. This remains setup documentation only and was not added to the coach how-to.
333. Bug Trak was added to the Dashboard **What's New** drawer after explicit user approval. The What's New version was bumped so coaches see the new beta reporting item, and the coach how-to now mentions Bug Trak beta reporting in the Dashboard What's New description.
334. Desktop feedback now uses one **Feedback** button instead of a standalone Bug Trak button. The modal has **Bug Trak** and **Idea Trak** choices: bug reports keep the existing immediate notification path, while Idea Trak phase 1 saves private `idea` feedback records to the account for beta review without triggering an urgent bug notification. `PROJECT_PLAN.md` now carries Idea Trak phase 2 for a future approved idea board with upvotes/statuses.
335. Dashboard **What's New** was corrected to stay coach-facing: the internal Coach Access/account-owner recovery items were removed, Feedback now lists Bug Trak and Idea Trak together, and regression coverage blocks those removed internal Coach Access messages from returning. The coach how-to was also quick-cleaned to remove setup/provider wording from the plan/trial section and to describe Feedback without account-key/device technical details.
336. Dashboard current-week workout labels were clarified to reflect the actual calculation. The top card and Training Load summary now say completed workouts (`Completed this week`, `No completed workout`) because the values are calculated from completed/synced Performance Records, not scheduled Training Calendar plan days. Regression coverage checks the coach-facing labels.
337. Dashboard top summary now replaces the old **Active athletes** card with **Planned / completed** volume for the selected dashboard range. The planned side sums visible training rows' planned volume, and the completed side sums visible completed training volume. The coach how-to and regression coverage were updated.
338. Feedback-created support contacts are now guarded out of athlete rosters. Athletes, Dashboard, and Athlete Calendar exclude `support@smartcoach-pro.com` plus `smartcoach-feedback`, `smartcoach-bug-trak`, and `smartcoach-idea-trak` tagged contacts so GHL notification/email side effects cannot appear as athletes. Bug/Idea webhook payloads also include feedback tags and `excludeFromAthletes: true` for workflow tagging.
339. Dashboard planned/completed volume display was cleaned up so the top summary card shows planned miles on one row, completed miles on the next row, and the selected range as a smaller line underneath. Regression coverage now checks the separated row layout.
340. Dashboard Roster Summary now removes the old **With fitness** and **Missing fitness** summary cards and replaces them with an **Attendance** percentage card. The percentage uses the same Attendance Trak rule: Present, Late, and Checked Out count as attended; Absent counts against the rate; Excused is excluded from the denominator. Regression coverage prevents the old fitness summary cards from returning.
341. Dashboard search was tightened to match the coach-facing label **Search athletes or groups**. The search now matches athlete name, SMARTCoach athlete ID, and roster group names only; meet/training rows follow the matched roster athletes instead of matching activity text such as event names or workout prescriptions. This prevents searches like `400m` from returning athletes who only had a 400m workout/result but are not in the 400m group.
342. Dashboard labels were clarified for the training summary cards. The planned/completed card now says **Planned volume** and **Completed volume**. The current-week top card now says **Completed workout entries**, while the Training Load Summary cards say **Athletes completed workouts this week** and **Athletes without completed workout** to make clear those two numbers are athlete counts.
343. Dashboard summary cards were simplified to reduce redundancy now that Activity Range controls the view. The top summary row now places **Training Load Summary** beside **Activity Range**. Removed summary cards: Previous week volume, completed workout entries, athletes completed workouts this week, athletes without completed workout, volume miles, and this month miles. Training Load Summary now shows **Planned volume**, **Completed volume**, **Avg miles per athlete**, **On target**, and **Outside target**. Roster Summary now shows **Active**, **Attendance**, and a plain **Docu Trak** docs/missing summary loaded from the active Docu Trak checklist.
344. Dashboard Roster Summary Docu Trak card wording was simplified. The large value now shows the actionable count such as **109 missing**, and the smaller line shows the completion context such as **Docu Trak · 5/114 complete** instead of combining both in one dense line.
345. Dashboard header navigation now uses one **Simulator** button instead of separate Track Simulator and XC Simulator buttons. The button opens a compact chooser modal with Track Simulator and XC Simulator links that still use the account-aware page URLs. This keeps the header from spilling into an extra row while preserving both simulator pages.
346. Dashboard-only header layout was tightened for smaller screens. The two navigation rows now move left toward the title area, stay as two horizontal rows, and use horizontal row scrolling only when the viewport is too narrow instead of wrapping into a third row.
347. Training Calendar now has a coach-facing **Training Customization** modal. It shows the current target-percentage rules for Easy/Recovery, Long Run, Threshold, Interval, Repetition, Tempo, and speed-work efforts, lets coaches edit low/high percentages, reset to defaults, and saves the settings to the existing account registry under `trainingCustomization`. Account Status returns those saved rules so the SMARTCoach app can apply custom target ranges when calculating athlete workout targets. The coach how-to documents the workflow; this was not added to What's New because new What's New entries require explicit approval.
348. Training Customization was added to the Dashboard **What's New** drawer after explicit user approval. The What's New version was bumped so coaches see the new item, and the coach how-to Dashboard description now includes Training Customization as a coach-facing update area.
349. Dashboard customization was added as a display-only coach preference. **Customize Dashboard** lets a coach hide or restore optional dashboard tools: Keep Trak, Attendance Trak, Equipment Trak, Docu Trak, Weather, Records, and Simulators. Hidden tools disappear from dashboard shortcuts/cards only; direct page URLs still load, account data and summary calculations continue to run unless that specific card is hidden, and **Show All** restores every optional tool. Regression coverage checks the dashboard UI, direct-page access, summary-data flow, and restore path.
350. Dashboard Customization was added to the Dashboard **What's New** drawer after explicit user approval. The What's New version was bumped so coaches see the new display-only customization item, and the coach how-to Dashboard description now includes Dashboard Customization as a coach-facing update area.
351. `PROJECT_PLAN.md` now includes near-term **Partner Timing** planning for cross country race day. The planned phase 1 workflow is an offline shared-race merge: one coach creates a shared race session, assistants choose split stations such as 1600m/3200m/4800m/Finish, each coach records only that station, and SMART Trak combines synced station data into one race with missing/duplicate split warnings.
352. Athletes now has **Email Calendar Links** for bulk athlete-calendar delivery. It uses the existing per-athlete calendar-link endpoint, builds one personalized draft per active athlete in the current filtered view with a saved athlete email, and opens drafts through the coach's normal email app/provider using `mailto:`. Coaches can also copy all prepared messages or download a CSV for mail merge. This is separate from unreleased parent-email tools and does not send email from SMARTCoach servers. The coach how-to and regression coverage were updated.
353. **Email Calendar Links** now uses a visible per-athlete draft link as a fallback when the embedded page or browser blocks automatic `mailto:` opening. **Open Next Draft** prepares and clicks the current athlete's draft link, then leaves **Open Draft for athlete** visible so the coach can tap it manually. Regression coverage now rejects the older `window.location.href=calendarEmailMailto` behavior.
354. The athlete calendar draft fallback no longer uses `target="_blank"` on the `mailto:` link, which was opening a blank browser tab inside the embedded page. The generated `mailto:` URL also leaves the email address readable before the encoded subject/body query for better mail-client compatibility. Regression coverage prevents the blank-tab target from returning.
355. **Email Calendar Links** now includes an **Email Provider** selector in the bottom action row with Gmail, Outlook, Yahoo Mail, and Default mail app. Gmail is selected by default so coaches working inside the GHL embed open a real web compose window instead of relying on Chrome's blocked `mailto:` handler. Default mail app still uses `mailto:` for coaches with a local/default mail app configured. Tests cover the provider URLs, the visible provider selector, the Gmail default, and keep `mailto:` from forcing a blank tab.
356. Added `how-to.html` as an in-app SMART Trak How To Guide page. It fetches and renders `SMART_TRAK_COACH_HOW_TO.md` directly so the website guide stays current while the markdown file remains available for the chat prompt. The guide is opened from the desktop **Feedback** modal through **Open How To Guide** instead of crowding the Dashboard action row, and regression coverage checks the page, markdown fetch, text-guide fallback, and Feedback link.
357. SMARTCoach mobile app group/archive cache is now account-scoped. The previous local cache keys (`sc1`, `sc1_lid`, `sc1_rid`) were shared across accounts on the same device, so a coach opening a new account after previously logging into other accounts could see archived groups from those earlier accounts. Named accounts now read/write `sc1_<account>`, `sc1_lid_<account>`, and `sc1_rid_<account>`; only the default/dev account can read the old global keys. Regression coverage prevents direct unscoped `sc1` reads/writes from returning in `index.html`.
358. SMARTCoach mobile app Account settings now includes **Log Out** instead of account-switch/recovery controls. Logging out clears the current account's access code, signed session, and selected coach identity on that phone, then reloads the same account link without deleting account-scoped groups/archive data or the selected account key.
359. SMARTCoach mobile app home header now says **SMARTCoach** instead of **Groups**, since the screen is the app home for training, meets, archive, and daily tools.
360. SMARTCoach mobile app timing/detail header now uses **Back** instead of **Groups**, removes the logo from the center title area, and applies a long-title layout so meet names have more room before the Share button.
361. Coach how-to Meet History import instructions now match the current spreadsheet-only import workflow. The guide no longer lists Athletic.net Import as an available option and tells coaches to use spreadsheet/template rows for Athletic.net-sourced results.
362. SMARTCoach mobile app bare-entry behavior now stops on Account access instead of silently opening the default app shell. If a coach opens `app.smartcoach-pro.com` without an account link or remembered account, the app opens Account settings and asks for the school account key plus coach access code before loading SMART Trak data.
363. SMARTCoach mobile app Account settings is now blocking when account access is missing or locked. The Close button no longer drops a coach into Training/Meets/Archive without an account key/access code, and SMART Trak data loading waits until device access is ready.
364. SMARTCoach mobile app no longer seeds blank/new accounts with default **Workout 1**, **Workout 2**, and **Workout 3** training groups. First-time accounts now show an empty Training list until the coach creates or syncs real groups.
365. Partner Timing phase 1 has started in the SMARTCoach mobile meet flow. Meet groups now have a Partner tray button that opens Partner Timing setup/review, default stations for Start/1600m/3200m/4800m/Finish, station-specific athlete tap capture, account-level Partner Timing sync/reload, and a review view that flags missing and duplicate station taps before official meet-result save decisions.
366. Partner Timing now shows a shared running race clock after **Record Race Start**. The clock appears at the top of the meet runner screen and inside the Partner Timing sheet, and it keeps updating even when a station coach is not running a normal athlete stopwatch.
367. Partner Timing race behavior was corrected to feel like normal race timing: the main **Start/Stop** button controls the shared race clock, every athlete row shows the running race time, tapping an athlete at the selected station freezes that athlete's row at the station split/finish time, and Reset clears the shared Partner Timing clock/taps across sync.
368. Partner Timing now has a visible **Reset Race Clock** button inside the Partner Timing sheet. It uses the same reset path as the main meet-screen Reset button, clearing the shared race clock and station taps across sync.
369. Partner Timing station capture is clearer for assistant coaches. The Partner Timing sheet now says which station is being recorded and tells coaches to close the sheet and tap **Mark [station]** on runner rows as athletes pass.
370. Partner Timing station tap feedback is now stronger on the runner row itself. The station button changes from **MARK [station]** to a green **DONE [station]** button with the captured split time, and the row briefly highlights after the tap.
371. Partner Timing now supports multiple selected capture stations on one coach device. A coach can select stations such as 1600m and 4800m together, each runner row renders one **MARK [station]** button per selected station, and each button independently changes to **DONE [station]** with its captured split.
372. Partner Timing sync is clearer and separate from normal meet-result saving. The Partner sheet now shows **Sync Partner Timing** with visible syncing/synced/error feedback, and the normal meet-result save warning now points Partner Timing users back to the Partner sync path instead of asking them to select athletes.
373. Partner Timing race clocks can continue after an accidental stop. A stopped Partner Timing clock now shows **Continue** / **Continue Race Clock**, clears the stopped timestamp, and resumes from the original race start.
374. Partner Timing station selection now uses a Partner-specific tap handler instead of the generic picker behavior. Station taps respond directly on phone touch events, and the panel shows a visible **Selected:** status line so the coach creating the session can confirm selected stations immediately.
375. Partner Timing station selection now uses real checkbox controls in the Partner panel instead of custom row-tap buttons. This makes selecting 1600m/3200m/4800m/Finish more reliable on phones and gives the coach an immediate checked state plus the visible **Selected:** line.
376. Partner Timing station rows now also have a delegated row-level touch/click handler. The checkbox is visual, while the entire station row toggles selection from document-level Partner panel events, avoiding mobile webview cases where native checkbox `change` events do not fire.
377. Partner Timing station selection was simplified again to use the app's normal large button pattern instead of checkboxes. Stations now render as **Select [station]** / **Selected [station]** buttons, using the same button interaction path as Start, Reset, and Sync.
378. Mobile button taps now resolve the nearest enclosing `<button>` before firing `.click()`. This fixes Partner Timing station buttons when the coach taps the text or sublabel inside the button instead of the button element itself.
379. Partner Timing station selection has been moved back to the original mobile picker-row interaction pattern that previously responded on phones. The newer multi-station selection, station status text, runner-row MARK/DONE buttons, race clock, reset/continue behavior, and sync flow remain in place; only the station chooser surface was restored to the known responsive pattern.
380. Partner Timing station rows now have a direct row-level mobile touch handler. Tapping a station updates the Partner Timing panel immediately, suppresses the follow-up browser click so the station is not toggled back off, and then refreshes the runner list so selected station MARK/DONE buttons appear after closing the panel.
381. Partner Timing has been simplified to a record-first workflow. Coaches no longer choose stations before the race; Partner Timing keeps the normal athlete **Lap** and **Stop** buttons visible, records laps as Split 1/Split 2/Split 3 and stops as Finish with the coach name attached, and uses Review after sync to confirm missing/duplicate split or finish taps.
382. Partner Timing sync now polls the shared race session while Partner Timing is enabled so assistant devices can pick up the shared start time automatically instead of running independent clocks. Synced Continue actions can also clear a previously synced stopped-clock marker, and Review now labels same-athlete/same-split extra captures as **multiple taps** instead of **duplicate**.
383. Partner Timing server merge now protects the shared race start from being cleared by an assistant device that turns Partner Timing on before it has loaded the shared start. Empty assistant sessions preserve the existing start/finish state, while a real Continue still clears the stopped marker because the shared start is included.
384. Partner Timing Reset now sends an explicit reset marker that is allowed to clear the shared start/finish clock on the server. This keeps the assistant-device protection from blocking a real reset. Reset also clears local runner timers/laps/saved runs, and Stop refreshes the visible race clock/buttons immediately while keeping Continue behavior tied to the original start time.
385. Partner Timing athlete-row finish/resume behavior is now shared. When any device taps an athlete row **Stop**, the synced Finish record freezes that athlete on all devices and saves the total with current splits. If the stop was an error, tapping that athlete's row **Start** records a Resume marker, keeps the mistaken finish in the review history, and resumes the row at the current shared race-clock time.
386. Partner Timing sync now treats record `stationId` as a fallback when `kind` is missing, so `finish` records still stop athlete rows and `split_#` records still appear in Review even if older/normalized sync data does not include an explicit kind. The Sync Partner Timing status now reports local tap count before sync and shared tap count after sync.
387. SMARTCoach mobile meet-result saving now bridges Partner Timing into official SMART Trak records. Opening or tapping **Save Meet Results** on a Partner Timing meet pulls the latest shared split/finish taps, converts synced finishes into normal saved runner results with split labels, and then submits them through the existing meet-result route. Mobile meet groups now preserve/infer meet sport, and timed/relay/field/plan-attached meet saves use that sport instead of hardcoding Track, so Cross Country results land in the correct SMART Trak context. The coach how-to now clarifies that **Sync Partner Timing** combines taps while **Save Meet Results** creates official Meet History records.
388. SMARTCoach mobile meet-result saving now paces official result submissions one at a time and retries temporary `Too Many Requests` responses before failing. Partner Timing row stops now tag the local saved run with the shared finish record id, and synced Partner Timing saves dedupe matching unsynced local finish rows so the Save Meet Results screen shows/saves one official finish per athlete instead of duplicate local/shared entries.
389. SMARTCoach mobile meet groups now use meet-day display defaults. New and existing meet groups turn off Rep/Rest Splits, Plan on Detail Line, Target on Detail Line, and Sync Status on Detail Line by default, while training groups keep the normal training defaults. A one-time meet-day defaults marker prevents existing meet groups from repeatedly resetting if a coach later changes settings manually.
390. Onboarding subscriber support now loads the selected subscriber account directly into the setup form when **Load** is clicked from the subscriber table. This prevents an old setup-form plan, such as Pro 25, from remaining visible beside a subscriber row that is saved as Pro Unlimited. The onboarding page also now recognizes `Pro Unlimited (Custom)` as an Unlimited alias instead of normalizing it back to Pro 25.
391. SMARTCoach athlete counts are now gated to SMART Trak roster members instead of ordinary GHL contacts. The athlete API plan-limit check and dashboard roster normalization require the `smartcoach-athlete` tag before a contact can count as a SMART Trak athlete, while system/support contacts remain excluded. Regression coverage checks that untagged GHL contacts cannot inflate active athlete counts.
392. SMARTCoach mobile field events now warn before **Clear Flight Draft** removes athletes and unsaved attempts. Legal field marks entered in feet/inches are normalized to quarter-inch decimal formatting on save, such as `15-0.25`, and the horizontal jumps/throws attempt info page now shows the mark as the bold top line with the attempt/status line underneath.
393. Dashboard Training Load Summary now calculates **Avg miles per workout** as completed training volume divided by completed workout entries in the selected view. The card no longer averages completed volume by active athletes, and regression coverage checks the workout-based divisor.
394. Dashboard Volume by Athlete summary now labels the per-athlete volume card **Average Volume Per Athlete** to make clear that it is athlete-based volume within the filtered volume view.
395. Added **Share Miles Board** for friendly summer mileage competition. Coaches set the Dashboard activity range, click Share Miles Board, and get a signed read-only link to `/miles-board.html`. The public board uses a tokenized API that returns only sanitized leaderboard data: athlete name, groups, total miles, current-week miles, workout count, average per workout, and last logged date. It does not expose contact info, coach notes, PB/SB detail, attendance, or edit actions. The coach how-to documents the workflow.
396. Added the next Miles Board competition layer. The signed public board now returns and displays challenge highlights for mileage leader, current-week leader, consistency leader, and biggest positive week change. It also includes a Pack Challenge table that totals miles, workouts, athletes logging miles, and current-week miles by group. Athlete rows now include week change while the board remains read-only and sanitized.
397. Miles Board Pack Challenge now rolls up by athlete gender division instead of every training group, so the public competition view is Boys vs Girls. Athletes without a saved gender appear under Unlisted rather than being dropped.
398. Added the Miles Board sharing control layer. Dashboard **Share Miles Board** now opens a Miles Board Sharing modal where coaches choose the challenge type (Total Miles, This Week, Consistency, or Big Mover), copy/open the current range link, turn sharing off, or reset the link. Sharing state is saved per account; turning it off blocks the public board, and resetting rotates the token version so older links become invalid. The public board now uses the selected challenge type as its default ranking.
399. Miles Board Sharing now allows multiple challenge types at once. Coaches can check Total Miles, This Week, Consistency, and/or Big Mover; the first selected challenge sets the public board's default sort, and selected challenges control which highlight cards appear. The API stores both `challengeTypes` and the primary `challengeType` for compatibility.
400. Added the Miles Board gamification layer. Coaches can now select **Game Score** as a challenge type. Public board rows include points and badges, and the Pack Challenge includes division points. Game Score currently awards points for total miles, logged workouts, current-week miles, positive week change, and a consistency bonus for logging on at least three days; badges include 25/50/100 Mile Club, Consistency, This Week, and Big Mover.
401. Added **Miles Board Game Settings**. Coaches can now name the mileage challenge, set optional team and athlete mileage goals, and adjust the point weights for miles, workouts, current-week miles, improvement miles, consistency days, and consistency bonus. The public board uses the saved settings for Game Score, shows team goal progress and athlete goal cards, and adds a Goal Hit badge when the athlete goal is reached.
402. Added live **This Week's Winners** to the public Miles Board. The API now calculates current-week game score, mileage winner, consistency winner, biggest mover, and Boys vs Girls pack winner from weekly values. The public board renders those winners as awards without adding coach editing controls.
403. Corrected the Miles Board desktop card layout so the top metric cards, Challenge Highlights, and This Week's Winners each fit on a single row. Reverted the accidental Dashboard summary layout change from the prior pass.
404. Added the next Miles Board competition layer. Coaches can add an optional coach message in Miles Board Sharing, and the public board now shows that message, a Weekly Snapshot, team goal progress, and per-athlete goal progress bars while remaining read-only.
405. Fixed Miles Board weekly stats so **This Week**, Weekly Snapshot, weekly winners, and pack current-week totals anchor to the selected board range's ending week instead of the hosting server's current calendar week.
406. Added **Miles Board Weekly Snapshots**. Coaches can save the currently selected Miles Board range from the sharing modal, storing totals, winners, pack leader, and coach message on the account. Public Miles Boards now show saved snapshots under **Past Weeks** while keeping the board read-only.
407. Added **Miles Board Display Mode** and expanded badges. The public board now has a Display Mode toggle for a larger Top 10 view suited for a projector/TV, and the API adds badges for 20/30 Mile Week, Comeback Runner, Streak Leader, and Pack MVP.
408. Updated the coach how-to for the Miles Board public rollout. The guide now includes a short athlete-facing posting explanation and the exact criteria for each Miles Board badge.
409. Promoted **Miles Board** into its own coach how-to section so the sharing setup, Display Mode, weekly snapshots, public board fields, and badge criteria are easy to find in SMARTCoach Help.
410. Removed the raw **Open Text Guide** link from SMARTCoach Help. The rendered How To page already shows the latest guide, and removing the raw markdown link prevents coaches from landing on a text-only page with no dashboard navigation.
411. Added **Miles Board** and **Partner Timing** to the Dashboard What's New drawer after explicit user approval. The What’s New version was bumped so coaches see the read-only mileage board, challenge/badge layer, Display Mode, weekly snapshots, and shared race-day timing updates.
412. Fixed Athlete Setup group reconciliation so saved Training Groups are not hidden when their stored member ids no longer match the currently loaded roster ids. Groups now stay visible on desktop while preserving matched athlete cleanup when matches are available.
413. Added a future **MileSplit integration discovery** note to `PROJECT_PLAN.md` for later recall, including the partner/API questions to ask MileSplit/FloSports, required result fields, what SMARTCoach should provide, and the preferred coach-authorized integration ask.
414. Tightened Athletes roster contact inclusion so GHL contacts created by normal email/conversation activity do not appear as unnamed **Needs setup** athletes. The Athletes page can still show SMARTCoach roster members and named setup candidates with SMARTCoach roster fields, but generic email-only contacts are filtered out.
415. Added **Field Practice** phase 1 for pole vault practice tracking. Coaches can open Field Practice from Training Calendar, choose focus/routine/group/athlete, complete a drill checklist, log bungee/crossbar attempts by height with O/X/pass and per-attempt notes, copy an athlete preview, and save sessions to the account registry under `fieldPracticeSessions`.
416. Fixed shared Training Group sync between desktop Athlete Setup and the SMARTCoach app. Group saves now merge with the saved account group roster instead of replacing the whole list from one device, archived groups remain synced as archived, desktop hides archived groups in setup, and true deletes send an explicit delete id.
417. Added an internal Admin Cleanup tool to `onboarding.html` and `/api/smart-trak/account-cleanup` for demo/test accounts. It requires the automation secret plus typed Account Key and saved Location ID confirmation, and can selectively reset shared groups, completed workout mirrors, attendance, Keep Trak, Equipment Trak, Docu Trak, Partner Timing, Field Practice, Miles Board sharing, dashboard customizations, weather locations, and optional Bug/Idea reports without changing subscription, coach access codes, owner info, athletes, meets, Location ID, or token.
418. Improved **Field Practice** pole vault logging. Practice heights now clean to feet-inches quarter-inch format, attempts are grouped into setup/height patterns such as `9-0 Crossbar [XOXXO]`, saved practice cards show the attempt pattern, Athlete Preview includes an attempt summary, and the field-practice API normalizes saved heights and stores the optional attempt summary.
419. Added **Field Practice** to the SMARTCoach mobile app. The main SMARTCoach screen now has a Pro-only **Field** tool that loads saved desktop Field Practice sessions, lets coaches open a practice, check drills, add O/X/P pole vault attempts by bungee/crossbar and height, and save the same record back through `/api/smart-trak/field-practice`.
420. Moved the desktop **Field Practice** button from the Dashboard to the Training Calendar header, matching the other Training Calendar action buttons. The Dashboard navigation button for Training Calendar now displays as **Training**.
421. Field Practice header button hierarchy was polished so **Dashboard** is the only primary blue button, Training/Athletes/New Practice use the light-blue action style, and Refresh is intentionally muted.
422. Field Practice header buttons now use the same explicit desktop button font rules and top-button sizing pattern as Training Calendar. The page subtitle now describes field events generally instead of pole vault only.
423. Dashboard header action rows now stay on one line in the embedded desktop view, with horizontal overflow instead of wrapping Weather or other navigation buttons to a third row.
424. Dashboard Customize Dashboard moved out of the title row to a small text control above Activity Range, and dashboard header buttons now keep a consistent 34px height with no label wrapping.
425. Remaining desktop navigation button labels that pointed to `/training-calendar.html` were shortened from **Training Calendar** to **Training** across coach-facing pages and generated admin page links.
426. Desktop Attendance row edits now replace the original attendance key on every save. This prevents sport/season/status edits from adding a second attendance record when the registry key changes.
427. Miles Board Team goal progress card now shows both progress and the actual team goal, such as `4% of 5,000 mi`, while keeping the progress bar.
428. Athlete Calendar now supports coach-created completion questions. Coaches open **Athletes > Calendar Questions**, save up to five Complete/Modify/Skip questions, and mark any question required. Athlete answers are validated on the athlete calendar modal and appended into the completed workout Athlete Note alongside the regular notes field.
429. Equipment Trak now supports coach-issued equipment. The Athletes page Equipment Trak modal includes a **Coach Issued** tab where coaches can assign items such as watches, radios, or timing gear to staff by coach name without creating athlete roster contacts. Coach-issued items appear in Equipment Issued reports/CSV, count against inventory totals, share numbered-item duplicate protection with athlete-issued gear, and carry forward during equipment season rollover when still issued or lost/damaged.
430. Added **Athlete Calendar Questions** to the Dashboard **What's New** drawer after explicit user approval. The What's New version was bumped so coaches see the new Complete/Modify/Skip question workflow.
431. Added the Pro plan downgrade guard. Account automation and setup preview now block lowering to a capped plan such as Pro 25 when the current active SMART Trak roster exceeds the requested plan limit. Coaches/support must mark athletes inactive first; SMARTCoach does not auto-deactivate the last-added athletes. Product docs now describe the 30-day Pro 100 beta trial and downgrade limit rule.
432. Share Miles Board now lets coaches choose whether attendance appears on the public board. Team Attendance % can be shown as a top card, Athlete Attendance % can be shown as a sortable leaderboard column, and both stay hidden from the public API unless enabled in Miles Board Sharing. Attendance uses the same Present/Late/Checked Out counted-as-attended rule as the Dashboard.
433. SMARTCoach mobile app calendar workout priority was fixed. Group-assigned workouts created on the Training Calendar now auto-attach to the matching phone app group even if that group previously had a saved group plan selected, and saved group plans no longer overwrite an active SMART Trak Calendar workout before practice.
434. Equipment Trak coach-issued items can now be edited or deleted from the Coach Issued tab. Numbered gear assigned to coaches is duplicate-protected against athlete-issued gear using a global assigned-number guard, while athlete-vs-athlete duplicate checks still honor separate inventory pools.
435. Equipment Trak inventory rows now support Lost / Damaged availability without deleting the item from inventory. Coaches can mark a full inventory row unavailable or list lost numbered items / lost quantity; those counts reduce Available, appear in Lost / Damaged, and block the gear from being issued again. Number ranges now support alphanumeric watch labels such as `G1-G20` so `G15` is recognized correctly.
436. Equipment Trak setup was moved out of individual athlete details and into the Equipment Trak modal header as Setup Items. Saving setup now refreshes Equipment Trak item filters, issue sheet columns, coach issue options, inventory item dropdowns, and the open athlete equipment detail so newly added items such as Watch appear immediately.
437. Equipment Trak Setup rows can now be reordered with compact arrow controls. The saved row order is preserved and drives the Issue Sheet column order, so coaches can place uniforms, warmups, watches, chips, and bags in the order they want.
438. Docu Trak Setup was cleaned up so the checklist Add control sits in the Checklist Requirements header instead of the sticky footer. The Athletes page subtitle was shortened to remove the unnecessary "coach-facing view" wording.
439. Miles Board info bubbles now match the Dashboard-style custom tooltip instead of native browser title bubbles. Leaderboard and Display Mode athlete rows no longer show training groups under athlete names, keeping the public board cleaner for athletes and parents.
440. SMARTCoach mobile Attendance now opens with Sport blank and requires coaches to choose Cross Country or Track before saving, preventing accidental Track-only attendance records.
441. SMARTCoach mobile calendar workout cards now apply the tapped workout immediately to the active group/athlete, so the timing screen updates from the previously selected calendar day instead of only changing the selected card label.
442. SMARTCoach mobile calendar selections now distinguish coach-selected calendar workouts from auto-filled "today" calendar workouts. Choosing a future workout and using it for the group no longer gets overwritten by the current-day workout when returning to the Training screen.
443. SMARTCoach mobile athlete-mode calendar picker now has a true **Use for Group** action. When a coach opens the picker from an athlete, selects a future workout, and taps Use for Group, the selected workout is saved onto the group and the athlete is returned to that updated group plan instead of clearing back to the old group workout.
444. SMARTCoach mobile group workout selection now persists the calendar-selected marker, reopens the picker on the currently active calendar workout, and clears stale runner-level SMART Trak Calendar overrides when **Use for Group** is tapped. This prevents old athlete-level targets, such as a prior 4x400 workout, from overriding the newly selected group workout, such as 3x1 threshold.
445. SMARTCoach mobile workout cards now only select the workout inside the picker; they no longer auto-apply to the current athlete. The bottom buttons are the only apply actions: **Use for Athlete** creates an individual override, and **Use for Group** changes the group workout. This prevents accidental "Individual Plan" overrides from keeping old targets after a group workout change.
446. SMARTCoach mobile **Use for Group** now clears runner-level SMART Trak Calendar overrides whose saved title includes an athlete/group suffix, such as `SMART Trak Calendar - vivi & abby`, and clears cached runner targets before repainting. This fixes the case where the picker said the workout changed but timing rows still showed the old individual target.
447. SMARTCoach mobile group screen reloads now respect coach-selected calendar workouts. When a group has a `calendar-selected` workout, the automatic plan refresh no longer reapplies athlete-specific assigned plans on Back/Done and reverts the timing rows to the old target.
448. SMARTCoach mobile calendar workout detection now recognizes calendar-selected workouts even when the calendar day id is missing. Titles that start with `SMART Trak Calendar`, plus saved calendar date/title/details/target fields, now block the auto-plan refresh from restoring the old assigned workout when Done/Back is tapped.
449. SMARTCoach mobile calendar workout changes can now be changed again after the first successful group change. Calendar workout cards use a stable date/title/details/target comparison when ids are missing, group-selected calendar workouts win over stale runner calendar plans on timing rows, and true athlete-only calendar selections are tagged separately.
450. SMARTCoach mobile **Use for Group** now writes the selected workout onto every runner in the current group as a `calendar-group-selected` plan. This removes the old split-brain behavior where the athlete detail screen could show the newly selected workout while the group timing rows still read stale runner targets after Back/Done.
451. Dashboard **Log Miles** now supports **Quality Session** entries. Coaches can manually log warmup, cooldown, sets, rest, rep splits, effort, and notes for an individual or group. The save still uses the existing completed-workout sync path, so quality sessions appear in Training Load / Completed Workouts with split labels such as `Set 1 Rep 1`.
452. Athlete Calendar now lets athletes add a workout that was not already assigned on their calendar. The athlete-facing page includes **+ Add Workout** with Easy Run and Quality Session modes. Quality sessions can capture warmup, cooldown, reps, distance, rep splits, rest, effort, total time, and notes. These entries save through the same completed-workout sync path as athlete submissions, appear as athlete-added completed workouts in SMART Trak, and do not alter the coach-created calendar plan.
453. SMARTCoach mobile Speed Metrics capture was tightened for practice use. The speed screen hides the extra New Practice/Refresh controls, opens with athlete rows collapsed, expands/collapses one athlete at a time, uses one Start/Stop button per rep, and moves athlete removal to a smaller confirmed session-only action away from New Rep.
454. SMARTCoach mobile Speed Metrics was compacted further for sensitive touch screens. The session setup card is shorter, the footer Results button is hidden because the leaderboard already prints inline, and athlete ordering now uses the row drag handle instead of Move Up/Move Down buttons.
455. Dashboard **Share Miles Board** was relabeled to **Miles Trak** without changing the existing Miles Board sharing workflow. Training Calendar now includes **Miles Trak** and **Speed Trak** buttons so coaches can reach mileage sharing and speed leaderboards from the Training page.
456. Added **Speed Trak**, a coach board for saved Speed Metrics practice reps. Coaches can filter by speed metric, gender, year, athlete search, and top count. The board shows year, athlete, grade, mark, date, and calculated velocity, stride length, and stride frequency when enough rep data is available.
457. Speed Trak now uses the same saved SMART Trak coach session/access-code headers as Field Practice and other protected coach pages. Opening Speed Trak from the embedded dashboard should load the board without asking for a fresh access code.
458. Speed Trak now supports spreadsheet import by CSV/TSV upload or pasted rows. Coaches can download a template, preview speed marks, and save valid rows as Speed Metrics Field Practice sessions. Imported rows preserve athlete, metric, mark, date, year, grade, gender, notes, and optional stride count; velocity, stride length, and stride frequency calculate when enough data is present.
459. Speed Trak now supports coach-managed result maintenance. Coaches can add a one-off speed mark without a spreadsheet, edit row details for corrections, or delete an incorrect speed result. Saves update the underlying Speed Metrics practice data and refresh the leaderboard calculations.
460. Dashboard Training Load now includes saved Speed Metrics sessions. Each athlete with at least one saved speed rep gets one completed workout, speed volume counts only timed rep distance (for example, 5 x 30m = 150m), warmup/cooldown are excluded, and Completed Workouts details show Speed Metrics rep breakdowns.
461. Dashboard and Training Calendar Log Race Result now show the full Cross Country race event list instead of only 2 Mile, 3200m, and 5K. Cross Country entries include Marathon, Half Marathon, 15K, 10K, 5K, 2 Mile, 3200m, 3K, 1 Mile, 1600m, 1500m, 800m, and Other.
462. Training Calendar Log Race Result now keeps the last loaded athlete/group roster if a dashboard refresh briefly returns empty, and the athlete dropdown uses the selected meet's matching calendar group roster when available. This prevents coaches from losing all athlete choices after saving multiple race results for a group-attached meet.
463. Miles Board links now carry Cross Country plus a season year instead of relying only on date-derived current season logic. Public Miles Board rows filter by saved sport/year, new phone-app syncs and manual mileage saves persist sport/year on performance records, and older records without sport only count when their saved season/group labels clearly identify Cross Country.
464. Public Miles Board load failure was fixed after the sport/year filter called a dashboard-local `yearFromDateValue` helper that had not been defined in the dashboard API bundle. The helper is now included next to the public board date parsing helpers, with regression coverage so Miles Board and related public board loads do not crash on date-year fallback.
465. Miles Board Sharing now includes training-group selection. The selected group names are saved on `milesBoardSharing.groupNames`, preserved by the account sharing endpoint, and enforced by the public Miles Board API before mileage totals are calculated. When groups are selected, the public board only displays athletes with matching selected-group mileage rows.
466. Miles Board Sharing now includes a board date-range selector. Coaches can use the Dashboard activity range, last 7/14/30 days, all dates, or custom start/end dates. The selected range is saved on `milesBoardSharing.dateRange`, and link creation uses that board range when writing the public board `start` and `end` parameters.
467. Miles Board selected groups now determine the board athlete roster instead of filtering individual workout rows by `group_name`. The public board route derives selected athlete keys from saved `smartcoachGroups`, passes those keys to the dashboard API, and then counts all saved miles for those selected athletes in the board date range, including manual miles or app syncs that were not attached to the selected group.
468. Miles Board Sharing now loads training groups directly when the modal opens. The group selector no longer depends on the main Dashboard refresh succeeding, so coaches can still choose Miles Board groups even if the dashboard data panel is showing an update failure.
469. Dashboard season filtering now uses saved sport/year labels when records have them instead of relying only on month-derived Winter/Spring/Summer/Fall buckets. `Current season` now includes current-year records, and saved sport/year options such as Cross Country 2026 or Track 2026 can appear in the Dashboard season filter. Manual mileage now sends `season: Cross Country`, and the manual-mileage backend falls back from `sport: Cross Country` to `season: Cross Country` before using date buckets, so Cross Country mileage is not misfiled as Summer/Fall.
470. Dashboard completed-workout volume now receives the full fetched training sync list instead of only the first 100 rows. This fixes athlete mileage and expanded completed-workout detail being undercounted when older rows, such as early-June miles in a board range, fell outside the first 100 newest workouts.
471. Miles Board Cross Country filtering now counts older unlabeled mileage records as legacy Cross Country mileage when they have completed miles and do not clearly identify Track, Speed, sprint, runway, field event, jump, or throw work. This keeps saved sport/year filtering exact for newer labeled rows while restoring full board totals for older Manual Mileage records that predate sport/year persistence.
472. Miles Board legacy mileage matching now treats old Winter/Spring/Summer/Fall/Unspecified/Unlisted season values as date buckets, not sport labels. Older Manual Mileage rows with `season: Summer` and no saved sport can now count on the Cross Country Miles Board when they are in the selected year/date range and do not clearly identify non-distance work.

## Known Good Test Flow

Use this as the current launch regression test:

1. In `onboarding.html`, run Check System and confirm it says Ready for initial rollout.
2. For a live Pro test account, run Test Setup First, then Save Account Setup.
3. Lookup the account and confirm the customer account record is saved with subscription, coach seats, SMART Trak connection, and coach access-code readiness.
4. Check Customer Access and confirm account access, account source, SMART Trak connection, and device/coach-code status.
5. Open Dashboard, Athletes, Training Calendar, Keep Trak, Athlete Setup, Upload/Paste Plan, Auto Build Plan, Meet History, Records, Track Simulator, XC Simulator, and Weather with the customer account key.
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
16a. Add one Keep Trak note on desktop, confirm it appears on the SMARTCoach app Keep view, mark it complete on the app, and confirm it is greyed out after refresh.
17. Trigger the GHL Subscription Payload once and confirm account lookup shows the recent account update without exposing private tokens or coach access codes.
18. Confirm parent email controls remain hidden/off for initial rollout.
19. Complete live smoke-test checks, stamp launch sign-off, copy the activation record, copy the coach invite, and complete the post-launch first-login/first-sync/bulk-archive follow-up.

## Notes For Future Codex Sessions

- Read this file first.
- Then inspect the relevant page/backend only for the task at hand.
- Do not guess or assume when an issue is reported. Trace the actual data flow first: UI control, local state, API payload, backend handler, saved record shape, reload/render path, and any tests that cover the behavior.
- Give short progress updates while working, especially before edits and after learning something important from tracing.
- Do not rework the whole app unless asked.
- Keep changes scoped.
- Use `rg` for searches.
- Use `apply_patch` for edits.
- Ignore unrelated dirty files unless they affect the current task.
- After frontend edits, provide the user direct confirmation steps.
