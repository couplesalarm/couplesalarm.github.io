import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicBetaPages = await Promise.all(
  ["../index.html", "../download/index.html"].map((page) =>
    readFile(new URL(page, import.meta.url), "utf8"),
  ),
);

test("keeps beta access invitation-only", () => {
  const copy = publicBetaPages.join("\n");

  assert.doesNotMatch(copy, /ask about beta access|get beta access|beta%20interest/i);
  assert.match(copy, /Brian sends (?:TestFlight|beta) invitations directly/i);
  assert.match(copy, /no public (?:sign-up or )?access-request form/i);
});
