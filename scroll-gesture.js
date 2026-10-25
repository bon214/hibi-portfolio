/**
 * Reduce a wheel burst, including its momentum tail, to at most one photo step.
 * The caller decides whether the gallery can take over scrolling at all.
 */
export function createWheelGesture({ quietMs = 180, threshold = 12 } = {}) {
  if (!Number.isFinite(quietMs) || quietMs < 0 || !Number.isFinite(threshold) || threshold <= 0) {
    throw new RangeError('Wheel gesture timing and threshold must be finite positive values.');
  }

  let lastVerticalAt = null;
  let accumulated = 0;
  let pendingDirection = 0;
  let consumed = false;

  function reset() {
    lastVerticalAt = null;
    accumulated = 0;
    pendingDirection = 0;
    consumed = false;
  }

  function update(input = {}) {
    const { deltaX, deltaY, deltaMode = 0, viewportHeight, now, busy, atStart, atEnd } = input;
    const native = { preventDefault: false, direction: 0 };
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY) || !Number.isFinite(now)) return native;
    if (deltaY === 0 || Math.abs(deltaX) > Math.abs(deltaY)) return native;

    let scale = 1;
    if (deltaMode === 1) scale = 16;
    else if (deltaMode === 2 && Number.isFinite(viewportHeight) && viewportHeight > 0) scale = viewportHeight;
    else if (deltaMode !== 0) return native;
    const vertical = deltaY * scale;
    if (!Number.isFinite(vertical)) return native;

    if (lastVerticalAt === null || now < lastVerticalAt || now - lastVerticalAt >= quietMs) {
      accumulated = 0;
      pendingDirection = 0;
      consumed = false;
    }
    lastVerticalAt = now;

    // A burst received during motion is consumed, never queued for later.
    // Check this before the boundaries so a momentum tail cannot spill into the footer.
    if (busy) consumed = true;
    if (consumed) return { preventDefault: true, direction: 0 };

    const direction = Math.sign(vertical);
    if ((direction < 0 && atStart) || (direction > 0 && atEnd)) {
      accumulated = 0;
      pendingDirection = 0;
      return native;
    }

    // Opposite intent starts a fresh accumulation before any step was accepted.
    if (direction !== pendingDirection) accumulated = 0;
    pendingDirection = direction;
    accumulated += Math.abs(vertical);
    if (accumulated < threshold) return { preventDefault: true, direction: 0 };

    consumed = true;
    return { preventDefault: true, direction };
  }

  return { update, reset };
}
