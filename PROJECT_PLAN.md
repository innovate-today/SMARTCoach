# SMARTCoach Project Plan

## Project Identity

SMARTCoach is a coaching platform that connects practice timing directly to a long-term athlete career database and guided coaching tools.

Core vision:

SMARTCoach is the only platform that connects the stopwatch at practice to a 4-year athlete career database with guided training insight. MaxPreps tracks results. V.O2 tracks mileage. SMARTCoach tracks the actual training in real time.

## Current App

Live app:

- `https://app.smartcoach-pro.com`

Deployment/source of truth:

- The active app is deployed through Vercel.
- The underlying CRM integration is GoHighLevel, but the coach-facing desktop product is branded as SMART Trak.
- SMARTCoach has been confirmed to sync successfully with SMART Trak.

Current consolidated repo:

- `/Users/marcusmoore/Documents/Codex/2026-04-30/continue-with-smartcoach/smartcoach-repo`

Current local browser preview:

- `file:///Users/marcusmoore/Documents/Codex/2026-04-30/continue-with-smartcoach/smartcoach-repo/index.html`

## Phase 0: Existing App

Status: Done

Existing features:

- Multi-runner stopwatch with lap timing
- Group management: create, delete, name groups
- Swipe to delete runners
- Selective start: tap circle to choose which runners start
- Share results modal
- SMARTCoach Pro/GHL Sync button
- Hosted/deployed through Vercel

## Phase 1: GHL Sync

Status: Done and confirmed working

Goal:

- Tap Share, then Sync to GHL/SMARTCoach Pro
- Tag the session with Season, Phase, Workout Type, Energy System, Surface
- App calls GHL API directly or through server function, avoiding webhooks and per-execution charges
- Creates athlete as a GHL Contact if new
- Adds workout session as a Note to that contact
- Uses the `smartcoach-athlete` tag only for broad athlete identification. Season, workout type, phase, surface, and weather belong in custom object records and notes, not as contact tags.

Example session note:

```text
SMARTCoach Session - Apr 26, 2026
Group: Speed Work | Season: Spring
Phase: Competition | Type: Special Endurance I
Energy System: Glycolytic | Surface: Track

Athlete: Avery Womble
  Run 1: 0:52.4 | Laps: 0:26.1 / 0:26.3
  Run 2: 0:53.1 | Laps: 0:26.8 / 0:26.3
```

## Phase 2: Move To Vercel

Status: Done

Reason:

- Vercel deploys quickly
- Vercel supports server-side functions
- Vercel enables subscriptions, auth, and server-side coaching logic
- Vercel is the active deployment environment for `app.smartcoach-pro.com`

Changes:

- Same app
- Same URL: `app.smartcoach-pro.com`
- Zero disruption for current users
- Enables subscription gating, auth, and server-side coaching logic
- Enables server-side support where needed

## Phase 3: Training Pace Calculator

Goal:

- Coach enters or selects the athlete's current fitness source, for example `400m: 52.0s`
- SMARTCoach calculates training zones as percentages by energy system
- Adjusts for current training phase, fatigue index, days since last hard session, and temperature
- Displays target splits before each workout
- Updates automatically as new performance data comes in

Initial training categories:

- Acceleration, ATP-PC: 10-30m fly sprints
- Max Velocity, ATP-PC: 30-60m at 95-100%
- Speed Endurance I, Glycolytic: 150m at 88-95%
- Special Endurance I, Glycolytic: 300m at 85-90%
- Lactate Threshold, Mixed: 400m at 82-88%
- Intensive Tempo, Aerobic: 400m at 75-82%
- Extensive Tempo, Aerobic: 400m at 65-75%

## Phase 4: Athlete Career Database In GHL

Detailed data model:

- `SMART_TRAK_DATA_MODEL.md`

GHL custom objects:

