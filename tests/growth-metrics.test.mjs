import assert from "node:assert/strict";
import test from "node:test";
import { publicMetrics, handleRequest } from "../supabase/functions/get-growth-metrics/index.ts";
import { appleRange, creativeComparison, dailyCsv, fetchWebsiteMetrics, websiteRange } from "../growth-dashboard/metrics.js";
import { readDashboardSources, socialFreshness } from "../growth-dashboard/dashboard.js";
const report = {
  schemaVersion: 1, timezone: "UTC", generatedAt: "2026-10-11T18:00:00Z", firstRecordedAt: "2026-10-10T05:14:53Z",
  daily: [
    { date: "2026-10-10", visitors: 2, visitorsWhoClicked: 1, pageViews: 3, appStoreClicks: 2, partial: true },
    { date: "2026-10-11", visitors: 3, visitorsWhoClicked: 1, pageViews: 4, appStoreClicks: 1, partial: true },
  ],
  pages: [{ date: "2026-10-10", label: "/", pageViews: 3, appStoreClicks: 2 }, { date: "2026-10-11", label: "/", pageViews: 4, appStoreClicks: 1 }],
  campaigns: [{ date: "2026-10-10", label: "unattributed", pageViews: 3, appStoreClicks: 2 }, { date: "2026-10-11", label: "paid_tiktok_iphone", pageViews: 4, appStoreClicks: 1 }],
  referrers: [{ date: "2026-10-10", label: "Direct / unknown", pageViews: 3 }, { date: "2026-10-11", label: "TikTok", pageViews: 4 }],
};
const environment = { SUPABASE_URL: "https://example.test", SUPABASE_PUBLISHABLE_KEYS: '{"default":"public-test-key"}', SUPABASE_SECRET_KEYS: '{"default":"server-test-key"}' };
const env = key => environment[key];
const request = (headers = {}, method = "GET") => new Request("https://example.test/metrics", { method, headers: { origin: "https://couplesalarm.com", apikey: "public-test-key", ...headers } });
test("SEO guides keep distinct page labels through public reporting", () => {
  const data = structuredClone(report);
  data.pages = ["/wake-up-without-waking-partner/", "/best-alarm-apps-for-couples/", "/alarm-tone-only-one-person-hears/"].map(label => ({ date: "2026-10-11", label, pageViews: 1, appStoreClicks: 1 }));
  const selected = websiteRange(publicMetrics(data), 1);
  assert.deepEqual(selected.pages.map(row => row.label).sort(), data.pages.map(row => row.label).sort());
  assert.ok(selected.pages.every(row => row.pageViews === 1 && row.appStoreClicks === 1));
});
test("projects only aggregate allowlisted fields", () => {
  const data = structuredClone(report); data.rawEvents = [{ visitor_hash: "sensitive" }]; data.daily[0].visitor_hash = "sensitive";
  assert.doesNotMatch(JSON.stringify(publicMetrics(data)), /sensitive|visitor_hash|rawEvents/);
  data.pages[0].label = "/private-email@example.com";
  assert.throws(() => publicMetrics(data), /Invalid label/);
  const invalid = structuredClone(report); invalid.daily[0].visitors = null;
  assert.throws(() => publicMetrics(invalid), /Invalid count/);
});
test("GET reports check key and origin; mutations and invalid callers never query the database", async () => {
  let called = 0; const fetchImpl = async () => { called++; throw Error("must not query"); };
  assert.equal((await handleRequest(request({ apikey: "bad" }), env, fetchImpl)).status, 401);
  assert.equal((await handleRequest(request({ origin: "https://evil.test" }), env, fetchImpl)).status, 403);
  assert.equal((await handleRequest(request({}, "POST"), env, fetchImpl)).status, 405);
  assert.equal(called, 0);
});
test("valid report uses the server role only on the fixed RPC and returns aggregate data", async () => {
  const response = await handleRequest(request(), env, async (url, options) => {
    assert.equal(url, "https://example.test/rest/v1/rpc/couples_alarm_growth_metrics");
    assert.equal(options.headers.apikey, "server-test-key"); assert.equal(options.body, "{}");
    return { ok: true, json: async () => report };
  });
  assert.equal(response.status, 200); const body = await response.json();
  assert.equal(body.daily.length, 2); assert.doesNotMatch(JSON.stringify(body), /server-test-key/);
  assert.equal((await handleRequest(request(), env, async () => ({ ok: false }))).status, 503);
});
test("empty collection stays empty; daily range, grouped totals, and CSV use identical coverage", () => {
  const selected = websiteRange(report, 7);
  assert.equal(selected.start, "2026-10-05"); assert.equal(selected.daily.length, 2);
  assert.equal(selected.pageViews, 7); assert.equal(selected.appStoreClicks, 3);
  assert.equal(selected.pages[0].pageViews, 7);
  assert.equal(selected.campaigns.reduce((sum, row) => sum + row.pageViews, 0), 7);
  const today = websiteRange(report, 1);
  assert.equal(today.daily.length, 1); assert.equal(today.pages[0].pageViews, 4); assert.equal(today.campaigns.length, 1);
  assert.match(dailyCsv(today.daily), /2026-10-11,3,4,1,Partial day/);
  assert.doesNotMatch(dailyCsv(today.daily), /2026-10-10/);
  assert.equal(websiteRange({ ...report, daily: [], pages: [], campaigns: [], referrers: [] }).daily.length, 0);
  assert.equal(selected.visitors, undefined, "daily unique estimates must not become period unique people");
});
test("a live source failure falls back with its old timestamp; website works if the snapshot fails", async () => {
  const saved = { apple: { throughDate: "2026-10-09" }, website: report };
  const result = await readDashboardSources(async url => {
    if (url.startsWith("data.json")) return { ok: true, json: async () => saved };
    throw Error("unavailable");
  });
  assert.equal(result.websiteLive, false); assert.equal(result.snapshot.website.generatedAt, report.generatedAt); assert.match(result.warnings, /dated saved report/);
  const live = await readDashboardSources(async url => {
    if (url.startsWith("data.json")) throw Error("snapshot unavailable");
    return { ok: true, json: async () => report };
  });
  assert.equal(live.websiteLive, true); assert.equal(live.snapshot.website.daily.length, 2); assert.match(live.warnings, /Apple snapshot/);
});
test("social failures and old counts never appear freshly checked", () => {
  assert.match(socialFreshness({ mode: "automatic", updatedAt: "2026-08-24" }, Date.parse("2026-10-11")), /^Stale/);
  assert.match(socialFreshness({ status: "error", updatedAt: "2026-10-11" }), /^Refresh failed/);
});


