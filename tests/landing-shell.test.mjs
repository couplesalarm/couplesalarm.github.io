import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../landing.css", import.meta.url), "utf8");

test("keeps the landing page in one viewport", () => {
  assert.match(html, /class="site-shell"/);
  assert.match(css, /\.site-shell\s*\{[\s\S]*height:\s*100svh/);
  assert.match(css, /body\s*\{[\s\S]*overflow:\s*hidden/);
  assert.doesNotMatch(
    html,
    /preview-section|steps-section|honesty-section|privacy-section|release-section/,
  );
});

test("keeps the social launch video and honest fit check on the landing page", () => {
  assert.match(
    html,
    /assets\/couples-alarm-preview\.mp4\?v=20260730-social-launch/,
  );
  assert.match(html, /Watch the social video/);
  assert.match(html, /28-second Couples Alarm social launch video/);
  assert.match(html, /If the fit is not there, the app says so/);
  assert.equal((html.match(/<li><span>0[1-4]<\/span>/g) || []).length, 4);
});
