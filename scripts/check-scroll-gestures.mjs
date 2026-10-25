import assert from 'node:assert/strict';
import { createWheelGesture } from '../scroll-gesture.js';

const native = { preventDefault: false, direction: 0 };
const blocked = { preventDefault: true, direction: 0 };
const next = { preventDefault: true, direction: 1 };
const previous = { preventDefault: true, direction: -1 };
const event = (now, deltaY, extra = {}) => ({ deltaX: 0, deltaY, now, viewportHeight: 800, ...extra });
const cases = [];
function check(name, run) { run(); cases.push(name); }

check('one trackpad burst and its long momentum tail produce one step', () => {
  const gesture = createWheelGesture();
  const samples = [4, 8, 36, 84, 64, 38, 21, 12, 7, 4, 2, 1];
  const results = samples.map((delta, index) => gesture.update(event(index * 45, delta, { busy: index > 1 && index < 8 })));
  assert.deepEqual(results[0], blocked);
  assert.deepEqual(results[1], next);
  assert.equal(results.filter(result => result.direction !== 0).length, 1);
  assert.ok(results.every(result => result.preventDefault));
  assert.deepEqual(gesture.update(event(720, 30)), next);
});

check('large mouse wheel deltas cannot skip photos within one burst', () => {
  const gesture = createWheelGesture();
  assert.deepEqual(gesture.update(event(0, 1200)), next);
  assert.deepEqual(gesture.update(event(40, 2400)), blocked);
  assert.deepEqual(gesture.update(event(190, 1200)), blocked);
  assert.deepEqual(gesture.update(event(370, 1200)), next);
});

check('a separate gesture while busy is consumed without a queued step', () => {
  const gesture = createWheelGesture();
  assert.deepEqual(gesture.update(event(0, 50)), next);
  assert.deepEqual(gesture.update(event(250, 50, { busy: true })), blocked);
  assert.deepEqual(gesture.update(event(400, 50)), blocked);
  assert.deepEqual(gesture.update(event(580, 50)), next);
});

check('small vertical intent is accumulated and never leaks native scrolling', () => {
  const gesture = createWheelGesture();
  assert.deepEqual(gesture.update(event(0, 3)), blocked);
  assert.deepEqual(gesture.update(event(20, 4)), blocked);
  assert.deepEqual(gesture.update(event(40, 5)), next);
});

check('quiet gaps discard subthreshold intent', () => {
  const gesture = createWheelGesture();
  assert.deepEqual(gesture.update(event(0, 8)), blocked);
  assert.deepEqual(gesture.update(event(180, 8)), blocked);
  assert.deepEqual(gesture.update(event(200, 4)), next);
});

check('a reversal before the threshold accumulates only the new intent', () => {
  const gesture = createWheelGesture();
  assert.deepEqual(gesture.update(event(0, 8)), blocked);
  assert.deepEqual(gesture.update(event(20, -5)), blocked);
  assert.deepEqual(gesture.update(event(40, -7)), previous);
  assert.deepEqual(gesture.update(event(60, 100)), blocked);
});

check('horizontal, zero and invalid input neither act nor prolong a vertical burst', () => {
  const gesture = createWheelGesture();
  assert.deepEqual(gesture.update(event(0, 20)), next);
  assert.deepEqual(gesture.update(event(170, 10, { deltaX: 50 })), native);
  assert.deepEqual(gesture.update(event(175, 0)), native);
  assert.deepEqual(gesture.update(event(176, NaN)), native);
  assert.deepEqual(gesture.update(event(177, 20, { deltaX: Infinity })), native);
  assert.deepEqual(gesture.update(event(178, 20, { now: NaN })), native);
  assert.deepEqual(gesture.update(event(180, 20)), next);
});

check('line and page delta modes normalize to pixels', () => {
  const gesture = createWheelGesture();
  assert.deepEqual(gesture.update(event(0, 0.5, { deltaMode: 1 })), blocked);
  assert.deepEqual(gesture.update(event(20, 0.25, { deltaMode: 1 })), next);
  assert.deepEqual(gesture.update(event(200, -0.02, { deltaMode: 2 })), previous);
  assert.deepEqual(gesture.update(event(400, 1, { deltaMode: 3 })), native);
  assert.deepEqual(gesture.update(event(400, 1, { deltaMode: 2, viewportHeight: 0 })), native);
});

check('physical boundaries allow an unconsumed gesture to reach header or footer', () => {
  const gesture = createWheelGesture();
  assert.deepEqual(gesture.update(event(0, -30, { atStart: true })), native);
  assert.deepEqual(gesture.update(event(30, -20, { atStart: true })), native);
  assert.deepEqual(gesture.update(event(250, 30, { atEnd: true })), native);
  assert.deepEqual(gesture.update(event(500, 30, { atStart: true })), next);
  assert.deepEqual(gesture.update(event(700, -30, { atEnd: true })), previous);
});

check('consumed momentum stays blocked at the next physical boundary', () => {
  const gesture = createWheelGesture();
  assert.deepEqual(gesture.update(event(0, 30)), next);
  assert.deepEqual(gesture.update(event(80, 30, { atEnd: true })), blocked);
  assert.deepEqual(gesture.update(event(240, 10, { atEnd: true })), blocked);
  assert.deepEqual(gesture.update(event(420, 30, { atEnd: true })), native);
});

check('busy input at a boundary also blocks its tail after motion finishes', () => {
  const gesture = createWheelGesture();
  assert.deepEqual(gesture.update(event(0, -30, { atStart: true, busy: true })), blocked);
  assert.deepEqual(gesture.update(event(100, -30, { atStart: true })), blocked);
  assert.deepEqual(gesture.update(event(280, -30, { atStart: true })), native);
});

check('reset clears both a consumed gesture and pending intent', () => {
  const gesture = createWheelGesture();
  assert.deepEqual(gesture.update(event(0, 30)), next);
  gesture.reset();
  assert.deepEqual(gesture.update(event(10, -30)), previous);
  gesture.reset();
  assert.deepEqual(gesture.update(event(20, 8)), blocked);
  gesture.reset();
  assert.deepEqual(gesture.update(event(30, 4)), blocked);
});

check('custom thresholds and a restarted monotonic clock work predictably', () => {
  const gesture = createWheelGesture({ quietMs: 300, threshold: 20 });
  assert.deepEqual(gesture.update(event(1000, 19)), blocked);
  assert.deepEqual(gesture.update(event(1020, 1)), next);
  assert.deepEqual(gesture.update(event(1100, 20)), blocked);
  assert.deepEqual(gesture.update(event(10, 20)), next);
  assert.deepEqual(gesture.update(event(310, 20)), next);
});

console.log(`Wheel gesture checks passed (${cases.length} scenarios).`);
