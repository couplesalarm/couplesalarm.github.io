// Cookieless first-party page view counting for couplesalarm.com.
//
// This replaced Google Analytics, which could not do the job. GA4 ignores the
// client_storage "none" config parameter, so Consent Mode is its only real
// control, and that is strictly either/or: denying analytics_storage sets no
// cookies but reduces every hit to a modeling-only ping this site is far too
// small to ever surface, while granting it writes _ga cookies and would need a
// consent banner. There is no GA4 setting that counts visitors without cookies.
//
// This beacon does. It sends the page path and the referrer host to our own
// Supabase function and nothing else. No cookie, no browser storage, no
// advertising network, or client-generated visitor identifier. The recorder
// retains only its existing approximate, daily visitor hash.
(function () {
  "use strict";

  const ENDPOINT =
    "https://xqdqgsbkapvlskcldmpe.supabase.co/functions/v1/record-page-view";

  // Keep local previews and forks out of the production numbers.
  const host = window.location.hostname;
  if (host !== "couplesalarm.com" && host !== "www.couplesalarm.com") return;

  const doNotTrack =
    window.doNotTrack === "1" ||
    navigator.doNotTrack === "1" ||
    navigator.doNotTrack === "yes" ||
    navigator.msDoNotTrack === "1";
  if (doNotTrack) return;

  const referrerOrigin = function (value) {
    if (!value) return null;
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" && url.protocol !== "http:") return null;
      // Keep a URL the recorder can parse, but send only its scheme and host.
      // Do not transmit credentials, port, path, query string, or fragment.
      return url.protocol + "//" + url.hostname;
    } catch (error) {
      return null;
    }
  };

  const payload = JSON.stringify({
    // Query strings and fragments can carry personal data, so never send them.
    path: window.location.pathname,
    referrer: referrerOrigin(document.referrer),
  });

  const send = function () {
    try {
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
        mode: "cors",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store",
      }).catch(function () {});
    } catch (error) {
      // A page view is never worth breaking the page over.
    }
  };

  // Do not count a prerendered page until someone actually looks at it.
  if (document.prerendering) {
    document.addEventListener("prerenderingchange", send, { once: true });
  } else {
    send();
  }
})();
