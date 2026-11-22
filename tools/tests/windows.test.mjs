import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = stripTypeScriptTypes(readFileSync(new URL("../../web/scripts/windows.ts", import.meta.url), "utf8")
  .replace(/^import .*;\n/gm, "").replace("export const initializeWindows", "globalThis.initializeWindows"));

const scene = () => {
  let focused = null, id = 0, beforeOpen = 0, opens = 0, closings = 0, help = false;
  const frames = new Map(), timers = new Map();
  class Element extends EventTarget {
    dataset = {}; style = {}; isConnected = true;
    classes = new Set(); captures = new Set();
    classList = { add: (...names) => names.forEach(n => this.classes.add(n)),
      remove: (...names) => names.forEach(n => this.classes.delete(n)), contains: n => this.classes.has(n) };
    constructor() {
      super();
      this.style.removeProperty = key => { delete this.style[key]; };
    }
    closest(selector) { return selector === "[data-window-trigger]" && this.dataset.windowTrigger ? this : null; }
    focus() { focused = this; }
    setAttribute() {} removeAttribute() {}
    hasPointerCapture(n) { return this.captures.has(n); }
    setPointerCapture(n) { this.captures.add(n); }
    releasePointerCapture(n) { this.captures.delete(n); }
  }
  const closeButton = new Element(), handle = new Element();
  class Dialog extends Element {
    id = "ski-game"; open = false; inert = false;
    offsetWidth = 300; offsetHeight = 240;
    dataset = { windowDecoration: "tab" };
    showModal() { this.open = true; }
    close() { this.open = false; this.dispatchEvent(new Event("close")); }
    querySelector(selector) { return selector === "[data-window-close]" ? closeButton : selector === "[data-window-handle]" ? handle : null; }
    getBoundingClientRect() { return { left: 100, top: 60, right: 400, bottom: 300 }; }
  }
  const dialog = new Dialog(), trigger = new Element();
  trigger.dataset.windowTrigger = dialog.id;
  dialog.addEventListener("popup:open", () => { opens++; });
  dialog.addEventListener("popup:closing", () => { closings++; });
  const document = Object.assign(new EventTarget(), { querySelectorAll: selector => selector === "dialog[data-window]" ? [dialog] : [] });
  const preference = Object.assign(new EventTarget(), { matches: false });
  const window = Object.assign(new EventTarget(), {
    innerWidth: 800, innerHeight: 600, matchMedia: () => preference,
    requestAnimationFrame: callback => { const n = ++id; frames.set(n, callback); return n; },
    cancelAnimationFrame: n => frames.delete(n),
    setTimeout: callback => { const n = ++id; timers.set(n, callback); return n; },
    clearTimeout: n => timers.delete(n),
  });
  const scope = { document, window, Event, Element,
    initializeWindowLayout() {}, fitWindowMedia() {},
    dismissWindowHelp() { if (!help) return false; help = false; return true; },
  };
  runInNewContext(source, scope);
  const controller = scope.initializeWindows({ beforeOpen: () => { beforeOpen++; } });
  const emit = (target, type, properties = {}) => {
    const event = new Event(type, { cancelable: true });
    for (const [key, value] of Object.entries(properties)) Object.defineProperty(event, key, { value });
    target.dispatchEvent(event);
    return event;
  };
  const flush = map => { for (const [n, callback] of [...map]) { map.delete(n); callback(); } };
  return { dialog, trigger, handle, closeButton, window, preference, controller, emit,
    open() { emit(document, "click", { target: trigger }); flush(frames); },
    finishClose() { flush(timers); flush(timers); },
    focused: () => focused, counts: () => ({ beforeOpen, opens, closings }),
    setHelp: value => { help = value; },
  };
};

test("shared modal lifecycle opens from its ID and restores trigger focus on close", () => {
  const s = scene(); s.open();
  assert.equal(s.dialog.open, true);
  assert.equal(s.focused(), s.closeButton);
  assert.deepEqual(s.counts(), { beforeOpen: 1, opens: 1, closings: 0 });
  s.emit(s.closeButton, "click");
  assert.equal(s.dialog.inert, true);
  assert.equal(s.dialog.open, true);
  s.finishClose();
  assert.equal(s.dialog.open, false);
  assert.equal(s.dialog.inert, false);
  assert.equal(s.focused(), s.trigger);
  assert.equal(s.counts().closings, 1);
});

test("Escape dismisses help first; reduced motion closes without animation timers", () => {
  const s = scene(); s.open(); s.setHelp(true);
  assert.equal(s.emit(s.dialog, "cancel").defaultPrevented, true);
  assert.equal(s.dialog.open, true);
  assert.equal(s.counts().closings, 0);
  s.preference.matches = true;
  s.emit(s.dialog, "cancel");
  assert.equal(s.dialog.open, false);
  assert.equal(s.focused(), s.trigger);
});

test("dragging clamps the tab and shadow inside the viewport; closing releases capture", () => {
  const s = scene(); s.open();
  s.emit(s.handle, "pointerdown", { target: s.handle, isPrimary: true, button: 0,
    pointerId: 7, clientX: 120, clientY: 80 });
  s.emit(s.window, "pointermove", { pointerId: 7, clientX: -500, clientY: -500 });
  assert.equal(s.dialog.style.left, "16px");
  assert.equal(s.dialog.style.top, "40px");
  assert.equal(s.handle.hasPointerCapture(7), true);
  s.controller.close(false, true);
  assert.equal(s.handle.hasPointerCapture(7), false);
  assert.equal(s.dialog.classList.contains("is-positioned"), false);
  assert.equal(s.dialog.style.left, undefined);
});
