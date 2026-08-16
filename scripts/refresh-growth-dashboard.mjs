import { sign } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const snapshotPath = new URL("../growth-dashboard/data.json", import.meta.url);
const appUnitTypes = new Set(["1", "1F", "1T", "F1"]);
const socialSources = new Map([
  ["X", { url: "https://x.com/couplesalarm/status/2088261204279963649", parse: parseXViews }],
  ["YouTube", { url: "https://www.youtube.com/shorts/cIhu0YqJFW4", parse: parseYouTubeViews }],
]);

export function parseXViews(html) {
  const match = html.match(/name:"Views",userInteractionCount:(\d+)/);
  if (!match) throw new Error("X view count was not found");
  return Number(match[1]);
}

export function parseYouTubeViews(html) {
  const match = html.match(/"viewCount":"(\d+)"/);
  if (!match) throw new Error("YouTube view count was not found");
  return Number(match[1]);
}

export function parseSalesTsv(input) {
  const lines = input.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split("\t");
  return lines.slice(1).filter(Boolean).map((line) =>
    Object.fromEntries(headers.map((header, index) => [header, line.split("\t")[index] ?? ""])),
  );
}

function toIsoDate(value) {
  const [month, day, year] = value.split("/");
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function summarizeSalesRows(rows, { appId, iapSku }) {
  let firstTimeDownloads = 0;
  let netPaidUnlocks = 0;
  let estimatedProceedsUsd = 0;

  for (const row of rows) {
    const units = Number(row.Units || 0);
    const productType = row["Product Type Identifier"];
    if (row["Apple Identifier"] === appId && appUnitTypes.has(productType)) {
      firstTimeDownloads += units;
    }
    if (row.SKU !== iapSku || !productType.startsWith("IA1") || Number(row["Customer Price"] || 0) === 0) continue;
    netPaidUnlocks += units;
    if (row["Currency of Proceeds"] === "USD") {
      estimatedProceedsUsd += units * Number(row["Developer Proceeds"] || 0);
    }
  }

  return {
    firstTimeDownloads: Math.round(firstTimeDownloads),
    netPaidUnlocks: Math.round(netPaidUnlocks),
    estimatedProceedsUsd: Math.round(estimatedProceedsUsd * 100) / 100,
  };
}

function jwt({ issuerId, keyId, privateKey }) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: "ES256", kid: keyId, typ: "JWT" })}.${encode({ iss: issuerId, iat: now, exp: now + 600, aud: "appstoreconnect-v1" })}`;
  const signature = sign("sha256", Buffer.from(unsigned), {
    key: privateKey,
    dsaEncoding: "ieee-p1363",
  }).toString("base64url");
  return `${unsigned}.${signature}`;
}

async function downloadSalesReport({ date, token, vendorNumber }, fetchImpl = fetch) {
  const url = new URL("https://api.appstoreconnect.apple.com/v1/salesReports");
  url.searchParams.set("filter[frequency]", "DAILY");
  url.searchParams.set("filter[reportSubType]", "SUMMARY");
  url.searchParams.set("filter[reportType]", "SALES");
  url.searchParams.set("filter[vendorNumber]", vendorNumber);
  url.searchParams.set("filter[version]", "1_0");
  if (date) url.searchParams.set("filter[reportDate]", date);

  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Apple Sales & Trends request failed (${response.status})`);
  return parseSalesTsv(gunzipSync(Buffer.from(await response.arrayBuffer())).toString("utf8"));
}

function datesBetween(start, end) {
  const dates = [];
  const cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  // ponytail: refetches daily launch reports; batch by month if history grows past one year.
  for (; cursor <= last; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

export function reportDates(startDate, now = Date.now()) {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - 1);
  return datesBetween(startDate, cutoff.toISOString().slice(0, 10));
}

async function publicRatingCount(appId, fetchImpl = fetch) {
  const response = await fetchImpl(`https://itunes.apple.com/lookup?id=${appId}&country=us`);
  if (!response.ok) throw new Error(`Apple catalog request failed (${response.status})`);
  const result = (await response.json()).results?.[0];
  if (!result) throw new Error("Apple catalog did not return the app");
  return Number(result.userRatingCount || 0);
}

async function refreshPublicSocial(social, fetchImpl = fetch) {
  const updatedAt = new Date().toISOString();
  const platforms = await Promise.all(social.platforms.map(async (platform) => {
    const source = socialSources.get(platform.name);
    if (!source) return platform;

    try {
      const response = await fetchImpl(source.url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; CouplesAlarmGrowthDashboard/1.0)" },
      });
      if (!response.ok) throw new Error(`request failed (${response.status})`);
      return {
        ...platform,
        views: source.parse(await response.text()),
        mode: "automatic",
        updatedAt,
        url: source.url,
      };
    } catch (error) {
      console.warn(`${platform.name} social refresh failed: ${error.message}`);
      return { ...platform, mode: "automatic", url: source.url };
    }
  }));

  const automaticCount = platforms.filter(({ mode }) => mode === "automatic").length;
  return {
    ...social,
    mode: automaticCount === platforms.length ? "automatic" : automaticCount ? "mixed" : "manual",
    platforms,
  };
}

async function privateKeyFrom(env) {
  if (env.ASC_PRIVATE_KEY) return env.ASC_PRIVATE_KEY.replaceAll("\\n", "\n");
  if (env.ASC_PRIVATE_KEY_PATH) return readFile(env.ASC_PRIVATE_KEY_PATH, "utf8");
  throw new Error("ASC_PRIVATE_KEY or ASC_PRIVATE_KEY_PATH is required");
}

export async function refreshGrowthDashboard(env = process.env, fetchImpl = fetch) {
  const required = ["ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_VENDOR_NUMBER"];
  const missing = required.filter((name) => !env[name]);
  if (missing.length) throw new Error(`Missing required configuration: ${missing.join(", ")}`);

  const appId = env.ASC_APP_ID || "6792771975";
  const iapSku = env.ASC_IAP_SKU || "com.couplesclock.app.fullaccess";
  const startDate = env.ASC_REPORT_START_DATE || "2026-08-12";
  const token = jwt({
    issuerId: env.ASC_ISSUER_ID,
    keyId: env.ASC_KEY_ID,
    privateKey: await privateKeyFrom(env),
  });

  const reports = [];
  const dates = reportDates(startDate);
  const throughDate = dates.at(-1);
  if (!throughDate) throw new Error("Apple report window predates the launch date");
  for (const date of dates) {
    const rows = await downloadSalesReport({ date, token, vendorNumber: env.ASC_VENDOR_NUMBER }, fetchImpl);
    if (rows) reports.push(...rows);
  }

  const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
  snapshot.generatedAt = new Date().toISOString();
  snapshot.apple = {
    mode: "automatic",
    throughDate,
    ...summarizeSalesRows(reports, { appId, iapSku }),
    usRatingCount: await publicRatingCount(appId, fetchImpl),
  };
  snapshot.social = await refreshPublicSocial(snapshot.social, fetchImpl);
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  return snapshot;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const snapshot = await refreshGrowthDashboard();
  console.log(`Growth snapshot refreshed through ${snapshot.apple.throughDate}.`);
}
