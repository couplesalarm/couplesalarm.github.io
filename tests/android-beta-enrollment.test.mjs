import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [home, download, support, beta] = await Promise.all([
  "index.html",
  "download/index.html",
  "support/index.html",
  "beta/android/index.html",
].map((path) => readFile(new URL(path, root), "utf8")));
const css = await readFile(new URL("landing.css", root), "utf8");

function applicationLink(html, label) {
  const links = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  const match = links.find(([, , text]) => text.replace(/<[^>]+>/g, "").trim() === label);
  assert.ok(match, label);
  return match[1];
}

test("uses the official store badges as the primary download actions", () => {
  assert.match(home, /<div class="hero-actions">\s*<div class="app-badges">/);
  assert.match(home, /<div class="app-badges">[\s\S]*?<a class="app-store-link"[\s\S]*?<a class="google-play-link" href="https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.couplesalarm\.android">/);
  assert.match(home, /<img src="https:\/\/play\.google\.com\/intl\/en_us\/badges\/static\/images\/badges\/en_badge_web_generic\.png" alt="Get it on Google Play" width="646" height="250">/);
  assert.doesNotMatch(home, /android-head_flat|android-badge-copy|Android™/);
  assert.doesNotMatch(home, /android-app-callout|android-app-title|View app details/);
  assert.match(home, /Google Play and the Google Play logo are trademarks of Google LLC\./);
  assert.match(css, /\.google-play-link img \{[^}]*height: calc\(var\(--badge-height\) \* 250 \/ 168\)/);
  assert.doesNotMatch(home, /eligibility|consent|testing/i);
  assert.doesNotMatch(home, /Apply for the Android beta/i);
  assert.doesNotMatch(home, /Pre-register on Google Play/);
});

test("offers direct Android downloads without a website enrollment form", () => {
  assert.equal(applicationLink(download, "Get it on Google Play"), "https://play.google.com/store/apps/details?id=com.couplesalarm.android");
  assert.doesNotMatch(download, /beta|tester|enrollment|groups\.google\.com|apps\/testing\//i);
  assert.match(beta, /id="application"/); // Existing shared links still land on a useful page.
  assert.doesNotMatch(`${download}\n${beta}`, /docs\.google\.com|<iframe/i);
  assert.doesNotMatch(beta.replace(/<script defer src="\.\.\/\.\.\/assets\/(?:campaign-links|analytics)\.js\?v=[\w-]+"><\/script>/g, ""), /<form\b|<input\b|<textarea\b|<script\b|\bhidden\b/);
  assert.match(beta, /href="\.\.\/\.\.\/privacy\/#android-beta-group"/);
  assert.doesNotMatch(support, /beta\/android/);
  for (const html of [download, beta]) {
    assert.doesNotMatch(html, /eligibility|consent requirements|Wait for selection/);
    assert.doesNotMatch(html, /Sign up with your.*email|We’ll arrange access|We’ll send access instructions|email your next steps/);
  }
});

test("tells former beta links that Android is public and sends them to Google Play", () => {
  const stepButtons = [...beta.matchAll(/<li>\s*<a[^>]+>([^<]+)<\/a>/g)].map(([, text]) => text);
  assert.deepEqual(stepButtons, ["Get it on Google Play"]);
  assert.equal(applicationLink(beta, "Get it on Google Play"), "https://play.google.com/store/apps/details?id=com.couplesalarm.android");
  assert.match(beta, /data-android-beta-enrollment="ended-public-release"/);
  assert.match(beta, /id="steps-title"/); // Preserve the earlier shared instructions anchor.
  assert.match(beta, /The beta has ended/);
  assert.match(beta, /You no longer need to join a tester group/);
  assert.match(beta, /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(beta, /groups\.google\.com|apps\/testing\/|Become a tester|14 days|12 testers|can go live on Play/);
  const accessLinks = [...beta.matchAll(/<a\b[^>]*href="https:\/\/(?:groups|play)\.google\.com[^>]*>/g)];
  assert.equal(accessLinks.length, 1);
  assert.match(accessLinks[0][0], /target="_blank" rel="noopener noreferrer"/);
  assert.match(beta, /same Google account and choose Update when it appears/);
});

test("sends every public page straight to the public Google Play listing", () => {
  assert.doesNotMatch(`${download}\n${beta}`, /not open yet|when the closed release is available/);
  const playLinks = (html) => [...html.matchAll(/href="(https:\/\/play\.google\.com\/[^"]*)"/g)].map(([, href]) => href);
  assert.deepEqual(playLinks(home), ["https://play.google.com/store/apps/details?id=com.couplesalarm.android"]);
  assert.ok(playLinks(download).length > 0);
  for (const href of [...playLinks(download), ...playLinks(beta)]) {
    assert.equal(href, "https://play.google.com/store/apps/details?id=com.couplesalarm.android");
  }
  assert.deepEqual(playLinks(support), []);
  assert.match(support, /Couples Alarm for Android is available on Google Play/);
});

test("preserves backup-alarm and feedback guidance", () => {
  assert.match(beta, /Keep a backup alarm<\/strong> until the selected tone has passed that test on this phone/);
  assert.equal(applicationLink(beta, "Help"), "../../support/#android-beta");
  assert.equal(applicationLink(beta, "Feedback"), "../../feedback/");
  assert.match(support, /id="android-beta"/); // Preserve the anchor used by earlier links.
  assert.match(support, /keep a trusted backup alarm until it passes/);
  assert.match(support, /href="\.\.\/feedback\/">feedback form<\/a>/);
  assert.match(download, /Keep a trusted backup alarm until the selected tone has passed the bedside check on this phone/);
});
