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
      roles: "Yes, completely",
      alarm: "I had a problem",
      confidence: "2",
      unclear: "The last step",
      improvement: "",
    },
    {
      build: "57",
      roles: "Mostly",
      alarm: "It went off as expected",
      confidence: "4",
      unclear: "",
      improvement: "Larger button",
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
    averageConfidence: 3,
    rolesClearPercent: 50,
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
