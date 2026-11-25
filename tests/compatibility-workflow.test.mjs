import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mountSoundTest } from "../compatibility/compatibility.js";
import test from "node:test";

const html = await readFile(new URL("../compatibility/index.html", import.meta.url), "utf8");

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
    getAttribute(key) { return this.attributes[key]; }
    removeAttribute(key) { delete this.attributes[key]; }
    addEventListener(type, fn) { (this.events[type] ||= []).push(fn); }
    emit(type, event) { return Promise.all((this.events[type] || []).map((fn) => fn(event))); }
    focus() { focused = this; }
    querySelector() { return this.heading ||= new Element(); }
  }
  const nodes = new Map();
  for (const match of html.matchAll(/\b(data-[\w-]+)(?:="[^"]*")?/g)) {
    nodes.set(`[${match[1]}]`, new Element());
  }
  const redoButtons = [...html.matchAll(/data-redo-turn="([01])"/g)].map(([, partner]) => {
    const button = new Element();
    button.dataset.redoTurn = partner;
    nodes.set(`[data-redo-turn="${partner}"]`, button);
    return button;
  });
  nodes.set(".listening-stage", new Element());
  nodes.set(".test-downloads", new Element());
  const screens = ["listen", "handoff", "result"].map((name) => {
    const element = new Element(); element.dataset.screen = name; element.hidden = name !== "listen"; return element;
  });
  const steps = [0, 1, 2].map(() => new Element());
  const el = (selector) => {
    assert.ok(nodes.has(selector), `selector exists in HTML: ${selector}`);
    return nodes.get(selector);
  };
  const document = new Element();
  Object.defineProperty(document, "activeElement", { get: () => focused });
  document.hidden = false;
  document.querySelector = el;
  document.querySelectorAll = (selector) => {
    if (selector === "[data-screen]") return screens;
    if (selector === ".progress-step") return steps;
    if (selector === "[data-redo-turn]") return redoButtons;
    return [el(selector)];
  };
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
  window.navigator = { userAgent: "test", audioSession: {} };
  document.defaultView = window;
  const controller = mountSoundTest({
    ownerDocument: document,
    querySelector: el,
    querySelectorAll: document.querySelectorAll,
  });
  const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
  return {
    el, voices, gains, steps, controller,
    get context() { return context; },
    get focused() { return focused; },
    get screen() { return screens.find((screen) => !screen.hidden).dataset.screen; },
    async click(selector, event = {}) { void el(selector).emit("click", event); await flush(); },
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
const heardPitch = seconds => `${(17.5 * (8.5 / 17.5) ** (seconds / 20)).toFixed(1)} kHz`;

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
  await next(p); await unheard(p);
  assert.equal(p.el("[data-result-partner-one]").textContent, heardPitch(5));
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
  const first = heardPitch(2);
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
  assert.equal(p.focused, p.el("[data-audio-status]"));
  assert.equal(p.el("[data-heard]").hidden, false);
  assert.equal(p.el("[data-heard]").disabled, true);
  await p.hide(); await p.show();
  assert.equal(p.el("[data-audio-status]").textContent, "Tone finished");
  await p.click("[data-retry-turn]"); assert.equal(p.voices.length, 2);
  await unheard(p); await next(p); await unheard(p);
  assert.equal(p.el("[data-result-partner-one]").textContent, "Did not hear it");
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
    const partners = ["Partner One", "Partner Two"];
    assert.equal(p.el("[data-result-title]").textContent, `Suggested tone for ${partners[heardPartner]}`);
    assert.equal(
      p.el("[data-result-for]").textContent,
      `Based on your answers, ${partners[heardPartner]} is more likely to hear a tone in this range than ${partners[1 - heardPartner]}.`,
    );
    assert.ok(parseFloat(p.el("[data-sweet-spot-band]").style.width) > 0);
    assert.equal(p.el("[data-result-next]").attributes.href, "../download/");
  });
}

test("redoing Partner One from handoff replaces only their answer and returns to handoff", async () => {
  const p = preview(); await start(p); p.advance(2); await heard(p);
  await p.click('[data-redo-turn="0"]');
  assert.equal(p.screen, "listen");
  assert.equal(p.el("[data-listening-partner]").textContent, "Partner One");
  assert.equal(p.el("[data-turn-context]").textContent, "Redoing turn");
  assert.equal(p.el("[data-cancel-redo]").textContent, "Back to handoff");
  assert.equal(p.steps[0].getAttribute("aria-current"), "step");
  assert.equal(p.voices.length, 1, "retake waits for Start");
  await p.click("[data-cancel-redo]");
  assert.equal(p.screen, "handoff");

  await p.click('[data-redo-turn="0"]'); await start(p); p.advance(10); await heard(p);
  assert.equal(p.screen, "handoff");
  await next(p);
  assert.equal(p.el("[data-listening-partner]").textContent, "Partner Two");
  assert.equal(p.el("[data-turn-context]").textContent, "2 of 2");
  assert.equal(p.el("[data-cancel-redo]").hidden, true);
  await unheard(p);
  assert.equal(p.el("[data-result-partner-one]").textContent, heardPitch(10));
});

