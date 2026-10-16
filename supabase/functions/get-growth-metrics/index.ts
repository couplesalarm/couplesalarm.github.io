const allowedOrigins = new Set(["https://couplesalarm.com", "https://www.couplesalarm.com", "http://127.0.0.1:4179"]);
const campaigns = new Set(["unattributed", "owned_website", "paid_facebook_iphone", "paid_instagram_iphone", "paid_instagram_snooze_v14", "paid_ig_snooze_asian_v15", "paid_ig_snooze_white_v15", "paid_ig_snooze_black_v15", "paid_youtube_iphone", "paid_tiktok_iphone"]);
const pages = new Set(["/wake-up-without-waking-partner/", "/best-alarm-apps-for-couples/", "/alarm-tone-only-one-person-hears/", "/", "/compatibility/", "/different-wake-times/", "/download/", "/support/", "/privacy/", "Other page"]);
const referrers = new Set(["Direct / unknown", "Facebook", "Instagram", "TikTok", "YouTube", "X", "Google", "Bing", "Other referring websites"]);
function keys(value) {
  try { return Object.values(JSON.parse(value || "{}")).filter(key => typeof key === "string"); }
  catch { return []; }
}
function count(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid count");
  return value;
}
function date(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("Invalid date");
  return value;
}
function timestamp(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error("Invalid timestamp");
  return new Date(value).toISOString();
}
const deviceClasses = new Set(["apple_mobile", "android", "desktop", "unknown"]);
export function publicDiagnostics(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.rows) || data.rows.length > 90 * campaigns.size * deviceClasses.size) throw Error("Invalid diagnostics");
  return { version: 1, firstRecordedAt: data.firstRecordedAt === null ? null : timestamp(data.firstRecordedAt),
    rows: data.rows.map(row => {
      if (!campaigns.has(row.campaign) || !deviceClasses.has(row.deviceClass)) throw Error("Invalid diagnostic label");
      return { date: date(row.date), campaign: row.campaign, deviceClass: row.deviceClass,
        pageViews: count(row.pageViews), appStoreVisible: count(row.appStoreVisible), foreground10s: count(row.foreground10s) };
    }) };
}
// Explicit projection prevents future SQL additions from leaking private fields.
export function publicMetrics(data) {
  if (data.schemaVersion !== 1 || data.timezone !== "UTC" || !Array.isArray(data.daily) || data.daily.length > 90) throw new Error("Invalid metrics");
  const grouped = (rows, labels, clicks = true) => {
    if (!Array.isArray(rows) || rows.length > 90 * labels.size) throw new Error("Invalid groups");
    return rows.map(row => {
      if (!labels.has(row.label)) throw new Error("Invalid label");
      return { date: date(row.date), label: row.label, pageViews: count(row.pageViews),
        ...(clicks ? { appStoreClicks: count(row.appStoreClicks) } : {}) };
    });
  };
  return {
    schemaVersion: 1, timezone: "UTC", generatedAt: timestamp(data.generatedAt),
    firstRecordedAt: data.firstRecordedAt === null ? null : timestamp(data.firstRecordedAt),
    daily: data.daily.map(row => ({ date: date(row.date), partial: row.partial === true,
      visitors: count(row.visitors), visitorsWhoClicked: count(row.visitorsWhoClicked),
      pageViews: count(row.pageViews), appStoreClicks: count(row.appStoreClicks) })),
    ...(data.diagnostics === undefined ? {} : { diagnostics: publicDiagnostics(data.diagnostics) }),
    pages: grouped(data.pages, pages), campaigns: grouped(data.campaigns, campaigns),
    referrers: grouped(data.referrers, referrers, false),
    // Older saved reports have no exclusion ledger. Do not imply a verified zero.
    ...(Array.isArray(data.excluded) ? { excluded: grouped(data.excluded, new Set([...campaigns, "tracking_qa"])) } : {}),
  };
}
export async function handleRequest(request, env = name => Deno.env.get(name), fetchImpl = fetch) {
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins.has(origin)) return new Response(null, { status: 403 });
  const headers = {
    "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Origin",
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "apikey", "Access-Control-Allow-Methods": "GET, OPTIONS",
  };
  const respond = (status, body) => new Response(body ? JSON.stringify(body) : null, { status, headers });
  if (request.method === "OPTIONS") return respond(204);
  if (request.method !== "GET") return respond(405);
  const publicKeys = keys(env("SUPABASE_PUBLISHABLE_KEYS"));
  if (env("SUPABASE_ANON_KEY")) publicKeys.push(env("SUPABASE_ANON_KEY"));
  if (!publicKeys.includes(request.headers.get("apikey"))) return respond(401);
  try {
    const projectUrl = env("SUPABASE_URL");
    const serviceKey = keys(env("SUPABASE_SECRET_KEYS"))[0] || env("SUPABASE_SERVICE_ROLE_KEY");
    if (!projectUrl || !serviceKey) return respond(503);
    const result = await fetchImpl(`${projectUrl}/rest/v1/rpc/couples_alarm_growth_metrics`, {
      method: "POST", headers: { apikey: serviceKey, "Content-Type": "application/json" },
      body: "{}", signal: AbortSignal.timeout(12_000),
    });
    if (!result.ok) return respond(503);
    return respond(200, publicMetrics(await result.json()));
  } catch { return respond(503); }
}
if (typeof Deno !== "undefined") Deno.serve(request => handleRequest(request));
