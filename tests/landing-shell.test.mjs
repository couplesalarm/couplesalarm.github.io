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
  assert.match(html, /assets\/couples-alarm-preview-poster-576\.webp\?v=20261016/);
  assert.match(html, /assets\/couples-alarm-preview\.mp4\?v=20261116-720p/);
  assert.match(html, /class="dawn-scene" aria-hidden="true"/);
});

test("keeps descriptive product copy with direct app download actions", () => {
  assert.match(html, /<title>Couples Alarm — iPhone Alarms for Different Wake-Up Times<\/title>/);
  assert.match(html, /People hear high pitches differently, so a quick test together can find an alarm tone only one of you hears\./);
  assert.match(html, /<meta name="description" content="An iPhone and Android alarm for couples with different wake-up times\./);
  assert.doesNotMatch(html, /class="eyebrow"/);
  assert.match(html, /Your alarm doesn’t<br><span>have to be theirs\.<\/span>/);
  assert.match(html, /<p class="hero-lede">For couples with different wake-up times\./);
  assert.doesNotMatch(html, /Wake up\.|Let them sleep|designed to wake one partner/);
  assert.doesNotMatch(html, /Get Couples Alarm|class="test-link"|class="cta-note"/);
  assert.doesNotMatch(html, /class="download-details"/);
  const footer = html.match(/<footer[\s\S]*?<\/footer>/)[0];
  assert.match(footer, /class="social-nav"/);
  assert.doesNotMatch(footer, /Partner with us|How it works|pricing|Google Play|Free setup/);
  assert.match(html, /Partner with us<\/a>\s*<a href="how-it-works\/">How it works<\/a>/);
  assert.match(html, /<h2 id="tone-test-title">Will it work for both of you\?<\/h2>/);
  assert.match(html, /Try the free two-minute sound test\./);
  assert.match(html, /class="tone-test-primary" href="compatibility\/">[\s\S]*?<span>Hear it for yourself<\/span>/);
  assert.match(html, /assets\/how-it-works\/tone-test-480.webp/);
  assert.match(css, /\.tone-test-content p \{ max-width: 62ch;/);
  assert.match(html, /<a class="app-store-link" href="https:\/\/apps\.apple\.com\/us\/app\/couples-alarm\/id6792771975">[\s\S]*alt="Download on the App Store"/);
  assert.doesNotMatch(html, /morning-steps|aria-label="How Couples Alarm works"/);
});

test("permits accessible reflow and retains user-initiated video behavior", () => {
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
  assert.doesNotMatch(html, /motion-toggle|Pause background motion/);
  assert.doesNotMatch(css, /dawn-drift|animation-play-state/);
});

 test("proof card is compact with a single focused action", () => {
  assert.match(ruleBody(".tone-test-card"), /background: none/);
  assert.match(ruleBody(".tone-test-card"), /border: 0/);
  assert.ok(html.indexOf('class="tone-test-card"') < html.indexOf('class="hero-media"'));
  assert.doesNotMatch(html, /See how it works/);
});

test("soundwave CTA keeps accessible name, contrast and reduced-motion defaults", () => {
  assert.match(html, /class="tone-test-wave"[^>]*alt="" aria-hidden="true"/);
  assert.match(css, /background: #a4e8f0; color: #080f20/);
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\) \{\s*\.tone-test-wave \{ animation: tone-wave-breathe 4.5s ease-in-out 1;/);
  assert.match(css, /tone-test-primary:focus-visible \{ outline: 3px/);
});
