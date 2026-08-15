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
    experienceClarity: "Mostly",
    alarm: "No, it was early, late, or did not go off",
    alarmLoudEnough: "No",
    soundAnnoyance: "Very",
    soundDealbreaker: "Yes",
    rating: "3",
    unclear: "  The final confirmation was unclear. ",
    expectedMissing: " A clearer next step.  ",
    additionalComments: " I would try it again. ",
  });

  assert.deepEqual(submission, {
    build: "55",
    appVersion: "",
    iosVersion: "",
    entryPoint: "",
    tested: ["Welcome and setup", "Waiting for an alarm to go off"],
    experienceClarity: "Mostly",
    alarm: "No, it was early, late, or did not go off",
    alarmLoudEnough: "No",
    soundAnnoyance: "Very",
    soundDealbreaker: "Yes",
    rating: 3,
    unclear: "The final confirmation was unclear.",
    expectedMissing: "A clearer next step.",
    additionalComments: "I would try it again.",
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
      experienceClarity: "Yes, completely",
      alarm: "I did not test a scheduled alarm",
      alarmLoudEnough: "I did not test a real alarm",
      soundAnnoyance: "I did not hear the alarm sound",
      soundDealbreaker: "I did not hear the alarm sound",
      rating: "8",
      unclear: "",
      expectedMissing: "",
      additionalComments: "",
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

test("keeps detected app context after a successful submission", () => {
  assert.match(
    source,
    /form\.reset\(\);\s*if \(appContext\.build\) buildInput\.value = appContext\.build;/,
  );
});

test("asks each requested beta question once", async () => {
  const html = await readFile(
    new URL("../feedback/index.html", import.meta.url),
    "utf8",
  );
  const normalizedHtml = html.replace(/\s+/g, " ");
  const questions = [
    "Was the alarm loud enough to wake you up?",
    "How annoying was the alarm sound?",
    "Was the sound so annoying that you would not use it as an alarm?",
    "Overall, was the Couples Alarm experience clear?",
    "Was there anything you did not understand?",
    "Was there anything you expected to see or do that was missing?",
    "Do you have any additional comments?",
    "Overall, how would you rate Couples Alarm from 1 to 10?",
  ];

  for (const question of questions) {
    assert.equal(normalizedHtml.split(question).length - 1, 1, question);
  }
});
