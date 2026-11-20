import { storageKey } from "../storage";
import { createSociety, type Environment, type Surface } from "./engine";

// Identity is independent of temperament and affinity. Halos stay neutral.
const bodyPalettes = {
  dark: ["#d8ceb7", "#d1b0bc", "#acbfa8", "#a9bed0"],
  light: ["#796b50", "#8e6678", "#607b68", "#5f748d"],
};

export const initializeSociety = () => {
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  const dismissedKey = storageKey("society-dismissed");
  if (preference.matches) return;
  try {
    if (sessionStorage.getItem(dismissedKey) === "1") return;
  } catch {}
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return;
  canvas.className = "society";
  canvas.setAttribute("aria-hidden", "true");
  const balloon = document.createElement("div");
  balloon.className = "project-archive__complaint society__speech";
  balloon.setAttribute("aria-hidden", "true");
  balloon.hidden = true;
  // Shared map: measure visible rectangles on layout changes, never per frame.
  let surfaces: Surface[] = [];
  let width = 1,
    height = 1;
  let light = "",
    font = "";
  let bodyColors = bodyPalettes.light;
  let frame = 0;
  let lastFrame: number | null = null;
  let elapsed = 0;
  let dirty = false;
  let stopped = false;
  const measure = (): Environment => {
    width = Math.max(1, innerWidth);
    height = Math.max(1, innerHeight);
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const styles = getComputedStyle(document.documentElement);
    font = styles.getPropertyValue("--font-mono").trim();
    const dark = document.documentElement.dataset.theme === "dark";
    light = dark ? "#f3e2b8" : "#fffaf0";
    bodyColors = dark ? bodyPalettes.dark : bodyPalettes.light;
    surfaces = [];
    const shelterSelector =
      ".project-archive__item-icon, .project-archive__case-cover, .project-content__edition-mark, .article-page__heading";
    const nodes = document.querySelectorAll<HTMLElement>(
      `${shelterSelector}, .masthead, .command-bar, .project-archive__item-title, .project-archive__item-meta, h1, h2, h3, p, a, button, input, textarea, [role=tablist]`,
    );
    for (const [index, node] of Array.from(nodes).entries()) {
      if (node.closest("[hidden], [inert], dialog:not([open])")) continue;
      const raw = node.getBoundingClientRect();
      const clip = node
        .closest<HTMLElement>(
          ".scroll-area__viewport, .project-archive__case-carousel-viewport",
        )
        ?.getBoundingClientRect();
      const rect = clip
        ? {
            left: Math.max(raw.left, clip.left),
            top: Math.max(raw.top, clip.top),
            right: Math.min(raw.right, clip.right),
            bottom: Math.min(raw.bottom, clip.bottom),
            get width() {
              return Math.max(0, this.right - this.left);
            },
            get height() {
              return Math.max(0, this.bottom - this.top);
            },
          }
        : raw;
      if (
        !rect.width ||
        !rect.height ||
        rect.bottom <= 0 ||
        rect.top >= height ||
        rect.right <= 0 ||
        rect.left >= width
      )
        continue;
      // Archive buttons contain icons and labels. Their children supply more
      // precise geometry, preserving the corridors between documents.
      if (node.matches("[data-archive-item]")) continue;
      const shelter = node.matches(shelterSelector);
      surfaces.push({
        id: node.closest<HTMLElement>("[data-archive-id]")?.dataset.archiveId
          ? `${node.closest<HTMLElement>("[data-archive-id]")!.dataset.archiveId}:${shelter ? "shelter" : index}`
          : `surface-${index}`,
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
        shelter,
      });
    }
    return { width, height, surfaces };
  };
  const society = createSociety(measure());
  if (!society.entities.length) return;
  document.body.append(canvas, balloon);
  const abort = new AbortController();
  const { signal } = abort;
  const observer = new ResizeObserver(() => {
    dirty = true;
  });
  observer.observe(document.documentElement);
  const themeObserver = new MutationObserver(() => {
    dirty = true;
  });
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    abort.abort();
    observer.disconnect();
    themeObserver.disconnect();
    canvas.remove();
    balloon.remove();
    preference.removeEventListener("change", motionChanged);
  };
  const retire = () => {
    if (society.retiring || stopped) return;
    try {
      sessionStorage.setItem(dismissedKey, "1");
    } catch {}
    balloon.hidden = true;
    society.retreat();
  };
  const motionChanged = () => {
    if (preference.matches) cleanup();
  };
  let pointer: { x: number; y: number } | null = null;
  document.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerType && event.pointerType !== "mouse") return;
      const moved =
        Math.hypot(event.movementX || 0, event.movementY || 0) > 2 ||
        (pointer !== null &&
          Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 3);
      pointer = { x: event.clientX, y: event.clientY };
      if (moved) retire();
    },
    { signal, passive: true },
  );
  // No capture of input: the same click, touch or key continues into the site.
  document.addEventListener("pointerdown", retire, {
    signal,
    passive: true,
    capture: true,
  });
  document.addEventListener("keydown", retire, { signal, capture: true });
  document.addEventListener("wheel", retire, { signal, passive: true });
  window.addEventListener(
    "resize",
    () => {
      dirty = true;
    },
    { signal, passive: true },
  );
  // Programmatic scroll restoration only updates geometry. Actual wheel,
  // touch, scrollbar dragging and keyboard input already trigger withdrawal.
  document.addEventListener(
    "scroll",
    () => {
      dirty = true;
    },
    { signal, passive: true, capture: true },
  );
  window.addEventListener("pagehide", cleanup, { signal });
  preference.addEventListener("change", motionChanged);
  document.fonts?.ready.then(() => {
    if (!stopped) dirty = true;
  });

  const draw = () => {
    context.clearRect(0, 0, width, height);
    const opacity = society.opacity;
    for (const entity of society.entities) {
      if (entity.opacity <= 0) continue;
      const brightness = entity.opacity * opacity;
      // Only add faint local light. No full-screen scrim or content masking.
      context.save();
      const home = surfaces.find(
        (surface) => surface.id === entity.home && surface.shelter,
      );
      context.beginPath();
      context.rect(-100, -100, width + 200, height + 200);
      if (home) context.rect(home.x, home.y, home.width, home.height);
      context.clip("evenodd");
      const depth = home
        ? Math.min(
            entity.x - home.x,
            home.x + home.width - entity.x,
            entity.y - home.y,
            home.y + home.height - entity.y,
          )
        : -entity.size;
      const lightVisibility = Math.max(
        0,
        Math.min(1, (entity.size * 0.65 - depth) / (entity.size * 1.3)),
      );
      const radius = 58 + entity.curiosity * 16;
      const glow = context.createRadialGradient(
        entity.x,
        entity.y,
        0,
        entity.x,
        entity.y,
        radius,
      );
      // A warm core gives the entity a light of its own; most of the wider
      // halo remains nearly transparent, preserving contrast in the archive.
      glow.addColorStop(0, light);
      glow.addColorStop(
        0.2,
        light === "#fffaf0"
          ? "rgba(255,250,240,0.55)"
          : "rgba(243,226,184,0.55)",
      );
      glow.addColorStop(
        0.55,
        light === "#fffaf0"
          ? "rgba(255,250,240,0.12)"
          : "rgba(243,226,184,0.12)",
      );
      glow.addColorStop(1, "transparent");
      context.globalAlpha =
        brightness * lightVisibility * (light === "#fffaf0" ? 0.05 : 0.1);
      context.fillStyle = glow;
      context.fillRect(
        entity.x - radius,
        entity.y - radius,
        radius * 2,
        radius * 2,
      );
      context.globalAlpha = brightness * 0.63 * (1 - entity.phase * 0.28);
      context.fillStyle = bodyColors[entity.color];
      context.font = `${entity.size}px ${font}`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      const resting =
        entity.state === "rest" ||
        entity.state === "observe" ||
        entity.state === "yield";
      context.fillText(
        "*",
        entity.x,
        entity.y + (resting ? Math.sin(elapsed * 0.0012 + entity.id) * 0.7 : 0),
      );
      context.restore();
    }
    const speech = society.speech;
    const speaker =
      speech && society.entities.find((entity) => entity.id === speech.id);
    if (!speaker || society.retiring) {
      balloon.hidden = true;
      return;
    }
    balloon.hidden = false;
    balloon.classList.add("is-visible");
    balloon.textContent = speech!.text;
    const left = Math.max(
      12,
      Math.min(width - balloon.offsetWidth - 12, speaker.x - 22),
    );
    const above = speaker.y - balloon.offsetHeight - 18 >= 12;
    balloon.dataset.placement = above ? "above" : "below";
    balloon.style.left = `${left}px`;
    balloon.style.top = `${Math.max(
      12,
      Math.min(
        height - balloon.offsetHeight - 12,
        above ? speaker.y - balloon.offsetHeight - 18 : speaker.y + 18,
      ),
    )}px`;
    balloon.style.setProperty(
      "--complaint-tail-x",
      `${Math.max(9, Math.min(balloon.offsetWidth - 10, speaker.x - left))}px`,
    );
  };
  const tick = (time: number) => {
    if (stopped) return;
    const delta =
      lastFrame === null ? 0 : Math.min(64, Math.max(0, time - lastFrame));
    lastFrame = time;
    elapsed += delta;
    try {
      if (dirty) {
        society.remap(measure());
        dirty = false;
      }
      society.step(delta);
      if (society.finished) {
        cleanup();
        return;
      }
      draw();
    } catch (error) {
      cleanup();
      throw error;
    }
    frame = requestAnimationFrame(tick);
  };
  document.addEventListener(
    "visibilitychange",
    () => {
      cancelAnimationFrame(frame);
      lastFrame = null;
      if (!document.hidden && !stopped) frame = requestAnimationFrame(tick);
      else balloon.hidden = true;
    },
    { signal },
  );
  if (!document.hidden) frame = requestAnimationFrame(tick);
};
