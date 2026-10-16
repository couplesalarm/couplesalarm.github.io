import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { deviceClass, diagnosticKey, handleRequest } from '../supabase/functions/record-page-view/index.ts';
import { publicDiagnostics, publicMetrics } from '../supabase/functions/get-growth-metrics/index.ts';
import { websiteRange, fetchWebsiteMetrics } from '../growth-dashboard/metrics.js';
const analytics = await readFile(new URL('../assets/analytics.js',import.meta.url),'utf8');
const campaigns = await readFile(new URL('../assets/campaign-links.js',import.meta.url),'utf8');
const app = 'https://apps.apple.com/app/id6792771975';
function browser({hidden=false,dnt=null,prerendering=false,unsupported=false,fail=false}={}) {
  let now=0, timerId=0, token=0;
  const requests=[], intervals=new Map(), events=new Map(), observers=[], mutations=[];
  const link = (style={}) => ({href:app,isConnected:true,parentElement:null,style,
    getBoundingClientRect:()=>({left:0,top:0,right:100,bottom:40,width:100,height:40})});
  const links=[link()];
  const on=(name,fn)=>events.set(name,[...(events.get(name)||[]),fn]);
  const fire=name=>(events.get(name)||[]).forEach(fn=>fn({type:name,persisted:true}));
  const sandbox={URL,URLSearchParams,Set,Map, navigator:{doNotTrack:dnt},
    location:{hostname:'couplesalarm.com',pathname:'/',search:'?ct=tracking_qa'},
    innerWidth:800,innerHeight:600,crypto:{randomUUID:()=>`00000000-0000-4000-8000-${String(++token).padStart(12,'0')}`},
    performance:{now:()=>now},
    getComputedStyle:n=>({display:'block',visibility:'visible',opacity:'1',...n.style}),
    addEventListener:on,clearInterval:id=>intervals.delete(id),setInterval:fn=>{intervals.set(++timerId,fn);return timerId},
    fetch:(url,options)=>{requests.push({url,options,body:JSON.parse(options.body)});if(fail)throw Error('offline');return Promise.resolve({ok:true})},
    document:{referrer:'',prerendering,visibilityState:hidden?'hidden':'visible',documentElement:{},querySelectorAll:()=>links,addEventListener:on},
    IntersectionObserver:class {constructor(callback){this.callback=callback;this.targets=new Set();observers.push(this)}observe(l){this.targets.add(l)}unobserve(l){this.targets.delete(l)}disconnect(){this.targets.clear()}},
    MutationObserver:class {constructor(callback){this.callback=callback;this.active=false;mutations.push(this)}observe(){this.active=true}disconnect(){this.active=false}},
  };
  if(unsupported)delete sandbox.IntersectionObserver;
  sandbox.window=sandbox;vm.createContext(sandbox);
  vm.runInContext(campaigns,sandbox);vm.runInContext(analytics,sandbox);
  return {sandbox,requests,links,link,fire,intervals,observers,mutations,
    types:()=>requests.map(r=>r.body.event_type),
    advance:ms=>{for(let left=ms;left>0;){const step=Math.min(250,left);now+=step;left-=step;[...intervals.values()].forEach(fn=>fn())}},
    gap:ms=>{now+=ms;[...intervals.values()].forEach(fn=>fn())},
    visibility:value=>{sandbox.document.visibilityState=value;fire('visibilitychange')},
    intersect:(ratio=1,target=links[0])=>observers.at(-1)?.callback([{target,intersectionRatio:ratio,isIntersecting:ratio>0}]),
    mutate:()=>mutations.filter(m=>m.active).forEach(m=>m.callback([])),
    repeat:()=>vm.runInContext(analytics,sandbox),
    click:(type='click',button=0)=>{const e={type,button,target:{closest:()=>links[0]}};(events.get(type)||[]).forEach(fn=>fn(e));return e},
  };
}
test('CTA requires half intersection, a rendered link, a visible document; once across badges and restore',()=>{
  const b=browser();b.intersect(.49);assert.deepEqual(b.types(),['page_view']);
  b.intersect(.5);b.intersect(1);b.repeat();b.fire('pagehide');b.fire('pageshow');b.intersect(1);
  assert.deepEqual(b.types(),['page_view','app_store_visible']);
  assert.ok(b.observers.every(o=>o.targets.size===0));assert.ok(b.mutations.every(m=>!m.active));
  assert.equal(b.requests[1].body.campaign,'tracking_qa');
});
test('CSS and ancestors, offscreen geometry, removed elements and another app never qualify',()=>{
  for(const style of [{display:'none'},{visibility:'hidden'},{opacity:'0'}]){
    const b=browser();b.links[0].parentElement={style,parentElement:null};b.intersect();assert.deepEqual(b.types(),['page_view']);
    b.links[0].parentElement=null;b.mutate();assert.equal(b.types().at(-1),'app_store_visible');
  }
  for(const mutate of [l=>l.isConnected=false,l=>l.href='https://apps.apple.com/app/id123',l=>l.getBoundingClientRect=()=>({left:900,top:0,right:1000,bottom:40,width:100,height:40})]){
    const b=browser();mutate(b.links[0]);b.intersect();assert.deepEqual(b.types(),['page_view']);
  }
});
test('initial hidden tab, dynamic CTA and hidden observer callbacks wait until foreground',()=>{
  const b=browser({hidden:true});b.advance(20000);assert.deepEqual(b.types(),['page_view']);
  b.visibility('visible');b.links[0].href='https://example.test';b.links.push(b.link());b.mutate();b.intersect(1,b.links[1]);
  assert.equal(b.types().at(-1),'app_store_visible');
  const c=browser();c.visibility('hidden');c.intersect();c.advance(15000);assert.deepEqual(c.types(),['page_view']);
});
test('foreground needs 10 accumulated seconds, pauses in background, deduplicates after BFCache',()=>{
  const b=browser();b.advance(5000);b.visibility('hidden');b.advance(60000);b.visibility('visible');b.advance(4750);
  assert.deepEqual(b.types(),['page_view']);b.advance(250);assert.deepEqual(b.types(),['page_view','foreground_10s']);
  b.repeat();b.fire('pagehide');b.advance(20000);b.fire('pageshow');b.advance(20000);
  assert.equal(b.types().filter(x=>x==='foreground_10s').length,1);assert.equal(b.intervals.size,0);
});
test('pagehide flushes no requests, freezes work, and BFCache resumes remaining time',()=>{
  const b=browser();b.advance(7000);b.fire('pagehide');assert.equal(b.intervals.size,0);assert.ok(b.observers.every(o=>!o.targets.size));
  b.advance(30000);assert.deepEqual(b.types(),['page_view']);b.fire('pageshow');b.advance(3000);
  assert.deepEqual(b.types(),['page_view','foreground_10s']);
});
test('sleep or a stalled timer does not manufacture ten foreground seconds',()=>{
  const b=browser();b.gap(60000);assert.deepEqual(b.types(),['page_view']);b.advance(10000);assert.equal(b.types().at(-1),'foreground_10s');
});
test('prerender waits for activation; repeated activation does not count another view',()=>{
  const b=browser({prerendering:true});b.advance(20000);assert.deepEqual(b.types(),[]);
  b.sandbox.document.prerendering=false;b.fire('prerenderingchange');b.fire('prerenderingchange');b.advance(10000);
  assert.deepEqual(b.types(),['page_view','foreground_10s']);
});
test('DNT prevents diagnostics and all requests, observers and timers',()=>{
  for(const dnt of ['1','yes']){const b=browser({dnt});b.intersect();b.advance(20000);b.click();assert.deepEqual(b.types(),[]);assert.equal(b.observers.length,0);assert.equal(b.intervals.size,0)}
});
test('unsupported browsers keep old page/click behavior and are explicitly unmeasured',()=>{
  const b=browser({unsupported:true});b.click();assert.deepEqual(b.types(),['page_view','app_store_click']);assert.equal(b.requests[0].body.diagnostics_version,undefined);
});
test('failure never cancels navigation; click and middle-click count once per activation',()=>{
  const b=browser({fail:true});b.repeat();b.intersect();b.advance(10000);const e=b.click();b.click('auxclick',1);b.click('auxclick',2);
  assert.equal(e.defaultPrevented,undefined);assert.equal(new URL(b.links[0].href).searchParams.get('ct'),'tracking_qa');
  assert.equal(b.types().filter(x=>x==='app_store_click').length,2);
  assert.ok(b.requests.every(r=>r.options.keepalive&&r.options.credentials==='omit'));
  const tokens=b.requests.map(r=>r.body.event_token).filter(Boolean);assert.equal(new Set(tokens).size,2);
});
const env=k=>({SUPABASE_URL:'https://example.test',SUPABASE_PUBLISHABLE_KEYS:'{"default":"public"}',SUPABASE_SERVICE_ROLE_KEY:'secret'})[k];
const req=(body,headers={})=>new Request('https://example.test',{method:'POST',headers:{origin:'https://couplesalarm.com',apikey:'public',...headers},body:JSON.stringify({path:'/',...body})});
test('device hints have a safe unknown fallback and never assert OS version eligibility',()=>{
  for(const [ua,expected] of [['','unknown'],[null,'unknown'],['unrecognized','unknown'],['iPhone OS 9','apple_mobile'],['iPad','apple_mobile'],['Linux; Android 10','android'],['Macintosh; Intel Mac OS X','desktop'],['Windows NT 10','desktop'],['Googlebot','unknown']])assert.equal(deviceClass(ua),expected);
});
test('recorder validates diagnostic fields, drops raw details, uses idempotent insert and daily key',async()=>{
  const token='12345678-1234-4321-8321-123456789abc';let stored,options,url;
  const response=await handleRequest(req({event_type:'app_store_visible',diagnostics_version:1,event_token:token,campaign:'tracking_qa',device_class:'private',raw_ua:'private',qa_reason:'operator_cta_check'},{'user-agent':'iPhone OS 9'}),env,async(u,o)=>{url=u;options=o;stored=JSON.parse(o.body);return {ok:true}});
  assert.equal(response.status,204);assert.match(url,/on_conflict=diagnostic_key/);assert.match(options.headers.Prefer,/ignore-duplicates/);
  assert.equal(stored.device_class,'apple_mobile');assert.equal(stored.campaign,'tracking_qa');assert.equal(stored.diagnostic_key.length,32);
  assert.doesNotMatch(JSON.stringify(stored),/private|raw_ua|event_token|iPhone|qa_reason|12345678/);
  for(const body of [{event_type:'foreground_10s'},{event_type:'foreground_10s',diagnostics_version:1,event_token:'email@example.com'}])assert.equal((await handleRequest(req(body),env)).status,400);
  const day=new Date('2026-10-16T00:00Z');assert.equal(await diagnosticKey(token,'s',day),await diagnosticKey(token,'s',day));assert.notEqual(await diagnosticKey(token,'s',day),await diagnosticKey(token,'s',new Date('2026-10-17T00:00Z')));
  let called=false;assert.equal((await handleRequest(req({}, {dnt:'1'}),env,async()=>{called=true})).status,204);assert.equal(called,false);
});
const old={schemaVersion:1,timezone:'UTC',generatedAt:'2026-10-16T15:00:00Z',firstRecordedAt:'2026-10-10T05:00:00Z',daily:[],pages:[],campaigns:[],referrers:[]};
const diag={version:1,firstRecordedAt:'2026-10-16T14:00:00Z',rows:[{date:'2026-10-16',campaign:'paid_tiktok_iphone',deviceClass:'android',pageViews:2,appStoreVisible:1,foreground10s:1,visitor_hash:'secret'}]};
test('new reporting projects bounded aggregates; old reports show unavailable, not zero',async()=>{
  assert.equal(publicMetrics(old).diagnostics,undefined);assert.equal(websiteRange(old).diagnostics,null);
  const projected=publicMetrics({...old,diagnostics:diag});assert.doesNotMatch(JSON.stringify(projected),/secret|visitor_hash/);
  assert.equal(websiteRange(projected,1).diagnostics.rows[0].pageViews,2);
  const prior={...projected,generatedAt:'2026-10-15T15:00Z'};assert.deepEqual(websiteRange(prior,1).diagnostics.rows,[]);
  for(const change of [{deviceClass:'iPhone14,7'},{campaign:'tracking_qa'},{pageViews:-1}])assert.throws(()=>publicDiagnostics({...diag,rows:[{...diag.rows[0],...change}]}));
  assert.throws(()=>publicDiagnostics({...diag,rows:Array(4000).fill(diag.rows[0])}));
  assert.equal((await fetchWebsiteMetrics(async()=>({ok:true,json:async()=>old}))).diagnostics,undefined);
  await assert.rejects(fetchWebsiteMetrics(async()=>({ok:true,json:async()=>({...old,diagnostics:{...diag,rows:[{...diag.rows[0],foreground10s:null}]}})})),/Invalid diagnostics/);
});
