import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const html = await readFile(new URL("../compatibility/index.html", import.meta.url), "utf8");
const script = await readFile(new URL("../compatibility/compatibility.js", import.meta.url), "utf8");

// Exercise the shipped controller with deterministic audio and timer clocks.
// The DOM double resolves only selectors actually present in the page.
function preview({ pendingResume = false, failResume = false, unsupported = false } = {}) {
  let wallTime = 0;
  let audioTime = 0;
  let timerId = 0;
  let focused;
  let context;
  let resolveResume;
  const timers = new Map();
  const intervals = new Map();
  const voices = [];
  const gains = [];
  class Element {
    constructor() {
      this.hidden = false;
      this.disabled = false;
      this.textContent = "";
      this.dataset = {};
      this.attributes = {};
      this.events = {};
      this.classes = new Set();
      this.classList = {
        add: (name) => this.classes.add(name),
        remove: (name) => this.classes.delete(name),
        toggle: (name, on) => on ? this.classes.add(name) : this.classes.delete(name),
      };
      this.style = { setProperty: (key, value) => { this.style[key] = value; } };
    }
    setAttribute(key, value) { this.attributes[key] = value; }
    removeAttribute(key) { delete this.attributes[key]; }
    addEventListener(type, fn) { (this.events[type] ||= []).push(fn); }
    emit(type) { return Promise.all((this.events[type] || []).map((fn) => fn())); }
    focus() { focused = this; }
    querySelector() { return this.heading ||= new Element(); }
  }
  const nodes = new Map();
  for (const match of html.matchAll(/\b(data-[\w-]+)(?:="[^"]*")?/g)) {
    nodes.set(`[${match[1]}]`, new Element());
  }
  nodes.set(".listening-stage", new Element());
  const screens = ["listen", "handoff", "result"].map((name) => {
    const element = new Element(); element.dataset.screen = name; element.hidden = name !== "listen"; return element;
  });
  const steps = [0, 1, 2].map(() => new Element());
  const el = (selector) => {
    assert.ok(nodes.has(selector), `selector exists in HTML: ${selector}`);
    return nodes.get(selector);
  };
  const document = new Element();
  document.hidden = false;
  document.querySelector = el;
  document.querySelectorAll = (selector) => selector === "[data-screen]" ? screens : selector === ".progress-step" ? steps : [el(selector)];
  const parameter = () => ({
    events: [],
    setValueAtTime(value, at) { this.events.push(["set", value, at]); },
    exponentialRampToValueAtTime(value, at) { this.events.push(["ramp", value, at]); },
    cancelScheduledValues(at) { this.events.push(["cancel", at]); },
  });
  class AudioContext extends Element {
    constructor() { super(); context = this; this.state = "suspended"; this.resumeCalls = 0; }
    get currentTime() { return audioTime; }
    async resume() {
      this.resumeCalls++;
      if (failResume) throw new Error("blocked");
      if (pendingResume) await new Promise((resolve) => { resolveResume = resolve; });
      this.state = "running";
    }
    createOscillator() {
      const oscillator = {
        frequency: parameter(), starts: [], stops: [], disconnected: false,
        connect() {}, start(at) { this.starts.push(at); }, stop(at) { this.stops.push(at); },
        disconnect() { this.disconnected = true; },
      };
      voices.push(oscillator); return oscillator;
    }
    createGain() {
      const gain = { gain: parameter(), connect() {}, disconnect() { this.disconnected = true; } };
      gains.push(gain); return gain;
    }
    async close() { this.state = "closed"; }
  }
  const window = new Element();
  Object.assign(window, {
    AudioContext: unsupported ? undefined : AudioContext,
    scrollTo() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    setTimeout: (fn, delay) => { timers.set(++timerId, { fn, at: wallTime + delay }); return timerId; },
    clearTimeout: (id) => timers.delete(id),
    setInterval: (fn) => { intervals.set(++timerId, fn); return timerId; },
    clearInterval: (id) => intervals.delete(id),
  });
  vm.runInNewContext(script, { document, window, navigator: { userAgent: "test", audioSession: {} } });
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
  return {
    el, voices, gains, steps,
    get context() { return context; },
    get focused() { return focused; },
    get screen() { return screens.find((screen) => !screen.hidden).dataset.screen; },
    async click(selector) { void el(selector).emit("click"); await flush(); },
    async resolve() { pendingResume = false; resolveResume(); await flush(); },
    async allowAudio() { failResume = false; window.AudioContext = AudioContext; },
    async hide() { document.hidden = true; await document.emit("visibilitychange"); },
    async show() { document.hidden = false; await document.emit("visibilitychange"); },
    async interrupt() { context.state = "interrupted"; await context.emit("statechange"); },
    async leave() { await window.emit("pagehide"); },
    advance(seconds, audioSeconds = seconds, runTimers = true) {
      wallTime += seconds * 1000; audioTime += audioSeconds;
      for (const fn of intervals.values()) fn();
      if (!runTimers) return;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= wallTime) { timers.delete(id); timer.fn(); }
      }
    },
  };
}
const start = (p) => p.click("[data-start-tone]");
const heard = (p) => p.click("[data-heard]");
const next = (p) => p.click("[data-next-turn]");
async function unheard(p) { p.advance(20); await p.click("[data-not-heard]"); }

