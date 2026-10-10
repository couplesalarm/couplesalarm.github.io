import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../landing.css", import.meta.url), "utf8");
const ruleBody = (selector) => {
  const at = css.indexOf(`\n${selector} {`);
  assert.notEqual(at, -1, `expected a ${selector} rule`);
  return css.slice(at, css.indexOf("}", at));
};

test("retains the original story and app artwork in the dawn landing", () => {
  assert.match(html, /class="hero-copy"/);
  assert.match(html, /class="product-preview"/);
  assert.match(html, /class="app-showcase"/);
  assert.match(html, /assets\/setup-together\.png\?v=20260730/);
  assert.match(html, /assets\/couples-alarm-preview-poster\.jpg\?v=20260730-social-launch/);
  assert.match(html, /assets\/couples-alarm-preview\.mp4\?v=20260730-social-launch/);
  assert.match(html, /class="dawn-scene" aria-hidden="true"/);
});

test("leads with the iPhone download and preserves the secondary listening test", () => {
  assert.match(html, /<meta name="description" content="A personalized iPhone alarm utility for couples who hear tones differently\./);
  assert.match(html, /For couples who hear tones differently/);
  assert.match(html, /An iPhone alarm<br><span>app for couples\.<\/span>/);
  assert.match(html, /Love the snooze button\?/);
  assert.match(html, /whether you hear a tone your partner doesn’t, then confirm it together at your bedside/);
  assert.doesNotMatch(html, /Wake up\.|Let them sleep|designed to wake one partner/);
  assert.match(html, /<a class="test-link" href="https:\/\/apps\.apple\.com\/us\/app\/couples-alarm\/id6792771975">\s*<strong>Download for iPhone<\/strong>/);
  assert.match(html, /<a class="app-store-link" href="https:\/\/apps\.apple\.com\/us\/app\/couples-alarm\/id6792771975">[\s\S]*alt="Download on the App Store"/);
  assert.match(html, /<p class="cta-note">iPhone · iOS 26 or later<\/p>/);
  assert.match(html, /<a class="listening-test-link" href="compatibility\/">Try the listening test<\/a>/);
  assert.ok(html.indexOf("Download for iPhone") < html.indexOf("Try the listening test"));
  assert.match(html, /aria-label="How Couples Alarm works"/);
});

test("retains scrolling, accessible targets, and user-initiated video behavior", () => {
  assert.match(ruleBody("body"), /overflow-y:\s*auto/);
  assert.doesNotMatch(ruleBody("html"), /overflow:\s*hidden/);
  assert.match(ruleBody(".site-shell"), /min-height:\s*100svh/);
  assert.match(css, /button:focus-visible/);
  assert.match(css, /\.site-header nav a \{[\s\S]*min-height: 44px/);
  assert.match(html, /<video id="product-preview" preload="metadata"/);
  assert.doesNotMatch(html, /<video[^>]*(?:autoplay|playsinline)/);
  assert.match(html, /video\.webkitEnterFullscreen/);
  assert.match(html, /video\.requestFullscreen/);
  assert.match(html, /video\.onclick = \(\) => \{/);
  assert.match(html, /video\.controls = true/);
  assert.match(css, /video:fullscreen,[\s\S]*video:-webkit-full-screen\s*\{[^}]*object-fit:\s*contain/);
  assert.match(ruleBody(".product-preview video"), /height:\s*auto/);
  assert.match(ruleBody(".product-preview video"), /object-fit:\s*contain/);
  assert.doesNotMatch(ruleBody(".product-preview video"), /max-height/);
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\)/);
  assert.match(html, /prefers-reduced-motion: reduce/);
  assert.match(html, /Pause background motion/);
  assert.match(css, /\.motion-paused \.dawn-light \{ animation-play-state: paused; \}/);
});
