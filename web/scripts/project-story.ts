import { initializeProjectGalleries } from "./project-gallery";

const selectProjectSection = (
  selectedTab: HTMLButtonElement,
  moveFocus = false,
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
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    });

  const readingViewport = story.querySelector<HTMLElement>(
    '[data-scroll-area][data-axis="vertical"] > [data-scroll-area-viewport]',
  );
  readingViewport?.scrollTo({ top: 0 });

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
