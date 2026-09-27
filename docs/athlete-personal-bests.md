# Athlete Personal Bests

The dashboard roster shows XC Details only for athletes assigned to an XC group
(identified by group name or Cross Country season), or with XC training records
when group assignments are unavailable. The dashboard season selector alone
does not qualify an athlete. Personal Bests is available
to everyone. Clicking an XC athlete's name opens Details; other names open
Personal Bests. Details includes training, attendance, documents, notes, and
recent activity). Details omits Speed Trak and Field Practice cards and the
embedded Power Trak section, but retains Roster, Meet History, Speed Trak,
Power Trak, and Attendance navigation buttons. Snapshot opens the personal-best tables for all saved dates,
independent of the current dashboard filters.

The Snapshot includes Speed, Strength, Jumps & Throws, and Meet Results. It reads
Field Practice (including Speed Trak records), paged Power Trak history filtered
to the athlete, and the Meet History endpoint. It does not write athlete data.

Speed groups preserve metric, timed distance, fly zone, surface, timing method,
start type, and focus. Strength uses the selected actual rep count, exercise,
execution setting, load convention where recorded, and unit. Units are kept
separate rather than silently converted. Missing conditions are visibly marked
unrecorded, not assumed. The latest value is the best result within the latest
dated session in that comparison group. A tied PR retains the earliest date.

Actual singles are not imported estimated 1RM values. Imported estimates have
their own table. Epley estimates are labeled and only derived for supported
compound lifts with 2-10 recorded reps and standard/bilateral execution. This is
not a prescribed training weight. Unrecorded reps have a separate selector;
ambiguous unitless marks are not ranked.

Field Practice includes athlete-specific best marks or successful recorded
attempts, not planned heights, missed attempts, or whole-group results attributed
to an individual. Practice testing and competition results are separate. Meet
rows exclude voided, no-mark, and relay results; recorded wind-assisted marks
remain separate from non-assisted and unknown-wind marks.

Each source has an explicit loading/error state. A failed source does not erase
successful results from another source. Refresh retries the snapshot; stale
requests cannot overwrite a newly opened athlete view.

Run `npm test` for comparison and regression checks. The optional Playwright
check is `node tests/athlete-personal-bests-ui.test.js` with Playwright installed.
Set `PLAYWRIGHT_CHROME_PATH` to a local Chrome binary if necessary. The check uses
mocked requests and desktop/tablet/mobile widths, not production athlete data.
