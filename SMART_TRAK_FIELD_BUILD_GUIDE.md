# SMART Trak Field Build Guide

Use this when creating SMART Trak objects and fields directly in the underlying GoHighLevel account outside the Codex in-app browser.

Source model:

- `SMART_TRAK_DATA_MODEL.md`

## Current Constraint

The Codex in-app browser is not always able to complete the GoHighLevel login flow. You can still create the fields by logging into SMART Trak in your normal browser and following this guide.

If API access is available later, the same object and field names can be automated from `smart_trak_field_schema.json`.

Field naming note:

- Use each object's primary display field instead of adding a duplicate `Record Name` custom field.
- If a field key still contains `_json`, keep the API key for compatibility, but use a readable SMART Trak label such as `Splits` or `Season Bests`.

## Build Order

Create objects in this order:

1. `Performance Record`
2. `Season Record`
3. `Meet`
4. `Meet Result`
5. `Athlete Best`
6. `Record`
7. `Training Plan`
8. `Training Plan Day`

Create `Performance Record` first because the SMARTCoach sync creates one structured record per athlete run. Create `Meet` before `Meet Result` so meet results can link back to the meet schedule. Create `Training Plan` before `Training Plan Day` so daily workouts can link back to the parent plan.

Current custom object budget:

- SMART Trak limit currently being planned around: 10 custom objects.
- SMART Trak currently uses 8 custom objects.
- Remaining planned room: 2 custom objects, reserved for future high-value needs such as field-event attempts or recruiting profiles.

## Object 1: Performance Record

Object display name:

- `Performance Record`

Object API key:

- `performance_record`

Minimum fields to create first:

| Field | API Key | Type | Required |
|---|---|---|---|
| Athlete Contact | `athlete_contact_id` | Contact relation or Text | Yes |
| Athlete Name | `athlete_name_snapshot` | Text | Yes |
| Source Session ID | `source_session_id` | Text | Yes |
| Source Record ID | `source_record_id` | Text | Yes |
| Group Name | `group_name` | Text | Yes |
| Session Date | `session_date` | Date/DateTime | Yes |
| Season | `season` | Dropdown | Yes |
| Phase | `phase` | Dropdown | Yes |
| Workout Type | `workout_type` | Dropdown | Yes |
| Energy System | `energy_system` | Dropdown | Yes |
| Surface | `surface` | Dropdown | No |
| Rep Number | `rep_number` | Number | Yes |
| Total Time Display | `total_time_display` | Text | Yes |
| Total Time MS | `total_time_ms` | Number | Yes |
| Splits | `splits_json` | Long Text | No |
| Coach Note | `coach_note` | Long Text | No |
| Synced At | `synced_at` | DateTime | Yes |

## Object 2: Season Record

Object display name:

- `Season Record`

Object API key:

- `season_record`

Minimum fields to create first:

| Field | API Key | Type | Required |
|---|---|---|---|
| Athlete Contact | `athlete_contact_id` | Contact relation or Text | Yes |
| Athlete Name | `athlete_name_snapshot` | Text | Yes |
| Season | `season` | Dropdown | Yes |
| Season Year | `season_year` | Number | Yes |
| Sport | `sport` | Dropdown or Text | Yes |
| Primary Event | `primary_event` | Text | No |
| Practice Session Count | `practice_session_count` | Number | No |
| Performance Record Count | `performance_record_count` | Number | No |
| Meet Count | `meet_count` | Number | No |
| Season Bests | `season_bests_json` | Long Text | No |
| Injury Flag | `injury_flag` | Checkbox | No |
| Coach Season Notes | `coach_season_notes` | Long Text | No |
| Source Record ID | `source_record_id` | Text | Yes |
| Last Calculated At | `last_calculated_at` | DateTime | No |

## Object 3: Meet Result

Object display name:

- `Meet Result`

Object API key:

- `meet_result`

Minimum fields to create first:

| Field | API Key | Type | Required |
|---|---|---|---|
| Athlete Contact | `athlete_contact_id` | Contact relation or Text | Yes |
| Athlete Name | `athlete_name_snapshot` | Text | Yes |
| Meet Name | `meet_name` | Text | Yes |
| Meet Date | `meet_date` | Date | Yes |
| Season | `season` | Dropdown | Yes |
| Season Year | `season_year` | Number | Yes |
| Sport | `sport` | Dropdown or Text | Yes |
| Event | `event` | Text | Yes |
| Result Display | `result_display` | Text | Yes |
| Result MS | `result_ms` | Number | No |
| Wind | `wind` | Text | No |
| Splits | `splits_json` | Long Text | No |
| Is PR | `is_pr` | Checkbox | No |
| Is Season Best | `is_season_best` | Checkbox | No |
| Coach Race Notes | `coach_race_notes` | Long Text | No |
| Source System | `source_system` | Dropdown or Text | Yes |
| Source Record ID | `source_record_id` | Text | Yes |

## Object 4: Training Plan

Object display name:

- `Training Plan`

Object API key:

- `training_plan`

Minimum fields to create first:

| Field | API Key | Type | Required |
|---|---|---|---|
| Athlete Contact | `athlete_contact_id` | Contact relation or Text | Yes |
| Athlete Name | `athlete_name_snapshot` | Text | Yes |
| Plan Scope | `plan_scope` | Dropdown | Yes |
| Plan Date | `plan_date` | Date | Yes |
| Season | `season` | Dropdown | Yes |
| Season Year | `season_year` | Number | Yes |
| Phase | `phase` | Dropdown | Yes |
| Workout Type | `workout_type` | Dropdown | Yes |
| Energy System | `energy_system` | Dropdown | Yes |
| Workout Title | `workout_title` | Text | Yes |
| Workout Description | `workout_description` | Long Text | Yes |
| Target Time Display | `target_time_display` | Text | No |
| Target Time Min MS | `target_time_min_ms` | Number | No |
| Target Time Max MS | `target_time_max_ms` | Number | No |
| Current Fitness Event | `anchor_event` | Text | No |
| Current Fitness Display | `anchor_performance_display` | Text | No |
| Current Fitness MS | `anchor_performance_ms` | Number | No |
| Plan Rationale | `ai_rationale` | Long Text | No |
| Approval Status | `approval_status` | Dropdown | Yes |
| Source System | `source_system` | Dropdown or Text | Yes |
| Source Record ID | `source_record_id` | Text | Yes |

## Shared Dropdown Options

Season:

- `summer`
- `fall`
- `winter`
- `spring`

Phase:

- `gpp`
- `spp`
- `pre_competition`
- `competition`
- `transition`

Energy System:

- `atp_pc`
- `glycolytic`
- `oxidative`
- `mixed`

Surface:

- `track`
- `grass`
- `trail`
- `indoor`
- `road`
- `turf`
- `hills`
- `other`

Approval Status:

- `draft`
- `approved`
- `rejected`
- `completed`
- `skipped`

## After Fields Are Created

1. Capture the object IDs and field IDs from GoHighLevel.
2. Add them to a local mapping file, likely `smart_trak_field_ids.json`.
3. Update `/api/ghl/sync-session.js` so confirmed contact-note sync also creates `Performance Record` custom object rows.
4. Test with one athlete and one saved run before enabling all objects.
