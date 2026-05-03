# SMARTCoach Pro Data Model

This document defines the first structured GoHighLevel/SMARTCoach Pro data model for SMARTCoach.

The model starts from what the app already syncs successfully today:

- Athlete contact
- Group/session name
- Season
- Phase
- Workout type
- Energy system
- Surface
- Session date
- Run totals
- Lap splits
- Runner notes

The first production goal is to keep the existing contact note sync working, then add structured records beside those notes. Notes remain useful for human review; custom objects become the source for dashboards, AI, analytics, parent reports, recruiting profiles, and athlete portals.

## Naming Rules

Use these naming conventions in GHL/SMARTCoach Pro:

- Object names are singular display names.
- API keys are lowercase snake case.
- Field display names use title case.
- Field API keys use lowercase snake case.
- Store milliseconds for all calculated times and a human-readable display field for easy CRM review.
- Store source IDs from SMARTCoach wherever possible so repeat syncs can update or dedupe records.

## Shared Picklists

These picklists should be reused across objects.

### Season

API key: `season`

Options:

- `summer`
- `fall`
- `winter`
- `spring`

### Training Phase

API key: `phase`

Options:

- `gpp`
- `spp`
- `pre_competition`
- `competition`
- `transition`

### Workout Type

API key: `workout_type`

Options:

- `acceleration`
- `max_velocity`
- `speed_endurance_i`
- `special_endurance_i`
- `special_endurance_ii`
- `lactate_tolerance`
- `extensive_tempo`
- `intensive_tempo`
- `lactate_threshold`
- `easy_recovery_run`
- `long_run`
- `aerobic_power`
- `plyometrics`
- `strength_circuit`
- `hill_sprints`
- `race`
- `time_trial`
- `other`

### Energy System

API key: `energy_system`

Options:

- `atp_pc`
- `glycolytic_anaerobic`
- `oxidative_aerobic`
- `mixed`

### Surface

API key: `surface`

Options:

- `track`
- `grass`
- `trail`
- `indoor`
- `road`
- `turf`
- `hills`
- `other`

### Gender

API key: `gender`

Options:

- `female`
- `male`
- `non_binary`
- `unknown`

### Athlete Status

API key: `athlete_status`

Options:

- `active`
- `injured`
- `return_to_play`
- `inactive`
- `graduated`

### Event Family

API key: `event_family`

Options:

- `sprints`
- `hurdles`
- `mid_distance`
- `distance`
- `jumps`
- `throws`
- `multi`
- `cross_country`
- `relay`
- `other`

## Relationship Model

GHL Contact remains the athlete identity record.

Relationships:

- Contact has many Performance Records.
- Contact has many Meet Results.
- Contact has many Season Records.
- Contact has many Athlete Best records.
- Contact has many Training Plans.
- Season Record can summarize many Performance Records and Meet Results.
- Athlete Best is the athlete-level parent record for PB/SB detection by event.
- Records stores school/team/club standards; Meet Results can be compared against Records for school-record detection.
- Training Plan can reference recent Performance Records and target future Performance Records.

Recommended relationship fields:

- `athlete_contact`: GHL contact ID for reliable linking.
- `athlete_name_snapshot`: athlete name at the time of record creation.
- `season_record_id`: optional parent season summary link.
- `source_session_id`: SMARTCoach session/group sync ID where available.
- `source_record_id`: SMARTCoach-generated unique ID for dedupe/update.

## Object 1: Performance Record

Display name: `Performance Record`

API key: `performance_record`

Purpose:

Stores every timed practice session or rep from SMARTCoach. This is the core training database.

Creation trigger:

- Created during SMARTCoach sync after the athlete contact is found or created.
- One record per athlete per saved run.
- If a run has laps, store lap data on the same record as structured JSON/text plus split fields for the first common laps.

Primary display format:

```text
Avery Womble - Special Endurance I - 300m - 00:52.4 - Apr 26, 2026
```

### Fields

