# SMART Trak revamp: step 1 inventory

Status: inventory and navigation decisions approved by the user; shared navigation and Team Overview are rolled out. The standalone `smart-trak-navigation-concept.html` is illustrative only. Existing page workflows remain unchanged; the former dashboard's heading and browser title are now `Distance Trak`.

Step 3 rollout now covers Overview, Dashboard, Athletes, Attendance Trak, Training Calendar, Field Practice, Speed Trak, the Power Trak coach page, Meet History, Records, both meet simulators, Keep Trak, Weather, Athlete Setup, Upload/Paste Plan, and Auto Build Plan. Rack iPad kiosk mode is excluded. Existing action nodes are regrouped under Distance Trak, Athletes, Training, Meets & Results, Tools, Quick Add, and Account while page content and modal handlers remain unchanged. Training Calendar keeps draft approval and scheduling actions visible. Field Practice keeps its New Practice command in Quick Add. Speed Trak keeps Share Board, Export Data, and Refresh visible while Add Result moves to Quick Add. Power Trak keeps Rack iPad Setup, Download CSV, Delete Test, and Refresh as page actions. Meet History keeps Enter Results and Import History in Quick Add. Records retains its XC Top 20 and record-entry controls in their current sections. Both simulators retain Reset as a direct page action and keep their scoring controls in place. Keep Trak keeps its note workflow and places Add Note in Quick Add. Weather keeps Search, Save Location, and Refresh in place. Athlete Setup and Auto Build Plan keep their admin-only account controls in the header outside the Account dropdown. Upload/Paste Plan retains its import and preview controls in place. Overview reads the active roster, distance activity, and recent meet results from the existing dashboard API; Speed and Power are workspace links without fabricated statistics. The existing account-status requests gate Staff Access on these pages. Quick Add deep links open the existing cross-page create modals after access and roster loading. Account Settings is not included. Head Coach Staff Access remains governed by the existing staff-admin permission response; the non-dashboard menus link to the dashboard Staff Access modal only for an authorized Head Coach.

## Current destinations

| Proposed location | Current entry point | Current behavior to preserve |
| --- | --- | --- |
| Overview | `/overview.html` | Live active roster, distance activity, and recent meet results from the dashboard API, with links to existing workspaces. |
| Distance Trak > Distance Overview | `/dashboard.html` | Existing distance dashboard, including roster overview, training load, XC Details, Personal Bests, meet results, filters, and exports. Its heading and browser title are `Distance Trak`; the workflow remains intact. |
| Distance Trak > Miles Trak | Dashboard Miles Trak modal (`#share-miles-board`) | Opens the existing Miles Trak flow. |
| Athletes > Roster | `/athletes.html` | Existing roster, search/filter, add/import, parent contacts, group/status, Docu Trak, Equipment Trak, calendar links and questions. Do not replace with concept roster. |
| Athletes > Attendance | `/attendance.html` | Existing Attendance Trak page. |
| Athletes > Equipment Trak | `/athletes.html#equipment-trak` | Opens the existing roster-wide equipment lookup modal; per-athlete equipment actions remain on roster rows. |
| Athletes > Docu Trak | `/athletes.html#docu-trak` | Opens the existing Docu Trak setup modal; per-athlete document actions remain on roster rows. |
| Athletes > Email Calendar Links | `/athletes.html#email-calendar-links` | Opens the existing roster-wide calendar email workflow; personal calendar links stay on athlete rows. |
| Athletes > Calendar Questions | `/athletes.html#calendar-questions` | Opens the existing calendar question setup modal. |
| Training > Training Calendar | `/training-calendar.html` | Existing training/calendar page and setup actions. |
| Training > Field Practice | `/field-practice.html` | Existing practice capture and review. |
| Training > Fitness Review | `#fitnessCleanupBtn` on `/dashboard.html` | Opens an existing dashboard modal; no separate page. |
| Speed Trak | `/speed-trak.html` | Existing sessions, leaderboard, progression, imports and field-practice-backed results. |
| Power Trak | `/power-trak.html` | Existing workouts, rack mode, sessions, leaderboard, progression, history and imports; rack iPad setup is a page action. |
| Meets & Results > Meet History | `/meet-history.html` | Existing meet administration/history, imports and corrections. |
| Meets & Results > Results | `/meet-history.html#results-board` | Opens Results Board sharing on Meet History; `/results-board.html` remains the public/shared board. Older Dashboard entry points redirect here. |
| Meets & Results > Records | `/records.html` | Existing records and XC Top 20. |
| Meets & Results > Simulators | `/track-simulator.html`, `/xc-simulator.html` | Direct Track Simulator and XC Simulator links; the redundant chooser is removed from the dashboard menu. |
| Tools > Keep Trak | `/keep-trak.html` | Existing team task workflow. |
| Tools > Weather | `/weather.html` | Existing weather page. |
| Account > Staff Access | `#changeCodeBtn` on `/dashboard.html` | Existing staff/device access modal. |
| Account > Sign Out | Shared navigation | Clears this device's stored code, remembered/session authentication, and account snapshots, then returns to the page's access prompt. |

