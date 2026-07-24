import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { sendFeedbackNotification } from "./email.ts";

const allowedOrigin = "https://couplesalarm.github.io";
const allowedTested = new Set([
  "Welcome and setup",
  "Listening test and result",
  "Creating or editing an alarm",
  "Waiting for an alarm to go off",
  "Purchase or restore",
]);
const allowedRoles = new Set([
  "Yes, completely",
  "Mostly",
  "No",
  "I did not reach this step",
]);
const allowedWakingRoles = new Set([
  "Yes",
  "No",
  "I am not sure",
  "I did not reach this step",
]);
const allowedResultClarity = new Set([
  "Yes",
  "Partly",
  "No",
  "I did not reach this step",
]);
const allowedAlarms = new Set([
  "It went off as expected",
  "I had a problem",
  "I did not test an alarm",
]);
const allowedConfidence = new Set([
  "1 — Not confident",
  "2",
  "3",
  "4",
  "5 — Very confident",
  "Not sure yet",
]);
const allowedEntryPoints = new Set(["question_mark"]);

const corsHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

function requiredChoice(value: unknown, allowed: Set<string>, field: string) {
  if (typeof value !== "string" || !allowed.has(value)) {
    throw new Error(`Invalid ${field}`);
  }
  return value;
}

function optionalChoice(value: unknown, allowed: Set<string>, field: string) {
  if (value === undefined || value === null || value === "") return null;
  return requiredChoice(value, allowed, field);
}

function optionalText(value: unknown, maxLength: number, field: string) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new Error(`Invalid ${field}`);
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) throw new Error(`${field} is too long`);
  return trimmed;
}

function parseSubmission(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid request body");
  }

  const value = input as Record<string, unknown>;
  if (
    !Array.isArray(value.tested) ||
    value.tested.length > allowedTested.size
  ) {
    throw new Error("Invalid tested selections");
  }
  const tested = value.tested.map((item) =>
    requiredChoice(item, allowedTested, "tested selection"),
  );
  if (new Set(tested).size !== tested.length) {
    throw new Error("Duplicate tested selection");
  }

  const build = optionalText(value.build, 20, "build");
  const appVersion = optionalText(value.appVersion, 20, "appVersion");
  const iosVersion = optionalText(value.iosVersion, 20, "iosVersion");
  const entryPoint = optionalChoice(
    value.entryPoint,
    allowedEntryPoints,
    "entryPoint",
  );
  if (entryPoint && (!build || !appVersion || !iosVersion)) {
    throw new Error("Invalid app context");
  }

  return {
    id: crypto.randomUUID(),
    build,
    app_version: appVersion,
    ios_version: iosVersion,
    entry_point: entryPoint,
    tested,
    roles: requiredChoice(value.roles, allowedRoles, "roles"),
    waking_role: requiredChoice(
      value.wakingRole,
      allowedWakingRoles,
      "wakingRole",
    ),
    result_clarity: requiredChoice(
      value.resultClarity,
      allowedResultClarity,
      "resultClarity",
    ),
    alarm: requiredChoice(value.alarm, allowedAlarms, "alarm"),
    confidence: requiredChoice(
      value.confidence,
      allowedConfidence,
      "confidence",
    ),
    unclear: optionalText(value.unclear, 700, "unclear"),
    improvement: optionalText(value.improvement, 700, "improvement"),
    source: "feedback_page_v2",
  };
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  if (origin !== allowedOrigin) {
    return json(403, { ok: false, error: "Origin not allowed" });
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return json(405, { ok: false, error: "Method not allowed" });
  }
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    return json(415, {
      ok: false,
      error: "Content-Type must be application/json",
    });
  }

  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).length > 16_384) {
      return json(413, { ok: false, error: "Request is too large" });
    }
    const submission = parseSubmission(JSON.parse(rawBody));

    const projectUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!projectUrl || !serviceRoleKey) {
      throw new Error("Server configuration is unavailable");
    }

    const databaseResponse = await fetch(
      `${projectUrl}/rest/v1/couples_alarm_beta_feedback`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(submission),
      },
    );
    if (!databaseResponse.ok) throw new Error("Database insert failed");

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (resendApiKey) {
      try {
        await sendFeedbackNotification(submission.id, resendApiKey);
      } catch {
        console.error("Feedback was recorded, but its email notification failed");
      }
    } else {
      console.error("Feedback was recorded, but RESEND_API_KEY is not configured");
    }

    return json(201, { ok: true, reference: submission.id });
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      (error instanceof Error && error.message.startsWith("Invalid")) ||
      (error instanceof Error && error.message.endsWith("is too long")) ||
      (error instanceof Error && error.message.startsWith("Duplicate"))
    ) {
      return json(400, { ok: false, error: error.message });
    }
    // ponytail: Invite-only beta skips CAPTCHA; add bot protection only if spam appears.
    return json(500, { ok: false, error: "Feedback could not be recorded" });
  }
});
