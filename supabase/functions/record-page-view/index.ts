import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const allowedOrigins = new Set([
  "https://couplesalarm.com",
  "https://www.couplesalarm.com",
]);

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function normalizePath(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/")) return null;
  // Query strings and fragments can carry personal data, so drop them.
  const path = value.split(/[?#]/)[0];
  if (path.length > 200) return null;
  return path;
}

export function referrerHost(value: unknown) {
  if (typeof value !== "string" || value === "") return null;
  let host: string;
  try {
    host = new URL(value).hostname;
  } catch {
    return null;
  }
  // Our own pages are not a referrer worth reporting.
  if (host === "couplesalarm.com" || host === "www.couplesalarm.com") {
    return null;
  }
  return host.slice(0, 200);
}

// A salted digest of IP and user agent, where the salt changes every UTC day.
// It lets us count people without a cookie, and makes yesterday's digest for
// the same person unrecoverable, so nobody can be followed across days.
export async function visitorHash(
  ip: string,
  userAgent: string,
  secret: string,
  now = new Date(),
) {
  const day = now.toISOString().slice(0, 10);
  const material = `${secret}:${day}:${ip}:${userAgent}`;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(material),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

export async function handleRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins.has(origin)) {
    return new Response(null, { status: 403 });
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: corsHeaders(origin) });
  }

  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).length > 2048) {
      return new Response(null, { status: 413, headers: corsHeaders(origin) });
    }
    const body = JSON.parse(rawBody) as Record<string, unknown>;
    const path = normalizePath(body.path);
    if (!path) {
      return new Response(null, { status: 400, headers: corsHeaders(origin) });
    }

    const projectUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const salt = Deno.env.get("PAGE_VIEW_SALT");
    if (!projectUrl || !serviceRoleKey || !salt) {
      throw new Error("Server configuration is unavailable");
    }

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    const userAgent = request.headers.get("user-agent") ?? "";

    const response = await fetch(
      `${projectUrl}/rest/v1/couples_alarm_page_views`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          path,
          referrer_host: referrerHost(body.referrer),
          visitor_hash: await visitorHash(ip, userAgent, salt),
        }),
      },
    );
    if (!response.ok) throw new Error("Database insert failed");

    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  } catch {
    // A page view is never worth surfacing an error to a visitor over.
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
}

Deno.serve(handleRequest);
