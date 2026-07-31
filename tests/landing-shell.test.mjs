import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../landing.css", import.meta.url), "utf8");

// Scope a rule body so these assertions cannot be satisfied by a match
// hundreds of lines away, which is how the old `[\s\S]*` versions passed
// after the properties they were guarding had already changed.
// A blank line before the selector anchors this to the whole selector list,
// so asking for `body` cannot return the `html, body` rule above it.
const ruleBody = (selector) => {
  const at = css.indexOf(`\n\n${selector} {`);
  assert.notEqual(at, -1, `expected a ${selector} rule`);
  return css.slice(at, css.indexOf("}", at));
};

test("keeps the landing page in one viewport", () => {
  assert.match(html, /class="site-shell"/);
  assert.match(ruleBody(".site-shell"), /min-height:\s*100svh/);
  assert.doesNotMatch(
    html,
    /preview-section|steps-section|honesty-section|privacy-section|release-section/,
  );
});

test("never traps content the viewport cannot fit", () => {
  // One screen is the look, not a cage. `overflow: hidden` on the body left
  // the compatibility CTA ~310px past the fold at 200% text size with no
  // scroll available, so the page's only working action was unreachable.
  const body = ruleBody("body");
  assert.doesNotMatch(body, /overflow:\s*hidden/);
  assert.match(body, /overflow-y:\s*auto/);
  assert.doesNotMatch(ruleBody(".site-shell"), /(?<!min-)height:\s*100svh;/);
  // html clipped too, so the body's scroll had nowhere to go.
  assert.doesNotMatch(ruleBody("html"), /overflow:\s*hidden/);
  assert.doesNotMatch(ruleBody("html,\nbody"), /(?<!min-)height:\s*100%/);
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
  assert.match(html, /assets\/compatibility-test-couple\.png\?v=20260730/);
  // The card headline and CTA are live text at every width. The old baked
  // poster froze both into a PNG above 720px.
  assert.doesNotMatch(html, /compatibility-card-poster/);
  assert.doesNotMatch(css, /\.compatibility-poster/);
  assert.match(
    css,
    /\.compatibility-art,\s*\.compatibility-heading,\s*\.card-phone,\s*\.compatibility-cta\s*\{\s*display: block/,
  );
  assert.match(css, /aspect-ratio:\s*554 \/ 820/);
  // The card asks the same question the page it opens asks, so the promise and
  // the destination match.
  assert.match(html, /Can one of you hear[\s\S]*what the other can’t\?/);
  assert.doesNotMatch(html, /work for you two/);
  assert.match(html, /Compare what each of you hears/);
  assert.match(html, /2-minute sound check/);
  assert.doesNotMatch(html, /Start the (?:2|two)-minute test/);
  assert.match(html, /28-second video/);
  assert.match(html, /See how Couples Alarm works/);
  assert.match(css, /@media \(min-width: 901px\)/);
  assert.match(css, /grid-template-columns:\s*minmax\(5rem, 0\.75fr\) minmax\(0, 1fr\)/);
  assert.match(css, /animation:\s*invite-play[^;]*infinite/);
  assert.doesNotMatch(html, /No names required/);
  assert.match(html, /assets\/setup-together\.png\?v=20260730/);
  // Availability is a status line, not a dead control, and there is still no
  // live store link to click before the app is approved.
  assert.match(html, /<p class="store-state">Coming soon to the App Store<\/p>/);
  assert.doesNotMatch(html, /apps\.apple\.com|itunes\.apple\.com/);
  assert.doesNotMatch(html, /class="store-state"[^>]*disabled/);
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
  assert.match(
    css,
    /@media \(orientation: landscape\) and \(max-width: 960px\) and \(max-height: 520px\)/,
  );
  assert.match(
    css,
    /grid-template-areas:\s*"copy preview card"/,
  );
  assert.match(html, /orientation: landscape[\s\S]*max-width: 960px/);
});
