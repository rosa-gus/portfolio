import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canScrollInDirection,
  createWheelGesture,
  normalizeWheelDelta,
} from "../../web/scripts/panel-wheel.ts";

test("accumulates small deltas before switching sections", () => {
  const gesture = createWheelGesture();
  assert.equal(gesture.add(20, 0), 0);
  assert.equal(gesture.add(30, 16), 0);
  assert.equal(gesture.add(30, 32), 1);
});

test("a mouse wheel notch can switch a section in either direction", () => {
  const gesture = createWheelGesture();
  assert.equal(gesture.add(100, 0), 1);
  assert.equal(gesture.add(-100, 500), -1);
});

test("trackpad momentum cannot skip multiple sections", () => {
  const gesture = createWheelGesture();
  assert.equal(gesture.add(100, 0), 1);
  for (let time = 16; time < 2000; time += 16) {
    assert.equal(gesture.add(30, time), 0);
  }
  assert.equal(gesture.add(100, 2300), 1);
});

test("momentum cannot scroll the newly entered section", () => {
  const gesture = createWheelGesture();
  assert.equal(gesture.add(100, 0), 1);
  assert.equal(gesture.blocksScroll(16), true);
  gesture.add(30, 16, true);
  assert.equal(gesture.blocksScroll(32), true);
  assert.equal(gesture.blocksScroll(400), false);
  assert.equal(gesture.add(30, 400, true), 0);
  assert.equal(gesture.blocksScroll(416), false);
});

test("reversing direction resets accumulated distance", () => {
  const gesture = createWheelGesture();
  assert.equal(gesture.add(60, 0), 0);
  assert.equal(gesture.add(-30, 16), 0);
  assert.equal(gesture.add(-50, 32), -1);
});

test("internal scrolling requires a fresh gesture at the boundary", () => {
  const gesture = createWheelGesture();
  assert.equal(gesture.add(100, 0, true), 0);
  assert.equal(gesture.add(100, 16), 0);
  assert.equal(gesture.add(100, 32), 0);
  assert.equal(gesture.add(100, 400), 1);
});

test("a gesture started during a transition or in an overlay stays consumed", () => {
  const gesture = createWheelGesture();
  assert.equal(gesture.add(100, 0, true), 0);
  assert.equal(gesture.add(-100, 16), 0);
  assert.equal(gesture.add(-100, 400), -1);
});

test("separate gestures do not accumulate accidental small movements", () => {
  const gesture = createWheelGesture();
  assert.equal(gesture.add(50, 0), 0);
  assert.equal(gesture.add(50, 500), 0);
  gesture.reset();
  assert.equal(gesture.add(50, 510), 0);
});

test("normalizes pixel, line and page wheel units", () => {
  assert.equal(normalizeWheelDelta(10, 0, 800), 10);
  assert.equal(normalizeWheelDelta(-3, 1, 800), -48);
  assert.equal(normalizeWheelDelta(1, 2, 800), 800);
});

test("scroll limits preserve reading in both directions, including overscroll", () => {
  const metrics = { scrollTop: 0, scrollHeight: 1000, clientHeight: 500 };
  assert.equal(canScrollInDirection(metrics, 1), true);
  assert.equal(canScrollInDirection(metrics, -1), false);
  assert.equal(canScrollInDirection({ ...metrics, scrollTop: 250 }, -1), true);
  assert.equal(canScrollInDirection({ ...metrics, scrollTop: 500 }, 1), false);
  assert.equal(canScrollInDirection({ ...metrics, scrollTop: 501 }, 1), false);
  assert.equal(canScrollInDirection({ ...metrics, scrollHeight: 500 }, 1), false);
});
