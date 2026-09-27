(function(){
  'use strict';
  var header=document.querySelector('.top');
  var oldActions=header&&header.querySelector('.actions');
  var athletesPage=!!document.getElementById('addAthleteBtn');
  var attendancePage=!!document.getElementById('exportBtn');
  var calendarPage=!!document.getElementById('approveDraftsBtn');
  var dashboardPage=!athletesPage&&!attendancePage&&!calendarPage;
  if(!header||!oldActions||(dashboardPage&&typeof smartCoachPageUrl!=='function')||(dashboardPage&&productPlan()==='essential'))return;

  var nav=document.createElement('nav');
  nav.className='smart-nav';
  nav.setAttribute('aria-label','SMART Trak navigation');

  function link(label,path){
    var anchor=document.createElement('a');
    var hashIndex=path.indexOf('#');
    var hash=hashIndex>=0?path.slice(hashIndex):'';
    if(hashIndex>=0)path=path.slice(0,hashIndex);
    anchor.textContent=label;
    anchor.href=(dashboardPage?smartCoachPageUrl(path):pageUrl(path))+hash;
    return anchor;
  }
  function menu(label,current){
    var details=document.createElement('details');
    var summary=document.createElement('summary');
    var list=document.createElement('div');
    summary.textContent=label;
    if(current)summary.setAttribute('aria-current','page');
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

  var distance=menu('Distance Trak',dashboardPage);
  move(distance,'dashboardLink','Dashboard');
  if(calendarPage)move(distance,'milesTrakLink');
  else if(!dashboardPage)distance.appendChild(link('Miles Trak','/dashboard.html#share-miles-board'));
  else move(distance,'shareMilesBoardBtn');
  var athletesMenu=menu('Athletes',athletesPage||attendancePage);
  if(athletesPage){
    athletesMenu.appendChild(link('Roster','/athletes.html'));
    move(athletesMenu,'attendanceLink');
  }else{
    move(athletesMenu,'athletesLink','Roster');
    if(calendarPage)athletesMenu.appendChild(link('Roster','/athletes.html'));
    athletesMenu.appendChild(link('Attendance','/attendance.html'));
  }
  var training=menu('Training',calendarPage);
  if(calendarPage)training.appendChild(link('Training Calendar','/training-calendar.html'));
  else move(training,'trainingCalendarLink','Training Calendar');
  if(dashboardPage)move(training,'fitnessCleanupBtn');
  if(calendarPage){
    move(training,'fieldPracticeLink');
    move(training,'planSetupLink');
    move(training,'planImportLink');
    move(training,'planBuilderLink');
    move(training,'trainingCustomBtn');
    move(training,'stravaTrainingLink');
  }else training.appendChild(link('Field Practice','/field-practice.html'));
  if(calendarPage)move(nav,'speedTrakLink');
  else nav.appendChild(link('Speed Trak','/speed-trak.html'));
  if(!dashboardPage)nav.appendChild(link('Power Trak','/power-trak.html'));
  else move(nav,'powerTrakLink');

  var meets=menu('Meets & Results');
  if(calendarPage){
    move(meets,'manageMeetsBtn');
    meets.appendChild(link('Meet History','/meet-history.html'));
    meets.appendChild(link('Records','/records.html'));
    meets.appendChild(link('Track Simulator','/track-simulator.html'));
    meets.appendChild(link('XC Simulator','/xc-simulator.html'));
  }else if(!dashboardPage){
    meets.appendChild(link('Meet History','/meet-history.html'));
    meets.appendChild(link('Records','/records.html'));
    meets.appendChild(link('Track Simulator','/track-simulator.html'));
    meets.appendChild(link('XC Simulator','/xc-simulator.html'));
  }else{
    move(meets,'meetHistoryLink');
    move(meets,'manageMeetsBtn');
    move(meets,'shareResultsBoardBtn');
    move(meets,'recordsLink');
    move(meets,'simulatorBtn');
  }

  var tools=menu('Tools');
  if(athletesPage){
    move(tools,'equipmentLookupBtn');
    move(tools,'emailCalendarLinksBtn');
    move(tools,'calendarQuestionsBtn');
    move(tools,'emailToolsToggleBtn');
    move(tools,'emailParentsBtn');
    move(tools,'copyParentsBtn');
    tools.appendChild(link('Keep Trak','/keep-trak.html'));
    tools.appendChild(link('Weather','/weather.html'));
  }else if(attendancePage||calendarPage){
    if(calendarPage){move(tools,'keepTrakLink');move(tools,'weatherLink');}
    else{tools.appendChild(link('Keep Trak','/keep-trak.html'));tools.appendChild(link('Weather','/weather.html'));}
  }else{
    move(tools,'keepTrakLink');
    move(tools,'weatherLink');
  }

  var quick=menu('Quick Add');
  if(athletesPage){
    move(quick,'addAthleteBtn');
    move(quick,'importAthletesBtn');
    quick.appendChild(link('Log Miles','/dashboard.html#log-miles'));
    quick.appendChild(link('Log Single Result','/dashboard.html#log-single-result'));
    quick.appendChild(link('Manage Meets','/dashboard.html#manage-meets'));
  }else if(attendancePage){
    quick.appendChild(link('Add Athlete','/athletes.html#add-athlete'));
    quick.appendChild(link('Import Athletes','/athletes.html#import-athletes'));
    quick.appendChild(link('Log Miles','/dashboard.html#log-miles'));
    quick.appendChild(link('Log Single Result','/dashboard.html#log-single-result'));
    quick.appendChild(link('Manage Meets','/dashboard.html#manage-meets'));
  }else{
    move(quick,'manualMileageBtn');
    move(quick,'raceResultBtn');
    command(quick,'Manage Meets','manageMeetsBtn');
    quick.appendChild(link('Add Athlete','/athletes.html#add-athlete'));
    quick.appendChild(link('Import Athletes','/athletes.html#import-athletes'));
  }

  var account=menu('Account');
  var staff=dashboardPage?move(account,'changeCodeBtn'):link('Staff Access','/dashboard.html#staff-access');
  if(!dashboardPage){staff.hidden=true;account.appendChild(staff);}
  var signOut=document.createElement('button');
  signOut.type='button';
  signOut.textContent='Sign Out';
  signOut.addEventListener('click',function(){
    try{
      var key=calendarPage?accountKey():smartCoachAccountKey();
      localStorage.removeItem('sc_access_'+key);
      localStorage.removeItem('sc_session_remembered_'+key);
      localStorage.removeItem('smarttrak_dashboard_snapshot_'+key);
      localStorage.removeItem('smarttrak_dashboard_secondary_'+key);
      localStorage.removeItem('smarttrak_account_status_'+key);
      localStorage.removeItem('sc_admin_tools');
      sessionStorage.removeItem('sc_session_'+key);
    }catch(error){}
    window.location.replace((athletesPage?'/athletes.html':attendancePage?'/attendance.html':calendarPage?'/training-calendar.html':'/dashboard.html')+'?account='+encodeURIComponent(calendarPage?accountKey():smartCoachAccountKey()));
  });
  account.appendChild(signOut);
  move(nav,'refreshBtn');
  if(attendancePage)move(nav,'exportBtn');
  if(calendarPage){move(nav,'approveDraftsBtn');move(nav,'scheduleApprovedBtn');}

  window.smartTrakNavigationUpdateAccess=function(status){
    var coach=status&&status.coach;
    var headCoach=!!(status&&status.staffAdminAllowed&&coach&&(Number(coach.index)===0||/^head coach$/i.test(String(coach.role||''))));
    if(staff)staff.hidden=!headCoach;
    if(dashboardPage&&headCoach&&window.location.hash==='#staff-access'&&!window.smartTrakStaffLinkOpened){
      window.smartTrakStaffLinkOpened=true;
      setTimeout(function(){openCodeModal();history.replaceState(null,'',window.location.pathname+window.location.search);},0);
    }
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
