import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { createSociety } from "../../web/scripts/society/engine.ts";
import { migrateStorageValue, storageKey } from "../../web/scripts/storage.ts";

const source = stripTypeScriptTypes(readFileSync(new URL("../../web/scripts/society/index.ts", import.meta.url), "utf8")
  .replace(/^import .*;\n/gm, "").replace("export const initializeSociety", "globalThis.initializeSociety"));
const createScene = ({ dismissed = false, legacyDismissed = false, reduced = false, obstacles = [], model = createSociety } = {}) => {
  const frames = new Map(), timers = new Map(), values = new Map(), fills = [], drawing = [];
  if (dismissed) values.set(storageKey("asterisks"), "1");
  if (legacyDismissed) values.set(storageKey("society-dismissed"), "1");
  let nextID = 0, now = 0, layer, balloon;
  const makeNode = () => ({
    setAttribute() {}, classList: { add() {}, remove() {} }, style: { setProperty() {} },
    offsetWidth: 100, offsetHeight: 35, dataset: {},
    append(...children) { balloon = children.find((node) => node.className.includes("society__speech")); },
    remove() { layer = undefined; },
  });
  const context = new Proxy({ globalCompositeOperation: "source-over" }, {
    get(state, key) {
      if (key === "createRadialGradient" || key === "createLinearGradient") {
        return () => ({ addColorStop() {} });
      }
      if (key === "fillRect") return (...args) => {
        drawing.push(state.globalCompositeOperation === "destination-in" ? "fade" : "halo");
        if (state.globalCompositeOperation === "source-over") fills.push(args);
      };
      if (key === "fillText") return () => drawing.push(state.globalCompositeOperation);
      return state[key] ?? (() => {});
    },
  });
  const canvas = { ...makeNode(), getContext: () => context };
  const grid = {
    getBoundingClientRect: () => ({ left: 40, top: 105, right: 540, bottom: 500 }),
    closest: () => ({ getBoundingClientRect: () => ({ left: 40, top: 125, right: 520, bottom: 500 }) }),
    querySelectorAll: () => obstacles.map(({ x, y, width, height }) => ({
      closest: () => null,
      matches: () => false,
      getBoundingClientRect: () => ({ left: x + 40, top: y + 125,
        right: x + width + 40, bottom: y + height + 125, width, height }),
    })),
  };
  const document = Object.assign(new EventTarget(), {
    documentElement: { dataset: { theme: "dark" } },
    createElement: (tag) => tag === "canvas" ? canvas : makeNode(),
    querySelector: () => grid, hidden: false,
    body: { append(node) { layer = node; } },
  });
  const window = Object.assign(new EventTarget(), {
    setTimeout(callback, delay) {
      const id = ++nextID;
      timers.set(id, { callback, deadline: now + delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
  });
  const preference = Object.assign(new EventTarget(), { matches: reduced });
  const observer = class { observe() {} disconnect() {} };
  const scope = {
    createSociety: model, migrateStorageValue, storageKey, document, window, AbortController,
    innerWidth: 900, innerHeight: 600, devicePixelRatio: 1,
    matchMedia: () => preference, ResizeObserver: observer, MutationObserver: observer,
    getComputedStyle: () => ({ getPropertyValue: (key) => key === "--font-mono" ? "monospace" : "#eeeeee" }),
    sessionStorage: { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) },
    requestAnimationFrame(callback) { const id = ++nextID; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
  };
  runInNewContext(source, scope);
  const stop = scope.initializeSociety();
  return {
    document, window, canvas, values, fills, drawing, preference, stop,
    attached: () => Boolean(layer),
    balloon: () => balloon,
    layerStyle: () => layer?.style,
    frameAt(time) {
      now = time;
      for (const [id, { callback, deadline }] of timers) {
        if (time < deadline) continue;
        timers.delete(id);
        callback();
      }
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback(time);
    },
  };
};
const pointer = (x, movementX = 0) => Object.assign(new Event("pointermove"), { clientX: x, clientY: 100, movementX, movementY: 0, pointerType: "mouse" });
const startsAt = 8000;

test("society waits for the first view and clips to the visible document grid", () => {
  const scene = createScene();
  scene.frameAt(startsAt - 1);
  assert.equal(scene.attached(), false);
  for (let time = startsAt; time < startsAt + 6000; time += 16) scene.frameAt(time);
  assert.equal(scene.attached(), true);
  assert.equal(scene.layerStyle().left, "40px");
  assert.equal(scene.layerStyle().top, "125px");
  assert.equal(scene.canvas.width, 480);
  assert.equal(scene.canvas.height, 375);
  assert.ok(scene.fills.length > 0);
  assert.ok(scene.fills.every(([, , width, height]) => width < 150 && height < 150));
  const firstFade = scene.drawing.indexOf("fade");
  assert.ok(firstFade > 0);
  assert.deepEqual(scene.drawing.slice(firstFade, firstFade + 3), ["fade", "fade", "source-over"]);
});

test("the speaker can use a lateral position when the vertical positions are blocked", () => {
  const speech = { id: 1, text: "oru?", shown: false };
  const speaker = { id: 1, x: 130, y: 150, opacity: 1, curiosity: 0, size: 18, color: 0 };
  const shown = [];
  const model = () => ({ entities: [speaker], speech, step() {}, remap() {},
    markSpeechShown(line) { shown.push(line); line.shown = true; } });
  const scene = createScene({ model, obstacles: [
    { x: 55, y: 90, width: 88, height: 46 },
    { x: 55, y: 160, width: 88, height: 57 },
  ] });
  scene.frameAt(startsAt);
  assert.equal(scene.balloon().hidden, false);
  assert.equal(scene.balloon().dataset.placement, "right");
  assert.deepEqual(shown, [speech]);

  speech.shown = false;
  const blocked = createScene({ model, obstacles: [{ x: 0, y: 0, width: 480, height: 375 }] });
  blocked.frameAt(startsAt);
  assert.equal(blocked.balloon().hidden, true);
  assert.equal(shown.length, 1);
});

test("mouse movement preserves the scene, while deliberate input dismisses it for the session", () => {
  const scene = createScene();
  scene.frameAt(startsAt);
  scene.document.dispatchEvent(pointer(100));
  scene.document.dispatchEvent(pointer(110, 10));
  assert.equal(scene.values.has(storageKey("asterisks")), false);
  scene.document.dispatchEvent(new Event("wheel"));
  assert.equal(scene.values.get(storageKey("asterisks")), "1");
  for (let time = startsAt + 16; time < startsAt + 1050; time += 16) scene.frameAt(time);
  assert.equal(scene.attached(), false);
  assert.equal(createScene({ dismissed: true }).attached(), false);
  const clicking = createScene();
  const click = new Event("pointerdown", { cancelable: true });
  clicking.document.dispatchEvent(click);
  assert.equal(click.defaultPrevented, false);
  assert.equal(clicking.values.get(storageKey("asterisks")), "1");
  clicking.frameAt(startsAt + 1000);
  assert.equal(clicking.attached(), false);
});

test("an existing dismissal migrates to the asterisks key for the same tab", () => {
  const scene = createScene({ legacyDismissed: true });
  scene.frameAt(startsAt);
  assert.equal(scene.attached(), false);
  assert.equal(scene.values.get(storageKey("asterisks")), "1");
  assert.equal(scene.values.has(storageKey("society-dismissed")), false);
});

test("layout updates and restored scroll do not prematurely dismiss society", () => {
  const scene = createScene();
  scene.frameAt(startsAt);
  scene.window.dispatchEvent(new Event("resize"));
  scene.document.dispatchEvent(new Event("scroll"));
  scene.frameAt(startsAt + 16);
  assert.equal(scene.attached(), true);
  assert.equal(scene.values.has(storageKey("asterisks")), false);
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
  scene.frameAt(startsAt);
  assert.equal(scene.attached(), true);
  scene.preference.matches = true;
  scene.preference.dispatchEvent(new Event("change"));
  assert.equal(scene.attached(), false);
});

test("leaving Cases stops society immediately without marking it dismissed", () => {
  const scene = createScene();
  scene.frameAt(startsAt);
  const fills = scene.fills.length;
  scene.stop();
  scene.frameAt(startsAt + 16);
  scene.document.dispatchEvent(new Event("pointerdown"));
  assert.equal(scene.attached(), false);
  assert.equal(scene.fills.length, fills);
  assert.equal(scene.values.has(storageKey("asterisks")), false);
});
