import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

const source = stripTypeScriptTypes(
  readFileSync(new URL("../../web/scripts/project-story.ts", import.meta.url), "utf8")
    .replace("export const initializeProjectStories", "globalThis.initializeProjectStories"),
);

const createNote = ({ mobile = false, hash = "" } = {}) => {
  const frames = [];
  const viewport = Object.assign(new EventTarget(), {
    scrollTop: 0, clientHeight: 900, scrollHeight: 2400,
    getBoundingClientRect: () => ({ top: 54 }),
    scrollTo({ top }) { this.scrollTop = top; },
  });
  const sections = ["context", "practice"].map((key, index) => ({
    id: `project-demo-${key}`,
    dataset: { projectSection: key },
    getBoundingClientRect: () => ({ top: 54 + index * 1900 - viewport.scrollTop }),
    focus(options) { this.focusOptions = options; },
  }));
  const links = sections.map((section) => Object.assign(new EventTarget(), {
    hash: `#${section.id}`, dataset: { projectAnchor: section.dataset.projectSection },
    attributes: new Map(),
    setAttribute(key, value) { this.attributes.set(key, value); },
    removeAttribute(key) { this.attributes.delete(key); },
  }));
  const box = { getBoundingClientRect: () => ({ height: 54 }) };
  const page = { style: { setProperty() {} }, querySelector: () => box };
  const story = {
    closest: (selector) => selector === ".project-page" ? page : viewport,
    querySelector: () => box,
    querySelectorAll: (selector) => selector === "[data-project-anchor]" ? links : sections,
  };
  const preference = Object.assign(new EventTarget(), { matches: mobile });
  const window = Object.assign(new EventTarget(), {
    location: { hash }, scrollY: 0, innerHeight: 900,
    matchMedia: () => preference,
    requestAnimationFrame(callback) { frames.push(callback); return frames.length; },
    history: { pushState(_state, _title, nextHash) { window.location.hash = nextHash; } },
  });
  const scope = {
    window,
    document: { querySelectorAll: () => [story], documentElement: { scrollHeight: 2400 } },
    getComputedStyle: () => ({ scrollMarginTop: "40px" }),
    ResizeObserver: class { observe() {} },
  };
  runInNewContext(source, scope);
  scope.initializeProjectStories();
  return {
    links, sections, viewport, window,
    flush() { const pending = frames.splice(0); pending.forEach((callback) => callback()); },
  };
};

const click = (link, modifiers = {}) => {
  const event = Object.assign(new Event("click", { cancelable: true }), { button: 0, ...modifiers });
  link.dispatchEvent(event);
  return event;
};

test("last-section navigation moves only the desktop reading viewport and clamps at its end", () => {
  const note = createNote();
  assert.equal(click(note.links[1]).defaultPrevented, true);
  assert.equal(note.viewport.scrollTop, 1500);
  assert.equal(note.window.scrollY, 0);
  assert.equal(note.sections[1].focusOptions.preventScroll, true);
  assert.equal(note.window.location.hash, "#project-demo-practice");
  note.flush();
  assert.equal(note.links[1].attributes.get("aria-current"), "location");
  click(note.links[0]);
  assert.equal(note.viewport.scrollTop, 0);
});

test("desktop deep links and history navigation restore the reading viewport", () => {
  const note = createNote({ hash: "#project-demo-practice" });
  assert.equal(note.viewport.scrollTop, 1500);
  note.window.location.hash = "#project-demo-context";
  note.window.dispatchEvent(new Event("popstate"));
  assert.equal(note.viewport.scrollTop, 0);
});

test("mobile and modified clicks preserve native anchor behavior", () => {
  const mobile = createNote({ mobile: true });
  assert.equal(click(mobile.links[1]).defaultPrevented, false);
  assert.equal(mobile.viewport.scrollTop, 0);
  assert.equal(mobile.viewport.tabIndex, -1);
  const desktop = createNote();
  assert.equal(click(desktop.links[1], { ctrlKey: true }).defaultPrevented, false);
  assert.equal(desktop.viewport.scrollTop, 0);
});
