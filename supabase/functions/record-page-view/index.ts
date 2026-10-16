const allowedOrigins = new Set(["https://couplesalarm.com", "https://www.couplesalarm.com"]);
const publicPaths = new Set(["/wake-up-without-waking-partner/", "/best-alarm-apps-for-couples/", "/alarm-tone-only-one-person-hears/", "/", "/compatibility/", "/different-wake-times/", "/download/", "/support/", "/privacy/", "/beta/android/"]);
const campaigns = new Set(["owned_website", "paid_facebook_iphone", "paid_instagram_iphone", "paid_instagram_snooze_v14", "paid_ig_snooze_asian_v15", "paid_ig_snooze_white_v15", "paid_ig_snooze_black_v15", "paid_youtube_iphone", "paid_tiktok_iphone", "tracking_qa"]);

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "content-type, apikey",
    "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store", Vary: "Origin",
  };
}
export function normalizePath(value) {
  if (typeof value !== "string" || !value.startsWith("/")) return null;
  const path = value.split(/[?#]/)[0].replace(/index\.html$/, "");
  return publicPaths.has(path) ? path : null;
}
export function referrerHost(value) {
  if (typeof value !== "string" || !value) return null;
  let host;
  try { host = new URL(value.includes("://") ? value : "https://" + value).hostname; }
  catch { return null; }
  if (host === "couplesalarm.com" || host === "www.couplesalarm.com") return null;
  return host.slice(0, 200);
}
function keys(value) {
  try { return Object.values(JSON.parse(value || "{}")).filter(key => typeof key === "string"); }
  catch { return []; }
}
// Browser-family hints only. Desktop-mode iPads may look like desktops; no
// model, OS version, eligibility, high-entropy client hints or raw UA is stored.
export function deviceClass(ua) {
  if (typeof ua !== "string" || !ua || /bot|crawler|spider|headless/i.test(ua)) return "unknown";
  if (/android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "apple_mobile";
  if (/Windows NT|Macintosh|X11|CrOS/i.test(ua) && !/Mobile/i.test(ua)) return "desktop";
  return "unknown";
}
export async function diagnosticKey(token, secret, now = new Date()) {
  // Separate, daily salted key for retry deduplication of ONE diagnostic event.
  // No raw token persists; independent tokens cannot join events into a session.
  return visitorHash("diagnostic-event-v1", token, secret, now);
}
export async function visitorHash(ip, userAgent, secret, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  // Domain-separated HMAC; the server key never leaves the function.
  // PAGE_VIEW_SALT may override the server-only default without redeployment.
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const message = JSON.stringify(["couples-alarm-page-views-v1", day, ip, userAgent]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}
export async function handleRequest(request, env = name => Deno.env.get(name), fetchImpl = fetch) {
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins.has(origin)) return new Response(null, { status: 403 });
  const respond = status => new Response(null, { status, headers: corsHeaders(origin) });
  if (request.method === "OPTIONS") return respond(204);
  if (request.method !== "POST") return respond(405);
  if (["1", "yes"].includes(request.headers.get("dnt"))) return respond(204);
  const publicKeys = keys(env("SUPABASE_PUBLISHABLE_KEYS"));
  if (env("SUPABASE_ANON_KEY")) publicKeys.push(env("SUPABASE_ANON_KEY"));
  if (!publicKeys.includes(request.headers.get("apikey"))) return respond(401);
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).length > 2048) return respond(413);
    let body;
    try { body = JSON.parse(rawBody); } catch { return respond(400); }
    if (!body || typeof body !== "object") return respond(400);
    const path = normalizePath(body.path);
    const eventType = body.event_type || "page_view";
    const diagnostic = ["app_store_visible", "foreground_10s"].includes(eventType);
    if (!path || !["page_view", "app_store_click", "app_store_visible", "foreground_10s"].includes(eventType)) return respond(400);
    const measured = body.diagnostics_version === 1;
    if (diagnostic && (!measured || typeof body.event_token !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.event_token))) return respond(400);
    const campaign = campaigns.has(body.campaign) ? body.campaign : null;
    const projectUrl = env("SUPABASE_URL");
    const serviceKey = keys(env("SUPABASE_SECRET_KEYS"))[0] || env("SUPABASE_SERVICE_ROLE_KEY");
    if (!projectUrl || !serviceKey) return respond(503);
    const salt = env("PAGE_VIEW_SALT") || serviceKey;
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
    const userAgent = request.headers.get("user-agent") || "";
    const now = new Date();
    const response = await fetchImpl(projectUrl + "/rest/v1/couples_alarm_page_views" +
      (diagnostic ? "?on_conflict=diagnostic_key" : ""), {
      method: "POST",
      headers: { apikey: serviceKey, "Content-Type": "application/json", Prefer: diagnostic ? "return=minimal,resolution=ignore-duplicates" : "return=minimal" },
      body: JSON.stringify({ path, referrer_host: referrerHost(body.referrer), event_type: eventType,
        campaign, visitor_hash: await visitorHash(ip, userAgent, salt, now),
        ...(measured ? { diagnostics_version: 1, device_class: deviceClass(userAgent) } : {}),
        ...(diagnostic ? { diagnostic_key: await diagnosticKey(body.event_token, salt, now) } : {}) }),
    });
    return respond(response.ok ? 204 : 503);
  } catch { return respond(503); }
}
if (typeof Deno !== "undefined") Deno.serve(request => handleRequest(request));
