const supportEmail = "couplesalarm.support@gmail.com";

export function formatFeedback(feedback) {
  const tested = feedback.tested.length ? feedback.tested.join(", ") : "Not specified";
  const body = [
    "Couples Alarm beta feedback",
    "",
    `TestFlight build: ${feedback.build || "Not provided"}`,
    `Parts tested: ${tested}`,
    "",
    `Roles were clear: ${feedback.roles}`,
    `Selected waking role was preserved: ${feedback.wakingRole}`,
    `Listening-test result was understandable: ${feedback.resultClarity}`,
    `Alarm test: ${feedback.alarm}`,
    `Confidence after testing: ${feedback.confidence}`,
    "",
    "What felt unclear:",
    feedback.unclear || "No response",
    "",
    "One thing to improve:",
    feedback.improvement || "No response",
    "",
    "Please do not add names, schedules, frequencies, listening observations, health information, or diagnoses.",
  ].join("\n");

  return {
    subject: `Couples Alarm beta feedback${feedback.build ? ` — build ${feedback.build}` : ""}`,
    body,
  };
}

if (typeof document !== "undefined") {
  const form = document.querySelector("#feedback-form");
  const copyButton = document.querySelector("#copy-feedback");
  const status = document.querySelector("#form-status");

  function readFeedback() {
    const data = new FormData(form);
    return {
      build: String(data.get("build") || "").trim(),
      tested: data.getAll("tested").map(String),
      roles: String(data.get("roles") || ""),
      wakingRole: String(data.get("wakingRole") || ""),
      resultClarity: String(data.get("resultClarity") || ""),
      alarm: String(data.get("alarm") || ""),
      confidence: String(data.get("confidence") || ""),
      unclear: String(data.get("unclear") || "").trim(),
      improvement: String(data.get("improvement") || "").trim(),
    };
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    const feedback = formatFeedback(readFeedback());
    status.textContent = "Opening your email app. Review the message, then tap Send.";
    window.location.href = `mailto:${supportEmail}?subject=${encodeURIComponent(feedback.subject)}&body=${encodeURIComponent(feedback.body)}`;
  });

  copyButton.addEventListener("click", async () => {
    if (!form.reportValidity()) return;

    const feedback = formatFeedback(readFeedback());
    try {
      await navigator.clipboard.writeText(`${feedback.subject}\n\n${feedback.body}`);
      status.textContent = "Answers copied. Paste them into an email to couplesalarm.support@gmail.com.";
    } catch {
      status.textContent = "Copy was unavailable. Use Review and send feedback instead.";
    }
  });
}
