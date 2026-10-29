// One wheel burst or one completed vertical swipe produces one page request.
// State is independent of animation completion, so a fresh operation never waits for a cooldown.
export function createWheelGesture({ quietMs = 200, threshold = 2 } = {}) {
  let lastTime = -Infinity;
  let direction = 0;
  let accumulated = 0;
  let reversed = 0;
  let owned = false;
  function reset() { lastTime = -Infinity; direction = 0; accumulated = 0; reversed = 0; owned = false; }
  return {
    reset,
    claim() { owned = true; },
    read(input, now, height) {
      const { deltaX = 0, deltaY = 0, deltaMode = 0 } = input;
      if (input.ctrlKey || input.metaKey || input.altKey || input.shiftKey ||
          !Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
        reset();
        return { direction: 0, consume: false };
      }
      if (!deltaY || Math.abs(deltaX) >= Math.abs(deltaY)) {
        // A diagonal/zero tail must not turn the rest of an owned vertical burst into a second operation.
        if (now - lastTime >= quietMs) reset();
        else if (owned) lastTime = now;
        return { direction: 0, consume: false };
      }
      const delta = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? height : 1);
      const sign = Math.sign(delta);
      reversed = sign !== direction ? reversed + Math.abs(delta) : 0;
      const reverseIntent = reversed >= threshold;
      const fresh = now - lastTime >= quietMs || reverseIntent;
      if (fresh) { direction = sign; accumulated = reverseIntent ? sign * reversed - delta : 0; reversed = 0; owned = false; }
      lastTime = now;
      // Consume the entire owned burst, including its tiny momentum tail at the last photograph.
      if (owned) return { direction: 0, consume: true };
      accumulated += delta;
      return { direction: Math.abs(accumulated) >= threshold ? sign : 0, consume: false };
    },
  };
}

export function createTouchGesture({ threshold = 36, axisThreshold = 8 } = {}) {
  let start = null;
  let axis = null;
  function reset() { start = null; axis = null; }
  function move(point) {
    if (!start || point.id !== start.id) return;
    const dx = point.x - start.x, dy = point.y - start.y;
    if (!axis && Math.max(Math.abs(dx), Math.abs(dy)) >= axisThreshold) {
      if (Math.abs(dy) > Math.abs(dx) * 1.15) axis = 'vertical';
      else if (Math.abs(dx) > Math.abs(dy) * 1.15) axis = 'horizontal';
      // Leave an ambiguous diagonal undecided until the gesture has a clear axis.
    }
  }
  return {
    reset,
    start(point) { start = { ...point }; axis = null; },
    move,
    end(point) {
      if (!start || point.id !== start.id) { reset(); return 0; }
      move(point);
      const dy = point.y - start.y;
      const direction = axis === 'vertical' && Math.abs(dy) >= threshold ? -Math.sign(dy) : 0;
      reset();
      return direction;
    },
  };
}
