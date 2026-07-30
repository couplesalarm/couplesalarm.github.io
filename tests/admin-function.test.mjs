import assert from "node:assert/strict";
import test from "node:test";
import { handleRequest } from "../supabase/functions/list-couples-alarm-feedback/index.ts";

const origin = "https://couplesalarm.com";

test("allows both website origins and rejects others", async () => {
  for (const allowedOrigin of [
    "https://couplesalarm.com",
    "https://couplesalarm.github.io",
  ]) {
    const response = await handleRequest(
      new Request("https://example.test", {
        method: "OPTIONS",
        headers: { Origin: allowedOrigin },
      }),
    );
    assert.equal(response.status, 204);
    assert.equal(
      response.headers.get("Access-Control-Allow-Origin"),
      allowedOrigin,
    );
  }

  const rejected = await handleRequest(
    new Request("https://example.test", {
      method: "OPTIONS",
      headers: { Origin: "https://example.com" },
    }),
  );
  assert.equal(rejected.status, 403);
  assert.equal(rejected.headers.get("Access-Control-Allow-Origin"), null);
});

test("rejects the wrong passcode without reading feedback", async () => {
  let fetched = false;
  const request = new Request("https://example.test", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ passcode: "wrong" }),
  });
  const response = await handleRequest(
    request,
    (name) => (name === "FEEDBACK_ADMIN_PASSCODE" ? "right" : "configured"),
    async () => {
      fetched = true;
    },
  );

  assert.equal(response.status, 401);
  assert.equal(fetched, false);
});

test("authorized reads still exhaust every database page", async () => {
  const ranges = [];
  const firstPage = Array.from({ length: 500 }, (_, id) => ({ id }));
  const fetchImpl = async (_url, options) => {
    ranges.push(options.headers.Range);
    return {
      ok: true,
      json: async () => (ranges.length === 1 ? firstPage : [{ id: 500 }]),
    };
  };
  const request = new Request("https://example.test", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ passcode: "2468" }),
  });
  const environment = {
    FEEDBACK_ADMIN_PASSCODE: "2468",
    SUPABASE_SECRET_KEYS: JSON.stringify({ default: "secret" }),
    SUPABASE_URL: "https://example.test",
  };

  const response = await handleRequest(
    request,
    (name) => environment[name],
    fetchImpl,
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).responses.length, 501);
  assert.deepEqual(ranges, ["0-499", "500-999"]);
});
