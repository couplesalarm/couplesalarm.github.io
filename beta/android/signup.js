const applicationEndpoint =
  "https://xqdqgsbkapvlskcldmpe.supabase.co/functions/v1/submit-android-beta-application";

// Public anon JWT for the Edge Function gateway. It grants no application-table access.
const publicAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhxZHFnc2JrYXB2bHNrY2xkbXBlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzOTQ2MjAsImV4cCI6MjA5OTk3MDYyMH0.9ZIr_kL5uQB7GRwr_mt9xsIoS-csPzIE04X9UIqbMmo";

export function buildApplication(data) {
  return {
    playEmail: String(data.get("playEmail") || "").trim().toLowerCase(),
    phoneModel: String(data.get("phoneModel") || "").trim(),
    androidVersion: String(data.get("androidVersion") || "").trim(),
    canTest14Days: String(data.get("canTest14Days") || ""),
    adultConfirmed: data.get("adultConfirmed") === "on",
    contactConsent: data.get("contactConsent") === "on",
    interests: data.getAll("interests").map(String),
    website: String(data.get("website") || ""),
  };
}

export async function submitApplication(application, fetchImpl = fetch) {
  const response = await fetchImpl(applicationEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: publicAnonKey,
      Authorization: `Bearer ${publicAnonKey}`,
    },
    body: JSON.stringify(application),
  });
  const result = await response.json();
  if (!response.ok || result.ok !== true) {
    throw new Error("Application could not be recorded");
  }
}

if (typeof document !== "undefined") {
  const form = document.querySelector("#beta-application-form");
  const submitButton = form.querySelector('button[type="submit"]');
  const fields = document.querySelector("#application-fields");
  const status = document.querySelector("#application-status");
  let submitting = false;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitting || !form.reportValidity()) return;
    const application = buildApplication(new FormData(form));
    submitting = true;
    submitButton.disabled = true;
    submitButton.textContent = "Submitting…";
    form.setAttribute("aria-busy", "true");
    status.textContent = "Sending your application…";
    delete status.dataset.state;

    try {
      await submitApplication(application);
      form.reset();
      fields.hidden = true;
      form.querySelector(".application-submit").hidden = true;
      status.dataset.state = "success";
      status.textContent = "Thank you — your application has been received. Brian will contact selected testers with access and Google Play instructions when the test build is ready. Applying does not automatically grant access.";
      status.focus();
    } catch {
      status.dataset.state = "error";
      status.textContent = "We couldn’t send your application. Your answers are still here. Please try again, or contact couplesalarm.support@gmail.com.";
      status.focus();
    } finally {
      submitting = false;
      form.removeAttribute("aria-busy");
      submitButton.disabled = false;
      submitButton.textContent = "Submit application";
    }
  });
}
