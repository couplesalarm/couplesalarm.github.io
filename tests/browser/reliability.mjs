// Local-source browser checks. All recorder calls are intercepted; no hosted writes.
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../../',import.meta.url));
const browser=await chromium.launch();
async function setup(mode){
 const context=await browser.newContext({viewport:{width:390,height:844}});const calls=[],errors=[];const attempts=new Map();
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.pathname.endsWith('/record-page-view')){
   if(route.request().method()==='OPTIONS'){await route.fulfill({status:204});return;}
   const raw=route.request().postData(),body=JSON.parse(raw),count=attempts.get(body.event_type)||0;attempts.set(body.event_type,count+1);calls.push({raw,body,time:Date.now()});
   if(mode==='exhaust'){await route.fulfill({status:503});return;}
   if(mode==='navigation'&&body.event_type==='app_store_click'){await route.fulfill({status:503});return;}
   if(mode==='recover'&&count===0){if(body.event_type==='app_store_visible'){await route.abort('failed');return;}await route.fulfill({status:503});return;}
   await route.fulfill({status:204});return;
  }
  if(u.hostname==='apps.apple.com'){await route.fulfill({contentType:'text/html',body:'App Store navigation reached'});return;}
  if(u.hostname!=='couplesalarm.com'){await route.abort();return;}
  try{const file=path.join(root,u.pathname,u.pathname.endsWith('/')?'index.html':'');const body=await readFile(file);const type={'.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png'}[path.extname(file)];await route.fulfill({body,contentType:type||'application/octet-stream'});}catch{await route.fulfill({status:404})}
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('https://couplesalarm.com/?ct=tracking_qa');return {context,page,calls,errors};
}
try{
 const recovery=await setup('recover');await recovery.page.waitForTimeout(12500);
 for(const type of ['page_view','app_store_visible','foreground_10s']){const rows=recovery.calls.filter(r=>r.body.event_type===type);assert.equal(rows.length,2,type);assert.equal(rows[0].raw,rows[1].raw)}
 assert.ok(recovery.calls.every(r=>r.body.delivery_version===1&&r.body.campaign==='tracking_qa'));
 assert.deepEqual(recovery.errors,[]);await recovery.context.close();
 const exhaustion=await setup('exhaust');await exhaustion.page.waitForTimeout(6000);assert.equal(exhaustion.calls.filter(r=>r.body.event_type==='page_view').length,3);assert.deepEqual(exhaustion.errors,[]);await exhaustion.context.close();
 const navigation=await setup('navigation');const started=Date.now();
 await navigation.page.locator('a[href*="apps.apple.com"]').first().click();
 await navigation.page.waitForURL('https://apps.apple.com/**');assert.ok(Date.now()-started<2500,'navigation cannot await a failed recorder');
 await navigation.page.waitForTimeout(4500);assert.equal(navigation.calls.filter(r=>r.body.event_type==='app_store_click').length,1,'page exit cancels retries');
 assert.deepEqual(navigation.errors,[]);await navigation.context.close();
 console.log('PASS: Chromium HTTP 503/network recovery with frozen payloads, three-attempt exhaustion and immediate same-tab App Store navigation under recorder failure.');
}finally{await browser.close()}
