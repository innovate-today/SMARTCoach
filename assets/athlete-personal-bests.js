(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.AthletePersonalBests=factory();
})(typeof self!=='undefined'?self:this,function(){
  function norm(value){return String(value==null?'':value).trim().replace(/\s+/g,' ').toLowerCase()}
  function text(value){return String(value==null?'':value)}
  function esc(value){return text(value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function matches(item,athlete){
    var ids=[item.contactId,item.smartcoachAthleteId,item.athleteId].map(norm).filter(Boolean);
    var target=[athlete.contactId,athlete.smartcoachAthleteId,athlete.id].map(norm).filter(Boolean);
    if(ids.length&&target.length)return ids.some(function(id){return target.indexOf(id)>=0});
    return !!norm(athlete.name)&&norm(item.athleteName||item.name)===norm(athlete.name);
  }
  function number(value){var n=Number(value);return value!=null&&text(value).trim()!==''&&isFinite(n)&&n>0?n:null}
  function seconds(value){
    var s=text(value).trim().replace(/\s*(sec|seconds|s)$/i,'');
    if(!/^\d+(?:\.\d+)?(?::\d+(?:\.\d+)?){0,2}$/.test(s))return null;
    var parts=s.split(':');if(parts.slice(1).some(function(p){return Number(p)>=60}))return null;
    return number(parts.reduce(function(sum,p){return sum*60+Number(p)},0));
  }
  function measurement(value,unit){
    var s=text(value).trim().replace(/[\u2032\u2019]/g,"'").replace(/\u2033/g,'"');
    var feet=s.match(/^(\d+)\s*(?:'|ft|feet|-)\s*(\d+(?:\.\d+)?)\s*(?:"|in|inches)?$/i);
    if(feet&&Number(feet[2])<12)return {value:Number(feet[1])*12+Number(feet[2]),unit:'in',display:s};
    var m=s.match(/^(\d+(?:\.\d+)?)\s*(lb|lbs|kg|in|inches|ft|feet|cm|m|sec|s)?$/i);
    if(!m||!number(m[1]))return null;
    var u=norm(m[2]||unit);u=({lbs:'lb',inches:'in',feet:'ft',s:'sec'})[u]||u;
    if(['lb','kg','in','ft','cm','m','sec'].indexOf(u)<0)return null;
    return {value:Number(m[1]),unit:u,display:m[1]+' '+u};
  }
  function conditions(values){return values.map(function(v){return text(v).trim()||'Unrecorded'}).join(' · ')}
  function add(out,item){if(!item||!number(item.value)||!item.date||!/^\d{4}-\d{2}-\d{2}/.test(item.date))return;out.push(item)}
  function speed(practices,athlete){
    var out=[];
    (practices||[]).forEach(function(p){(p.speedMetrics||[]).forEach(function(rep){
      if(!matches(rep,athlete))return;
      var value=number(rep.seconds||rep.timeSeconds)||seconds(rep.time||rep.resultDisplay);
      var unit=norm(rep.distanceUnit||rep.unit||p.speedMetricUnit||'m');
      var distance=rep.timedDistance||rep.distance||p.timedDistance||p.speedMetricDistance||p.distance;
      var label=rep.metric||p.speedEvent||(distance?distance+unit+(rep.flyZoneDistance||p.flyZoneDistance?' Fly':''):'Speed');
      var context=conditions([rep.surface||p.surface,rep.timingMethod||p.timingMethod,rep.startType||p.startType,rep.speedFocus||p.speedFocus,'Timed '+(distance||'unrecorded')+' '+unit,'Fly zone '+(rep.flyZoneDistance||p.flyZoneDistance||'unrecorded')]);
      add(out,{label:label,context:context,key:JSON.stringify([norm(label),norm(context)]),value:value,unit:'sec',display:value==null?'':value+' sec',date:rep.date||p.date,stamp:rep.updatedAt||p.updatedAt||'',session:p.id||p.date,lower:true});
    })});return out;
  }
  function power(data,athlete){
    var strength=[],field=[],estimates=[];
    function pushResult(label,value,unit,date,context,extra){
      var mark=measurement(value,unit);if(!mark)return;
      var item=Object.assign({label:label,context:context,key:JSON.stringify([norm(label),norm(context),mark.unit]),value:mark.value,unit:mark.unit,display:mark.display,date:date,lower:false},extra||{});
      if(mark.unit==='lb'||mark.unit==='kg'){
        if(/volume\s*load|band|body\s*weight|assisted|sprint|jump|throw/i.test(label))return;
        if(/\s+1rm$/i.test(label)){item.label=label.replace(/\s+1rm$/i,'');estimates.push(item);return}
        strength.push(item);
      }else if(['in','ft','m','cm'].indexOf(mark.unit)>=0)field.push(item);
    }
    (data.rackSessions||[]).forEach(function(rack){
      if(rack.status!=='complete')return;
      (rack.athletes||[]).forEach(function(a){
        if(!matches(Object.assign({},a,{athleteId:a.athleteId||a.id}),athlete))return;
        (a.results||[]).forEach(function(r){
          var reps=r.actualReps==null?1:number(r.actualReps);
          var context=conditions([{standard:'Standard',bilateral:'Bilateral',each_side:'Each side',alternating:'Alternating',left_only:'Left only',right_only:'Right only'}[r.executionMode]||r.executionMode||'Execution unrecorded',r.loadConvention||r.weightConvention||'Load convention unrecorded'].concat(r.equipment?[r.equipment]:[]));
          pushResult(r.exerciseName||'Exercise',r.actualValue,r.unit,rack.date,context,{reps:reps,leftReps:r.leftReps,rightReps:r.rightReps,stamp:r.completedAt||rack.updatedAt,session:rack.id});
        });
      });
    });
    (data.sessions||[]).forEach(function(session){(session.rows||[]).forEach(function(r){
      if(!matches(r,athlete))return;
      var labels={broadJump:'Broad Jump',verticalJump:'Vertical Jump',medBallThrow:'Med Ball Throw',squat:'Squat',bench:'Bench',clean:'Clean'};
      Object.keys(r.marks||{}).forEach(function(key){pushResult(labels[key]||key,r.marks[key],r.units&&r.units[key]||session.units&&session.units[key],session.date,'Testing · Setup unrecorded',{session:session.id,stamp:r.updatedAt||session.updatedAt,reps:null})});
    })});return {strength:strength,field:field,estimates:estimates};
  }
  function field(practices,athlete){
    var out=[];
    function record(p,mark,setup){var m=measurement(mark,p.unit||p.resultUnit);if(!m||['in','ft','cm','m'].indexOf(m.unit)<0)return;var context=conditions([setup||p.setupType,p.implementWeight,p.surface]);add(out,{label:p.event||'Field',context:context,key:JSON.stringify([norm(p.event),norm(context),m.unit]),value:m.value,unit:m.unit,display:m.display,date:p.date,session:p.id||p.date,stamp:p.updatedAt,lower:false})}
    (practices||[]).forEach(function(p){
      (p.athleteSummaries||[]).forEach(function(a){if(matches(a,athlete))record(p,a.bestMark,a.setupType)});
      if(matches(p,athlete))(p.attempts||[]).forEach(function(a){if(a.result==='O')record(p,a.height||a.mark,a.setupType)});
    });return out;
  }
  function meets(rows,athlete){
    var out=[];var seen=new Set();
    (rows||[]).forEach(function(r){
      if(!matches(r,athlete)||r.voided||r.isVoided||/void|deleted/i.test(r.status||'')||r.resultType==='relay'||/relay|\d\s*x\s*\d/i.test(r.event||''))return;
      var event=r.event||'',isField=r.resultType==='field'||/jump|vault|throw|discus|shot|javelin|hammer/i.test(event);
      var mark=isField?measurement(r.resultDisplay,r.resultUnit||r.unit):null;
      var value=isField?mark&&mark.value:seconds(r.resultDisplay);
      var wind=r.wind==null||text(r.wind).trim()===''||!isFinite(Number(r.wind))?'Wind unrecorded':Number(r.wind)>2?'Wind assisted':'Wind recorded';
      var context=conditions([r.sport,r.indoorOutdoor||r.venueType,r.timingMethod,isField||/^(100|200|110|60|80)\s*m/i.test(event)?wind:'']);
      var key=JSON.stringify([norm(event),norm(context),isField?mark&&mark.unit:'sec']);
      var id=JSON.stringify([r.recordId||r.id||'',event,r.meetDate,r.resultDisplay,r.meetName]);if(seen.has(id))return;seen.add(id);
      add(out,{label:event,context:context,key:key,value:value,unit:isField?mark&&mark.unit:'sec',display:r.resultDisplay,date:r.meetDate,stamp:r.updatedAt||r.syncedAt,session:r.meetRecordId||r.meetName||r.meetDate,lower:!isField});
    });return out;
  }
  function summarize(records){
    var grouped=new Map();
    (records||[]).forEach(function(item){if(!number(item.value)||!item.date)return;var group=grouped.get(item.key)||[];group.push(item);grouped.set(item.key,group)});
    return Array.from(grouped.values()).map(function(items){
      // Latest is the best result within the latest dated session, not the last rep.
      var ordered=items.slice().sort(function(a,b){return text(b.date).localeCompare(text(a.date))||text(b.stamp).localeCompare(text(a.stamp))});
      function better(a,b){return a.lower?a.value<b.value:a.value>b.value}
      var best=items.reduce(function(a,b){return better(b,a)||b.value===a.value&&text(b.date)<text(a.date)?b:a});
      var latest=ordered.filter(function(i){return i.date===ordered[0].date&&i.session===ordered[0].session}).reduce(function(a,b){return better(b,a)?b:a});
      return {label:best.label,context:best.context,best:best,latest:latest,gap:Math.abs(best.value-latest.value)};
    }).sort(function(a,b){return a.label.localeCompare(b.label)||a.context.localeCompare(b.context)});
  }
  function strength(records,reps){return summarize(records.filter(function(r){return reps==='unknown'?r.reps==null:r.reps===Number(reps)}))}
  function estimatedMax(item){return item&&item.reps>1&&item.reps<=10&&/squat|bench|deadlift|overhead press|push press|rdl|romanian/i.test(item.label)&&/standard|bilateral/i.test(item.context)?Math.round(item.value*(1+item.reps/30)*10)/10:null}
  function date(value){var s=text(value).slice(0,10);return /^\d{4}-\d{2}-\d{2}$/.test(s)?new Date(s+'T12:00:00').toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'Date unrecorded'}
  function cell(item,set){return '<b class="pb-best">'+esc(item.display)+(set&&item.reps!=null?' × '+esc(item.reps):'')+'</b>'+(set&&item.reps==null?'<span class="pb-date">Reps unrecorded</span>':'')+'<span class="pb-date">'+esc(date(item.date))+'</span>'}
  function renderTable(groups,isStrength){
    if(!groups.length)return '<div class="pb-empty">No comparable saved results.</div>';
    var head=isStrength?'<th>Exercise</th><th>Best set</th><th>Est. 1RM</th><th>Latest set</th>':'<th>Metric / Conditions</th><th>Personal best</th><th>Latest</th><th>Gap to best</th>';
    return '<div class="pb-tablewrap"><table><thead><tr>'+head+'</tr></thead><tbody>'+groups.map(function(g){
      var estimate=estimatedMax(g.best),delta=Number(g.gap.toFixed(2));
      return '<tr><td>'+esc(g.label)+'<span class="pb-meta">'+esc(g.context)+'</span></td><td>'+cell(g.best,isStrength)+'</td>'+(isStrength?'<td>'+(estimate==null?'--':esc(estimate+' '+g.best.unit)+'<span class="pb-date">Epley estimate</span>')+'</td><td>'+cell(g.latest,true)+'</td>':'<td>'+cell(g.latest,false)+'</td><td class="'+(delta?'':'pb-atbest')+'">'+(delta?esc(delta+' '+g.best.unit+' '+(g.best.lower?'slower':'lower')):'At PR')+'</td>')+'</tr>';
    }).join('')+'</tbody></table></div>';
  }
  return {matches:matches,seconds:seconds,measurement:measurement,speed:speed,power:power,field:field,meets:meets,summarize:summarize,strength:strength,estimatedMax:estimatedMax,renderTable:renderTable,esc:esc};
});
