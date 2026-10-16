// Cookieless first-party page views and App Store click counts.
// Never collect listening answers, full referrer URLs, or arbitrary query values.
(function () {
  "use strict";
  const ENDPOINT = "https://xqdqgsbkapvlskcldmpe.supabase.co/functions/v1/record-page-view";
  const PUBLIC_KEY = "sb_publishable_aHZQlUwb3hUVeyYyVi5wGg_IryIbCVH";
  const context = window.couplesAlarmCampaign;
  if (!context || window.couplesAlarmAnalyticsStarted) return; // The shared helper enforces host and Do Not Track limits.
  window.couplesAlarmAnalyticsStarted = true;
  const { source, decorate } = context;
  // All-or-nothing capability marker keeps older/unsupported loads out of the
  // diagnostic denominator. No browser storage, high-entropy probes or session ID.
  const diagnostics = typeof IntersectionObserver === "function" &&
    typeof MutationObserver === "function" && typeof window.crypto?.randomUUID === "function" &&
    typeof window.performance?.now === "function" && typeof document.visibilityState === "string";
  const diagnosticTypes = new Set(["app_store_visible", "foreground_10s"]);
  let referrer = null;
  try { referrer = document.referrer ? new URL(document.referrer).hostname : null; } catch (_) {}
  const send = function (event, campaign) {
    try {
      fetch(ENDPOINT, {
        method: "POST", headers: { "Content-Type": "application/json", apikey: PUBLIC_KEY },
        body: JSON.stringify({ path: window.location.pathname, referrer, event_type: event, campaign,
          ...(diagnostics ? { diagnostics_version: 1 } : {}),
          // Independent event token: never reused to join events or identify a visit.
          ...(diagnosticTypes.has(event) ? { event_token: window.crypto.randomUUID() } : {}) }),
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
  let started = false;
  const pageView = function () {
    if (started) return;
    started = true;
    send("page_view", source);
    if (diagnostics) startDiagnostics();
  };
  function startDiagnostics() {
    let exposed = false, engaged = false, suspended = false;
    let elapsed = 0, lastTick = null, timer = null, observer = null, mutations = null;
    const candidates = new Map();
    let observerGeneration = 0;
    const foreground = () => !suspended && !document.prerendering && document.visibilityState === "visible";
    const storeLink = link => {
      try {
        const url = new URL(link.href);
        return url.protocol === "https:" && url.hostname === "apps.apple.com" &&
          /(?:^|\/)id6792771975(?:\/|$)/.test(url.pathname);
      } catch (_) { return false; }
    };
    const rendered = link => {
      if (!link.isConnected || !storeLink(link)) return false;
      // IO reports geometry, not CSS transparency. Check the anchor and ancestors.
      for (let node = link; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden" ||
            style.visibility === "collapse" || Number(style.opacity) === 0) return false;
      }
      if (link.checkVisibility && !link.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
      const r = link.getBoundingClientRect();
      const area = r.width * r.height;
      const visible = Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0)) *
        Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
      return area > 0 && visible / area >= 0.5;
    };
    const stopExposure = () => {
      observerGeneration++;
      observer?.disconnect(); mutations?.disconnect();
      observer = mutations = null; candidates.clear();
    };
    const checkExposure = () => {
      if (!foreground() || exposed) return;
      if ([...candidates].some(([link, ratio]) => ratio >= 0.5 && rendered(link))) {
        exposed = true;
        send("app_store_visible", source); // Page source, not badge's default token.
        stopExposure();
      }
    };
    const scan = () => {
      if (!observer) return;
      for (const link of candidates.keys()) {
        if (!link.isConnected || !storeLink(link)) { observer.unobserve(link); candidates.delete(link); }
      }
      for (const link of document.querySelectorAll("a[href]")) {
        if (storeLink(link) && !candidates.has(link)) { candidates.set(link, 0); observer.observe(link); }
      }
      checkExposure();
    };
    const observe = () => {
      if (exposed || !foreground()) return;
      const generation = ++observerGeneration;
      observer = new IntersectionObserver(entries => {
        if (generation !== observerGeneration) return;
        for (const entry of entries) {
          if (candidates.has(entry.target)) candidates.set(entry.target, entry.isIntersecting ? entry.intersectionRatio : 0);
        }
        checkExposure();
      }, { threshold: [0, 0.5] });
      mutations = new MutationObserver(scan);
      mutations.observe(document.documentElement, { subtree: true, childList: true,
        attributes: true, attributeFilter: ["href", "class", "style", "hidden"] });
      scan();
    };
    const tick = () => {
      const now = window.performance.now();
      // Discard long scheduling gaps (sleep/freeze/stalled execution), rather
      // than manufacturing foreground activity while the browser was inactive.
      if (lastTick !== null) {
        const delta = now - lastTick;
        if (delta >= 0 && delta <= 1000) elapsed += delta;
      }
      lastTick = foreground() ? now : null;
      if (!engaged && foreground() && elapsed >= 10000) {
        engaged = true;
        clearInterval(timer); timer = null; lastTick = null;
        send("foreground_10s", source);
      }
      checkExposure();
    };
    const pause = () => {
      clearInterval(timer); timer = null; lastTick = null;
      stopExposure();
    };
    const resume = () => {
      pause();
      if (!foreground()) return;
      if (!engaged) { lastTick = window.performance.now(); timer = setInterval(tick, 250); }
      observe();
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("pagehide", () => { suspended = true; pause(); });
    window.addEventListener("pageshow", () => { suspended = false; resume(); });
    // BFCache restores this same document's flags and elapsed time; no new view.
    resume();
  }
  if (document.prerendering) document.addEventListener("prerenderingchange", pageView, { once: true });
  else pageView();
})();
