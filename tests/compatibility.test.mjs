import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../compatibility/index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../compatibility/compatibility.css", import.meta.url), "utf8");
const script = await readFile(new URL("../compatibility/compatibility.js", import.meta.url), "utf8");

test("keeps partner responses anonymous and local", () => {
  assert.match(html, /Partner One/);
  assert.match(html, /Partner Two/);
  assert.doesNotMatch(html, /<input|enter your name|Alex|Jordan/i);
  assert.doesNotMatch(script, /localStorage|sessionStorage|document\.cookie|\bfetch\s*\(|XMLHttpRequest|sendBeacon/);
});

test("opens on the test with concise setup and one explicit Start", () => {
  assert.doesNotMatch(html, /data-screen="ready"|data-start-preview|See if Couples Alarm|Start the test/);
  assert.match(html, /data-screen="listen" aria-labelledby="listen-title">/);
  assert.match(html, /No headphones/);
  assert.match(html, /Comfortable volume/);
  assert.match(html, /data-start-tone aria-describedby="listen-instruction">Start/);
});

test("keeps one prominent listening response and a separate pause without a start overlay", () => {
  assert.match(html, /class="primary-action listening-action"[^>]*data-heard/);
  assert.match(html, />I hear it</);
  assert.match(html, /class="text-action"[^>]*data-pause-tone/);
  assert.doesNotMatch(html, /start-tone-control|Start listening to the tone/);
});

test("keeps copy concise and avoids a hearing diagnosis or waking guarantee", () => {
  assert.doesNotMatch(html, /Stop if uncomfortable|This is not a hearing test/);
  assert.match(html, /Designed for the partner who hears higher pitches/);
  assert.match(html, /Confirm this range with a bedside alarm before relying on it/);
  assert.doesNotMatch(`${html}\n${script}`, /should wake|not disturb|promising match/i);
  assert.match(html, /data-result-for/);
  assert.match(html, /href="\.\.\/download\/" data-result-next/);
});

test("focuses each step heading and exposes state and failures", () => {
  assert.equal([...html.matchAll(/<h1\b/g)].length, 1);
  assert.equal([...html.matchAll(/<h2\b/g)].length, 2);
  assert.match(script, /visibleScreen\?\.querySelector\("h1, h2"\)/);
  assert.match(script, /heading\.focus\(\{ preventScroll: true \}\)/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /role="alert"/);
  assert.equal([...html.matchAll(/data-progress=/g)].length, 3);
  assert.match(html, /aria-current="step"/);
});

test("does not repeatedly announce the ticking frequency or countdown", () => {
  assert.match(html, /<p class="tone-readout" aria-hidden="true">/);
  assert.doesNotMatch(html, /data-audio-detail|seconds per turn|20 seconds/);
  assert.doesNotMatch(script, /seconds left/);
});

test("retains device-aware copy and Safari playback support", () => {
  assert.match(script, /iPhone\|iPod/);
  assert.match(script, /Built-in speakers/);
  assert.match(script, /phoneQuery\.addEventListener\("change", updateDeviceCopy\)/);
  assert.match(script, /navigator\.audioSession\.type = "playback"/);
  assert.match(script, /window\.AudioContext \|\| window\.webkitAudioContext/);
});

test("ties sweep cues to the audio clock without a per-frame loop", () => {
  assert.match(script, /audioContext\.currentTime - sweepStartedAt/);
  assert.match(script, /setProperty\("--sweep-duration", `\$\{sweepDuration\}ms`\)/);
  assert.match(css, /animation: orbit-sweep var\(--sweep-duration/);
  assert.doesNotMatch(script, /requestAnimationFrame|drawVisualizer/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("keeps responsive controls reachable in document flow", () => {
  assert.match(css, /touch-action: manipulation/);
  assert.match(css, /min-height: 6\.5rem/);
  assert.match(css, /min-height: 48px/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.doesNotMatch(css, /overflow-y:\s*hidden|[;{]\s*height:\s*100svh/);
  assert.match(html, /assets\/compatibility-flow-couple\.png/);

});
