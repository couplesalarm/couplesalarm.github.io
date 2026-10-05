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

test("keeps homepage Android details neutral and makes enrollment self-service", () => {
  assert.match(home, /<h2 id="android-app-title">Android™ app<\/h2>/);
  assert.match(home, /<a class="android-app-cta" href="beta\/android\/">[\s\S]*?<svg class="android-app-icon"[\s\S]*?<span>Android™ app<\/span>/);
  assert.match(home, /Couples Alarm for Android\. View app details\./);
  assert.match(home, /Android is a trademark of Google LLC\./);
  assert.match(home, /The Android robot is reproduced or modified from work created and shared by Google/);
  assert.doesNotMatch(home, /eligibility|consent|testing/i);
  assert.doesNotMatch(home, /Android (?:closed )?beta|Apply for the Android beta/i);
  assert.match(download, /href="\.\.\/beta\/android\/"/);
  assert.match(support, /href="\.\.\/beta\/android\/"/);
  assert.match(beta, /data-android-beta-enrollment="group-open-play-pending"/);
  assert.match(beta, /Tester enrollment is open\. Google Play install is not open yet\./);
  assert.match(beta, /Join the Couples Alarm Android Beta Google Group with the same Google account you use in the Play Store\./);
  assert.match(beta, /Joining the group does not install the app or start the 14-day closed-test period\./);
  assert.match(beta, /Join the tester Google Group/);
  assert.match(beta, /Open the Google Play opt-in link/);
  assert.match(beta, /href="https:\/\/groups\.google\.com\/g\/couples-alarm-android-beta"/);
  assert.match(beta, /Join the Couples Alarm Android Beta Google Group/);
  assert.match(beta, /Google Play opt-in and install open with the closed release/);
  assert.match(beta, /at least 12 testers to stay opted in continuously for 14 days/);
  assert.match(beta, /https:\/\/support\.google\.com\/googleplay\/android-developer\/answer\/14151465\?hl=en/);
  assert.doesNotMatch(beta, /href="https:\/\/play\.google\.com\//);
  assert.doesNotMatch(beta, /first 15|applications are reviewed|apply and consent/i);
  assert.match(beta, /Stay opted in for 14 days/);
});