| Field | API Key | Type | Required | Example | Notes |
|---|---|---:|---:|---|---|
| Record Name | `record_name` | Text | Yes | Avery Womble - Special Endurance I - Run 1 | Human-readable CRM title. |
| Athlete Contact | `athlete_contact` | Contact relation/Text | Yes | abc123 | GHL contact ID. Use relation if available, otherwise text. |
| Athlete Name Snapshot | `athlete_name_snapshot` | Text | Yes | Avery Womble | Keeps display stable if contact name changes. |
| Source System | `source_system` | Dropdown | Yes | smartcoach | Default `smartcoach`. |
| Source Session ID | `source_session_id` | Text | Yes | sc_20260426_speed_work | Dedupe key for session. |
| Source Record ID | `source_record_id` | Text | Yes | sc_20260426_speed_work_avery_run_1 | Unique per athlete run. |
| Group Name | `group_name` | Text | Yes | Speed Work | SMARTCoach group/workout name. |
| Session Date | `session_date` | Date/DateTime | Yes | 2026-04-26T15:30:00Z | From sync payload. |
| Season | `season` | Dropdown | Yes | spring | Shared picklist. |
| Phase | `phase` | Dropdown | Yes | competition | Shared picklist. |
| Workout Type | `workout_type` | Dropdown | Yes | special_endurance_1 | Shared picklist. |
| Energy System | `energy_system` | Dropdown | Yes | glycolytic_anaerobic | Shared picklist. |
| Surface | `surface` | Dropdown | No | track | Shared picklist. |
| Event Family | `event_family` | Dropdown | No | sprints | Useful for dashboard filtering. |
| Event/Rep Distance | `event_distance` | Text | No | 300m | Free text for reps like `6x200m`, `fly 30m`, `5K`. |
| Rep Number | `rep_number` | Number | Yes | 1 | Run number from SMARTCoach. |
| Total Time Display | `total_time_display` | Text | Yes | 00:52.4 | Human-readable. |
| Total Time MS | `total_time_ms` | Number | Yes | 52400 | Canonical time value. |
| Lap Count | `lap_count` | Number | No | 2 | Count of lap/split entries. |
| Lap 1 Display | `lap_1_display` | Text | No | 00:26.1 | First common split for easy viewing. |
| Lap 1 MS | `lap_1_ms` | Number | No | 26100 | Numeric split. |
| Lap 2 Display | `lap_2_display` | Text | No | 00:26.3 | Second common split. |
| Lap 2 MS | `lap_2_ms` | Number | No | 26300 | Numeric split. |
| Lap 3 Display | `lap_3_display` | Text | No | 00:18.7 | Third common split. |
| Lap 3 MS | `lap_3_ms` | Number | No | 18700 | Numeric split. |
| Lap 4 Display | `lap_4_display` | Text | No | 00:19.2 | Fourth common split. |
| Lap 4 MS | `lap_4_ms` | Number | No | 19200 | Numeric split. |
| Lap 5 Display | `lap_5_display` | Text | No | 00:20.0 | Fifth common split. |
| Lap 5 MS | `lap_5_ms` | Number | No | 20000 | Numeric split. |
| Splits JSON | `splits_json` | Long Text | No | `[{"lap":1,"ms":26100}]` | Full split list for any number of laps. |
| Coach Note | `coach_note` | Long Text | No | Back half looked smooth | From runner note. |
| Target Time Display | `target_time_display` | Text | No | 00:53.0 | Added by AI pace calculator later. |
| Target Time MS | `target_time_ms` | Number | No | 53000 | Numeric target. |
| Target Delta MS | `target_delta_ms` | Number | No | -600 | Actual minus target. Negative means faster than target. |
| Target Delta Percent | `target_delta_percent` | Number | No | -1.13 | Useful for trend analysis. |
| Temperature F | `temperature_f` | Number | No | 82 | Phase 3 adjustment input. |
| Wind | `wind` | Text | No | +0.4 | Optional for timed reps/time trials. |
| Conditions | `conditions` | Long Text | No | Warm, slight tailwind | Freeform environment. |
| Fatigue Index | `fatigue_index` | Number | No | 0.18 | Future AI input. |
| Days Since Hard Session | `days_since_hard_session` | Number | No | 3 | Future AI input. |
| Is PR | `is_pr` | Checkbox | No | true | Calculated later. |
| Is Season Best | `is_season_best` | Checkbox | No | true | Calculated later. |
| Season Record ID | `season_record_id` | Relation/Text | No | sr_2026_spring_avery | Link to Season Record. |
| Synced At | `synced_at` | DateTime | Yes | 2026-04-26T15:35:00Z | When SMARTCoach pushed record. |

### Minimum Viable Fields For First Implementation

Start with these fields if GHL setup needs to be lean:

- `record_name`
- `athlete_contact`
- `athlete_name_snapshot`
- `source_session_id`
- `source_record_id`
- `group_name`
- `session_date`
- `season`
- `phase`
- `workout_type`
- `energy_system`
- `surface`
- `rep_number`
- `total_time_display`
- `total_time_ms`
- `splits_json`
- `coach_note`
- `synced_at`

