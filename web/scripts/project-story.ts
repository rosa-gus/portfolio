export const initializeProjectStories = () => {
  document
    .querySelectorAll<HTMLElement>("[data-project-story]")
    .forEach((story) => {
      const page = story.closest<HTMLElement>(".project-page");
      const header = page?.querySelector<HTMLElement>(".project-page__header");
      const index = story.querySelector<HTMLElement>(".project-note__index");
      const viewport = story.closest<HTMLElement>(
        "[data-scroll-area-viewport]",
      );
      const mobile = window.matchMedia("(max-width: 620px)");
      const links = Array.from(
        story.querySelectorAll<HTMLAnchorElement>("[data-project-anchor]"),
      );
      const sections = Array.from(
        story.querySelectorAll<HTMLElement>("[data-project-section]"),
      );
      if (!page || !header || !index || !viewport || sections.length === 0)
        return;

      let frame = 0;
      const update = () => {
        frame = 0;
        const headerHeight = header.getBoundingClientRect().height;
        const indexHeight = index.getBoundingClientRect().height;
        page.style.setProperty("--project-header-height", `${headerHeight}px`);
        page.style.setProperty("--project-index-height", `${indexHeight}px`);
        viewport.tabIndex = mobile.matches ? -1 : 0;

        const offset =
          Number.parseFloat(getComputedStyle(sections[0]).scrollMarginTop) || 0;
        const readingTop = mobile.matches
          ? 0
          : viewport.getBoundingClientRect().top;
        let current = sections[0];
        for (const section of sections) {
          if (section.getBoundingClientRect().top <= readingTop + offset + 24)
            current = section;
        }
        // The final section can be shorter than the viewport.
        const atEnd = mobile.matches
          ? window.scrollY + window.innerHeight >=
            document.documentElement.scrollHeight - 2
          : viewport.scrollTop + viewport.clientHeight >=
            viewport.scrollHeight - 2;
        if (atEnd) current = sections[sections.length - 1];

        links.forEach((link) => {
          if (link.dataset.projectAnchor === current.dataset.projectSection)
            link.setAttribute("aria-current", "location");
          else link.removeAttribute("aria-current");
        });
      };
      const scheduleUpdate = () => {
        if (!frame) frame = window.requestAnimationFrame(update);
      };

      const scrollToSection = (section: HTMLElement, focus = false) => {
        const offset =
          Number.parseFloat(getComputedStyle(section).scrollMarginTop) || 0;
        const top =
          viewport.scrollTop +
          section.getBoundingClientRect().top -
          viewport.getBoundingClientRect().top -
          offset;
        // Native fragment navigation can scroll every overflow ancestor when the
        // last section cannot reach the top. Only move the reading viewport.
        if (focus) section.focus({ preventScroll: true });
        viewport.scrollTo({
          top: Math.max(
            0,
            Math.min(top, viewport.scrollHeight - viewport.clientHeight),
          ),
        });
        scheduleUpdate();
      };
      const restoreFragment = () => {
        if (mobile.matches) return;
        const section = sections.find(
          (candidate) => `#${candidate.id}` === window.location.hash,
        );
        if (section) scrollToSection(section);
      };
      links.forEach((link) => {
        link.addEventListener("click", (event) => {
          if (
            mobile.matches ||
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          )
            return;
          const section = sections.find(
            (candidate) =>
              candidate.dataset.projectSection === link.dataset.projectAnchor,
          );
          if (!section) return;
          event.preventDefault();
          if (window.location.hash !== link.hash)
            window.history.pushState(null, "", link.hash);
          scrollToSection(section, true);
        });
      });

      window.addEventListener("scroll", scheduleUpdate, { passive: true });
      viewport.addEventListener("scroll", scheduleUpdate, { passive: true });
      mobile.addEventListener("change", scheduleUpdate);
      window.addEventListener("resize", scheduleUpdate);
      window.addEventListener("hashchange", () => {
        restoreFragment();
        scheduleUpdate();
      });
      window.addEventListener("popstate", restoreFragment);
      const observer = new ResizeObserver(scheduleUpdate);
      observer.observe(header);
      observer.observe(index);
      observer.observe(story);
      observer.observe(viewport);
      update();
      restoreFragment();
    });
};
