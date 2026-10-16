export const WEBSITE_ENDPOINT = "https://xqdqgsbkapvlskcldmpe.supabase.co/functions/v1/get-growth-metrics";
export const META_ENDPOINT = "https://xqdqgsbkapvlskcldmpe.supabase.co/functions/v1/get-meta-metrics";
export const APPLE_ADS_ENDPOINT = "https://xqdqgsbkapvlskcldmpe.supabase.co/functions/v1/get-apple-ads-metrics";
export const BETA_ENDPOINT = "https://xqdqgsbkapvlskcldmpe.supabase.co/functions/v1/get-beta-metrics";
export const WEBSITE_PUBLIC_KEY = "sb_publishable_aHZQlUwb3hUVeyYyVi5wGg_IryIbCVH";
export const campaignLabels = {
  unattributed: "No campaign tag", owned_website: "Website default", tracking_qa: "Tagged website tests",
  paid_facebook_iphone: "Facebook ad", paid_instagram_iphone: "Instagram ad",
  paid_instagram_snooze_v14: "Instagram · Snooze War · Young V14",
  paid_ig_snooze_asian_v15: "Instagram · Snooze War · Asian V15",
  paid_ig_snooze_white_v15: "Instagram · Snooze War · Older White V15",
  paid_ig_snooze_black_v15: "Instagram · Snooze War · Black V15",
  paid_youtube_iphone: "YouTube ad", paid_tiktok_iphone: "TikTok ad",
};
export const snoozeCreatives = [
  { label: "Young couple", version: "V14", tag: "paid_instagram_snooze_v14" },
  { label: "Asian couple", version: "V15", tag: "paid_ig_snooze_asian_v15" },
  { label: "Older white couple", version: "V15", tag: "paid_ig_snooze_white_v15" },
  { label: "Black couple", version: "V15", tag: "paid_ig_snooze_black_v15" },
];
export function startDate(end, days) {
  return new Date(Date.parse(`${end}T00:00:00Z`) - (days - 1) * 86400000).toISOString().slice(0, 10);
}
export const deviceLabels = { apple_mobile: "Apple mobile hint", android: "Android hint", desktop: "Desktop hint", unknown: "Unknown" };
export function diagnosticRange(website, start, end) {
  const data = website.diagnostics;
  if (!data || data.version !== 1 || !Array.isArray(data.rows)) return null;
  const groups = new Map();
  for (const row of data.rows.filter(row => row.date >= start && row.date <= end)) {
    const key = row.campaign + ":" + row.deviceClass;
    const total = groups.get(key) || { campaign: row.campaign, deviceClass: row.deviceClass, pageViews: 0, appStoreVisible: 0, foreground10s: 0 };
    for (const field of ["pageViews", "appStoreVisible", "foreground10s"]) total[field] += row[field];
    groups.set(key, total);
  }
  return { firstRecordedAt: data.firstRecordedAt, rows: [...groups.values()].sort((a,b) => b.pageViews-a.pageViews || a.campaign.localeCompare(b.campaign) || a.deviceClass.localeCompare(b.deviceClass)) };
}
export function websiteRange(website, days = 7) {
  const end = website.generatedAt.slice(0, 10);
  const start = startDate(end, days);
  const inRange = row => row.date >= start && row.date <= end;
  const daily = website.daily.filter(inRange);
  const aggregate = rows => {
    const groups = new Map();
    for (const row of rows.filter(inRange)) {
      const total = groups.get(row.label) || { label: row.label, pageViews: 0, appStoreClicks: 0 };
      total.pageViews += row.pageViews;
      total.appStoreClicks += row.appStoreClicks || 0;
      groups.set(row.label, total);
    }
    return [...groups.values()].sort((a, b) => b.pageViews - a.pageViews || b.appStoreClicks - a.appStoreClicks || a.label.localeCompare(b.label));
  };
  return { start, end, daily, diagnostics: diagnosticRange(website, start, end), pages: aggregate(website.pages), campaigns: aggregate(website.campaigns),
    excluded: Array.isArray(website.excluded) ? aggregate(website.excluded) : null,
    referrers: aggregate(website.referrers),
    pageViews: daily.reduce((sum, day) => sum + day.pageViews, 0),
    appStoreClicks: daily.reduce((sum, day) => sum + day.appStoreClicks, 0) };
}
export function creativeComparison(selected) {
  return snoozeCreatives.map(creative => {
    const measured = selected?.campaigns.find(row => row.label === creative.tag);
    const excluded = selected?.excluded?.find(row => row.label === creative.tag);
    const available = selected?.daily.length > 0 && selected.end >= "2026-10-11";
    return { ...creative, pageViews: available ? measured?.pageViews || 0 : null,
      appStoreClicks: available ? measured?.appStoreClicks || 0 : null,
      excludedViews: selected?.excluded ? excluded?.pageViews || 0 : null,
      excludedClicks: selected?.excluded ? excluded?.appStoreClicks || 0 : null };
  });
}
export function appleRange(apple, days = 30) {
  const end = apple?.requestedThroughDate || apple?.throughDate;
  const requestedStart = end ? (days === "all" ? apple.startDate : startDate(end, days)) : null;
  const start = requestedStart && apple.startDate ? [requestedStart, apple.startDate].sort().at(-1) : requestedStart;
  const daily = (apple?.daily || []).filter(row => row.date >= start && row.date <= end);
  const received = daily.filter(row => Number.isFinite(row.firstTimeDownloads));
  const sum = metric => received.length && received.every(row => Number.isFinite(row[metric])) ? received.reduce((total, row) => total + row[metric], 0) : null;
  return { start, end, daily, received: received.length, missing: daily.length - received.length,
    firstTimeDownloads: sum("firstTimeDownloads"), netPaidUnlocks: sum("netPaidUnlocks"),
    estimatedProceedsUsd: sum("estimatedProceedsUsd") };
}
export function metaRange(meta, days = 7) {
  if (!Array.isArray(meta?.daily) || !Array.isArray(meta.ads) || !meta.throughDate) return null;
  const start = [startDate(meta.throughDate, days), meta.startDate].sort().at(-1);
  const daily = meta.daily.filter(row => row.date >= start && row.date <= meta.throughDate);
  const ads = snoozeCreatives.map(creative => {
    const delivery = meta.ads.find(row => row.tag === creative.tag);
    const measured = daily.filter(row => row.tag === creative.tag);
    const sum = field => delivery ? measured.reduce((total, row) => total + row[field], 0) : null;
    return { ...creative, status: delivery?.status || 'Unavailable', spend: sum('spend'),
      linkClicks: sum('linkClicks'), landingPageViews: sum('landingPageViews'), impressions: sum('impressions') };
  });
  const total = field => ads.every(ad => Number.isFinite(ad[field])) ? ads.reduce((sum, ad) => sum + ad[field], 0) : null;
  return { start, end: meta.throughDate, ads, spend: total('spend'), linkClicks: total('linkClicks'), landingPageViews: total('landingPageViews') };
}
export async function fetchMetaMetrics(fetchImpl = fetch) {
  const response = await fetchImpl(META_ENDPOINT, { headers: { apikey: WEBSITE_PUBLIC_KEY }, cache:'no-store', signal:AbortSignal.timeout(20000) });
  if (!response.ok) throw Error('Meta reporting unavailable');
  const data = await response.json();
  if (!['connected','not_connected','error'].includes(data.status)) throw Error('Invalid Meta report');
  if (data.status === 'connected' && (!Array.isArray(data.daily) || !Array.isArray(data.ads) || !Number.isFinite(Date.parse(data.updatedAt)))) throw Error('Invalid Meta report');
  return data;
}
export async function fetchAdditionalMetrics(endpoint, fetchImpl = fetch) {
  if (![APPLE_ADS_ENDPOINT,BETA_ENDPOINT].includes(endpoint)) throw Error('Unknown reporting source');
  const response = await fetchImpl(endpoint,{headers:{apikey:WEBSITE_PUBLIC_KEY},cache:'no-store',signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw Error('Reporting unavailable');
  const data = await response.json();
  if (!['connected','not_connected','error'].includes(data.status)) throw Error('Invalid report status');
  const validCount = value => Number.isSafeInteger(value) && value >= 0;
  const validTime = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
  if (endpoint === APPLE_ADS_ENDPOINT && data.totals) {
    if (data.campaignId !== 2144815187 || data.currency !== 'USD' || data.timezone !== 'UTC' || !validTime(data.updatedAt)
      || !validTime(data.startDate) || !validTime(data.throughDate) || data.startDate > data.throughDate
      || ![data.totals.impressions,data.totals.taps,data.totals.installs].every(validCount)
      || !Number.isFinite(data.totals.spend) || data.totals.spend < 0) throw Error('Invalid Apple Ads metrics');
  } else if (endpoint === APPLE_ADS_ENDPOINT && data.status === 'connected') throw Error('Missing Apple Ads metrics');
  if (endpoint === BETA_ENDPOINT) {
    for (const key of ['applications','membership']) {
      const part = data[key];
      if (!part || !['connected','not_connected','error'].includes(part.status)) throw Error('Invalid beta source');
      if (part.status !== 'connected') continue;
      const counts = key === 'applications' ? [part.total] : [part.members,part.owners,part.nonOwnerMembers];
      if (!validTime(part.updatedAt) || !counts.every(validCount) || (key === 'membership' && part.members !== part.owners + part.nonOwnerMembers)) throw Error('Invalid beta counts');
    }
  }
  return data;
}
// Failed reads retain the newest actual evidence without advancing its timestamp.
export function retainReport(incoming, ...fallbacks) {
  const candidates = [incoming,...fallbacks].filter(report => report && Number.isFinite(Date.parse(report.updatedAt)));
  const latest = candidates.sort((a,b) => Date.parse(b.updatedAt)-Date.parse(a.updatedAt))[0];
  return latest ? {...latest,status:incoming?.status || 'error'} : incoming || {status:'error'};
}
export function appleAdsCostPerInstall(report) {
  const totals = report?.totals;
  return Number.isFinite(totals?.spend) && totals.installs > 0 ? totals.spend / totals.installs : null;
}
export function dailyCsv(rows) {
  return "Date (UTC),Estimated visitors,Page views,App Store outbound clicks,Coverage\r\n" + rows.map(row =>
    [row.date, row.visitors, row.pageViews, row.appStoreClicks, row.partial ? "Partial day" : "Full day"].join(",")).join("\r\n") + "\r\n";
}
export async function fetchWebsiteMetrics(fetchImpl = fetch) {
  const response = await fetchImpl(WEBSITE_ENDPOINT, {
    headers: { apikey: WEBSITE_PUBLIC_KEY }, cache: "no-store", signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Website reporting request failed (${response.status})`);
  const data = await response.json();
  if (data.schemaVersion !== 1 || data.timezone !== "UTC" || !Array.isArray(data.daily) || !Number.isFinite(Date.parse(data.generatedAt))) throw new Error("Invalid website report");
  const validDay = row => typeof row.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.date);
  const count = value => Number.isSafeInteger(value) && value >= 0;
  if (data.daily.length > 90 || !data.daily.every(row => validDay(row) && [row.visitors, row.pageViews, row.appStoreClicks].every(count))) throw new Error("Invalid daily counts");
  for (const key of ["pages", "campaigns", "referrers", ...(data.excluded === undefined ? [] : ["excluded"])]) {
    if (!Array.isArray(data[key]) || !data[key].every(row => validDay(row) && typeof row.label === "string" && count(row.pageViews) && (key === "referrers" || count(row.appStoreClicks)))) throw new Error("Invalid grouped counts");
  }
  if (data.diagnostics !== undefined) {
    const d = data.diagnostics;
    if (!d || d.version !== 1 || !Array.isArray(d.rows) || d.rows.length > 3960 ||
        (d.firstRecordedAt !== null && !Number.isFinite(Date.parse(d.firstRecordedAt))) ||
        !d.rows.every(row => validDay(row) && Object.hasOwn(deviceLabels, row.deviceClass) &&
          Object.hasOwn(campaignLabels, row.campaign) && row.campaign !== "tracking_qa" &&
          [row.pageViews, row.appStoreVisible, row.foreground10s].every(count))) throw Error("Invalid diagnostics");
  }
  return data;
}
