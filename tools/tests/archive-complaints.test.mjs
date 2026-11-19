import assert from "node:assert/strict";
import test from "node:test";
import { createComplaintPolicy } from "../../web/scripts/archive-complaints.ts";

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
  const policy = createComplaintPolicy(() => { throw new Error("Unexpected random draw"); });
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
