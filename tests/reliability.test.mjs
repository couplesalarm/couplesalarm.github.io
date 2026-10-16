import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {handleRequest,eventKey,validEventDay} from '../supabase/functions/record-page-view/index.ts';
const script=await readFile(new URL('../assets/analytics.js',import.meta.url),'utf8');
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve()};
function browser({actions={},cryptoAvailable=true,diagnostics=false}={}){
 let now=0,id=0,serial=0;
 const calls=[],timers=new Map(),events=new Map(),observers=[],counts=new Map();
 const epoch=Date.parse('2026-10-16T23:59:59Z');
 class ClockDate extends Date{constructor(...args){super(...(args.length?args:[epoch+now]))}static now(){return epoch+now}}
 const on=(name,fn)=>events.set(name,[...(events.get(name)||[]),fn]);
 const fire=name=>(events.get(name)||[]).forEach(fn=>fn({type:name,persisted:true}));
 const link={href:'https://apps.apple.com/app/id6792771975',isConnected:true,parentElement:null,getBoundingClientRect:()=>({left:0,top:0,right:100,bottom:40,width:100,height:40})};
 const add=(fn,delay,period=0)=>{timers.set(++id,{fn,time:now+delay,period});return id};
 const sandbox={URL,Set,Map,Date:ClockDate,AbortController,
  navigator:{},location:{hostname:'couplesalarm.com',pathname:'/',search:'?ct=tracking_qa'},
  couplesAlarmCampaign:{source:'tracking_qa',decorate:()=> 'tracking_qa'},
  crypto:cryptoAvailable?{randomUUID:()=>`12345678-1234-4321-8321-${String(++serial).padStart(12,'0')}`}:{},
  performance:{now:()=>now},addEventListener:on,setTimeout:(fn,ms)=>add(fn,ms),clearTimeout:n=>timers.delete(n),
  setInterval:(fn,ms)=>add(fn,ms,ms),clearInterval:n=>timers.delete(n),innerWidth:800,innerHeight:600,
  document:{referrer:'',visibilityState:'visible',documentElement:{},addEventListener:on,querySelectorAll:()=>[link]},
  getComputedStyle:()=>({display:'block',visibility:'visible',opacity:'1'}),
  fetch:(url,options)=>{
   const body=JSON.parse(options.body),type=body.event_type,n=counts.get(type)||0;counts.set(type,n+1);
   const call={url,options,body,time:now};calls.push(call);
   const action=actions[type]?.[n] ?? 204;
   if(action==='throw')throw Error('temporary synchronous network failure');
   if(action==='network')return Promise.reject(Error('temporary network failure'));
   if(action==='hang'||action==='pending')return new Promise((resolve,reject)=>{
    call.resolve=()=>resolve({ok:true,status:204});call.reject=()=>reject(Error('lost acknowledgement'));
    options.signal?.addEventListener('abort',()=>reject(Error('AbortError')),{once:true});
   });
   const status=typeof action==='number'?action:action.status;
   return Promise.resolve({ok:status>=200&&status<300,status,headers:{get:()=>action.retryAfter||null}});
  },
 };
 if(diagnostics){sandbox.IntersectionObserver=class{constructor(fn){this.fn=fn;observers.push(this)}observe(){}unobserve(){}disconnect(){}};sandbox.MutationObserver=class{observe(){}disconnect(){}};}
 sandbox.window=sandbox;vm.createContext(sandbox);vm.runInContext(script,sandbox);
 return {sandbox,calls,timers,fire,
  click:()=>{let cancelled=false;const e={type:'click',button:0,target:{closest:()=>link},preventDefault:()=>cancelled=true};(events.get('click')||[]).forEach(fn=>fn(e));assert.equal(cancelled,false)},
  intersect:()=>observers.at(-1)?.fn([{target:link,isIntersecting:true,intersectionRatio:1}]),
  advance:async ms=>{await flush();const end=now+ms;while(true){const next=[...timers].filter(([,t])=>t.time<=end).sort((a,b)=>a[1].time-b[1].time)[0];if(!next)break;const [key,t]=next;now=t.time;if(t.period)t.time+=t.period;else timers.delete(key);t.fn();await flush();}now=end;await flush()},
 };
}
for(const failure of [503,500,408,425,429,'network','throw'])test(`recovers ${failure} with an identical payload and independent event token`,async()=>{
 const b=browser({actions:{page_view:[failure,204]}});await b.advance(999);assert.equal(b.calls.length,1);
 // A retry crossing midnight must retain the original source, path and UTC key day.
 b.sandbox.location.pathname='/different-page/';await b.advance(1);assert.equal(b.calls.length,2);
 assert.equal(b.calls[0].options.body,b.calls[1].options.body);assert.equal(b.calls[1].body.event_day,'2026-10-16');
 assert.equal(b.calls[1].body.delivery_version,1);assert.equal(b.timers.size,0);b.click();await flush();
 assert.notEqual(b.calls[2].body.event_token,b.calls[0].body.event_token);
});
for(const status of [204,400,401,403,404,409,413,422])test(`${status} has no retry`,async()=>{
 const b=browser({actions:{page_view:[status]}});await b.advance(30000);assert.equal(b.calls.length,1);assert.equal(b.timers.size,0);
});
test('page views, every click activation and both diagnostics have independent stable retry tokens',async()=>{
 const b=browser({diagnostics:true,actions:{page_view:[503,204],app_store_click:[503,204],app_store_visible:[503,204],foreground_10s:[503,204]}});
 b.intersect();b.click();await b.advance(11500);
 const types=['page_view','app_store_click','app_store_visible','foreground_10s'];
 assert.equal(new Set(b.calls.map(c=>c.body.event_token)).size,4);
 for(const type of types){const rows=b.calls.filter(c=>c.body.event_type===type);assert.equal(rows.length,2,type);assert.equal(rows[0].options.body,rows[1].options.body);}
 b.click();await flush();assert.equal(b.calls.filter(c=>c.body.event_type==='app_store_click').length,3,'a genuine repeated click still counts');
 assert.ok(b.calls.every(c=>c.options.keepalive&&c.options.credentials==='omit'&&c.body.campaign==='tracking_qa'));
});
test('repeated transient errors exhaust three attempts and leave no retry timers',async()=>{
 const b=browser({actions:{page_view:[503,503,503,503]}});await b.advance(30000);
 assert.deepEqual(b.calls.map(c=>c.time),[0,1000,4000]);assert.equal(b.timers.size,0);
});
test('hung requests abort at four seconds and cannot exceed the 15-second active-page budget',async()=>{
 const b=browser({actions:{page_view:['hang','hang','hang']}});await b.advance(30000);
 assert.deepEqual(b.calls.map(c=>c.time),[0,5000,12000]);assert.ok(b.calls.every(c=>c.options.signal.aborted));assert.equal(b.timers.size,0);
});
test('Retry-After is honored without extending the retry lifetime',async()=>{
 const b=browser({actions:{page_view:[{status:429,retryAfter:'10'},204]}});await b.advance(9999);assert.equal(b.calls.length,1);await b.advance(1);assert.equal(b.calls.length,2);
 const c=browser({actions:{page_view:[{status:503,retryAfter:'60'},204]}});await c.advance(60000);assert.equal(c.calls.length,1);assert.equal(c.timers.size,0);
});
test('pagehide cancels scheduled retries but does not abort in-flight keepalive navigation',async()=>{
 const b=browser({actions:{page_view:[503],app_store_click:['pending']}});await flush();b.click();await flush();
 const click=b.calls.at(-1);b.fire('pagehide');assert.equal(b.timers.size,0);assert.equal(click.options.signal.aborted,false);
 b.fire('pageshow');click.reject();await b.advance(20000);assert.equal(b.calls.length,2,'no old retry after BFCache return');
 b.click();await flush();assert.equal(b.calls.length,3,'new activations still work');
});
test('Do Not Track stops a queued retry and capability fallback never retries',async()=>{
 const b=browser({actions:{page_view:[503]}});await flush();b.sandbox.navigator.doNotTrack='1';await b.advance(30000);assert.equal(b.calls.length,1);assert.equal(b.timers.size,0);
 const c=browser({cryptoAvailable:false,actions:{page_view:['network']}});await c.advance(30000);assert.equal(c.calls.length,1);assert.equal(c.calls[0].body.delivery_version,undefined);
});
test('pending retry queue is bounded while normal click activations remain distinct',async()=>{
 const b=browser({actions:{page_view:[503],app_store_click:Array(25).fill(503)}});for(let i=0;i<25;i++)b.click();await flush();
 assert.equal(b.calls.length,26);assert.equal(b.timers.size,20);b.fire('pagehide');assert.equal(b.timers.size,0);
});
const env=k=>({SUPABASE_URL:'https://example.test',SUPABASE_PUBLISHABLE_KEYS:'{"default":"public"}',SUPABASE_SERVICE_ROLE_KEY:'secret'})[k];
const token='12345678-1234-4321-8321-123456789abc';
const request=body=>new Request('https://example.test',{method:'POST',headers:{origin:'https://couplesalarm.com',apikey:'public'},body:JSON.stringify({path:'/',campaign:'tracking_qa',...body})});
for(const event_type of ['page_view','app_store_click','app_store_visible','foreground_10s'])test(`${event_type} recorder uses atomic event-key conflict handling before retries`,async()=>{
 let stored,url,options;const body={event_type,delivery_version:1,event_token:token,event_day:'2026-10-16',diagnostics_version:1};
 const response=await handleRequest(request(body),env,async(u,o)=>{url=u;options=o;stored=JSON.parse(o.body);return {ok:true}});
 assert.equal(response.status,204);assert.match(url,/on_conflict=event_key$/);assert.match(options.headers.Prefer,/resolution=ignore-duplicates/);assert.equal(stored.event_key,await eventKey(token,event_type,body.event_day,'secret'));
 assert.equal(stored.diagnostic_key,undefined);assert.equal(stored.campaign,'tracking_qa');assert.doesNotMatch(JSON.stringify(stored),/event_day|event_token|delivery_version|12345678/);
 assert.equal((await handleRequest(request(body),env,async()=>({ok:false}))).status,503);
 for(const change of [{event_token:'invalid'},{event_day:'2026-02-30'},{event_day:undefined},{delivery_version:2}])assert.equal((await handleRequest(request({...body,...change}),env)).status,400);
});
test('event keys are independent of receipt time and normalized tokens cannot duplicate rows',async()=>{
 const key=await eventKey(token,'page_view','2026-10-16','secret');assert.equal(key,await eventKey(token.toUpperCase(),'page_view','2026-10-16','secret'));
 assert.notEqual(key,await eventKey(token,'app_store_click','2026-10-16','secret'));assert.notEqual(key,await eventKey(token,'page_view','2026-10-17','secret'));
 for(const day of [undefined,null,'bad','2026-02-30','2026-10-16T00:00Z'])assert.equal(validEventDay(day),false);assert.equal(validEventDay('2026-10-16'),true);
});