test("one click starts each partner; repeated start clicks cannot duplicate audio", async () => {
  const p = preview();
  await start(p); await start(p);
  assert.equal(p.screen, "listen");
  assert.equal(p.context.resumeCalls, 1);
  assert.equal(p.voices.length, 1);
  assert.equal(p.el("[data-audio-status]").textContent, "Playing");
  assert.equal(p.el("[data-start-tone]").hidden, true);
  assert.equal(p.focused, p.el("[data-heard]"));
  p.advance(3); await heard(p);
  assert.equal(p.screen, "handoff");
  assert.equal(p.voices[0].disconnected, true);
  await next(p); await next(p);
  assert.equal(p.el("[data-listening-partner]").textContent, "Partner Two");
  assert.equal(p.context.resumeCalls, 2);
  assert.equal(p.voices.length, 2);
});

test("preserves the 20-second sweep and gain envelope", async () => {
  const p = preview(); await start(p);
  assert.deepEqual(p.voices[0].frequency.events, [["set", 17500, 0], ["ramp", 8500, 20]]);
  assert.deepEqual(p.gains[0].gain.events, [["set", 0.0001, 0], ["ramp", 0.14, 0.18], ["set", 0.14, 19.78], ["ramp", 0.0001, 20]]);
});

test("records against the audio clock, even if wall time has advanced farther", async () => {
  const p = preview(); await start(p); p.advance(12, 5); await heard(p);
  const expected = (Math.round(17500 * (8500 / 17500) ** .25 / 100) / 10).toFixed(1);
  assert.equal(p.el("[data-first-result]").textContent, `${expected} kHz`);
});

test("pause silences audio without recording and retries the same partner", async () => {
  const p = preview(); await start(p); p.advance(2);
  await p.click("[data-pause-tone]");
  assert.equal(p.screen, "listen");
  assert.equal(p.el("[data-audio-status]").textContent, "Paused");
  assert.equal(p.voices[0].disconnected, true);
  assert.deepEqual(p.gains[0].gain.events.at(-1), ["set", 0, 2]);
  await heard(p); await p.click("[data-not-heard]");
  assert.equal(p.screen, "listen");
  p.advance(30); assert.equal(p.el("[data-audio-status]").textContent, "Paused");
  await p.click("[data-start-tone]");
  assert.equal(p.el("[data-listening-partner]").textContent, "Partner One");
  assert.equal(p.voices.length, 2);
});

test("a paused pending resume cannot start a stale oscillator", async () => {
  const p = preview({ pendingResume: true }); await start(p);
  assert.equal(p.el("[data-audio-status]").textContent, "Starting…");
  await p.click("[data-pause-tone]"); await p.resolve();
  assert.equal(p.voices.length, 0);
  assert.equal(p.el("[data-audio-status]").textContent, "Paused");
  await p.click("[data-start-tone]"); assert.equal(p.voices.length, 1);
});

test("backgrounding interrupts without advancing and preserves the first response", async () => {
  const p = preview(); await start(p); p.advance(2); await heard(p);
  const first = p.el("[data-first-result]").textContent;
  await next(p); await p.hide(); await p.show();
  assert.equal(p.el("[data-audio-status]").textContent, "Paused");
  assert.equal(p.voices.length, 2);
  await p.click("[data-start-tone]"); p.advance(8); await heard(p);
  assert.equal(p.el("[data-result-partner-one]").textContent, first);
  assert.equal(p.screen, "result");
});

test("system audio interruption offers retry, never a false response", async () => {
  const p = preview(); await start(p); await p.interrupt(); await heard(p);
  assert.equal(p.screen, "listen");
  assert.equal(p.el("[data-start-tone]").disabled, false);
  assert.equal(p.voices[0].disconnected, true);
});

