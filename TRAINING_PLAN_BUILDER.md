# SMART Trak Plan Builder

The Plan Builder creates coach-reviewed training plans in SMART Trak. The coach-facing explanation should make it clear that this is a built-for-you plan from start to finish for any chosen length of time. The plan is generated as a draft, then the coach reviews, adjusts, approves, and schedules it.

Coach-facing wording:

- Plan Builder
- Guided Plan Builder
- Guided draft
- Coach review
- Coach approval

Use coach-facing wording such as Guided Plan Builder, Plan Builder, generated draft, and coach review.

## Flow

1. Coach completes the Guided Plan Builder questionnaire.
2. Coach enters the meet schedule before creating the plan.
3. SMART Trak creates one `Training Plan` record.
4. SMART Trak creates many `Training Plan Day` records.
5. Meet dates are placed into the daily plan from the meet schedule.
6. Each `Training Plan Day` includes the actual planned workout, such as reps, distance, recovery, target effort, and target split/pace guidance.
7. Coach reviews and edits the draft in SMART Trak.
8. Coach approves the plan.
9. The stopwatch app selects an approved plan/day.
10. Completed workout results sync back to the selected Training Plan Day.

## SMART Trak Custom Link

Use this page only when testing the builder directly:

`https://app.smartcoach-pro.com/plan-builder.html`

In production, the dashboard is the one SMART Trak custom/sidebar link. The dashboard opens Plan Builder from its button. The stopwatch app should not create plans. It should only select an existing plan/day, allow the coach to choose a different upcoming workout when practice conditions change, and sync completed timing data back to the chosen Training Plan Day.

When a coach reaches practice and needs to adjust, the stopwatch app shows the next five scheduled workouts and allows a different workout to be selected for that group.

Groups can have a default plan. Individual athletes inside that group can be assigned a different plan/day override without creating a separate timing group. Sync should link each athlete to the plan day they actually followed.

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
- Current Fitness Sport
- Current Fitness Distance
- Current Fitness Time
- Plan Start Date
- Peak / Championship Date
- Meet Schedule
- No-Practice Dates
- Normal Practice Days
- Training Limits
- Coach Preferences
- Plan Style
- Manual Notes

## Future Builder Improvements

The Plan Builder page needs a clearer explanation before the form:

- Explain that it builds a full start-to-finish training plan for the selected dates, event focus, athletes, schedule, and constraints.
- Explain that the coach is still in control: the draft can be reviewed, edited, and adjusted before it becomes the final plan.
- Avoid coach-facing wording that says AI. Use terms such as Guided Plan Builder, built-for-you draft, coach-reviewed plan, and draft plan.

Current Fitness Setup should become easier for full rosters:

- Sort and filter athletes by girls, boys, group, and active status.
- Keep the setup fast enough for bulk entry before a season starts.
- Make it clear that the current fitness source is used to create athlete-specific targets.

The questionnaire should capture enough coaching context to build a useful plan, not just dates and mileage:

- Goal event or race distance: 800m, 1600m, 5K cross country, half marathon, marathon, or other event.
- Training age: years consistently training, years of structured workouts, and accumulated mileage history.
- Current fitness profile: recent race times, aerobic fitness, speed reserve, threshold fitness, and whether the athlete is more speed-based or aerobic-based.
- Injury history: shin splints, stress reactions, Achilles, hamstring, hip, plantar fascia, low iron/fatigue patterns, and other recurring issues.
- Weekly volume capacity: actual sustainable mileage, not ideal or desired mileage.
- Speed vs aerobic profile: explosive/high-end speed athlete, rhythm runner, durable aerobic runner, or mixed profile.
- Recovery ability: sleep, stress, school/work load, nutrition, heat adaptation, and how many hard days per week the athlete usually absorbs.
- Time of season: base, preseason, competition, championship, recovery, or transition timing.
- Available training time: days per week, doubles, access to track/hills/weight room, travel schedule, school restrictions, other sports, holidays, testing, spring break, dead weeks, and no-practice periods.
- Adaptation rate: how quickly the athlete responds to mileage increases, workout intensity, long-run progression, lifting, and speed exposure.

Additional optional variables that may improve future plans:

- Biomechanics and running form.
- Race tactics and mental profile.
- Heat tolerance.
- Strength, mobility, cadence, and ground-contact quality.
- Nutrition quality.
- Iron/ferritin concerns.
- Event doubling demands.
- Terrain and surface specificity: track, road, trail, grass, hills, cross country course, or indoor.

For distance runners, the plan should balance the major systems year-round while shifting emphasis by season:

- Aerobic development for the engine.
- Threshold work to sustain speed.
- VO2 max work for aerobic power.
- Neuromuscular speed for mechanics and efficiency.
- Strength training for durability and force.
- Mobility for movement quality.
- Recovery so the training actually adapts.

The planning logic should account for more than mileage and pace. Better plans should also manage nervous system stress, aerobic load, mechanical load, emotional load, recovery timing, and adaptation sequencing.

## Records Created

`Training Plan`

- Plan container.
- Stores dates, season/block, assigned group/athlete, priority meets, constraints, and plan rationale.

`Training Plan Day`

- Daily workout record.
- Stores date, day type, workout title/details, workout type, energy system, target splits/paces, planned volume, status, and later completed Performance Record links.
- Target splits/paces are based on the current fitness set when supplied. If no time is supplied, the day stores the formula so the app/dashboard can calculate athlete-specific targets from the athlete's latest matching fitness set.
