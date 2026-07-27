import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(
  new URL("../beta/index.html", import.meta.url),
  "utf8",
);

test("gives invited testers one complete install and feedback path", () => {
  assert.match(page, /https:\/\/testflight\.apple\.com\/join\/HxjaesqN/);
  assert.match(page, /youtube-nocookie\.com\/embed\/X5S-KzunS8s/);
  assert.match(page, /do not rely on this beta as your only alarm/i);
  assert.match(page, /you do not need to find the original invitation email/i);
  assert.match(page, /href="\.\.\/feedback\/"/);
});
