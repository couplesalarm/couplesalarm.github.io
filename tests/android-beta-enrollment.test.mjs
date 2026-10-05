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

test("gives visitors one accurate Android beta route while enrollment is pending", () => {
  assert.match(home, /href="beta\/android\/"/);
  assert.match(download, /href="\.\.\/beta\/android\/"/);
  assert.match(support, /href="\.\.\/beta\/android\/"/);
  assert.match(beta, /data-android-beta-enrollment="pending"/);
  assert.match(beta, /Google Play enrollment is not open yet/);
  assert.doesNotMatch(beta, /href="https:\/\/play\.google\.com\//);
  assert.doesNotMatch(beta, /href="https:\/\/groups\.google\.com\//);
  assert.match(beta, /Join the tester group/);
  assert.match(beta, /Opt in on Google Play/);
  assert.match(beta, /Stay opted in for 14 days/);
});
