import assert from 'node:assert/strict';
import { createWheelGesture, createTouchGesture } from '../page-gestures.js';

// Exercise operation streams rather than browser event delivery or animation internals.
// A caller claims a wheel burst only after it actually accepts a page request.
const cases = [];
const test = (name, run) => cases.push({ name, run });
const vertical = (deltaY, extra = {}) => ({ deltaY, ...extra });
const point = (x, y, id = 7) => ({ x, y, id });
const noIntent = { direction: 0, consume: false };

function wheelSession(options) {
  const gesture = createWheelGesture(options);
  const requests = [];
  return {
    gesture,
    requests,
    input(input, time, { accept = true, height = 800 } = {}) {
      const intent = gesture.read(input, time, height);
      const accepted = Boolean(intent.direction && accept);
      if (accepted) {
        requests.push(intent.direction);
        gesture.claim();
      }
      return { ...intent, prevented: intent.consume || accepted };
    },
  };
}

test('wheel: a small pixel operation accumulates and advances once', () => {
  const session = wheelSession();
  for (let index = 0; index < 12; index++) {
    session.input(vertical(0.5), index * 12);
  }
  assert.deepEqual(session.requests, [1]);
});

test('wheel: negative small pixel input accumulates in the reverse direction', () => {
  const session = wheelSession();
  for (let index = 0; index < 10; index++) session.input(vertical(-0.25), index * 10);
  assert.deepEqual(session.requests, [-1]);
});

for (const [label, deltaY, deltaMode, direction] of [
  ['line down', 1, 1, 1],
  ['line up', -1, 1, -1],
  ['page down', 1, 2, 1],
  ['page up', -1, 2, -1],
]) {
  test(`wheel: ${label} is one operation, independent of its distance`, () => {
    const session = wheelSession();
    session.input(vertical(deltaY, { deltaMode }), 0, { height: 1200 });
    session.input(vertical(deltaY, { deltaMode }), 20, { height: 1200 });
    assert.deepEqual(session.requests, [direction]);
  });
}

test('wheel: sub-line deltas are normalized before the intent threshold', () => {
  const session = wheelSession();
  session.input(vertical(0.125, { deltaMode: 1 }), 0);
  assert.deepEqual(session.requests, [1]);
});

test('wheel: a very large delta cannot skip several photographs', () => {
  const session = wheelSession();
  session.input(vertical(5000), 0);
  session.input(vertical(1200), 15);
  assert.deepEqual(session.requests, [1]);
});

test('wheel: a long, decaying momentum tail remains owned until it is quiet', () => {
  const session = wheelSession();
  session.input(vertical(120), 0);
  for (let time = 40; time <= 2400; time += 40) {
    const intent = session.input(vertical(Math.max(0.01, 8 * Math.exp(-time / 250))), time);
    assert.equal(intent.consume, true, `tail at ${time}ms escaped its operation`);
    assert.equal(intent.prevented, true);
  }
  assert.deepEqual(session.requests, [1]);
  session.input(vertical(12), 2600);
  assert.deepEqual(session.requests, [1, 1]);
});

test('wheel: a fresh operation resumes at the quiet boundary', () => {
  const session = wheelSession();
  session.input(vertical(20), 0);
  assert.equal(session.input(vertical(0.1), 199).consume, true);
  session.input(vertical(20), 399);
  assert.deepEqual(session.requests, [1, 1]);
});

test('regression: a fresh operation does not wait for an animation cooldown', () => {
  const session = wheelSession();
  session.input(vertical(12), 0);
  // The preceding page animation may still run at 250ms; this is a new input burst.
  session.input(vertical(12), 250);
  session.input(vertical(12), 500);
  assert.deepEqual(session.requests, [1, 1, 1]);
});

test('wheel: a deliberate immediate reversal starts one reverse operation', () => {
  const session = wheelSession();
  session.input(vertical(100), 0);
  session.input(vertical(-12), 30);
  session.input(vertical(-3), 60);
  assert.deepEqual(session.requests, [1, -1]);
});

test('regression: small reverse inputs accumulate without waiting for quiet', () => {
  for (const direction of [1, -1]) {
    const session = wheelSession();
    session.input(vertical(direction * 100), 0);
    assert.equal(session.input(vertical(-direction), 30).consume, true);
    assert.deepEqual(session.requests, [direction]);
    session.input(vertical(-direction), 60);
    assert.deepEqual(session.requests, [direction, -direction]);
    assert.equal(session.input(vertical(-direction * 0.2), 90).consume, true);
    assert.deepEqual(session.requests, [direction, -direction]);
  }
});

test('wheel: tiny reverse jitter does not create another operation', () => {
  const session = wheelSession();
  session.input(vertical(100), 0);
  assert.equal(session.input(vertical(-0.2), 30).consume, true);
  assert.equal(session.input(vertical(0.4), 60).consume, true);
  assert.deepEqual(session.requests, [1]);
});

