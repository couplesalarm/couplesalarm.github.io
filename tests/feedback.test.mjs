import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../feedback/feedback.js", import.meta.url), "utf8");
const { formatFeedback } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("formats selected and freeform feedback for email", () => {
  const feedback = formatFeedback({
    build: "55",
    tested: ["Welcome and setup", "Waiting for an alarm to go off"],
    roles: "Mostly",
    wakingRole: "Yes",
    resultClarity: "Partly",
    alarm: "I had a problem",
    confidence: "3",
    unclear: "The final confirmation was unclear.",
    improvement: "Make the next step more obvious.",
  });

  assert.equal(feedback.subject, "Couples Alarm beta feedback — build 55");
  assert.match(feedback.body, /Welcome and setup, Waiting for an alarm to go off/);
  assert.match(feedback.body, /The final confirmation was unclear\./);
  assert.match(feedback.body, /do not add names, schedules, frequencies/);
});
