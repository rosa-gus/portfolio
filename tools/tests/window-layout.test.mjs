import assert from "node:assert/strict";
import test from "node:test";
import { fitMediaSize, dismissWindowHelp, toggleWindowPanel } from "../../web/scripts/window-layout.ts";
import { cancelWindowShake, shakeWindow } from "../../web/scripts/window-motion.ts";

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

test("window shakes replace earlier animations and honor reduced motion", () => {
  const previousWindow = globalThis.window;
  let reducedMotion = false;
  globalThis.window = { matchMedia: () => ({ matches: reducedMotion }) };
  const animations = [];
  const root = {
    localName: "dialog", open: true, classList: { contains: () => false },
    animate(frames, options) {
      const animation = new EventTarget();
      animation.cancel = () => { animation.cancelled = true; };
      animations.push({ animation, frames, options });
      return animation;
    },
  };
  try {
    shakeWindow(root);
    shakeWindow(root, { distance: 2, duration: 200 });
    const [first, second] = animations;
    assert.equal(first.animation.cancelled, true);
    assert.equal(second.frames[1].translate, "-2px 0.5px");
    assert.equal(second.options.duration, 200);
    first.animation.dispatchEvent(new Event("finish"));
    cancelWindowShake(root);
    assert.equal(second.animation.cancelled, true);
    reducedMotion = true;
    shakeWindow(root);
    assert.equal(animations.length, 2);
  } finally {
    globalThis.window = previousWindow;
  }
});

test("Escape dismisses help and restores its toggle before closing the window", () => {
  const panel = { hidden: false };
  const attributes = new Map();
  let focused = false;
  const toggle = { setAttribute: (key, value) => attributes.set(key, value), focus: () => { focused = true; } };
  // Hidden root skips media measurement in this isolated interaction check.
  const root = { hidden: true, querySelector: selector => ({ "[data-window-help]": panel, "[data-window-help-toggle]": toggle })[selector] ?? null };
  assert.equal(dismissWindowHelp(root), true);
  assert.equal(panel.hidden, true);
  assert.equal(attributes.get("aria-expanded"), "false");
  assert.equal(focused, true);
  assert.equal(dismissWindowHelp(root), false);
});

test("controls and tips exclude each other, pause on opening, and restore focus on Escape", () => {
  const help = { hidden: true };
  const tips = { hidden: true };
  const expanded = new Map();
  let focused = "";
  let pauses = 0;
  const toggle = name => ({ setAttribute: (_, value) => expanded.set(name, value), focus: () => { focused = name; } });
  const elements = { "[data-window-help]": help, "[data-window-tips]": tips,
    "[data-window-help-toggle]": toggle("help"), "[data-window-tips-toggle]": toggle("tips") };
  const root = { hidden: true, querySelector: selector => elements[selector] ?? null,
    dispatchEvent: event => { assert.equal(event.type, "window:help"); pauses++; } };
  toggleWindowPanel(root, "help");
  assert.equal(help.hidden, false);
  assert.equal(tips.hidden, true);
  toggleWindowPanel(root, "tips");
  assert.equal(help.hidden, true);
  assert.equal(tips.hidden, false);
  assert.equal(expanded.get("help"), "false");
  assert.equal(expanded.get("tips"), "true");
  assert.equal(pauses, 2);
  assert.equal(dismissWindowHelp(root), true);
  assert.equal(tips.hidden, true);
  assert.equal(focused, "tips");
  toggleWindowPanel(root, "tips");
  toggleWindowPanel(root, "tips");
  assert.equal(tips.hidden, true);
  assert.equal(pauses, 3, "closing a panel does not send another pause event");
});
