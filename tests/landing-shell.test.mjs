import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../landing.css", import.meta.url), "utf8");
const videoScript = await readFile(new URL("../assets/homepage-video.js", import.meta.url), "utf8");
const ruleBody = (selector) => {
  const at = css.indexOf(`\n${selector} {`);
  assert.notEqual(at, -1, `expected a ${selector} rule`);
  return css.slice(at, css.indexOf("}", at));
};

test("retains the story and animates the app showcase in the dawn landing", () => {
  assert.match(html, /class="hero-copy"/);
  assert.match(html, /class="product-preview"/);
  assert.match(html, /class="app-showcase" aria-label="Couples Alarm walkthrough/);
  assert.match(html, /<video autoplay muted loop playsinline[^>]*poster="assets\/setup-together-300\.webp[^"]*"[^>]*>\s*<source src="assets\/couples-alarm-walkthrough\.mp4" type="video\/mp4">/);
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
  assert.match(html, /<a class="app-store-link" href="https:\/\/apps\.apple\.com\/us\/app\/couples-alarm\/id6792771975">[\s\S]*alt="Download on the App Store"/);
  assert.doesNotMatch(html, /morning-steps|aria-label="How Couples Alarm works"/);
});

test("permits responsive reflow and keeps controls in the video player", () => {
  assert.match(ruleBody("body"), /overflow-y:\s*auto/);
  assert.doesNotMatch(ruleBody("html"), /overflow:\s*hidden/);
  assert.match(ruleBody(".site-shell"), /min-height:\s*100svh/);
  assert.match(css, /button:focus-visible/);
  assert.match(css, /\.site-header nav a \{[\s\S]*min-height: 44px/);
  assert.match(html, /<a class="video-open" href="assets\/couples-alarm-preview\.mp4[^"]*"[^>]*>\s*<video id="product-preview" preload="none" muted playsinline/);
  assert.match(html, /<dialog class="video-dialog" aria-labelledby="video-title">[\s\S]*<button class="video-close" type="button" autofocus>/);
  assert.match(html, /<video id="story-player" controls playsinline preload="none" aria-labelledby="video-title"><\/video>/);
  assert.doesNotMatch(html, /<video id="(?:product-preview|story-player)"[^>]*\bautoplay\b/);
  assert.match(ruleBody(".product-preview video"), /height:\s*auto/);
  assert.match(ruleBody(".product-preview video"), /object-fit:\s*contain/);
  assert.doesNotMatch(ruleBody(".product-preview video"), /max-height/);
  assert.match(css, /@media \(hover: hover\) and \(pointer: fine\) \{\s*\.video-open \{[^}]*\}\s*\.video-open:hover \{ transform: translateY\(-3px\)/);
});

test("puts the sound test directly before the store badges", () => {
  assert.match(html, /class="hero-lede"[^>]*>[^<]*<\/p>\s*<div class="hero-actions">\s*<a class="tone-test-primary" href="compatibility\/">\s*<img class="tone-test-wave"[^>]*alt="" aria-hidden="true">\s*<span>Try the sound test<\/span>\s*<\/a>\s*<div class="app-badges">/);
  assert.doesNotMatch(html, /About 2 minutes|free two-minute sound test|Hear it for yourself/i);
});

test("sound test button has a visible boundary and animated waveform", () => {
  assert.match(ruleBody(".tone-test-primary"), /min-height: 54px/);
  assert.match(ruleBody(".tone-test-primary"), /border: 1px solid/);
  assert.match(ruleBody(".tone-test-wave"), /animation: tone-wave-breathe 2.4s ease-in-out infinite/);
  assert.match(css, /tone-test-primary:focus-visible \{ outline: 3px/);
});

test("homepage media has no separate motion controls or gating", () => {
  const source = [html, css, videoScript].join("\n");
  assert.doesNotMatch(source, /preview-toggle|Pause preview|Resume preview|wave-toggle|prefers-reduced-motion/);
});
