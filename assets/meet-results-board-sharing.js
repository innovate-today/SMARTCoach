(function(){
  'use strict';
  var openButton=document.getElementById('openResultsBoardBtn');
  if(!openButton)return;
  var details=[
    ['bestHighlights','PB / SB Highlights'],['divisionSummary','Division Summary'],
    ['latestMeet','Latest Meet'],['meetArchive','Meet Archive'],
    ['athleteSummary','Athlete Summary'],['eventSummary','Event Summary'],
    ['seasonSummary','Season Results']
  ];
  var defaults=details.map(function(item){return item[0];});
  var labels={bestBadges:'PB / SB Badges',teamSummary:'Team Summary'};
  var dialog=document.createElement('div');
  dialog.className='modal';
  dialog.id='meetResultsBoardModal';
  dialog.hidden=true;
  dialog.innerHTML='<section class="modalpanel results-board-panel" role="dialog" aria-modal="true" aria-labelledby="meetResultsBoardTitle">'+
    '<div class="modalhead"><h2 id="meetResultsBoardTitle">Results Board Sharing</h2><button class="secondary" type="button" data-board-action="close">Close</button></div>'+
    '<div class="modalbody"><p class="results-board-intro">Create a view-only team results link for the latest race and season results.</p>'+
    '<div class="formgrid">'+
    '<label class="field"><span>Link active</span><input data-board-field="active" type="checkbox"></label>'+
    '<label class="field"><span>Sport</span><select data-board-field="sport"><option>Cross Country</option><option>Track</option></select></label>'+
    '<label class="field"><span>Season Year</span><input data-board-field="seasonYear" type="number" min="2020" max="2100" step="1"></label>'+
    '<div class="field full"><div class="modalhead" style="padding:0 0 7px;border:0"><b>Visible Board Details</b><button class="secondary" type="button" data-board-action="defaults">Defaults</button></div><div class="results-board-options" data-board-order></div></div>'+
    '<label class="field full"><span>School Name</span><input data-board-field="boardName" type="text" maxlength="80"></label>'+
    '<label class="field full"><span>Coach Message</span><textarea data-board-field="coachMessage" maxlength="240" rows="3"></textarea></label>'+
    '<label class="field full"><span>Current Link</span><input data-board-field="link" type="text" readonly></label></div>'+
    '<div class="modalstatus" data-board-status role="status">Loading sharing settings...</div>'+
    '<div class="results-board-actions"><button class="secondary" type="button" data-board-action="off">Turn Off Link</button><button class="secondary" type="button" data-board-action="reset">Reset Link</button><button class="secondary" type="button" data-board-action="open">Open Link</button><button class="secondary" type="button" data-board-action="open-display">Open Display Link</button><button class="secondary" type="button" data-board-action="copy-display">Copy Display Link</button><button type="button" data-board-action="copy">Copy Link</button></div></div></section>';
  document.body.appendChild(dialog);
  var order=dialog.querySelector('[data-board-order]');
  var status=dialog.querySelector('[data-board-status]');
  var sharing=null;
  var busy=false;
  function field(name){return dialog.querySelector('[data-board-field="'+name+'"]');}
  function setStatus(message,bad){status.textContent=message;status.style.color=bad?'var(--bad)':'var(--muted)';}
  function setBusy(value){busy=value;dialog.querySelectorAll('button[data-board-action]').forEach(function(button){if(button.dataset.boardAction!=='close')button.disabled=value;});}
  function normalized(source){
    var input=source&&typeof source==='object'?source:{};
    var options=input.displayOptions||{};
    var game=input.gameSettings||{};
    var seen=[];
    (Array.isArray(options.detailOrder)?options.detailOrder:[]).concat(defaults).forEach(function(key){if(defaults.indexOf(key)>=0&&seen.indexOf(key)<0)seen.push(key);});
    var visible={};
    defaults.concat(Object.keys(labels)).forEach(function(key){visible[key]=options[key]!==false;});
    return {active:input.active!==false,sport:input.sport==='Track'?'Track':'Cross Country',seasonYear:Number(input.seasonYear)||new Date().getFullYear(),displayOptions:Object.assign(visible,{detailOrder:seen}),gameSettings:{boardName:String(game.boardName||'').slice(0,80),coachMessage:String(game.coachMessage||'').slice(0,240)},tokenVersion:String(input.tokenVersion||'1')};
  }
  function render(){
    var value=normalized(sharing);
    field('active').checked=value.active;
    field('sport').value=value.sport;
    field('seasonYear').value=value.seasonYear;
    field('boardName').value=value.gameSettings.boardName;
    field('coachMessage').value=value.gameSettings.coachMessage;
    order.replaceChildren();
    value.displayOptions.detailOrder.forEach(function(key){
      var row=document.createElement('div');
      row.className='results-board-option';
      row.dataset.boardDetail=key;
      row.innerHTML='<span></span><button class="secondary" type="button" data-board-action="up" aria-label="Move up">↑</button><button class="secondary" type="button" data-board-action="down" aria-label="Move down">↓</button><input type="checkbox" aria-label="Show detail">';
      row.querySelector('span').textContent=details.find(function(item){return item[0]===key;})[1];
      row.querySelector('input').checked=value.displayOptions[key];
      order.appendChild(row);
    });
    Object.keys(labels).forEach(function(key){
      var row=document.createElement('label');row.className='results-board-option';row.dataset.boardDetail=key;
      row.innerHTML='<span></span><input type="checkbox">';
      row.querySelector('span').textContent=labels[key];row.querySelector('input').checked=value.displayOptions[key];order.appendChild(row);
    });
  }
  function collect(){
    var value=normalized(sharing),visible={};
    order.querySelectorAll('[data-board-detail]').forEach(function(row){visible[row.dataset.boardDetail]=row.querySelector('input').checked;});
    visible.detailOrder=Array.from(order.querySelectorAll('[data-board-detail]')).map(function(row){return row.dataset.boardDetail;}).filter(function(key){return defaults.indexOf(key)>=0;});
    return {active:field('active').checked,sport:field('sport').value,seasonYear:Number(field('seasonYear').value)||new Date().getFullYear(),displayOptions:visible,gameSettings:{boardName:field('boardName').value.trim(),coachMessage:field('coachMessage').value.trim()},tokenVersion:value.tokenVersion};
  }
  function request(path,options){
    var settings=Object.assign({cache:'no-store',headers:apiHeaders()},options||{});
    return fetch(path,settings).then(function(response){return response.json().then(function(data){if(!response.ok)throw new Error(data.error||'Results Board request failed.');return data;});});
  }
  function settingsPath(){return '/api/smart-trak/results-board-sharing?account='+encodeURIComponent(accountKey());}
  function save(action){
    return request(settingsPath(),{method:'POST',headers:Object.assign({'Content-Type':'application/json'},apiHeaders()),body:JSON.stringify({action:action||'',resultsBoardSharing:collect()})}).then(function(data){sharing=normalized(data.resultsBoardSharing);render();return sharing;});
  }
  function createLink(display){
    if(!field('active').checked)throw new Error('Turn the link active before creating a Results Board link.');
    return save('').then(function(){
      var params=new URLSearchParams({account:accountKey(),sport:field('sport').value,seasonYear:field('seasonYear').value});
      if(display)params.set('display','1');
      return request('/api/smart-trak/results-board-link?'+params.toString());
    }).then(function(data){
      var url=new URL(display?(data.legacyUrl||data.url):data.url,location.origin);
      if(display)url.searchParams.set('display','1');
      field('link').value=url.toString();
      return url.toString();
    });
  }
  function open(){
    dialog.hidden=false;
    field('link').value='';
    setBusy(true);
    setStatus('Loading Results Board sharing settings...');
    dialog.querySelector('[data-board-action="close"]').focus();
    request(settingsPath()).then(function(data){sharing=normalized(data.resultsBoardSharing);render();setBusy(false);setStatus(sharing.active?'Choose sport and season before copying the link.':'Results Board sharing is off.');}).catch(function(error){setStatus(error.message,true);});
  }
  function close(){dialog.hidden=true;}
  window.openMeetResultsBoardSharing=open;
  openButton.addEventListener('click',open);
  dialog.addEventListener('click',function(event){
    if(event.target===dialog){close();return;}
    var button=event.target.closest('[data-board-action]');if(!button)return;
    var action=button.dataset.boardAction;
    if(action==='close'){close();return;}
    if(busy)return;
    if(action==='up'||action==='down'){
      var row=button.closest('[data-board-detail]'),peer=action==='up'?row.previousElementSibling:row.nextElementSibling;
      if(peer&&defaults.indexOf(peer.dataset.boardDetail)>=0){if(action==='up')order.insertBefore(row,peer);else order.insertBefore(peer,row);}
      return;
    }
    if(action==='defaults'){
      sharing=collect();sharing.displayOptions.detailOrder=defaults.slice();
      defaults.concat(Object.keys(labels)).forEach(function(key){sharing.displayOptions[key]=true;});
      render();setStatus('Board details reset to defaults. Save or copy a link to apply.');return;
    }
    setBusy(true);setStatus('Updating Results Board...');
    var task;
    if(action==='off'){
      field('active').checked=false;task=save('').then(function(){field('link').value='';setStatus('Results Board sharing is off.');});
    }else if(action==='reset'){
      field('active').checked=true;task=save('reset').then(function(){return createLink(false);}).then(function(){setStatus('New link is ready. Old links are invalid.');});
    }else{
      var display=action==='copy-display'||action==='open-display';
      task=createLink(display).then(function(url){
        if(action==='open'||action==='open-display'){window.open(url,'_blank','noopener');setStatus('Results Board opened.');return;}
        return copyTextToClipboard(url).then(function(copied){setStatus(copied?'Results Board link copied.':'Copy failed. Use the Current Link field.',!copied);});
      });
    }
    Promise.resolve(task).catch(function(error){setStatus(error.message||'Results Board update failed.',true);}).finally(function(){setBusy(false);});
  });
  dialog.addEventListener('keydown',function(event){if(event.key==='Escape'){event.preventDefault();close();}});
})();
