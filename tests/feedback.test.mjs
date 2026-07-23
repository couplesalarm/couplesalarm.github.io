import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../feedback/feedback.js", import.meta.url), "utf8");
const { buildSubmission } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

test("builds the stored feedback payload and trims freeform answers", () => {
  const submission = buildSubmission({
    build: " 55 ",
    tested: ["Welcome and setup", "Waiting for an alarm to go off"],
    roles: "Mostly",
    wakingRole: "Yes",
    resultClarity: "Partly",
    alarm: "I had a problem",
    confidence: "3",
    unclear: "  The final confirmation was unclear. ",
    improvement: " Make the next step more obvious.  ",
  });

  assert.deepEqual(submission, {
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
  assert.equal("email" in submission, false);
});
