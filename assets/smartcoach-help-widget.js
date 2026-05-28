(function(){
  if (window.SMARTCoachHelpWidgetLoaded) return;
  window.SMARTCoachHelpWidgetLoaded = true;
  var css = [
    'iframe[src*="leadconnectorhq.com"]',
    'iframe[src*="chat-widget"]',
    'div[id*="lc_chat"]',
    'div[class*="lc-"]',
    'div[class*="leadconnector"]',
    'div[class*="chat-widget"]'
  ].join(',') + '{z-index:2147483647!important;}';
  var style = document.createElement('style');
  style.setAttribute('data-smartcoach-help-widget','1');
  style.textContent = css;
  document.head.appendChild(style);
  function liftWidget(){
    Array.prototype.slice.call(document.querySelectorAll('iframe[src*="leadconnectorhq.com"],iframe[src*="chat-widget"],div[id*="lc_chat"],div[class*="lc-"],div[class*="leadconnector"],div[class*="chat-widget"]')).forEach(function(node){
      node.style.zIndex = '2147483647';
    });
  }
  setInterval(liftWidget,1000);
  var script = document.createElement('script');
  script.src = 'https://beta.leadconnectorhq.com/loader.js';
  script.setAttribute('data-resources-url','https://beta.leadconnectorhq.com/chat-widget/loader.js');
  script.setAttribute('data-widget-id','6a1785dc1b5a98ef9df8eae9');
  script.async = true;
  document.head.appendChild(script);
})();
