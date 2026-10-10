import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest, visitorHash } from "../supabase/functions/record-page-view/index.ts";

const environment = {
  SUPABASE_URL: "https://example.test",
  SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: "public-test-key" }),
  SUPABASE_SECRET_KEYS: JSON.stringify({ default: "server-test-key" }),
};
const env = name => environment[name];
const request = (body = {}, extra = {}) => new Request("https://example.test/record", {
  method: "POST",
  headers: { origin: "https://couplesalarm.com", apikey: "public-test-key", "content-type": "application/json", ...extra },
  body: JSON.stringify({ path: "/", ...body }),
});

test("origin and public-key checks deny invalid writes before database access", async () => {
  let calls = 0;
  const send = async () => { calls++; return { ok: true }; };
  assert.equal((await handleRequest(request({}, { origin: "https://evil.test" }), env, send)).status, 403);
  assert.equal((await handleRequest(request({}, { apikey: "invalid" }), env, send)).status, 401);
  assert.equal(calls, 0);
});

test("valid click stores only the approved event fields, without IP or full referrer", async () => {
  let stored;
  const response = await handleRequest(request({ path: "/download/?email=private@example.com", event_type: "app_store_click", campaign: "owned_website", referrer: "https://facebook.com/private?email=private@example.com", listening_answer: "private" }, { "x-forwarded-for": "192.0.2.1", "user-agent": "test" }), env, async (_, options) => {
    stored = JSON.parse(options.body);
    assert.equal(options.headers.apikey, "server-test-key");
    return { ok: true };
  });
  assert.equal(response.status, 204);
  assert.equal(stored.path, "/download/");
  assert.equal(stored.referrer_host, "facebook.com");
  assert.equal(stored.event_type, "app_store_click");
  assert.equal(stored.visitor_hash.length, 32);
  assert.doesNotMatch(JSON.stringify(stored), /192\.0\.2\.1|private@example|listening_answer|server-test-key/);
});

test("invalid events and private paths are rejected; arbitrary campaign data is dropped", async () => {
  assert.equal((await handleRequest(request({ event_type: "installed" }), env)).status, 400);
  assert.equal((await handleRequest(request({ path: "/feedback/" }), env)).status, 400);
  let stored;
  await handleRequest(request({ campaign: "private@example.com" }), env, async (_, options) => { stored = JSON.parse(options.body); return { ok: true }; });
  assert.equal(stored.campaign, null);
});

test("database failure is observable instead of being reported as a successful event", async () => {
  assert.equal((await handleRequest(request(), env, async () => ({ ok: false }))).status, 503);
  assert.equal((await handleRequest(request(), env, async () => { throw new Error("unavailable"); })).status, 503);
});

test("visitor hash is stable within a UTC day and changes across UTC days", async () => {
  const first = await visitorHash("192.0.2.1", "browser", "test-secret", new Date("2026-10-10T00:00:00Z"));
  assert.equal(first, await visitorHash("192.0.2.1", "browser", "test-secret", new Date("2026-10-10T23:59:59Z")));
  assert.notEqual(first, await visitorHash("192.0.2.1", "browser", "test-secret", new Date("2026-10-11T00:00:00Z")));
});

test("public preflight is allowed without granting anonymous access to stored data", async () => {
  const response = await handleRequest(new Request("https://example.test", { method: "OPTIONS", headers: { origin: "https://couplesalarm.com" } }), env);
  assert.equal(response.status, 204);
  assert.match(response.headers.get("Access-Control-Allow-Headers"), /apikey/);
});
