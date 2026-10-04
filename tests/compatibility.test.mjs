import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

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
  assert.match(html, /Browser, device and volume affect this preview/);
  assert.match(html, /It cannot confirm app fit/);
  assert.match(html, /person who needs to wake up can hear a sound their partner can’t/);
  assert.match(html, /Keep using an alarm you trust/);
});

test("hands every result directly to free setup on an eligible iPhone", () => {
  assert.match(
    html,
    /href="https:\/\/apps\.apple\.com\/us\/app\/couples-alarm\/id6792771975" aria-describedby="result-setup-note">Confirm in free iPhone setup<\/a>/,
  );
  assert.match(html, /id="result-setup-note"[^>]*>iOS 26 or later · Setup and the fit test are free/);
  assert.doesNotMatch(html, /Back to Couples Alarm/);
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
  assert.match(html, /Try the browser preview together on this device/);
  assert.match(html, /Start the preview/);
  assert.doesNotMatch(html, /sound check|Can one of you hear|Compare what each of you hears/);
  assert.doesNotMatch(
    html,
    /About 2 minutes|Nothing is saved|Needs to wake up|Switch partner/,
  );
  assert.match(html, /A possible range/);
  assert.match(html, /Confirm a bundled tone together in free iPhone setup/);
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
  assert.match(script, /Try the browser preview together on this iPhone/);
  assert.match(script, /Try the browser preview together on this phone/);
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

test("shows local responses and a possible browser range", () => {
  assert.match(html, /data-first-result/);
  assert.match(html, /class="handoff-result"/);
  assert.match(html, /assets\/soundwave\.svg/);
  assert.match(css, /\.handoff-result \[data-first-result\][\s\S]*clamp\(2\.9rem/);
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
  assert.match(script, /No clear range in this browser preview/);
  assert.match(script, /Possible browser preview range from/);
  assert.doesNotMatch(
    html,
    /data-result-summary|data-sweet-spot-detail/,
  );
});

// Exercise the real click handlers with local audio and DOM stubs. The clock
// chooses when a partner presses "I hear it"; null runs the sweep to its end.
// No private result hook or rewritten copy of the matching rules is used.
const previewFixture = () => {
  let clock = 0;
  let timerId = 0;
  const timeouts = new Map();
  const elements = new Map();
  const createElement = (selector) => {
    if (selector.startsWith("[")) {
      assert.ok(html.includes(selector.slice(1, -1)), `${selector} exists in HTML`);
    }
    const classes = new Set();
    const handlers = new Map();
    const attributes = new Map();
    const element = {
      textContent: "",
      hidden: false,
      disabled: false,
      style: { setProperty(name, value) { this[name] = value; } },
      classList: {
        add: (...names) => names.forEach((name) => classes.add(name)),
        remove: (...names) => names.forEach((name) => classes.delete(name)),
        contains: (name) => classes.has(name),
        toggle(name, force) {
          if (force) classes.add(name);
          else classes.delete(name);
        },
      },
      addEventListener: (name, handler) => handlers.set(name, handler),
      setAttribute: (name, value) => attributes.set(name, value),
      getAttribute: (name) => attributes.get(name),
      removeAttribute: (name) => attributes.delete(name),
      focus() { this.focused = true; },
      async click() {
        assert.equal(this.disabled, false, `${selector} is enabled`);
        await handlers.get("click")();
      },
    };
    elements.set(selector, element);
    return element;
  };
  [
    "[data-error-message]", ".listening-stage", "[data-sweep-progress]",
    "[data-frequency-readout]", "[data-device-intro]", "[data-speaker-title]",
    "[data-listening-partner]", "[data-audio-status]", "[data-start-tone]",
    "[data-heard]", "[data-not-heard]", "[data-next-partner]",
    "[data-first-result-label]", "[data-first-result]", "[data-result-title]",
    "[data-result-limit]", "[data-result-partner-one-label]",
    "[data-result-partner-two-label]", "[data-result-partner-one]",
    "[data-result-partner-two]", "[data-sweet-spot-band]",
    "[data-result-spectrum]", "[data-result-endpoint-one]",
    "[data-result-endpoint-two]", "[data-result-marker-one]",
    "[data-result-marker-two]", "[data-sweet-spot-value]",
    "[data-start-preview]", "[data-next-turn]", "[data-restart]",
  ].forEach(createElement);
  const screens = ["ready", "listen", "handoff", "result"].map((name) => {
    const screen = createElement(`screen-${name}`);
    screen.dataset = { screen: name };
    screen.heading = createElement(`heading-${name}`);
    screen.querySelector = () => screen.heading;
    return screen;
  });
  const progressSteps = screens.map((_, index) => createElement(`progress-${index}`));
  const querySelector = (selector) => {
    assert.ok(elements.has(selector), `known DOM selector ${selector}`);
    return elements.get(selector);
  };
  const audioParam = () => ({
    setValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {},
  });
  class AudioContext {
    currentTime = 0;
    state = "running";
    async resume() {}
    createOscillator() {
      return { frequency: audioParam(), connect() {}, start() {}, stop() {}, disconnect() {} };
    }
    createGain() {
      return { gain: audioParam(), connect() {}, disconnect() {} };
    }
    async close() { this.state = "closed"; }
  }
  runInNewContext(script, {
    document: {
      querySelector,
      querySelectorAll: (selector) => selector === "[data-screen]"
        ? screens : selector === ".progress-step" ? progressSteps : [querySelector(selector)],
      addEventListener() {},
    },
    navigator: { userAgent: "iPhone", audioSession: {} },
    performance: { now: () => clock },
    window: {
      AudioContext,
      matchMedia: () => ({ matches: true, addEventListener() {} }),
      scrollTo() {}, addEventListener() {},
      setInterval: () => ++timerId, clearInterval() {},
      setTimeout: (callback) => { timeouts.set(++timerId, callback); return timerId; },
      clearTimeout: (id) => timeouts.delete(id),
    },
  });
  return {
    get: querySelector,
    screens,
    async runResponses(responses) {
      await querySelector("[data-start-preview]").click();
      for (const [index, response] of responses.entries()) {
        if (index === 1) await querySelector("[data-next-turn]").click();
        await querySelector("[data-start-tone]").click();
        if (response === null) {
          clock += 20000;
          assert.equal(timeouts.size, 1);
          [...timeouts.values()][0]();
          await querySelector("[data-not-heard]").click();
        } else {
          clock += Math.log(response / 17500) / Math.log(8500 / 17500) * 20000;
          await querySelector("[data-heard]").click();
        }
      }
      assert.equal(screens.find((screen) => !screen.hidden).dataset.screen, "result");
      assert.equal(screens[3].heading.focused, true);
      assert.equal(timeouts.size, 0, "result leaves no audio sweep running");
    },
  };
};

for (const [label, responses, partner, range] of [
  ["Partner One range", [16000, 12000], "Partner One", "12.3–15.7 kHz"],
  ["opposite Partner Two range", [12000, 16000], "Partner Two", "12.3–15.7 kHz"],
  ["only Partner One heard", [16000, null], "Partner One", "8.8–15.7 kHz"],
  ["only Partner Two heard", [null, 16000], "Partner Two", "8.8–15.7 kHz"],
]) {
  test(`identifies ${label} without selecting a waking schedule`, async () => {
    const preview = previewFixture();
    await preview.runResponses(responses);
    assert.equal(preview.get("[data-result-title]").textContent, `Possible range for ${partner}`);
    assert.match(preview.get("[data-result-limit]").textContent, new RegExp(`only fits your plan if ${partner} needs to wake up`));
    assert.match(preview.get("[data-result-limit]").textContent, /Confirm a bundled tone together in free iPhone setup/);
    assert.equal(preview.get("[data-sweet-spot-value]").textContent, range);
    assert.equal(preview.get("[data-sweet-spot-band]").hidden, false);
    assert.equal(preview.get("[data-sweet-spot-value]").hidden, false);
    assert.match(preview.get("[data-result-spectrum]").getAttribute("aria-label"), new RegExp(`for ${partner}\\. This does not confirm app fit`));
    assert.equal(preview.get("[data-result-marker-one]").hidden, responses[0] === null);
    assert.equal(preview.get("[data-result-marker-two]").hidden, responses[1] === null);
  });
}

for (const [label, responses, explanation] of [
  ["close responses", [12000, 12500], /results were too close/],
  ["neither partner heard", [null, null], /Neither partner heard/],
]) {
  test(`keeps ${label} inconclusive and offers real setup`, async () => {
    const preview = previewFixture();
    await preview.runResponses(responses);
    assert.equal(preview.get("[data-result-title]").textContent, "No clear range");
    assert.match(preview.get("[data-result-limit]").textContent, explanation);
    assert.match(preview.get("[data-result-limit]").textContent, /still check for a suitable bundled tone in free iPhone setup/);
    assert.equal(preview.get("[data-sweet-spot-band]").hidden, true);
    assert.equal(preview.get("[data-sweet-spot-value]").hidden, true);
    assert.equal(preview.get("[data-result-spectrum]").classList.contains("has-range"), false);
    assert.match(preview.get("[data-result-spectrum]").getAttribute("aria-label"), /No clear range in this browser preview/);
  });
}

for (const response of [8500, 8800, 9100]) {
  for (const heardPartner of [0, 1]) {
    test(`keeps one-null ${response} Hz response for Partner ${heardPartner + 1} inconclusive after margins`, async () => {
      const preview = previewFixture();
      const responses = [null, null];
      responses[heardPartner] = response;
      await preview.runResponses(responses);
      assert.equal(preview.get("[data-result-title]").textContent, "No clear range");
      assert.equal(preview.get("[data-sweet-spot-value]").textContent, "No clear range");
      assert.equal(preview.get("[data-sweet-spot-band]").hidden, true);
    assert.equal(preview.get("[data-sweet-spot-value]").hidden, true);
      assert.equal(preview.get("[data-result-spectrum]").classList.contains("has-range"), false);
      assert.match(preview.get("[data-result-limit]").textContent, /did not show a usable range/);
      assert.match(preview.get("[data-result-limit]").textContent, /still check for a suitable bundled tone in free iPhone setup/);
    });
  }
}

test("shows a positive one-null range above the margin boundary", async () => {
  const preview = previewFixture();
  await preview.runResponses([9200, null]);
  assert.equal(preview.get("[data-result-title]").textContent, "Possible range for Partner One");
  assert.equal(preview.get("[data-sweet-spot-value]").textContent, "8.8–8.9 kHz");
  assert.ok(Number.parseFloat(preview.get("[data-sweet-spot-band]").style.width) > 0);
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
