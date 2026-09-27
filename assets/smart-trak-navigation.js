(function(){
  'use strict';
  var header=document.querySelector('.top');
  var oldActions=header&&header.querySelector('.actions');
  if(!header||!oldActions||typeof smartCoachPageUrl!=='function'||productPlan()==='essential')return;

  var nav=document.createElement('nav');
  nav.className='smart-nav';
  nav.setAttribute('aria-label','SMART Trak navigation');

  function link(label,path){
    var anchor=document.createElement('a');
    anchor.textContent=label;
    anchor.href=smartCoachPageUrl(path);
    return anchor;
  }
  function menu(label){
    var details=document.createElement('details');
    var summary=document.createElement('summary');
    var list=document.createElement('div');
    summary.textContent=label;
    list.className='smart-nav-menu';
    details.appendChild(summary);
    details.appendChild(list);
    nav.appendChild(details);
    return list;
  }
  function move(parent,id,label){
    var node=document.getElementById(id);
    if(node){
      if(label)node.textContent=label;
      parent.appendChild(node);
    }
    return node;
  }
  function command(parent,label,id){
    var button=document.createElement('button');
    button.type='button';
    button.textContent=label;
    button.addEventListener('click',function(){var original=document.getElementById(id);if(original)original.click();});
    parent.appendChild(button);
  }

  var distance=move(nav,'dashboardLink','Distance Training');
  if(distance)distance.setAttribute('aria-current','page');
  move(nav,'athletesLink');
  var training=menu('Training');
  move(training,'trainingCalendarLink','Training Calendar');
  move(training,'fitnessCleanupBtn');
  training.appendChild(link('Field Practice','/field-practice.html'));
  nav.appendChild(link('Speed Trak','/speed-trak.html'));
  move(nav,'powerTrakLink');

  var meets=menu('Meets & Results');
  move(meets,'meetHistoryLink');
  move(meets,'manageMeetsBtn');
  move(meets,'shareResultsBoardBtn');
  move(meets,'recordsLink');
  move(meets,'simulatorBtn');

  var tools=menu('Tools');
  move(tools,'shareMilesBoardBtn');
  move(tools,'keepTrakLink');
  move(tools,'weatherLink');
  tools.appendChild(link('Attendance','/attendance.html'));

  var quick=menu('Quick Add');
  move(quick,'manualMileageBtn');
  move(quick,'raceResultBtn');
  command(quick,'Manage Meets','manageMeetsBtn');

  var account=menu('Account');
  move(account,'changeCodeBtn');
  var signOut=document.createElement('button');
  signOut.type='button';
  signOut.textContent='Sign Out';
  signOut.addEventListener('click',function(){
    try{
      localStorage.removeItem(accessCodeStorageKey());
      localStorage.removeItem(rememberedSessionStorageKey());
      localStorage.removeItem(dashboardBrowserSnapshotKey());
      localStorage.removeItem(dashboardSecondaryBrowserSnapshotKey());
      localStorage.removeItem(dashboardAccountStatusCacheKey());
      localStorage.removeItem('sc_admin_tools');
      sessionStorage.removeItem(sessionStorageKey());
    }catch(error){}
    window.location.replace('/dashboard.html?account='+encodeURIComponent(smartCoachAccountKey()));
  });
  account.appendChild(signOut);
  move(nav,'refreshBtn');

  window.smartTrakNavigationUpdateAccess=function(status){
    var coach=status&&status.coach;
    var headCoach=!!(status&&status.staffAdminAllowed&&coach&&(Number(coach.index)===0||/^head coach$/i.test(String(coach.role||''))));
    var staff=document.getElementById('changeCodeBtn');
    if(staff)staff.hidden=!headCoach;
  };
  window.smartTrakNavigationUpdateAccess(typeof accountStatus==='undefined'?null:accountStatus);

  nav.addEventListener('click',function(event){
    if(event.target.closest('summary')){
      var current=event.target.closest('details');
      nav.querySelectorAll('details[open]').forEach(function(item){if(item!==current)item.open=false;});
    }else if(event.target.closest('a,button')){
      nav.querySelectorAll('details[open]').forEach(function(item){item.open=false;});
    }
  });
  document.addEventListener('keydown',function(event){
    if(event.key==='Escape')nav.querySelectorAll('details[open]').forEach(function(item){item.open=false;});
  });
  document.addEventListener('click',function(event){
    if(!nav.contains(event.target))nav.querySelectorAll('details[open]').forEach(function(item){item.open=false;});
  });
  oldActions.classList.add('smart-nav-mounted');
  header.appendChild(nav);
})();
