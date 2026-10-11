// An explicit visitor action only. Never sends a message or collects contacts.
(function () {
  "use strict";
  const button = document.querySelector("[data-share-button]");
  const input = document.querySelector("[data-share-link]");
  const status = document.querySelector("[data-share-status]");
  if (!button || !input || !status) return;
  const share = {
    title: "Couples Alarm",
    text: "Different wake times? Let's try the listening check together.",
    url: "https://couplesalarm.com/download/"
  };
  button.hidden = false;
  button.addEventListener("click", async function () {
    status.textContent = "";
    if (typeof navigator.share === "function") {
      try { await navigator.share(share); return; }
      catch (error) { if (error.name === "AbortError") return; }
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(share.url);
      status.textContent = "Link copied. Send it to your partner when you’re ready.";
    } catch (_) {
      input.focus();
      input.select();
      status.textContent = "Select and copy the link, then send it to your partner.";
    }
  });
})();