## Object 2: Season Record

Display name: `Season Record`

API key: `season_record`

Purpose:

Stores one athlete's seasonal summary. This powers the career timeline, parent summaries, recruiting progression, and AI long-range analysis.

Creation trigger:

- Created automatically when the first Performance Record or Meet Result appears for an athlete in a new season/year.
- Updated nightly or after each sync as new data arrives.

Primary display format:

```text
Avery Womble - Spring 2026 - Track
```

### Fields

| Field | API Key | Type | Required | Example | Notes |
|---|---|---:|---:|---|---|
| Record Name | `record_name` | Text | Yes | Avery Womble - Spring 2026 | Human-readable CRM title. |
| Athlete Contact | `athlete_contact` | Contact relation/Text | Yes | abc123 | GHL contact ID. |
| Athlete Name Snapshot | `athlete_name_snapshot` | Text | Yes | Avery Womble | Stable display. |
| Season | `season` | Dropdown | Yes | spring | Shared picklist. |
| Season Year | `season_year` | Number | Yes | 2026 | Calendar year. |
| Sport | `sport` | Dropdown/Text | Yes | track | Track, cross country, etc. |
| Primary Event | `primary_event` | Text | No | 400m | Athlete focus. |
| Secondary Events | `secondary_events` | Text | No | 200m, 4x400 | Comma-separated for now. |
| Event Family | `event_family` | Dropdown | No | sprints | Shared picklist. |
| School/Team | `school_team` | Text | No | Trinity Christian Addison | Useful for multi-team later. |
| Grade Level | `grade_level` | Text | No | Junior | Snapshot for that season. |
| Athlete Status | `athlete_status` | Dropdown | No | active | Shared picklist. |
| Season Start Date | `season_start_date` | Date | No | 2026-01-08 | Optional. |
| Season End Date | `season_end_date` | Date | No | 2026-05-15 | Optional. |
| Training Phase Current | `training_phase_current` | Dropdown | No | competition | Latest phase. |
| Practice Session Count | `practice_session_count` | Number | No | 24 | Count of unique SMARTCoach sessions. |
| Performance Record Count | `performance_record_count` | Number | No | 86 | Count of timed reps/runs. |
| Meet Count | `meet_count` | Number | No | 7 | Count of Meet Results. |
| Total Timed Volume M | `total_timed_volume_m` | Number | No | 18400 | Requires distance field. |
| Avg Compliance Percent | `avg_compliance_percent` | Number | No | 92 | Future planned vs completed metric. |
| Training Load Score | `training_load_score` | Number | No | 78 | Future composite score. |
| Best Primary Event Display | `best_primary_event_display` | Text | No | 400m - 54.8 | Human-readable. |
| Best Primary Event MS | `best_primary_event_ms` | Number | No | 54800 | Numeric if timed. |
| Best Primary Event Date | `best_primary_event_date` | Date | No | 2026-03-28 | From Meet Result or time trial. |
| Season Bests JSON | `season_bests_json` | Long Text | No | `{"400m":{"ms":54800}}` | Flexible event summary. |
| PR Count | `pr_count` | Number | No | 3 | Season PR count. |
| Improvement Percent | `improvement_percent` | Number | No | 3.2 | From season start to peak. |
| Injury Flag | `injury_flag` | Checkbox | No | false | Parent portal and AI load control. |
| Injury Notes | `injury_notes` | Long Text | No | Hamstring tightness in week 4 | Coach-entered or flagged. |
| Peak Window Notes | `peak_window_notes` | Long Text | No | Peaks 18 days after last hard session | Phase 6. |
| AI Season Summary | `ai_season_summary` | Long Text | No | Avery improved back-half maintenance... | Generated report. |
| Coach Season Notes | `coach_season_notes` | Long Text | No | Needs more SE II before district | Manual notes. |
| Parent Summary Approved | `parent_summary_approved` | Checkbox | No | false | Phase 7. |
| Recruiting Summary Approved | `recruiting_summary_approved` | Checkbox | No | false | Phase 8. |
| Source Record ID | `source_record_id` | Text | Yes | sr_avery_2026_spring | Dedupe key. |
| Last Calculated At | `last_calculated_at` | DateTime | No | 2026-04-30T12:00:00Z | Recalculation marker. |

### Minimum Viable Fields For First Implementation

