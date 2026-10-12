import { configuredKeys, count, reportingHandler } from '../_shared/reporting.ts';

export async function readApplications(env, fetchImpl = fetch, now = Date.now()) {
  const project = env('SUPABASE_URL');
  const key = configuredKeys(env('SUPABASE_SECRET_KEYS'))[0] || env('SUPABASE_SERVICE_ROLE_KEY');
  if (!project || !key) throw Error('Missing database access');
  // HEAD and count=exact return no rows, email addresses, or application answers.
  const result = await fetchImpl(`${project}/rest/v1/couples_alarm_android_beta_applications?select=id`, {
    method:'HEAD', headers:{apikey:key, Authorization:`Bearer ${key}`, Prefer:'count=exact'}, signal:AbortSignal.timeout(12000),
  });
  const total = /\/(\d+)$/.exec(result.headers.get('content-range') || '');
  if (!result.ok || !total) throw Error('Application count unavailable');
  return {status:'connected',mode:'api',updatedAt:new Date(now).toISOString(),total:count(Number(total[1]))};
}
export function projectMembership(data, now = Date.now()) {
  if (data?.schemaVersion !== 1 || data.group !== 'couples-alarm-android-beta') throw Error('Unexpected group');
  const updatedAt = Date.parse(data.updatedAt);
  if (!Number.isFinite(updatedAt) || updatedAt > now + 60000 || now - updatedAt > 15 * 60000) throw Error('Stale group response');
  const members = count(data.members), owners = count(data.owners), nonOwnerMembers = count(data.nonOwnerMembers);
  if (owners + nonOwnerMembers !== members) throw Error('Group counts do not reconcile');
  return {status:'connected',mode:'api',updatedAt:new Date(updatedAt).toISOString(),members,owners,nonOwnerMembers,
    // GroupsApp does not enumerate the complete pending membership queue.
    pendingMembers:null};
}
export async function readMembership(env, fetchImpl = fetch, now = Date.now()) {
  const url = env('ANDROID_BETA_GROUP_REPORT_URL'), token = env('ANDROID_BETA_GROUP_REPORT_TOKEN');
  if (!url || !token) return {status:'not_connected',checkedAt:new Date(now).toISOString()};
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)) throw Error('Invalid group report destination');
  const response = await fetchImpl(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token}),signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw Error('Group report unavailable');
  return projectMembership(await response.json(),now);
}
export async function readBeta(env, fetchImpl = fetch, now = Date.now(), previous = {}) {
  const results = await Promise.allSettled([readApplications(env,fetchImpl,now),readMembership(env,fetchImpl,now)]);
  const result = {schemaVersion:1,checkedAt:new Date(now).toISOString(),status:'connected'};
  ['applications','membership'].forEach((name,index) => {
    result[name] = results[index].status === 'fulfilled' ? results[index].value : {...(previous?.[name] || {}),status:'error',checkedAt:result.checkedAt};
  });
  return result;
}
export function createHandler(env = name => Deno.env.get(name), fetchImpl = fetch, clock = Date.now) {
  return reportingHandler((previous,now) => readBeta(env,fetchImpl,now,previous),env,clock);
}
if (typeof Deno !== 'undefined') Deno.serve(createHandler());
