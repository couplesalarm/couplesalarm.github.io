import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pages = [
  "../index.html",
  "../download/index.html",
  "../support/index.html",
  "../feedback/index.html",
  "../privacy/index.html",
];

test("uses one primary menu across every public page", async () => {
  const menus = await Promise.all(
    pages.map(async (page) => {
      const html = await readFile(new URL(page, import.meta.url), "utf8");
      assert.match(
        html,
        /<header class="[^"]*\bsite-header\b[^"]*">/,
        `${page} uses the shared site header`,
      );
      const nav = html.match(
        /<nav aria-label="Primary navigation">([\s\S]*?)<\/nav>/,
      )?.[1];

      assert.ok(nav, `${page} has a primary navigation menu`);
      assert.equal((nav.match(/aria-current="page"/g) || []).length, 1);
      return [...nav.matchAll(/<a\b[^>]*>([^<]+)<\/a>/g)].map((match) =>
        match[1].trim(),
      );
    }),
  );

  const expected = ["Product", "Install", "Support", "Beta feedback", "Privacy"];
  for (const menu of menus) assert.deepEqual(menu, expected);
});
