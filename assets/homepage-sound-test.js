import { mountSoundTest } from "../compatibility/compatibility.js?v=20261125-modal";
import { dismissOnBackdrop } from "./dialog-backdrop.js?v=20261125";

const trigger = document.querySelector(".tone-test-primary");
const triggerLabel = trigger.querySelector("span");
const dialog = document.querySelector(".sound-test-dialog");
const story = document.querySelector(".video-dialog");
const scrollContainer = dialog.querySelector(".sound-test-scroll");
const content = dialog.querySelector(".sound-test-content");
const stores = dialog.querySelector(".sound-test-stores");
const loading = dialog.querySelector(".sound-test-loading");
const fallback = dialog.querySelector(".sound-test-fallback");
let test;
let load;

async function loadTest() {
  loading.hidden = false;
  fallback.hidden = true;
  try {
    const url = new URL(trigger.href);
    url.searchParams.set("v", "20261125-modal");
    const response = await fetch(url, { mode: "same-origin" });
    if (!response.ok) throw new Error("Could not load sound test");
    const page = new DOMParser().parseFromString(await response.text(), "text/html");
    const testBody = page.querySelector("[data-test-body]");
    const testStores = page.querySelector(".test-downloads");
    if (!testBody || !testStores) throw new Error("Sound test markup unavailable");

    // The standalone route owns the markup. Its page scripts and styles stay there.
    content.replaceChildren(...testBody.children);
    stores.replaceChildren(...testStores.children);
    test = mountSoundTest(dialog, { scrollContainer });
    stores.hidden = false;
    if (dialog.open && document.activeElement === dialog.querySelector(".sound-test-close")) {
      test.focusStep();
    }
  } catch {
    content.replaceChildren();
    stores.replaceChildren();
    fallback.querySelector("a").href = trigger.href;
    fallback.hidden = false;
  } finally {
    loading.hidden = true;
    load = undefined;
  }
}

function closeTest() {
  test?.pause();
  dialog.close();
}

if (typeof dialog.showModal === "function") {
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-controls", dialog.id);
  trigger.addEventListener("click", event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (dialog.open || story.open) return;
    dialog.showModal();
    if (test) {
      scrollContainer.scrollTo(0, 0);
      test.focusStep();
    } else {
      load ??= loadTest();
    }
  });

  dialog.querySelector(".sound-test-close").addEventListener("click", closeTest);
  dismissOnBackdrop(dialog, closeTest);
  dialog.addEventListener("cancel", event => {
    event.preventDefault();
    closeTest();
  });
  dialog.addEventListener("close", () => {
    if (dialog.open) return;
    test?.pause();
    triggerLabel.textContent = test?.hasProgress() ? "Resume sound test" : "Try the sound test";
    trigger.focus({ preventScroll: true });
  });
}
