(() => {
  const partnerLabels = ["Partner One", "Partner Two"];
  const screens = [...document.querySelectorAll("[data-screen]")];
  const progressSteps = [...document.querySelectorAll(".progress-step")];
  const errorMessage = document.querySelector("[data-error-message]");
  const canvas = document.querySelector("#tone-visualizer");
  const context2d = canvas.getContext("2d");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const startFrequency = 17500;
  const endFrequency = 8500;
  const sweepDuration = 12000;

  let wakingPartner = 0;
  let listeningOrder = [0, 1];
  let turn = 0;
  let responses = [undefined, undefined];
  let audioContext;
  let oscillator;
  let gain;
  let sweepStartedAt = 0;
  let animationFrame;
  let sweepPlaying = false;

  const isIPhone = /iPhone|iPod/i.test(navigator.userAgent);
  const isIPad =
    /iPad/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isPhone = window.matchMedia("(max-width: 720px)").matches;

  const deviceCopy = isIPhone
    ? {
        intro: "You’ll each listen once on this iPhone.",
        title: "iPhone speaker",
        detail: "Use this iPhone’s speaker. No headphones.",
      }
    : isIPad
      ? {
          intro: "You’ll each listen once on this iPad.",
          title: "iPad speaker",
          detail: "Use this iPad’s speaker. No headphones.",
        }
      : isPhone
        ? {
            intro: "You’ll each listen once on this phone.",
            title: "Phone speaker",
            detail: "Use this phone’s speaker. No headphones.",
          }
        : {
            intro: "You’ll each listen once on this device.",
            title: "Built-in speakers",
            detail: "Use this device’s speakers. No headphones.",
          };

  const updateDeviceCopy = () => {
    document.querySelectorAll("[data-device-intro]").forEach((element) => {
      element.textContent = deviceCopy.intro;
    });
    document.querySelectorAll("[data-speaker-title]").forEach((element) => {
      element.textContent = deviceCopy.title;
    });
    document.querySelectorAll("[data-speaker-copy]").forEach((element) => {
      element.textContent = deviceCopy.detail;
    });
  };

  const setText = (selector, value) => {
    document.querySelectorAll(selector).forEach((element) => {
      element.textContent = value;
    });
  };

  const updateRoles = () => {
    const sleepingPartner = wakingPartner === 0 ? 1 : 0;
    listeningOrder = [wakingPartner, sleepingPartner];
    setText("[data-waking-partner]", partnerLabels[wakingPartner]);
    setText("[data-sleeping-partner]", partnerLabels[sleepingPartner]);
    setText("[data-starting-partner]", partnerLabels[listeningOrder[0]]);

    const firstProgress = document.querySelector('[data-progress="partner-one"]');
    const secondProgress = document.querySelector('[data-progress="partner-two"]');
    firstProgress.lastChild.textContent = partnerLabels[listeningOrder[0]];
    secondProgress.lastChild.textContent = partnerLabels[listeningOrder[1]];
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
    const heading = visibleScreen?.querySelector("h1");
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  };

  const showError = (message) => {
    errorMessage.textContent = message;
    errorMessage.hidden = false;
  };

  const stopTone = () => {
    sweepPlaying = false;
    window.cancelAnimationFrame(animationFrame);

    if (oscillator) {
      try {
        oscillator.stop();
      } catch {
        // The oscillator may already have reached its scheduled stop time.
      }
      oscillator.disconnect();
      oscillator = undefined;
    }

    if (gain) {
      gain.disconnect();
      gain = undefined;
    }
  };

  const drawVisualizer = (progress = 0.08, playing = false) => {
    const width = canvas.width;
    const height = canvas.height;
    const gradient = context2d.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, "#55dce5");
    gradient.addColorStop(0.5, "#9b7de7");
    gradient.addColorStop(1, "#ff795c");

    context2d.clearRect(0, 0, width, height);

    const x = 90 + progress * (width - 180);
    const y = 95 + progress * (height - 185) - Math.sin(progress * Math.PI) * 72;

    context2d.save();
    context2d.globalCompositeOperation = "lighter";
    context2d.strokeStyle = gradient;
    context2d.lineWidth = 3;
    context2d.shadowBlur = 22;
    context2d.shadowColor = progress < 0.5 ? "#55dce5" : "#ff795c";

    context2d.beginPath();
    context2d.moveTo(90, 95);
    context2d.quadraticCurveTo(width * 0.52, -35, width - 90, height - 90);
    context2d.stroke();

    for (let index = 0; index < 13; index += 1) {
      const tailProgress = Math.max(0, progress - index * 0.032);
      const tailX = 90 + tailProgress * (width - 180);
      const tailY =
        95 +
        tailProgress * (height - 185) -
        Math.sin(tailProgress * Math.PI) * 72;
      context2d.globalAlpha = Math.max(0.08, 0.6 - index * 0.042);
      context2d.beginPath();
      context2d.arc(tailX, tailY, 12 + index * 2.4, 0, Math.PI * 2);
      context2d.stroke();
    }

    context2d.globalAlpha = playing ? 0.95 : 0.55;
    context2d.lineWidth = 5;
    context2d.beginPath();
    context2d.arc(x, y, playing ? 27 : 22, 0, Math.PI * 2);
    context2d.stroke();

    const baseline = height * 0.76;
    context2d.globalAlpha = playing ? 0.92 : 0.48;
    context2d.lineWidth = 2;
    context2d.beginPath();
    for (let px = 55; px <= width - 55; px += 4) {
      const normalized = px / width;
      const envelope =
        18 +
        58 * Math.exp(-Math.pow((normalized - 0.3) * 7, 2)) +
        72 * Math.exp(-Math.pow((normalized - 0.7) * 8, 2));
      const wave =
        Math.sin(px * 0.12 + progress * 22) *
        envelope *
        (playing ? 1 : 0.55);
      if (px === 55) {
        context2d.moveTo(px, baseline + wave);
      } else {
        context2d.lineTo(px, baseline + wave);
      }
    }
    context2d.stroke();
    context2d.restore();
  };

  const prepareTurn = () => {
    const partner = partnerLabels[listeningOrder[turn]];
    setText("[data-listening-partner]", partner);
    setText("[data-audio-status]", "Ready to listen");
    setText("[data-audio-detail]", `Tap Start when ${partner} is ready.`);

    const startToneButton = document.querySelector("[data-start-tone]");
    const heardButton = document.querySelector("[data-heard]");
    const notHeardButton = document.querySelector("[data-not-heard]");
    const stopToneButton = document.querySelector("[data-stop-tone]");
    startToneButton.hidden = false;
    heardButton.disabled = true;
    notHeardButton.hidden = false;
    notHeardButton.disabled = true;
    stopToneButton.hidden = true;
    drawVisualizer();
  };

  const startTone = async () => {
    stopTone();
    errorMessage.hidden = true;

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        throw new Error("Web Audio is not supported");
      }
      audioContext ||= new AudioContextClass();
      await audioContext.resume();

      oscillator = audioContext.createOscillator();
      gain = audioContext.createGain();
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

      const startToneButton = document.querySelector("[data-start-tone]");
      const heardButton = document.querySelector("[data-heard]");
      const notHeardButton = document.querySelector("[data-not-heard]");
      const stopToneButton = document.querySelector("[data-stop-tone]");
      startToneButton.hidden = true;
      heardButton.disabled = false;
      notHeardButton.hidden = true;
      notHeardButton.disabled = true;
      stopToneButton.hidden = false;
      heardButton.focus({ preventScroll: true });
      setText("[data-audio-status]", "Listening…");
      setText("[data-audio-detail]", "The tone is sweeping down.");

      const animate = () => {
        const progress = Math.min(
          1,
          (performance.now() - sweepStartedAt) / sweepDuration,
        );
        drawVisualizer(reduceMotion.matches ? 0.45 : progress, true);

        if (progress < 1 && sweepPlaying) {
          animationFrame = window.requestAnimationFrame(animate);
          return;
        }

        stopTone();
        heardButton.disabled = true;
        notHeardButton.hidden = false;
        notHeardButton.disabled = false;
        stopToneButton.hidden = true;
        notHeardButton.focus({ preventScroll: true });
        setText("[data-audio-status]", "The sweep finished");
        setText("[data-audio-detail]", "Choose “I didn’t hear it” to continue.");
        drawVisualizer(1, false);
      };

      animationFrame = window.requestAnimationFrame(animate);
    } catch {
      stopTone();
      document.querySelector("[data-start-tone]").hidden = false;
      document
        .querySelector("[data-start-tone]")
        .focus({ preventScroll: true });
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
      (sleepingResponse === null || wakingResponse - sleepingResponse >= 800);
    const reverseMatch =
      sleepingResponse !== null &&
      (wakingResponse === null || sleepingResponse - wakingResponse >= 800);

    let title;
    let summary;

    if (requestedMatch) {
      title = "There may be a promising match.";
      summary = `${partnerLabels[wakingPartner]} responded earlier in the sweep. That suggests there may be a tone worth confirming in the app.`;
    } else if (reverseMatch) {
      title = "A match may work in the other direction.";
      summary = `${partnerLabels[sleepingPartner]} responded earlier in the sweep. Couples Alarm can retest with the roles reversed, but it never switches them without asking.`;
    } else if (responses.every((response) => response === null)) {
      title = "No clear difference on this device.";
      summary =
        "Neither partner heard the full sweep here. Try once more in a quiet room, or keep using an alarm you already trust.";
    } else {
      title = "No clear difference on this device.";
      summary =
        "Your responses were too close for a confident preview here. That is a useful answer—do not rely on Couples Alarm unless the app finds and confirms a match.";
    }

    setText("[data-result-title]", title);
    setText("[data-result-summary]", summary);
    setText("[data-result-partner-one-label]", partnerLabels[0]);
    setText("[data-result-partner-two-label]", partnerLabels[1]);
    setText(
      "[data-result-partner-one]",
      responses[0] === null ? "Did not hear the sweep" : "Heard during the sweep",
    );
    setText(
      "[data-result-partner-two]",
      responses[1] === null ? "Did not hear the sweep" : "Heard during the sweep",
    );
    setProgress(3);
    showScreen("result");
  };

  document.querySelectorAll("[data-swap-roles]").forEach((button) => {
    button.addEventListener("click", () => {
      wakingPartner = wakingPartner === 0 ? 1 : 0;
      updateRoles();
    });
  });

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
    const heardFrequency =
      startFrequency * Math.pow(endFrequency / startFrequency, progress);
    finishTurn(heardFrequency);
  });

  document.querySelector("[data-not-heard]").addEventListener("click", () => {
    if (sweepPlaying) return;
    finishTurn(null);
  });

  document.querySelector("[data-stop-tone]").addEventListener("click", () => {
    stopTone();
    prepareTurn();
    setText("[data-audio-status]", "Preview stopped");
    setText("[data-audio-detail]", "Start again when you are ready.");
    document.querySelector("[data-start-tone]").focus({ preventScroll: true });
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
    updateRoles();
    showScreen("ready");
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden || !sweepPlaying) return;
    stopTone();
    document.querySelector("[data-start-tone]").hidden = false;
    document.querySelector("[data-heard]").disabled = true;
    document.querySelector("[data-not-heard]").hidden = false;
    document.querySelector("[data-not-heard]").disabled = true;
    document.querySelector("[data-stop-tone]").hidden = true;
    setText("[data-audio-status]", "Preview paused");
    setText("[data-audio-detail]", "Start the tone again when you are ready.");
    drawVisualizer();
  });

  window.addEventListener("beforeunload", stopTone);

  updateDeviceCopy();
  updateRoles();
  setProgress(0);
  drawVisualizer();
})();
