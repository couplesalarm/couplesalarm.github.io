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

test("shows setup and immediate playback notice before the only initial start", () => {
  const ready = html.slice(html.indexOf('data-screen="ready"'), html.indexOf('data-screen="listen"'));
  assert.match(ready, /No headphones/);
  assert.match(ready, /comfortable volume/);
  assert.match(ready, /Tap as soon as you hear/);
  assert.match(ready, /20 seconds/);
  assert.match(ready, /Sound starts immediately/);
  assert.match(ready, /Stop if uncomfortable/);
  assert.equal([...ready.matchAll(/<button\b/g)].length, 1);
  assert.match(ready, /aria-describedby="start-notice"/);
  const handoff = html.slice(html.indexOf('data-screen="handoff"'), html.indexOf('data-screen="result"'));
  assert.match(handoff, /no headphones/);
  assert.match(handoff, /Sound starts immediately/);
  assert.equal([...handoff.matchAll(/<button\b/g)].length, 1);
});

test("keeps one prominent listening response and a separate pause without a start overlay", () => {
  assert.match(html, /class="primary-action listening-action"[^>]*data-heard/);
  assert.match(html, />I hear it</);
  assert.match(html, /Stops the tone and saves your response/);
  assert.match(html, /class="text-action"[^>]*data-pause-tone/);
  assert.match(html, /data-start-tone hidden disabled/);
  assert.doesNotMatch(html, /start-tone-control|Start listening to the tone/);
});

test("keeps copy concise and avoids a hearing diagnosis or waking guarantee", () => {
  assert.match(html, /This is not a hearing test/);
  assert.match(html, /Confirm this range with a bedside alarm before relying on it/);
  assert.doesNotMatch(`${html}\n${script}`, /should wake|not disturb|promising match/i);
  assert.match(html, /data-result-for/);
  assert.match(html, /href="\.\.\/download\/" data-result-next/);
});

test("focuses each step heading and exposes state and failures", () => {
  assert.equal([...html.matchAll(/<h1\b/g)].length, 1);
  assert.equal([...html.matchAll(/<h2\b/g)].length, 3);
  assert.match(script, /visibleScreen\?\.querySelector\("h1, h2"\)/);
  assert.match(script, /heading\.focus\(\{ preventScroll: true \}\)/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /role="alert"/);
  assert.equal([...html.matchAll(/data-progress=/g)].length, 3);
  assert.match(html, /aria-current="step"/);
});

test("does not repeatedly announce the ticking frequency or countdown", () => {
  assert.match(html, /<p class="tone-readout" aria-hidden="true">/);
  assert.match(html, /<span data-audio-detail aria-live="off">/);
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
  assert.match(css, /animation: tone-stretch var\(--sweep-duration/);
  assert.match(css, /animation: tone-travel var\(--sweep-duration/);
  assert.match(css, /transition: transform linear/);
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
  assert.match(html, /Two partners and their dog/);
});
