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
  assert.match(html, /Your audio and responses aren’t recorded or saved/);
  assert.doesNotMatch(html, /<input|enter your name|Alex|Jordan/i);
  assert.doesNotMatch(script, /localStorage|sessionStorage|document\.cookie/);
});

test("keeps the preview device-aware and honest about its limits", () => {
  assert.match(script, /iPhone\|iPod/);
  assert.match(script, /Built-in speakers/);
  assert.match(html, /Stop if the sound feels uncomfortable/);
  assert.match(html, /compatibility preview, not a hearing test/i);
  assert.match(html, /Results can vary by device and room/);
  assert.match(html, /confirms any match with a real bedside alarm/);
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
  assert.match(script, /const animationFrames = new Set\(\)/);
  assert.match(script, /voice\.gain\.gain\.setValueAtTime\(0, now\)/);
  assert.match(script, /activeVoices\.forEach\(stopVoice\)/);
  assert.match(script, /if \(run !== toneRun\) return/);
  assert.match(
    script,
    /startToneButton\.hidden = true;\s*startToneButton\.disabled = true;[\s\S]*await audioContext\.resume\(\)/,
  );
  assert.match(script, /window\.addEventListener\("pagehide", closeAudio\)/);
  assert.match(script, /showResult\(\)/);
  assert.doesNotMatch(script, /\bfetch\s*\(|XMLHttpRequest|sendBeacon/);
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
  assert.match(css, /\.primary-action\s*\{[\s\S]*min-height:\s*3\.25rem/);
  assert.match(css, /\.site-header nav a\s*\{[\s\S]*min-width:\s*48px/);
  assert.match(
    css,
    /\.stop-tone-action\s*\{[\s\S]*width:\s*100%[\s\S]*min-height:\s*48px/,
  );
  assert.match(
    css,
    /@media \(max-height: 520px\) and \(min-width: 761px\)[\s\S]*height:\s*auto[\s\S]*min-height:\s*32rem/,
  );
});
