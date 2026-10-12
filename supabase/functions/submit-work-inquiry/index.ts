import { sendInquiryNotification } from "./email.ts";

const origins = new Set(["https://couplesalarm.com", "https://couplesalarm.github.io"]);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function text(value, limit, required = false) {
  if (!required && (value === undefined || value === "")) return "";
  if (typeof value !== "string" || value.length > limit || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) throw Error("Invalid inquiry");
  const trimmed = value.trim();
  if (required && !trimmed) throw Error("Invalid inquiry");
  return trimmed;
}
export function parseInquiry(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || !uuid.test(input.id)) throw Error("Invalid inquiry");
  const email = text(input.email, 254, true);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) throw Error("Invalid inquiry");
  if (!["partnership", "creator"].includes(input.category)) throw Error("Invalid inquiry");
  const channelUrl = text(input.channelUrl, 500);
  if (channelUrl) {
    let url;
    try { url = new URL(channelUrl); } catch { throw Error("Invalid inquiry"); }
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw Error("Invalid inquiry");
  }
  return {
    id: input.id.toLowerCase(), name: text(input.name, 100, true), email,
    category: input.category, channel_url: channelUrl,
    audience: text(input.audience, 300), idea: text(input.idea, 2000, true),
    notice_version: "work_inquiry_v1",
  };
}
async function limitedBody(request) {
  if (!request.body) throw Error("Invalid inquiry");
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 16384) { await reader.cancel(); throw Error("Body too large"); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}
export async function handleRequest(request, getEnv = name => Deno.env.get(name), fetchImpl = fetch) {
  const origin = request.headers.get("origin");
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", Vary: "Origin" };
  const respond = (status, body) => new Response(JSON.stringify(body), { status, headers });
  if (!origins.has(origin)) return respond(403, { ok: false, error: "Origin not allowed" });
  Object.assign(headers, { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "content-type, apikey", "Access-Control-Allow-Methods": "POST, OPTIONS" });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return respond(405, { ok: false, error: "Method not allowed" });
  if (getEnv("WORK_INQUIRIES_ENABLED") === "false") return respond(503, { ok: false, error: "Inquiry form unavailable" });
  // Public project key validation mirrors record-page-view. It identifies the
  // project, not a person; the database quotas provide abuse protection.
  let publicKeys;
  try { publicKeys = Object.values(JSON.parse(getEnv("SUPABASE_PUBLISHABLE_KEYS") || "{}")); }
  catch { return respond(503, { ok: false, error: "Inquiry form unavailable" }); }
  if (!publicKeys.length && !getEnv("SUPABASE_ANON_KEY")) return respond(503, { ok: false, error: "Inquiry form unavailable" });
  const legacyKey = getEnv("SUPABASE_ANON_KEY");
  if (legacyKey) publicKeys.push(legacyKey);
  if (!publicKeys.some(key => typeof key === "string" && key && key === request.headers.get("apikey"))) return respond(401, { ok: false, error: "Project key required" });
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return respond(415, { ok: false, error: "JSON required" });
  try {
    const raw = await limitedBody(request);
    let input;
    try { input = JSON.parse(raw); } catch { throw Error("Invalid inquiry"); }
    const row = parseInquiry(input);
    const projectUrl = getEnv("SUPABASE_URL");
    const key = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    if (!projectUrl || !key) throw Error("Configuration unavailable");
    const saved = await fetchImpl(`${projectUrl}/rest/v1/rpc/submit_work_inquiry`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ submission: row }), signal: AbortSignal.timeout(10000),
    });
    if (!saved.ok) throw Error("Save failed");
    const result = await saved.json();
    if (result?.outcome === "limited" && [3600, 86400].includes(result.retryAfter)) {
      headers["Retry-After"] = String(result.retryAfter);
      return respond(429, { ok: false, error: "Inquiry limit reached. Please try later or email support." });
    }
    if (result?.outcome === "conflict") return respond(409, { ok: false, error: "Submission reference conflict" });
    if (!["created", "duplicate"].includes(result?.outcome) || result.reference !== row.id || typeof result.notify !== "boolean") throw Error("Invalid storage confirmation");
    if (result.outcome === "duplicate") return respond(200, { ok: true, reference: row.id });
    const resendKey = getEnv("RESEND_API_KEY");
    const recipient = getEnv("WORK_INQUIRY_NOTIFICATION_TO") || "bmarko@gmail.com";
    if (resendKey && recipient && result.notify) {
      try { await sendInquiryNotification(row.id, resendKey, recipient, fetchImpl); }
      catch { /* Durable save is authoritative. Never log contact or message data. */ }
    }
    return respond(201, { ok: true, reference: row.id });
  } catch (error) {
    if (error?.message === "Body too large") return respond(413, { ok: false, error: "Inquiry is too large" });
    if (error?.message === "Invalid inquiry") return respond(400, { ok: false, error: "Please check the required fields, lengths and website URL" });
    return respond(503, { ok: false, error: "Inquiry could not be confirmed. Retry with the same reference." });
  }
}
if (typeof Deno !== "undefined") Deno.serve(request => handleRequest(request));