test('regression: a horizontal interruption cannot reopen an owned vertical burst', () => {
  const session = wheelSession();
  session.input(vertical(100), 0);
  const horizontal = session.input({ deltaX: 3, deltaY: 1 }, 30);
  assert.equal(horizontal.prevented, false, 'horizontal input must remain native');
  const tail = session.input(vertical(3), 60);
  assert.equal(tail.consume, true);
  assert.deepEqual(session.requests, [1]);
});

test('regression: a zero-delta event cannot reopen the remaining momentum tail', () => {
  const session = wheelSession();
  session.input(vertical(100), 0);
  assert.equal(session.input(vertical(0), 190).prevented, false);
  assert.equal(session.input(vertical(3), 360).consume, true);
  assert.deepEqual(session.requests, [1]);
});

test('wheel: horizontal input after a quiet interval does not lock the next operation', () => {
  const session = wheelSession();
  session.input(vertical(100), 0);
  session.input({ deltaX: 8, deltaY: 1 }, 250);
  session.input(vertical(3), 260);
  assert.deepEqual(session.requests, [1, 1]);
});

for (const input of [
  { deltaX: 20, deltaY: 0 },
  { deltaX: 20, deltaY: 10 },
  { deltaX: -10, deltaY: 10 },
]) {
  test(`wheel: horizontal or equal-axis input passes through (${JSON.stringify(input)})`, () => {
    assert.deepEqual(createWheelGesture().read(input, 0, 800), noIntent);
  });
}

for (const modifier of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey']) {
  test(`wheel: ${modifier} passes through and clears previous ownership`, () => {
    const session = wheelSession();
    session.input(vertical(20), 0);
    assert.equal(session.input(vertical(20, { [modifier]: true }), 20).prevented, false);
    session.input(vertical(20), 40);
    assert.deepEqual(session.requests, [1, 1]);
  });
}

for (const axis of ['deltaX', 'deltaY']) {
  for (const value of [NaN, Infinity, -Infinity]) {
    test(`wheel: non-finite ${axis} (${String(value)}) cannot poison a later operation`, () => {
      const session = wheelSession();
      session.input(vertical(20), 0);
      assert.equal(session.input({ deltaX: 0, deltaY: 20, [axis]: value }, 20).prevented, false);
      session.input(vertical(20), 40);
      assert.deepEqual(session.requests, [1, 1]);
    });
  }
}

test('wheel: reset clears an owned burst immediately', () => {
  const session = wheelSession();
  session.input(vertical(20), 0);
  session.gesture.reset();
  session.input(vertical(20), 1);
  assert.deepEqual(session.requests, [1, 1]);
});

test('wheel: reset discards an unfinished small operation', () => {
  const session = wheelSession();
  session.input(vertical(1), 0);
  session.gesture.reset();
  session.input(vertical(1), 10);
  assert.deepEqual(session.requests, []);
  session.input(vertical(1), 20);
  assert.deepEqual(session.requests, [1]);
});

test('wheel: an unaccepted boundary request is not claimed on the caller\'s behalf', () => {
  const session = wheelSession();
  assert.equal(session.input(vertical(20), 0, { accept: false }).prevented, false);
  assert.equal(session.input(vertical(20), 30, { accept: false }).prevented, false);
  assert.deepEqual(session.requests, []);
  session.input(vertical(-20), 40);
  assert.deepEqual(session.requests, [-1]);
});

test('touch: an upward swipe produces one next-page request on release', () => {
  const gesture = createTouchGesture();
  gesture.start(point(100, 400));
  gesture.move(point(102, 300));
  assert.equal(gesture.end(point(103, 250)), 1);
  assert.equal(gesture.end(point(103, 250)), 0, 'the same release cannot run twice');
});

test('touch: a downward swipe produces one previous-page request', () => {
  const gesture = createTouchGesture();
  gesture.start(point(100, 100));
  assert.equal(gesture.end(point(105, 200)), -1);
});

test('touch: movement does not emit a page before the finger is released', () => {
  const gesture = createTouchGesture();
  gesture.start(point(100, 400));
  for (const y of [390, 350, 250, 100]) {
    assert.equal(gesture.move(point(100, y)), undefined);
  }
  assert.equal(gesture.end(point(100, 100)), 1);
});

test('touch: a fast swipe still works when no intermediate move was delivered', () => {
  const gesture = createTouchGesture();
  gesture.start(point(100, 400));
  assert.equal(gesture.end(point(101, 250)), 1);
});