- `record_name`
- `athlete_contact`
- `athlete_name_snapshot`
- `season`
- `season_year`
- `sport`
- `primary_event`
- `practice_session_count`
- `performance_record_count`
- `meet_count`
- `season_bests_json`
- `injury_flag`
- `coach_season_notes`
- `source_record_id`
- `last_calculated_at`

## Object 3: Meet Result

Display name: `Meet Result`

API key: `meet_result`

Purpose:

Stores official competition results. This separates practice performance from race outcomes while keeping both connected to the athlete career record.

Creation trigger:

- Manual coach entry first.
- Later: import from athletic.net, MileSplit, CSV, or GHL form.

Primary display format:

```text
Avery Womble - 400m - 54.8 - District Meet - Mar 28, 2026
```

### Fields

| Field | API Key | Type | Required | Example | Notes |
|---|---|---:|---:|---|---|
| Record Name | `record_name` | Text | Yes | Avery Womble - 400m - 54.8 | Human-readable CRM title. |
| Athlete Contact | `athlete_contact` | Contact relation/Text | Yes | abc123 | GHL contact ID. |
| Athlete Name Snapshot | `athlete_name_snapshot` | Text | Yes | Avery Womble | Stable display. |
| Meet Name | `meet_name` | Text | Yes | District Meet | Official meet name. |
| Meet Date | `meet_date` | Date | Yes | 2026-03-28 | Competition date. |
| Season | `season` | Dropdown | Yes | spring | Shared picklist. |
| Season Year | `season_year` | Number | Yes | 2026 | Calendar year. |
| Sport | `sport` | Dropdown/Text | Yes | track | Track or cross country. |
| Event | `event` | Text | Yes | 400m | Official event. |
| Event Family | `event_family` | Dropdown | No | sprints | Shared picklist. |
| Round | `round` | Dropdown/Text | No | final | Final, prelim, semi, heat. |
| Heat | `heat` | Number | No | 3 | Optional. |
| Lane | `lane` | Number | No | 5 | Optional. |
| Place Overall | `place_overall` | Number | No | 2 | Official place. |
| Place Heat | `place_heat` | Number | No | 1 | Optional. |
| Result Display | `result_display` | Text | Yes | 54.8 | Human-readable result. |
| Result MS | `result_ms` | Number | No | 54800 | For timed track events. |
| Result Value Numeric | `result_value_numeric` | Number | No | 5.82 | For jumps/throws if used later. |
| Result Unit | `result_unit` | Dropdown/Text | No | seconds | seconds, meters, feet_inches, points. |
| FAT/Hand Time | `timing_method` | Dropdown | No | fat | `fat`, `hand`, `unknown`. |
| Wind | `wind` | Text | No | +0.4 | Official wind. |
| Conditions | `conditions` | Long Text | No | 78F, clear | Weather/context. |
| Split 1 Display | `split_1_display` | Text | No | 27.1 | Official or coach split. |
| Split 1 MS | `split_1_ms` | Number | No | 27100 | Numeric split. |
| Split 2 Display | `split_2_display` | Text | No | 27.7 | Official or coach split. |
| Split 2 MS | `split_2_ms` | Number | No | 27700 | Numeric split. |
| Splits | `splits_json` | Long Text | No | Lap 1: 27.1 | Flexible readable splits. |
| Is PR | `is_pr` | Checkbox | No | true | Calculated from Athlete Best once that object exists. |
| Is Season Best | `is_season_best` | Checkbox | No | true | Calculated from Season Record event best. |
| Qualifying Standard | `qualifying_standard` | Text | No | State auto | Optional. |
| Qualifying Status | `qualifying_status` | Dropdown/Text | No | qualified | Future standards workflow. |
| Video URL | `video_url` | URL | No | https://... | Race video. |
| Results URL | `results_url` | URL | No | https://... | Official results page. |
| Coach Race Notes | `coach_race_notes` | Long Text | No | Went out too hard | Manual notes. |
| AI Race Analysis | `ai_race_analysis` | Long Text | No | Back half slowed 17.3%... | Phase 6. |
| Season Record ID | `season_record_id` | Relation/Text | No | sr_2026_spring_avery | Link to Season Record. |
| Source System | `source_system` | Dropdown/Text | Yes | manual | manual, smartcoach, athletic_net, milesplit, csv. |
| Source Record ID | `source_record_id` | Text | Yes | mr_avery_20260328_400m | Dedupe key. |
| Created/Imported At | `created_imported_at` | DateTime | Yes | 2026-03-28T22:00:00Z | Entry timestamp. |

### Minimum Viable Fields For First Implementation

