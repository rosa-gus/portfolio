type SwipeOptions = {
  stage: HTMLElement;
  panels: HTMLElement[];
  navigate: (id: string) => void;
};

export const initializePanelSwipe = ({ stage, panels, navigate }: SwipeOptions) => {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const mobileLayout = window.matchMedia("(max-width: 620px)");
  const commandLinks = Array.from(
    stage.closest(".site-shell")?.querySelectorAll<HTMLAnchorElement>("[data-panel-target]") ?? [],
  );
  let previewLink: HTMLAnchorElement | undefined;
  let start: { x: number; y: number; id: number } | null = null;
  let lastX = 0;
  let lastTime = 0;
  let velocity = 0;
  let preview: { active: HTMLElement; next: HTMLElement; direction: number } | null = null;
  let timer = 0;

  const reset = () => {
    start = null;
    window.clearTimeout(timer);
    timer = 0;
    if (previewLink) {
      previewLink.classList.remove("is-swipe-target");
      previewLink.style.removeProperty("--command-swipe-fill");
      previewLink.style.removeProperty("--command-swipe-duration");
      previewLink.style.removeProperty("--command-swipe-text");
      previewLink = undefined;
    }
    if (preview) {
      preview.active.classList.remove("is-home-swipe-active");
      preview.next.classList.remove("is-home-swipe-preview");
      preview.next.hidden = true;
      preview.next.inert = false;
      preview.next.removeAttribute("aria-hidden");
    }
    preview = null;
    stage.classList.remove("is-home-swiping", "is-home-swipe-settling");
    stage.style.removeProperty("--home-swipe-offset");
    stage.style.removeProperty("--home-swipe-direction");
    stage.style.removeProperty("--home-swipe-progress");
    stage.style.removeProperty("--home-swipe-duration");
    stage.style.removeProperty("--home-preview-top");
    stage.style.removeProperty("--home-preview-height");
  };

  const update = (x: number, y: number) => {
    if (Math.abs(x) < 12 || Math.abs(x) < Math.abs(y) * 1.25) return;
    const direction = x < 0 ? 1 : -1;
    if (preview && preview.direction !== direction) {
      const origin = start;
      reset();
      start = origin;
    }
    if (!preview) {
      const active = panels.find((panel) => panel.classList.contains("is-current"));
      if (!active) return;
      const next = panels[panels.indexOf(active) + direction];
      if (!next) return;
      if (mobileLayout.matches) {
        const shell = stage.closest<HTMLElement>(".site-shell");
        const shellStyle = shell ? getComputedStyle(shell) : null;
        const stageTop = stage.getBoundingClientRect().top + window.scrollY;
        const bottomSpace = shellStyle
          ? parseFloat(shellStyle.paddingBottom) + parseFloat(shellStyle.rowGap)
          : 0;
        stage.style.setProperty("--home-preview-top", `${window.scrollY}px`);
        stage.style.setProperty("--home-preview-height", `${Math.max(0, window.innerHeight - stageTop - bottomSpace)}px`);
      }
      preview = { active, next, direction };
      previewLink = commandLinks.find((link) => link.dataset.panelTarget === next.id);
      previewLink?.classList.add("is-swipe-target");
      next.hidden = false;
      next.inert = true;
      next.setAttribute("aria-hidden", "true");
      next.classList.add("is-home-swipe-preview");
      active.classList.add("is-home-swipe-active");
      stage.classList.add("is-home-swiping");
      stage.style.setProperty("--home-swipe-direction", String(direction));
    }
    const width = stage.clientWidth;
    stage.style.setProperty("--home-swipe-offset", `${Math.max(-width, Math.min(width, x))}px`);
    stage.style.setProperty("--home-swipe-progress", String(Math.min(1, Math.abs(x) / width)));
    previewLink?.style.setProperty("--command-swipe-fill", `${Math.min(1, Math.abs(x) / width) * 18}%`);
  };

  stage.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1) {
      reset();
      return;
    }
    if (timer) return;
    reset();
    if (!(event.target instanceof Element) ||
      event.target.closest('a, button, input, select, textarea, summary, [contenteditable], [data-archive-carousel], [data-archive-floating], .project-archive__folders') ||
      document.querySelector('dialog[open], [data-archive-floating]:not([hidden])') ||
      window.getSelection()?.toString()) return;
    const touch = event.touches[0];
    start = { x: touch.clientX, y: touch.clientY, id: touch.identifier };
    lastX = touch.clientX;
    lastTime = event.timeStamp;
    velocity = 0;
  }, { passive: true });

  stage.addEventListener("touchmove", (event) => {
    if (!start || timer) return;
    if (event.touches.length !== 1) {
      reset();
      return;
    }
    const touch = Array.from(event.touches).find((item) => item.identifier === start?.id);
    if (!touch) return;
    const x = touch.clientX - start.x;
    const y = touch.clientY - start.y;
    const elapsed = event.timeStamp - lastTime;
    if (elapsed > 0) velocity = (touch.clientX - lastX) / elapsed;
    lastX = touch.clientX;
    lastTime = event.timeStamp;
    if (!preview && Math.abs(y) > 12 && Math.abs(y) > Math.abs(x)) {
      reset();
      return;
    }
    update(x, y);
  }, { passive: true });

  stage.addEventListener("touchend", (event) => {
    if (!start || timer) return;
    const touch = Array.from(event.changedTouches).find((item) => item.identifier === start?.id);
    if (!touch) return;
    const x = touch.clientX - start.x;
    const y = touch.clientY - start.y;
    update(x, y);
    start = null;
    if (!preview) return;
    if (event.timeStamp - lastTime > 100) velocity = 0;
    const width = stage.clientWidth;
    const distance = Math.min(width, Math.abs(x));
    const forwardVelocity = -preview.direction * velocity;
    const complete = Math.abs(x) >= Math.abs(y) * 1.25 &&
      (distance >= width * 0.25 || (distance >= 30 && forwardVelocity > 0.45));
    const remaining = complete ? width - distance : distance;
    const duration = reducedMotion.matches ? 0 :
      Math.round(Math.max(240, Math.min(400, 240 + remaining * 0.35 - Math.abs(velocity) * 35)));
    const next = preview.next;
    stage.style.setProperty("--home-swipe-duration", `${duration}ms`);
    previewLink?.style.setProperty("--command-swipe-duration", `${duration}ms`);
    previewLink?.style.setProperty("--command-swipe-fill", complete ? "100%" : "0%");
    previewLink?.style.setProperty("--command-swipe-text", complete ? "var(--color-ink)" : "var(--color-text-primary)");
    stage.classList.add("is-home-swipe-settling");
    stage.style.setProperty("--home-swipe-offset", complete ? `${-preview.direction * width}px` : "0px");
    stage.style.setProperty("--home-swipe-progress", complete ? "1" : "0");
    timer = window.setTimeout(() => {
      reset();
      if (complete) {
        navigate(next.id);
        if (mobileLayout.matches) window.scrollTo({ top: 0, behavior: "instant" });
      }
    }, duration);
  }, { passive: true });

  stage.addEventListener("touchcancel", reset);
  window.addEventListener("resize", reset);
  return reset;
};
