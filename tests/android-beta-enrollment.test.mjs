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

test("keeps email-only beta signup on the website", () => {
  assert.equal(applicationLink(download, "Join the Android beta"), "../beta/android/#application");
  assert.equal(applicationLink(beta, "Join the Android beta"), "#application");
  assert.match(beta, /id="beta-application-form"/);
  assert.doesNotMatch(`${download}\n${beta}`, /docs\.google\.com|<iframe/i);
  assert.match(beta, /name="playEmail" type="email"[^>]*required/);
  assert.equal([...beta.matchAll(/<input\b[^>]*\brequired\b/g)].length, 1);
  assert.doesNotMatch(beta, /name="(?:adultConfirmed|contactConsent|phoneModel|androidVersion|canTest14Days|interests)"/);
  assert.doesNotMatch(beta, /type="(?:checkbox|radio)"|<textarea/);
  assert.match(beta, /<button type="submit">Join the beta<\/button>/);
  assert.match(beta, /We’ll use your email to arrange beta access and send instructions/);
  assert.match(download, /href="\.\.\/beta\/android\/"/);
  assert.match(support, /href="\.\.\/beta\/android\/#application"/);
  for (const html of [download, beta]) {
    assert.doesNotMatch(html, /eligibility|consent requirements|Wait for selection/);
    assert.doesNotMatch(html, /We’ll arrange access|We’ll send access instructions|email your next steps/);
  }
});

test("explains email signup, self-service group joining and Google Play opt-in in order", () => {
  const steps = [...beta.matchAll(/<li><strong>([^<]+)<\/strong>/g)].map(([, text]) => text);
  assert.deepEqual(steps, [
    "Sign up with your email",
    "Join the tester group",
    "Opt in on Google Play",
    "Install, update, and test",
  ]);
  assert.match(beta, /Signing up does not automatically opt you in on Google Play/);
  assert.match(beta, /After joining the group and opting in, follow Google Play’s download link to install the latest available test build/);
  assert.match(beta, /If already installed, use Update when it appears/);
  assert.match(beta, /Use the same email in the Play Store/);
  assert.match(beta, /Use the Google account you signed up with/);
  assert.match(beta, /Try the app with your partner, stay opted in for 14 days/);
});

test("offers self-service access to the published Google Play beta without an email wait", () => {
  assert.match(beta, /data-android-beta-enrollment="email-signup-self-service-play-published"/);
  assert.match(beta, /Sign up for the Android beta\./);
  assert.match(download, /The Google Play closed beta is published\./);
  assert.doesNotMatch(`${download}\n${beta}`, /not open yet|when the closed release is available/);
  assert.equal(applicationLink(beta, "Already signed up? Get the beta"), "#steps-title");
  assert.equal(applicationLink(beta, "Join the tester group"), "https://groups.google.com/g/couples-alarm-android-beta/about");
  assert.equal(applicationLink(beta, "Open Google Play beta"), "https://play.google.com/apps/testing/com.couplesalarm.android");
  assert.match(beta, /id="application-access"[^>]*hidden/);
  assert.ok(beta.indexOf('>Join the tester group</a>') < beta.indexOf('>Open Google Play beta</a>'));
  assert.match(beta, /No organizer approval is needed/);
  assert.match(beta, /choose Become a tester/);
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