- `record_name`
- `athlete_contact`
- `athlete_name_snapshot`
- `meet_name`
- `meet_date`
- `season`
- `season_year`
- `sport`
- `event`
- `result_display`
- `result_ms`
- `wind`
- `splits_json`
- `is_pr`
- `is_season_best`
- `coach_race_notes`
- `source_system`
- `source_record_id`

## Object 4: Athlete Best

Display name: `Athlete Best`

API key: `athlete_best`

Purpose:

Stores the athlete-level best marks by event. This becomes the parent object for automatic PB/SB detection, dashboard best marks, recruiting profiles, and parent/athlete alert workflows.

Creation trigger:

- Created or updated when a Meet Result is saved.
- One record per athlete and event.
- Associated with the athlete contact.

Primary display format:

```text
Avery Womble - 400m Bests
```

### Fields

| Field | API Key | Type | Required | Example | Notes |
|---|---|---:|---:|---|---|
| Athlete Best | `athlete_best` | Text | Yes | Avery Womble - 400m Bests | Primary display field. |
| Record Name | `record_name` | Text | Yes | Avery Womble - 400m Bests | Human-readable title. |
| Athlete Contact | `athlete_contact` | Contact relation/Text | Yes | abc123 | GHL contact association. |
| Athlete Name Snapshot | `athlete_name_snapshot` | Text | Yes | Avery Womble | Stable display. |
| Sport | `sport` | Dropdown/Text | Yes | track | Track or cross country. |
| Event | `event` | Text | Yes | 400m | Event this best record tracks. |
| Personal Best Display | `personal_best_display` | Text | No | 54.82 | Lifetime PB. |
| Personal Best MS | `personal_best_ms` | Number | No | 54820 | Numeric PB for comparisons. |
| Personal Best Meet | `personal_best_meet` | Text | No | District Meet | Meet where PB was set. |
| Personal Best Date | `personal_best_date` | Date | No | 2026-05-03 | PB date. |
| Personal Best Source Record ID | `personal_best_source_record_id` | Text | No | mr_... | Link/dedupe source. |
| Season | `season` | Dropdown | Yes | spring | Current season being tracked for SB. |
| Season Year | `season_year` | Number | Yes | 2026 | Current season year. |
| Season Best Display | `season_best_display` | Text | No | 54.82 | Current season best. |
| Season Best MS | `season_best_ms` | Number | No | 54820 | Numeric SB for comparisons. |
| Season Best Meet | `season_best_meet` | Text | No | District Meet | Meet where SB was set. |
| Season Best Date | `season_best_date` | Date | No | 2026-05-03 | SB date. |
| Season Best Source Record ID | `season_best_source_record_id` | Text | No | mr_... | Link/dedupe source. |
| Last Result Display | `last_result_display` | Text | No | 55.10 | Most recent meet result. |
| Last Result Date | `last_result_date` | Date | No | 2026-05-10 | Most recent result date. |
| PB Updated At | `pb_updated_at` | DateTime | No | 2026-05-03T18:45:00Z | Workflow trigger helper. |
| SB Updated At | `sb_updated_at` | DateTime | No | 2026-05-03T18:45:00Z | Workflow trigger helper. |
| Source System | `source_system` | Text | Yes | smartcoach_pro | Source label. |
| Source Record ID | `source_record_id` | Text | Yes | ab_contact_400m | One per athlete/event. |

### Minimum Viable Fields For First Implementation

- `athlete_best`
- `record_name`
- `athlete_contact`
- `athlete_name_snapshot`
- `sport`
- `event`
- `personal_best_display`
- `personal_best_ms`
- `personal_best_meet`
- `personal_best_date`
- `season`
- `season_year`
- `season_best_display`
- `season_best_ms`
- `season_best_meet`
- `season_best_date`
- `pb_updated_at`
- `sb_updated_at`
- `source_system`
- `source_record_id`

## Object 5: Records

Display name: `Record`

API key: `record`

Purpose:

Stores school, team, club, grade-level, and meet records that athletes can chase. Meet Results can be compared against this object to detect tied or broken records and trigger coach, parent, and athlete notifications later.

Creation trigger:

- Coach or admin enters existing school/team records.
- Later: import from a school record book, CSV, athletic.net, MileSplit, or dashboard form.
- Updated automatically when a saved Meet Result breaks or ties the current record.

Primary display format:

```text
Trinity Christian - Girls 400m School Record
```

### Fields