test("V14 reports remain distinct from earlier Instagram campaigns", () => {
  const data = structuredClone(report);
  data.campaigns = [
    { date: "2026-10-11", label: "paid_instagram_iphone", pageViews: 3, appStoreClicks: 2 },
    { date: "2026-10-11", label: "paid_instagram_snooze_v14", pageViews: 4, appStoreClicks: 1 },
  ];
  const selected = websiteRange(publicMetrics(data), 7);
  assert.equal(selected.campaigns.length, 2);
  assert.equal(selected.campaigns.find(row => row.label === "paid_instagram_snooze_v14").appStoreClicks, 1);
});

test("confirmed test counts stay separate and follow the selected period", () => {
  const data = structuredClone(report);
  data.excluded = [
    { date: "2026-10-10", label: "tracking_qa", pageViews: 2, appStoreClicks: 1, rawEventId: "private" },
    { date: "2026-10-11", label: "paid_instagram_snooze_v14", pageViews: 3, appStoreClicks: 1 },
  ];
  const projected = publicMetrics(data);
  assert.doesNotMatch(JSON.stringify(projected), /rawEventId|private/);
  const today = websiteRange(projected, 1);
  assert.equal(today.excluded.length, 1);
  assert.equal(today.pageViews, 4, "excluded counts must not be added back");
  const compared = creativeComparison(today);
  assert.equal(compared.length, 4, "every video remains visible, even without events");
  assert.equal(compared[0].excludedViews, 3);
  assert.equal(compared[0].excludedClicks, 1);
  assert.equal(compared[1].pageViews, 0);
  assert.equal(creativeComparison(null)[0].pageViews, null, "unavailable is not zero");
  assert.equal(creativeComparison(websiteRange(report, 1))[0].excludedViews, null, "legacy report has unknown exclusions");
});

test("Apple period totals use the same received days as the chart and preserve missing reports", () => {
  const apple = { startDate: "2026-10-01", throughDate: "2026-10-10", requestedThroughDate: "2026-10-10", daily: [
    { date: "2026-10-01", firstTimeDownloads: 10, netPaidUnlocks: 2, estimatedProceedsUsd: 14 },
    { date: "2026-10-04", firstTimeDownloads: null, netPaidUnlocks: null, estimatedProceedsUsd: null },
    { date: "2026-10-10", firstTimeDownloads: 0, netPaidUnlocks: -1, estimatedProceedsUsd: -7 },
  ] };
  const week = appleRange(apple, 7);
  assert.equal(week.start, "2026-10-04");
  assert.equal(week.firstTimeDownloads, 0);
  assert.equal(week.netPaidUnlocks, -1);
  assert.equal(week.estimatedProceedsUsd, -7);
  assert.equal(week.missing, 1);
  assert.equal(appleRange(apple, "all").firstTimeDownloads, 10);
  assert.equal(appleRange(apple, 90).start, "2026-10-01", "do not imply coverage before launch");
  assert.equal(appleRange({ ...apple, daily: [apple.daily[1]] }, 7).firstTimeDownloads, null);
});

test("malformed live groups fall back without breaking the entire dashboard", async () => {
  const invalid = { ...report, campaigns: null };
  await assert.rejects(fetchWebsiteMetrics(async () => ({ ok: true, json: async () => invalid })), /Invalid grouped/);
  const result = await readDashboardSources(async url => ({ ok: true, json: async () => url.startsWith("data.json") ? { website: report } : invalid }));
  assert.equal(result.websiteLive, false);
  assert.equal(result.snapshot.website.generatedAt, report.generatedAt);
});
