const fs=require('fs');
const path=require('path');
const assert=require('assert');
const {chromium}=require('playwright');
const html=fs.readFileSync('dashboard.html','utf8');
const functions=html.slice(html.indexOf('function personalBestsRequest('),html.indexOf('function athleteSnapshotAttendance('));
const style=html.match(/<style>([\s\S]*?)<\/style>/)[1];
const modal=html.slice(html.indexOf('<div id="athleteModal"'),html.indexOf('<div id="manualMileageModal"'));
const athlete={name:'Mark Sample',contactId:'a',graduationYear:'2027'};
const practices=[{id:'speed',date:'2026-09-01',surface:'Track',timingMethod:'FAT',speedMetrics:[{athleteId:'a',metric:'30m Fly',distance:30,time:'3.8'}]},{id:'field',date:'2026-09-01',event:'High Jump',athleteId:'a',attempts:[{result:'O',height:'5-8'}]}];
const power={sessions:[],rackSessions:[{id:'rack',date:'2026-09-01',status:'complete',athletes:[{id:'a',name:'Mark Sample',results:[{exerciseName:'Back Squat',actualValue:135,actualReps:5,unit:'lb'},{exerciseName:'Back Squat',actualValue:155,actualReps:3,unit:'lb'},{exerciseName:'Broad Jump',actualValue:86,unit:'in',actualReps:1}]}]}]};
async function run(){
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROME_PATH?{executablePath:process.env.PLAYWRIGHT_CHROME_PATH}:{})});
  try{
    const page=await browser.newPage();const errors=[];let failPower=false;
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+style+'</style><link rel="stylesheet" href="/assets/athlete-personal-bests.css"></head><body>'+modal+'</body></html>'});
      if(url.pathname.startsWith('/assets/'))return route.fulfill({contentType:'text/css',body:fs.readFileSync('.'+url.pathname,'utf8')});
      if(url.pathname.includes('power-trak'))return route.fulfill({status:failPower?500:200,json:failPower?{error:'Failed'}:power});
      if(url.pathname.includes('field-practice'))return route.fulfill({json:{practices}});
      return route.fulfill({json:{meetResults:[{contactId:'a',event:'100m',meetDate:'2026-09-01',resultDisplay:'13.8'}]}});
    });
    await page.goto('http://pb.test/');
    await page.addScriptTag({path:path.resolve('assets/athlete-personal-bests.js')});
    await page.addScriptTag({path:path.resolve('assets/power-trak-history-client.js')});
    await page.addScriptTag({path:path.resolve('assets/athlete-personal-bests-modal.js')});
    await page.addScriptTag({content:'var els={athleteModal:document.getElementById("athleteModal"),athleteModalTitle:document.getElementById("athleteModalTitle"),athleteModalBody:document.getElementById("athleteModalBody")};var esc=AthletePersonalBests.esc;'+functions});
    await page.evaluate(row=>openAthletePersonalBests(row),athlete);
    await page.locator('[data-pb-section="0"] table').waitFor();
    await page.locator('[data-pb-section="1"] table').waitFor();
    await page.locator('[data-pb-section="3"] table').waitFor();
    assert((await page.locator('[data-pb-section="1"]').innerText()).includes('135 lb × 5'));
    await page.selectOption('[data-pb-reps]','3');
    assert((await page.locator('[data-pb-section="1"]').innerText()).includes('155 lb × 3'));
    assert((await page.locator('[data-pb-section="2"]').innerText()).includes('High Jump'));
    assert((await page.locator('[data-pb-section="2"]').innerText()).includes('Broad Jump'));
    for(const size of [{width:1280,height:900},{width:768,height:1024},{width:390,height:844}]){
      await page.setViewportSize(size);
      const bounds=await page.locator('#athleteModal .modalpanel').boundingBox();
      assert(bounds.x>=0&&bounds.x+bounds.width<=size.width);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.screenshot({path:'/private/tmp/athlete-bests-'+size.width+'.png',fullPage:true});
    }
    failPower=true;
    await page.click('[data-pb-retry]');
    await page.locator('[data-pb-section="1"] .pb-error').waitFor();
    await page.locator('[data-pb-section="2"] .pb-error').waitFor();
    assert((await page.locator('[data-pb-section="2"]').innerText()).includes('High Jump'),'partial source failure must retain field records');
    assert.deepStrictEqual(errors,[]);
    console.log('Athlete personal best UI checks passed at desktop, tablet, and mobile widths');
  }finally{await browser.close()}
}
if(process.argv.includes('--fixture')){
  const base=path.resolve('assets');
  const fixture='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+style+'</style><link rel="stylesheet" href="file://'+base+'/athlete-personal-bests.css"></head><body>'+modal+'<script src="file://'+base+'/athlete-personal-bests.js"></script><script src="file://'+base+'/power-trak-history-client.js"></script><script src="file://'+base+'/athlete-personal-bests-modal.js"></script><script>var els={athleteModal:document.getElementById("athleteModal"),athleteModalTitle:document.getElementById("athleteModalTitle"),athleteModalBody:document.getElementById("athleteModalBody")};var esc=AthletePersonalBests.esc;window.fetch=async function(url){var data=url.includes("power-trak")?'+JSON.stringify(power)+':url.includes("field-practice")?{practices:'+JSON.stringify(practices)+'}:{meetResults:[{contactId:"a",event:"100m",meetDate:"2026-09-01",resultDisplay:"13.8"}]};return {ok:true,json:async function(){return data}}};'+functions+'openAthletePersonalBests('+JSON.stringify(athlete)+');</script></body></html>';
  fs.writeFileSync('/private/tmp/athlete-bests-preview.html',fixture);
  console.log('/private/tmp/athlete-bests-preview.html');
}else run().catch(error=>{console.error(error);process.exitCode=1});
