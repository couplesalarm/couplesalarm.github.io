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
const applicationURL = "https://docs.google.com/forms/d/e/1FAIpQLSeRYN0x9f12SPhvEApryNvo8ADy34UxSkohdXu6JntoZAOtug/viewform?usp=publish-editor";

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

test("sends both Android entry paths to the existing application without automatic access", () => {
  assert.equal(applicationLink(download, "Complete the application"), applicationURL);
  assert.equal(applicationLink(beta, "Apply for the Android beta"), applicationURL);
  assert.match(download, /href="\.\.\/beta\/android\/"/);
  assert.match(support, /href="\.\.\/beta\/android\/"/);
  for (const html of [download, beta]) {
    assert.match(html, /eligibility and consent in submission order/);
    assert.match(html, /does not automatically grant tester access/i);
    assert.match(html, /Selected testers will receive private access/);
    assert.doesNotMatch(html, /href="https:\/\/groups\.google\.com\//);
    assert.doesNotMatch(html, /Tester enrollment is open|Join the tester group/i);
  }
});

test("requires selection and private access before opt-in and the latest test build", () => {
  const steps = [...beta.matchAll(/<li><strong>([^<]+)<\/strong>/g)].map(([, text]) => text);
  assert.deepEqual(steps, [
    "Complete the application",
    "Wait for selection",
    "Receive private access and opt-in instructions",
    "Install, update, and test",
  ]);
  assert.match(beta, /Access is for selected testers; applying or joining a group does not automatically grant it/);
  assert.match(beta, /After access is granted and you opt in, install the latest available test build from Google Play/);
  assert.match(beta, /If already installed, use Update when it appears/);
  assert.match(beta, /Your application and Play Store account must match/);
  assert.match(beta, /Use the Google account you entered in the application/);
  assert.match(beta, /Try the app with your partner, stay opted in for 14 days/);
});

test("keeps Google Play opt-in and installation disabled while release access is unverified", () => {
  assert.match(beta, /data-android-beta-enrollment="application-first-play-pending"/);
  assert.match(beta, /Google Play install is not open yet\./);
  assert.match(download, /Google Play install is not open yet\./);
  const control = beta.match(/<span\b([^>]*)>Google Play opt-in and install are not open yet<\/span>/);
  assert.ok(control);
  assert.match(control[1], /role="link"/);
  assert.match(control[1], /aria-disabled="true"/);
  assert.match(control[1], /aria-describedby="play-access-note"/);
  assert.doesNotMatch(control[1], /href=|tabindex=|onclick=/i);
  assert.match(beta, /id="play-access-note">Submitting the application does not enroll you in Google Play or start the 14-day closed-test period/);
  for (const html of [home, download, support, beta]) {
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
