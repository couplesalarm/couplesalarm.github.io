const feedbackEndpoint =
  "https://xqdqgsbkapvlskcldmpe.supabase.co/functions/v1/submit-couples-alarm-feedback";

const emptyAppContext = {
  appVersion: "",
  build: "",
  iosVersion: "",
  entryPoint: "",
};

export function readAppContext(fragment) {
  const parameters = new URLSearchParams(fragment.replace(/^#/, ""));
  if (parameters.get("entryPoint") !== "question_mark") return emptyAppContext;

  const appVersion = String(parameters.get("appVersion") || "").trim();
  const build = String(parameters.get("build") || "").trim();
  const iosVersion = String(parameters.get("iosVersion") || "").trim();
  if (appVersion.length > 20 || build.length > 20 || iosVersion.length > 20) {
    return emptyAppContext;
  }

  return {
    appVersion,
    build,
    iosVersion,
    entryPoint: "question_mark",
  };
}

export function buildSubmission(feedback, appContext = emptyAppContext) {
  return {
    build: appContext.build || feedback.build.trim(),
    appVersion: appContext.appVersion,
    iosVersion: appContext.iosVersion,
    entryPoint: appContext.entryPoint,
    tested: feedback.tested,
    roles: feedback.roles,
    wakingRole: feedback.wakingRole,
    resultClarity: feedback.resultClarity,
    alarm: feedback.alarm,
    confidence: feedback.confidence,
    unclear: feedback.unclear.trim(),
    improvement: feedback.improvement.trim(),
  };
}

if (typeof document !== "undefined") {
  const form = document.querySelector("#feedback-form");
  const submitButton = form.querySelector('button[type="submit"]');
  const status = document.querySelector("#form-status");
  const buildInput = form.querySelector('input[name="build"]');
  const contextSummary = document.querySelector("#app-context");
  const appContext = readAppContext(window.location.hash);

  if (appContext.build) {
    buildInput.value = appContext.build;
    buildInput.readOnly = true;
    contextSummary.hidden = false;
    contextSummary.textContent =
      `Detected from the app: Couples Alarm ${appContext.appVersion} ` +
      `(build ${appContext.build}) on iOS ${appContext.iosVersion}.`;
  }

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

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;

    submitButton.disabled = true;
    submitButton.textContent = "Submitting…";
    status.textContent = "Recording your feedback…";

    try {
      const response = await fetch(feedbackEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildSubmission(readFeedback(), appContext)),
      });
      const result = await response.json();
      if (!response.ok || !result.ok || typeof result.reference !== "string") {
        throw new Error("Feedback was not recorded");
      }

      form.reset();
      status.textContent = `Thank you — your feedback was recorded. Reference: ${result.reference}`;
    } catch {
      status.textContent =
        "We couldn’t record your feedback. Please try again, or email couplesalarm.support@gmail.com.";
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Submit feedback";
    }
  });
}
