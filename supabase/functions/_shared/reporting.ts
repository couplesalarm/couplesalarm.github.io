const origins = new Set(['https://couplesalarm.com', 'https://www.couplesalarm.com', 'http://127.0.0.1:4179']);
export function configuredKeys(value) {
  try { return Object.values(JSON.parse(value || '{}')).filter(key => typeof key === 'string'); }
  catch { return []; }
}
export function count(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw Error('Invalid count');
  return value;
}
// Fixed read-only report, no caller-selected account, table, date, or fields.
export function reportingHandler(read, env = name => Deno.env.get(name), clock = Date.now) {
  let cached, cachedAt = 0, inFlight;
  return async request => {
    const origin = request.headers.get('origin');
    const headers = {'Content-Type':'application/json', 'Cache-Control':'no-store', Vary:'Origin',
      ...(origin && origins.has(origin) ? {'Access-Control-Allow-Origin':origin} : {}),
      'Access-Control-Allow-Headers':'apikey', 'Access-Control-Allow-Methods':'GET, OPTIONS'};
    const reply = (status, body) => new Response(body ? JSON.stringify(body) : null, {status,headers});
    if (origin && !origins.has(origin)) return reply(403);
    if (request.method === 'OPTIONS') return reply(204);
    if (request.method !== 'GET') return reply(405);
    const keys = [...configuredKeys(env('SUPABASE_PUBLISHABLE_KEYS')), env('SUPABASE_ANON_KEY')].filter(Boolean);
    if (!keys.includes(request.headers.get('apikey'))) return reply(401);
    if (new URL(request.url).search) return reply(400);
    if (cached && clock() - cachedAt < 300000) return reply(200,cached);
    if (!inFlight) inFlight = (async () => {
      try { cached = await read(cached,clock()); }
      catch { cached = {...(cached || {}),status:'error',checkedAt:new Date(clock()).toISOString()}; }
      cachedAt = clock();
    })().finally(() => { inFlight = null; });
    await inFlight;
    return reply(200,cached);
  };
}
