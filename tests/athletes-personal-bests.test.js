const assert=require('assert');
const fs=require('fs');
const vm=require('vm');

const html=fs.readFileSync('athletes.html','utf8');
const context={
  athletes:[
    {id:'active',name:'Active Sample',smartcoachActive:true,groups:['Distance'],parentGuardianEmail:'parent@example.com'},
    {id:'inactive',name:'Inactive Sample',smartcoachActive:false,smartcoachAthleteId:'old-athlete',groups:['Throws']},
    {id:'setup',name:'Setup Sample',smartcoachActive:false,groups:[]},
  ],
  els:{search:{value:''},statusFilter:{value:'all'},genderFilter:{value:'all'},groupFilter:{value:'all'}},
  norm:value=>String(value||'').trim().toLowerCase(),
  athleteGroups:athlete=>athlete.groups||[],
  hasParentContact:athlete=>!!athlete.parentGuardianEmail,
  parentLine:()=>'',
  parentEmailToolsEnabled:()=>false,
  selectedAthleteIds:{},
  esc:value=>String(value||''),
  escAttr:value=>String(value||''),
  docuStatusHtml:()=>'',
  equipmentStatusHtml:()=>'',
};
vm.createContext(context);
for(const name of ['filteredAthletes','rowHtml']){
  const start=html.indexOf('function '+name+'(');
  const end=html.indexOf('\nfunction ',start+1);
  vm.runInContext(html.slice(start,end),context);
}
for(const [filter,expected] of [
  ['all',3],['active',1],['inactive',2],['contacts',1],['parent',1],
]){
  context.els.statusFilter.value=filter;
  const rows=context.filteredAthletes();
  assert.strictEqual(rows.length,expected,filter);
  for(const athlete of rows){
    const row=context.rowHtml(athlete);
    assert(row.includes('data-athlete-detail="'+athlete.id+'"'),filter+' '+athlete.id);
    assert(!row.includes('data-athlete-bests='),filter+' '+athlete.id);
  }
}
assert(html.includes("function openPersonalBests(id)"));
assert(html.includes("AthletePersonalBestsModal.open({athlete:Object.assign({},athlete,{graduationYear:athlete.graduationYear||athlete.grade})"));
assert(html.includes('id="detailPersonalBestsTab"'));
assert(html.includes("showAthleteProfileTab(target==='bests'?'bests':'overview')"));
console.log('Athlete profile and Personal Bests tab are available in every roster filter.');
