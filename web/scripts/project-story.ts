import { initializeProjectGalleries } from "./project-gallery";

const selectProjectSection = (
  selectedTab: HTMLButtonElement,
  moveFocus = false,
  revealTab = false,
  fromSwipe = false,
) => {
  const story = selectedTab.closest<HTMLElement>("[data-project-story]");
  const section = selectedTab.dataset.projectTab;
  if (!story || !section) return;

  story
    .querySelectorAll<HTMLButtonElement>("[data-project-tab]")
    .forEach((tab) => {
      const active = tab === selectedTab;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    });

  story
    .querySelectorAll<HTMLElement>("[data-project-panel]")
    .forEach((panel) => {
      const active = panel.dataset.projectPanel === section;
      panel.classList.toggle("is-swipe-selected", active && fromSwipe);
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    });

  const readingViewport = story.querySelector<HTMLElement>(
    '[data-scroll-area][data-axis="vertical"] > [data-scroll-area-viewport]',
  );
  readingViewport?.scrollTo({ top: 0 });

  if (revealTab) {
    const tabViewport = story.querySelector<HTMLElement>(
      '[data-scroll-area][data-axis="horizontal"] > [data-scroll-area-viewport]',
    );
    if (tabViewport) {
      const tabCenter =
        selectedTab.getBoundingClientRect().left -
        tabViewport.getBoundingClientRect().left +
        tabViewport.scrollLeft +
        selectedTab.offsetWidth / 2;
      tabViewport.scrollTo({
        left: tabCenter - tabViewport.clientWidth / 2,
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    }
  }

  if (section === "gallery") {
    window.requestAnimationFrame(() => initializeProjectGalleries(story));
  }

  if (moveFocus) selectedTab.focus();
};

const getTabs = (tab: HTMLButtonElement) => {
  const story = tab.closest<HTMLElement>("[data-project-story]");
  return story
    ? Array.from(
        story.querySelectorAll<HTMLButtonElement>("[data-project-tab]"),
      ).filter((candidate) => candidate.getClientRects().length > 0)
    : [];
};

export const initializeProjectStories = () => {
  const mobileLayout = window.matchMedia("(max-width: 620px)");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  document.querySelectorAll<HTMLElement>("[data-project-story]").forEach((story) => {
    const readingViewport = story.querySelector<HTMLElement>(
      '[data-scroll-area][data-axis="vertical"] > [data-scroll-area-viewport]',
    );
    const panels = story.querySelector<HTMLElement>(".project-content__panels");
    if (!readingViewport || !panels) return;

    const tabs = Array.from(
      story.querySelectorAll<HTMLButtonElement>("[data-project-tab]"),
    );
    const sections = Array.from(
      panels.querySelectorAll<HTMLElement>("[data-project-panel]"),
    );
    let preview: {
      active: HTMLElement;
      next: HTMLElement;
      nextIndex: number;
      direction: number;
    } | null = null;
    let settling = false;
    let settleTimer = 0;

    const clearPreview = (completed: boolean) => {
      if (!preview) return;
      if (!completed) {
        preview.next.hidden = true;
        preview.active.classList.add("is-swipe-selected");
      }
      preview.active.classList.remove("is-swipe-active");
      preview.next.classList.remove("is-swipe-preview");
      panels.classList.remove("is-swiping", "is-swipe-settling");
      panels.style.removeProperty("--swipe-offset");
      panels.style.removeProperty("--swipe-origin");
      preview = null;
      settling = false;
      settleTimer = 0;
    };

    const updatePreview = (distanceX: number, distanceY: number) => {
      if (Math.abs(distanceX) < 12 || Math.abs(distanceX) < Math.abs(distanceY) * 1.25)
        return;

      const direction = distanceX < 0 ? 1 : -1;
      if (
        start && start.galleryLength > 0 &&
        (direction === 1
          ? start.galleryIndex !== start.galleryLength - 1
          : start.galleryIndex !== 0)
      ) return;

      if (preview && preview.direction !== direction) clearPreview(false);
      if (!preview) {
        const activeIndex = tabs.findIndex((tab) => tab.classList.contains("is-active"));
        const nextIndex = activeIndex + direction;
        const active = sections.find((panel) => panel.classList.contains("is-active"));
        const next = sections.find(
          (panel) => panel.dataset.projectPanel === tabs[nextIndex]?.dataset.projectTab,
        );
        if (!active || !next) return;

        next.hidden = false;
        preview = { active, next, nextIndex, direction };
        panels.style.setProperty("--swipe-origin", direction === 1 ? "100%" : "-100%");
        panels.classList.add("is-swiping");
        active.classList.add("is-swipe-active");
        next.classList.add("is-swipe-preview");
        if (next.dataset.projectPanel === "gallery")
          window.requestAnimationFrame(() => initializeProjectGalleries(story));
      }

      const width = panels.clientWidth;
      panels.style.setProperty(
        "--swipe-offset",
        `${Math.max(-width, Math.min(width, distanceX))}px`,
      );
    };

    let start: {
      x: number;
      y: number;
      identifier: number;
      galleryIndex: number;
      galleryLength: number;
    } | null = null;

    readingViewport.addEventListener("touchstart", (event) => {
      start = null;
      if (!mobileLayout.matches || settling || event.touches.length !== 1) return;
      if (!(event.target instanceof Element)) return;
      if (event.target.closest("a, button, input, select, textarea, [contenteditable]"))
        return;

      const gallery = event.target.closest<HTMLElement>(".project-gallery__viewport");
      const slides = gallery?.querySelectorAll<HTMLElement>("[data-gallery-slide]");
      const galleryIndex = slides
        ? Array.from(slides).findIndex((slide) => slide.getAttribute("aria-hidden") === "false")
        : -1;

      const touch = event.touches[0];
      start = {
        x: touch.clientX,
        y: touch.clientY,
        identifier: touch.identifier,
        galleryIndex,
        galleryLength: slides?.length ?? 0,
      };
    }, { passive: true });

    readingViewport.addEventListener("touchmove", (event) => {
      if (!start || !mobileLayout.matches || settling) return;
      const touch = Array.from(event.touches).find(
        (candidate) => candidate.identifier === start?.identifier,
      );
      if (!touch) return;
      const distanceX = touch.clientX - start.x;
      const distanceY = touch.clientY - start.y;
      if (!preview && Math.abs(distanceY) > 12 && Math.abs(distanceY) > Math.abs(distanceX)) {
        start = null;
        return;
      }
      updatePreview(distanceX, distanceY);
    }, { passive: true });

    readingViewport.addEventListener("touchend", (event) => {
      if (!start || !mobileLayout.matches) return;
      const touch = Array.from(event.changedTouches).find(
        (candidate) => candidate.identifier === start?.identifier,
      );
      if (!touch) return;

      const distanceX = touch.clientX - start.x;
      const distanceY = touch.clientY - start.y;
      updatePreview(distanceX, distanceY);
      start = null;
      if (!preview) return;

      const complete = Math.abs(distanceX) >= 50 &&
        Math.abs(distanceX) >= Math.abs(distanceY) * 1.25;
      const nextIndex = preview.nextIndex;
      const direction = preview.direction;
      settling = true;
      panels.classList.add("is-swipe-settling");
      panels.style.setProperty(
        "--swipe-offset",
        complete ? `${-direction * panels.clientWidth}px` : "0px",
      );
      settleTimer = window.setTimeout(() => {
        if (complete) selectProjectSection(tabs[nextIndex], false, true, true);
        clearPreview(complete);
      }, reducedMotion.matches ? 0 : 200);
    }, { passive: true });

    readingViewport.addEventListener("touchcancel", () => {
      start = null;
      if (settleTimer) window.clearTimeout(settleTimer);
      clearPreview(false);
    });
  });

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const tab = event.target.closest<HTMLButtonElement>("[data-project-tab]");
    if (tab) selectProjectSection(tab);
  });

  document.addEventListener("keydown", (event) => {
    if (
      !(event.target instanceof HTMLButtonElement) ||
      !event.target.matches("[data-project-tab]")
    )
      return;

    const tabs = getTabs(event.target);
    const currentIndex = tabs.indexOf(event.target);
    if (currentIndex < 0) return;

    let nextIndex: number | undefined;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      nextIndex = (currentIndex + 1) % tabs.length;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    if (nextIndex === undefined) return;

    event.preventDefault();
    selectProjectSection(tabs[nextIndex], true);
  });
};
