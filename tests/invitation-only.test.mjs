import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const betaPage = await readFile(
  new URL("../beta/index.html", import.meta.url),
  "utf8",
);

test("keeps beta access invitation-only", () => {
  assert.doesNotMatch(betaPage, /ask about beta access|get beta access|beta%20interest/i);
  assert.match(betaPage, /I invited you/i);
  assert.match(betaPage, /https:\/\/testflight\.apple\.com\/join\/HxjaesqN/);
});