| Field | API Key | Type | Required | Example | Notes |
|---|---|---:|---:|---|---|
| Record | `record` | Text | Yes | Trinity Christian - Girls 400m School Record | Primary display field. |
| Record Name | `record_name` | Text | Yes | Trinity Christian - Girls 400m School Record | Human-readable title. |
| Record Scope | `record_scope` | Dropdown | Yes | school | school, team, club, grade, meet, facility, district, state_standard. |
| Organization Name | `organization_name` | Text | Yes | Trinity Christian Addison | School/team/club name. |
| Sport | `sport` | Dropdown/Text | Yes | track | Track or cross country. |
| Gender/Division | `gender_division` | Dropdown/Text | No | girls | Girls, boys, varsity, JV, open, etc. |
| Classification | `classification` | Text | No | TAPPS 5A | Optional class/division. |
| Season | `season` | Dropdown | No | spring | Useful for seasonal records. |
| Event | `event` | Text | Yes | 400m | Event being tracked. |
| Record Display | `record_display` | Text | Yes | 54.82 | Current record mark. |
| Record MS | `record_ms` | Number | No | 54820 | Timed events; lower is better. |
| Record Value Numeric | `record_value_numeric` | Number | No | 5.82 | Jumps/throws/points later. |
| Record Unit | `record_unit` | Text | No | seconds | seconds, meters, feet_inches, points. |
| Record Holder Contact | `record_holder_contact_id` | Contact relation/Text | No | abc123 | Current holder if in CRM. |
| Record Holder Name | `record_holder_name` | Text | Yes | Avery Womble | Current holder display. |
| Record Meet | `record_meet` | Text | No | State Championship | Meet where set. |
| Record Date | `record_date` | Date | No | 2026-05-03 | Date set. |
| Record Source Record ID | `record_source_record_id` | Text | No | mr_... | Meet Result that set current record. |
| Previous Record Display | `previous_record_display` | Text | No | 55.10 | Previous mark before last update. |
| Previous Record Holder Name | `previous_record_holder_name` | Text | No | Vanessa Smith | Previous holder. |
| Last Challenge Result ID | `last_challenge_result_id` | Text | No | mr_... | Most recent Meet Result checked. |
| Last Broken At | `last_broken_at` | DateTime | No | 2026-05-03T18:45:00Z | Workflow trigger helper. |
| Last Tied At | `last_tied_at` | DateTime | No | 2026-05-03T18:45:00Z | Workflow trigger helper. |
| Notification Status | `notification_status` | Dropdown/Text | No | pending | pending, sent, suppressed. |
| Coach Notes | `coach_notes` | Long Text | No | Converted from hand time | Admin context. |
| Source System | `source_system` | Text | Yes | manual | manual, smartcoach_pro, csv, athletic_net. |
| Source Record ID | `source_record_id` | Text | Yes | rec_school_tca_girls_400m | One per scope/org/division/event. |

### Minimum Viable Fields For First Implementation

- `record`
- `record_name`
- `record_scope`
- `organization_name`
- `sport`
- `gender_division`
- `event`
- `record_display`
- `record_ms`
- `record_holder_contact_id`
- `record_holder_name`
- `record_meet`
- `record_date`
- `record_source_record_id`
- `previous_record_display`
- `previous_record_holder_name`
- `last_broken_at`
- `last_tied_at`
- `notification_status`
- `source_system`
- `source_record_id`

## Object 6: Training Plan

Display name: `Training Plan`

API key: `training_plan`

Purpose:

Stores planned workouts and AI/coach prescriptions. This lets SMARTCoach compare planned vs completed work and gives the AI a record of why workouts were prescribed.

Creation trigger:

- Coach creates plan manually in dashboard.
- AI generates suggested plan for coach approval.
- Later: weekly plan generator creates records in bulk.

Primary display format:

```text
Avery Womble - Week 2 SPP - 6x200m SE I - Apr 7, 2026
```

### Fields

