import assert from "node:assert/strict";
import test from "node:test";
import { sendFeedbackNotification } from "../supabase/functions/submit-couples-alarm-feedback/email.ts";

test("emails the owner a private feedback-dashboard link", async () => {
  let request;
  await sendFeedbackNotification("feedback-reference", "secret", async (...args) => {
    request = args;
    return { ok: true };
  });

  assert.equal(request[0], "https://api.resend.com/emails");
  assert.equal(request[1].headers.Authorization, "Bearer secret");
  assert.deepEqual(JSON.parse(request[1].body), {
    from: "Couples Alarm <onboarding@resend.dev>",
    to: ["bmarko@gmail.com"],
    subject: "New Couples Alarm beta feedback",
    text:
      "New beta feedback was submitted.\n\nReference: feedback-reference\n\n" +
      "Review it: https://couplesalarm.github.io/admin/",
  });
});
