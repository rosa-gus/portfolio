export const fitMediaSize = (width: number, height: number, aspect: number) => {
  if (![width, height, aspect].every(Number.isFinite) || width <= 0 || height <= 0 || aspect <= 0) {
    return { width: 0, height: 0 };
  }
  const fittedWidth = Math.min(width, height * aspect);
  return { width: fittedWidth, height: fittedWidth / aspect };
};

/** Measure the body's actual allocation, including fixed heights and expanded commands. */
export const fitWindowMedia = (root: HTMLElement) => {
  if (root.hidden || (root instanceof HTMLDialogElement && !root.open)) return;
  const body = root.querySelector<HTMLElement>("[data-window-body]");
  const media = body?.querySelector<HTMLElement>("[data-window-media]");
  const canvas = media?.querySelector<HTMLCanvasElement>("canvas");
  if (!body || !media || !canvas) return;
  // Restore natural size before measuring so the window can grow after a resize.
  media.style.removeProperty("--window-media-width");
  const style = getComputedStyle(body);
  const size = fitMediaSize(
    body.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
    body.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
    canvas.width / canvas.height,
  );
  media.style.setProperty("--window-media-width", `${size.width}px`);
};

const supportPanels = (root: HTMLElement) => (["help", "tips"] as const).flatMap(name => {
  const panel = root.querySelector<HTMLElement>(`[data-window-${name}]`);
  const toggle = root.querySelector<HTMLButtonElement>(`[data-window-${name}-toggle]`);
  return panel && toggle ? [{ name, panel, toggle }] : [];
});

const supportAnimations = new WeakMap<HTMLElement, () => void>();
type SupportPanel = ReturnType<typeof supportPanels>[number];

const pinSupportTop = (root: HTMLElement, top: number, height: number) => {
  if (!(root instanceof HTMLDialogElement) || root.classList.contains("is-positioned")) return;
  const marginTop = root.dataset.windowDecoration === "tab" ? 40 : 16;
  const limit = Math.max(marginTop, window.innerHeight - height - 23);
  root.style.setProperty("--window-support-top", `${Math.min(limit, Math.max(marginTop, top))}px`);
  root.classList.add("is-support-pinned");
};

const transitionSupport = (root: HTMLElement, panels: SupportPanel[], opened?: SupportPanel) => {
  const sheet = root.querySelector<HTMLElement>(".window__sheet");
  const body = root.querySelector<HTMLElement>("[data-window-body]");
  const region = root.querySelector<HTMLElement>("[data-window-support-panels]");
  const previous = panels.find(({ panel }) => !panel.hidden && !panel.inert);
  const top = sheet?.getBoundingClientRect().top;
  const beforeHeight = sheet?.offsetHeight;
  const bodyHeight = body?.offsetHeight;
  const from = region?.offsetHeight ?? 0;
  supportAnimations.get(root)?.();
  for (const item of panels) {
    item.panel.hidden = item !== opened;
    item.toggle.setAttribute("aria-expanded", String(item === opened));
  }
  // Both panels pause games through the existing help lifecycle event.
  if (opened) root.dispatchEvent(new Event("window:help"));
  fitWindowMedia(root);
  if (!sheet || !body || !region || top === undefined || !beforeHeight) return;

  const height = sheet.offsetHeight;
  const to = region.offsetHeight;
  pinSupportTop(root, top, height);
  root.dispatchEvent(new Event("window:layout"));
  // Let constrained windows refit immediately when the panel takes space from the body.
  if (body.offsetHeight !== bodyHeight || Math.abs((height - beforeHeight) - (to - from)) > 1) return;
  if (to === from || window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof region.animate !== "function") return;
  const transition = getComputedStyle(root).getPropertyValue("--transition-fast").trim();
  const [, duration, unit, easing] = /^(\d*\.?\d+)(ms|s)\s+(.+)$/.exec(transition) ?? [];
  if (!duration) return;

  const outgoing = opened ? undefined : previous?.panel;
  if (outgoing) {
    outgoing.inert = true;
    outgoing.hidden = false;
  }
  region.classList.add("is-revealing");
  const animation = region.animate(
    [{ height: `${from}px` }, { height: `${to}px` }],
    { duration: Number(duration) * (unit === "s" ? 1000 : 1), easing, fill: "both" },
  );
  const finish = () => {
    animation.removeEventListener("finish", finish);
    if (outgoing) {
      outgoing.hidden = true;
      outgoing.inert = false;
    }
    animation.cancel();
    region.classList.remove("is-revealing");
    supportAnimations.delete(root);
  };
  supportAnimations.set(root, finish);
  animation.addEventListener("finish", finish, { once: true });
};

export const toggleWindowPanel = (root: HTMLElement, name: "help" | "tips") => {
  const panels = supportPanels(root);
  const selected = panels.find(item => item.name === name);
  if (!selected) return;
  const opening = selected.panel.hidden || selected.panel.inert;
  transitionSupport(root, panels, opening ? selected : undefined);
};

export const dismissWindowHelp = (root: HTMLElement) => {
  const panels = supportPanels(root);
  const opened = panels.find(({ panel }) => !panel.hidden && !panel.inert);
  if (!opened) return false;
  transitionSupport(root, panels);
  opened.toggle.focus({ preventScroll: true });
  return true;
};

export const initializeWindowLayout = () => {
  document.querySelectorAll<HTMLElement>("[data-window]").forEach(root => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (supportAnimations.has(root)) return;
        fitWindowMedia(root);
        root.dispatchEvent(new Event("window:layout"));
      });
    };
    for (const { name, toggle } of supportPanels(root)) {
      toggle.addEventListener("click", () => toggleWindowPanel(root, name));
    }
    if (typeof ResizeObserver !== "undefined") {
      // Observe chrome height and root width, never media height: avoid fit loops.
      const sizes = new WeakMap<Element, number>();
      const observer = new ResizeObserver(entries => {
        let changed = false;
        for (const entry of entries) {
          const size = entry.target === root ? entry.contentRect.width : entry.contentRect.height;
          if (sizes.get(entry.target) !== size) { sizes.set(entry.target, size); changed = true; }
        }
        if (changed) schedule();
      });
      observer.observe(root);
      root.querySelectorAll(".window__heading, [data-window-commands]").forEach(element => observer.observe(element));
    }
    const refit = () => {
      supportAnimations.get(root)?.();
      root.classList.remove("is-support-pinned");
      root.style.removeProperty("--window-support-top");
      schedule();
    };
    window.addEventListener("resize", refit);
    window.visualViewport?.addEventListener("resize", refit);
    root.addEventListener("popup:open", refit);
    root.addEventListener("popup:closing", () => supportAnimations.get(root)?.());
  });
};
