import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicPages = [
  "../index.html",
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
    assert.ok(footer, `${page} has footer navigation`);
    assert.doesNotMatch(primary, /beta|testflight|install/i);
    assert.doesNotMatch(footer, /beta|testflight|install/i);
    assert.match(primary, /Support/);
    assert.match(primary, /Privacy/);
  }
});

test("keeps the invitation-only beta routes available", async () => {
  for (const page of [
    "../beta/index.html",
    "../download/index.html",
    "../feedback/index.html",
  ]) {
    const html = await readFile(new URL(page, import.meta.url), "utf8");
    assert.match(html, /Beta feedback/);
    assert.match(html, /href="\.\.\/support\/"/);
    assert.match(html, /href="\.\.\/privacy\/"/);
  }
});

test("homepage is ready for the App Store link without claiming approval", async () => {
  const html = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );

  assert.match(html, /https:\/\/couplesalarm\.com\//);
  assert.match(html, /assets\/couples-alarm-preview\.mp4/);
  assert.match(html, /App Store approval pending/);
  assert.doesNotMatch(html, /TestFlight|Private beta/);
});
