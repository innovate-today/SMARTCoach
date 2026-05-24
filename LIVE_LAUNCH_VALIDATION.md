# SMARTCoach Live Launch Validation

Use this checklist with one real Pro test account before calling the initial rollout ready.

## Setup

1. Open `/onboarding.html`.
2. Run **Check System** and confirm it says **Ready for initial rollout**.
3. Create or choose one live Pro test account in GHL/SMART Trak.
4. Run **Test Setup First** for that account.
5. Use **Save Account Setup**.
6. Use **Lookup Account** and confirm the customer account record is saved.

## Account Access

1. Run **Check Customer Access**.
2. Confirm subscription/account access is allowed.
3. Confirm the SMART Trak connection fields are ready.
4. Confirm coach access codes are configured.
5. Confirm the current browser or phone can unlock with the assigned coach code.

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
3. Confirm the copied GHL payload does not include private integration tokens or coach access codes.
4. Confirm blocked billing statuses block SMART Trak in **Test Access Rules**.
5. Confirm parent email tools remain hidden/off for initial rollout.

## Handoff

1. Complete all required live smoke-test checks.
2. Stamp launch sign-off.
3. Use **Copy Activation Record** and save the internal support note.
4. Use **Copy Coach Invite** and send the coach-facing access note.
5. After the coach receives the invite, confirm first login, first sync, and phone bulk archive.
6. Use **Copy Activation Record** again to save the final activation record.

