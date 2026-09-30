(function(){
  'use strict';
  window.smartTrakGuideContent={
    version:'2026-09-29-distance-details',
    updates:[
      {area:'Team Overview',items:['Team Overview now shows active athletes, distance activity, recent meet results, and workspace links.',"Start Here and What's New are beside the Team Overview heading."]},
      {area:'Navigation',items:['Shared navigation groups Athletes, Training, Distance Trak, Speed Trak, Power Trak, Meets & Results, Tools, and Quick Add.','Quick Add opens existing entry flows, including Manage Meets from Power Trak.']},
      {area:'Athlete Review',items:['Open an athlete from the Athletes roster. The profile has Overview and Personal Bests tabs; Personal Bests shows all-time saved marks for every athlete.','Distance Details appears for XC and track-distance runners, with current-season meet results.']},
      {area:'Power Trak',items:['Rack Mode stays on the selected athlete after Complete Set; the next athlete chooses their own name.','Strength rankings compare the same completed rep count and weight unit.']},
      {area:'Distance Trak',items:['All optional Distance Trak tools are visible again.','Customize Dashboard is hidden while its saved settings are preserved.']}
    ],
    paths:[
      {title:'Set Up My Team',desc:'Start here when the account is new or the roster needs cleanup.',steps:['Add or import active athletes.','Create training groups.','Add current fitness marks.','Send athlete calendar links when ready.'],actions:[['Athletes','/athletes.html'],['Athlete Setup','/plan-setup.html']]},
      {title:'Plan Workouts',desc:'Build the week before practice starts.',steps:['Open Training Calendar.','Add or upload the plan.','Assign workouts to one or more groups.','Check the calendar before sharing.'],actions:[['Training Calendar','/training-calendar.html'],['Upload/Paste Plan','/plan-import.html'],['Auto Build Plan','/plan-builder.html']]},
      {title:'Run Daily Practice',desc:'Use the app and desktop together for the normal practice routine.',steps:['Open Training Calendar.','Use the SMARTCoach app to time or log work.','Take Attendance.','Add Keep Trak reminders or practice notes.'],actions:[['Training Calendar','/training-calendar.html'],['Attendance','/attendance.html'],['Keep Trak','/keep-trak.html'],['Open SMARTCoach','/']]},
      {title:'Run Meet Day',desc:'Prepare meets and save clean results.',steps:['Create or confirm the meet in Manage Meets.','Use the app for race timing, relays, field events, or Partner Timing.','Sync or save results.','Review Meet History and Records.'],actions:[['Manage Meets','#manage-meets'],['Meet History','/meet-history.html'],['Records','/records.html'],['Open SMARTCoach','/']]},
      {title:'Track Summer Mileage',desc:'Create a friendly, read-only team mileage challenge.',steps:['Set the Distance Trak activity range.','Open Miles Trak.','Choose challenge types and points.','Copy the public board link for athletes.'],actions:[['Miles Trak','#share-miles-board'],['Log Miles','#log-miles']]},
      {title:'Coach Field Events',desc:'Plan drills and save individual field-event takeaways.',steps:['Open Field Practice from Training.','Pick the event, group, and drill routine.','Check drills during practice.','Add athlete-specific focus and post-practice summaries.'],actions:[['Training Calendar','/training-calendar.html'],['Field Practice','/field-practice.html']]}
    ]
  };
})();
