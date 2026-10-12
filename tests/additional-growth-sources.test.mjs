import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, verify } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { clientSecret, createHandler as appleHandler, projectReport, readAppleAds } from '../supabase/functions/get-apple-ads-metrics/index.ts';
import { createHandler as betaHandler, projectMembership, readApplications, readBeta } from '../supabase/functions/get-beta-metrics/index.ts';
import { APPLE_ADS_ENDPOINT, BETA_ENDPOINT, appleAdsCostPerInstall, fetchAdditionalMetrics, retainReport } from '../growth-dashboard/metrics.js';
import { readDashboardSources, sourceFreshness } from '../growth-dashboard/dashboard.js';
const now = Date.parse('2026-10-12T00:20:00Z');
const environment = {SUPABASE_URL:'https://example.test',SUPABASE_PUBLISHABLE_KEYS:'{"default":"public-test"}',SUPABASE_SECRET_KEYS:'{"default":"private-server"}'};
const env = name => environment[name];
const request = (headers={},method='GET',query='') => new Request(`https://example.test/report${query}`,{method,headers:{origin:'https://couplesalarm.com',apikey:'public-test',...headers}});
const row = {metadata:{id:2144815187,adAccountId:24571440,promotedObjectId:'6792771975',status:'ENABLED'},totalMetrics:{impressions:42,taps:3,totalInstalls:2,localSpend:{amount:'2.03',currency:'USD'}}};
const appleData = {result:{rows:[row]},pagination:{offset:0,totalCount:1}};
test('Apple fixed campaign totals validate identity, currency and complete report coverage',()=>{
  const report=projectReport(appleData,'24571440',now);
  assert.equal(report.totals.installs,2);assert.equal(report.totals.newDownloads,null);
  assert.equal(appleAdsCostPerInstall(report),1.015);
  assert.equal(appleAdsCostPerInstall({totals:{spend:2,installs:0}}),null);
  assert.throws(()=>projectReport({...appleData,pagination:{totalCount:2}},'24571440',now),/Incomplete/);
  assert.throws(()=>projectReport(appleData,'other',now),/Unexpected/);
  assert.throws(()=>projectReport({...appleData,result:{rows:[{...row,metadata:{...row.metadata,promotedObjectId:'other-app'}}]}},'24571440',now),/Unexpected/);
  assert.throws(()=>projectReport({...appleData,result:{rows:[{...row,totalMetrics:{...row.totalMetrics,impressions:null}}]}},'24571440',now),/Invalid count/);
});
test('Apple credentials are signed in memory and used only at the authorized Apple endpoints',async()=>{
  const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'P-256'});
  const config={APPLE_ADS_CLIENT_ID:'client',APPLE_ADS_TEAM_ID:'team',APPLE_ADS_KEY_ID:'key',APPLE_ADS_ACCOUNT_ID:'24571440',APPLE_ADS_PRIVATE_KEY:privateKey.export({type:'pkcs8',format:'pem'})};
  const get=name=>config[name];
  const secret=await clientSecret(get,now), parts=secret.split('.');
  assert.equal(verify('sha256',Buffer.from(parts.slice(0,2).join('.')),{key:publicKey,dsaEncoding:'ieee-p1363'},Buffer.from(parts[2],'base64url')),true);
  assert.equal(JSON.parse(Buffer.from(parts[1],'base64url')).exp,now/1000+3600);
  const visited=[];
  const report=await readAppleAds(get,async(url,options)=>{
    visited.push(url);
    if(url==='https://appleid.apple.com/auth/oauth2/token'){
      assert.equal(options.body.get('scope'),'searchadsorg');assert.ok(options.body.get('client_secret'));return {ok:true,json:async()=>({access_token:'private-token'})};
    }
    assert.equal(options.headers.Authorization,'Bearer private-token');
    const body=JSON.parse(options.body);assert.equal(body.timeRange.start,'2026-10-01');assert.equal(body.timeRange.end,'2026-10-12');
    assert.deepEqual(body.filters,[{field:'campaignId',operator:'EQUALS',value:['2144815187']}]);
    return {ok:true,json:async()=>appleData};
  },now);
  assert.deepEqual(visited,['https://appleid.apple.com/auth/oauth2/token','https://api.ads.apple.com/v1/reports/apps/campaigns/query']);
  assert.doesNotMatch(JSON.stringify(report),/private-token|PRIVATE KEY|client_secret/);
  assert.equal((await readAppleAds(()=>undefined,()=>{throw Error('must not call');},now)).status,'not_connected');
});
test('beta database query returns only a HEAD count and never application data',async()=>{
  const result=await readApplications(env,async(url,options)=>{
    assert.equal(options.method,'HEAD');assert.equal(options.headers.Prefer,'count=exact');
    assert.equal(url,'https://example.test/rest/v1/couples_alarm_android_beta_applications?select=id');
    return new Response(null,{headers:{'content-range':'*/0'}});
  },now);
  assert.equal(result.total,0);
  await assert.rejects(readApplications(env,async()=>new Response(null),now),/unavailable/);
  await assert.rejects(readApplications(env,async()=>new Response(null,{status:403}),now),/unavailable/);
});
test('membership is a strict count projection; unrelated data and stale reads never become live',()=>{
  const source={schemaVersion:1,group:'couples-alarm-android-beta',updatedAt:new Date(now).toISOString(),members:3,owners:1,nonOwnerMembers:2,email:'private@example.test'};
  assert.doesNotMatch(JSON.stringify(projectMembership(source,now)),/private@example|email/);
  assert.equal(projectMembership(source,now).pendingMembers,null);
  assert.throws(()=>projectMembership({...source,nonOwnerMembers:3},now),/reconcile/);
  assert.throws(()=>projectMembership(source,now+16*60000),/Stale/);
});
test('beta source failures are independent and preserve their own last successful dates',async()=>{
  const previous={applications:{status:'connected',mode:'api',total:4,updatedAt:'2026-10-10T00:00:00Z'}};
  const data=await readBeta(env,async()=>{throw Error('sensitive backend error');},now,previous);
  assert.equal(data.applications.total,4);assert.equal(data.applications.updatedAt,previous.applications.updatedAt);
  assert.equal(data.applications.status,'error');assert.equal(data.membership.status,'not_connected');
  assert.doesNotMatch(JSON.stringify(data),/sensitive|private-server/);
});
test('public reporting rejects writes, bad origins, bad keys and caller-selected queries before provider access',async()=>{
  for(const factory of [appleHandler,betaHandler]){
    const handler=factory(env,()=>{throw Error('must not call');},()=>now);
    assert.equal((await handler(request({apikey:'bad'}))).status,401);
    assert.equal((await handler(request({origin:'https://evil.test'}))).status,403);
    assert.equal((await handler(request({},'POST'))).status,405);
    assert.equal((await handler(request({},'GET','?table=secret'))).status,400);
  }
});
test('a working count is cached; provider failure retains evidence but cannot advance freshness',async()=>{
  let tick=now,calls=0,fail=false;
  const handler=betaHandler(env,async()=>{calls++;if(fail)throw Error('failed');return new Response(null,{headers:{'content-range':'*/1'}});},()=>tick);
  const first=await(await handler(request())).json();await handler(request());assert.equal(calls,1);
  tick+=301000;fail=true;
  const second=await(await handler(request())).json();assert.equal(second.applications.total,1);
  assert.equal(second.applications.updatedAt,first.applications.updatedAt);assert.equal(second.applications.status,'error');
});
test('a fresh live report supersedes a verified snapshot; failures retain the newest successful evidence',async()=>{
  const old={...projectReport(appleData,'24571440',now-3600000),mode:'manual'};
  const live=projectReport(appleData,'24571440',now);
  assert.equal(retainReport(live,old).mode,'api');
  const failed=retainReport({status:'error'},old,live);assert.equal(failed.updatedAt,live.updatedAt);assert.equal(failed.status,'error');
  assert.equal(sourceFreshness(failed,now).live,false);
  assert.equal(sourceFreshness(old,now).label,'Verified snapshot');assert.equal(sourceFreshness(old,now+2*86400000).label,'Saved check · stale');
  const result=await readDashboardSources(async url=>{
    if(url.startsWith('data.json')) return {ok:true,json:async()=>({appleAds:old,beta:{membership:{mode:'manual',updatedAt:old.updatedAt,members:1,owners:1,nonOwnerMembers:0,pendingMembers:0}}})};
    if(url===APPLE_ADS_ENDPOINT) return {ok:true,json:async()=>live};
    if(url===BETA_ENDPOINT) return {ok:true,json:async()=>({status:'connected',applications:{status:'connected',mode:'api',total:0,updatedAt:live.updatedAt},membership:{status:'not_connected'}})};
    throw Error('unavailable');
  },null,now);
  assert.equal(result.snapshot.appleAds.mode,'api');assert.equal(result.snapshot.beta.applications.total,0);
  assert.equal(result.snapshot.beta.membership.members,1);assert.equal(result.snapshot.beta.membership.updatedAt,old.updatedAt);
});
test('malformed public live data cannot overwrite verified results',async()=>{
  await assert.rejects(fetchAdditionalMetrics(APPLE_ADS_ENDPOINT,async()=>({ok:true,json:async()=>({...projectReport(appleData,'24571440',now),totals:{spend:null}})})),/Invalid/);
  await assert.rejects(fetchAdditionalMetrics(BETA_ENDPOINT,async()=>({ok:true,json:async()=>({status:'connected',membership:{status:'connected',members:1,owners:5,nonOwnerMembers:3,updatedAt:new Date(now).toISOString()},applications:{status:'not_connected'}})})),/Invalid/);
});
test('Google bridge excludes banned and pending users and never returns identities',async()=>{
  const code=await readFile(new URL('../scripts/android-beta-group-report/Code.gs',import.meta.url),'utf8');
  const roles={OWNER:'OWNER',MEMBER:'MEMBER',MANAGER:'MANAGER',BANNED:'BANNED',PENDING:'PENDING',INVITED:'INVITED'};
  let calls=0;
  const sandbox={PropertiesService:{getScriptProperties:()=>({getProperty:()=> 'private-test'})},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>text})},
    GroupsApp:{Role:roles,getGroupByEmail:email=>{calls++;assert.equal(email,'couples-alarm-android-beta@googlegroups.com');return {getUsers:()=>[{email:'private@example.test'}],getRoles:()=>Object.values(roles)};}}};
  vm.createContext(sandbox);vm.runInContext(code,sandbox);
  assert.equal(JSON.parse(sandbox.doPost({postData:{contents:'{"token":"wrong"}'}})).status,'unauthorized');assert.equal(calls,0);
  const result=JSON.parse(sandbox.doPost({postData:{contents:'{"token":"private-test"}'}}));
  assert.equal(result.members,3);assert.equal(result.owners,1);assert.equal(result.nonOwnerMembers,2);
  assert.doesNotMatch(JSON.stringify(result),/private@example|private-test/);
});
