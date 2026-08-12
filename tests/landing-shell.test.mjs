import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../landing.css", import.meta.url), "utf8");
const soundwave = await readFile(new URL("../assets/soundwave.svg", import.meta.url), "utf8");
const chevron = await readFile(new URL("../assets/chevron-right.svg", import.meta.url), "utf8");

const ruleBody = (selector) => {
  const at = css.lastIndexOf(`\n${selector} {`);
  assert.notEqual(at, -1, `expected a ${selector} rule`);
  return css.slice(at, css.indexOf("}", at));
};

test("restores the three-part desktop landing", () => {
  assert.match(html, /class="hero-copy"/);
  assert.match(html, /class="product-preview"/);
  assert.match(html, /class="app-showcase"/);
  assert.match(html, /assets\/setup-together\.png\?v=20260730/);
  assert.match(css, /grid-template-columns: minmax\(23rem, 1\.12fr\) minmax\(14rem, 0\.62fr\) minmax\(16rem, 0\.7fr\)/);
  assert.match(css, /grid-template-areas: "copy preview showcase"/);
  assert.match(css, /\.app-showcase::before,[\s\S]*\.app-showcase::after/);
  assert.match(css, /\.showcase-phone \{[\s\S]*transform: rotate\(2\.5deg\)/);
});

test("keeps the direct test action and current wording", () => {
  assert.match(html, /<meta name="description" content="Take a quick test together to see if Couples Alarm could work for you\.">/);
  assert.match(html, /landing\.css\?v=20260812-option3-test-cta-v2/);
  assert.match(html, /For couples with different wake-up times/);
  assert.match(html, /Wake up\.<br><span>Let them sleep\.<\/span>/);
  assert.match(html, /Couples Alarm is designed to wake one partner while the other keeps sleeping\. Take the quick test together to see if it could work for you\./);
  assert.match(html, /class="hero-actions"/);
  assert.match(
    html,
    /<a class="test-link" href="compatibility\/">[\s\S]*<img class="soundwave-icon" src="assets\/soundwave\.svg\?v=20260812-option3" alt="" aria-hidden="true">[\s\S]*<strong>Test Couples Alarm first<\/strong>[\s\S]*<small>Quick two-person check before downloading<\/small>[\s\S]*<img src="assets\/chevron-right\.svg" alt="" aria-hidden="true">/,
  );
  assert.match(css, /\.test-link\s*\{[^}]*min-height:\s*max\(44px, 3\.5rem\)/);
  assert.match(ruleBody(".test-link"), /background:\s*linear-gradient\(105deg, #bd23df, #7358ef 54%, #27cbe3\)/);
  assert.match(ruleBody(".test-link"), /box-shadow:/);
  assert.match(
    html,
    /<a class="app-store-link" href="https:\/\/apps\.apple\.com\/us\/app\/couples-alarm\/id6792771975">[\s\S]*download-on-the-app-store\.svg[\s\S]*alt="Download on the App Store"/,
  );
  assert.match(css, /\.app-store-link\s*\{[^}]*min-height:\s*max\(44px, 3\.5rem\)/);
  assert.match(ruleBody(".app-store-link img"), /height:\s*3\.5rem/);
  assert.match(css, /\.soundwave-icon\s*\{\s*animation:\s*sound-pulse 1\.7s ease-in-out infinite;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.soundwave-icon\s*\{\s*animation:\s*none;/);
  assert.match(soundwave, /fill="#fff"/);
  assert.match(chevron, /class="bi bi-chevron-right"/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.hero-actions\s*\{\s*flex-wrap:\s*nowrap;/);
  assert.match(css, /width:\s*min\(19\.65rem, calc\(100% - 11\.1rem\)\)/);
  assert.match(css, /\.test-link small \{ font-size: 0\.6rem; white-space: nowrap; \}/);
  assert.match(css, /@media \(max-width: 487px\)[\s\S]*\.hero-actions\s*\{[^}]*flex-wrap:\s*wrap;/);
  assert.doesNotMatch(ruleBody(".app-store-link"), /animation/);
  assert.doesNotMatch(css, /\.hero-copy,\s*\.product-preview/);
  assert.match(css, /\.hero-copy > :not\(\.hero-actions\), \.product-preview/);
  assert.doesNotMatch(html, /compatibility-card|compatibility-test-couple|sound check|Can one of you hear|Compare what each of you hears/);
});

test("retains scrolling, accessible targets, and video behavior", () => {
  assert.match(ruleBody("body"), /overflow-y:\s*auto/);
  assert.doesNotMatch(ruleBody("html"), /overflow:\s*hidden/);
  assert.match(ruleBody(".site-shell"), /min-height:\s*100svh/);
  assert.match(ruleBody(".site-shell"), /grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(css, /button:focus-visible/);
  assert.match(css, /\.site-header nav a \{[\s\S]*min-height: 44px/);
  assert.match(html, /<video id="product-preview" preload="metadata"/);
  assert.doesNotMatch(html, /playsinline/);
  assert.match(html, /video\.webkitEnterFullscreen/);
  assert.match(html, /video\.requestFullscreen/);
  assert.match(html, /video\.onclick = \(\) => \{/);
  assert.match(html, /video\.controls = true/);
  assert.match(css, /video:fullscreen,[\s\S]*video:-webkit-full-screen\s*\{[^}]*object-fit:\s*contain/);
});
