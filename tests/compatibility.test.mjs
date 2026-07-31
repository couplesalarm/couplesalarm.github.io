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
  assert.match(html, /Nothing is saved/);
  assert.doesNotMatch(html, /<input|enter your name|Alex|Jordan/i);
  assert.doesNotMatch(script, /localStorage|sessionStorage|document\.cookie/);
});

test("keeps the preview device-aware and honest about its limits", () => {
  assert.match(script, /iPhone\|iPod/);
  assert.match(script, /Built-in speakers/);
  assert.match(html, /Stop if uncomfortable/);
  assert.match(html, /Preview only—not a hearing test/);
  assert.match(html, /Confirm any match with a real bedside alarm/);
});

test("runs both listening turns locally with Web Audio", () => {
  assert.match(script, /window\.AudioContext \|\| window\.webkitAudioContext/);
  assert.match(script, /const startFrequency = 17500/);
  assert.match(script, /const endFrequency = 8500/);
  assert.match(script, /const sweepDuration = 12000/);
  assert.match(script, /gain\.gain\.exponentialRampToValueAtTime\(0\.14/);
  assert.match(script, /responses\[listeningOrder\[turn\]\]/);
  assert.match(script, /notHeardButton\.disabled = true/);
  assert.match(script, /if \(sweepPlaying\) return/);
  assert.match(script, /data-stop-tone/);
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

test("makes the timed response one clear stop action without removing the safety retry", () => {
  assert.match(html, /Stop — I hear it/);
  assert.match(html, /End sound &amp; retry/);
  assert.doesNotMatch(html, />Stop<\/button>/);
  assert.match(
    script,
    /\[data-heard\]"\)\.addEventListener\("click",[\s\S]*finishTurn\(frequencyAt\(progress\)\)/,
  );
  assert.match(
    script,
    /\[data-stop-tone\]"\)\.addEventListener\("click",[\s\S]*stopTone\(\);\s*prepareTurn\(\)/,
  );
});

test("keeps every step concise", () => {
  assert.match(html, /Can one of you hear what the other/);
  assert.match(html, /About 2 minutes · Nothing is saved/);
  assert.match(html, /This tone should wake Partner One—not Partner Two/);
  assert.match(
    script,
    /This tone should wake \$\{partnerLabels\[wakingPartner\]\}—not \$\{partnerLabels\[sleepingPartner\]\}/,
  );
  assert.doesNotMatch(`${html}\n${script}`, /This may work|promising match/i);
  assert.doesNotMatch(html, /readiness-list|listen-safety/);
});

test("quotes the same duration as the landing page", async () => {
  const landing = await readFile(
    new URL("../index.html", import.meta.url),
    "utf8",
  );
  assert.match(landing, /2-minute sound check/);
  assert.match(html, /About 2 minutes/);
  assert.doesNotMatch(html, /About 1 minute/);
});

test("warns against headphones wherever the tone can be played", () => {
  assert.match(html, /Quiet room · <span data-speaker-title>[^<]*<\/span>, no headphones/);
  assert.match(html, /only — no headphones/);
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
  assert.match(
    script,
    /querySelector\("\[data-start-tone\]"\)\.focus\(\{ preventScroll: true \}\)/,
  );
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
    /\.ready-actions \[data-start-preview\]\s*\{[\s\S]*min-height:\s*5\.75rem/,
  );
  assert.match(
    css,
    /\.listening-stage > \.text-action\s*\{[\s\S]*min-height:\s*4rem/,
  );
  assert.match(
    css,
    /@media \(max-height: 640px\) and \(min-width: 761px\)[\s\S]*height:\s*auto[\s\S]*min-height:\s*32rem/,
  );
  assert.match(css, /\.progress-step\s*\{[\s\S]*font-size:\s*0\.7rem/);
  assert.match(css, /\.listen-copy > p:not\(\.eyebrow\)\s*\{[\s\S]*font-size:\s*0\.82rem/);
});
