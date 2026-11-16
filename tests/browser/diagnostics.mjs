// Explicit local source test: all website and recorder requests are intercepted.
// Run with PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node tests/browser/diagnostics.mjs
import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url));
const out=process.env.DIAGNOSTIC_EVIDENCE || '/tmp/ca-diagnostics-browser';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const counts=(rows,type)=>rows.filter(r=>r.event_type===type).length;
async function setup(options={}){
 const context=await browser.newContext({viewport:{width:390,height:844},...options});
 const rows=[];const errors=[];
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.hostname.endsWith('supabase.co')){
   if(u.pathname.endsWith('/record-page-view')){rows.push(JSON.parse(route.request().postData()));await route.fulfill({status:204});return;}
   if(u.pathname.endsWith('/get-growth-metrics')){
    const old=JSON.parse(await readFile(path.join(root,'growth-dashboard/data.json'),'utf8')).website;
    const today=old.generatedAt.slice(0,10);
    const data={...old,diagnostics:{version:1,firstRecordedAt:old.generatedAt,rows:[{date:today,campaign:'paid_tiktok_iphone',deviceClass:'android',pageViews:10,appStoreVisible:4,foreground10s:2}]}};
    await route.fulfill({json:data});return;
   }
   await route.fulfill({status:503,body:'unavailable'});return;
  }
  if(u.hostname==='apps.apple.com'){await route.fulfill({body:'Controlled App Store destination',contentType:'text/html'});return;}
  if(u.hostname!=='couplesalarm.com'){await route.abort();return;}
  const file=path.join(root,decodeURIComponent(u.pathname),u.pathname.endsWith('/')?'index.html':'');
  if(!file.startsWith(root)){await route.abort();return;}
  try{const body=await readFile(file);const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'}[path.extname(file)];await route.fulfill({body,contentType:type||'application/octet-stream'});}catch{await route.fulfill({status:404});}
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 return {context,page,rows,errors};
}
try{
 const b=await setup();await b.page.goto('https://couplesalarm.com/?ct=tracking_qa');
 await b.page.waitForFunction(()=>window.couplesAlarmAnalyticsStarted);
 await b.page.waitForTimeout(1200);
 assert.equal(counts(b.rows,'page_view'),1);assert.equal(counts(b.rows,'app_store_visible'),1,'visible homepage CTA');
 await b.page.waitForTimeout(10200);assert.equal(counts(b.rows,'foreground_10s'),1);
 await b.page.addScriptTag({path:path.join(root,'assets/analytics.js')});await b.page.waitForTimeout(300);assert.equal(counts(b.rows,'page_view'),1);
 await b.page.screenshot({path:path.join(out,'homepage-mobile.png'),fullPage:false});
 await b.page.locator('a[href*="apps.apple.com"]').first().click();
 await b.page.waitForTimeout(300);assert.equal(counts(b.rows,'app_store_click'),1);assert.ok(b.rows.every(r=>r.campaign==='tracking_qa'));
 assert.deepEqual(b.errors,[]);await b.context.close();
 const hidden=await setup();
 await hidden.page.addInitScript(()=>{const style=document.createElement('style');style.textContent='a[href*="apps.apple.com"] {visibility:hidden !important}';document.addEventListener('DOMContentLoaded',()=>document.head.append(style),{once:true});});
 await hidden.page.goto('https://couplesalarm.com/?ct=tracking_qa');await hidden.page.waitForTimeout(1200);assert.equal(counts(hidden.rows,'app_store_visible'),0);
 await hidden.page.evaluate(()=>{document.querySelectorAll('style').forEach(s=>{if(s.textContent.includes('visibility:hidden !important'))s.remove()});});
 await hidden.page.waitForTimeout(600);assert.equal(counts(hidden.rows,'app_store_visible'),1);await hidden.context.close();
 const dnt=await setup();await dnt.page.addInitScript(()=>Object.defineProperty(navigator,'doNotTrack',{get:()=> '1'}));
 await dnt.page.goto('https://couplesalarm.com/?ct=tracking_qa');await dnt.page.waitForTimeout(1200);assert.equal(dnt.rows.length,0);await dnt.context.close();
 const dash=await setup({viewport:{width:1280,height:900}});await dash.page.goto('https://couplesalarm.com/growth-dashboard/');
 await dash.page.waitForFunction(()=>document.querySelector('#diagnostic-rows').textContent.includes('Android hint'));
 assert.match(await dash.page.locator('#diagnostic-rows').innerText(),/10\s+4\s+2/);assert.deepEqual(dash.errors,[]);
 await dash.page.locator('#diagnostic-coverage').scrollIntoViewIfNeeded();await dash.page.screenshot({path:path.join(out,'dashboard-diagnostics.png')});
 // Old snapshot deliberately lacks the optional diagnostics payload.
 await dash.page.route('**/get-growth-metrics',route=>route.fulfill({json:{schemaVersion:1,timezone:'UTC',generatedAt:new Date().toISOString(),firstRecordedAt:null,daily:[],pages:[],campaigns:[],referrers:[]}}));
 await dash.page.reload();await dash.page.waitForFunction(()=>document.querySelector('#diagnostic-coverage').textContent.includes('unavailable'));
 assert.match(await dash.page.locator('#diagnostic-rows').innerText(),/Diagnostics unavailable/);
 await dash.context.close();
 console.log('PASS: real Chromium mobile CTA visible/hidden, 10s, duplicate script, click, DNT; desktop new/old dashboard; no page errors.');
} finally {await browser.close();}