| Field | API Key | Type | Required | Example | Notes |
|---|---|---:|---:|---|---|
| Record Name | `record_name` | Text | Yes | Avery Womble - 6x200m SE I | Human-readable CRM title. |
| Athlete Contact | `athlete_contact` | Contact relation/Text | Yes | abc123 | GHL contact ID. |
| Athlete Name Snapshot | `athlete_name_snapshot` | Text | Yes | Avery Womble | Stable display. |
| Plan Scope | `plan_scope` | Dropdown | Yes | individual | individual, group, team. |
| Group Name | `group_name` | Text | No | 400m Group | For group/team prescriptions. |
| Plan Date | `plan_date` | Date | Yes | 2026-04-07 | Scheduled date. |
| Week Start Date | `week_start_date` | Date | No | 2026-04-06 | Calendar planning. |
| Season | `season` | Dropdown | Yes | spring | Shared picklist. |
| Season Year | `season_year` | Number | Yes | 2026 | Calendar year. |
| Phase | `phase` | Dropdown | Yes | spp | Shared picklist. |
| Workout Type | `workout_type` | Dropdown | Yes | special_endurance_1 | Shared picklist. |
| Energy System | `energy_system` | Dropdown | Yes | glycolytic_anaerobic | Shared picklist. |
| Surface | `surface` | Dropdown | No | track | Shared picklist. |
| Workout Title | `workout_title` | Text | Yes | 6x200m Special Endurance I | Coach-facing title. |
| Workout Description | `workout_description` | Long Text | Yes | 6x200m at 25.8-26.2, 3 min recovery | Full prescription. |
| Rep Distance | `rep_distance` | Text | No | 200m | Flexible text. |
| Rep Count | `rep_count` | Number | No | 6 | Planned reps. |
| Set Count | `set_count` | Number | No | 1 | Planned sets. |
| Recovery Description | `recovery_description` | Text | No | 3 min | Human-readable recovery. |
| Target Time Display | `target_time_display` | Text | No | 25.8-26.2 | Human-readable target. |
| Target Time Min MS | `target_time_min_ms` | Number | No | 25800 | Faster/lower bound for target range. |
| Target Time Max MS | `target_time_max_ms` | Number | No | 26200 | Slower/upper bound for target range. |
| Target Percent Min | `target_percent_min` | Number | No | 88 | Percent of anchor/race pace. |
| Target Percent Max | `target_percent_max` | Number | No | 92 | Percent of anchor/race pace. |
| Anchor Event | `anchor_event` | Text | No | 400m | Athlete anchor event. |
| Anchor Performance Display | `anchor_performance_display` | Text | No | 52.0 | Human-readable anchor. |
| Anchor Performance MS | `anchor_performance_ms` | Number | No | 52000 | Numeric anchor. |
| Adjustment Factors JSON | `adjustment_factors_json` | Long Text | No | `{"temperature_f":82}` | Phase, fatigue, temp, days since hard session. |
| AI Rationale | `ai_rationale` | Long Text | No | Glycolytic capacity improving... | Why this plan was suggested. |
| Coach Notes | `coach_notes` | Long Text | No | Keep full recovery honest | Manual notes. |
| Approval Status | `approval_status` | Dropdown | Yes | draft | draft, approved, rejected, completed, skipped. |
| Approved By | `approved_by` | Text | No | Marcus Moore | Coach approval. |
| Approved At | `approved_at` | DateTime | No | 2026-04-06T18:00:00Z | Coach approval time. |
| Completion Status | `completion_status` | Dropdown | No | completed | planned, partial, completed, skipped. |
| Completed Performance IDs | `completed_performance_ids` | Long Text | No | pr_1,pr_2,pr_3 | Links completed records. |
| Completed Summary | `completed_summary` | Long Text | No | 5 of 6 reps completed in range | Planned vs actual. |
| Compliance Percent | `compliance_percent` | Number | No | 83 | Completed on target. |
| Source System | `source_system` | Dropdown/Text | Yes | ai | manual, ai, template. |
| Source Record ID | `source_record_id` | Text | Yes | tp_avery_20260407_se1 | Dedupe key. |
| Created At | `created_at` | DateTime | Yes | 2026-04-06T17:45:00Z | Creation timestamp. |
| Last Updated At | `last_updated_at` | DateTime | No | 2026-04-07T19:00:00Z | Update timestamp. |

### Minimum Viable Fields For First Implementation

- `record_name`
- `athlete_contact`
- `athlete_name_snapshot`
- `plan_scope`
- `plan_date`
- `season`
- `season_year`
- `phase`
- `workout_type`
- `energy_system`
- `workout_title`
- `workout_description`
- `target_time_display`
- `target_time_min_ms`
- `target_time_max_ms`
- `anchor_event`
- `anchor_performance_display`
- `anchor_performance_ms`
- `ai_rationale`
- `approval_status`
- `source_system`
- `source_record_id`

## Athlete Contact Fields

These are not new custom objects, but they should exist on the GHL contact for every athlete.

