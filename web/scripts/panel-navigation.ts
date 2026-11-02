import {
  canScrollInDirection,
  createWheelGesture,
  normalizeWheelDelta,
  type ScrollDirection,
} from "./panel-wheel";

const motion = {
  exitDuration: 140,
  enterDuration: 260,
  contentDelay: 50,
  exitDistance: 20,
  enterDistance: 28,
  easing: "cubic-bezier(0.16, 1, 0.3, 1)",
};

type NavigationOptions = {
  onChange: (panelID: string) => void;
};

export const initializePanelNavigation = ({ onChange }: NavigationOptions) => {
  const shell = document.querySelector<HTMLElement>(".site-shell");
  const stage = shell?.querySelector<HTMLElement>(".stage");
  const panels = Array.from(
    stage?.querySelectorAll<HTMLElement>("[data-panel]") ?? [],
  );
  if (!shell || !stage || panels.length === 0) return;

  const links = Array.from(
    shell.querySelectorAll<HTMLAnchorElement>("[data-panel-target]"),
  );
  const pageTitle = shell.querySelector<HTMLElement>("[data-page-title]");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const desktopWheel = window.matchMedia(
    "(min-width: 901px) and (hover: hover) and (pointer: fine)",
  );
  const gesture = createWheelGesture();
  const animations = new Set<Animation>();
  let active =
    panels.find((panel) => panel.classList.contains("is-current")) ?? panels[0];
  let transitioning = false;
  let revision = 0;

  shell.setAttribute("data-panel-navigation", "");

  const setTransitioning = (value: boolean) => {
    transitioning = value;
  };

  const cancelAnimations = () => {
    animations.forEach((animation) => animation.cancel());
    animations.clear();
  };

  const animatePanel = async (
    panel: HTMLElement,
    direction: ScrollDirection,
    entering: boolean,
  ) => {
    if (reducedMotion.matches || !desktopWheel.matches) return;
    // Animate content only: media backgrounds remain fixed to the viewport.
    const targets = Array.from(panel.children).filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement &&
        !child.matches("[data-panel-background]"),
    );
    const running = targets.map((target) => {
      const controls = target.classList.contains("about-panel__controls");
      const offset =
        direction * (entering ? motion.enterDistance : -motion.exitDistance);
      const displaced = {
        opacity: 0,
        transform: `translateY(${controls ? 0 : offset}px)`,
      };
      const resting = { opacity: 1, transform: "translateY(0)" };
      const animation = target.animate(
        entering ? [displaced, resting] : [resting, displaced],
        {
          duration: entering ? motion.enterDuration : motion.exitDuration,
          delay:
            entering && !target.classList.contains("editorial-heading")
              ? motion.contentDelay
              : 0,
          easing: motion.easing,
          fill: "both",
        },
      );
      animations.add(animation);
      return animation;
    });
    await Promise.all(
      running.map((animation) => animation.finished.catch(() => {})),
    );
  };

  const commit = (selected: HTMLElement, updateHistory: boolean) => {
    panels.forEach((panel) => {
      panel.hidden = panel !== selected;
      panel.inert = false;
      panel.classList.toggle("is-current", panel === selected);
    });
    active = selected;
    links.forEach((link) => {
      const current = link.dataset.panelTarget === selected.id;
      link.classList.toggle("is-current", current);
      if (current) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
    shell.classList.toggle("is-about-current", selected.id === "about");
    shell.classList.toggle(
      "is-media-current",
      !!selected.querySelector("[data-panel-background]"),
    );
    if (pageTitle)
      pageTitle.textContent = selected.dataset.panelTitle ?? "Portfólio";
    if (updateHistory) history.replaceState(null, "", `#${selected.id}`);
    onChange(selected.id);
  };

  const navigate = async (panelID: string, updateHistory = true) => {
    const selected = panels.find((panel) => panel.id === panelID);
    if (!selected) return;
    const request = ++revision;
    cancelAnimations();
    active.inert = false;
    if (selected === active) {
      setTransitioning(false);
      return;
    }

    setTransitioning(true);
    const previous = active;
    const direction: ScrollDirection =
      panels.indexOf(selected) > panels.indexOf(previous) ? 1 : -1;
    const moveFocus = previous.contains(document.activeElement);
    previous.inert = true;
    try {
      await animatePanel(previous, direction, false);
      if (request !== revision) return;

      cancelAnimations();
      commit(selected, updateHistory);
      if (moveFocus) {
        const heading = selected.querySelector<HTMLElement>("h1, h2");
        heading?.setAttribute("tabindex", "-1");
        heading?.focus({ preventScroll: true });
      }
      await animatePanel(selected, direction, true);
    } finally {
      if (request === revision) {
        cancelAnimations();
        previous.inert = false;
        setTransitioning(false);
      }
    }
  };

  links.forEach((link) => {
    link.addEventListener("click", (event) => {
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      )
        return;
      event.preventDefault();
      void navigate(link.dataset.panelTarget ?? "");
    });
  });

  window.addEventListener("hashchange", () => {
    void navigate(window.location.hash.slice(1) || panels[0].id, false);
  });

  const scrollViewport = (target: Element, direction: ScrollDirection) => {
    let element: Element | null = target;
    while (element && active.contains(element)) {
      if (
        element instanceof HTMLElement &&
        /auto|scroll/.test(getComputedStyle(element).overflowY) &&
        canScrollInDirection(element, direction)
      )
        return element;
      if (element === active) break;
      element = element.parentElement;
    }
    // The main reading area also receives scrolling when the pointer is over a heading.
    const primary = active.querySelector<HTMLElement>(
      '[data-scroll-area][data-axis="vertical"] > [data-scroll-area-viewport]',
    );
    return primary && canScrollInDirection(primary, direction) ? primary : null;
  };

  document.addEventListener(
    "wheel",
    (event) => {
      if (
        !desktopWheel.matches ||
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        Math.abs(event.deltaY) <= Math.abs(event.deltaX) ||
        !(event.target instanceof Element)
      )
        return;

      const delta = normalizeWheelDelta(
        event.deltaY,
        event.deltaMode,
        stage.clientHeight,
      );
      if (delta === 0) return;
      const direction: ScrollDirection = delta > 0 ? 1 : -1;
      const blocked =
        !!event.target.closest(
          'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
        ) ||
        !!document.querySelector(
          "dialog[open], [data-archive-floating]:not([hidden])",
        );
      if (blocked) {
        gesture.add(delta, event.timeStamp, true);
        return;
      }
      if (transitioning || gesture.blocksScroll(event.timeStamp)) {
        event.preventDefault();
        gesture.add(delta, event.timeStamp, true);
        return;
      }

      const viewport = scrollViewport(event.target, direction);
      if (viewport) {
        gesture.add(delta, event.timeStamp, true);
        if (!viewport.contains(event.target)) {
          event.preventDefault();
          viewport.scrollTop += delta;
        }
        return;
      }

      event.preventDefault();
      const step = gesture.add(delta, event.timeStamp);
      if (!step) return;
      const next = panels[panels.indexOf(active) + step];
      if (next) void navigate(next.id);
    },
    { passive: false },
  );

  desktopWheel.addEventListener("change", () => {
    gesture.reset();
    // Finish a desktop transition immediately when switching to the mobile layout.
    if (!desktopWheel.matches) {
      cancelAnimations();
      setTransitioning(false);
    }
  });
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches) {
      cancelAnimations();
      setTransitioning(false);
    }
  });

  const initial =
    panels.find((panel) => panel.id === window.location.hash.slice(1)) ??
    active;
  commit(initial, false);
};
