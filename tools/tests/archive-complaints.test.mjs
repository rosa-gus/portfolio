import assert from "node:assert/strict";
import test from "node:test";
import { createComplaintPolicy, createComplaintTapGesture } from "../../web/scripts/archive-complaints.ts";

const pushThreeTimes = (policy, id, now) => {
  let complaint = null;
  for (let i = 0; i < 3; i++) complaint = policy.record([id], now) ?? complaint;
  return complaint;
};

test("a document complains only on its third distinct drag", () => {
  const policy = createComplaintPolicy(() => 0, false);
  for (let i = 0; i < 2; i++) assert.equal(policy.record([1, 1, 1], 0), null);
  assert.deepEqual(policy.record([1], 0), { id: 1, text: "me deixa em paz!" });
});

test("pushes are tracked independently for each document", () => {
  const policy = createComplaintPolicy(() => 0, false);
  for (let id = 0; id < 10; id++) assert.equal(policy.record([id], 0), null);
  for (let i = 0; i < 1; i++) assert.equal(policy.record([3], 0), null);
  assert.equal(policy.record([3], 0).id, 3);
});

test("multiple eligible documents show only one balloon and respect the global cooldown", () => {
  const policy = createComplaintPolicy(() => 0, false);
  for (let i = 0; i < 2; i++) assert.equal(policy.record([1, 2], 0), null);
  assert.equal(policy.record([1, 2], 0).id, 1);
  assert.equal(policy.record([2], 7_999), null);
  const next = policy.record([2], 8_000);
  assert.equal(next.id, 2);
  assert.notEqual(next.text, "me deixa em paz!");
});

test("the same document waits fifteen seconds and complains at most four times per visit", () => {
  const policy = createComplaintPolicy(() => 0, false);
  assert.ok(pushThreeTimes(policy, 1, 0));
  assert.equal(pushThreeTimes(policy, 1, 14_999), null);
  assert.ok(policy.record([1], 15_000));
  assert.equal(pushThreeTimes(policy, 1, 18_000), null);
});

test("there are at most eight complaints per visit, even after resetting the grid", () => {
  const policy = createComplaintPolicy(() => 0, false);
  for (let id = 0; id < 8; id++) {
    assert.ok(pushThreeTimes(policy, id, id * 30_000));
    policy.resetCounts();
  }
  assert.equal(pushThreeTimes(policy, 9, 300_000), null);
});

test("resetting the grid clears unfinished push counts", () => {
  const policy = createComplaintPolicy(() => 0, false);
  for (let i = 0; i < 2; i++) policy.record([1], 0);
  policy.resetCounts();
  assert.equal(policy.record([1], 0), null);
});

test("leaving carries the return-home effect without repeating consecutively", () => {
  const policy = createComplaintPolicy(() => 0.999, false);
  assert.deepEqual(pushThreeTimes(policy, 1, 0), { id: 1, text: "quer saber? vou embora!", effect: "return-home" });
  const next = pushThreeTimes(policy, 1, 15_000);
  assert.ok(next);
  assert.notEqual(next.effect, "return-home");
});

test("debug triggers returning home on the first push without any random draw", () => {
  const policy = createComplaintPolicy(() => { throw new Error("Unexpected random draw"); }, true);
  assert.equal(policy.record([], 0), null);
  assert.deepEqual(policy.record([1], 0), { id: 1, text: "quer saber? vou embora!", effect: "return-home" });
});

test("debug preserves reading time and permits another complaint after the balloon ends", () => {
  const policy = createComplaintPolicy(() => 0.999, true);
  assert.ok(policy.record([1], 0));
  assert.equal(policy.record([2], 4_499), null);
  assert.deepEqual(policy.record([2], 4_500), { id: 2, text: "quer saber? vou embora!", effect: "return-home" });
});

test("debug does not exhaust per-document or per-visit quotas", () => {
  const policy = createComplaintPolicy(() => 0.999, true);
  for (let i = 0; i < 20; i++) {
    assert.deepEqual(policy.record([1], i * 4_500), { id: 1, text: "quer saber? vou embora!", effect: "return-home" });
  }
});

test("a completed tap gesture complains immediately and introduces the knocking", () => {
  const policy = createComplaintPolicy(() => 0.999, false);
  assert.deepEqual(policy.record([1], 0, "tap"), { id: 1, text: "tá batendo por quê?" });
  assert.equal(policy.record([2], 7_999, "tap"), null);
  assert.equal(policy.record([1], 14_999, "tap"), null);
  const next = policy.record([1], 15_000, "tap");
  assert.ok(next);
  assert.notEqual(next.effect, "return-home");
  assert.equal(next.text, "tá batendo por quê?");
});

test("mobile complaints share desktop quotas and never try to move grid items home", () => {
  const policy = createComplaintPolicy(() => 0.999, false);
  for (let i = 0; i < 8; i++) {
    const complaint = policy.record([Math.floor(i / 4)], i * 15_000, "tap");
    assert.ok(complaint);
    assert.deepEqual(complaint, { id: Math.floor(i / 4), text: "tá batendo por quê?" });
  }
  assert.equal(policy.record([2], 150_000, "tap"), null);
  assert.equal(pushThreeTimes(policy, 3, 160_000), null);
});

const tap = (gesture, now, x = 20, y = 20) => {
  gesture.start(1, x, y, now);
  return gesture.end(1, x, y, now + 50);
};

test("five quick taps trigger exactly once per group", () => {
  const gesture = createComplaintTapGesture();
  for (let group = 0; group < 2; group++) {
    for (let i = 0; i < 5; i++) assert.equal(tap(gesture, group * 1_000 + i * 150), i === 4);
  }
});

test("pauses, long presses, scrolling movements and cancellations break the sequence", () => {
  for (const interrupt of [
    (gesture) => { tap(gesture, 1_000); },
    (gesture) => { gesture.start(1, 20, 20, 450); gesture.end(1, 20, 20, 800); },
    (gesture) => { gesture.start(1, 20, 20, 450); gesture.move(1, 20, 40); gesture.end(1, 20, 20, 500); },
    (gesture) => { gesture.start(1, 20, 20, 450); gesture.end(1, 40, 20, 500); },
    (gesture) => gesture.reset(),
  ]) {
    const gesture = createComplaintTapGesture();
    for (let i = 0; i < 3; i++) assert.equal(tap(gesture, i * 150), false);
    interrupt(gesture);
    assert.equal(tap(gesture, 1_200), false);
    assert.equal(tap(gesture, 1_350), false);
  }
});

test("another pointer cannot complete a tap", () => {
  const gesture = createComplaintTapGesture();
  gesture.start(1, 20, 20, 0);
  assert.equal(gesture.end(2, 20, 20, 50), false);
  gesture.reset();
  for (let i = 0; i < 4; i++) assert.equal(tap(gesture, i * 150), false);
});
