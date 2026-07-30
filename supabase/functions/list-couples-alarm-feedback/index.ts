const allowedOrigins = new Set([
  "https://couplesalarm.com",
  "https://couplesalarm.github.io",
]);
const pageSize = 500;
const select =
  "id,created_at,build,app_version,ios_version,entry_point,tested,roles,waking_role,result_clarity,experience_clarity,alarm,alarm_loud_enough,sound_annoyance,sound_dealbreaker,confidence,rating,unclear,improvement,expected_missing,additional_comments,source";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}

function json(status, body, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export async function fetchAllFeedback(
  projectUrl,
  serviceRoleKey,
  fetchImpl = fetch,
) {
  const responses = [];
  for (let offset = 0; ; offset += pageSize) {
    const endpoint = new URL(
      `${projectUrl}/rest/v1/couples_alarm_beta_feedback`,
    );
    endpoint.searchParams.set("select", select);
    endpoint.searchParams.set("order", "created_at.desc");
    const result = await fetchImpl(endpoint, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Range: `${offset}-${offset + pageSize - 1}`,
        "Range-Unit": "items",
      },
    });
    if (!result.ok) throw new Error("Database read failed");
    const page = await result.json();
    if (!Array.isArray(page)) throw new Error("Database response was invalid");
    responses.push(...page);
    if (page.length < pageSize) return responses;
  }
}

export async function handleRequest(
  request,
  getEnv = (name) => Deno.env.get(name),
  fetchImpl = fetch,
) {
  const origin = request.headers.get("origin");
  if (!origin || !allowedOrigins.has(origin)) {
    return new Response(
      JSON.stringify({ ok: false, error: "Origin not allowed" }),
      {
        status: 403,
        headers: { "Content-Type": "application/json; charset=utf-8" },
      },
    );
  }
  const respond = (status, body) => json(status, body, origin);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (request.method !== "POST") {
    return respond(405, { ok: false, error: "Method not allowed" });
  }
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    return respond(415, {
      ok: false,
      error: "Content-Type must be application/json",
    });
  }

  try {
    const rawBody = await request.text();
    if (rawBody.length > 256) {
      return respond(413, { ok: false, error: "Request is too large" });
    }
    const body = JSON.parse(rawBody);
    const passcode = body?.passcode;
    const expectedPasscode = getEnv("FEEDBACK_ADMIN_PASSCODE");
    if (!expectedPasscode) {
      return respond(500, {
        ok: false,
        error: "Server configuration is unavailable",
      });
    }
    if (
      typeof passcode !== "string" ||
      !/^\d{4}$/.test(passcode) ||
      passcode !== expectedPasscode
    ) {
      // ponytail: private beta skips durable rate limiting; add it if access expands.
      return respond(401, { ok: false, error: "Passcode not accepted" });
    }

    const projectUrl = getEnv("SUPABASE_URL");
    const serviceRoleKey = JSON.parse(
      getEnv("SUPABASE_SECRET_KEYS") || "{}",
    ).default;
    if (!projectUrl || !serviceRoleKey) {
      return respond(500, {
        ok: false,
        error: "Server configuration is unavailable",
      });
    }
    return respond(200, {
      ok: true,
      responses: await fetchAllFeedback(projectUrl, serviceRoleKey, fetchImpl),
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Unknown error");
    return respond(500, {
      ok: false,
      error: "Responses could not be loaded",
    });
  }
}

if (typeof Deno !== "undefined") {
  Deno.serve((request) => handleRequest(request));
}
