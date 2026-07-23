import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../feedback/feedback.js", import.meta.url),
  "utf8",
);
const { buildSubmission, readAppContext } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);

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
    appVersion: "",
    iosVersion: "",
    entryPoint: "",
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

test("uses app context from the URL fragment instead of asking for a build", () => {
  const context = readAppContext(
    "#appVersion=1.0&build=56&iosVersion=26.5&entryPoint=question_mark",
  );
  const submission = buildSubmission(
    {
      build: "",
      tested: [],
      roles: "Yes, completely",
      wakingRole: "Yes",
      resultClarity: "Yes",
      alarm: "I did not test an alarm",
      confidence: "Not sure yet",
      unclear: "",
      improvement: "",
    },
    context,
  );

  assert.deepEqual(context, {
    appVersion: "1.0",
    build: "56",
    iosVersion: "26.5",
    entryPoint: "question_mark",
  });
  assert.equal(submission.build, "56");
  assert.equal(submission.appVersion, "1.0");
  assert.equal(submission.iosVersion, "26.5");
  assert.equal(submission.entryPoint, "question_mark");
  assert.deepEqual(readAppContext("#build=56&entryPoint=other"), {
    appVersion: "",
    build: "",
    iosVersion: "",
    entryPoint: "",
  });
  assert.deepEqual(readAppContext("#build=56&entryPoint=question_mark"), {
    appVersion: "",
    build: "",
    iosVersion: "",
    entryPoint: "",
  });
});
