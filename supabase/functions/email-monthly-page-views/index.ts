import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  buildReport,
  lastMonthRange,
  monthLabel,
  sendMonthlyReport,
  type Summary,
} from "./report.ts";

async function summarize(
  projectUrl: string,
  serviceRoleKey: string,
  start: Date,
  end: Date,
): Promise<Summary> {
  const response = await fetch(
    `${projectUrl}/rest/v1/rpc/couples_alarm_page_view_summary`,
    {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        range_start: start.toISOString(),
        range_end: end.toISOString(),
      }),
    },
  );
  if (!response.ok) throw new Error("Summary query failed");
  return (await response.json()) as Summary;
}

export async function handleRequest(request: Request) {
  const expectedToken = Deno.env.get("MONTHLY_REPORT_TOKEN");
  const provided = request.headers.get("authorization");
  if (!expectedToken || provided !== `Bearer ${expectedToken}`) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 401,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false }), { status: 405 });
  }

  const projectUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!projectUrl || !serviceRoleKey || !resendApiKey) {
    return new Response(
      JSON.stringify({ ok: false, error: "Server configuration is unavailable" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const { start, end } = lastMonthRange();
  const previousStart = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1),
  );

  const [current, previous] = await Promise.all([
    summarize(projectUrl, serviceRoleKey, start, end),
    summarize(projectUrl, serviceRoleKey, previousStart, start),
  ]);

  const label = monthLabel(start);
  await sendMonthlyReport(
    label,
    buildReport(label, current, previous),
    resendApiKey,
  );

  return new Response(
    JSON.stringify({
      ok: true,
      month: label,
      views: current.views,
      visitors: current.visitors,
    }),
    { headers: { "Content-Type": "application/json; charset=utf-8" } },
  );
}

Deno.serve(handleRequest);
