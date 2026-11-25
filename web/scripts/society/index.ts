import { migrateStorageValue, storageKey } from "../storage";
import { createSociety, type Environment, type Surface } from "./engine";

// Identity is independent of temperament and affinity. Halos stay neutral.
const bodyPalettes = {
  dark: ["#d8ceb7", "#d1b0bc", "#acbfa8", "#a9bed0"],
  light: ["#796b50", "#8e6678", "#607b68", "#5f748d"],
};

export const initializeSociety = () => {
  const preference = matchMedia("(prefers-reduced-motion: reduce)");
  const dismissedKey = storageKey("asterisks");
  if (preference.matches) return;
  try {
    if (migrateStorageValue(sessionStorage, dismissedKey, storageKey("society-dismissed")) === "1") return;
  } catch {}
  const grid = document.querySelector<HTMLElement>("#case [data-archive-surface]");
  if (!grid) return;
  const viewport = grid.closest<HTMLElement>(".scroll-area__viewport");
  const layer = document.createElement("div");
  layer.className = "society";
  layer.setAttribute("aria-hidden", "true");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return;
  canvas.className = "society__canvas";
  const balloon = document.createElement("div");
  balloon.className = "project-archive__complaint society__speech";
  balloon.setAttribute("aria-hidden", "true");
  balloon.hidden = true;
  let placedSpeech: ReturnType<typeof createSociety>["speech"] = null;
  let lastPosition = -1;
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
  let society: ReturnType<typeof createSociety> | undefined;
  let startTimer: number;
  let edgeFades: CanvasGradient[] = [];
  const createEdgeFade = (x: number, y: number) => {
    const fade = context.createLinearGradient(0, 0, x, y);
    const inset = Math.min(20 / Math.max(x, y), 0.5);
    fade.addColorStop(0, "transparent");
    fade.addColorStop(inset, "black");
    fade.addColorStop(1 - inset, "black");
    fade.addColorStop(1, "transparent");
    return fade;
  };
  const measure = (): Environment | null => {
    const bounds = grid.getBoundingClientRect();
    const clip = viewport?.getBoundingClientRect() ?? bounds;
    const left = Math.max(0, bounds.left, clip.left);
    const top = Math.max(0, bounds.top, clip.top);
    const right = Math.min(innerWidth, bounds.right, clip.right);
    const bottom = Math.min(innerHeight, bounds.bottom, clip.bottom);
    width = right - left;
    height = bottom - top;
    layer.hidden = width <= 0 || height <= 0;
    if (layer.hidden) return null;

    layer.style.left = `${left}px`;
    layer.style.top = `${top}px`;
    layer.style.width = `${width}px`;
    layer.style.height = `${height}px`;

    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    edgeFades = [createEdgeFade(width, 0), createEdgeFade(0, height)];
    const styles = getComputedStyle(document.documentElement);
    font = styles.getPropertyValue("--font-mono").trim();
    const dark = document.documentElement.dataset.theme === "dark";
    light = dark ? "#f3e2b8" : "#fffaf0";
    bodyColors = dark ? bodyPalettes.dark : bodyPalettes.light;
    surfaces = [];
    const shelterSelector = ".project-archive__item-icon";
    const folderTabSelector = ".project-archive__folder-tab";
    const nodes = grid.querySelectorAll(
      `${shelterSelector}, ${folderTabSelector}, .project-archive__item-title, .project-archive__item-meta`,
    );
    for (const [index, node] of Array.from(nodes).entries()) {
      if (node.closest("[hidden], [inert]")) continue;
      const raw = node.getBoundingClientRect();
      const x = Math.max(raw.left, left);
      const y = Math.max(raw.top, top);
      const clippedWidth = Math.min(raw.right, right) - x;
      const clippedHeight = Math.min(raw.bottom, bottom) - y;
      if (clippedWidth <= 0 || clippedHeight <= 0) continue;
      const isIcon = node.matches(shelterSelector);
      const item = node.closest<HTMLElement>("[data-archive-id]")?.dataset.archiveId;
      surfaces.push({
        id: isIcon && item ? item : `surface-${index}`,
        x: x - left,
        y: y - top,
        width: clippedWidth,
        height: clippedHeight,
        shelter: isIcon && clippedWidth === raw.width && clippedHeight === raw.height,
        folderTab: node.matches(folderTabSelector),
      });
    }
    return { width, height, surfaces };
  };
  const abort = new AbortController();
  const { signal } = abort;
  const observer = new ResizeObserver(() => {
    dirty = true;
  });
  observer.observe(document.documentElement);
  observer.observe(grid);
  if (viewport) observer.observe(viewport);
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
    window.clearTimeout(startTimer);
    cancelAnimationFrame(frame);
    abort.abort();
    observer.disconnect();
    themeObserver.disconnect();
    layer.remove();
    preference.removeEventListener("change", motionChanged);
  };
  const retire = () => {
    if (stopped || society?.retiring) return;
    try {
      sessionStorage.setItem(dismissedKey, "1");
    } catch {}
    balloon.hidden = true;
    if (society) society.retreat();
    else cleanup();
  };
  const motionChanged = () => {
    if (preference.matches) cleanup();
  };
  // The same click, touch or key continues into the site.
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

  const draw = (scene: ReturnType<typeof createSociety>) => {
    context.clearRect(0, 0, width, height);
    const opacity = scene.opacity;
    const visible = scene.entities.filter((entity) => entity.opacity > 0);
    context.save();
    context.beginPath();
    context.rect(0, 0, width, height);
    for (const surface of surfaces) {
      context.rect(surface.x, surface.y, surface.width, surface.height);
    }
    context.clip("evenodd");
    for (const entity of visible) {
      const brightness = entity.opacity * opacity;
      const home = surfaces.find(
        (surface) => surface.id === entity.home && surface.shelter,
      );
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
      const radius = (58 + entity.curiosity * 16) * (0.45 + 0.55 * lightVisibility);
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
    }
    if (visible.length) {
      // Fade the light already on the canvas before adding the glyphs.
      context.globalAlpha = 1;
      context.globalCompositeOperation = "destination-in";
      for (const fade of edgeFades) {
        context.fillStyle = fade;
        context.fillRect(0, 0, width, height);
      }
      context.globalCompositeOperation = "source-over";
    }
    for (const entity of visible) {
      context.globalAlpha = entity.opacity * opacity * 0.63 * (1 - entity.phase * 0.28);
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
    }
    context.restore();
    const speech = scene.speech;
    const speaker =
      speech && scene.entities.find((entity) => entity.id === speech.id);
    if (!speech || !speaker || scene.retiring) {
      balloon.hidden = true;
      placedSpeech = null;
      return;
    }
    balloon.hidden = false;
    if (balloon.textContent !== speech.text) balloon.textContent = speech.text;
    const balloonWidth = balloon.offsetWidth;
    const balloonHeight = balloon.offsetHeight;
    const safeLeft = (x: number) => Math.max(8, Math.min(width - balloonWidth - 8, x));
    const sideTop = Math.max(8, Math.min(height - balloonHeight - 8, speaker.y - balloonHeight / 2));
    const above = speaker.y - balloonHeight - 16;
    const below = speaker.y + 16;
    const defaultLeft = safeLeft(speaker.x - 22);
    const shiftedLeft = safeLeft(speaker.x - balloonWidth + 12);
    const shiftedRight = safeLeft(speaker.x - 12);
    const positions = [
      { placement: "above", left: defaultLeft, top: above },
      { placement: "below", left: defaultLeft, top: below },
      { placement: "right", left: speaker.x + 14, top: sideTop },
      { placement: "left", left: speaker.x - balloonWidth - 14, top: sideTop },
      { placement: "above", left: shiftedLeft, top: above },
      { placement: "above", left: shiftedRight, top: above },
      { placement: "below", left: shiftedLeft, top: below },
      { placement: "below", left: shiftedRight, top: below },
    ];
    const fits = ({ left, top }: (typeof positions)[number]) =>
      left >= 8 && left + balloonWidth <= width - 8 &&
      top >= 8 && top + balloonHeight <= height - 8 &&
      !surfaces.some((surface) =>
        left < surface.x + surface.width && left + balloonWidth > surface.x &&
        top < surface.y + surface.height && top + balloonHeight > surface.y,
      );
    if (placedSpeech !== speech) {
      placedSpeech = speech;
      lastPosition = -1;
      balloon.classList.remove("is-visible");
    }
    if (lastPosition < 0 || !fits(positions[lastPosition])) lastPosition = positions.findIndex(fits);
    const position = positions[lastPosition];
    if (!position) {
      balloon.hidden = true;
      return;
    }
    const { placement, left, top } = position;
    balloon.dataset.placement = placement;
    balloon.style.left = `${left}px`;
    balloon.style.top = `${top}px`;
    balloon.style.setProperty(
      "--complaint-tail-x",
      `${Math.max(9, Math.min(balloonWidth - 10, speaker.x - left))}px`,
    );
    balloon.style.setProperty(
      "--society-tail-y",
      `${Math.max(9, Math.min(balloonHeight - 9, speaker.y - top))}px`,
    );
    balloon.classList.add("is-visible");
    if (!speech.shown) scene.markSpeechShown(speech);
  };
  const tick = (time: number) => {
    if (stopped || !society) return;
    const delta =
      lastFrame === null ? 0 : Math.min(64, Math.max(0, time - lastFrame));
    lastFrame = time;
    elapsed += delta;
    try {
      if (dirty) {
        const bounds = measure();
        if (bounds) society.remap(bounds);
        dirty = false;
      }
      society.step(delta);
      if (society.finished) {
        cleanup();
        return;
      }
      if (!layer.hidden) draw(society);
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
      if (!document.hidden && society && !stopped) frame = requestAnimationFrame(tick);
      else balloon.hidden = true;
    },
    { signal },
  );
  startTimer = window.setTimeout(() => {
    const bounds = measure();
    if (!bounds) {
      cleanup();
      return;
    }
    society = createSociety(bounds);
    if (!society.entities.length) {
      cleanup();
      return;
    }
    layer.append(canvas, balloon);
    document.body.append(layer);
    if (!document.hidden) frame = requestAnimationFrame(tick);
  }, 8000);
  return cleanup;
};
