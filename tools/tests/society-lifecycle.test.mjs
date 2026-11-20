import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { createSociety } from "../../web/scripts/society/engine.ts";
import { storageKey } from "../../web/scripts/storage.ts";

const source = stripTypeScriptTypes(readFileSync(new URL("../../web/scripts/society/index.ts", import.meta.url), "utf8")
  .replace(/^import .*;\n/gm, "").replace("export const initializeSociety", "globalThis.initializeSociety"));
const createScene = ({ dismissed = false, reduced = false } = {}) => {
  const frames = new Map(), values = new Map(), fills = [];
  if (dismissed) values.set(storageKey("society-dismissed"), "1");
  let nextID = 0, attached = false;
  const makeNode = () => ({
    setAttribute() {}, classList: { add() {} }, style: { setProperty() {} },
    offsetWidth: 100, offsetHeight: 35, dataset: {}, remove() { attached = false; },
  });
  const context = new Proxy({}, { get: (_, key) => key === "createRadialGradient"
    ? () => ({ addColorStop() {} }) : key === "fillRect" ? (...args) => fills.push(args) : () => {} });
  const canvas = { ...makeNode(), getContext: () => context };
  const document = Object.assign(new EventTarget(), {
    documentElement: { dataset: { theme: "dark" } },
    createElement: (tag) => tag === "canvas" ? canvas : makeNode(),
    querySelectorAll: () => [], hidden: false,
    body: { append() { attached = true; } },
  });
  const window = new EventTarget();
  const preference = Object.assign(new EventTarget(), { matches: reduced });
  const observer = class { observe() {} disconnect() {} };
  const scope = {
    createSociety, storageKey, document, window, AbortController,
    innerWidth: 900, innerHeight: 600, devicePixelRatio: 1,
    matchMedia: () => preference, ResizeObserver: observer, MutationObserver: observer,
    getComputedStyle: () => ({ getPropertyValue: (key) => key === "--font-mono" ? "monospace" : "#eeeeee" }),
    sessionStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) },
    requestAnimationFrame(callback) { const id = ++nextID; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
  };
  runInNewContext(source, scope);
  scope.initializeSociety();
  return {
    document, window, canvas, values, fills, preference,
    attached: () => attached,
    frameAt(time) { const pending = [...frames.values()]; frames.clear(); for (const callback of pending) callback(time); },
  };
};
const pointer = (x, movementX = 0) => Object.assign(new Event("pointermove"), { clientX: x, clientY: 100, movementX, movementY: 0, pointerType: "mouse" });

test("society has no fullscreen veil or automatic three-second ending", () => {
  const scene = createScene();
  for (let time = 0; time < 6000; time += 16) scene.frameAt(time);
  assert.equal(scene.attached(), true);
  assert.ok(scene.fills.length > 0);
  assert.ok(scene.fills.every(([, , width, height]) => width < 150 && height < 150));
});

test("mouse movement dismisses once per session without blocking input", () => {
  const scene = createScene();
  scene.frameAt(0);
  scene.document.dispatchEvent(pointer(100));
  assert.equal(scene.values.has(storageKey("society-dismissed")), false);
  scene.document.dispatchEvent(pointer(110, 10));
  assert.equal(scene.values.get(storageKey("society-dismissed")), "1");
  for (let time = 16; time < 1050; time += 16) scene.frameAt(time);
  assert.equal(scene.attached(), false);
  assert.equal(createScene({ dismissed: true }).attached(), false);
  const clicking = createScene();
  const click = new Event("pointerdown", { cancelable: true });
  clicking.document.dispatchEvent(click);
  assert.equal(click.defaultPrevented, false);
  assert.equal(clicking.values.get(storageKey("society-dismissed")), "1");
  clicking.window.dispatchEvent(new Event("pagehide"));
});

test("layout updates and restored scroll do not prematurely dismiss society", () => {
  const scene = createScene();
  scene.frameAt(0);
  scene.window.dispatchEvent(new Event("resize"));
  scene.document.dispatchEvent(new Event("scroll"));
  scene.frameAt(16);
  assert.equal(scene.attached(), true);
  assert.equal(scene.values.has(storageKey("society-dismissed")), false);
  scene.document.hidden = true;
  scene.document.dispatchEvent(new Event("visibilitychange"));
  scene.frameAt(10000);
  scene.document.hidden = false;
  scene.document.dispatchEvent(new Event("visibilitychange"));
  scene.frameAt(20000);
  assert.equal(scene.attached(), true);
  scene.window.dispatchEvent(new Event("pagehide"));
  assert.equal(scene.attached(), false);
});

test("reduced motion disables society and changes clean up an active scene", () => {
  assert.equal(createScene({ reduced: true }).attached(), false);
  const scene = createScene();
  scene.preference.matches = true;
  scene.preference.dispatchEvent(new Event("change"));
  assert.equal(scene.attached(), false);
});
