# SMARTCoach Pro Plan Builder

The Plan Builder creates coach-reviewed training plans in SMARTCoach Pro.

Coach-facing wording:

- Plan Builder
- Guided Plan Builder
- Guided draft
- Coach review
- Coach approval

Do not use AI wording in the coach-facing builder.

## Flow

1. Coach completes the Guided Plan Builder questionnaire.
2. SMARTCoach Pro creates one `Training Plan` record.
3. SMARTCoach Pro creates many `Training Plan Day` records.
4. Coach reviews and edits the draft in SMARTCoach Pro or the future dashboard.
5. Coach approves the plan.
6. The stopwatch app selects an approved plan/day.
7. Completed workout results sync back to the selected Training Plan Day.

## GHL Custom Link

Use this page for the SMARTCoach Pro/GHL custom menu link:

`https://app.smartcoach-pro.com/plan-builder.html`

The stopwatch app should not create plans. It should only select an existing plan/day, allow the coach to choose a different upcoming workout when practice conditions change, and sync completed timing data back to the chosen Training Plan Day.

## Questionnaire Endpoint

`GET /api/smart-trak/training-plan?kind=questionnaire`

This endpoint returns the field list, option labels, and option keys the future builder UI should render.

## Builder Submit Endpoint

`POST /api/smart-trak/training-plan`

The submit payload can include either:

- Questionnaire answers only, which creates a guided draft daily plan.
- A `days` array, which creates a manual plan using coach-entered daily workouts.

## Core Questions

- Plan Name
- Plan Scope
- Assigned Group
- Athlete
- Season Block
- Block Type
- Primary Event Focus
- Plan Start Date
- Peak / Championship Date
- Priority Meets
- No-Practice Dates
- Normal Practice Days
- Current Fitness / Recent Results
- Training Limits
- Coach Preferences
- Plan Style
- Manual Notes

## Records Created

`Training Plan`

- Plan container.
- Stores dates, season/block, assigned group/athlete, priority meets, constraints, and plan rationale.

`Training Plan Day`

- Daily workout record.
- Stores date, day type, workout title/details, workout type, energy system, target splits/paces, planned volume, status, and later completed Performance Record links.
