import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicPages = [
  "../index.html",
  "../compatibility/index.html",
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

test("keeps public-facing summaries in customer language", async () => {
  for (const page of publicPages) {
    const html = await readFile(new URL(page, import.meta.url), "utf8");
    assert.doesNotMatch(
      html,
      /AlarmKit|third-party SDK|server-side information|emails the developer/,
    );
  }
});
