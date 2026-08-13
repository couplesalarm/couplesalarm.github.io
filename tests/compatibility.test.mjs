import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(
  new URL("../compatibility/index.html", import.meta.url),
  "utf8",
);
const css = await readFile(
  new URL("../compatibility/compatibility.css", import.meta.url),
  "utf8",
);
const script = await readFile(
  new URL("../compatibility/compatibility.js", import.meta.url),
  "utf8",
);

test("uses anonymous two-partner language throughout the preview", () => {
  assert.match(html, /Partner One/);
  assert.match(html, /Partner Two/);
  assert.doesNotMatch(html, /<input|enter your name|Alex|Jordan/i);
  assert.doesNotMatch(script, /localStorage|sessionStorage|document\.cookie/);
});

test("keeps the preview device-aware and honest about its limits", () => {
  assert.match(script, /iPhone\|iPod/);
  assert.match(script, /Built-in speakers/);
  assert.match(html, /Stop if uncomfortable/);
  assert.match(html, /This is not a hearing test/);
  assert.match(html, /Confirm this range with a bedside alarm before relying on it/);
});

test("runs both listening turns locally with Web Audio", () => {
  assert.match(script, /window\.AudioContext \|\| window\.webkitAudioContext/);
  assert.match(script, /navigator\.audioSession\.type = "playback"/);
  assert.match(script, /const startFrequency = 17500/);
  assert.match(script, /const endFrequency = 8500/);
  assert.match(script, /const sweepDuration = 20000/);
  assert.match(script, /gain\.gain\.exponentialRampToValueAtTime\(0\.14/);
  assert.match(script, /responses\[listeningOrder\[turn\]\]/);
  assert.match(script, /notHeardButton\.disabled = true/);
  assert.match(script, /if \(sweepPlaying\) return/);
  assert.match(script, /const activeVoices = new Set\(\)/);
  assert.match(script, /let sweepTimer/);
  assert.match(script, /window\.setTimeout/);
  assert.match(script, /window\.clearTimeout/);
  assert.match(script, /voice\.gain\.gain\.setValueAtTime\(0, now\)/);
  assert.match(script, /activeVoices\.forEach\(stopVoice\)/);
  assert.match(script, /if \(run !== toneRun\) return/);
  assert.match(
    script,
    /startToneButton\.hidden = true;\s*startToneButton\.disabled = true;[\s\S]*await audioContext\.resume\(\)/,
  );
  assert.match(script, /window\.addEventListener\("pagehide", closeAudio\)/);
  assert.match(script, /showResult\(\)/);
  assert.doesNotMatch(script, /requestAnimationFrame|drawVisualizer/);
  assert.doesNotMatch(html, /data-audio-detail/);
  assert.doesNotMatch(script, /\bfetch\s*\(|XMLHttpRequest|sendBeacon/);
});

test("keeps one clear timed response action", () => {
  assert.match(html, /Stop — I hear it/);
  assert.doesNotMatch(`${html}\n${script}`, /End sound|data-stop-tone|stop-tone-action/);
  assert.match(
    script,
    /\[data-heard\]"\)\.addEventListener\("click",[\s\S]*finishTurn\(frequencyAt\(progress\)\)/,
  );
});

test("starts the tone as an explicit listening action", () => {
  assert.match(html, /aria-label="Start listening to the tone"/);
  assert.match(html, />Start listening</);
  assert.match(html, /The tone begins immediately/);
  assert.doesNotMatch(html, /Play sound/);
  assert.match(css, /\.start-tone-control\s*\{[\s\S]*linear-gradient\(105deg, var\(--signal\)/);
});

test("keeps every step concise", () => {
  assert.match(html, /See if Couples Alarm could/);
  assert.match(html, /work for you/);
  assert.match(html, /Take the test together on this device/);
  assert.match(html, /Start the test/);
  assert.doesNotMatch(html, /sound check|Can one of you hear|Compare what each of you hears/);
  assert.doesNotMatch(
    html,
    /About 2 minutes|Nothing is saved|Needs to wake up|Switch partner/,
  );
  assert.match(html, /A possible match/);
  assert.match(html, /Confirm this range with a bedside alarm before relying on it/);
  assert.doesNotMatch(`${html}\n${script}`, /heard tones .* did not/);
  assert.doesNotMatch(`${html}\n${script}`, /should wake|not disturb/i);
  assert.doesNotMatch(script, /Try switching roles|Switch who wakes up/);
  assert.doesNotMatch(`${html}\n${script}`, /This may work|promising match/i);
  assert.doesNotMatch(html, /readiness-list|listen-safety/);
});

test("keeps one page heading while focusing each step heading", () => {
  assert.equal([...html.matchAll(/<h1\b/g)].length, 1);
  assert.equal([...html.matchAll(/<h2\b/g)].length, 3);
  assert.match(script, /visibleScreen\?\.querySelector\("h1, h2"\)/);
});

test("warns against headphones wherever the tone can be played", () => {
  assert.match(html, /only — no headphones/);
  assert.doesNotMatch(html, /Quiet room · <span data-speaker-title>/);
});

test("recovers the turn after the page is backgrounded", () => {
  // Re-showing the start button without re-enabling it stranded the turn.
  assert.match(
    script,
    /visibilitychange[\s\S]*\[data-start-tone\]"\)\.hidden = false;\s*[\s\S]{0,160}?\[data-start-tone\]"\)\.disabled = false;/,
  );
});

test("re-evaluates device copy when the viewport changes", () => {
  assert.match(script, /const phoneQuery = window\.matchMedia\("\(max-width: 720px\)"\)/);
  assert.match(script, /phoneQuery\.addEventListener\("change", updateDeviceCopy\)/);
  assert.match(script, /phoneQuery\.matches/);
  assert.match(script, /Take the test together on this iPhone/);
  assert.match(script, /Take the test together on this phone/);
});

test("ties the sweep animation to the audio clock", () => {
  // The wave stretch and the travelling head both run off --sweep-duration,
  // which the script sets from sweepDuration, so they cannot drift apart.
  assert.match(script, /setProperty\("--sweep-duration", `\$\{sweepDuration\}ms`\)/);
  assert.match(
    css,
    /\.listening-stage\.is-sweeping \.tone-wave-group\s*\{[\s\S]*animation: tone-stretch var\(--sweep-duration/,
  );
  assert.match(
    css,
    /\.listening-stage\.is-sweeping \.tone-head\s*\{[\s\S]*animation: tone-travel var\(--sweep-duration/,
  );
  assert.match(css, /@keyframes tone-stretch\s*\{[\s\S]*scaleX\(/);
  assert.match(css, /\.tone-head\s*\{[\s\S]*offset-path:\s*path\(/);
});

test("shows the live frequency readout the app shows", () => {
  assert.match(html, /data-frequency-readout/);
  assert.match(html, /kHz/);
  assert.match(script, /const frequencyAt = \(progress\) =>/);
  assert.match(script, /window\.setInterval\(tick/);
  assert.match(script, /window\.clearInterval\(readoutTimer\)/);
  // Decorative to assistive tech: it changes many times a second and the
  // status line already carries the state.
  assert.match(html, /<p class="tone-readout" aria-hidden="true">/);
});

test("shows recorded thresholds and the possible alarm sweet spot", () => {
  assert.match(html, /data-first-result/);
  assert.match(html, /Partner frequency results/);
  assert.match(html, /data-sweet-spot-value/);
  assert.match(html, /data-sweet-spot-band/);
  assert.match(html, /data-result-marker-one/);
  assert.match(html, /data-result-marker-two/);
  assert.match(html, /data-result-endpoint-one/);
  assert.match(html, /data-result-endpoint-two/);
  assert.match(script, /const responseText = \(hz\) =>/);
  assert.match(script, /const sweetSpotMargin = 300/);
  assert.match(script, /const frequencyPosition = \(hz\) =>/);
  assert.match(script, /responses\[matchedPartner\] - sweetSpotMargin/);
  assert.match(script, /responses\[otherPartner\] \?\? endFrequency\) \+ sweetSpotMargin/);
  assert.match(script, /responseText\(responses\[0\]\)/);
  assert.match(script, /responseText\(responses\[1\]\)/);
  assert.match(script, /endpointOne\.style\.order/);
  assert.match(script, /endpointTwo\.style\.order/);
  assert.match(script, /classList\.toggle\("has-range", hasRange\)/);
  assert.match(script, /sweetSpotBand\.style\.left/);
  assert.match(script, /sweetSpotBand\.style\.width/);
  assert.match(html, /Lower pitch/);
  assert.match(html, /Higher pitch/);
  assert.match(script, /No clear alarm sweet spot/);
  assert.match(script, /Possible alarm sweet spot from/);
  assert.doesNotMatch(
    html,
    /data-result-summary|data-sweet-spot-detail/,
  );
});

test("keeps the sweep cues under reduced motion", () => {
  const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /\.tone-emit,/);
  assert.doesNotMatch(reduced, /tone-wave-group|tone-head\s*\{/);
});

test("shows sweep progress without a per-frame loop", () => {
  assert.match(html, /data-sweep-progress/);
  assert.match(script, /transitionDuration = `\$\{sweepDuration\}ms`/);
  assert.match(css, /\.sweep-fill\s*\{[\s\S]*transition:\s*transform linear/);
  assert.doesNotMatch(script, /requestAnimationFrame/);
});

test("restores the visual story without restoring the busy audio loop", () => {
  assert.match(html, /class="ready-scene"/);
  assert.match(html, /class="tone-visualizer"/);
  assert.match(
    css,
    /\.tone-visualizer\s*\{[\s\S]*pointer-events:\s*none/,
  );
  assert.doesNotMatch(script, /requestAnimationFrame|drawVisualizer/);
});

test("keeps test controls accessible on mobile", () => {
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-current="step"/);
  assert.match(html, /role="alert"/);
  assert.match(script, /heading\.focus\(\{ preventScroll: true \}\)/);
  assert.match(script, /window\.scrollTo\(0, 0\)/);
  assert.match(script, /heardButton\.focus\(\{ preventScroll: true \}\)/);
  assert.match(script, /notHeardButton\.focus\(\{ preventScroll: true \}\)/);
  assert.match(script, /startToneButton\.focus\(\{ preventScroll: true \}\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(
    css,
    /@media \(max-width: 760px\) and \(max-height: 700px\)[\s\S]*overflow-y:\s*auto/,
  );
  assert.match(css, /button\s*\{[\s\S]*touch-action:\s*manipulation/);
  assert.match(css, /\.site-header nav a\s*\{[\s\S]*min-width:\s*48px/);
  assert.match(
    css,
    /\.listening-action\s*\{[\s\S]*min-height:\s*6\.5rem/,
  );
  assert.match(
    css,
    /\.ready-actions \[data-start-preview\]\s*\{[\s\S]*min-height:\s*6\.5rem/,
  );
  assert.match(
    css,
    /\.listening-stage > \.text-action\s*\{[\s\S]*min-height:\s*4rem/,
  );
  assert.match(
    css,
    /@media \(max-height: 640px\) and \(min-width: 761px\)[\s\S]*height:\s*100svh[\s\S]*min-height:\s*22rem/,
  );
  assert.doesNotMatch(css, /min-height:\s*32rem/);
  assert.match(
    css,
    /@media \(max-height: 640px\) and \(min-width: 761px\)[\s\S]*\.ready-scene\s*\{[\s\S]*max-width:\s*none/,
  );
  assert.match(css, /\.progress-step\s*\{[\s\S]*font-size:\s*0\.7rem/);
  assert.match(css, /\.listen-copy > p:not\(\.eyebrow\)\s*\{[\s\S]*font-size:\s*0\.82rem/);
});

test("keeps desktop test steps composed instead of stretching edge to edge", () => {
  const desktop = css.slice(
    css.indexOf("@media (min-width: 761px)"),
    css.indexOf("@media (max-height: 640px) and (min-width: 761px)"),
  );
  assert.match(desktop, /\.ready-screen\s*\{[\s\S]*width:\s*min\(68rem, 100%\)/);
  assert.match(desktop, /\.ready-scene\s*\{[\s\S]*max-width:\s*none/);
  assert.match(desktop, /\.listen-screen\s*\{[\s\S]*width:\s*min\(68rem, 100%\)/);
  assert.match(desktop, /max-height:\s*min\(38rem, 100%\)/);
});
