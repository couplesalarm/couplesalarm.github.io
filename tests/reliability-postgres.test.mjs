// Opt-in integration test against this task's isolated local PostgreSQL database.
import assert from 'node:assert/strict';
import test from 'node:test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {handleRequest,eventKey} from '../supabase/functions/record-page-view/index.ts';
const enabled=process.env.EVENT_DELIVERY_PG_TEST==='1';
const run=promisify(execFile);
const sql=async query=>(await run('psql',['-h','127.0.0.1','-p','55439','-d','reliability_release_test','-Atq','-v','ON_ERROR_STOP=1','-c',query])).stdout.trim();
const quote=s=>"'"+s.replaceAll("'","''")+"'";
const env=k=>({SUPABASE_URL:'https://local-adapter.test',SUPABASE_PUBLISHABLE_KEYS:'{"default":"public"}',SUPABASE_SERVICE_ROLE_KEY:'secret'})[k];
const request=body=>new Request('https://local-adapter.test',{method:'POST',headers:{origin:'https://couplesalarm.com',apikey:'public'},body:JSON.stringify(body)});
async function insert(url,options){
 assert.equal(url,'https://local-adapter.test/rest/v1/couples_alarm_page_views?on_conflict=event_key');
 assert.match(options.headers.Prefer,/resolution=ignore-duplicates/);
 const body=JSON.parse(options.body);
 await sql(`set role service_role; insert into public.couples_alarm_page_views(path,referrer_host,event_type,campaign,visitor_hash,diagnostics_version,device_class,event_key)
 select path,referrer_host,event_type,campaign,visitor_hash,diagnostics_version,device_class,event_key
 from jsonb_populate_record(null::public.couples_alarm_page_views,${quote(JSON.stringify(body))}::jsonb)
 on conflict(event_key) do nothing;`);
 return {ok:true};
}
test('real recorder + PostgreSQL: concurrent replays and lost acknowledgements store one of every event', {skip:!enabled},async()=>{
 const baseline=await sql("select (public.couples_alarm_growth_metrics()-'generatedAt'-'diagnostics'-'excluded')::text");
 const insertedKeys=new Map();
 for(const event_type of ['page_view','app_store_click','app_store_visible','foreground_10s']){
  const body={path:'/',event_type,campaign:'tracking_qa',delivery_version:1,event_token:crypto.randomUUID(),event_day:'2026-10-16',diagnostics_version:1};
  const key=await eventKey(body.event_token,event_type,body.event_day,'secret');insertedKeys.set(event_type,key);
  // The database commits, but the edge cannot see the acknowledgement.
  const lost=await handleRequest(request(body),env,async(u,o)=>{await insert(u,o);throw Error('lost acknowledgement after commit')});
  assert.equal(lost.status,503);
  const responses=await Promise.all(Array.from({length:6},()=>handleRequest(request(body),env,insert)));
  assert.ok(responses.every(r=>r.status===204));
  assert.equal(await sql(`select count(*) from public.couples_alarm_page_views where event_key=${quote(key)}`),'1');
 }
 assert.equal(await sql("select (public.couples_alarm_growth_metrics()-'generatedAt'-'diagnostics'-'excluded')::text"),baseline,'QA cannot inflate old reporting');
 assert.equal(await sql("select jsonb_array_length(public.couples_alarm_growth_metrics()->'diagnostics'->'rows')"),'0');
 // A genuinely separate activation has a fresh token and must still count.
 const nextToken=crypto.randomUUID(),nextKey=await eventKey(nextToken,'app_store_click','2026-10-16','secret');
 await handleRequest(request({path:'/',event_type:'app_store_click',campaign:'tracking_qa',delivery_version:1,event_token:nextToken,event_day:'2026-10-16'}),env,insert);
 assert.equal(await sql(`select count(*) from public.couples_alarm_page_views where event_key in (${quote(insertedKeys.get('app_store_click'))},${quote(nextKey)})`),'2');
});
