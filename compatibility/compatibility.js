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
        (performance.now() - sweepStartedAt) / sweepDuration,
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

  const prepareTurn = () => {
    const partner = partnerLabels[listeningOrder[turn]];
    setText("[data-listening-partner]", partner);
    setText("[data-audio-status]", "Ready");

    const startToneButton = document.querySelector("[data-start-tone]");
    const heardButton = document.querySelector("[data-heard]");
    const notHeardButton = document.querySelector("[data-not-heard]");
    startToneButton.hidden = false;
    startToneButton.disabled = false;
    heardButton.hidden = true;
    heardButton.disabled = true;
    notHeardButton.hidden = true;
    notHeardButton.disabled = true;
    listeningStage.classList.add("is-idle");
    resetSweepProgress();
    setReadout(startFrequency);
  };

  const startTone = async () => {
    stopTone();
    const run = toneRun;
    errorMessage.hidden = true;
    const startToneButton = document.querySelector("[data-start-tone]");
    const heardButton = document.querySelector("[data-heard]");
    const notHeardButton = document.querySelector("[data-not-heard]");
    startToneButton.hidden = true;
    startToneButton.disabled = true;
    setText("[data-audio-status]", "Starting…");

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error("Web Audio is not supported");
      }
      audioContext ||= new AudioContextClass();
      await audioContext.resume();
      if (run !== toneRun) return;

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

      sweepStartedAt = performance.now();
      sweepPlaying = true;

      heardButton.hidden = false;
      heardButton.disabled = false;
      notHeardButton.hidden = true;
      notHeardButton.disabled = true;
      heardButton.focus({ preventScroll: true });
      setText("[data-audio-status]", "Playing");
      listeningStage.classList.remove("is-idle");
      runSweepProgress();
      startReadout();

      sweepTimer = window.setTimeout(() => {
        if (run !== toneRun) return;
        stopTone();
        heardButton.hidden = true;
        heardButton.disabled = true;
        notHeardButton.hidden = false;
        notHeardButton.disabled = false;
        notHeardButton.focus({ preventScroll: true });
        setText("[data-audio-status]", "Finished");
        setReadout(endFrequency);
      }, sweepDuration);
    } catch {
      if (run !== toneRun) return;
      stopTone();
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

    if (turn === 0) {
      const nextPartner = partnerLabels[listeningOrder[1]];
      setText("[data-next-partner]", nextPartner);
      setText("[data-first-result-label]", partnerLabels[listeningOrder[turn]]);
      setText("[data-first-result]", responseText(heardFrequency));
      setProgress(2);
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
      (sleepingResponse === null ||
        wakingResponse - sleepingResponse >= minimumMatchGap);
    const reverseMatch =
      sleepingResponse !== null &&
      (wakingResponse === null ||
        sleepingResponse - wakingResponse >= minimumMatchGap);
    const matchedPartner = requestedMatch
      ? wakingPartner
      : reverseMatch
        ? sleepingPartner
        : undefined;

    const hasRange = matchedPartner !== undefined;
    setText(
      "[data-result-title]",
      hasRange ? "A possible match" : "No clear match",
    );
    setText(
      "[data-result-limit]",
      hasRange
        ? "Confirm this range with a bedside alarm before relying on it."
        : responses.every((response) => response === null)
          ? "Neither partner heard the sweep."
          : "The two results were too close to show a useful gap.",
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
    setProgress(3);
    showScreen("result");
  };

  document.querySelector("[data-start-preview]").addEventListener("click", () => {
    turn = 0;
    responses = [undefined, undefined];
    setProgress(1);
    prepareTurn();
    showScreen("listen");
  });

  document.querySelector("[data-start-tone]").addEventListener("click", startTone);

  document.querySelector("[data-heard]").addEventListener("click", () => {
    if (!sweepPlaying) return;
    const progress = Math.min(
      1,
      (performance.now() - sweepStartedAt) / sweepDuration,
    );
    finishTurn(frequencyAt(progress));
  });

  document.querySelector("[data-not-heard]").addEventListener("click", () => {
    if (sweepPlaying) return;
    finishTurn(null);
  });

  document.querySelector("[data-next-turn]").addEventListener("click", () => {
    turn = 1;
    prepareTurn();
    showScreen("listen");
  });

  document.querySelector("[data-restart]").addEventListener("click", () => {
    stopTone();
    turn = 0;
    responses = [undefined, undefined];
    setProgress(0);
    showScreen("ready");
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) return;
    stopTone();
    // Re-enable as well as re-show: leaving the button disabled here stranded
    // the turn for anyone who backgrounded the page mid-sweep.
    document.querySelector("[data-start-tone]").hidden = false;
    document.querySelector("[data-start-tone]").disabled = false;
    document.querySelector("[data-heard]").hidden = true;
    document.querySelector("[data-heard]").disabled = true;
    document.querySelector("[data-not-heard]").hidden = true;
    document.querySelector("[data-not-heard]").disabled = true;
    setText("[data-audio-status]", "Paused");
    listeningStage.classList.add("is-idle");
    resetSweepProgress();
  });

  const closeAudio = () => {
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
