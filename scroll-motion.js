// Closed-form critically damped motion: targets may change without restarting a timed animation.
export function advanceSpring(position, velocity, target, seconds, frequency = 26) {
  const dt = Math.min(Math.max(seconds, 0), 0.05);
  const displacement = position - target;
  const coefficient = velocity + frequency * displacement;
  const decay = Math.exp(-frequency * dt);
  return {
    position: target + (displacement + coefficient * dt) * decay,
    velocity: (velocity - frequency * coefficient * dt) * decay,
  };
}

export function nearestStop(stops, position) {
  return stops.reduce((best, top, index) => Math.abs(top - position) < Math.abs(stops[best] - position) ? index : best, 0);
}

export function adjacentStop(stops, anchor, direction) {
  return Math.max(0, Math.min(stops.length - 1, anchor + direction));
}

export function followPosition(stops, anchor, start, offset) {
  // The visual start may still be between frames when a fresh operation interrupts settling.
  const low = Math.min(start, stops[adjacentStop(stops, anchor, -1)]);
  const high = Math.max(start, stops[adjacentStop(stops, anchor, 1)]);
  return Math.max(low, Math.min(high, start + offset));
}