for (const [label, end] of [
  ['stationary tap', point(100, 200)],
  ['small tap drift', point(102, 196)],
  ['short vertical movement', point(102, 170)],
]) {
  test(`touch: ${label} leaves taps and controls available`, () => {
    const gesture = createTouchGesture();
    gesture.start(point(100, 200));
    assert.equal(gesture.end(end), 0);
  });
}

test('touch: a horizontal swipe does not navigate', () => {
  const gesture = createTouchGesture();
  gesture.start(point(100, 200));
  gesture.move(point(140, 204));
  assert.equal(gesture.end(point(260, 210)), 0);
});

test('touch: a diagonal gesture without a clear vertical axis does not navigate', () => {
  const gesture = createTouchGesture();
  gesture.start(point(100, 200));
  gesture.move(point(120, 180));
  assert.equal(gesture.end(point(200, 100)), 0);
});

test('touch: a clearly vertical diagonal swipe is accepted', () => {
  const gesture = createTouchGesture();
  gesture.start(point(100, 300));
  gesture.move(point(105, 280));
  assert.equal(gesture.end(point(115, 200)), 1);
});

test('touch: an established horizontal axis cannot turn into page navigation', () => {
  const gesture = createTouchGesture();
  gesture.start(point(100, 300));
  gesture.move(point(125, 298));
  assert.equal(gesture.end(point(105, 100)), 0);
});

test('touch: small initial drift does not prematurely lock the axis', () => {
  const gesture = createTouchGesture();
  gesture.start(point(100, 300));
  gesture.move(point(106, 297));
  assert.equal(gesture.end(point(107, 200)), 1);
});

test('regression: ambiguous diagonal movement can resolve into a vertical swipe', () => {
  for (const direction of [1, -1]) {
    const gesture = createTouchGesture();
    gesture.start(point(0, 0));
    gesture.move(point(direction * 9, direction * 8));
    assert.equal(gesture.end(point(direction * 10, -direction * 100)), direction);
  }
});

test('touch: a different finger cannot finish the tracked swipe', () => {
  const gesture = createTouchGesture();
  gesture.start(point(100, 300, 7));
  gesture.move(point(100, 250, 7));
  assert.equal(gesture.end(point(100, 150, 8)), 0);
  assert.equal(gesture.end(point(100, 150, 7)), 0, 'mismatched release must clear the old operation');
});

test('touch: movement from another finger cannot change the tracked axis', () => {
  const gesture = createTouchGesture();
  gesture.start(point(100, 300, 7));
  gesture.move(point(250, 300, 8));
  assert.equal(gesture.end(point(100, 150, 7)), 1);
});

test('touch: cancel/reset discards an otherwise valid swipe', () => {
  const gesture = createTouchGesture();
  gesture.start(point(100, 300));
  gesture.move(point(100, 150));
  gesture.reset();
  assert.equal(gesture.end(point(100, 100)), 0);
});

test('touch: pinch-equivalent reset prevents a remaining finger from changing photographs', () => {
  const gesture = createTouchGesture();
  gesture.start(point(100, 300));
  gesture.move(point(100, 250));
  gesture.reset(); // The event layer calls reset when a second finger joins.
  gesture.move(point(100, 150));
  assert.equal(gesture.end(point(100, 100)), 0);
  gesture.start(point(100, 300));
  assert.equal(gesture.end(point(100, 150)), 1, 'a later independent swipe must remain usable');
});

test('regression: consecutive independent swipes never wait for a wheel-style cooldown', () => {
  const gesture = createTouchGesture();
  const requests = [];
  for (let index = 0; index < 8; index++) {
    gesture.start(point(100, 300, index));
    requests.push(gesture.end(point(100, index % 2 ? 400 : 200, index)));
  }
  assert.deepEqual(requests, [1, -1, 1, -1, 1, -1, 1, -1]);
});

test('touch: returning close to the starting point cancels the page intent', () => {
  const gesture = createTouchGesture();
  gesture.start(point(100, 300));
  gesture.move(point(100, 100));
  assert.equal(gesture.end(point(100, 285)), 0);
});

test('touch: a new start replaces an abandoned gesture', () => {
  const gesture = createTouchGesture();
  gesture.start(point(100, 300, 7));
  gesture.move(point(180, 300, 7));
  gesture.start(point(100, 400, 9));
  assert.equal(gesture.end(point(100, 250, 9)), 1);
});

test('touch: move/end without a start cannot request a page', () => {
  const gesture = createTouchGesture();
  gesture.move(point(100, 100));
  assert.equal(gesture.end(point(100, 100)), 0);
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
  console.error(`${failures}/${cases.length} page-gesture checks failed.`);
  process.exitCode = 1;
} else {
  console.log(`${cases.length} page-gesture checks pass: wheel units, small inputs, momentum, interruption, restart, direction changes, modifiers, invalid deltas, reset and complete touch gestures.`);
}
