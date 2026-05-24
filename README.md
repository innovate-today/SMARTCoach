# SMARTCoach

Performance tracker, stopwatch, SMART Trak dashboard, training calendar, roster tools, and XC simulator for coaches.

For production deployment, customer onboarding, subscription automation, Stripe webhook setup, and launch-readiness checks, see [VERCEL_SETUP.md](VERCEL_SETUP.md). For the live Pro test account pass, use [LIVE_LAUNCH_VALIDATION.md](LIVE_LAUNCH_VALIDATION.md).

Launch accounts through `/onboarding.html`: check system readiness, run Test Setup First, save the customer account setup, complete the live smoke test, copy the activation record, copy the coach invite, confirm phone follow-up, then copy the final activation record.

Parked/future items are tracked in `SMARTCOACH_PROJECT_STATE.md` under **Remaining Launch Parked Items**. Those items are planning notes only and are not launch blockers unless they are explicitly re-prioritized.

Before pushing changes, run:

```bash
npm test
```
