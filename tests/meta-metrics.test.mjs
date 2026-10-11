import assert from 'node:assert/strict';
import test from 'node:test';
import { adTags, createHandler, projectInsights, readMeta } from '../supabase/functions/get-meta-metrics/index.ts';
import { metaRange } from '../growth-dashboard/metrics.js';
const config = { META_ADS_READ_TOKEN:'private-test-token', META_GRAPH_VERSION:'v25.0', SUPABASE_PUBLISHABLE_KEYS:'{"default":"public-key"}' };
const env = key => config[key];
const request = (headers={},method='GET') => new Request('https://example.test/meta',{method,headers:{origin:'https://couplesalarm.com',apikey:'public-key',...headers}});
const insight = {ad_id:Object.keys(adTags)[0],date_start:'2026-10-11',spend:'2.50',impressions:'100',inline_link_clicks:'3',actions:[{action_type:'landing_page_view',value:'2'}]};
const api = async (url, options) => {
  assert.equal(options.headers.Authorization,'Bearer private-test-token');
  assert.equal(url.hostname,'graph.facebook.com');
  assert.equal(url.searchParams.has('access_token'),false);
  let data;
  if (url.pathname.endsWith('/act_856701151737561')) data={currency:'USD',timezone_name:'America/New_York'};
  else if (url.pathname.endsWith('/ads')) data={data:Object.keys(adTags).map(id=>({id,effective_status:'ACTIVE'}))};
  else if (url.pathname.endsWith('/insights')) data={data:[insight]};
  else data={lifetime_budget:'8000',effective_status:'ACTIVE',status:'ACTIVE'};
  return {ok:true,json:async()=>data};
};
test('Meta reporting only exposes known ads and does not turn clicks into installs',async()=>{
  const report=await readMeta(env,api,Date.parse('2026-10-11T23:00:00Z'));
  assert.equal(report.lifetimeBudget,80);
  assert.equal(report.daily[0].landingPageViews,2);
  assert.equal(report.attributedDownloads,null);
  assert.doesNotMatch(JSON.stringify(report),/private-test-token/);
  assert.equal(projectInsights([{...insight,ad_id:'other-account-ad'}]).length,0);
  const selected=metaRange(report,1);
  assert.equal(selected.spend,2.5);
  assert.equal(selected.ads[1].spend,0,'confirmed API response with no delivery is measured zero');
  assert.equal(metaRange({status:'not_connected'}),null,'unconnected is not zero');
  assert.equal(metaRange({...report,ads:[]},1).spend,null,'missing ad metadata is not zero');
});
test('missing credentials return an explicit disconnected state without network requests',async()=>{
  assert.equal((await readMeta(()=>undefined,()=>{throw Error('unexpected request');})).status,'not_connected');
});
test('unauthorized callers and write requests never reach Meta',async()=>{
  const handle=createHandler(env,()=>{throw Error('unexpected request');});
  assert.equal((await handle(request({apikey:'bad'}))).status,401);
  assert.equal((await handle(request({origin:'https://evil.test'}))).status,403);
  assert.equal((await handle(request({},'POST'))).status,405);
});
test('API reads are cached and a failed refresh retains its original date',async()=>{
  let calls=0, now=Date.parse('2026-10-11T23:00:00Z'), fail=false;
  const handle=createHandler(env,async(...args)=>{calls++;if(fail)throw Error('private error with token');return api(...args);},()=>now);
  const first=await (await handle(request())).json();
  const second=await (await handle(request())).json();
  assert.equal(calls,4); assert.equal(first.updatedAt,second.updatedAt);
  now+=301000;fail=true;
  const stale=await (await handle(request())).json();
  assert.equal(stale.status,'error');assert.equal(stale.updatedAt,first.updatedAt);
  assert.equal(stale.daily[0].spend,2.5);
  assert.doesNotMatch(JSON.stringify(stale),/private error|private-test-token/);
});
test('incomplete paginated reports fail rather than publishing partial totals',async()=>{
  await assert.rejects(readMeta(env,async()=>({ok:true,json:async()=>({paging:{next:'https://example.test/next'}})})),/Incomplete/);
});
