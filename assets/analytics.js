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
  const safeDelivery = typeof window.crypto?.randomUUID === "function" &&
    typeof AbortController === "function" && typeof window.addEventListener === "function";
  const requestTimers = new Set(), retryTimers = new Set();
  let deliveryGeneration = 0, pageLeaving = false;
  const doNotTrack = () => window.doNotTrack === "1" || navigator.doNotTrack === "1" ||
    navigator.doNotTrack === "yes" || navigator.msDoNotTrack === "1";
  const clock = () => window.performance?.now ? window.performance.now() : Date.now();
  const cancelTimer = (timers, id) => { clearTimeout(id); timers.delete(id); };
  const later = (timers, callback, delay) => {
    const id = setTimeout(() => { timers.delete(id); callback(); }, delay);
    timers.add(id);
    return id;
  };
  if (safeDelivery) {
    window.addEventListener("pagehide", () => {
      pageLeaving = true; deliveryGeneration++;
      for (const timers of [requestTimers, retryTimers]) {
        for (const id of timers) clearTimeout(id);
        timers.clear();
      }
      // Do not abort an in-flight keepalive click or send an unload flush.
    });
    window.addEventListener("pageshow", () => { pageLeaving = false; });
  }
  const send = function (event, campaign) {
    try {
      if (doNotTrack() || pageLeaving) return;
      // Freeze the complete payload once: every retry represents this event,
      // even if the link, path, day, visibility or source changes afterwards.
      const body = JSON.stringify({ path: window.location.pathname, referrer, event_type: event, campaign,
        ...(diagnostics ? { diagnostics_version: 1 } : {}),
        ...(safeDelivery ? { delivery_version: 1, event_token: window.crypto.randomUUID(),
          event_day: new Date().toISOString().slice(0, 10) } :
          diagnosticTypes.has(event) ? { event_token: window.crypto.randomUUID() } : {}) });
      const options = { method: "POST", headers: { "Content-Type": "application/json", apikey: PUBLIC_KEY },
        body, keepalive: true, mode: "cors", credentials: "omit", cache: "no-store" };
      // Without secure event tokens + cancellation support, preserve a single
      // legacy attempt. Never enable retries that the server cannot deduplicate.
      if (!safeDelivery) { fetch(ENDPOINT, options).catch(function () {}); return; }
      const generation = deliveryGeneration, deadline = clock() + 15000;
      const active = () => !pageLeaving && generation === deliveryGeneration && !doNotTrack() && clock() < deadline;
      const retryDelay = (response, attempt) => {
        let delay = [1000, 3000][attempt];
        const value = response?.headers?.get?.("Retry-After");
        if (value) {
          const after = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - Date.now();
          if (Number.isFinite(after)) delay = Math.max(delay, after);
        }
        return delay;
      };
      const attempt = async number => {
        if (!active()) return;
        const controller = new AbortController();
        const timeout = later(requestTimers, () => controller.abort(), Math.min(4000, deadline - clock()));
        let response, retry = false;
        try {
          response = await fetch(ENDPOINT, { ...options, signal: controller.signal });
          retry = !response.ok && ([408, 425, 429].includes(response.status) ||
            (response.status >= 500 && response.status <= 599));
        } catch (_) { retry = true; }
        finally { cancelTimer(requestTimers, timeout); }
        if (!retry || number >= 2 || !active() || retryTimers.size >= 20) return;
        const delay = retryDelay(response, number);
        if (clock() + delay >= deadline) return;
        later(retryTimers, () => { void attempt(number + 1); }, delay);
      };
      void attempt(0);
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
