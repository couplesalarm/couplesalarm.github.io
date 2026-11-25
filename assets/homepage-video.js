(() => {
  const preview = document.querySelector("#product-preview");
  const trigger = document.querySelector(".video-open");
  const toggle = document.querySelector(".preview-toggle");
  const dialog = document.querySelector(".video-dialog");
  const player = document.querySelector("#story-player");
  const close = document.querySelector(".video-close");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let inView = !("IntersectionObserver" in window);
  let pausedByVisitor = false;
  let autoplayBlocked = false;

  const canPreview = () =>
    inView && !document.hidden && !dialog.open && !reducedMotion.matches &&
    !pausedByVisitor && !autoplayBlocked && !preview.ended;

  function syncPreview() {
    if (!canPreview()) {
      preview.pause();
    } else if (preview.paused) {
      if (!preview.hasAttribute("src")) preview.src = trigger.href;
      preview.muted = true;
      preview.play().catch(error => {
        if (error.name !== "AbortError") autoplayBlocked = true;
      });
    }
  }

  function hideToggle() {
    if (document.activeElement === toggle) trigger.focus({ preventScroll: true });
    toggle.hidden = true;
  }

  preview.addEventListener("playing", () => {
    if (canPreview()) toggle.hidden = false;
    else preview.pause();
  });
  preview.addEventListener("ended", hideToggle);
  toggle.addEventListener("click", () => {
    pausedByVisitor = !pausedByVisitor;
    toggle.textContent = pausedByVisitor ? "Resume preview" : "Pause preview";
    syncPreview();
  });
  function onMotionChange() {
    if (reducedMotion.matches) hideToggle();
    else if (pausedByVisitor) toggle.hidden = false;
    syncPreview();
  }

  if (reducedMotion.addEventListener) {
    reducedMotion.addEventListener("change", onMotionChange);
  } else {
    reducedMotion.addListener(onMotionChange);
  }
  document.addEventListener("visibilitychange", syncPreview);

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      syncPreview();
    });
    observer.observe(trigger);
  }
  syncPreview();

  if (typeof dialog.showModal !== "function") return;
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.addEventListener("click", event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    dialog.showModal();
    preview.pause();
    if (!player.hasAttribute("src")) {
      player.poster = preview.poster;
      player.src = trigger.href;
    }
    player.currentTime = 0;
    player.muted = false;
    player.play().catch(() => {
      // Native controls remain available if the browser declines playback.
    });
  });

  function closePlayer() {
    player.pause();
    dialog.close();
  }

  close.addEventListener("click", closePlayer);
  dialog.addEventListener("cancel", event => {
    event.preventDefault();
    closePlayer();
  });
  dialog.addEventListener("close", () => {
    if (dialog.open) return;
    player.pause();
    trigger.focus({ preventScroll: true });
    syncPreview();
  });
})();