test("redoing either partner recalculates the result with the other answer intact", async () => {
  const p = preview();
  await start(p); p.advance(1); await heard(p);
  await next(p); p.advance(7); await heard(p);
  const second = p.el("[data-result-partner-two]").textContent;
  assert.equal(p.el("[data-result-title]").textContent, "Suggested tone for Partner One");

  await p.click('[data-redo-turn="0"]');
  assert.equal(p.steps[0].getAttribute("aria-current"), "step");
  assert.ok(p.steps[1].classes.has("is-complete"));
  await start(p); p.advance(14); await heard(p);
  assert.equal(p.screen, "result");
  assert.equal(p.el("[data-result-partner-two]").textContent, second);
  assert.equal(p.el("[data-result-title]").textContent, "Suggested tone for Partner Two");
  const first = p.el("[data-result-partner-one]").textContent;

  await p.click('[data-redo-turn="1"]');
  assert.equal(p.el("[data-listening-partner]").textContent, "Partner Two");
  assert.ok(p.steps[0].classes.has("is-complete"));
  await start(p); p.advance(18); await heard(p);
  assert.equal(p.screen, "result");
  assert.equal(p.el("[data-result-partner-one]").textContent, first);
  assert.equal(p.el("[data-result-title]").textContent, "Suggested tone for Partner One");
  assert.equal(p.voices.length, 4);
});

test("leaving a retake stops audio and restores the previous result including a no-tone answer", async () => {
  const p = preview();
  await start(p); p.advance(1); await heard(p);
  await next(p); await unheard(p);
  const range = p.el("[data-sweet-spot-value]").textContent;

  await p.click('[data-redo-turn="1"]');
  assert.equal(p.el("[data-turn-context]").textContent, "Redoing turn");
  assert.equal(p.el("[data-cancel-redo]").textContent, "Back to result");
  await start(p); p.advance(3); await p.click("[data-cancel-redo]");
  assert.equal(p.voices.at(-1).disconnected, true);
  p.advance(25);
  assert.equal(p.screen, "result");
  assert.equal(p.el("[data-result-partner-two]").textContent, "Did not hear it");
  assert.equal(p.el("[data-sweet-spot-value]").textContent, range);

  await p.click('[data-redo-turn="0"]'); await start(p); await unheard(p);
  assert.equal(p.screen, "result");
  assert.equal(p.el("[data-result-title]").textContent, "No clear match");
  assert.equal(p.el("[data-result-partner-two]").textContent, "Did not hear it");
  assert.equal(p.el("[data-sweet-spot-band]").hidden, true);
});

for (const kind of ["neither", "same", "late-and-unheard"]) {
  test(`no misleading range for ${kind}`, async () => {
    const p = preview(); await start(p);
    if (kind === "neither") await unheard(p);
    else { p.advance(kind === "same" ? 4 : 19.9); await heard(p); }
    await next(p);
    if (kind === "same") { p.advance(4); await heard(p); } else await unheard(p);
    assert.equal(p.el("[data-result-title]").textContent, "No clear match");
    assert.match(p.el("[data-result-for]").textContent, /no tone to suggest for either partner/);
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
  await next(p); await unheard(p);
  assert.equal(p.el("[data-result-partner-one]").textContent, "8.5 kHz");
});


test("opens directly on the first listening turn without starting audio", () => {
  const p = preview();
  assert.equal(p.screen, "listen");
  assert.equal(p.voices.length, 0);
  assert.equal(p.el("[data-start-tone]").hidden, false);
  assert.equal(p.el("[data-start-tone]").textContent, "Start");
  assert.equal(p.el("[data-frequency-readout]").textContent, "17.5");
});


test("blocks repeated Enter on listening answers and permits a fresh press", async () => {
  const p = preview();
  for (const selector of ["[data-heard]", "[data-not-heard]"]) {
    const prevented = [];
    for (const repeat of [true, false]) {
      await p.el(selector).emit("keydown", { key: "Enter", repeat, preventDefault: () => prevented.push(repeat) });
    }
    assert.deepEqual(prevented, [true]);
  }
});

test("a repeat tap from Start does not count as hearing a tone", async () => {
  const p = preview();
  const point = { detail: 1, clientX: 160, clientY: 400 };
  await p.click("[data-start-tone]", { ...point, timeStamp: 100 });
  await p.click("[data-heard]", { ...point, timeStamp: 180 });
  assert.equal(p.screen, "listen");
  await p.click("[data-heard]", { ...point, timeStamp: 450 });
  assert.equal(p.screen, "handoff");
});

test("opening a store interrupts the current tone without recording a response", async () => {
  const p = preview(); await start(p); p.advance(2); await heard(p);
  const first = heardPitch(2);
  await next(p);
  await p.click(".test-downloads", { target: { closest: () => true } });
  assert.equal(p.el("[data-audio-status]").textContent, "Paused");
  assert.equal(p.voices[1].disconnected, true);
  await start(p); p.advance(8); await heard(p);
  assert.equal(p.el("[data-result-partner-one]").textContent, first);
  assert.equal(p.screen, "result");
});

test("the embedded controller pauses on dismissal and keeps completed answers in memory", async () => {
  const p = preview();
  assert.equal(p.controller.hasProgress(), false);
  await start(p); p.advance(4); await heard(p);
  assert.equal(p.controller.hasProgress(), true);
  await next(p);
  p.controller.pause();
  assert.equal(p.voices.at(-1).disconnected, true);
  assert.equal(p.el("[data-listening-partner]").textContent, "Partner Two");
  assert.equal(p.el("[data-start-tone]").textContent, "Retry this turn");
  p.controller.focusStep();
  assert.equal(p.voices.length, 2);
  await start(p); await unheard(p);
  assert.equal(p.screen, "result");
  assert.equal(p.el("[data-result-partner-one]").textContent, heardPitch(4));
});

test("dismissing before the browser starts audio leaves a silent retry", async () => {
  const p = preview({ pendingResume: true });
  await start(p);
  p.controller.pause();
  await p.resolve();
  assert.equal(p.voices.length, 0);
  assert.equal(p.el("[data-audio-status]").textContent, "Paused");
  assert.equal(p.controller.hasProgress(), true);
});
