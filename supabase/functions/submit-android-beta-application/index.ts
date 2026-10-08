const allowedOrigins = new Set([
  "https://couplesalarm.com",
  "https://couplesalarm.github.io",
]);

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "content-type, apikey, authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}

function requiredText(value, limit) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > limit) {
    throw new Error("Invalid application");
  }
  return value.trim();
}

export function parseApplication(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid application");
  }
  const email = requiredText(input.playEmail, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
    throw new Error("Invalid application");
  }
  return {
    id: crypto.randomUUID(),
    play_email: email,
    consent_version: "android_beta_email_notice_v2",
    source: "website_android_beta_email_v2",
  };
}

export async function handleRequest(request, getEnv = (name) => Deno.env.get(name), fetchImpl = fetch) {
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins.has(origin)) {
    return new Response(JSON.stringify({ok:false,error:"Origin not allowed"}), {
      status: 403, headers: {"Content-Type":"application/json"},
    });
  }
  const respond = (status, body) => new Response(JSON.stringify(body), {
    status, headers: {...corsHeaders(origin), "Content-Type":"application/json; charset=utf-8"},
  });
  if (request.method === "OPTIONS") return new Response(null, {status:204, headers:corsHeaders(origin)});
  if (request.method !== "POST") return respond(405, {ok:false,error:"Method not allowed"});
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return respond(415, {ok:false,error:"Content-Type must be application/json"});
  }

  try {
    // The enabled gateway verifies the project's JWT before this handler runs.
    // Valid public JWTs can differ from the runtime's generated anon token.
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).length > 4096) return respond(413, {ok:false,error:"Application is too large"});
    const input = JSON.parse(rawBody);
    // Ignore the hidden bot field without confirming whether an email is already registered.
    if (input && typeof input.website === "string" && input.website) return respond(202, {ok:true});
    const application = parseApplication(input);
    const projectUrl = getEnv("SUPABASE_URL");
    const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY") || JSON.parse(getEnv("SUPABASE_SECRET_KEYS") || "{}").default;
    if (!projectUrl || !serviceKey) throw new Error("Server configuration unavailable");

    const endpoint = new URL(`${projectUrl}/rest/v1/couples_alarm_android_beta_applications`);
    endpoint.searchParams.set("on_conflict", "play_email");
    const saved = await fetchImpl(endpoint, {
      method:"POST",
      headers:{apikey:serviceKey, Authorization:`Bearer ${serviceKey}`, "Content-Type":"application/json", Prefer:"resolution=ignore-duplicates,return=minimal"},
      body:JSON.stringify(application),
    });
    if (!saved.ok) throw new Error("Application insert failed");
    // A duplicate receives the same acknowledgement without overwriting the original consent.
    return respond(202, {ok:true});
  } catch (error) {
    if (error instanceof SyntaxError || error?.message === "Invalid application") {
      return respond(400, {ok:false,error:"Please check the required application fields"});
    }
    return respond(500, {ok:false,error:"Application could not be recorded"});
  }
}

if (typeof Deno !== "undefined") Deno.serve((request) => handleRequest(request));
