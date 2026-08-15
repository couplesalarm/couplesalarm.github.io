import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { snapshotFreshness } from "../growth-dashboard/dashboard.js";
import { parseSalesTsv, summarizeSalesRows } from "../scripts/refresh-growth-dashboard.mjs";

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
  assert.equal(snapshot.schemaVersion, 1);
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
  assert.match(workflow, /cron: "15 13 \* \* \*"/);
  assert.match(workflow, /ASC_REPORTS_PRIVATE_KEY/);
  assert.match(workflow, /ref: main/);
  assert.match(workflow, /pages: write/);
  assert.match(workflow, /\/pages\/builds/);
  assert.match(html, /USD-only proceeds/);
});
