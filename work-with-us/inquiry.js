import { inquiryEndpoint, inquiryPublicKey } from "./config.js";

const fields = ["name", "email", "category", "channelUrl", "audience", "idea"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function readInquiry(data) {
  return Object.fromEntries(fields.map(name => [name, String(data.get(name) || "").trim()]));
}

export async function submitInquiry(endpoint, payload, fetchImpl = fetch) {
  if (!endpoint) throw new Error("Form unavailable");
  const response = await fetchImpl(endpoint, {
    method: "POST", headers: { "Content-Type": "application/json", apikey: inquiryPublicKey },
    credentials: "omit", referrerPolicy: "no-referrer",
    signal: AbortSignal.timeout(15000), body: JSON.stringify(payload),
  });
  if (response.status === 429) throw new Error("Inquiry limit reached");
  const result = await response.json();
  if (!response.ok || result.ok !== true || !uuid.test(result.reference) || result.reference !== payload.id) {
    throw new Error("Inquiry not confirmed");
  }
  return result.reference;
}

// A retry of unchanged details uses the same random key. No personal data is
// persisted in browser storage or copied into a URL, log or analytics event.
export function createSender(endpoint, fetchImpl = fetch, randomUUID = () => crypto.randomUUID()) {
  let previous = "";
  let id;
  return async details => {
    const serialized = JSON.stringify(details);
    if (serialized !== previous) { previous = serialized; id = randomUUID(); }
    return submitInquiry(endpoint, { ...details, id }, fetchImpl);
  };
}

export function attachInquiryForm(document, endpoint = inquiryEndpoint, fetchImpl = fetch) {
  const form = document.querySelector("#inquiry-form");
  if (!form) return;
  const fieldset = document.querySelector("#inquiry-fields");
  const submit = form.querySelector('button[type="submit"]');
  const status = document.querySelector("#inquiry-status");
  const error = document.querySelector("#inquiry-error");
  const availability = document.querySelector("#inquiry-availability");
  const choices = [...document.querySelectorAll("[data-inquiry-category]")];
  fieldset.disabled = false;
  submit.disabled = false;
  availability.hidden = Boolean(endpoint);
  let sending = false;
  let sender = createSender(endpoint, fetchImpl);
  choices.forEach(button => {
    button.hidden = false;
    button.addEventListener("click", () => {
      if (sending) return;
      form.elements.category.value = button.dataset.inquiryCategory;
      form.elements.category.focus();
    });
  });
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (sending || !form.reportValidity()) return;
    error.hidden = true;
    status.textContent = "";
    if (!endpoint) {
      error.textContent = "The inquiry form is not available yet. Your details have not been sent. Please email couplesalarm.support@gmail.com.";
      error.hidden = false;
      error.focus();
      return;
    }
    const details = readInquiry(new FormData(form));
    // Native required validation accepts whitespace; reject it before sending.
    for (const name of ["name", "email", "category", "idea"]) {
      if (!details[name]) {
        error.textContent = "Please complete the required fields.";
        error.hidden = false;
        form.elements[name].focus();
        return;
      }
    }
    sending = true;
    fieldset.disabled = true;
    submit.disabled = true;
    choices.forEach(button => { button.disabled = true; });
    form.setAttribute("aria-busy", "true");
    submit.textContent = "Sending…";
    status.textContent = "Recording your inquiry…";
    try {
      const reference = await sender(details);
      form.reset();
      sender = createSender(endpoint, fetchImpl);
      status.textContent = `Thank you — your inquiry was recorded. Reference: ${reference}. This is an inquiry, not enrollment in a program.`;
      status.focus();
    } catch (failure) {
      status.textContent = "";
      error.textContent = failure.message === "Inquiry limit reached"
        ? "The inquiry limit has been reached. This attempt was not recorded. Your details are still here. Please try again later or email couplesalarm.support@gmail.com."
        : "We couldn’t confirm your inquiry was recorded. Your details are still here. Please try again, or email couplesalarm.support@gmail.com. Retrying unchanged details in this page will not create another inquiry.";
      error.hidden = false;
      error.focus();
    } finally {
      sending = false;
      fieldset.disabled = false;
      submit.disabled = false;
      choices.forEach(button => { button.disabled = false; });
      form.setAttribute("aria-busy", "false");
      submit.textContent = "Send inquiry";
    }
  });
}
if (typeof document !== "undefined") attachInquiryForm(document);
