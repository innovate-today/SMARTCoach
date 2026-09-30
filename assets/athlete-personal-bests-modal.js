(function(root){
  function esc(value){return String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
  function open(options){
    var athlete=options.athlete,modal=options.modal,title=options.title,body=options.body,request=options.request;
    if(title)title.textContent=(athlete.name||'Athlete')+' Personal Bests';
    body.innerHTML='<div class="athlete-pb"><div class="pb-sub">'+esc(athlete.graduationYear?'Class of '+athlete.graduationYear+' · ':'')+'All-time saved results</div>'+['Speed','Strength','Jumps & Throws','Meet Results'].map(function(label,index){return '<section data-pb-category="'+index+'"><div class="pb-heading"><h3>'+esc(label)+'</h3>'+(index===1?'<label class="pb-sub">Compare sets <select data-pb-reps aria-label="Strength rep basis" disabled><option>Loading...</option></select></label>':'')+'</div><div data-pb-section="'+index+'" aria-live="polite"><div class="pb-empty">Loading...</div></div></section>'}).join('')+'<div data-pb-empty class="pb-empty" hidden>No saved results yet.</div><div class="pb-footer"><span>SMART Trak · Personal Bests</span><button data-pb-retry class="quiet-action compact" type="button">Refresh</button></div></div>';
    if(modal)modal.hidden=false;
    var targets=Array.from(body.querySelectorAll('[data-pb-section]'));
    var categories=Array.from(body.querySelectorAll('[data-pb-category]'));
    var repSelect=body.querySelector('[data-pb-reps]'),fieldRecords=[],powerRecords=[],fieldStatus='loading',powerStatus='loading';
    function active(){return targets[0].isConnected}
    function display(index,html,empty){if(!active())return;targets[index].innerHTML=html;categories[index].hidden=!!empty;body.querySelector('[data-pb-empty]').hidden=!categories.every(function(category){return category.hidden})}
    function show(index,records){var groups=AthletePersonalBests.summarize(records);display(index,AthletePersonalBests.renderTable(groups,false),!groups.length)}
    function unavailable(index){display(index,'<div class="pb-empty pb-error">Results unavailable. Refresh to try again.</div>',false)}
    function renderField(){
      if(!active())return;
      var groups=AthletePersonalBests.summarize(fieldRecords.concat(powerRecords));
      var loading=fieldStatus==='loading'||powerStatus==='loading';
      var error=fieldStatus==='error'||powerStatus==='error';
      var html=groups.length?AthletePersonalBests.renderTable(groups,false):'<div class="pb-empty">'+(loading?'Loading...':'No comparable saved results.')+'</div>';
      if(error)html+='<div class="pb-empty pb-error">'+(fieldStatus==='error'?'Field Practice':'Power Trak')+' results unavailable. Refresh to try again.</div>';
      display(2,html,!groups.length&&!loading&&!error);
    }
    body.querySelector('[data-pb-retry]').addEventListener('click',function(){open(options)});
    request('/api/smart-trak/field-practice').then(function(data){
      if(!active())return;
      var practices=data.practices||[];
      show(0,AthletePersonalBests.speed(practices,athlete));
      fieldRecords=AthletePersonalBests.field(practices,athlete);fieldStatus='ready';renderField();
    }).catch(function(){fieldStatus='error';unavailable(0);renderField()});
    request('/api/smart-trak/power-trak?athleteId='+encodeURIComponent(athlete.contactId||athlete.smartcoachAthleteId||athlete.id||'')+'&athleteName='+encodeURIComponent(athlete.name||'')).then(function(data){
      if(!active())return;
      var records=AthletePersonalBests.power(data,athlete);
      powerRecords=records.field;powerStatus='ready';renderField();
      var reps=Array.from(new Set(records.strength.map(function(r){return r.reps}).filter(function(n){return Number.isInteger(n)&&n>0}))).sort(function(a,b){return a-b});
      var unknownReps=records.strength.some(function(r){return r.reps==null});
      repSelect.innerHTML=(reps.map(function(n){return '<option value="'+n+'">'+n+' rep'+(n===1?'':'s')+'</option>'}).join('')+(unknownReps?'<option value="unknown">Reps unrecorded</option>':''))||'<option>No sets</option>';
      repSelect.disabled=!reps.length&&!unknownReps;
      repSelect.value=reps.indexOf(5)>=0?'5':String(reps[0]||(unknownReps?'unknown':'No sets'));
      function renderStrength(){
        if(!active())return;
        var groups=AthletePersonalBests.strength(records.strength,repSelect.value);
        var estimates=AthletePersonalBests.summarize(records.estimates);
        var html=groups.length?AthletePersonalBests.renderTable(groups,true):'';
        if(estimates.length)html+='<div class="pb-heading"><h3>Imported Estimated 1RM</h3></div>'+AthletePersonalBests.renderTable(estimates,false);
        display(1,html||'<div class="pb-empty">No comparable saved results.</div>',!groups.length&&!estimates.length);
      }
      repSelect.addEventListener('change',renderStrength);renderStrength();
    }).catch(function(){powerStatus='error';unavailable(1);if(active())repSelect.innerHTML='<option>Unavailable</option>';renderField()});
    request('/api/smart-trak/dashboard?meetHistory=1').then(function(data){
      show(3,AthletePersonalBests.meets((data.meetResults||[]).concat(data.recentMeetResults||[]),athlete));
    }).catch(function(){unavailable(3)});
  }
  root.AthletePersonalBestsModal={open:open};
})(typeof self!=='undefined'?self:this);
