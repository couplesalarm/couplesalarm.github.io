(() => {
  const preview = document.querySelector("#product-preview");
  const trigger = document.querySelector(".video-open");
  const dialog = document.querySelector(".video-dialog");
  const player = document.querySelector("#story-player");
  const close = document.querySelector(".video-close");
  let inView = !("IntersectionObserver" in window);
  let autoplayBlocked = false;

  const canPreview = () =>
    inView && !document.hidden && !dialog.open && !autoplayBlocked && !preview.ended;

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

  preview.addEventListener("playing", () => {
    if (!canPreview()) preview.pause();
  });
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
