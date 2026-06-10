(function(){
  if (window.SMARTCoachHelpWidgetLoaded) return;
  window.SMARTCoachHelpWidgetLoaded = true;
  function embeddedMode(){
    try{
      var params=new URLSearchParams(window.location.search||'');
      return params.get('embed')==='1'||params.get('iframe')==='1'||params.get('embedded')==='1';
    }catch(e){return false;}
  }
  function hideGhlIconsRequested(){
    try{
      var params=new URLSearchParams(window.location.search||'');
      return embeddedMode()||params.get('hideGhlIcons')==='1'||params.get('hideGhlChrome')==='1';
    }catch(e){return embeddedMode();}
  }
  var externalWidgetSelectors = [
    'iframe[src*="leadconnectorhq.com"]',
    'iframe[src*="chat-widget"]',
    'div[id*="lc_chat"]',
    'div[class*="lc-"]',
    'div[class*="leadconnector"]',
    'div[class*="chat-widget"]'
  ].join(',');
  var parentChromeSelectors = [
    '[aria-label*="Phone" i]',
    '[aria-label*="Call" i]',
    '[aria-label*="Announcement" i]',
    '[aria-label*="Notification" i]',
    '[aria-label*="Help" i]',
    '[aria-label*="Ask AI" i]',
    '[title*="Phone" i]',
    '[title*="Call" i]',
    '[title*="Announcement" i]',
    '[title*="Notification" i]',
    '[title*="Help" i]',
    '[title*="Ask AI" i]',
    '[data-testid*="phone" i]',
    '[data-testid*="call" i]',
    '[data-testid*="announcement" i]',
    '[data-testid*="notification" i]',
    '[data-testid*="help" i]'
  ].join(',');
  var scopedExternalWidgetSelectors = externalWidgetSelectors.split(',').map(function(selector){return 'body.smartcoach-hide-ghl-icons '+selector;}).join(',');
  var css = scopedExternalWidgetSelectors + '{display:none!important;visibility:hidden!important;pointer-events:none!important;}' +
    '.smartcoach-bugtrak-btn{position:fixed;left:18px;bottom:18px;z-index:2147483000;border:1px solid #bfd0ef;border-radius:999px;background:#fff;color:#173891;font:800 13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:9px 12px;box-shadow:0 14px 32px rgba(15,23,42,.18);cursor:pointer}' +
    '.smartcoach-bugtrak-btn:hover{background:#eef4ff}' +
    '.smartcoach-bugtrak-overlay{position:fixed;inset:0;z-index:2147483001;background:rgba(15,23,42,.42);display:flex;align-items:flex-start;justify-content:center;padding:36px 14px;overflow:auto}' +
    '.smartcoach-bugtrak-overlay[hidden]{display:none!important}' +
    '.smartcoach-bugtrak-panel{width:min(560px,100%);background:#fff;border:1px solid #dbe3ef;border-radius:10px;box-shadow:0 22px 60px rgba(15,23,42,.28);overflow:hidden;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}' +
    '.smartcoach-bugtrak-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid #dbe3ef}' +
    '.smartcoach-bugtrak-head h2{font-size:20px;line-height:1.2;margin:0}' +
    '.smartcoach-bugtrak-body{display:grid;gap:11px;padding:14px 16px 16px}' +
    '.smartcoach-bugtrak-intro{color:#526481;font-size:13px;line-height:1.4;margin:0}' +
    '.smartcoach-feedback-tabs{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
    '.smartcoach-feedback-tab{border:1px solid #dbe3ef;border-radius:8px;background:#f5f7fb;color:#172033;font:900 14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:10px;cursor:pointer}' +
    '.smartcoach-feedback-tab.active{border-color:#2B4FCC;background:#eef4ff;color:#173891}' +
    '.smartcoach-bugtrak-grid{display:grid;grid-template-columns:1fr 150px;gap:10px}' +
    '.smartcoach-bugtrak-field{display:grid;gap:5px}' +
    '.smartcoach-bugtrak-field label{font-size:12px;font-weight:900;color:#475569;text-transform:uppercase;letter-spacing:.03em}' +
    '.smartcoach-bugtrak-field input,.smartcoach-bugtrak-field select,.smartcoach-bugtrak-field textarea{width:100%;border:1px solid #dbe3ef;border-radius:8px;background:#fff;color:#111827;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:9px 10px}' +
    '.smartcoach-bugtrak-field textarea{min-height:92px;resize:vertical;line-height:1.4}' +
    '.smartcoach-bugtrak-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:2px}' +
    '.smartcoach-bugtrak-status{margin-right:auto;color:#526481;font-size:13px;font-weight:800}' +
    '.smartcoach-bugtrak-actions button,.smartcoach-bugtrak-close{border:0;border-radius:8px;background:#2B4FCC;color:#fff;font:800 14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:8px 11px;cursor:pointer}' +
    '.smartcoach-bugtrak-actions .secondary,.smartcoach-bugtrak-close{background:#dde3ed;color:#172033}' +
    '.smartcoach-bugtrak-actions button:disabled{opacity:.55;cursor:not-allowed}' +
    '@media(max-width:760px){.smartcoach-bugtrak-btn,.smartcoach-bugtrak-overlay{display:none!important}}';
  var style = document.createElement('style');
  style.setAttribute('data-smartcoach-help-widget','1');
  style.textContent = css;
  document.head.appendChild(style);
  if(hideGhlIconsRequested()){
    document.body.classList.add('smartcoach-hide-ghl-icons');
    document.documentElement.classList.add('smartcoach-hide-ghl-icons');
  }
  function hideExternalWidgets(root){
    if(!hideGhlIconsRequested())return;
    root=root||document;
    Array.prototype.slice.call(root.querySelectorAll(externalWidgetSelectors)).forEach(function(node){
      if(node.closest&&node.closest('.smartcoach-bugtrak-overlay'))return;
      node.style.setProperty('display','none','important');
      node.style.setProperty('visibility','hidden','important');
      node.style.setProperty('pointer-events','none','important');
    });
  }
  function hideParentGhlChrome(){
    if(!hideGhlIconsRequested())return;
    try{
      if(!window.parent||window.parent===window||!window.parent.document)return;
      var parentDocument=window.parent.document;
      if(!parentDocument.getElementById('smartcoachGhlChromeHideStyle')){
        var parentStyle=parentDocument.createElement('style');
        parentStyle.id='smartcoachGhlChromeHideStyle';
        parentStyle.textContent=parentChromeSelectors+'{display:none!important;visibility:hidden!important;pointer-events:none!important;}';
        parentDocument.head.appendChild(parentStyle);
      }
      Array.prototype.slice.call(parentDocument.querySelectorAll(parentChromeSelectors)).forEach(function(node){
        node.style.setProperty('display','none','important');
        node.style.setProperty('visibility','hidden','important');
        node.style.setProperty('pointer-events','none','important');
      });
    }catch(e){}
  }
  function hideGhlChrome(){
    hideExternalWidgets(document);
    hideParentGhlChrome();
  }
  setInterval(hideGhlChrome,1000);
  hideGhlChrome();
  if(!hideGhlIconsRequested()){
    var script = document.createElement('script');
    script.src = 'https://beta.leadconnectorhq.com/loader.js';
    script.setAttribute('data-resources-url','https://beta.leadconnectorhq.com/chat-widget/loader.js');
    script.setAttribute('data-widget-id','6a1785dc1b5a98ef9df8eae9');
    script.async = true;
    document.head.appendChild(script);
  }
  function accountKey(){
    try{
      var params=new URLSearchParams(window.location.search||'');
      var value=(params.get('account')||localStorage.getItem('sc_account')||'default').trim();
      return value||'default';
    }catch(e){return 'default';}
  }
  function storageValue(key){
    try{return localStorage.getItem(key)||sessionStorage.getItem(key)||'';}catch(e){return '';}
  }
  function sessionToken(){
    var account=accountKey();
    return storageValue('sc_session_remembered_'+account)||storageValue('sc_session_'+account);
  }
  function accessCode(){
    try{return localStorage.getItem('sc_access_'+accountKey())||'';}catch(e){return '';}
  }
  function deviceId(){
    try{
      var key='sc_bugtrak_device_'+accountKey();
      var value=localStorage.getItem(key)||'';
      if(!value){
        value='desk_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,9);
        localStorage.setItem(key,value);
      }
      return value;
    }catch(e){return 'desk_'+Date.now().toString(36);}
  }
  function deviceLabel(){
    var ua=navigator.userAgent||'';
    var browser=/CriOS|Chrome/i.test(ua)?'Chrome':/Safari/i.test(ua)?'Safari':/Firefox/i.test(ua)?'Firefox':/Edg/i.test(ua)?'Edge':'Browser';
    var device=/Macintosh|Mac OS/i.test(ua)?'Mac':/Windows/i.test(ua)?'Windows':/Linux/i.test(ua)?'Linux':'Desktop';
    return device+' '+browser;
  }
  function headers(){
    var out={'Content-Type':'application/json','X-SMARTCoach-Account':accountKey(),'X-SMARTCoach-Device-Id':deviceId(),'X-SMARTCoach-Device-Label':deviceLabel(),'X-SMARTCoach-Device-Source':'desktop'};
    var session=sessionToken();
    var code=accessCode();
    if(session)out['X-SMARTCoach-Session']=session;
    if(code&&!session)out['X-SMARTCoach-Access-Code']=code;
    return out;
  }
  function pageArea(){
    var title=document.title||'SMART Trak';
    if(/Attendance/i.test(title))return 'Attendance Trak';
    if(/Keep/i.test(title))return 'Keep Trak';
    if(/Meet History/i.test(title))return 'Meet History';
    if(/Training Calendar/i.test(title))return 'Training Calendar';
    if(/Dashboard/i.test(title))return 'Dashboard';
    if(/Records/i.test(title))return 'Records';
    if(/Weather/i.test(title))return 'Weather';
    return title.replace(/^SMART Trak\s*/i,'').trim()||'SMART Trak';
  }
  function createBugTrak(){
    if(document.getElementById('smartcoachFeedbackBtn'))return;
    var button=document.createElement('button');
    button.id='smartcoachFeedbackBtn';
    button.className='smartcoach-bugtrak-btn';
    button.type='button';
    button.textContent='Feedback';
    var overlay=document.createElement('div');
    overlay.id='smartcoachBugTrakOverlay';
    overlay.className='smartcoach-bugtrak-overlay';
    overlay.hidden=true;
    overlay.innerHTML='<section class="smartcoach-bugtrak-panel" role="dialog" aria-modal="true" aria-labelledby="smartcoachBugTrakTitle"><div class="smartcoach-bugtrak-head"><h2 id="smartcoachBugTrakTitle">Feedback</h2><button class="smartcoach-bugtrak-close" type="button" data-bugtrak-close>Close</button></div><form id="smartcoachBugTrakForm" class="smartcoach-bugtrak-body"><p id="smartcoachFeedbackIntro" class="smartcoach-bugtrak-intro">Send a beta bug report or product idea with the current page and account context.</p><div class="smartcoach-feedback-tabs"><button id="smartcoachBugMode" class="smartcoach-feedback-tab active" type="button" data-feedback-mode="bug">Bug Trak</button><button id="smartcoachIdeaMode" class="smartcoach-feedback-tab" type="button" data-feedback-mode="idea">Idea Trak</button></div><div class="smartcoach-bugtrak-grid"><div class="smartcoach-bugtrak-field"><label for="smartcoachBugArea">Area</label><input id="smartcoachBugArea" name="area" type="text"></div><div id="smartcoachUrgencyField" class="smartcoach-bugtrak-field"><label for="smartcoachBugUrgency">Urgency</label><select id="smartcoachBugUrgency" name="urgency"><option>Medium</option><option>Low</option><option>High</option><option>Blocking</option></select></div></div><div class="smartcoach-bugtrak-field"><label id="smartcoachSummaryLabel" for="smartcoachBugSummary">What is wrong?</label><input id="smartcoachBugSummary" name="summary" type="text" maxlength="180" required placeholder="Example: Attendance delete did not remove the row"></div><div class="smartcoach-bugtrak-field"><label id="smartcoachDetailsLabel" for="smartcoachBugDetails">Details</label><textarea id="smartcoachBugDetails" name="details" maxlength="4000" required placeholder="What were you doing? What happened?"></textarea></div><div id="smartcoachExpectedField" class="smartcoach-bugtrak-field"><label id="smartcoachExpectedLabel" for="smartcoachBugExpected">Expected result</label><textarea id="smartcoachBugExpected" name="expected" maxlength="2000" placeholder="What should have happened?"></textarea></div><div class="smartcoach-bugtrak-grid"><div class="smartcoach-bugtrak-field"><label for="smartcoachBugCoach">Coach name</label><input id="smartcoachBugCoach" name="coachName" type="text" maxlength="120"></div><div class="smartcoach-bugtrak-field"><label for="smartcoachBugEmail">Email</label><input id="smartcoachBugEmail" name="coachEmail" type="email" maxlength="180"></div></div><div class="smartcoach-bugtrak-actions"><div id="smartcoachBugStatus" class="smartcoach-bugtrak-status"></div><button class="secondary" type="button" data-bugtrak-close>Cancel</button><button id="smartcoachBugSubmit" type="submit">Send Bug Report</button></div></form></section>';
    document.body.appendChild(button);
    document.body.appendChild(overlay);
    var form=overlay.querySelector('#smartcoachBugTrakForm');
    var status=overlay.querySelector('#smartcoachBugStatus');
    var submit=overlay.querySelector('#smartcoachBugSubmit');
    var mode='bug';
    function setMode(nextMode){
      mode=nextMode==='idea'?'idea':'bug';
      overlay.querySelectorAll('[data-feedback-mode]').forEach(function(node){node.classList.toggle('active',node.getAttribute('data-feedback-mode')===mode);});
      overlay.querySelector('#smartcoachUrgencyField').hidden=mode==='idea';
      overlay.querySelector('#smartcoachExpectedField').hidden=mode==='idea';
      overlay.querySelector('#smartcoachFeedbackIntro').textContent=mode==='idea'?'Share a product idea or workflow improvement. Ideas save privately for beta review.':'Report something broken or incorrect. Bug Trak sends the page and account context with your report.';
      overlay.querySelector('#smartcoachSummaryLabel').textContent=mode==='idea'?'Idea':'What is wrong?';
      overlay.querySelector('#smartcoachDetailsLabel').textContent=mode==='idea'?'Why it helps':'Details';
      overlay.querySelector('#smartcoachBugSummary').placeholder=mode==='idea'?'Example: Add a weekly attendance eligibility summary':'Example: Attendance delete did not remove the row';
      overlay.querySelector('#smartcoachBugDetails').placeholder=mode==='idea'?'What would this help you or other coaches do?':'What were you doing? What happened?';
      submit.textContent=mode==='idea'?'Send Idea':'Send Bug Report';
      status.textContent='';
    }
    function open(){
      overlay.hidden=false;
      overlay.querySelector('#smartcoachBugArea').value=pageArea();
      setMode('bug');
      status.textContent='';
      setTimeout(function(){overlay.querySelector('#smartcoachBugSummary').focus();},30);
    }
    function close(){overlay.hidden=true;}
    button.addEventListener('click',open);
    overlay.querySelectorAll('[data-feedback-mode]').forEach(function(node){node.addEventListener('click',function(){setMode(node.getAttribute('data-feedback-mode'));});});
    overlay.addEventListener('click',function(event){if(event.target===overlay)close();});
    overlay.querySelectorAll('[data-bugtrak-close]').forEach(function(node){node.addEventListener('click',close);});
    document.addEventListener('keydown',function(event){if(event.key==='Escape'&&!overlay.hidden)close();});
    form.addEventListener('submit',function(event){
      event.preventDefault();
      var payload={
        type:mode,
        accountKey:accountKey(),
        area:form.area.value,
        urgency:form.urgency.value,
        summary:form.summary.value,
        details:form.details.value,
        expected:form.expected.value,
        coachName:form.coachName.value,
        coachEmail:form.coachEmail.value,
        page:location.href,
        pageTitle:document.title||'',
        deviceLabel:deviceLabel(),
        userAgent:navigator.userAgent||''
      };
      if(!payload.summary.trim()&&!payload.details.trim()){status.textContent=mode==='idea'?'Add the idea before sending.':'Add what went wrong before sending.';return;}
      submit.disabled=true;
      status.textContent=mode==='idea'?'Sending idea...':'Sending bug report...';
      fetch('/api/smart-trak/bug-trak?account='+encodeURIComponent(accountKey()),{method:'POST',headers:headers(),body:JSON.stringify(payload)}).then(function(res){return res.json().then(function(data){return{ok:res.ok,data:data};});}).then(function(result){
        if(!result.ok)throw new Error(result.data&&result.data.error||(mode==='idea'?'Idea could not be sent.':'Bug report could not be sent.'));
        status.textContent=mode==='idea'?'Idea saved.':result.data&&result.data.notification&&result.data.notification.sent?'Bug report sent.':'Bug report saved. Notification webhook is not configured yet.';
        form.reset();
        setTimeout(close,900);
      }).catch(function(error){
        status.textContent=error.message||(mode==='idea'?'Idea could not be sent.':'Bug report could not be sent.');
      }).finally(function(){
        submit.disabled=false;
      });
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',createBugTrak);
  else createBugTrak();
})();
