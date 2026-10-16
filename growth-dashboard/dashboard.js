import { APPLE_ADS_ENDPOINT, BETA_ENDPOINT, appleAdsCostPerInstall, appleRange, campaignLabels, deviceLabels, creativeComparison, dailyCsv, fetchAdditionalMetrics, fetchMetaMetrics, fetchWebsiteMetrics, metaRange, retainReport, snoozeCreatives, startDate, websiteRange } from "./metrics.js?v=20261016-diagnostics-1";
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
export function metaAccessNotice(meta, now = Date.now()) {
  const expiry = Date.parse(meta?.accessExpiresAt || '');
  if (!Number.isFinite(expiry)) return { message: '', needsRenewal: false };
  const needsRenewal = expiry - now <= 7 * 86400000;
  const message = expiry <= now ? 'Meta reporting access has expired. Renew the read-only connection to resume updates.'
    : `Read-only reporting access expires ${dayLabel(meta.accessExpiresAt)}.${needsRenewal ? ' Renew the connection this week to keep updates running.' : ' Renewal will be needed before that date.'}`;
  return { message, needsRenewal };
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
function renderCreatives(selected, doc) {
  set(doc, "#creative-window", selected ? `${dayLabel(selected.start)} – ${dayLabel(selected.end)} (UTC). This period also controls the website charts and tables below.` : "Website comparison is unavailable until a report loads.");
  const cards = creativeComparison(selected).map(creative => {
    const card = element(doc, "article", undefined, "creative-card");
    card.append(element(doc, "h3", creative.label), element(doc, "p", creative.version, "creative-version"));
    const counts = element(doc, "div", undefined, "creative-counts");
    for (const [value, label] of [[creative.pageViews, "Page views"], [creative.appStoreClicks, "App Store outbound clicks"]]) {
      const count = element(doc, "div", undefined, "creative-count");
      count.append(element(doc, "strong", fmt(value)), element(doc, "span", label)); counts.append(count);
    }
    card.append(counts, element(doc, "p", creative.excludedViews === null ? "Test separation unavailable in this report." : `Tests excluded: ${fmt(creative.excludedViews)} ${creative.excludedViews === 1 ? "view" : "views"} · ${fmt(creative.excludedClicks)} ${creative.excludedClicks === 1 ? "click" : "clicks"}`, "creative-tests"));
    return card;
  });
  doc.querySelector("#creative-comparison").replaceChildren(...cards);
}
function renderWebsite(snapshot, doc, options) {
  const website = snapshot.website;
  if (!website) {
    renderCreatives(null, doc);
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
  renderCreatives(selected, doc);
  const diagnostics = selected.diagnostics;
  const measuredViews = diagnostics?.rows.reduce((sum, row) => sum + row.pageViews, 0);
  set(doc, "#diagnostic-coverage", diagnostics ?
    `First diagnostic receipt: ${diagnostics.firstRecordedAt ? timeLabel(diagnostics.firstRecordedAt) : "not yet received"}. Selected period: ${fmt(measuredViews)} page views with diagnostics; ${fmt(Math.max(0, selected.pageViews - measuredViews))} older or unsupported page views unmeasured. QA excluded.` :
    "Diagnostics unavailable in this saved report. Earlier visits were not measured.");
  rows(doc, "#diagnostic-rows", diagnostics?.rows.length ? diagnostics.rows.map(row =>
    [campaignLabels[row.campaign], deviceLabels[row.deviceClass], fmt(row.pageViews), fmt(row.appStoreVisible), fmt(row.foreground10s)]) :
    [[diagnostics ? "No measured events in this period" : "Diagnostics unavailable", "—", "—", "—", "—"]]);
  const first = website.firstRecordedAt;
  set(doc, "#website-range", `${dayLabel(selected.start)} – ${dayLabel(selected.end)} (UTC). Collection began ${timeLabel(first)}${first ? `, ${first.slice(0, 4)}` : ""}; earlier days are unavailable. Partial days are muted.`);
  set(doc, "#website-totals", `${fmt(selected.pageViews)} page views · ${fmt(selected.appStoreClicks)} App Store outbound clicks across ${selected.daily.length} recorded ${selected.daily.length === 1 ? "day" : "days"} in this period.`);
  const excluded = selected.excluded;
  set(doc, "#qa-summary", excluded ? `${fmt(excluded.reduce((total, row) => total + row.pageViews + row.appStoreClicks, 0))} test events excluded in this period · view details` : "Test separation unavailable in this saved report");
  rows(doc, "#qa-rows", excluded?.length ? excluded.map(row => [campaignLabels[row.label] || "Other approved test", fmt(row.pageViews), fmt(row.appStoreClicks)]) : [[excluded ? "No confirmed test events in this period" : "Exclusion details unavailable", "—", "—"]]);
  chart(doc, "#daily-chart", selected.daily, options.websiteMetric);
  rows(doc, "#daily-rows", [...selected.daily].reverse().map(row => [dayLabel(row.date), fmt(row.visitors), fmt(row.pageViews), fmt(row.appStoreClicks), row.partial ? "Partial day" : "Full day"]));
  doc.querySelector("#export-daily").disabled = !selected.daily.length;
  bars(doc, "#pages-breakdown", selected.pages.filter(row => row.pageViews > 0));
  bars(doc, "#referrers-breakdown", selected.referrers);
  const otherCampaigns = selected.campaigns.filter(row => !snoozeCreatives.some(creative => creative.tag === row.label));
  rows(doc, "#campaign-rows", otherCampaigns.length ? otherCampaigns.map(row => [campaignLabels[row.label] || "Other approved campaign", fmt(row.pageViews), fmt(row.appStoreClicks)]) : [["No other recorded events", "—", "—"]]);
  set(doc, "#website-source-status", `First-party counter · ${fresh ? "live" : "saved"} report checked ${timeLabel(website.generatedAt)}. Up to 90 UTC days, beginning ${dayLabel(first)}. Public marketing pages only; beta, feedback and dashboard pages are excluded. Do Not Track is respected.`);
}
function renderApple(snapshot, doc, options) {
  const apple = snapshot.apple;
  if (!apple) {
    badge(doc, "#apple-mode", "Unavailable", "stale");
    set(doc, "#apple-window", "Apple reporting could not be loaded.");
    set(doc, "#apple-source-status", "Published Apple snapshot unavailable. Try Check for updates.");
    return;
  }
  const freshness = snapshotFreshness(apple.throughDate, options.now);
  badge(doc, "#apple-mode", apple.status === "error" ? "Refresh failed" : freshness.label, apple.status === "error" ? "stale" : freshness.state);
  const selected = appleRange(apple, options.appleDays);
  set(doc, "#first-time-downloads", fmt(selected.firstTimeDownloads)); set(doc, "#paid-unlocks", fmt(selected.netPaidUnlocks));
  set(doc, "#estimated-proceeds", Number.isFinite(selected.estimatedProceedsUsd) ? currencyFormat.format(selected.estimatedProceedsUsd) : "—"); set(doc, "#rating-count", fmt(apple.usRatingCount));
  set(doc, "#apple-window", `${dayLabel(selected.start)} – ${dayLabel(selected.end)} · latest received report: ${dayLabel(apple.throughDate)}.`);
  set(doc, "#apple-coverage", `${apple.status === "error" ? "The latest refresh failed; these are saved values. " : ""}${selected.received} daily reports received; ${selected.missing} unavailable in this period. Missing reports are not zero. Downloads include all sources, not just our ads. Proceeds exclude non-USD currencies; US ratings are the current catalog total, independent of the period.`);
  set(doc, "#apple-lifetime", `Since launch: ${fmt(apple.firstTimeDownloads)} reported first-time downloads · ${fmt(apple.netPaidUnlocks)} net paid unlocks. These are different outcomes.`);
  chart(doc, "#apple-chart", selected.daily, "firstTimeDownloads");
  rows(doc, "#apple-rows", [...selected.daily].reverse().map(row => [dayLabel(row.date), row.firstTimeDownloads === null ? "Report unavailable" : fmt(row.firstTimeDownloads), fmt(row.netPaidUnlocks)]));
  const checked = apple.updatedAt || snapshot.generatedAt;
  set(doc, "#apple-updated", `Apple Sales & Trends API + US catalog API · last successful import ${timeLabel(checked)}. Automatic daily collection at 17:15 UTC; Apple publishes daily reports the following day.`);
  set(doc, "#apple-source-status", `${freshness.label}${apple.status === "error" ? "; latest API import failed" : ""}. Automatic Apple API import checked ${timeLabel(checked)}. This page reloads the latest imported report; Apple does not provide an instant install counter.`);
}
function renderMeta(snapshot, doc, options) {
  const meta = snapshot.meta;
  const selected = metaRange(meta, options.websiteDays);
  const fresh = meta?.status === 'connected' && options.now - Date.parse(meta.updatedAt) < 15 * 60 * 1000;
  badge(doc, '#meta-mode', fresh ? 'API connected' : selected ? 'Saved API report' : meta?.status === 'not_connected' ? 'Connection needed' : 'Unavailable', fresh ? 'fresh' : 'stale');
  doc.querySelector('#meta-results').hidden = !selected;
  const message = selected ? `${fresh ? 'Read automatically from Meta' : 'Meta could not refresh; showing the last successful report'} · ${timeLabel(meta.updatedAt)}. ${dayLabel(selected.start)} – ${dayLabel(selected.end)} · ${meta.timezone}.` : meta?.status === 'not_connected' ? 'The reporting API is ready, but Meta account authorization is still required. No spend or click totals are assumed.' : 'The Meta reporting API could not be reached. Website and Apple reporting continue independently.';
  set(doc, '#meta-updated', message); set(doc, '#meta-source-status', message);
  const access = metaAccessNotice(meta, options.now);
  set(doc, '#meta-access', access.message);
  doc.querySelector('#meta-access').className = access.needsRenewal ? 'note error' : 'note';
  if (!selected) return;
  const money = value => Number.isFinite(value) ? new Intl.NumberFormat('en-US', {style:'currency',currency:meta.currency}).format(value) : '—';
  set(doc, '#meta-spend', money(selected.spend)); set(doc, '#meta-clicks', fmt(selected.linkClicks)); set(doc, '#meta-landing', fmt(selected.landingPageViews));
  rows(doc, '#meta-rows', selected.ads.map(ad => [ad.label, ad.status.replaceAll('_',' ').toLowerCase(), money(ad.spend), fmt(ad.linkClicks), fmt(ad.landingPageViews)]));
  set(doc, '#meta-delivery-note', selected.ads.every(ad => ad.impressions === 0) ? 'No delivery results have been reported for this period yet. “Active” means the ad is enabled; it does not confirm impressions.' : 'Delivery and results are reported by Meta and may be delayed.');
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
export function sourceFreshness(report, now = Date.now()) {
  const age = now - Date.parse(report?.updatedAt);
  if (!Number.isFinite(age)) return {label:'Connection needed',state:'stale',live:false};
  if (report.mode === 'api' && report.status === 'connected' && age >= -60000 && age < 15*60000) return {label:'API connected',state:'fresh',live:true};
  if (report.mode === 'manual') return {label:age > 86400000 ? 'Saved check · stale' : 'Verified snapshot',state:'stale',live:false};
  return {label:'Saved API report',state:'stale',live:false};
}
function renderAppleAds(snapshot, doc, options) {
  const report = snapshot.appleAds, freshness = sourceFreshness(report,options.now), totals = report?.totals;
  badge(doc,'#apple-ads-mode',freshness.label,freshness.state);
  set(doc,'#apple-ads-spend',Number.isFinite(totals?.spend) ? currencyFormat.format(totals.spend) : '—');
  set(doc,'#apple-ads-impressions',fmt(totals?.impressions)); set(doc,'#apple-ads-taps',fmt(totals?.taps)); set(doc,'#apple-ads-installs',fmt(totals?.installs));
  set(doc,'#apple-ads-window',totals ? `US Search Results · ${dayLabel(report.startDate)} – ${dayLabel(report.throughDate)} (UTC) · ${String(report.campaignStatus || 'Unknown').replaceAll('_',' ').toLowerCase()} when checked.` : 'US Search Results · a report is not available yet.');
  set(doc,'#apple-ads-new-downloads',fmt(totals?.newDownloads)); set(doc,'#apple-ads-redownloads',fmt(totals?.redownloads));
  const cpi = appleAdsCostPerInstall(report);
  set(doc,'#apple-ads-result',cpi !== null ? `${currencyFormat.format(cpi)} per attributed install · spend ÷ installs. ${totals.installs < 20 ? 'Small sample; too early to judge reliable acquisition cost.' : ''}` : totals ? 'Cost per install is unavailable until Apple reports an install.' : 'Missing reporting data is not zero spend or zero installs.');
  const message = freshness.live ? `Apple Ads API · last successful read ${timeLabel(report.updatedAt)}.`
    : report?.mode === 'manual' ? `Verified in Apple Ads ${report.source?.checkedFrom ? `${timeLabel(report.source.checkedFrom)} – ${timeLabel(report.source.checkedThrough)}` : timeLabel(report.updatedAt)}. Saved check; automatic Apple Ads access is not connected.`
    : report?.updatedAt ? `Apple Ads API could not refresh. Last successful read ${timeLabel(report.updatedAt)}.` : 'Apple Ads API access is not connected. No results are assumed.';
  set(doc,'#apple-ads-updated',message); set(doc,'#apple-ads-source-status',message);
}
function renderBeta(snapshot, doc, options) {
  const membership = snapshot.beta?.membership, applications = snapshot.beta?.applications;
  const groupFresh = sourceFreshness(membership,options.now), applicationsFresh = sourceFreshness(applications,options.now);
  const live = groupFresh.live && applicationsFresh.live;
  badge(doc,'#beta-mode',live ? 'API connected' : applicationsFresh.live ? membership?.updatedAt ? 'Applications live · group saved' : 'Applications live · group unavailable' : 'Saved checks / access needed',live ? 'fresh' : 'stale');
  set(doc,'#beta-members',fmt(membership?.nonOwnerMembers)); set(doc,'#beta-group-total',fmt(membership?.members)); set(doc,'#beta-applications',fmt(applications?.total));
  const groupMessage = groupFresh.live ? `Google Groups API bridge · checked ${timeLabel(membership.updatedAt)}. ${fmt(membership.owners)} owner(s) excluded from the signup count.`
    : membership?.updatedAt ? `${membership.mode === 'manual' ? 'Google Groups · saved browser check' : 'Google Groups · saved API report'} ${timeLabel(membership.updatedAt)}. ${fmt(membership.owners)} owner(s) excluded; automatic updates ${membership.mode === 'manual' ? 'not connected' : 'unavailable'}.` : 'Google Group membership is unavailable. This does not mean zero signups.';
  const applicationMessage = applicationsFresh.live ? `Legacy website applications · live database count · ${timeLabel(applications.updatedAt)}.`
    : applications?.updatedAt ? `Legacy website applications · saved count from ${timeLabel(applications.updatedAt)}; refresh unavailable.` : 'Legacy website application count is unavailable.';
  set(doc,'#beta-membership-updated',groupMessage); set(doc,'#beta-membership-source-status',groupMessage);
  set(doc,'#beta-applications-updated',applicationMessage); set(doc,'#beta-applications-source-status',applicationMessage);
  set(doc,'#beta-pending',Number.isFinite(membership?.pendingMembers) ? `${fmt(membership.pendingMembers)} pending members at the saved check. Pending membership is not an enrolled tester.` : 'Pending membership requests are not available through this reporting connection.');
}
export function renderDashboard(snapshot, doc = globalThis.document, now = Date.now(), options = {}) {
  const config = { websiteDays: 7, websiteMetric: "visitors", appleDays: 30, websiteLive: false, ...options, now };
  renderWebsite(snapshot, doc, config); renderApple(snapshot, doc, config); renderMeta(snapshot, doc, config); renderAppleAds(snapshot, doc, config); renderBeta(snapshot, doc, config); renderSocial(snapshot, doc, now);
  const status = doc.querySelector("#snapshot-status");
  const websiteFresh = config.websiteLive && now - Date.parse(snapshot.website?.generatedAt) < 3600000;
  status.textContent = `${websiteFresh ? "Website counts refreshed" : snapshot.website ? "Website saved report" : "Website unavailable"} · Apple through ${dayLabel(snapshot.apple?.throughDate)}`;
  status.dataset.state = websiteFresh ? "fresh" : "stale";
}
export async function readDashboardSources(fetchImpl = globalThis.fetch, previous = null, now = Date.now()) {
  const results = await Promise.allSettled([
    (async () => { const response = await fetchImpl(`data.json?ts=${now}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("Snapshot unavailable"); return response.json(); })(),
    fetchWebsiteMetrics(fetchImpl),
    fetchMetaMetrics(fetchImpl),
    fetchAdditionalMetrics(APPLE_ADS_ENDPOINT,fetchImpl),
    fetchAdditionalMetrics(BETA_ENDPOINT,fetchImpl),
  ]);
  const saved = results[0].status === "fulfilled" ? results[0].value : previous;
  const websiteLive = results[1].status === "fulfilled";
  if (!saved && !websiteLive && !results[2].value?.daily && !results[3].value?.totals && !results[4].value?.applications?.updatedAt && !results[4].value?.membership?.updatedAt) throw new Error("Reporting sources are unavailable");
  const meta = results[2].status === 'fulfilled' ? results[2].value : { ...(previous?.meta || {}), status:'error' };
  const incomingAds = results[3].status === 'fulfilled' ? results[3].value : null;
  const incomingBeta = results[4].status === 'fulfilled' ? results[4].value : null;
  const appleAds = retainReport(incomingAds,previous?.appleAds,saved?.appleAds);
  const beta = Object.fromEntries(['applications','membership'].map(key => [key,retainReport(incomingBeta?.[key],previous?.beta?.[key],saved?.beta?.[key])]));
  const snapshot = { ...(saved || {}), website: websiteLive ? results[1].value : saved?.website, meta, appleAds, beta };
  return { snapshot, websiteLive, warnings: [results[0].status === "rejected" ? "The published Apple snapshot could not be loaded." : "", !websiteLive ? "Live website reporting is unavailable. Any website counts shown are from the dated saved report." : ""].filter(Boolean).join(" ") };
}
export async function loadDashboard(fetchImpl = globalThis.fetch, doc = globalThis.document, now = Date.now()) {
  const result = await readDashboardSources(fetchImpl, null, now);
  renderDashboard(result.snapshot, doc, now, { websiteLive: result.websiteLive });
  return result.snapshot;
}
if (typeof document !== "undefined") {
  let snapshot = null, websiteLive = false;
  const controls = () => ({ websiteDays: Number(document.querySelector("#website-period").value), websiteMetric: document.querySelector("#website-metric").value, appleDays: document.querySelector("#apple-period").value === "all" ? "all" : Number(document.querySelector("#apple-period").value), websiteLive });
  const render = () => { if (snapshot) renderDashboard(snapshot, document, Date.now(), controls()); };
  const button = document.querySelector("#refresh-dashboard");
  const run = async () => {
    if (button.disabled) return;
    button.disabled = true; button.textContent = "Checking…";
    try {
      const result = await readDashboardSources(fetch, snapshot);
      snapshot = result.snapshot; websiteLive = result.websiteLive; render();
      set(document, "#refresh-error", result.warnings);
    } catch {
      websiteLive = false; render();
      set(document, "#refresh-error", "Couldn’t refresh reporting sources. Previously loaded values, if any, retain their original dates.");
    } finally { button.disabled = false; button.textContent = "Check for updates"; }
  };
  button.addEventListener("click", run);
  setInterval(() => { if (!document.hidden) run(); }, 5 * 60 * 1000);
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
