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

test("keeps the social video and compatibility preview on the landing page", () => {
  assert.match(
    html,
    /assets\/couples-alarm-preview\.mp4\?v=20260730-social-launch/,
  );
  assert.match(html, /Play the Couples Alarm story/);
  assert.match(html, /<video id="product-preview" preload="metadata"/);
  assert.doesNotMatch(html, /<video id="product-preview"[^>]*\scontrols(?:\s|>)/);
  assert.doesNotMatch(html, /playsinline/);
  assert.match(html, /class="video-play-button"/);
  assert.match(html, /aria-label="Play the Couples Alarm video"/);
  assert.match(html, /const playVideo = \(\) => \{/);
  assert.match(html, /video\.play\(\)\.catch\(showPosterState\)/);
  assert.match(html, /playButton\.onclick = playVideo/);
  assert.match(html, /video\.onclick = \(\) => \{/);
  assert.match(html, /if \(video\.paused\) playVideo\(\)/);
  assert.match(html, /video\.onplaying = \(\) => \{/);
  assert.match(html, /video\.controls = true/);
  assert.match(html, /video\.onended = showPosterState/);
  assert.doesNotMatch(html, /video\.onpause/);
  assert.match(css, /\.video-play-button\[hidden\]\s*\{[\s\S]*display:\s*none/);
  assert.match(css, /\.product-preview video\s*\{[\s\S]*cursor:\s*pointer/);
  assert.match(css, /\.video-play-button:not\(\[hidden\]\)\s*\{[\s\S]*animation:\s*invite-play/);
  assert.match(html, /Wake up\.<br><span>Let them sleep\.<\/span>/);
  assert.match(html, /Find a tone one of you hears and the other doesn’t/);
  assert.match(html, /class="compatibility-card" href="compatibility\/"/);
  assert.match(html, /assets\/compatibility-card-poster\.png\?v=20260730/);
  assert.match(html, /assets\/compatibility-test-couple\.png\?v=20260730/);
  assert.match(html, /media="\(min-width: 721px\)"/);
  assert.match(html, /media="\(max-width: 720px\)"/);
  assert.match(css, /aspect-ratio:\s*554 \/ 820/);
  assert.match(html, /Could this[\s\S]*work for you two\?/);
  assert.match(html, /Start the 2-minute test/);
  assert.match(html, /No names required/);
  assert.match(html, /assets\/setup-together\.png\?v=20260730/);
  assert.match(html, /<button class="store-state" type="button" disabled/);
  assert.match(html, />Coming Soon<\/button>/);
  assert.match(html, /video\.webkitEnterFullscreen/);
  assert.match(html, /video\.requestFullscreen/);
  assert.doesNotMatch(
    html,
    /Four steps|class="fit-check"|Watch the social video|No guesswork|Social launch film|Couples Alarm launch film|iOS 26\+|App Store approval pending|Local by design|Profiles and alarms stay|Made for real mornings|One-time and weekly alarms|No account|No microphone|No subscription|\$9\.99 once|Test separately|compare the results|proof-list|Footer navigation|play-preview|Try it tonight|Confirm the tone together before morning|For couples with different wake-up times|Take a quick listening test together/,
  );
});

test("keeps the primary mobile actions reachable in one viewport", () => {
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(
    css,
    /\.hero\s*\{[\s\S]*grid-template-rows:\s*auto minmax\(0, 1fr\)/,
  );
  assert.match(
    css,
    /\.site-header nav a\s*\{[\s\S]*min-height:\s*44px/,
  );
  assert.match(
    css,
    /\.compatibility-cta\s*\{[\s\S]*min-height:\s*3\.4rem/,
  );
});
