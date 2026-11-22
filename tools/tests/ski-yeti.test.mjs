import assert from "node:assert/strict";
import test from "node:test";
import { drawYetiRun } from "../../web/scripts/games/ski/ski-yeti.ts";

const images = {
  "yeti-run-01": { width: 28, height: 32 },
  "yeti-run-02": { width: 28, height: 32 },
};

const drawFrame = (age, direction = 1) => {
  const calls = [];
  drawYetiRun({ drawImage: (...args) => calls.push(args) }, images, 100, 100, age, direction);
  return calls;
};

test("the yeti holds a long plant and varies when it starts the quick step", () => {
  assert.equal(drawFrame(0.20)[0][0], images["yeti-run-01"]);
  assert.equal(drawFrame(0.23)[0][0], images["yeti-run-02"]);
  assert.equal(drawFrame(1 / 3 + 0.18)[0][0], images["yeti-run-01"]);
  assert.equal(drawFrame(1 / 3 + 0.20)[0][0], images["yeti-run-02"]);
  assert.equal(drawFrame(2 / 3 + 0.01)[0][0], images["yeti-run-01"]);
});

test("the head catches up to the shoulders while the feet stay anchored", () => {
  // The unshifted sprite starts at (72, 36) at 2x scale for the chosen anchor.
  const offset = ([, sx, sy, , , dx, dy]) => [dx - 72 - sx * 2, dy - 36 - sy * 2];
  for (const direction of [-1, 1]) {
    const crouch = drawFrame(0.20, direction);
    const lunge = drawFrame(0.23, direction);
    const catchUp = drawFrame(0.275, direction);
    const settle = drawFrame(0.31, direction);
    for (const frame of [crouch, lunge, catchUp, settle]) assert.deepEqual(offset(frame[0]), [0, 0]);
    assert.deepEqual(offset(crouch[1]), [0, 2]);
    assert.deepEqual(offset(lunge[1]), [direction * 2, -2]);
    assert.deepEqual(offset(lunge.at(-1)), [0, 0]);
    assert.deepEqual(offset(catchUp.at(-1)), [direction * 2, -2]);
    assert.deepEqual(offset(settle[1]), [0, 0]);
    assert.deepEqual(offset(settle.at(-1)), [direction * 2, -2]);
  }
});
