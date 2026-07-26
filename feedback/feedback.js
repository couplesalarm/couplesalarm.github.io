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
  if (
    !appVersion ||
    !build ||
    !iosVersion ||
    appVersion.length > 20 ||
    build.length > 20 ||
    iosVersion.length > 20
  ) {
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
    experienceClarity: feedback.experienceClarity,
    alarm: feedback.alarm,
    alarmLoudEnough: feedback.alarmLoudEnough,
    soundAnnoyance: feedback.soundAnnoyance,
    soundDealbreaker: feedback.soundDealbreaker,
    rating: Number(feedback.rating),
    unclear: feedback.unclear.trim(),
    expectedMissing: feedback.expectedMissing.trim(),
    additionalComments: feedback.additionalComments.trim(),
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
      experienceClarity: String(data.get("experienceClarity") || ""),
      alarm: String(data.get("alarm") || ""),
      alarmLoudEnough: String(data.get("alarmLoudEnough") || ""),
      soundAnnoyance: String(data.get("soundAnnoyance") || ""),
      soundDealbreaker: String(data.get("soundDealbreaker") || ""),
      rating: String(data.get("rating") || ""),
      unclear: String(data.get("unclear") || "").trim(),
      expectedMissing: String(data.get("expectedMissing") || "").trim(),
      additionalComments: String(data.get("additionalComments") || "").trim(),
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
