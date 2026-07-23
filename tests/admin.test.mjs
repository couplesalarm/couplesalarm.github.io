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
  const calls = [];
  const firstPage = Array.from({ length: 500 }, (_, index) => ({ id: index }));
  const finalPage = [{ id: 500 }];
  const fetchImpl = async (_url, options) => {
    calls.push(options.headers.Range);
    return {
      ok: true,
      json: async () => (calls.length === 1 ? firstPage : finalPage),
    };
  };

  const responses = await fetchAllFeedback("token", fetchImpl);
  assert.equal(responses.length, 501);
  assert.deepEqual(calls, ["0-499", "500-999"]);
});