test("natural end requires a response, supports replay and survives backgrounding", async () => {
  const p = preview(); await start(p);
  await p.click("[data-not-heard]"); assert.equal(p.screen, "listen");
  p.advance(20);
  assert.equal(p.el("[data-audio-status]").textContent, "Tone finished");
  assert.equal(p.focused, p.el("[data-not-heard]"));
  await p.hide(); await p.show();
  assert.equal(p.el("[data-audio-status]").textContent, "Tone finished");
  await p.click("[data-retry-turn]"); assert.equal(p.voices.length, 2);
  await unheard(p); assert.equal(p.el("[data-first-result]").textContent, "Did not hear it");
});

test("an early wall timer does not finish an incomplete audio sweep", async () => {
  const p = preview(); await start(p); p.advance(20, 19);
  assert.equal(p.el("[data-audio-status]").textContent, "Playing");
  p.advance(1); assert.equal(p.el("[data-audio-status]").textContent, "Tone finished");
});

for (const options of [{ failResume: true }, { unsupported: true }]) {
  test(`audio failure is recoverable: ${JSON.stringify(options)}`, async () => {
    const p = preview(options); await start(p);
    assert.equal(p.el("[data-audio-status]").textContent, "Sound unavailable");
    assert.equal(p.el("[data-error-message]").hidden, false);
    assert.equal(p.el("[data-start-tone]").disabled, false);
    await p.allowAudio(); await p.click("[data-start-tone]");
    assert.equal(p.el("[data-audio-status]").textContent, "Playing");
    assert.equal(p.el("[data-error-message]").hidden, true);
  });
}

test("page exit stops every voice and closes the context", async () => {
  const p = preview(); await start(p); await p.leave();
  assert.equal(p.context.state, "closed");
  assert.equal(p.voices[0].disconnected, true);
  assert.equal(p.el("[data-audio-status]").textContent, "Paused");
});

for (const heardPartner of [0, 1]) {
  test(`range identifies Partner ${heardPartner + 1} and has positive bounds`, async () => {
    const p = preview(); await start(p);
    if (heardPartner === 0) { p.advance(2); await heard(p); } else await unheard(p);
    await next(p);
    if (heardPartner === 1) { p.advance(2); await heard(p); } else await unheard(p);
    assert.equal(p.el("[data-result-title]").textContent, "A possible match");
    assert.match(p.el("[data-result-for]").textContent, heardPartner === 0 ? /Partner One/ : /Partner Two/);
    assert.ok(parseFloat(p.el("[data-sweet-spot-band]").style.width) > 0);
    assert.equal(p.el("[data-result-next]").attributes.href, "../download/");
  });
}

for (const kind of ["neither", "same", "late-and-unheard"]) {
  test(`no misleading range for ${kind}`, async () => {
    const p = preview(); await start(p);
    if (kind === "neither") await unheard(p);
    else { p.advance(kind === "same" ? 4 : 19.9); await heard(p); }
    await next(p);
    if (kind === "same") { p.advance(4); await heard(p); } else await unheard(p);
    assert.equal(p.el("[data-result-title]").textContent, "No clear match");
    assert.equal(p.el("[data-sweet-spot-band]").hidden, true);
    await p.click("[data-restart]"); assert.equal(p.screen, "listen");
    await start(p); assert.equal(p.el("[data-listening-partner]").textContent, "Partner One");
  });
}


test("a late click cannot invent a threshold while the end timer is delayed", async () => {
  const p = preview(); await start(p); p.advance(22, 22, false); await heard(p);
  assert.equal(p.screen, "listen");
  assert.equal(p.el("[data-audio-status]").textContent, "Tone finished");
  assert.equal(p.el("[data-not-heard]").disabled, false);
});

test("a response at the exact endpoint is accepted before the completion callback", async () => {
  const p = preview(); await start(p); p.advance(20, 20, false); await heard(p);
  assert.equal(p.screen, "handoff");
  assert.equal(p.el("[data-first-result]").textContent, "8.5 kHz");
});


test("opens directly on the first listening turn without starting audio", () => {
  const p = preview();
  assert.equal(p.screen, "listen");
  assert.equal(p.voices.length, 0);
  assert.equal(p.el("[data-start-tone]").hidden, false);
  assert.equal(p.el("[data-start-tone]").textContent, "Start");
  assert.equal(p.el("[data-frequency-readout]").textContent, "17.5");
});
