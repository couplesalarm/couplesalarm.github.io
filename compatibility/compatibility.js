(() => {
  const partnerLabels = ["Partner One", "Partner Two"];
  const screens = [...document.querySelectorAll("[data-screen]")];
  const progressSteps = [...document.querySelectorAll(".progress-step")];
  const errorMessage = document.querySelector("[data-error-message]");
  const listeningStage = document.querySelector(".listening-stage");
  const sweepProgress = document.querySelector("[data-sweep-progress]");

  const startFrequency = 17500;
  const endFrequency = 8500;
  const sweepDuration = 20000;
  const minimumMatchGap = 800;
  const sweetSpotMargin = 300;

  if (navigator.audioSession) {
    navigator.audioSession.type = "playback";
  }

  const wakingPartner = 0;
  const listeningOrder = [0, 1];
  let turn = 0;
  let responses = [undefined, undefined];
  let audioContext;
  const activeVoices = new Set();
  let toneRun = 0;
  let sweepStartedAt = 0;
  let sweepPlaying = false;
  let phase = "idle";
  let currentScreen = "ready";
  let sweepTimer;
  let readoutTimer;

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
      setText("[data-audio-detail]", `${Math.max(0, Math.ceil((sweepDuration / 1000) * (1 - progress)))} seconds left`);
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
          intro: "Take the test together on this iPhone.",
          title: "iPhone speaker",
        }
      : isIPad
        ? {
            intro: "Take the test together on this iPad.",
            title: "iPad speaker",
          }
        : phoneQuery.matches
          ? {
              intro: "Take the test together on this phone.",
              title: "Phone speaker",
            }
          : {
              intro: "Take the test together on this device.",
              title: "Built-in speakers",
            };

  const updateDeviceCopy = () => {
    const deviceCopy = currentDeviceCopy();
    document.querySelectorAll("[data-device-intro]").forEach((element) => {
      element.textContent = deviceCopy.intro;
    });
    document.querySelectorAll("[data-speaker-title]").forEach((element) => {
      element.textContent = deviceCopy.title;
    });
  };

  phoneQuery.addEventListener("change", updateDeviceCopy);

  const setText = (selector, value) => {
    document.querySelectorAll(selector).forEach((element) => {
      element.textContent = value;
    });
  };

  const setProgress = (currentIndex) => {
    progressSteps.forEach((step, index) => {
      step.classList.toggle("is-current", index === currentIndex);
      step.classList.toggle("is-complete", index < currentIndex);
      if (index === currentIndex) {
        step.setAttribute("aria-current", "step");
      } else {
        step.removeAttribute("aria-current");
      }
    });
  };

  const showScreen = (name) => {
    currentScreen = name;
    let visibleScreen;
    screens.forEach((screen) => {
      screen.hidden = screen.dataset.screen !== name;
      if (!screen.hidden) visibleScreen = screen;
    });
    errorMessage.hidden = true;
    window.scrollTo(0, 0);
    const heading = visibleScreen?.querySelector("h1, h2");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
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

  // The sweep bar is driven by a single CSS transition rather than a per-frame
  // loop, so it still reads as progress without an animation callback.
  const resetSweepProgress = () => {
    listeningStage.classList.remove("is-sweeping");
    sweepProgress.style.transitionDuration = "0ms";
    sweepProgress.style.transform = "scaleX(0)";
    void sweepProgress.offsetWidth;
    sweepProgress.style.transitionDuration = "";
  };

  const runSweepProgress = () => {
    resetSweepProgress();
    // Keeps the CSS sweep animations locked to the same clock as the audio.
    listeningStage.style.setProperty("--sweep-duration", `${sweepDuration}ms`);
    listeningStage.classList.add("is-sweeping");
    sweepProgress.style.transitionDuration = `${sweepDuration}ms`;
    sweepProgress.style.transform = "scaleX(1)";
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
      "[data-start-tone]": phase === "paused" || phase === "error",
      "[data-pause-tone]": phase === "starting" || phase === "playing",
      "[data-retry-turn]": phase === "finished",
    };
    Object.entries(controls).forEach(([selector, visible]) => {
      const button = document.querySelector(selector);
      button.hidden = !visible;
      button.disabled = !visible;
    });
    listeningStage.classList.toggle("is-idle", !["playing", "finished"].includes(phase));
    const copy = {
      starting: ["Starting…", "Getting the tone ready", "Tap as soon as you hear the tone."],
      playing: ["Playing", "20 seconds left", "The pitch is lowering. Keep the same volume."],
      finished: ["Tone finished", "Nothing is recorded until you choose below", "Didn’t hear it? Confirm below, or listen again."],
      paused: ["Paused", "No response was saved for this turn", "Retry when you’re ready. Keep the same volume."],
      error: ["Sound unavailable", "No response was saved for this turn", "Check that audio is allowed, then retry this turn."],
    }[phase];
    if (copy) {
      setText("[data-audio-status]", copy[0]);
      setText("[data-audio-detail]", copy[1]);
      setText("[data-listen-instruction]", copy[2]);
    }
  };

  const pauseTurn = (moveFocus = true) => {
    if (currentScreen !== "listen" || !["starting", "playing"].includes(phase)) return;
    stopTone();
    setListeningState("paused");
    resetSweepProgress();
    setReadout(startFrequency);
    if (moveFocus) document.querySelector("[data-start-tone]").focus({ preventScroll: true });
  };

  const prepareTurn = () => {
    setText("[data-listening-partner]", partnerLabels[listeningOrder[turn]]);
    setText("[data-turn-number]", String(turn + 1));
    setListeningState("idle");
    resetSweepProgress();
    setReadout(startFrequency);
  };

  const startTone = async () => {
    if (currentScreen !== "listen" || ["starting", "playing"].includes(phase)) return;
    stopTone();
    const run = toneRun;
    errorMessage.hidden = true;
    const startToneButton = document.querySelector("[data-start-tone]");
    const heardButton = document.querySelector("[data-heard]");
    const notHeardButton = document.querySelector("[data-not-heard]");
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

      heardButton.hidden = false;
      heardButton.disabled = false;
      notHeardButton.hidden = true;
      notHeardButton.disabled = true;
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
        stopTone();
        setListeningState("finished");
        heardButton.hidden = true;
        heardButton.disabled = true;
        notHeardButton.hidden = false;
        notHeardButton.disabled = false;
        notHeardButton.focus({ preventScroll: true });
        setReadout(endFrequency);
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

  const finishTurn = (heardFrequency) => {
    responses[listeningOrder[turn]] = heardFrequency;
    stopTone();
    phase = "idle";

    if (turn === 0) {
      const nextPartner = partnerLabels[listeningOrder[1]];
      setText("[data-next-partner]", nextPartner);
      setText("[data-first-result-label]", partnerLabels[listeningOrder[turn]]);
      setText("[data-first-result]", responseText(heardFrequency));
      setProgress(1);
      showScreen("handoff");
      return;
    }

    showResult();
  };

  const showResult = () => {
    const sleepingPartner = wakingPartner === 0 ? 1 : 0;
    const wakingResponse = responses[wakingPartner];
    const sleepingResponse = responses[sleepingPartner];
    const requestedMatch =
      wakingResponse !== null &&
      wakingResponse - (sleepingResponse ?? endFrequency) >= minimumMatchGap;
    const reverseMatch =
      sleepingResponse !== null &&
      sleepingResponse - (wakingResponse ?? endFrequency) >= minimumMatchGap;
    const matchedPartner = requestedMatch
      ? wakingPartner
      : reverseMatch
        ? sleepingPartner
        : undefined;

    const hasRange = matchedPartner !== undefined;
    setText("[data-result-for]", hasRange
      ? `A range to try for ${partnerLabels[matchedPartner]}`
      : "No useful range found on this device");
    const nextLink = document.querySelector("[data-result-next]");
    nextLink.textContent = hasRange ? "Get Couples Alarm" : "About Couples Alarm";
    nextLink.setAttribute("href", hasRange ? "../download/" : "../");
    setText(
      "[data-result-title]",
      hasRange ? "A possible match" : "No clear match",
    );
    setText(
      "[data-result-limit]",
      hasRange
        ? "Confirm this range with a bedside alarm before relying on it."
        : responses.every((response) => response === null)
          ? "Neither partner heard the sweep on this device. Its speaker and your volume can affect the result."
          : "There wasn’t enough room between your responses for a useful range. This device and volume can affect the result.",
    );
    setText("[data-result-partner-one-label]", partnerLabels[0]);
    setText("[data-result-partner-two-label]", partnerLabels[1]);
    setText("[data-result-partner-one]", responseText(responses[0]));
    setText("[data-result-partner-two]", responseText(responses[1]));

    const sweetSpotBand = document.querySelector("[data-sweet-spot-band]");
    const resultSpectrum = document.querySelector("[data-result-spectrum]");
    const endpointOne = document.querySelector("[data-result-endpoint-one]");
    const endpointTwo = document.querySelector("[data-result-endpoint-two]");
    const lowPartner =
      (responses[0] ?? endFrequency) <= (responses[1] ?? endFrequency) ? 0 : 1;

    responses.forEach((response, index) => {
      const marker = document.querySelector(
        index === 0 ? "[data-result-marker-one]" : "[data-result-marker-two]",
      );
      marker.hidden = response === null;
      if (response !== null) marker.style.left = `${frequencyPosition(response)}%`;
    });

    endpointOne.style.order = lowPartner === 0 ? "0" : "1";
    endpointTwo.style.order = lowPartner === 1 ? "0" : "1";
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
      const otherPartner = matchedPartner === 0 ? 1 : 0;
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

  document.querySelector("[data-start-preview]").addEventListener("click", () => {
    if (currentScreen !== "ready") return;
    turn = 0;
    responses = [undefined, undefined];
    setProgress(0);
    prepareTurn();
    showScreen("listen");
    startTone();
  });

  document.querySelector("[data-start-tone]").addEventListener("click", startTone);
  document.querySelector("[data-retry-turn]").addEventListener("click", startTone);
  document.querySelector("[data-pause-tone]").addEventListener("click", () => pauseTurn());

  document.querySelector("[data-heard]").addEventListener("click", () => {
    if (currentScreen !== "listen" || !sweepPlaying || audioContext.state !== "running") return;
    const progress = ((audioContext.currentTime - sweepStartedAt) * 1000) / sweepDuration;
    if (progress > 1) {
      // A delayed timer must not let a late tap invent an end-of-sweep response.
      stopTone();
      setListeningState("finished");
      setReadout(endFrequency);
      document.querySelector("[data-not-heard]").focus({ preventScroll: true });
      return;
    }
    finishTurn(frequencyAt(progress));
  });

  document.querySelector("[data-not-heard]").addEventListener("click", () => {
    if (currentScreen !== "listen" || phase !== "finished") return;
    finishTurn(null);
  });

  document.querySelector("[data-next-turn]").addEventListener("click", () => {
    if (currentScreen !== "handoff") return;
    turn = 1;
    prepareTurn();
    showScreen("listen");
    startTone();
  });

  document.querySelector("[data-restart]").addEventListener("click", () => {
    stopTone();
    phase = "idle";
    turn = 0;
    responses = [undefined, undefined];
    setProgress(0);
    showScreen("ready");
  });

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
  window.addEventListener("beforeunload", closeAudio);

  updateDeviceCopy();
  setProgress(0);
  listeningStage.classList.add("is-idle");
})();
