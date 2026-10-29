import assert from 'node:assert/strict';
import { advanceSpring, nearestStop, adjacentStop, followPosition } from '../scroll-motion.js';
import { createWheelGesture, createTouchGesture } from '../page-gestures.js';

const cases = [];
const test = (name, run) => cases.push({ name, run });
const near = (actual, expected, tolerance = 1e-8) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected} by more than ${tolerance}`);
};
const point = (x, y, id = 3) => ({ x, y, id });
// Twenty photographs plus a footer: its shorter gap must remain a real stop.
const stops = [...Array.from({ length: 20 }, (_, index) => index * 900), 17400];

function simulate({ position = 0, velocity = 0, target = 900, seconds = 1, hz = 60 }) {
  let state = { position, velocity };
  const frames = Math.round(seconds * hz);
  for (let index = 0; index < frames; index++) {
    state = advanceSpring(state.position, state.velocity, target, seconds / frames);
  }
  return state;
}

test('spring: a stationary target is approached monotonically from rest', () => {
  let state = { position: 0, velocity: 0 };
  for (let frame = 0; frame < 90; frame++) {
    const next = advanceSpring(state.position, state.velocity, 900, 1 / 60);
    assert.ok(next.position >= state.position - 1e-9, 'motion reversed before reaching its target');
    assert.ok(next.position <= 900 + 1e-9, 'motion overshot a stationary target from rest');
    state = next;
  }
  near(state.position, 900, 1e-5);
  near(state.velocity, 0, 1e-3);
});

test('spring: reverse movement converges to the target and comes to rest', () => {
  const state = simulate({ position: 5400, target: 4500, seconds: 1 });
  near(state.position, 4500, 1e-5);
  near(state.velocity, 0, 1e-3);
});

test('spring: a settled position remains stationary', () => {
  assert.deepEqual(advanceSpring(2700, 0, 2700, 1 / 60), { position: 2700, velocity: 0 });
});

for (const seconds of [0.1, 0.3, 1]) {
  test(`spring: 60Hz and 120Hz agree after ${seconds}s of physical time`, () => {
    const options = { position: 2700, velocity: -120, target: 3600, seconds };
    const at60 = simulate({ ...options, hz: 60 });
    const at120 = simulate({ ...options, hz: 120 });
    near(at60.position, at120.position);
    near(at60.velocity, at120.velocity);
  });
}

test('spring: changing target does not reset the existing position or velocity', () => {
  const moving = simulate({ target: 900, seconds: 0.1 });
  assert.ok(moving.velocity > 0);
  const retargeted = advanceSpring(moving.position, moving.velocity, 1800, 0);
  near(retargeted.position, moving.position);
  near(retargeted.velocity, moving.velocity);
  const next = advanceSpring(moving.position, moving.velocity, 1800, 1 / 120);
  assert.ok(next.position > moving.position);
  assert.ok(next.position - moving.position < 100, 'retargeting jumped to an anchor or restarted position');
  assert.ok(next.position < 900, 'one frame jumped to the old destination');
});

test('spring: reversing a moving target remains continuous and then converges', () => {
  const moving = simulate({ target: 900, seconds: 0.1 });
  const next = advanceSpring(moving.position, moving.velocity, 0, 1 / 120);
  assert.ok(Math.abs(next.position - moving.position) < 100);
  const settled = simulate({ ...next, target: 0, seconds: 1 });
  near(settled.position, 0, 1e-5);
  near(settled.velocity, 0, 1e-3);
});

test('spring: target changes behave consistently at 60Hz and 120Hz', () => {
  const run = (hz) => {
    const first = simulate({ target: 900, seconds: 0.2, hz });
    return simulate({ ...first, target: 1800, seconds: 0.2, hz });
  };
  const at60 = run(60), at120 = run(120);
  near(at60.position, at120.position);
  near(at60.velocity, at120.velocity);
});

test('spring: a delayed frame is bounded rather than jumping to the destination', () => {
  const initial = { position: 2700, velocity: 300, target: 3600 };
  const ordinaryLimit = advanceSpring(initial.position, initial.velocity, initial.target, 0.05);
  const delayed = advanceSpring(initial.position, initial.velocity, initial.target, 5);
  near(delayed.position, ordinaryLimit.position);
  near(delayed.velocity, ordinaryLimit.velocity);
  assert.ok(delayed.position < initial.target - 100);
  assert.ok(Number.isFinite(delayed.position) && Number.isFinite(delayed.velocity));
});

test('spring: zero and negative elapsed time cannot move the page backwards in time', () => {
  for (const seconds of [0, -1]) {
    assert.deepEqual(advanceSpring(1234.5, 200, 6000, seconds), { position: 1234.5, velocity: 200 });
  }
});

test('stops: nearest lookup uses actual positions, including the short footer gap', () => {
  assert.equal(nearestStop(stops, 0), 0);
  assert.equal(nearestStop(stops, 860), 1);
  assert.equal(nearestStop(stops, 17110), 19);
  assert.equal(nearestStop(stops, 17390), 20);
});

test('stops: exact and out-of-range positions resolve to stable end stops', () => {
  assert.equal(nearestStop(stops, 5400), 6);
  assert.equal(nearestStop(stops, -200), 0);
  assert.equal(nearestStop(stops, 99999), 20);
});

test('stops: adjacency stays inside the first and final boundaries', () => {
  assert.equal(adjacentStop(stops, 0, -1), 0);
  assert.equal(adjacentStop(stops, 0, 1), 1);
  assert.equal(adjacentStop(stops, 20, 1), 20);
});

test('regression: an accepted small wheel operation advances even below the nearest-stop midpoint', () => {
  const wheel = createWheelGesture();
  const anchor = 5, start = stops[anchor];
  let offset = 0, destination = null;
  for (let frame = 0; frame < 4; frame++) {
    offset += 0.5;
    const intent = wheel.read({ deltaY: 0.5 }, frame * 12, 900);
    if (intent.direction) {
      destination = adjacentStop(stops, anchor, intent.direction);
      wheel.claim();
    }
  }
  const following = followPosition(stops, anchor, start, offset);
  assert.ok(following > start && following < start + 10);
  assert.equal(nearestStop(stops, following), anchor, 'the input remains below half a photograph');
  assert.equal(destination, anchor + 1, 'using nearestStop for an accepted release would reproduce the no-response bug');
});

test('stops: last photograph and footer are adjacent in both directions', () => {
  assert.equal(adjacentStop(stops, 19, 1), 20);
  assert.equal(adjacentStop(stops, 20, -1), 19, 'footer must return to photograph 20 rather than photograph 19');
});

test('follow: a large gesture is clamped to one neighbouring photograph', () => {
  const anchor = 7, start = stops[anchor];
  assert.equal(followPosition(stops, anchor, start, 100000), stops[anchor + 1]);
  assert.equal(followPosition(stops, anchor, start, -100000), stops[anchor - 1]);
});

test('follow: repeated input remains inside the original gesture range', () => {
  const anchor = 7, start = stops[anchor];
  let previous = start;
  for (let offset = 0; offset <= 10000; offset += 25) {
    const next = followPosition(stops, anchor, start, offset);
    assert.ok(next >= previous);
    assert.ok(next >= stops[anchor - 1] && next <= stops[anchor + 1]);
    previous = next;
  }
  assert.equal(previous, stops[anchor + 1]);
});

test('follow: reversing input can return to its visual origin without changing anchors', () => {
  const anchor = 7, start = stops[anchor];
  assert.equal(followPosition(stops, anchor, start, 400), start + 400);
  assert.equal(followPosition(stops, anchor, start, 80), start + 80);
  assert.equal(followPosition(stops, anchor, start, 0), start);
  assert.equal(followPosition(stops, anchor, start, -80), start - 80);
});

test('regression: a new gesture during settling begins at the rendered position', () => {
  const anchor = 7, rendered = stops[anchor] - 300;
  assert.equal(followPosition(stops, anchor, rendered, 0), rendered);
  assert.equal(followPosition(stops, anchor, rendered, 12), rendered + 12);
  assert.equal(followPosition(stops, anchor, rendered, -12), rendered - 12);
});

test('regression: an interrupted visual start outside the neighbouring range is not pulled to an anchor', () => {
  const anchor = 7;
  const before = stops[anchor - 1] - 200;
  const after = stops[anchor + 1] + 200;
  assert.equal(followPosition(stops, anchor, before, 0), before);
  assert.equal(followPosition(stops, anchor, before, 10), before + 10);
  assert.equal(followPosition(stops, anchor, after, 0), after);
  assert.equal(followPosition(stops, anchor, after, -10), after - 10);
});

test('follow: the first photograph and footer cannot overscroll the document', () => {
  assert.equal(followPosition(stops, 0, 0, -500), 0);
  assert.equal(followPosition(stops, 20, stops[20], 500), stops[20]);
});

test('follow: the short footer gap clamps at its own real positions', () => {
  assert.equal(followPosition(stops, 19, stops[19], 1000), stops[20]);
  assert.equal(followPosition(stops, 20, stops[20], -1000), stops[19]);
  assert.equal(followPosition(stops, 20, stops[20], -100), stops[20] - 100);
});

test('touch preview: vertical movement exposes a signed offset before release', () => {
  const touch = createTouchGesture();
  touch.start(point(100, 400));
  assert.equal(touch.move(point(101, 390)), undefined, 'the existing move API must remain non-committing');
  assert.deepEqual(touch.preview(point(102, 350)), { vertical: true, offset: 50 });
  assert.deepEqual(touch.preview(point(103, 300)), { vertical: true, offset: 100 });
  assert.equal(touch.end(point(103, 300)), 1);
  assert.equal(touch.end(point(103, 300)), 0);
});

test('touch preview: downward following exposes a negative offset', () => {
  const touch = createTouchGesture();
  touch.start(point(100, 200));
  assert.deepEqual(touch.preview(point(101, 270)), { vertical: true, offset: -70 });
  assert.equal(touch.end(point(101, 270)), -1);
});

test('touch preview: holding a partial swipe does not consume its single release', () => {
  const touch = createTouchGesture();
  touch.start(point(100, 300));
  for (let heldFrame = 0; heldFrame < 180; heldFrame++) {
    assert.deepEqual(touch.preview(point(100, 220)), { vertical: true, offset: 80 });
  }
  assert.equal(touch.end(point(100, 220)), 1);
  assert.equal(touch.preview(point(100, 220)), null);
  assert.equal(touch.end(point(100, 220)), 0);
});

test('touch preview: a tap remains distinguishable from a short vertical drag', () => {
  const touch = createTouchGesture();
  touch.start(point(100, 300));
  assert.deepEqual(touch.preview(point(101, 297)), { vertical: false, offset: 3 });
  assert.equal(touch.end(point(101, 297)), 0);
  touch.start(point(100, 300));
  assert.deepEqual(touch.preview(point(101, 280)), { vertical: true, offset: 20 });
  assert.equal(touch.end(point(101, 280)), 0, 'a short drag can follow visually without committing another photograph');
});

test('touch preview: horizontal movement never becomes a vertical follow', () => {
  const touch = createTouchGesture();
  touch.start(point(100, 300));
  assert.deepEqual(touch.preview(point(150, 296)), { vertical: false, offset: 4 });
  assert.deepEqual(touch.preview(point(120, 180)), { vertical: false, offset: 120 });
  assert.equal(touch.end(point(120, 180)), 0);
});

test('touch preview: ambiguous diagonal movement may resolve into a vertical follow', () => {
  const touch = createTouchGesture();
  touch.start(point(0, 0));
  assert.deepEqual(touch.preview(point(9, 8)), { vertical: false, offset: -8 });
  assert.deepEqual(touch.preview(point(10, -100)), { vertical: true, offset: 100 });
  assert.equal(touch.end(point(10, -100)), 1);
});

test('touch preview: a different finger cannot move or consume the tracked gesture', () => {
  const touch = createTouchGesture();
  touch.start(point(100, 300, 3));
  assert.equal(touch.preview(point(100, 100, 4)), null);
  assert.deepEqual(touch.preview(point(100, 200, 3)), { vertical: true, offset: 100 });
  assert.equal(touch.end(point(100, 200, 3)), 1);
});

test('touch preview: reset cancels both following and later release after a pinch or cancel', () => {
  const touch = createTouchGesture();
  touch.start(point(100, 300));
  assert.deepEqual(touch.preview(point(100, 200)), { vertical: true, offset: 100 });
  touch.reset();
  assert.equal(touch.preview(point(100, 100)), null);
  assert.equal(touch.end(point(100, 100)), 0);
  touch.start(point(100, 300));
  assert.equal(touch.end(point(100, 200)), 1);
});

test('touch preview and follow: a short visual drag can return without committing a page', () => {
  const touch = createTouchGesture();
  const anchor = 5, start = stops[anchor];
  touch.start(point(100, 300));
  const preview = touch.preview(point(100, 280));
  assert.equal(preview.vertical, true);
  assert.equal(followPosition(stops, anchor, start, preview.offset), start + 20);
  assert.equal(touch.end(point(100, 280)), 0);
  assert.equal(nearestStop(stops, start + preview.offset), anchor);
});

let failures = 0;
for (const { name, run } of cases) {
  try {
    run();
  } catch (error) {
    failures++;
    console.error(`FAIL ${name}\n${error.stack}`);
  }
}
if (failures) {
  console.error(`${failures}/${cases.length} scroll-motion checks failed.`);
  process.exitCode = 1;
} else {
  console.log(`${cases.length} scroll-motion checks pass: convergence, refresh-rate agreement, retargeting, delayed frames, one-photo bounds, interrupted starts, small wheel releases, footer stops and non-committing touch previews.`);
}
