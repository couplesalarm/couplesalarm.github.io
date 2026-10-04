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

test("keeps the direct test action and accurate wording", () => {
  assert.match(html, /<meta name="description" content="Couples Alarm helps partners find and confirm a tone together\./);
  assert.match(html, /landing\.css\?v=20261004-android-path-1/);
  assert.match(html, /For couples who hear tones differently/);
  assert.match(html, /Find a tone<br><span>together\.<\/span>/);
  assert.match(html, /An alarm utility for couples who hear tones differently\. Choose who needs to wake first/);
  assert.doesNotMatch(html, /Wake up\.|Let them sleep|designed to wake one partner/);
  assert.match(html, /class="hero-actions"/);
  assert.match(
    html,
    /<a class="test-link" href="compatibility\/">[\s\S]*<img class="soundwave-icon" src="assets\/soundwave\.svg\?v=20260812-option3" alt="" aria-hidden="true">[\s\S]*<strong>Try the browser preview<\/strong>[\s\S]*<small>Confirm the fit in free iPhone setup<\/small>[\s\S]*<img src="assets\/chevron-right\.svg" alt="" aria-hidden="true">/,
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

test("explains eligibility, free fit and access before visitors commit", () => {
  const body = html.slice(html.indexOf('<body>'));
  assert.match(body, /Android · private testing/);
  assert.match(body, /There is no public Google Play download yet/);
  assert.match(body, /iPhone · iOS 26 or later/);
  assert.match(body, /Setup and the bedside fit check are free/);
  assert.match(body, /Completing setup starts one calendar month of full access/);
  assert.match(body, /\$9\.99 one-time lifetime purchase in the U\.S\., with no subscription/);
  assert.match(body, /person waking first can hear a tested tone their partner does not/);
  assert.match(body, /browser preview cannot confirm that fit/);
  assert.match(body, /keep using an alarm you trust/);
  assert.match(body, /No alarm setup guarantees/);
  assert.match(body, /not a medical assessment/);
  assert.match(body, /Already scheduled alarms remain active when the free month ends/);
});

test("keeps Android's future store path inactive while preserving the official iPhone badge", async () => {
  const download = await readFile(new URL("../download/index.html", import.meta.url), "utf8");
  const android = download.match(/<section class="notice android-testing"[\s\S]*?<\/section>/)?.[0];
  assert.ok(android, "Android availability section must remain visible");
  assert.match(android, /data-google-play-download="unavailable"/);
  assert.match(android, /no public Google Play listing or download link/);
  assert.doesNotMatch(android, /<a\b|<button\b|href=/);
  assert.doesNotMatch(html + download, /play\.google\.com\/store\/apps\/details/);
  assert.match(download, /developer\.apple\.com\/assets\/elements\/badges\/download-on-the-app-store\.svg/);
  assert.match(download, /alt="Download on the App Store"/);
});

test("search markup keeps the free download distinct from continued access", () => {
  const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(schema.operatingSystem, 'iOS 26.0 or later');
  assert.equal(schema.offers.price, '0');
  assert.equal(schema.offers.priceCurrency, 'USD');
  assert.match(schema.description, /Free setup and bedside fit check/);
  assert.match(schema.description, /one calendar month of full access starts after setup/);
  assert.match(schema.description, /\$9\.99 one-time lifetime purchase in the U\.S/);
  assert.equal(schema.downloadUrl, 'https://apps.apple.com/us/app/couples-alarm/id6792771975');
  assert.equal(schema.aggregateRating, undefined);
  assert.equal(schema.review, undefined);
});
