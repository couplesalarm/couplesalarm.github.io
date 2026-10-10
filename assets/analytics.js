// Cookieless first-party page views and App Store click counts.
// Never collect listening answers, full referrer URLs, or arbitrary query values.
(function () {
  "use strict";
  const ENDPOINT = "https://xqdqgsbkapvlskcldmpe.supabase.co/functions/v1/record-page-view";
  const PUBLIC_KEY = "sb_publishable_aHZQlUwb3hUVeyYyVi5wGg_IryIbCVH";
  const campaigns = new Set(["owned_website", "paid_facebook_iphone", "paid_instagram_iphone", "paid_youtube_iphone", "tracking_qa"]);
  const host = window.location.hostname;
  if (host !== "couplesalarm.com" && host !== "www.couplesalarm.com") return;
  const doNotTrack = window.doNotTrack === "1" || navigator.doNotTrack === "1" ||
    navigator.doNotTrack === "yes" || navigator.msDoNotTrack === "1";
  if (doNotTrack) return;
  const params = new URLSearchParams(window.location.search);
  const source = campaigns.has(params.get("ct")) ? params.get("ct") : null;
  const appLinks = document.querySelectorAll('a[href*="apps.apple.com/"]');
  appLinks.forEach(function (link) {
    try {
      const url = new URL(link.href);
      if (url.hostname !== "apps.apple.com" || !url.pathname.includes("id6792771975")) return;
      if (!url.searchParams.has("pt")) url.searchParams.set("pt", "129195755");
      if (!url.searchParams.has("ct")) url.searchParams.set("ct", source || "owned_website");
      if (!url.searchParams.has("mt")) url.searchParams.set("mt", "8");
      link.href = url.href;
    } catch (_) {}
  });
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
  appLinks.forEach(function (link) {
    try {
      const url = new URL(link.href);
      if (url.hostname !== "apps.apple.com" || !url.pathname.includes("id6792771975")) return;
      link.addEventListener("click", function () {
        const token = url.searchParams.get("ct");
        send("app_store_click", campaigns.has(token) ? token : "owned_website");
      });
    } catch (_) {}
  });
  const pageView = function () { send("page_view", source); };
  if (document.prerendering) document.addEventListener("prerenderingchange", pageView, { once: true });
  else pageView();
})();
