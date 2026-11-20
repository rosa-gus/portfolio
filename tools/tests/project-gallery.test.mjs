import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

const source = stripTypeScriptTypes(
  readFileSync(new URL("../../web/scripts/project-gallery.ts", import.meta.url), "utf8")
    .replace(/^import .*;\n/gm, "")
    .replace(/export const (initializeProject\w+)/g, "globalThis.$1"),
);

const createGallery = (count = 3) => {
  class Element extends EventTarget {
    constructor(values = {}) {
      super();
      Object.assign(this, { textContent: "", hidden: false, disabled: false, attributes: new Map(), children: new Map() }, values);
      this.style = { setProperty: (key, value) => this.attributes.set(key, value), removeProperty: (key) => this.attributes.delete(key) };
    }
    querySelector(selector) { return this.children.get(selector) ?? null; }
    setAttribute(key, value) { this.attributes.set(key, value); }
    removeAttribute(key) { this.attributes.delete(key); if (key === "src") this.src = ""; }
    focus(options) { this.focusOptions = options; }
    scrollTo(options) { this.scrollTop = options.top; }
  }
  const viewer = new Element({ open: false });
  for (const name of ["image", "title", "counter", "description", "note", "prev", "next", "close"])
    viewer.children.set(`[data-project-image-viewer-${name}]`, new Element());
  viewer.children.set("[data-scroll-area-viewport]", new Element());
  viewer.showModal = () => { viewer.open = true; };
  viewer.close = () => { viewer.open = false; viewer.dispatchEvent(new Event("close")); };
  const gallery = new Element();
  for (const name of ["viewport", "counter", "expand", "prev", "next"])
    gallery.children.set(`[data-gallery-${name}]`, new Element());
  const slides = Array.from({ length: count }, (_, index) => {
    const slide = new Element();
    slide.children.set(".project-gallery__image", new Element({ src: `${index}.png`, alt: `Image ${index}` }));
    slide.children.set(".project-gallery__label", new Element({ textContent: `Title ${index}` }));
    slide.children.set(".project-gallery__description", new Element({ textContent: `Caption ${index}` }));
    if (index === 1) slide.children.set(".project-gallery__note", new Element({ textContent: "[NOTA] Demonstration data" }));
    return slide;
  });
  gallery.querySelectorAll = () => slides;
  let selected = 0;
  const listeners = new Map();
  const carousel = {
    selectedScrollSnap: () => selected,
    canScrollPrev: () => selected > 0,
    canScrollNext: () => selected < count - 1,
    on: (name, callback) => listeners.set(name, callback),
    scrollTo(index) { selected = index; listeners.get("select")?.(); },
    scrollPrev() { this.scrollTo(selected - 1); },
    scrollNext() { this.scrollTo(selected + 1); },
  };
  const trigger = gallery.querySelector("[data-gallery-expand]");
  const scope = {
    document: { activeElement: trigger, querySelector: () => viewer, querySelectorAll: () => [gallery] },
    window: { matchMedia: () => ({ matches: false }) },
    HTMLElement: Element,
    EmblaCarousel: () => carousel,
    getComputedStyle: () => ({ getPropertyValue: () => "#7e9331" }),
  };
  runInNewContext(source, scope);
  scope.initializeProjectImageViewer();
  scope.initializeProjectGalleries();
  trigger.dispatchEvent(new Event("click"));
  return {
    viewer, trigger, carousel,
    field: (name) => viewer.querySelector(`[data-project-image-viewer-${name}]`),
    key(key, modifiers = {}) {
      const event = Object.assign(new Event("keydown", { cancelable: true }), { key, ...modifiers });
      viewer.dispatchEvent(event);
      return event;
    },
  };
};

test("viewer navigation updates image metadata, notes, and the underlying carousel", () => {
  const scene = createGallery();
  assert.equal(scene.viewer.open, true);
  assert.equal(scene.viewer.attributes.get("--project-tone"), "#7e9331");
  assert.equal(scene.field("counter").textContent, "01 / 03");
  assert.equal(scene.field("prev").disabled, true);
  assert.equal(scene.field("note").hidden, true);
  assert.equal(scene.key("ArrowRight").defaultPrevented, true);
  assert.equal(scene.carousel.selectedScrollSnap(), 1);
  assert.equal(scene.field("image").src, "1.png");
  assert.equal(scene.field("image").alt, "Image 1");
  assert.equal(scene.field("title").textContent, "Title 1");
  assert.equal(scene.field("description").textContent, "Caption 1");
  assert.equal(scene.field("note").hidden, false);
  scene.field("next").dispatchEvent(new Event("click"));
  assert.equal(scene.field("counter").textContent, "03 / 03");
  assert.equal(scene.field("next").disabled, true);
  assert.equal(scene.field("note").hidden, true);
  scene.key("ArrowRight");
  assert.equal(scene.carousel.selectedScrollSnap(), 2);
  scene.key("ArrowLeft");
  assert.equal(scene.carousel.selectedScrollSnap(), 1);
  assert.equal(scene.key("ArrowLeft", { ctrlKey: true }).defaultPrevented, false);
  assert.equal(scene.carousel.selectedScrollSnap(), 1);
});

test("closing restores focus without scrolling and reopening uses the selected image", () => {
  const scene = createGallery();
  scene.key("ArrowRight");
  scene.field("close").dispatchEvent(new Event("click"));
  assert.equal(scene.viewer.open, false);
  assert.equal(scene.field("image").src, "");
  assert.equal(scene.trigger.focusOptions.preventScroll, true);
  scene.trigger.dispatchEvent(new Event("click"));
  assert.equal(scene.field("counter").textContent, "02 / 03");
  assert.equal(scene.field("image").src, "1.png");
});

test("a one-image viewer disables both directions", () => {
  const scene = createGallery(1);
  assert.equal(scene.field("prev").disabled, true);
  assert.equal(scene.field("next").disabled, true);
  scene.key("ArrowRight");
  scene.key("ArrowLeft");
  assert.equal(scene.field("counter").textContent, "01 / 01");
});
