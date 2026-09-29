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
    assert(context.rowHtml(athlete).includes('data-athlete-bests="'+athlete.id+'">Personal Bests</button>'),filter+' '+athlete.id);
  }
}
assert(html.includes("function openPersonalBests(id)"));
assert(html.includes("AthletePersonalBestsModal.open({athlete:Object.assign({},athlete,{graduationYear:athlete.graduationYear||athlete.grade})"));
console.log('Athletes Personal Bests action is available in every roster filter.');
