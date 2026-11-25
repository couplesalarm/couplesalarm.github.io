export function mountSoundTest(root, { scrollContainer = root.ownerDocument.defaultView } = {}) {
  const document = root.ownerDocument;
  const window = document.defaultView;
  const navigator = window.navigator;
  const partnerLabels = ["Partner One", "Partner Two"];
  const screens = [...root.querySelectorAll("[data-screen]")];
  const progressSteps = [...root.querySelectorAll(".progress-step")];
  const errorMessage = root.querySelector("[data-error-message]");
  const listeningStage = root.querySelector(".listening-stage");
  const cancelRedo = root.querySelector("[data-cancel-redo]");

  const startFrequency = 17500;
  const endFrequency = 8500;
  const sweepDuration = 20000;
  const minimumMatchGap = 800;
  const sweetSpotMargin = 300;

  if (navigator.audioSession) {
    navigator.audioSession.type = "playback";
  }

  let turn = 0;
  let responses = [undefined, undefined];
  let audioContext;
  const activeVoices = new Set();
  let toneRun = 0;
  let sweepStartedAt = 0;
  let sweepPlaying = false;
  let phase = "idle";
  let currentScreen = "listen";
  let sweepTimer;
  let readoutTimer;
  let startPointer;

  // Mirrors the app's live "Current frequency" readout during a listening
  // trial. A slow interval is enough for a number and keeps the script free of
  // the per-frame loop the visualiser deliberately does without.
  const frequencyAt = (progress) =>
    startFrequency * Math.pow(endFrequency / startFrequency, progress);

  const kilohertzText = (hz) => (Math.round(hz / 100) / 10).toFixed(1);
  const responseText = (hz) =>
    hz === null ? "Did not hear it" : `${kilohertzText(hz)} kHz`;
  const frequencyPosition = (hz) =>
    ((hz - endFrequency) / (startFrequency - endFrequency)) * 100;

  const setReadout = (hz) => {
    setText("[data-frequency-readout]", kilohertzText(hz));
    // Colour follows the actual pitch; decorative motion never drives audio.
    const pitchProgress = Math.max(0, Math.min(1, (startFrequency - hz) / (startFrequency - endFrequency)));
    listeningStage.style.setProperty("--pitch-shift", `${pitchProgress * 45}deg`);
  };

  const stopReadout = () => {
    window.clearInterval(readoutTimer);
    readoutTimer = undefined;
  };

  const startReadout = () => {
    stopReadout();
    const tick = () => {
      const progress = Math.min(
        1,
        ((audioContext.currentTime - sweepStartedAt) * 1000) / sweepDuration,
      );
      setReadout(frequencyAt(progress));
    };
    tick();
    readoutTimer = window.setInterval(tick, 80);
  };

  const isIPhone = /iPhone|iPod/i.test(navigator.userAgent);
  const isIPad =
    /iPad/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const phoneQuery = window.matchMedia("(max-width: 720px)");

  const currentDeviceCopy = () =>
    isIPhone
      ? {
          title: "iPhone speaker",
        }
      : isIPad
        ? {
            title: "iPad speaker",
          }
        : phoneQuery.matches
          ? {
              title: "Phone speaker",
            }
          : {
              title: "Built-in speakers",
            };

  const updateDeviceCopy = () => {
    const deviceCopy = currentDeviceCopy();
    root.querySelectorAll("[data-speaker-title]").forEach((element) => {
      element.textContent = deviceCopy.title;
    });
  };

  phoneQuery.addEventListener("change", updateDeviceCopy);

  const setText = (selector, value) => {
    root.querySelectorAll(selector).forEach((element) => {
      element.textContent = value;
    });
  };

  const setProgress = (currentIndex) => {
    progressSteps.forEach((step, index) => {
      const complete = index !== currentIndex && responses[index] !== undefined;
      step.classList.toggle("is-current", index === currentIndex);
      step.classList.toggle("is-complete", complete);
      step.querySelector("b").textContent = complete ? "✓" : String(index + 1);
      if (index === currentIndex) {
        step.setAttribute("aria-current", "step");
      } else {
        step.removeAttribute("aria-current");
      }
    });
  };

  const focusStep = () => {
    const heading = screens.find(screen => !screen.hidden)?.querySelector("h1, h2");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  };

  const showScreen = (name) => {
    currentScreen = name;
    screens.forEach(screen => { screen.hidden = screen.dataset.screen !== name; });
    errorMessage.hidden = true;
    scrollContainer.scrollTo(0, 0);
    focusStep();
  };

  const showError = (message) => {
    errorMessage.textContent = message;
    errorMessage.hidden = false;
  };

  const stopVoice = (voice) => {
    const now = voice.context.currentTime;
    try {
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setValueAtTime(0, now);
    } catch {
      // Disconnecting the graph below is the final silence fallback.
    }

    try {
      voice.oscillator.stop(now);
    } catch {
      // The oscillator may already have reached its scheduled stop time.
    }

    try {
      voice.oscillator.disconnect();
    } catch {
      // The oscillator may already be disconnected.
    }

    try {
      voice.gain.disconnect();
    } catch {
      // The gain may already be disconnected.
    }

    activeVoices.delete(voice);
  };

  // The ring follows the sweep duration without a per-frame rendering loop.
  const resetSweepProgress = () => {
    listeningStage.classList.remove("is-sweeping");
    void listeningStage.offsetWidth;
  };

  const runSweepProgress = () => {
    resetSweepProgress();
    // Keeps the CSS sweep animations locked to the same clock as the audio.
    listeningStage.style.setProperty("--sweep-duration", `${sweepDuration}ms`);
    listeningStage.classList.add("is-sweeping");
  };

  const stopTone = () => {
    toneRun += 1;
    sweepPlaying = false;
    window.clearTimeout(sweepTimer);
    sweepTimer = undefined;
    stopReadout();
    activeVoices.forEach(stopVoice);
  };

  // Every response path is explicit. Pausing never counts as not hearing.
  const setListeningState = (nextPhase) => {
    phase = nextPhase;
    sweepPlaying = phase === "playing";
    const controls = {
      "[data-heard]": phase === "playing",
      "[data-not-heard]": phase === "finished",
      "[data-start-tone]": ["idle", "paused", "error"].includes(phase),
      "[data-pause-tone]": phase === "starting" || phase === "playing",
      "[data-retry-turn]": phase === "finished",
    };
    Object.entries(controls).forEach(([selector, enabled]) => {
      const button = root.querySelector(selector);
      // Reserve the previous answer's position at timeout without accepting it.
      button.hidden = !enabled && !(selector === "[data-heard]" && phase === "finished");
      button.disabled = !enabled;
    });
    listeningStage.classList.toggle("is-idle", !["playing", "finished"].includes(phase));
    setText("[data-start-tone]", phase === "idle" ? "Start" : "Retry this turn");
    const copy = {
      idle: ["", "Take turns on one device. Tap “I hear it” when you hear the tone."],
      starting: ["Starting…", "Tap as soon as you hear it."],
      playing: ["Playing", "Tap as soon as you hear it."],
      finished: ["Tone finished", "Didn’t hear it? Confirm or listen again."],
      paused: ["Paused", "This attempt is paused. Retry when you’re ready."],
      error: ["Sound unavailable", "Check your audio, then retry."],
    }[phase];
    if (copy) {
      setText("[data-audio-status]", copy[0]);
      setText("[data-listen-instruction]", copy[1]);
    }
  };

  const pauseTurn = (moveFocus = true) => {
    if (currentScreen !== "listen" || !["starting", "playing"].includes(phase)) return;
    stopTone();
    setListeningState("paused");
    resetSweepProgress();
    setReadout(startFrequency);
    if (moveFocus) root.querySelector("[data-start-tone]").focus({ preventScroll: true });
  };

  const finishSweep = () => {
    const responseHadFocus = document.activeElement === root.querySelector("[data-heard]");
    stopTone();
    setListeningState("finished");
    setReadout(endFrequency);
    if (responseHadFocus) root.querySelector("[data-audio-status]").focus({ preventScroll: true });
  };

  const prepareTurn = () => {
    const isRedo = responses[turn] !== undefined;
    setText("[data-listening-partner]", partnerLabels[turn]);
    setText("[data-turn-context]", isRedo ? "Redoing turn" : `${turn + 1} of 2`);
    cancelRedo.hidden = !isRedo;
    cancelRedo.textContent = responses[1] === undefined ? "Back to handoff" : "Back to result";
    setProgress(turn);
    setListeningState("idle");
    resetSweepProgress();
    setReadout(startFrequency);
  };

  const startTone = async (event) => {
    if (currentScreen !== "listen" || ["starting", "playing"].includes(phase)) return;
    startPointer = event.detail > 0
      ? { x: event.clientX, y: event.clientY, time: event.timeStamp }
      : undefined;
    stopTone();
    const run = toneRun;
    errorMessage.hidden = true;
    const startToneButton = root.querySelector("[data-start-tone]");
    const heardButton = root.querySelector("[data-heard]");
    startToneButton.hidden = true;
    startToneButton.disabled = true;
    setListeningState("starting");

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error("Web Audio is not supported");
      }
      if (!audioContext) {
        audioContext = new AudioContextClass();
        audioContext.addEventListener("statechange", () => {
          if (audioContext && audioContext.state !== "running" && phase === "playing") pauseTurn();
        });
      }
      // Called directly from the user's start/retry click, including on Safari.
      await audioContext.resume();
      if (run !== toneRun) return;
      if (audioContext.state !== "running") throw new Error("Audio did not start");

      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const voice = { context: audioContext, oscillator, gain };
      activeVoices.add(voice);
      oscillator.type = "sine";

      const now = audioContext.currentTime;
      const finish = now + sweepDuration / 1000;
      oscillator.frequency.setValueAtTime(startFrequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, finish);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.14, now + 0.18);
      gain.gain.setValueAtTime(0.14, finish - 0.22);
      gain.gain.exponentialRampToValueAtTime(0.0001, finish);

      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(finish + 0.03);

      sweepStartedAt = now;
      setListeningState("playing");

      heardButton.focus({ preventScroll: true });
      setText("[data-audio-status]", "Playing");
      listeningStage.classList.remove("is-idle");
      runSweepProgress();
      startReadout();

      const completeSweep = () => {
        if (run !== toneRun) return;
        // A wall timer can run before the audio clock reaches the endpoint.
        const remaining = finish - audioContext.currentTime;
        if (remaining > 0.01) {
          sweepTimer = window.setTimeout(completeSweep, remaining * 1000);
          return;
        }
        finishSweep();
      };
      sweepTimer = window.setTimeout(completeSweep, sweepDuration);
    } catch {
      if (run !== toneRun) return;
      stopTone();
      setListeningState("error");
      startToneButton.hidden = false;
      startToneButton.disabled = false;
      startToneButton.focus({ preventScroll: true });
      listeningStage.classList.add("is-idle");
      resetSweepProgress();
      showError(
        "This browser could not play the preview tone. Check that audio is allowed, then try again.",
      );
    }
  };

  const showTurnOutcome = () => {
    stopTone();
    phase = "idle";

    if (responses[1] === undefined) {
      setProgress(1);
      showScreen("handoff");
      return;
    }

    showResult();
  };

  const finishTurn = (heardFrequency) => {
    responses[turn] = heardFrequency;
    showTurnOutcome();
  };

  const showResult = () => {
    const matchedPartner = responses.findIndex((response, partner) =>
      response !== null && response - (responses[1 - partner] ?? endFrequency) >= minimumMatchGap,
    );
    const hasRange = matchedPartner >= 0;
    const otherPartner = 1 - matchedPartner;
    setText("[data-result-for]", hasRange
      ? `Based on your answers, ${partnerLabels[matchedPartner]} is more likely to hear a tone in this range than ${partnerLabels[otherPartner]}.`
      : "This test found no tone to suggest for either partner on this device.");
    const nextLink = root.querySelector("[data-result-next]");
    nextLink.textContent = hasRange ? "Get Couples Alarm" : "About Couples Alarm";
    nextLink.setAttribute("href", hasRange ? "../download/" : "../");
    setText(
      "[data-result-title]",
      hasRange ? `Suggested tone for ${partnerLabels[matchedPartner]}` : "No clear match",
    );
    setText(
      "[data-result-limit]",
      hasRange
        ? "This is a starting point. In the app you each take a listening turn on your phone, preview a suggested tone and confirm it with a bedside fit check."
        : responses.every((response) => response === null)
          ? "Neither partner heard the sweep. Try another device with the same comfortable volume."
          : "Your responses are too close for a useful range on this device.",
    );
    setText("[data-result-partner-one-label]", partnerLabels[0]);
    setText("[data-result-partner-two-label]", partnerLabels[1]);
    setText("[data-result-partner-one]", responseText(responses[0]));
    setText("[data-result-partner-two]", responseText(responses[1]));

    const sweetSpotBand = root.querySelector("[data-sweet-spot-band]");
    const resultSpectrum = root.querySelector("[data-result-spectrum]");
    const endpointOne = root.querySelector("[data-result-endpoint-one]");
    const endpointTwo = root.querySelector("[data-result-endpoint-two]");
    responses.forEach((response, index) => {
      const marker = root.querySelector(
        index === 0 ? "[data-result-marker-one]" : "[data-result-marker-two]",
      );
      marker.hidden = response === null;
      if (response !== null) marker.style.left = `${frequencyPosition(response)}%`;
    });

    endpointOne.classList.toggle("is-missing", responses[0] === null);
    endpointTwo.classList.toggle("is-missing", responses[1] === null);
    resultSpectrum.classList.toggle("has-range", hasRange);
    const resultDescription = responses
      .map((response, index) =>
        response === null
          ? `${partnerLabels[index]} did not hear the sweep`
          : `${partnerLabels[index]} heard ${responseText(response)}`,
      )
      .join(". ");

    if (!hasRange) {
      sweetSpotBand.hidden = true;
      setText("[data-sweet-spot-value]", "No clear range");
      resultSpectrum.setAttribute(
        "aria-label",
        `${resultDescription}. No clear alarm sweet spot.`,
      );
    } else {
      const highFrequency = responses[matchedPartner] - sweetSpotMargin;
      const lowFrequency =
        (responses[otherPartner] ?? endFrequency) + sweetSpotMargin;
      sweetSpotBand.hidden = false;
      sweetSpotBand.style.left = `${frequencyPosition(lowFrequency)}%`;
      sweetSpotBand.style.width = `${frequencyPosition(highFrequency) - frequencyPosition(lowFrequency)}%`;
      setText(
        "[data-sweet-spot-value]",
        `${kilohertzText(lowFrequency)}–${kilohertzText(highFrequency)} kHz`,
      );
      resultSpectrum.setAttribute(
        "aria-label",
        `${resultDescription}. Possible alarm sweet spot from ${kilohertzText(lowFrequency)} to ${kilohertzText(highFrequency)} kilohertz for ${partnerLabels[matchedPartner]}.`,
      );
    }
    setProgress(2);
    showScreen("result");
  };

  root.querySelector("[data-start-tone]").addEventListener("click", startTone);
  root.querySelector("[data-retry-turn]").addEventListener("click", startTone);
  root.querySelector("[data-pause-tone]").addEventListener("click", () => pauseTurn());
  const downloads = root.querySelector(".test-downloads");
  downloads?.addEventListener("click", event => {
    if (event.target.closest("a")) pauseTurn(false);
  });
  downloads?.addEventListener("auxclick", event => {
    if (event.button === 1 && event.target.closest("a")) pauseTurn(false);
  });

  for (const selector of ["[data-heard]", "[data-not-heard]"]) {
    root.querySelector(selector).addEventListener("keydown", event => {
      // A held Enter can outlive the Start button as focus moves to a response.
      if (event.key === "Enter" && event.repeat) event.preventDefault();
    });
  }

  root.querySelector("[data-heard]").addEventListener("click", event => {
    // Touch browsers can report the second tap as a new click when Start becomes the answer.
    if (event.detail > 0 && startPointer && event.timeStamp - startPointer.time < 300 &&
        Math.hypot(event.clientX - startPointer.x, event.clientY - startPointer.y) < 24) return;
    if (currentScreen !== "listen" || !sweepPlaying || audioContext.state !== "running") return;
    const progress = ((audioContext.currentTime - sweepStartedAt) * 1000) / sweepDuration;
    if (progress > 1) {
      // A delayed timer must not let a late tap invent an end-of-sweep response.
      finishSweep();
      return;
    }
    finishTurn(frequencyAt(progress));
  });

  root.querySelector("[data-not-heard]").addEventListener("click", () => {
    if (currentScreen !== "listen" || phase !== "finished") return;
    finishTurn(null);
  });

  root.querySelector("[data-next-turn]").addEventListener("click", event => {
    if (currentScreen !== "handoff") return;
    turn = 1;
    prepareTurn();
    showScreen("listen");
    startTone(event);
  });

  for (const button of root.querySelectorAll("[data-redo-turn]")) {
    button.addEventListener("click", () => {
      const partner = Number(button.dataset.redoTurn);
      if (currentScreen === "listen" || responses[partner] === undefined) return;
      turn = partner;
      prepareTurn();
      showScreen("listen");
    });
  }
  cancelRedo.addEventListener("click", () => {
    if (currentScreen === "listen" && responses[turn] !== undefined) showTurnOutcome();
  });

  const restart = () => {
    stopTone();
    turn = 0;
    responses = [undefined, undefined];
    prepareTurn();
    showScreen("listen");
  };
  root.querySelector("[data-restart]").addEventListener("click", restart);

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pauseTurn(false);
  });

  const closeAudio = () => {
    pauseTurn(false);
    stopTone();
    const context = audioContext;
    audioContext = undefined;
    if (context && context.state !== "closed") {
      context.close().catch(() => {});
    }
  };

  window.addEventListener("pagehide", closeAudio);

  updateDeviceCopy();
  prepareTurn();

  return {
    pause: () => pauseTurn(false),
    restart,
    focusStep,
  };
}

const standalone = typeof document !== "undefined" && document.querySelector("[data-sound-test]");
if (standalone) mountSoundTest(standalone);