- Athlete Contact: name, sport, primary event, grad year, gender, school
- Performance Record: every timed session, splits, phase, workout type, energy system
- Meet: season meet schedule used by the app's meet-day dropdown
- Meet Result: official race results, event, time, place, splits, conditions
- Season Record: full season summary, volume, peak performance, injury log
- Athlete Best: athlete-level parent object for lifetime PBs and current season bests by event
- Records: school/team/club records by event, classification, gender, season, and record scope
- Training Plan: guided or manually created plan per group or athlete

Seasons tracked:

- Summer: off-season cross country prep, aerobic base
- Fall: cross country season, 5K/3K race results
- Winter: off-season track prep, speed foundation
- Spring: track and field season, event PRs

## Phase 5: Coach Dashboard

Separate Vercel desktop web app.

Dashboard views:

- Roster: all athletes with current phase, status, trend arrows
- Individual Athlete: full career timeline, sessions, PRs
- Workout Builder: SMARTCoach suggests the next session based on data
- Training Calendar: week view with planned vs completed
- Meet Results: season bests, PRs, qualifying standards
- Team Analytics: group trends, training load, compliance

## Phase 6: Coaching Engine

Capabilities:

- Workout prescription
- Trend detection
- Performance prediction
- Peak timing
- Post-race split analysis
- Cross-season intelligence

Example outputs:

```text
Run 6x200m at 25.8-26.2s with 3 min recovery.
Reason: Avery is in SPP week 2. Glycolytic capacity improving.
```

```text
Samuel's splits have slowed 1.8% over 3 sessions.
Possible overtraining. Recommend easy day before next quality session.
```

## Phase 7: Parent Communication Portal

GHL automations:

- Weekly progress email, drafted for coach review and approval
- PR alert
- SB alert
- School/team record alert
- Parent and athlete notification when a new PB or SB is detected from a saved Meet Result
- Parent, athlete, and coach notification when a school/team record is tied or broken
- Meet day notification
- Injury flag notification and training load adjustment
- End-of-season summary

Parent email requirements:

- Coach can email parents for a whole training/meet group.
- Coach can email parents for selected athletes only.
- Coach can email one athlete's parent/parents individually.
- Coach should not have to look up parent emails manually; SMARTCoach Pro resolves parent/guardian emails from the athlete contact.
- If an athlete has multiple parent/guardian emails, the send flow should include all linked parent recipients unless the coach deselects one.
- If parent email is missing, the coach should see a clear missing-recipient warning before sending.

## Phase 8: Recruiting Engine

One-tap recruiting profile generation.

Formats:

- PDF
- Shareable link
- Email through GHL

Profile sections:

- Athlete identity
- Personal bests
- Progression
- Training background
- Coaching analysis
- Coach contact

Planning note:

- Recruiting may need its own custom object if SMARTCoach Pro must track generated profile versions, PDF/link status, coach approval, send history, college coach recipients, and recruiting opt-in state.
- Because GHL has a 10 custom-object limit on the current plan, decide later whether recruiting can live on Contact + Athlete Best + Season Record + Meet Result, or whether a dedicated `Recruiting Profile` object is worth one of the remaining object slots.

## Phase 9: Athlete Portal

Athlete login includes:

- Personal career timeline
- Current training zones and target paces
- Coaching messages and goal projections
- Season bests and PR history
- Pre-meet preparation notes from coach

## Phase 10: Subscription Monetization

Tiers:

- Free, $0: basic timing, 3 athletes, no sync
- Coach Pro, $19.99/mo: full team, SMART Trak sync, training targets, dashboard
- Club/School, $99/mo: unlimited athletes, parent portal, recruiting
- Enterprise, custom: multi-team, district-wide, white label

## Phase 11: Coach Help Assistant

Coach Pro and higher should include an in-app help button for questions about how SMARTCoach Pro works.

Examples:

- How do I sync a workout?
- What is included in my subscription plan?
- How do I create or select a training plan?
- Why is an athlete missing from the roster dropdown?
- How do I set current fitness?

Requirements:

