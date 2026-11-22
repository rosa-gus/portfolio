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

export const dismissWindowHelp = (root: HTMLElement) => {
  const panel = root.querySelector<HTMLElement>("[data-window-help]");
  const toggle = root.querySelector<HTMLButtonElement>("[data-window-help-toggle]");
  if (!panel || panel.hidden || !toggle) return false;
  panel.hidden = true;
  toggle.setAttribute("aria-expanded", "false");
  toggle.focus({ preventScroll: true });
  fitWindowMedia(root);
  return true;
};

export const initializeWindowLayout = () => {
  document.querySelectorAll<HTMLElement>("[data-window]").forEach(root => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        fitWindowMedia(root);
        root.dispatchEvent(new Event("window:layout"));
      });
    };
    const toggle = root.querySelector<HTMLButtonElement>("[data-window-help-toggle]");
    const panel = root.querySelector<HTMLElement>("[data-window-help]");
    toggle?.addEventListener("click", () => {
      if (!panel) return;
      panel.hidden = !panel.hidden;
      toggle.setAttribute("aria-expanded", String(!panel.hidden));
      if (!panel.hidden) root.dispatchEvent(new Event("window:help"));
      schedule();
    });
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
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    root.addEventListener("popup:open", schedule);
  });
};