| Field | API Key | Type | Required | Example |
|---|---|---:|---:|---|
| Athlete Sport | `athlete_sport` | Dropdown/Text | No | track |
| Primary Event | `primary_event` | Text | No | 400m |
| Secondary Events | `secondary_events` | Text | No | 200m, 4x400 |
| Graduation Year | `graduation_year` | Number | No | 2027 |
| Gender | `gender` | Dropdown | No | female |
| School | `school` | Text | No | Trinity Christian Addison |
| Team/Club | `team_club` | Text | No | SMART Speed |
| Athlete Status | `athlete_status` | Dropdown | No | active |
| SMARTCoach Active | `smartcoach_active` | Checkbox/Radio | Yes | true |
| SMARTCoach Athlete ID | `smartcoach_athlete_id` | Text | No | sca_avery_womble_2027 |
| Parent/Guardian Name | `parent_guardian_name` | Text | No | Parent Name |
| Parent/Guardian Email | `parent_guardian_email` | Email | No | parent@example.com |
| Recruiting Opt In | `recruiting_opt_in` | Checkbox | No | true |

## Athlete Roster Resolution

To avoid duplicate contacts once SMARTCoach is live, the app should prefer a controlled SMARTCoach Pro athlete roster instead of free-typed names.

Recommended workflow:

1. SMARTCoach Pro/GHL remains the source of truth for athlete contacts.
2. SMARTCoach loads active athletes from GHL through a Vercel API endpoint.
3. The runner name input becomes a searchable dropdown backed by active GHL contacts.
4. The selected athlete stores both display name and GHL contact ID locally.
5. Sync uses the selected GHL contact ID first, then name fallback only when needed.

Roster filter:

- Include contacts where `smartcoach_active` is true.
- Also allow fallback inclusion for contacts tagged `smartcoach-athlete` and not marked inactive.

Coach field workflow:

- If an athlete is missing, the app should offer `Add Athlete`.
- If an athlete exists but is inactive, the app should offer `Set Active`.
- Both actions should call Vercel server endpoints so the GHL private token stays server-side.

Recommended endpoints:

- `GET /api/ghl/athletes?active=true`
- `POST /api/ghl/athletes`
- `PATCH /api/ghl/athletes/:contactId`

Recommended local runner shape:

```json
{
  "id": 1,
  "name": "Avery Womble",
  "contactId": "GHL_CONTACT_ID",
  "smartcoachAthleteId": "sca_avery_womble_2027"
}
```

Sync rule:

- If `contactId` exists, sync to that contact.
- If `contactId` is missing but the name exactly matches one active athlete, attach to that contact.
- If no active match exists, create a new contact only after the coach confirms `Add Athlete`.
- If multiple matches exist, require the coach to choose one before syncing.

## Implementation Order

1. Create the first four custom objects in SMARTCoach Pro/GHL.
2. Add the minimum viable fields for Performance Record first.
3. Update `/api/ghl/sync-session.js` to create Performance Records after contact note sync.
4. Add athlete roster lookup and active/inactive contact management to prevent duplicate athlete contacts.
5. Add Season Record creation/update once Performance Records are being created reliably. Done in the sync function; live test pending.
6. Add Meet Result manual entry/import workflow.
7. Add Athlete Best records for automatic PB/SB detection.
8. Add Records records for school/team/club record detection and school-record alert workflows.
9. Add Training Plan records with the first AI pace calculator.

## Dedupe Strategy

For every object, `source_record_id` must be unique.

Recommended IDs:

- Performance Record: `pr_{contactId}_{sessionDate}_{groupSlug}_run_{runNumber}`
- Season Record: `sr_{contactId}_{seasonYear}_{season}`
- Meet Result: `mr_{contactId}_{meetDate}_{eventSlug}_{roundOrFinal}`
- Athlete Best: `ab_{contactId}_{eventSlug}`
- Records: `rec_{recordScope}_{organizationSlug}_{divisionSlug}_{eventSlug}`
- Training Plan: `tp_{contactId}_{planDate}_{workoutType}_{shortHash}`

If GHL custom objects do not enforce uniqueness directly, the sync function should search by `source_record_id` before creating a new record.

## Dashboard Queries Needed Later

Performance Record:

- By athlete
- By season
- By phase
- By workout type
- By energy system
- By date range
- Best total time by distance/workout

Season Record:

- By athlete
- By season/year
- Active season roster
- Injury flag
- PR/improvement leaders

Meet Result:

- By athlete
- By event
- By season/year
- PRs and season bests
- Qualifying status

Training Plan:

- Upcoming workouts
- Completed vs planned
- Approval status
- Workout type distribution
- Compliance percent