- Answers should come from SMARTCoach Pro help content, project docs, subscription-plan rules, and approved product instructions.
- The assistant should answer inside the app or dashboard without making the coach search through settings.
- It should be available only on paid/pro surfaces unless a limited public help version is added later.
- It should not expose private API keys, internal tokens, or another customer's data.
- Later, it can escalate to support or open the right SMARTCoach Pro screen when the answer requires an action.

## Current Priority Order

1. Stabilize the Training Plan Day to stopwatch flow: group plans, athlete overrides, next 5 days, changed-workout handling, current-fitness targets, surface, and weather notes.
2. Build the first desktop dashboard view: roster/training list with athlete, group, current fitness, recent result, previous week volume, current week volume, and recent sync status.
3. Add meet performance comparison views: athlete vs athlete, athlete vs previous results, same course/event history, PB/SB/record indicators.
4. Finalize subscription/auth foundation: separate Essential stopwatch-only accounts from SMARTCoach Pro accounts that include SMART Trak.
5. Plan remaining object budget carefully: only add new objects for high-value needs such as field-event attempts or recruiting profiles.
6. Parent/recruiting/athlete portals after the dashboard and account separation are stable.

## Production Security Note

Account-specific URLs are routing, not security. Before SMARTCoach Pro is sold to outside customers, Pro dashboard/API access needs real access protection so a copied dashboard URL cannot expose athlete data.

Required production direction:

- Do not rely on hidden or hard-to-guess account links.
- Keep customer dashboard links out of public onboarding screens where possible.
- Gate Pro dashboard/API routes with auth, signed customer sessions, GHL app context, or another server-verified access layer.
- Keep the GHL custom link inside the customer's sub-account as the normal entry point, but still treat copied links as potentially shareable.
- Essential stopwatch can stay much lighter, but Pro roster/results/training data must be protected.
- Interim protection added/planned: optional per-account `SMARTCOACH_ACCESS_CODE_{ACCOUNT}` can block Pro API data unless the browser session provides the access code. This helps now, but should later be replaced or backed by proper account auth/subscription login.
- Internal setup protection: optional `SMARTCOACH_ADMIN_SETUP_CODE` can block the onboarding/setup helper unless the internal setup code is entered. This keeps customer setup generation private while the full auth/subscription system is still being built.

## Latest Continuation Notes

On April 30, 2026, the local continuation cleaned up visible encoding damage in the SmartCoach HTML files:

