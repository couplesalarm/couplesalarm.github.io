// Link-only campaign handoffs: no requests, storage or form data.
// Never collect listening answers, full referrer URLs, or arbitrary query values.
(function () {
  "use strict";
  const campaigns = new Set(["owned_website", "paid_facebook_iphone", "paid_instagram_iphone", "paid_instagram_snooze_v14", "paid_ig_snooze_asian_v15", "paid_ig_snooze_white_v15", "paid_ig_snooze_black_v15", "paid_youtube_iphone", "paid_tiktok_iphone", "tracking_qa"]);
  const host = window.location.hostname;
  if (host !== "couplesalarm.com" && host !== "www.couplesalarm.com") return;
  const doNotTrack = window.doNotTrack === "1" || navigator.doNotTrack === "1" ||
    navigator.doNotTrack === "yes" || navigator.msDoNotTrack === "1";
  if (doNotTrack) return;
  const params = new URLSearchParams(window.location.search);
  // Recognize only the approved TikTok ad's exact UTM tuple; never store UTM values.
  // Explicit approved ct values take priority so QA stays excluded from reports.
  const tiktokAlias = params.get("utm_source") === "tiktok" &&
    params.get("utm_medium") === "paid_social" &&
    params.get("utm_campaign") === "website_link_test_20261011";
  const approved = value => campaigns.has(value) ? value : null;
  const specific = value => value && value !== "owned_website";
  const publicPaths = new Set(["/wake-up-without-waking-partner/", "/best-alarm-apps-for-couples/", "/alarm-tone-only-one-person-hears/", "/", "/compatibility/", "/download/", "/different-wake-times/", "/support/", "/privacy/", "/work-with-us/", "/beta/android/"]);
  const publicHosts = new Set(["couplesalarm.com", "www.couplesalarm.com"]);
  // URL-scoped only: no cookies, browser storage, identity or cross-visit session.
  // Recover an approved tag from a same-site public-page referrer when an
  // uninstrumented public page (e.g. the inquiry form) sits between two links.
  let previous = null;
  try {
    const url = new URL(document.referrer);
    if (url.protocol === "https:" && publicHosts.has(url.hostname) && publicPaths.has(url.pathname)) {
      previous = approved(url.searchParams.get("ct"));
    }
  } catch (_) {}
  const incoming = approved(params.get("ct"));
  const source = incoming === "tracking_qa" || previous === "tracking_qa" ? "tracking_qa" :
    specific(incoming) ? incoming : tiktokAlias ? "paid_tiktok_iphone" :
    specific(previous) ? previous : incoming || previous;
  const decorate = function (link) {
    if (!link?.href) return null;
    try {
      const url = new URL(link.href, "https://" + host + window.location.pathname);
      if (url.protocol !== "https:") return null;
      const store = url.hostname === "apps.apple.com" && /(?:^|\/)id6792771975(?:\/|$)/.test(url.pathname);
      const internal = publicHosts.has(url.hostname) && publicPaths.has(url.pathname);
      if (!store && !internal) return null;
      const existing = approved(url.searchParams.get("ct"));
      // QA always wins. Preserve specific destination tags, but never let a
      // generic/default or invalid token erase a known incoming campaign.
      const token = source === "tracking_qa" || existing === "tracking_qa" ? "tracking_qa" :
        specific(existing) ? existing : source || existing || (store ? "owned_website" : null);
      if (token) url.searchParams.set("ct", token);
      else url.searchParams.delete("ct");
      if (store) {
        if (!url.searchParams.has("pt")) url.searchParams.set("pt", "129195755");
        if (!url.searchParams.has("mt")) url.searchParams.set("mt", "8");
      }
      // Do not rewrite untagged relative internal links unnecessarily.
      if (store || token || link.href.includes("ct=")) link.href = url.href;
      return store ? token : null;
    } catch (_) { return null; }
  };
  document.querySelectorAll("a[href]").forEach(decorate);
  window.couplesAlarmCampaign = { source, decorate };
  const carry = event => decorate(event.target?.closest?.("a[href]"));
  document.addEventListener("click", carry, true);
  document.addEventListener("auxclick", carry, true);
})();
