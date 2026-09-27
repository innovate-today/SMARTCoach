# SMART Trak revamp: step 1 inventory

Status: step 1 inventory with step 2 navigation decisions approved by the user. This does not authorize changes to existing pages or workflows. The standalone `smart-trak-navigation-concept.html` is illustrative only.

Step 3 rollout begins on the dashboard header: existing action nodes are regrouped under Training, Meets & Results, Tools, Quick Add, and Account, while the dashboard content and modal handlers remain unchanged. This first slice does not add Overview or change other pages' headers. Account Settings is not included. Head Coach Staff Access remains governed by the existing staff-admin permission response.

## Current destinations

| Proposed location | Current entry point | Current behavior to preserve |
| --- | --- | --- |
| Overview | New page, not yet present | Cross-program summary; must use real data and link to existing workspaces. |
| Athletes | `/athletes.html` | Existing roster, search/filter, add/import, parent contacts, group/status, Docu Trak, Equipment Trak, calendar links and questions. Do not replace with concept roster. |
| Training > Distance Training | `/dashboard.html` | Existing dashboard, including roster overview, training load, XC Details, Personal Bests, meet results, filters, and exports. Navigation label may change only after approval; page remains intact. |
| Training > Training Calendar | `/training-calendar.html` | Existing training/calendar page and setup actions. |
| Training > Field Practice | `/field-practice.html` | Existing practice capture and review. |
| Training > Fitness Review | `#fitnessCleanupBtn` on `/dashboard.html` | Opens an existing dashboard modal; no separate page. |
| Speed Trak | `/speed-trak.html` | Existing sessions, leaderboard, progression, imports and field-practice-backed results. |
| Power Trak | `/power-trak.html` | Existing workouts, rack mode, sessions, leaderboard, progression, history and imports; rack iPad setup is a page action. |
| Meets & Results > Meet History | `/meet-history.html` | Existing meet administration/history, imports and corrections. |
| Meets & Results > Results | `#shareResultsBoardBtn` on `/dashboard.html` | Opens existing Results board flow; `/results-board.html` is the public/shared board, not the coach entry point. |
| Meets & Results > Records | `/records.html` | Existing records and XC Top 20. |
| Meets & Results > Simulators | `/track-simulator.html`, `/xc-simulator.html` | Existing individual simulators; dashboard currently opens a chooser modal. |
| Tools > Miles Trak | `#shareMilesBoardBtn` on `/dashboard.html` or `/dashboard.html#share-miles-board` | Existing board flow; `/miles-board.html` is a shared-board surface. |
| Tools > Keep Trak | `/keep-trak.html` | Existing team task workflow. |
| Tools > Weather | `/weather.html` | Existing weather page. |
| Tools > Equipment Trak | `#equipmentLookupBtn` on `/athletes.html` | Existing athlete-linked equipment flow; confirm whether a separate global inventory entry exists before routing. |
| Tools > Docu Trak | Athlete action on `/athletes.html` | Existing athlete documentation flow; confirm a global entry before routing. |
| Account > Staff Access | `#changeCodeBtn` on `/dashboard.html` | Existing staff/device access modal. |
| Account > Sign Out | Existing account-access flow | Confirm whether a global sign-out command exists; prototype button is not implemented. |

## Quick actions and secondary entry points

| Proposed action | Existing entry point |
| --- | --- |
| Log Miles | `#manualMileageBtn` on dashboard or Training Calendar. |
| Log Single Result | `#raceResultBtn` on dashboard or Training Calendar. |
| Manage Meets | `#manageMeetsBtn` on dashboard or Training Calendar. |
| Create Training Session | Existing Training Calendar workflow. |
| Add Speed Result | Existing Speed Trak workflow; direct-entry URL/action needs confirmation. |
| Create Strength Workout / Set Up Rack | Existing Power Trak tabs/actions; direct-entry URL/action needs confirmation. |
| Start Field Practice | Existing Field Practice workflow. |
| Add Athlete / Import Athletes | Existing Athletes page actions. |

Training Calendar also has Athlete Setup (`/plan-setup.html`), Upload/Paste Plan (`/plan-import.html`), Auto Build Plan (`/plan-builder.html`), Training Customization, and admin-only Strava. Athletes also provides Attendance (`/attendance.html`), parent email/calendar actions, and individual Docu/Equipment actions. These are retained even if they do not become global navigation items.

## Access and visibility findings

- Dashboard `data-dashboard-tool` visibility is a coach preference, not a role/authorization check. The new navigation must not confuse those concepts.
- Owner/admin onboarding remains in the existing custom sidebar. No Account Settings item belongs in the SMART Trak Account menu.
- Staff Access is Head Coach-only. The existing control is hidden when `staffAdminAllowed` is false for a coach session; the new menu must follow that authorization result rather than exposing the management modal to other coaches.
- Pro/Essential setup changes dashboard visibility. The destination map must preserve plan gating and protected API access; showing or hiding a link is not authorization.
- The concept's Sign Out is a placeholder; production must clear local access and session state before redirecting.
- XC Details is conditional on XC assignment or XC training; Personal Bests remains available to every athlete.

## Approved navigation decisions

1. `Distance Training` is the navigation label only. Keep the current dashboard title, layout, and workflows.
2. Use `Training Calendar` instead of `Open Today`. Do not imply a Today filter that does not exist.
3. Regular coaches see `Sign Out` in Account. The Head Coach also sees `Staff Access`, subject to the existing staff-admin authorization check. No coaches need or have Account Settings access; owner/admin onboarding stays in the custom sidebar. Sign Out removes the current device's stored access code and remembered/session authentication for this account, then returns to the access prompt. It does not change the account's server-side code or sign out other devices.
4. Equipment Trak and Docu Trak retain their current athlete-specific flows. No new all-athlete page is approved.
5. Quick Add should open the existing modal/create flow directly, so the coach can work there. Where a reliable cross-page modal entry does not exist yet, create a narrowly scoped deep link without changing the form itself. Do not silently substitute a general workspace page.
