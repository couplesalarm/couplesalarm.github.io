import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { generateKeyPairSync } from "node:crypto";
import { gzipSync } from "node:zlib";
import { snapshotFreshness } from "../growth-dashboard/dashboard.js";
import {
  parseSalesTsv,
  parseXViews,
  parseYouTubeViews,
  reportDates,
  summarizeSalesRows,
  refreshApple,
} from "../scripts/refresh-growth-dashboard.mjs";

const html = await readFile(new URL("../growth-dashboard/index.html", import.meta.url), "utf8");
const client = await readFile(new URL("../growth-dashboard/dashboard.js", import.meta.url), "utf8");
const workflow = await readFile(new URL("../.github/workflows/refresh-growth-dashboard.yml", import.meta.url), "utf8");
const snapshot = JSON.parse(await readFile(new URL("../growth-dashboard/data.json", import.meta.url), "utf8"));

test("loads a cache-busted snapshot and exposes an accessible refresh action", () => {
  assert.match(html, /id="refresh-dashboard"[^>]*>Check for updates<\/button>/);
  assert.match(html, /connect-src 'self'/);
  assert.match(client, /data\.json\?ts=/);
  assert.match(client, /cache: "no-store"/);
  assert.doesNotMatch(html, /data-data-analytics-portable-artifact|connect-src 'none'/);
  assert.ok([1, 2].includes(snapshot.schemaVersion));
});

test("flags old published snapshots", () => {
  const throughDate = "2026-08-13";
  assert.equal(snapshotFreshness(throughDate, Date.parse("2026-08-14T12:00:00Z")).state, "fresh");
  assert.deepEqual(snapshotFreshness(throughDate, Date.parse("2026-08-15T12:00:00Z")), {
    state: "stale",
    label: "Apple data 2 days behind",
  });
});

test("aggregates only first app units and paid lifetime unlocks", () => {
  const tsv = [
    "SKU\tProduct Type Identifier\tUnits\tDeveloper Proceeds\tCustomer Price\tCurrency of Proceeds\tApple Identifier\tEnd Date",
    "couples-alarm\t1F\t3\t0\t0\tUSD\t6792771975\t08/14/2026",
    "com.couplesclock.app.fullaccess\tIA1\t1\t7\t9.99\tUSD\t7000000001\t08/14/2026",
    "com.couplesclock.app.fullaccess\tIA3\t1\t0\t0\tUSD\t7000000001\t08/14/2026",
    "other-app\t1F\t99\t0\t0\tUSD\t123\t08/14/2026",
  ].join("\n");
  const rows = parseSalesTsv(tsv);
  assert.deepEqual(summarizeSalesRows(rows, {
    appId: "6792771975",
    iapSku: "com.couplesclock.app.fullaccess",
  }), {
    firstTimeDownloads: 3,
    netPaidUnlocks: 1,
    estimatedProceedsUsd: 7,
  });
  assert.match(workflow, /cron: "15 17 \* \* \*"/);
  assert.match(workflow, /ASC_REPORTS_PRIVATE_KEY/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /Test reporting logic/);
  assert.doesNotMatch(workflow, /ready=false|keeping the last dashboard snapshot/);
  assert.match(workflow, /pages: write/);
  assert.match(workflow, /\/pages\/builds/);
  assert.match(html, /USD-only proceeds/);
});

test("requests explicit daily reports through yesterday", () => {
  assert.deepEqual(reportDates("2026-08-12", Date.parse("2026-08-16T17:15:00Z")), [
    "2026-08-12",
    "2026-08-13",
    "2026-08-14",
    "2026-08-15",
  ]);
});

test("reads public social view counts", () => {
  assert.equal(parseXViews('name:"Views",userInteractionCount:2'), 2);
  assert.equal(parseYouTubeViews('{"viewCount":"18"}'), 18);
  assert.equal(snapshot.social.mode, "mixed");
  assert.deepEqual(snapshot.social.platforms.map(({ name, mode }) => [name, mode]), [
    ["Facebook", "manual"],
    ["Instagram", "manual"],
    ["X", "manual"],
    ["YouTube", "automatic"],
  ]);
});


test("Apple freshness advances only through received reports and preserves missing days", async () => {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const env = { ASC_KEY_ID: "test", ASC_ISSUER_ID: "test", ASC_VENDOR_NUMBER: "test", ASC_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }), ASC_REPORT_START_DATE: "2026-10-08" };
  const apple = await refreshApple(env, async value => {
    const url = new URL(value);
    if (url.hostname === "itunes.apple.com") return { ok: true, json: async () => ({ results: [{ userRatingCount: 2 }] }) };
    if (url.searchParams.get("filter[reportDate]") !== "2026-10-08") return { ok: false, status: 404 };
    return { ok: true, arrayBuffer: async () => gzipSync("SKU\tProduct Type Identifier\tUnits\tApple Identifier\napp\t1F\t3\t6792771975\n") };
  }, Date.parse("2026-10-11T18:00:00Z"));
  assert.equal(apple.throughDate, "2026-10-08");
  assert.equal(apple.requestedThroughDate, "2026-10-10");
  assert.equal(apple.firstTimeDownloads, 3);
  assert.deepEqual(apple.missingDates, ["2026-10-09", "2026-10-10"]);
  assert.equal(apple.daily[1].firstTimeDownloads, null);
  assert.equal(apple.status, "partial");
});

test('separates acquisition stages and identifies manual platform coverage without invented installs', () => {
  for (const label of ['Site page views', 'App Store outbound clicks', 'Platform-reported visits', 'Attributed installs', 'First-time downloads']) assert.ok(html.includes(label), label);
  assert.match(html, /not a joined visitor-to-install funnel/);
  assert.match(html, /Missing data means unavailable, not zero/);
  assert.match(html, /cannot be repaired retrospectively/);
  assert.match(html, /four known Snooze War ads, not the entire account/);
  assert.match(html, /YouTube, TikTok and X paid reporting are not live feeds/);
  assert.match(html, /October 9–13, 2026, partial/);
  assert.match(html, /Reporting timezone unconfirmed/);
  assert.match(html, /129 reported “Website visits”/);
  assert.match(html, /Attributed first-time downloads unavailable/);
  assert.match(html, /not refreshed by “Check for updates” or changed by dashboard filters/);
  assert.match(html, /Current spend and delivery unavailable/);
});
