(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.PowerTrakRackHistory=factory();
})(typeof self!=='undefined'?self:this,function(){
  function rows(racks,filters){
    filters=filters||{};
    var search=String(filters.search||'').trim().toLowerCase(), output=[];
    (racks||[]).forEach(function(rack){
      if(rack.status!=='complete')return;
      var date=rack.date||String(rack.completedAt||'').slice(0,10);
      if(filters.start&&date<filters.start||filters.end&&date>filters.end)return;
      (rack.athletes||[]).forEach(function(athlete){
        var results=athlete.results||[];
        (results.length?results:[null]).forEach(function(result){
          var row={rackId:rack.id,date:date,workout:rack.workoutName||'Workout',rack:rack.rackName||'Rack',athlete:athlete.name||'Unnamed',exercise:result&&result.exerciseName||'No recorded sets',set:result?(result.actualReps==null?'Rep ':'Set ')+(result.actualReps==null?result.rep||1:result.round||1):'--',reps:result?(Number(result.actualReps)>0?Number(result.actualReps):1):'--',result:result&&result.actualValue!==''&&result.actualValue!=null?String(result.actualValue)+(result.unit?' '+result.unit:''):'--',sides:result&&(result.leftReps!=null||result.rightReps!=null)?'L '+(result.leftReps||0)+' / R '+(result.rightReps||0):'',status:athlete.rackStatus==='complete'?'Completed':String(rack.id||'').indexOf('power_import_')===0?'Imported':'Stopped early'};
          if(!search||[row.date,row.workout,row.rack,row.athlete,row.exercise,row.result,row.status].join(' ').toLowerCase().indexOf(search)>=0)output.push(row);
        });
      });
    });
    return output.sort(function(a,b){return String(b.date).localeCompare(String(a.date))||a.athlete.localeCompare(b.athlete)});
  }
  return {rows:rows};
});
