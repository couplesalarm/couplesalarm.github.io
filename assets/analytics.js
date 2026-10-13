// Cookieless first-party page views and App Store click counts.
// Never collect listening answers, full referrer URLs, or arbitrary query values.
(function () {
  "use strict";
  const ENDPOINT = "https://xqdqgsbkapvlskcldmpe.supabase.co/functions/v1/record-page-view";
  const PUBLIC_KEY = "sb_publishable_aHZQlUwb3hUVeyYyVi5wGg_IryIbCVH";
  const context = window.couplesAlarmCampaign;
  if (!context) return; // The shared helper enforces host and Do Not Track limits.
  const { source, decorate } = context;
  let referrer = null;
  try { referrer = document.referrer ? new URL(document.referrer).hostname : null; } catch (_) {}
  const send = function (event, campaign) {
    try {
      fetch(ENDPOINT, {
        method: "POST", headers: { "Content-Type": "application/json", apikey: PUBLIC_KEY },
        body: JSON.stringify({ path: window.location.pathname, referrer, event_type: event, campaign }),
        keepalive: true, mode: "cors", credentials: "omit", cache: "no-store"
      }).catch(function () {});
    } catch (_) {}
  };
  // Resolve the actual destination at activation, including dynamically added
  // links. Capture updates the URL before navigation; one event per activation.
  const activate = function (event) {
    if (event.type === "auxclick" && event.button !== 1) return;
    const token = decorate(event.target?.closest?.("a[href]"));
    if (token) send("app_store_click", token);
  };
  document.addEventListener("click", activate, true);
  document.addEventListener("auxclick", activate, true);
  const pageView = function () { send("page_view", source); };
  if (document.prerendering) document.addEventListener("prerenderingchange", pageView, { once: true });
  else pageView();
})();
