import { campaignLabels, dailyCsv, fetchWebsiteMetrics, startDate, websiteRange } from "./metrics.js?v=20261011-v15";
const numberFormat = new Intl.NumberFormat("en-US");
const currencyFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const timeFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short" });
const metricLabels = { visitors: "Estimated visitors", pageViews: "Page views", appStoreClicks: "App Store outbound clicks", firstTimeDownloads: "First-time downloads" };
const fmt = value => Number.isFinite(value) ? numberFormat.format(value) : "—";
const dayLabel = value => value && Number.isFinite(Date.parse(value)) ? dateFormat.format(new Date(value)) : "Unavailable";
const timeLabel = value => value && Number.isFinite(Date.parse(value)) ? timeFormat.format(new Date(value)) : "unavailable";
function element(doc, name, text, className) {
  const node = doc.createElement(name);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function set(doc, selector, text) { doc.querySelector(selector).textContent = text; }
function badge(doc, selector, label, state) {
  const node = doc.querySelector(selector); node.textContent = label; node.className = `mode ${state}`;
}
export function snapshotFreshness(throughDate, now = Date.now()) {
  const sourceDay = Date.parse(`${throughDate}T00:00:00Z`);
  const current = new Date(now);
  const today = Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate());
  if (!Number.isFinite(sourceDay) || !Number.isFinite(today)) return { state: "stale", label: "Apple report date unavailable" };
  const daysBehind = Math.max(0, Math.floor((today - sourceDay) / 86400000));
  if (daysBehind <= 1) return { state: "fresh", label: "Apple report current" };
  return { state: "stale", label: `Apple data ${daysBehind} days behind` };
}
export function socialFreshness(platform, now = Date.now()) {
  if (platform.status === "error") return "Refresh failed · retained count";
  const stale = !Number.isFinite(Date.parse(platform.updatedAt)) || now - Date.parse(platform.updatedAt) > 2 * 86400000;
  return `${stale ? "Stale" : "Checked"} · ${platform.mode === "manual" ? "manual" : "public post"}`;
}
function rows(doc, selector, values) {
  const output = values.map(cells => {
    const row = element(doc, "tr");
    cells.forEach((value, index) => { const cell = element(doc, index === 0 ? "th" : "td", value); if (index === 0) cell.scope = "row"; row.append(cell); });
    return row;
  });
  doc.querySelector(selector).replaceChildren(...output);
}
function bars(doc, selector, data) {
  const target = doc.querySelector(selector);
  if (!data.length) { target.replaceChildren(element(doc, "p", "No recorded page views in this period.", "muted")); return; }
  const list = element(doc, "ul", undefined, "bar-list");
  const max = Math.max(1, ...data.map(row => row.pageViews));
  for (const row of data) {
    const li = element(doc, "li");
    const label = element(doc, "div", undefined, "bar-label");
    label.append(element(doc, "span", row.label), element(doc, "strong", fmt(row.pageViews)));
    const track = element(doc, "div", undefined, "bar-track");
    track.setAttribute("aria-hidden", "true");
    const fill = element(doc, "div", undefined, "bar-fill"); fill.style.width = `${row.pageViews / max * 100}%`;
    track.append(fill); li.append(label, track); list.append(li);
  }
  target.replaceChildren(list);
}
function chart(doc, selector, data, metric) {
  const target = doc.querySelector(selector);
  if (!data.length) { target.replaceChildren(element(doc, "p", "Daily history is not available yet.", "chart-empty")); return; }
  const ns = "http://www.w3.org/2000/svg";
  const svgNode = (tag, attrs, text) => {
    const n = doc.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) n.setAttribute(key, value);
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const canvasWidth = Math.max(300, target.clientWidth || 1000);
  const svg = svgNode("svg", { viewBox: `0 0 ${canvasWidth} 250`, role: "img", "aria-label": `${metricLabels[metric]} by day. Bars start at zero; missing reports are marked with a cross. Exact values are in the table below.` });
  svg.append(svgNode("title", {}, metricLabels[metric]));
  const max = Math.max(1, ...data.map(row => row[metric] ?? 0));
  const top = 24, bottom = 208, left = 38, width = canvasWidth - 54, step = width / data.length;
  const labelCount = canvasWidth < 500 ? 4 : 7;
  for (const tick of [...new Set([0, Math.ceil(max / 2), max])]) {
    const y = bottom - tick / max * (bottom - top);
    svg.append(svgNode("line", { x1: left, x2: canvasWidth - 12, y1: y, y2: y, class: "grid" }), svgNode("text", { x: left - 10, y: y + 4, "text-anchor": "end" }, fmt(tick)));
  }
  data.forEach((row, index) => {
    const x = left + step * index + step / 2, value = row[metric], barWidth = Math.max(2, Math.min(64, step * .68));
    if (value === null || value === undefined) {
      const cross = svgNode("path", { d: `M${x - 3},${bottom - 6}l6,6m-6,0l6,-6`, class: "missing" });
      cross.append(svgNode("title", {}, `${row.date}: report unavailable`)); svg.append(cross);
    } else {
      const height = value / max * (bottom - top);
      const rect = svgNode("rect", { x: x - barWidth / 2, y: bottom - height, width: barWidth, height, rx: 3,
        class: row.partial ? "partial-bar" : "data-bar", tabindex: "0", "aria-label": `${row.date}: ${fmt(value)} ${metricLabels[metric]}${row.partial ? ", partial day" : ""}` });
      rect.append(svgNode("title", {}, `${dayLabel(row.date)}: ${fmt(value)}${row.partial ? " (partial day)" : ""}`)); svg.append(rect);
      if (data.length <= (canvasWidth < 500 ? 7 : 14)) svg.append(svgNode("text", { x, y: Math.max(14, bottom - height - 7), "text-anchor": "middle" }, fmt(value)));
    }
    if (data.length <= labelCount || index % Math.ceil(data.length / labelCount) === 0) svg.append(svgNode("text", { x, y: 234, "text-anchor": "middle" }, row.date.slice(5).replace("-", "/")));
  });
  target.replaceChildren(svg);
}
function renderWebsite(snapshot, doc, options) {
  const website = snapshot.website;
  if (!website) {
    badge(doc, "#website-mode", "Unavailable", "stale");
    set(doc, "#website-updated", "Website reporting could not be reached; no saved report is available.");
    set(doc, "#website-source-status", "Website reporting unavailable. Retry the refresh or check the reporting endpoint.");
    return;
  }
  const fresh = options.websiteLive && options.now - Date.parse(website.generatedAt) < 3600000;
  badge(doc, "#website-mode", fresh ? "Live counts" : "Saved report", fresh ? "fresh" : "stale");
  const reportDay = website.generatedAt.slice(0, 10);
  const latest = website.daily.find(row => row.date === reportDay);
  const previous = website.daily.find(row => row.date === startDate(reportDay, 2));
  set(doc, "#website-current-day", `${dayLabel(reportDay)} · partial day · UTC`);
  set(doc, "#today-visitors", fmt(latest?.visitors)); set(doc, "#today-views", fmt(latest?.pageViews)); set(doc, "#today-clicks", fmt(latest?.appStoreClicks));
  set(doc, "#yesterday-visitors", fmt(previous?.visitors));
  set(doc, "#yesterday-label", `Previous day’s visitors${previous?.partial ? " · partial" : ""}`);
  set(doc, "#website-updated", `${fresh ? "Read from website counter" : "Saved website counts"} · ${timeLabel(website.generatedAt)}`);
  const selected = websiteRange(website, options.websiteDays);
  const first = website.firstRecordedAt;
  set(doc, "#website-range", `${dayLabel(selected.start)} – ${dayLabel(selected.end)} (UTC). Collection began ${timeLabel(first)}${first ? `, ${first.slice(0, 4)}` : ""}; earlier days are unavailable. Partial days are muted.`);
  set(doc, "#website-totals", `${fmt(selected.pageViews)} page views · ${fmt(selected.appStoreClicks)} App Store clicks across ${selected.daily.length} recorded days in this period.`);
  chart(doc, "#daily-chart", selected.daily, options.websiteMetric);
  rows(doc, "#daily-rows", [...selected.daily].reverse().map(row => [dayLabel(row.date), fmt(row.visitors), fmt(row.pageViews), fmt(row.appStoreClicks), row.partial ? "Partial day" : "Full day"]));
  doc.querySelector("#export-daily").disabled = !selected.daily.length;
  bars(doc, "#pages-breakdown", selected.pages.filter(row => row.pageViews > 0));
  bars(doc, "#referrers-breakdown", selected.referrers);
  rows(doc, "#campaign-rows", selected.campaigns.length ? selected.campaigns.map(row => [campaignLabels[row.label] || "Other approved campaign", fmt(row.pageViews), fmt(row.appStoreClicks)]) : [["No recorded events", "—", "—"]]);
  set(doc, "#website-source-status", `First-party counter · ${fresh ? "live" : "saved"} report checked ${timeLabel(website.generatedAt)}. Up to 90 UTC days, beginning ${dayLabel(first)}. Public marketing pages only; beta, feedback and dashboard pages are excluded. Do Not Track is respected.`);
}
function renderApple(snapshot, doc, options) {
  const apple = snapshot.apple;
  if (!apple) { badge(doc, "#apple-mode", "Unavailable", "stale"); return; }
  const freshness = snapshotFreshness(apple.throughDate, options.now);
  badge(doc, "#apple-mode", apple.status === "error" ? "Refresh failed" : freshness.label, apple.status === "error" ? "stale" : freshness.state);
  set(doc, "#first-time-downloads", fmt(apple.firstTimeDownloads)); set(doc, "#paid-unlocks", fmt(apple.netPaidUnlocks));
  set(doc, "#estimated-proceeds", Number.isFinite(apple.estimatedProceedsUsd) ? currencyFormat.format(apple.estimatedProceedsUsd) : "—"); set(doc, "#rating-count", fmt(apple.usRatingCount));
  set(doc, "#apple-window", `Reported totals since ${dayLabel(apple.startDate || "2026-08-12")} · latest received report: ${dayLabel(apple.throughDate)}.`);
  const missing = apple.missingDates?.length;
  set(doc, "#apple-coverage", `${apple.status === "error" ? "The latest refresh failed; these are the last saved totals. " : ""}${missing ? `${missing} daily reports were unavailable in the requested window. Totals include received reports only; missing days are not zero. ` : !apple.daily ? "Daily report history has not been published yet. " : ""}These are all reported app acquisitions, not downloads attributed to the website. Proceeds exclude non-USD currencies; ratings are US-only.`);
  const end = apple.requestedThroughDate || apple.throughDate;
  const start = end ? startDate(end, options.appleDays) : "";
  const data = (apple.daily || []).filter(row => row.date >= start && row.date <= end);
  chart(doc, "#apple-chart", data, "firstTimeDownloads");
  rows(doc, "#apple-rows", [...data].reverse().map(row => [dayLabel(row.date), row.firstTimeDownloads === null ? "Report unavailable" : fmt(row.firstTimeDownloads), fmt(row.netPaidUnlocks)]));
  const checked = apple.updatedAt || snapshot.generatedAt;
  set(doc, "#apple-updated", `Apple Sales & Trends + US catalog · last successful snapshot ${timeLabel(checked)}. Daily refresh scheduled at 17:15 UTC; actual runs and Apple availability may be later.`);
  set(doc, "#apple-source-status", `${freshness.label}${apple.status === "error" ? "; latest refresh failed" : ""}. Last successful snapshot ${timeLabel(checked)}. The button reloads the published Apple snapshot; it does not request a new Apple report.`);
}
function renderSocial(snapshot, doc, now) {
  const target = doc.querySelector("#social-rows");
  const output = (snapshot.social?.platforms || []).map(platform => {
    const row = element(doc, "tr"), cell = element(doc, "th"); cell.scope = "row";
    let url;
    try { url = new URL(platform.url); } catch { /* Render the name without a link. */ }
    if (url?.protocol === "https:" && ["www.facebook.com", "www.instagram.com", "x.com", "www.youtube.com"].includes(url.hostname)) {
      const link = element(doc, "a", `${platform.name} ↗`); link.href = url.href; link.target = "_blank"; link.rel = "noopener noreferrer"; cell.append(link);
    } else cell.textContent = platform.name;
    row.append(cell, element(doc, "td", fmt(platform.views)), element(doc, "td", dayLabel(platform.updatedAt)), element(doc, "td", socialFreshness(platform, now)));
    return row;
  });
  target.replaceChildren(...output);
}
export function renderDashboard(snapshot, doc = globalThis.document, now = Date.now(), options = {}) {
  const config = { websiteDays: 7, websiteMetric: "visitors", appleDays: 30, websiteLive: false, ...options, now };
  renderWebsite(snapshot, doc, config); renderApple(snapshot, doc, config); renderSocial(snapshot, doc, now);
  const status = doc.querySelector("#snapshot-status");
  status.textContent = `${config.websiteLive ? "Website counts refreshed" : "Website saved report"} · Apple ${dayLabel(snapshot.apple?.throughDate)}`;
  status.dataset.state = config.websiteLive ? "fresh" : "stale";
}
export async function readDashboardSources(fetchImpl = globalThis.fetch, previous = null, now = Date.now()) {
  const results = await Promise.allSettled([
    (async () => { const response = await fetchImpl(`data.json?ts=${now}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("Snapshot unavailable"); return response.json(); })(),
    fetchWebsiteMetrics(fetchImpl),
  ]);
  const saved = results[0].status === "fulfilled" ? results[0].value : previous;
  const websiteLive = results[1].status === "fulfilled";
  if (!saved && !websiteLive) throw new Error("Both reporting sources are unavailable");
  const snapshot = { ...(saved || {}), website: websiteLive ? results[1].value : saved?.website };
  return { snapshot, websiteLive, warnings: [results[0].status === "rejected" ? "The published Apple snapshot could not be loaded." : "", !websiteLive ? "Live website reporting is unavailable. Any website counts shown are from the dated saved report." : ""].filter(Boolean).join(" ") };
}
export async function loadDashboard(fetchImpl = globalThis.fetch, doc = globalThis.document, now = Date.now()) {
  const result = await readDashboardSources(fetchImpl, null, now);
  renderDashboard(result.snapshot, doc, now, { websiteLive: result.websiteLive });
  return result.snapshot;
}
if (typeof document !== "undefined") {
  let snapshot = null, websiteLive = false;
  const controls = () => ({ websiteDays: Number(document.querySelector("#website-period").value), websiteMetric: document.querySelector("#website-metric").value, appleDays: Number(document.querySelector("#apple-period").value), websiteLive });
  const render = () => { if (snapshot) renderDashboard(snapshot, document, Date.now(), controls()); };
  const button = document.querySelector("#refresh-dashboard");
  const run = async () => {
    button.disabled = true; button.textContent = "Checking…";
    try {
      const result = await readDashboardSources(fetch, snapshot);
      snapshot = result.snapshot; websiteLive = result.websiteLive; render();
      set(document, "#refresh-error", result.warnings);
    } catch {
      websiteLive = false; render();
      set(document, "#refresh-error", "Couldn’t reach either source. Previously loaded values, if any, retain their original dates.");
    } finally { button.disabled = false; button.textContent = "Check for updates"; }
  };
  button.addEventListener("click", run);
  let resizeTimer;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(render, 120); });
  for (const id of ["#website-period", "#website-metric", "#apple-period"]) document.querySelector(id).addEventListener("change", render);
  document.querySelector("#export-daily").addEventListener("click", () => {
    if (!snapshot?.website) return;
    const data = websiteRange(snapshot.website, controls().websiteDays);
    const url = URL.createObjectURL(new Blob([dailyCsv(data.daily)], { type: "text/csv;charset=utf-8" }));
    const link = element(document, "a"); link.href = url; link.download = `couples-alarm-website-${data.start}-${data.end}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  run();
}
