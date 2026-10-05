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

const signupForm = "https://docs.google.com/forms/d/e/1FAIpQLSeRYN0x9f12SPhvEApryNvo8ADy34UxSkohdXu6JntoZAOtug/viewform?usp=publish-editor";

test("keeps Android beta access private while giving applicants one clear route", () => {
  assert.ok(home.includes(`href="${signupForm}"`));
  assert.match(download, /href="\.\.\/beta\/android\/"/);
  assert.match(support, /href="\.\.\/beta\/android\/"/);
  assert.match(beta, /data-android-beta-enrollment="pending"/);
  assert.ok(beta.includes(`href="${signupForm}"`));
  assert.match(beta, /Applications are open\. Installs are not open yet\./);
  assert.match(beta, /We’re selecting the first 15 eligible applicants/);
  assert.match(beta, /Submitting this form does not enroll you in Google Play or start the 14-day test period\./);
  assert.match(beta, /Applications are reviewed for age, device, 14-day commitment, and consent before anyone receives access\./);
  assert.match(beta, /Selected testers get opt-in and install instructions when the closed release is ready\./);
  assert.match(beta, /Google Play install opens for selected testers/);
  assert.match(beta, /at least 12 testers to stay opted in continuously for 14 days/);
  assert.match(beta, /https:\/\/support\.google\.com\/googleplay\/android-developer\/answer\/14151465\?hl=en/);
  assert.doesNotMatch(beta, /href="https:\/\/play\.google\.com\//);
  assert.doesNotMatch(beta, /href="https:\/\/groups\.google\.com\//);
  assert.match(beta, /Stay opted in for 14 days/);
});
