import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../admin/admin.js", import.meta.url),
  "utf8",
);
const { fetchAllFeedback, filterResponses, summarizeResponses } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

test("summarizes and filters feedback responses", () => {
  const responses = [
    {
      build: "56",
      experience_clarity: "Yes, completely",
      alarm: "No, it was early, late, or did not go off",
      rating: 4,
      unclear: "The last step",
      expected_missing: "",
      sound_dealbreaker: "No",
    },
    {
      build: "57",
      experience_clarity: "Mostly",
      alarm: "Yes, it went off when expected",
      rating: 8,
      unclear: "",
      expected_missing: "Larger button",
      sound_dealbreaker: "Yes",
    },
    {
      build: "57",
      roles: "I did not reach this step",
      alarm: "I did not test an alarm",
      confidence: "Not sure yet",
      unclear: "",
      improvement: "",
    },
  ];

  assert.deepEqual(summarizeResponses(responses), {
    total: 3,
    alarmProblems: 1,
    averageRating: 6,
    soundDealbreakers: 1,
  });
  assert.deepEqual(filterResponses(responses, "larger", "57"), [responses[1]]);
});

test("loads every response page", async () => {
  const expected = Array.from({ length: 501 }, (_, index) => ({ id: index }));
  const fetchImpl = async (url, options) => {
    assert.match(url, /list-couples-alarm-feedback$/);
    assert.equal(options.method, "POST");
    assert.deepEqual(JSON.parse(options.body), { passcode: "test-passcode" });
    return {
      ok: true,
      json: async () => ({ responses: expected }),
    };
  };

  const responses = await fetchAllFeedback("test-passcode", fetchImpl);
  assert.equal(responses.length, 501);
});

test("does not persist the admin passcode or use email auth", () => {
  assert.doesNotMatch(source, /sessionStorage|localStorage|auth\/v1\/otp/);
});
