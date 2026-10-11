// Read-only, fixed-account reporting. The browser never receives a Meta token.
const origins = new Set(['https://couplesalarm.com', 'https://www.couplesalarm.com', 'http://127.0.0.1:4179']);
export const accountId = '856701151737561';
export const campaignId = '120252400023250695';
export const adTags = {
  '120252400023240695': 'paid_instagram_snooze_v14',
  '120252400669160695': 'paid_ig_snooze_asian_v15',
  '120252400669170695': 'paid_ig_snooze_white_v15',
  '120252400669180695': 'paid_ig_snooze_black_v15',
};
function count(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw Error('Invalid count');
  return number;
}
function amount(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw Error('Invalid amount');
  return number;
}
function status(value) { return typeof value === 'string' && /^[A-Z_]{1,50}$/.test(value) ? value : 'UNKNOWN'; }
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw Error('Invalid date');
  return value;
}
export function projectInsights(rows) {
  if (!Array.isArray(rows) || rows.length > 400) throw Error('Invalid report');
  return rows.filter(row => Object.hasOwn(adTags, row.ad_id)).map(row => {
    const actions = row.actions || [];
    const lpv = actions.find(action => action.action_type === 'landing_page_view');
    return { date: date(row.date_start), tag: adTags[row.ad_id], spend: amount(row.spend),
      impressions: count(row.impressions), linkClicks: count(row.inline_link_clicks || 0),
      landingPageViews: count(lpv?.value || 0) };
  });
}
export async function readMeta(env, fetchImpl = fetch, now = Date.now()) {
  const token = env('META_ADS_READ_TOKEN'), version = env('META_GRAPH_VERSION');
  if (!token || !/^v\d+\.\d+$/.test(version || '')) return { status: 'not_connected', checkedAt: new Date(now).toISOString(), message: 'Meta reporting access has not been connected.' };
  const get = async (path, params) => {
    const url = new URL(`https://graph.facebook.com/${version}/${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw Error(`Meta request failed (${response.status})`);
    const data = await response.json();
    if (data.error || data.paging?.next) throw Error('Incomplete Meta report');
    return data;
  };
  const [account, campaign, ads] = await Promise.all([
    get(`act_${accountId}`, { fields: 'currency,timezone_name' }),
    get(campaignId, { fields: 'lifetime_budget,effective_status,status' }),
    get(`${campaignId}/ads`, { fields: 'id,effective_status', limit: 100 }),
  ]);
  if (!/^[A-Z]{3}$/.test(account.currency) || !Array.isArray(ads.data)) throw Error('Invalid Meta metadata');
  const end = new Intl.DateTimeFormat('en-CA', { timeZone: account.timezone_name, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const start = [new Date(Date.parse(`${end}T00:00:00Z`) - 89 * 86400000).toISOString().slice(0,10), '2026-10-11'].sort().at(-1);
  const insights = await get(`${campaignId}/insights`, { fields: 'ad_id,date_start,spend,impressions,inline_link_clicks,actions', level: 'ad', time_increment: 1, time_range: JSON.stringify({since:start,until:end}), limit: 400 });
  return { status: 'connected', updatedAt: new Date(now).toISOString(), checkedAt: new Date(now).toISOString(),
    timezone: account.timezone_name, currency: account.currency, startDate: start, throughDate: end,
    lifetimeBudget: campaign.lifetime_budget === undefined ? null : amount(campaign.lifetime_budget) / 100,
    campaignStatus: status(campaign.effective_status),
    ads: ads.data.filter(ad => Object.hasOwn(adTags, ad.id)).map(ad => ({ tag: adTags[ad.id], status: status(ad.effective_status) })),
    daily: projectInsights(insights.data), attributedDownloads: null };
}
// Share in-flight requests and cache for five minutes within each worker.
// Failed reads retain their source timestamp and never turn missing data into zero.
export function createHandler(env = name => Deno.env.get(name), fetchImpl = fetch, clock = Date.now) {
  let lastSuccess = null, cached = null, cachedAt = 0, inFlight = null;
  return async request => {
    const origin = request.headers.get('origin');
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
      ...(origin && origins.has(origin) ? {'Access-Control-Allow-Origin':origin} : {}),
      'Access-Control-Allow-Headers':'apikey', 'Access-Control-Allow-Methods':'GET, OPTIONS' };
    const reply = (code, body) => new Response(body ? JSON.stringify(body) : null, {status:code,headers});
    if (origin && !origins.has(origin)) return reply(403);
    if (request.method === 'OPTIONS') return reply(204);
    if (request.method !== 'GET') return reply(405);
    let keys = [];
    try { keys = Object.values(JSON.parse(env('SUPABASE_PUBLISHABLE_KEYS') || '{}')); } catch { /* deny invalid configuration */ }
    if (env('SUPABASE_ANON_KEY')) keys.push(env('SUPABASE_ANON_KEY'));
    if (!keys.includes(request.headers.get('apikey'))) return reply(401);
    if (new URL(request.url).search) return reply(400);
    if (cached && clock() - cachedAt < 300000) return reply(200, cached);
    if (!inFlight) inFlight = (async () => {
      try { cached = await readMeta(env, fetchImpl, clock()); if (cached.status === 'connected') lastSuccess = cached; }
      catch { cached = { ...(lastSuccess || {}), status:'error', checkedAt:new Date(clock()).toISOString(), message:'Meta reporting could not refresh. Check reporting access.' }; }
      cachedAt = clock();
    })().finally(() => { inFlight = null; });
    await inFlight;
    return reply(200, cached);
  };
}
if (typeof Deno !== 'undefined') Deno.serve(createHandler());
