import { mountSoundTest } from "../compatibility/compatibility.js?v=20261125-fresh-test";
import { dismissOnBackdrop } from "./dialog-backdrop.js?v=20261125";

const trigger = document.querySelector(".tone-test-primary");
const dialog = document.querySelector(".sound-test-dialog");
const story = document.querySelector(".video-dialog");
const scrollContainer = dialog.querySelector(".sound-test-scroll");
const content = dialog.querySelector(".sound-test-content");
const loading = dialog.querySelector(".sound-test-loading");
const fallback = dialog.querySelector(".sound-test-fallback");
let test;
let load;

async function loadTest() {
  loading.hidden = false;
  fallback.hidden = true;
  try {
    const url = new URL(trigger.href);
    url.searchParams.set("v", "20261125-fresh-test");
    const response = await fetch(url, { mode: "same-origin" });
    if (!response.ok) throw new Error("Could not load sound test");
    const page = new DOMParser().parseFromString(await response.text(), "text/html");
    const testBody = page.querySelector("[data-test-body]");
    if (!testBody) throw new Error("Sound test markup unavailable");

    // The standalone route owns the markup. Its page scripts and styles stay there.
    content.replaceChildren(...testBody.children);
    test = mountSoundTest(dialog, { scrollContainer });
    if (dialog.open && document.activeElement === dialog.querySelector(".sound-test-close")) {
      test.focusStep();
    }
  } catch {
    content.replaceChildren();
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
      test.restart();
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
    trigger.focus({ preventScroll: true });
  });
}