## Quick actions and secondary entry points

| Proposed action | Existing entry point |
| --- | --- |
| Log Miles | `#manualMileageBtn` on dashboard or Training Calendar. |
| Log Single Result | `#raceResultBtn` on dashboard or Training Calendar. |
| Manage Meets | `#manageMeetsBtn` on dashboard or Training Calendar. |
| Create Training Session | Existing Training Calendar workflow. |
| Add Speed Result | Existing Speed Trak workflow; direct-entry URL/action needs confirmation. |
| Create Strength Workout / Set Up Rack | Quick Add opens the existing Power Trak workout builder with a new draft, or selects the existing Rack Setup tab. It does not save or start a rack automatically. |
| New Field Practice | Quick Add opens the existing Field Practice form with a fresh practice. |
| Add Athlete / Import Athletes | Existing Athletes page actions. |

Training Calendar also has Athlete Setup (`/plan-setup.html`), Upload/Paste Plan (`/plan-import.html`), Auto Build Plan (`/plan-builder.html`), and Training Customization. Its Strava beta link retains the existing demo-account, admin-mode, and Head Coach visibility checks when moved into shared navigation. Athletes also provides Attendance (`/attendance.html`), parent email/calendar actions, and individual Docu/Equipment actions. These are retained even if they do not become global navigation items.

## Access and visibility findings

- Dashboard `data-dashboard-tool` visibility is a coach preference, not a role/authorization check. The new navigation must not confuse those concepts.
- Owner/admin onboarding remains in the existing custom sidebar. No Account Settings item belongs in the SMART Trak Account menu.
- Staff Access is Head Coach-only. The existing control is hidden when `staffAdminAllowed` is false for a coach session; the new menu must follow that authorization result rather than exposing the management modal to other coaches.
- Pro/Essential setup changes dashboard visibility. The destination map must preserve plan gating and protected API access; showing or hiding a link is not authorization.
- The concept's Sign Out is a placeholder; production must clear local access and session state before redirecting.
- XC Details is conditional on XC assignment or XC training; Personal Bests remains available to every athlete.

## Approved navigation decisions

1. Use `Distance Trak` as the navigation group, with Distance Overview and Miles Trak under it. The distance page title is `Distance Trak`; its layout and workflows remain intact. Use Athletes as a group with Roster and Attendance under it.
2. Use `Training Calendar` instead of `Open Today`. Do not imply a Today filter that does not exist.
3. Regular coaches see `Sign Out` in Account. The Head Coach also sees `Staff Access`, subject to the existing staff-admin authorization check. No coaches need or have Account Settings access; owner/admin onboarding stays in the custom sidebar. Sign Out removes the current device's stored access code and remembered/session authentication for this account, then returns to the access prompt. It does not change the account's server-side code or sign out other devices.
4. Equipment Trak and Docu Trak are reachable from the Athletes menu through their existing modals on the roster page. Their athlete-specific row actions remain available. No new all-athlete page is approved.
5. Quick Add should open the existing modal/create flow directly, so the coach can work there. Where a reliable cross-page modal entry does not exist yet, create a narrowly scoped deep link without changing the form itself. Do not silently substitute a general workspace page.
