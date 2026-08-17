// Cookieless Google Analytics 4 for couplesalarm.com.
//
// MEASUREMENT_ID is the only switch: blank it out and this file goes inert,
// making no request and loading no script.
//
// The configuration below is deliberately storage-free so the site keeps its
// "no tracking" promise: gtag writes no cookies and no localStorage, Google
// Signals and ad personalization are off, and Do Not Track is honored. The
// tradeoff is that every visit counts as a new user, so returning-visitor and
// multi-session reports stay empty by design.
(function () {
  "use strict";

  const MEASUREMENT_ID = "G-3DZB7Q51CM";

  const measurementId = MEASUREMENT_ID.trim();
  if (!/^G-[A-Z0-9]{4,}$/.test(measurementId)) return;

  // Keep local previews and forks out of the production property.
  const host = window.location.hostname;
  if (host !== "couplesalarm.com" && host !== "www.couplesalarm.com") return;

  const doNotTrack =
    window.doNotTrack === "1" ||
    navigator.doNotTrack === "1" ||
    navigator.doNotTrack === "yes" ||
    navigator.msDoNotTrack === "1";
  if (doNotTrack) return;

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = gtag;

  // analytics_storage stays "granted" on purpose. It is a permission, not an
  // action: client_storage "none" below is what actually stops gtag writing
  // anything, and it wins regardless. Denying it as well would downgrade every
  // hit to a cookieless consent-mode ping, which GA4 only ever surfaces through
  // behavioral modeling — and a property this small will never reach the
  // modeling thresholds, so the reports would stay empty forever.
  gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "granted",
  });
  gtag("set", "ads_data_redaction", true);
  gtag("set", "url_passthrough", false);

  gtag("js", new Date());
  gtag("config", measurementId, {
    client_storage: "none",
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });

  const loader = document.createElement("script");
  loader.async = true;
  loader.src =
    "https://www.googletagmanager.com/gtag/js?id=" +
    encodeURIComponent(measurementId);
  document.head.appendChild(loader);
})();
