export function dismissOnBackdrop(dialog, close) {
  const isBackdrop = event => {
    if (event.target !== dialog) return false;
    const bounds = dialog.getBoundingClientRect();
    return event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom;
  };

  let startedOutside = false;
  dialog.addEventListener("pointerdown", event => {
    startedOutside = event.isPrimary && event.button === 0 && isBackdrop(event);
  });
  const reset = () => { startedOutside = false; };
  dialog.addEventListener("pointercancel", reset);
  dialog.addEventListener("close", reset);
  dialog.addEventListener("click", event => {
    const shouldClose = dialog.open && startedOutside && isBackdrop(event);
    reset();
    if (shouldClose) close();
  });
}
