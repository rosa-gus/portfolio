import assert from "node:assert/strict";
import test from "node:test";
import { fitMediaSize, dismissWindowHelp } from "../../web/scripts/window-layout.ts";

test("landscape and square content fit available space without distortion", () => {
  assert.deepEqual(fitMediaSize(800, 500, 16 / 9), { width: 800, height: 450 });
  assert.deepEqual(fitMediaSize(800, 225, 16 / 9), { width: 400, height: 225 });
  assert.deepEqual(fitMediaSize(360, 220, 1), { width: 220, height: 220 });
  assert.deepEqual(fitMediaSize(300, 600, 1), { width: 300, height: 300 });
});

test("unavailable body space never produces negative or non-finite sizes", () => {
  for (const [w, h, ratio] of [[0, 200, 1], [200, -1, 1], [Infinity, 200, 1], [100, 100, NaN], [100, 100, 0]]) {
    assert.deepEqual(fitMediaSize(w, h, ratio), { width: 0, height: 0 });
  }
});

test("Escape dismisses help and restores its toggle before closing the window", () => {
  const panel = { hidden: false };
  const attributes = new Map();
  let focused = false;
  const toggle = { setAttribute: (key, value) => attributes.set(key, value), focus: () => { focused = true; } };
  // Hidden root skips media measurement in this isolated interaction check.
  const root = { hidden: true, querySelector: selector => selector === "[data-window-help]" ? panel : toggle };
  assert.equal(dismissWindowHelp(root), true);
  assert.equal(panel.hidden, true);
  assert.equal(attributes.get("aria-expanded"), "false");
  assert.equal(focused, true);
  assert.equal(dismissWindowHelp(root), false);
});
