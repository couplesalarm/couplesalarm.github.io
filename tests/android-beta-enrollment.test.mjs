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

function applicationLink(html, label) {
  const links = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
  const match = links.find(([, , text]) => text.replace(/<[^>]+>/g, "").trim() === label);
  assert.ok(match, label);
  return match[1];
}

test("puts the test action before the balanced robot app options", () => {
  assert.ok(home.indexOf('<a class="test-link"') < home.indexOf('<div class="app-badges">'));
  assert.match(home, /<div class="app-badges">[\s\S]*?<a class="app-store-link"[\s\S]*?<a class="android-app-link" href="beta\/android\/" aria-label="Couples Alarm Android app">/);
  assert.match(home, /<img src="assets\/android-head_flat\.svg" alt="" width="40" height="24" aria-hidden="true">/);
  assert.match(home, /<strong>Android™<\/strong><small>app<\/small>/);
  assert.doesNotMatch(home, /android-app-callout|android-app-title|View app details/);
  assert.match(home, /<footer class="android-brand-attribution">[\s\S]*?Android is a trademark of Google LLC\./);
  assert.match(home, /The Android robot is reproduced or modified from work created and shared by/);
  assert.match(home, /href="https:\/\/developer\.android\.com\/distribute\/marketing-tools\/brand-guidelines"/);
  assert.match(home, /href="https:\/\/creativecommons\.org\/licenses\/by\/3\.0\/"/);
  assert.doesNotMatch(home, /eligibility|consent|testing/i);
  assert.doesNotMatch(home, /Android (?:closed )?beta|Apply for the Android beta/i);
  assert.doesNotMatch(home, /Get it on Google Play|Pre-register on Google Play/);
});

test("makes beta access available without a duplicate website form", () => {
  assert.equal(applicationLink(download, "Join the Android beta"), "../beta/android/#application");
  assert.match(beta, /id="application"/); // Existing shared links still reach enrollment.
  assert.doesNotMatch(`${download}\n${beta}`, /docs\.google\.com|<iframe/i);
  assert.doesNotMatch(beta, /<form\b|<input\b|<textarea\b|<script\b|\bhidden\b/);
  assert.match(beta, /Google uses your account to record group membership/);
  assert.match(beta, /href="\.\.\/\.\.\/privacy\/#android-beta-group"/);
  assert.match(download, /href="\.\.\/beta\/android\/"/);
  assert.match(support, /href="\.\.\/beta\/android\/#application"/);
  for (const html of [download, beta]) {
    assert.doesNotMatch(html, /eligibility|consent requirements|Wait for selection/);
    assert.doesNotMatch(html, /Sign up with your.*email|We’ll arrange access|We’ll send access instructions|email your next steps/);
  }
});

test("explains self-service group joining and Google Play download in two steps", () => {
  const steps = [...beta.matchAll(/<li>\s*<h3>([^<]+)<\/h3>/g)].map(([, text]) => text);
  assert.deepEqual(steps, [
    "Join the tester group",
    "Get the beta on Google Play",
  ]);
  assert.match(beta, /Joining the group does not automatically opt you in on Google Play/);
  assert.match(beta, /follow Google Play’s download link to install Couples Alarm/);
  assert.match(beta, /If already installed, use <strong>Update<\/strong> when it appears/);
  assert.match(beta, /Already a member\? Go to step 2/);
  assert.match(beta, /Use the same Google account you use in the Play Store on your phone/);
  assert.match(beta, /Try the app with your partner, stay opted in for 14 days/);
});

test("offers self-service access to the published Google Play beta without an email wait", () => {
  assert.match(beta, /data-android-beta-enrollment="direct-group-self-service-play-published"/);
  assert.match(beta, /Join in two steps\./);
  assert.match(download, /The Google Play closed beta is published\./);
  assert.doesNotMatch(`${download}\n${beta}`, /not open yet|when the closed release is available/);
  assert.equal(applicationLink(beta, "Join the tester group"), "https://groups.google.com/g/couples-alarm-android-beta/about");
  assert.equal(applicationLink(beta, "Open Google Play beta"), "https://play.google.com/apps/testing/com.couplesalarm.android");
  const accessLinks = [...beta.matchAll(/<a\b[^>]*href="https:\/\/(?:groups|play)\.google\.com[^>]*>/g)];
  assert.equal(accessLinks.length, 2);
  for (const [link] of accessLinks) {
    assert.match(link, /target="_blank" rel="noopener noreferrer"/);
  }
  assert.ok(beta.indexOf('>Join the tester group</a>') < beta.indexOf('>Open Google Play beta</a>'));
  assert.match(beta, /No organizer approval or confirmation email is needed/);
  assert.match(beta, /Choose <strong>Become a tester<\/strong>/);
  assert.doesNotMatch(beta, /We’ll email your access instructions|after you receive your access instructions/);
  assert.match(beta, /Your 14-day test period starts when you opt in/);
  for (const html of [home, download, support]) {
    assert.doesNotMatch(html, /href="https:\/\/play\.google\.com\//);
  }
  assert.match(beta, /at least 12 testers to stay opted in continuously for 14 days/);
  assert.match(beta, /https:\/\/support\.google\.com\/googleplay\/android-developer\/answer\/14151465\?hl=en/);
});

test("preserves backup-alarm and post-install feedback guidance", () => {
  assert.match(beta, /Do not rely on an Android test build for an important wake-up/);
  assert.match(beta, /Keep a trusted backup alarm while testing/);
  assert.match(beta, /href="\.\.\/\.\.\/support\/#android"/);
  assert.match(beta, /href="\.\.\/\.\.\/feedback\/">beta feedback form<\/a> after you install/);
  assert.match(download, /Keep a trusted backup alarm until the selected tone has passed the bedside check on this iPhone/);
});
