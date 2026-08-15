import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicPages = [
  "../index.html",
  "../compatibility/index.html",
  "../different-wake-times/index.html",
  "../support/index.html",
  "../privacy/index.html",
];

test("keeps beta routes out of public navigation", async () => {
  for (const page of publicPages) {
    const html = await readFile(new URL(page, import.meta.url), "utf8");
    const primary = html.match(
      /<nav aria-label="Primary navigation">([\s\S]*?)<\/nav>/,
    )?.[1];
    const footer = html.match(
      /<nav aria-label="Footer navigation">([\s\S]*?)<\/nav>/,
    )?.[1];
    assert.ok(primary, `${page} has primary navigation`);
    const labels = [...primary.matchAll(/<a\b[^>]*>([^<]+)<\/a>/g)].map(
      ([, label]) => label,
    );
    assert.deepEqual(labels, ["Support", "Privacy"]);
    assert.doesNotMatch(primary, /beta|testflight|install/i);
    assert.equal(footer, undefined, `${page} avoids duplicate navigation`);
  }
});

test("keeps the invitation-only beta routes available", async () => {
  for (const page of ["../beta/index.html", "../feedback/index.html"]) {
    const html = await readFile(new URL(page, import.meta.url), "utf8");
    assert.match(html, /Beta feedback/);
    assert.match(html, /href="\.\.\/support\/"/);
    assert.match(html, /href="\.\.\/privacy\/"/);
    assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  }
});

test("public download links use the canonical App Store page", async () => {
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );
  const download = await readFile(
    new URL("../download/index.html", import.meta.url),
    "utf8",
  );
  const appStoreUrl =
    "https://apps.apple.com/us/app/couples-alarm/id6792771975";

  assert.match(html, /https:\/\/couplesalarm\.com\//);
  assert.match(html, /assets\/couples-alarm-preview\.mp4/);
  assert.match(html, new RegExp(appStoreUrl));
  assert.match(download, new RegExp(appStoreUrl));
  assert.doesNotMatch(`${html}\n${download}`, /Coming soon|TestFlight|private beta/i);
  assert.doesNotMatch(html, /TestFlight|Private beta/);
});

test("publishes canonical search and App Store metadata", async () => {
  for (const page of [
    "../index.html",
    "../compatibility/index.html",
    "../different-wake-times/index.html",
    "../support/index.html",
    "../privacy/index.html",
    "../download/index.html",
  ]) {
    const html = await readFile(new URL(page, import.meta.url), "utf8");
    assert.match(html, /<meta name="apple-itunes-app" content="app-id=6792771975">/);
  }

  const home = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const compatibility = await readFile(
    new URL("../compatibility/index.html", import.meta.url),
    "utf8",
  );
  const guide = await readFile(
    new URL("../different-wake-times/index.html", import.meta.url),
    "utf8",
  );
  const robots = await readFile(new URL("../robots.txt", import.meta.url), "utf8");
  const sitemap = await readFile(new URL("../sitemap.xml", import.meta.url), "utf8");

  assert.match(home, /<script type="application\/ld\+json">/);
  assert.match(home, /"@type": "SoftwareApplication"/);
  assert.match(compatibility, /<link rel="canonical" href="https:\/\/couplesalarm\.com\/compatibility\/">/);
  assert.match(guide, /<link rel="canonical" href="https:\/\/couplesalarm\.com\/different-wake-times\/">/);
  assert.match(robots, /Sitemap: https:\/\/couplesalarm\.com\/sitemap\.xml/);
  for (const url of ["", "compatibility/", "different-wake-times/", "support/", "privacy/"]) {
    assert.match(sitemap, new RegExp(`<loc>https://couplesalarm\\.com/${url}</loc>`));
  }
  assert.doesNotMatch(sitemap, /admin|beta|feedback/);
});

test("publishes the evidence-led different-wake-times guide", async () => {
  const home = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const guide = await readFile(
    new URL("../different-wake-times/index.html", import.meta.url),
    "utf8",
  );

  assert.match(home, /href="different-wake-times\/"/);
  assert.match(guide, /<meta property="og:type" content="article">/);
  assert.match(guide, /"@type": "Article"/);
  assert.match(guide, /ct=owned_guide_wake_times_01/);
  assert.match(guide, /ppid=b953fb2e-ed1a-4cae-b8a4-7bac2525a093/);
  assert.match(guide, /support\.apple\.com\/en-nz\/118444/);
  assert.match(guide, /support\.apple\.com\/guide\/watch\/adjust-volume-and-haptics/);
  assert.match(guide, /pubmed\.ncbi\.nlm\.nih\.gov\/24509892/);
  assert.match(guide, /Thompson and colleagues/);
  assert.match(guide, /www\.nhlbi\.nih\.gov\/health\/sleep-deprivation\/healthy-sleep-habits/);
  assert.match(guide, /No phone, watch, light, or app setup here guarantees/);
});

test("keeps public-facing summaries in customer language", async () => {
  for (const page of publicPages) {
    const html = await readFile(new URL(page, import.meta.url), "utf8");
    assert.doesNotMatch(
      html,
      /AlarmKit|third-party SDK|server-side information|emails the developer/,
    );
  }
});

test("keeps the saved-sound handoff in customer language", async () => {
  const html = await readFile(new URL("../download/index.html", import.meta.url), "utf8");
  assert.match(html, /real bedside alarm check/);
  assert.doesNotMatch(html, /AlarmKit/);
});
