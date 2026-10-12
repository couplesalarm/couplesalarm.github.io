import { count, reportingHandler } from '../_shared/reporting.ts';
export const campaignId = 2144815187;
const appId = '6792771975';
const base64url = value => btoa(String.fromCharCode(...value)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
export async function clientSecret(env, now = Date.now()) {
  const keyBytes = Uint8Array.from(atob(env('APPLE_ADS_PRIVATE_KEY').replace(/-----[^-]+-----|\s/g,'')),char => char.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8',keyBytes,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  const encode = value => base64url(new TextEncoder().encode(JSON.stringify(value)));
  const iat = Math.floor(now / 1000);
  const payload = `${encode({alg:'ES256',kid:env('APPLE_ADS_KEY_ID')})}.${encode({iss:env('APPLE_ADS_TEAM_ID'),sub:env('APPLE_ADS_CLIENT_ID'),aud:'https://appleid.apple.com',iat,exp:iat+3600})}`;
  const signature = await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,new TextEncoder().encode(payload));
  return `${payload}.${base64url(new Uint8Array(signature))}`;
}
export function projectReport(data, accountId, now = Date.now()) {
  const reportRows = data?.result?.rows;
  if (!Array.isArray(reportRows) || reportRows.length !== 1 || data.pagination?.totalCount !== 1 || (data.pagination?.offset || 0) !== 0) throw Error('Incomplete campaign report');
  const row = reportRows[0], metadata = row.metadata, metrics = row.totalMetrics;
  if (metadata?.id !== campaignId || String(metadata.adAccountId) !== accountId || String(metadata.promotedObjectId) !== appId) throw Error('Unexpected campaign');
  if (metrics?.localSpend?.currency !== 'USD' || typeof metrics.localSpend.amount !== 'string' || !/^\d+(\.\d+)?$/.test(metrics.localSpend.amount)) throw Error('Invalid spend');
  const spend = Number(metrics.localSpend.amount);
  if (!Number.isFinite(spend)) throw Error('Invalid spend');
  const throughDate = new Date(now).toISOString().slice(0,10);
  const optionalCount = value => value === undefined || value === null ? null : count(value);
  return {schemaVersion:1,status:'connected',mode:'api',updatedAt:new Date(now).toISOString(),
    startDate:`${throughDate.slice(0,7)}-01`,throughDate,timezone:'UTC',currency:'USD',campaignId,
    campaignStatus: /^[A-Z_]{1,40}$/.test(metadata.displayStatus || metadata.status || '') ? metadata.displayStatus || metadata.status : 'UNKNOWN',
    totals:{spend,impressions:count(metrics.impressions),taps:count(metrics.taps),installs:count(metrics.totalInstalls),
      newDownloads:optionalCount(metrics.totalNewDownloads),redownloads:optionalCount(metrics.totalRedownloads)}};
}
export async function readAppleAds(env, fetchImpl = fetch, now = Date.now()) {
  const names = ['APPLE_ADS_CLIENT_ID','APPLE_ADS_TEAM_ID','APPLE_ADS_KEY_ID','APPLE_ADS_PRIVATE_KEY','APPLE_ADS_ACCOUNT_ID'];
  if (names.some(name => !env(name))) return {status:'not_connected',checkedAt:new Date(now).toISOString()};
  const accountId = env('APPLE_ADS_ACCOUNT_ID');
  if (!/^\d+$/.test(accountId)) throw Error('Invalid account');
  const secret = await clientSecret(env,now);
  const tokenResponse = await fetchImpl('https://appleid.apple.com/auth/oauth2/token',{method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',client_id:env('APPLE_ADS_CLIENT_ID'),client_secret:secret,scope:'searchadsorg'}),signal:AbortSignal.timeout(12000)});
  if (!tokenResponse.ok) throw Error('Apple authorization unavailable');
  const token = await tokenResponse.json();
  if (typeof token.access_token !== 'string' || !token.access_token) throw Error('Missing access token');
  const end = new Date(now).toISOString().slice(0,10), start = `${end.slice(0,7)}-01`;
  // This POST is a read-only report query. No campaign mutation endpoints exist here.
  const response = await fetchImpl('https://api.ads.apple.com/v1/reports/apps/campaigns/query',{method:'POST',
    headers:{Authorization:`Bearer ${token.access_token}`,'X-AP-Context':`adAccountId=${accountId}`,'Content-Type':'application/json'},
    body:JSON.stringify({pagination:{offset:0,pageSize:20},filters:[{field:'campaignId',operator:'EQUALS',value:[String(campaignId)]}],
      fields:['localSpend','impressions','taps','totalInstalls','totalNewDownloads','totalRedownloads'],timeRange:{start,end,timeZone:'UTC'}}),signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw Error('Apple reporting unavailable');
  return projectReport(await response.json(),accountId,now);
}
export function createHandler(env = name => Deno.env.get(name), fetchImpl = fetch, clock = Date.now) {
  return reportingHandler(async (previous,now) => {
    try { return await readAppleAds(env,fetchImpl,now); }
    catch { return {...(previous || {}),status:'error',checkedAt:new Date(now).toISOString()}; }
  },env,clock);
}
if (typeof Deno !== 'undefined') Deno.serve(createHandler());
