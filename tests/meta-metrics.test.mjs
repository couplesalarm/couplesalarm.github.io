import assert from 'node:assert/strict';
import test from 'node:test';
import { adTags, createHandler, projectInsights, readMeta } from '../supabase/functions/get-meta-metrics/index.ts';
import { metaRange } from '../growth-dashboard/metrics.js';
import { metaAccessNotice } from '../growth-dashboard/dashboard.js';
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
test('replacement status excludes paused originals and delivery includes both generations',async()=>{
  const original='120252400669160695', replacement='120252403222310695';
  const report=await readMeta(env,async(url,options)=>{
    if (url.pathname.endsWith('/ads')) return {ok:true,json:async()=>({data:[
      ...Object.keys(adTags).map(id=>({id,effective_status:id===original?'PAUSED':'ACTIVE'})),
      {id:'unrelated-ad',effective_status:'ACTIVE'},
    ]})};
    if (url.pathname.endsWith('/insights')) return {ok:true,json:async()=>({data:[
      {...insight,ad_id:original}, {...insight,ad_id:replacement,spend:'1.25',impressions:'50'},
      {...insight,ad_id:'unrelated-ad',spend:'99'},
    ]})};
    return api(url,options);
  },Date.parse('2026-10-12T05:00:00Z'));
  assert.equal(report.ads.length,4);
  assert.equal(report.ads.find(row=>row.tag===adTags[replacement]).status,'ACTIVE');
  const selected=metaRange(report,2);
  const asian=selected.ads.find(row=>row.tag===adTags[replacement]);
  assert.equal(asian.spend,3.75);
  assert.equal(asian.impressions,150);
  assert.equal(asian.linkClicks,6);
  assert.equal(asian.landingPageViews,4);
  assert.equal(selected.spend,3.75);
  assert.equal(report.attributedDownloads,null);
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
test('reporting renewal is visible before access expires without exposing a credential',async()=>{
  const accessExpiresAt='2026-12-10T23:53:46.000Z';
  const handle=createHandler(key=>key==='META_ADS_TOKEN_EXPIRES_AT'?accessExpiresAt:env(key),api,()=>Date.parse('2026-10-11T23:00:00Z'));
  const report=await (await handle(request())).json();
  assert.equal(report.accessExpiresAt,accessExpiresAt);
  assert.doesNotMatch(JSON.stringify(report),/private-test-token/);
  assert.equal(metaAccessNotice(report,Date.parse('2026-10-11')).needsRenewal,false);
  assert.equal(metaAccessNotice(report,Date.parse('2026-12-05')).needsRenewal,true);
  assert.match(metaAccessNotice(report,Date.parse('2026-12-11')).message,/expired/);
  assert.equal(metaAccessNotice({accessExpiresAt:'invalid'}).message,'');
});
