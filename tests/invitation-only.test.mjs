import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicBetaPages = [
  await readFile(new URL("../download/index.html", import.meta.url), "utf8"),
];

test("keeps beta access invitation-only", () => {
  const copy = publicBetaPages.join("\n");

  assert.doesNotMatch(copy, /ask about beta access|get beta access|beta%20interest/i);
  assert.match(copy, /Invitations are sent directly/i);
  assert.match(copy, /no public (?:sign-up or )?access-request form/i);
});
