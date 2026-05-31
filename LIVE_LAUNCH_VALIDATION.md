# SMARTCoach Live Launch Validation

Use this checklist with one real Pro test account before calling the initial rollout ready.

For the working support page, open `/live-launch-validation.html?account=<account-key>`. That page saves progress separately per account key, shows the active account scope, includes account-scoped setup/stopwatch/dashboard/status/page links, and can copy a paste-ready validation summary.

## Prerequisites

Do not begin the live pass until these are true:

- Vercel production is on the latest `main` deployment.
- `app.smartcoach-pro.com` points to the Vercel project.
- Customer account storage is connected.
- Launch security values are saved in Vercel Production.
- Parent email tools remain unreleased/off.
- GHL can send the Subscription Payload to SMART Trak.
- The test account is a real Pro account, not a future customer account.

## Validation Record

- Account key:
- Test subaccount:
- Tester:
- Date:
- Result: Pass / Needs work
- Blockers:
- Notes:

## Setup

1. Open `/live-launch-validation.html?account=<account-key>` and confirm the active account scope is correct.
2. Use **Open Setup** from that page, or open `/onboarding.html?account=<account-key>`.
3. Run **Check System** and confirm it says **Ready for initial rollout**.
4. Create or choose one live Pro test account in GHL/SMART Trak.
5. Run **Test Setup First** for that account.
6. Use **Save Account Setup**.
7. Use **Lookup Account** and confirm the customer account record is saved.
8. Add the SMART Trak custom link to the test subaccount.
9. Open the custom link and confirm it lands on the correct customer dashboard.

## Account Access

1. Run **Check Customer Access**.
2. Confirm subscription/account access is allowed.
3. Confirm the SMART Trak connection fields are ready.
4. Confirm the shared coach code is configured.
5. Confirm the current browser or phone can unlock with the assigned coach code.
6. Confirm the custom link still includes the customer account key after refresh.

## Coach Pages

Open each page with the customer account key and confirm real customer data loads:

- Dashboard
- Athletes
- Training Calendar
- Planning Setup
- Plan Entry
- Plan Builder
- Meet History
- Records
- XC Simulator

## Core Workflows

1. Create or activate at least one athlete and confirm the phone app athlete dropdown shows only active athletes.
2. Create or import a plan.
3. Build a training group.
4. Assign the plan to a group or selected athletes.
5. Confirm Training Calendar shows the plan days.
6. Open the phone app with the account key.
7. Select the group/plan, time one harmless workout, and sync.
8. Confirm Dashboard volume, completed workout details, splits, athlete latest training, and Training Calendar status update.
9. Log one standalone race result and confirm Dashboard, Meet History, and athlete bests update.
10. In XC Simulator, load **My Season Best**, load a saved field, and score one meet.

## Subscription And Security

1. Trigger the GHL Subscription Payload once.
2. Confirm account lookup shows a recent account update.
3. Confirm the copied GHL payload does not include private integration tokens or the shared coach code.
4. Confirm blocked billing statuses block SMART Trak in **Test Access Rules**.
5. Confirm the account still opens after the GHL Subscription Payload update.
6. Confirm parent email tools remain hidden/off for initial rollout.

## Handoff

1. Complete all required live smoke-test checks.
2. Stamp launch sign-off.
3. Use **Copy Activation Record** and save the internal support note.
4. Use **Copy Coach Invite** and send the coach-facing access note.
5. After the coach receives the invite, confirm first login, first sync, and phone bulk archive.
6. Use **Copy Activation Record** again to save the final activation record.

## Final Decision

Do not mark the initial rollout ready if any required checklist item failed, any blocker is open, parent email tools are visible, private tokens or the shared coach code appears in the GHL Subscription Payload, or the final activation record has not been saved.

- Initial rollout ready: Yes / No
- Final activation record saved: Yes / No
- Normal support monitoring started: Yes / No

## First-Week Monitoring

After the final activation record is saved, monitor the first coach account for these items during the first week:

- Coach can return to the custom link without setup errors.
- Coach can unlock SMART Trak with the assigned coach code on a new browser or phone if prompted.
- First real stopwatch sync appears on Dashboard and Training Calendar.
- First manually logged race result appears on Dashboard and Meet History.
- GHL Subscription Payload updates do not overwrite SMART Trak connection fields or the shared coach code.
- Blocked billing status still blocks SMART Trak access when tested.
- Parent email tools remain hidden/off.
- Any coach support issue is added to the Issue Log with owner, status, and retest notes.

## Retest Rule

If any issue requires a code, setup, GHL workflow, or Vercel environment change, rerun the affected section and then rerun these checks before changing the result to Pass:

- Check System
- Test Setup First
- Save Account Setup
- Lookup Account
- Check Customer Access
- The workflow that originally failed
- Copy Activation Record after the retest passes

## Issue Log

Use this section for anything found during the live pass that needs a fix or retest.

| Area | Issue | Owner | Status | Retest Notes |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |
