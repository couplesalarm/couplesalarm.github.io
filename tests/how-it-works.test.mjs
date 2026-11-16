import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const [page, download, sitemap, links, recorder] = await Promise.all([
  read("how-it-works/index.html"), read("download/index.html"), read("sitemap.xml"),
  read("assets/campaign-links.js"), read("supabase/functions/record-page-view/index.ts"),
]);

test("explains the idea and the five setup steps with pictures", () => {
  assert.match(page, /<link rel="canonical" href="https:\/\/couplesalarm\.com\/how-it-works\/">/);
  assert.equal([...page.matchAll(/<li class="step[ "]/g)].length, 5);
  for (const heading of ["Choose who wakes first", "One listen each", "Preview the tone together", "Run the bedside fit check", "Set your alarms"]) {
    assert.ok(page.includes(`<h3>${heading}</h3>`), heading);
  }
  assert.ok([...page.matchAll(/<img /g)].length >= 10);
  assert.ok([...page.matchAll(/<use href="#i-/g)].length >= 20);
  for (const [, id] of page.matchAll(/<use href="#(i-[\w-]+)"/g)) assert.ok(page.includes(`<symbol id="${id}"`), id);
  for (const [, alt] of page.matchAll(/<img [^>]*alt="([^"]*)"/g)) assert.ok(alt === "" || alt.length > 10, alt);
});

test("keeps to approved claims and states the limits", () => {
  assert.match(page, /This only works if the person who needs to wake up can hear a sound their partner can’t\. You’ll test that together during setup\./);
  assert.match(page, /suggests a built-in tone only when the person waking first can hear a tested tone the sleeping partner does not/);
  assert.match(page, /It won’t fit every couple/);
  assert.match(page, /Keep a backup alarm/);
  assert.doesNotMatch(page, /hearing test|guarantee|clinically|medical-grade|AlarmKit/i);
});

test("invites the tone test as proof and shows the price", () => {
  assert.match(page, /Prove it to yourselves first/);
  assert.match(page, /href="\.\.\/compatibility\/">Start the 2-minute tone test<\/a>/);
  assert.match(page, /\$9\.99 once/);
  assert.match(page, /href="\.\.\/download\/#pricing"/);
  assert.match(download, /id="pricing"/);
  assert.match(download, /href="\.\.\/how-it-works\/"/);
});

test("is listed and carries campaign tags like other public pages", () => {
  assert.match(sitemap, /<loc>https:\/\/couplesalarm\.com\/how-it-works\/<\/loc>/);
  assert.ok(links.includes('"/how-it-works/"'));
  assert.ok(recorder.includes('"/how-it-works/"'));
});
