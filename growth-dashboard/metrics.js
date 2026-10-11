export const WEBSITE_ENDPOINT = "https://xqdqgsbkapvlskcldmpe.supabase.co/functions/v1/get-growth-metrics";
export const WEBSITE_PUBLIC_KEY = "sb_publishable_aHZQlUwb3hUVeyYyVi5wGg_IryIbCVH";
export const campaignLabels = {
  unattributed: "No campaign tag", owned_website: "Website default",
  paid_facebook_iphone: "Facebook ad", paid_instagram_iphone: "Instagram ad",
  paid_youtube_iphone: "YouTube ad", paid_tiktok_iphone: "TikTok ad",
};
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
    referrers: aggregate(website.referrers),
    pageViews: daily.reduce((sum, day) => sum + day.pageViews, 0),
    appStoreClicks: daily.reduce((sum, day) => sum + day.appStoreClicks, 0) };
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
  return data;
}
