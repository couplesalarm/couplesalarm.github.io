export const WEBSITE_ENDPOINT = "https://xqdqgsbkapvlskcldmpe.supabase.co/functions/v1/get-growth-metrics";
export const META_ENDPOINT = "https://xqdqgsbkapvlskcldmpe.supabase.co/functions/v1/get-meta-metrics";
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
  return { start, end, daily, pages: aggregate(website.pages), campaigns: aggregate(website.campaigns),
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
  return data;
}