- Fixed broken back/forward glyphs in `index.html` and `app.html`
- Fixed damaged `RUNNER ROW` CSS comments
- Fixed `white-space:nowraw` to `white-space:nowrap`
- Updated project truth: Vercel is active, SMARTCoach Pro/GHL sync is confirmed working
- Added SMARTCoach Pro object/field mapping files for Performance Records, Season Records, Meet Results, and Training Plans
- Updated `/api/ghl/sync-session.js` so sync now keeps the existing contact note and also attempts to create a structured Performance Record for each saved run
- Live test confirmed: contact note and structured Performance Record are both created successfully
- Identified duplicate-contact risk from free-typed athlete names; next design priority is active athlete roster lookup from SMARTCoach Pro/GHL
- Added active athlete roster lookup from SMARTCoach Pro/GHL using `SMARTCoach Active = Yes`
- Updated sync payloads to include GHL contact IDs when an active athlete is selected, reducing duplicate contacts
- Standardized visible product wording to SMARTCoach Pro while leaving stable internal API routes unchanged
- Added Season Record upsert to sync: one Season Record per athlete, season, and year, with practice session count, performance record count, latest session summary, and readable practice bests
- Live test confirmed: Season Record create/update works in SMARTCoach Pro/GHL
- Added duplicate sync protection: existing Performance Records are detected by `source_record_id`; the app asks before intentionally syncing the same workout again
- Added Meet Result creation from meet timing groups through `/api/smart-trak/meet-result`; manual meet-result form was removed from the stopwatch flow because race results should come from captured timing data
- Added the first Training/Meets/Archive group separation layer: current-season Training keeps the existing simple group creation flow, Meets can create meet/event timing groups, and Archive hides past-season groups by default while keeping them viewable
- Added Meet Result saves from meet timing groups, readable split/season summary fields, and Season Record updates from Meet Results
- Live test confirmed: Athlete Best records are created/updated and PB/SB fields can be driven by meet results and current-fitness setup
- Added `Records` custom object concept for school/team/club records so SMARTCoach can detect and later notify when an athlete ties or breaks a school record
- Added non-breaking backend support for `Athlete Best`: once the custom object exists in SMARTCoach Pro/GHL, Meet Result saves can update PB/SB records and auto-mark PRs
- Added coach confirmation for PB/SB in the meet-save flow so empty or incomplete GHL history does not falsely mark first-time results as records
- Changed new Meet Event entry to use a standard event dropdown, with `Other` available for unusual distances
- Added non-breaking `Meet` endpoint and app picker: coaches can select preloaded meets from GHL or add a meet on the fly
- Added SMARTCoach Pro/GHL `Meet` object field mapping for `custom_objects.meets`
- Future plan: add GHL Community integration so coaches can attach image/video when syncing a new PB/PR, then auto-post the highlight to the SMARTCoach Pro community
- Added parent communication planning detail: parent emails must be resolved from athlete contacts so coaches can email a whole group, selected athletes, or one athlete without manually looking up parent addresses
- Added recruiting planning detail: recruiting may need a dedicated custom object for generated profile versions, approval, links/PDFs, send history, college recipients, and opt-in tracking, but this must be weighed against the GHL custom-object limit
- Product wording decision: coach-facing Training Plan creation should be called Guided Plan Builder or Plan Builder.
- Training Plan creation moved out of the stopwatch surface: use the dashboard as the one SMARTCoach Pro/GHL custom link, with Plan Builder opened from the dashboard button; the stopwatch app only selects existing plans/days and can switch to another upcoming workout when practice conditions change
- Training Plan days now need actual workout prescriptions, not generic themes: examples include `3 x 1 mile / recovery equals completed rep time`, with target split guidance based on each athlete's latest matching fitness set
- Plan Builder refinement: coaches must enter the meet schedule before creating a plan; meet dates should be inserted into the daily plan first, then workouts are built around that schedule
- Stopwatch plan assignment model: a training group has a default group plan, and individual athletes can carry an athlete-level plan override while still being timed inside the same group
- Future dashboard planning note: add a planning table with Athlete, Group, Recent Race distance/time, Previous Week Mileage, and Current Week Mileage so plans can account for current fitness and training load
- Future Coach Pro support note: add an in-app help button where coaches can ask product, instruction, and subscription questions and get answers from approved SMARTCoach Pro help content.
- Dashboard personalization note: allow each coach/account to upload their own logo to replace the default `SC` mark on the desktop dashboard and future branded views.
- Coach-facing data experience note: keep GHL custom objects as the structured database, but avoid making coaches live inside raw object tables. Use dashboard/custom HTML iframe views for roster, training volume, meet results, athlete profiles, plan editing, and manual data entry wherever that creates a cleaner workflow.
- Passed selected GHL Meet record IDs through meet timing groups and Meet Result saves for clean meet schedule linking
- Verified `index.html` in the in-app browser:
  - App loads
  - Group/runner flow works
  - Start/lap/stop works
  - Share opens
  - Sheets export renders tabular text
  - SMARTCoach Pro sync modal opens
  - No console errors
- Added first desktop dashboard surface at `/dashboard.html` with `/api/smart-trak/dashboard` for active roster, current fitness, latest meet result, latest training sync, and current/previous week synced run counts. These are sync counts, not mileage volume; true weekly/monthly volume comes later after completed distance/mileage is captured reliably.

## Resume Checklist

When picking this project back up:

1. Open this file first.
2. Inspect current git status in this repo.
3. Treat Vercel as the active deployment environment.
4. Treat SMARTCoach Pro/GHL sync as confirmed working unless new evidence says otherwise.
5. Continue with GHL custom objects, training targets, and dashboard work.
6. Keep changes scoped and record major decisions in this file.
