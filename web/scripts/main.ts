import "@fontsource-variable/instrument-sans/standard.css";
import "@fontsource-variable/instrument-sans/standard-italic.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "../styles/app.css";

import EmblaCarousel from "embla-carousel";
import {
  initializeProjectGalleries,
  initializeProjectImageViewer,
} from "./project-gallery";
import { initializeContactCopy } from "./contact";
import { initializeProjectStories } from "./project-story";
import { initializeScrollAreas } from "./scroll-area";

initializeContactCopy();
initializeProjectImageViewer();
initializeProjectGalleries();
initializeProjectStories();
initializeScrollAreas();

type Theme = "light" | "dark";
type ThemePreference = Theme | "system";

const themeStorageKey = "ui-theme";
const themePreferenceOrder: ThemePreference[] = ["system", "light", "dark"];
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
const themeButton = document.querySelector<HTMLButtonElement>(
  "[data-theme-toggle]",
);
const themeColor = document.querySelector<HTMLMetaElement>(
  'meta[name="theme-color"]',
);
const themeIcons = Array.from(
  document.querySelectorAll<HTMLLinkElement>("[data-theme-icon]"),
);

const isThemePreference = (value: string | undefined | null): value is ThemePreference =>
  value === "system" || value === "light" || value === "dark";

const readSavedThemePreference = (): ThemePreference => {
  const initializedPreference = document.documentElement.dataset.themePreference;
  if (isThemePreference(initializedPreference)) return initializedPreference;
  try {
    const savedPreference = localStorage.getItem(themeStorageKey);
    return isThemePreference(savedPreference) ? savedPreference : "system";
  } catch {
    return "system";
  }
};

const resolveTheme = (preference: ThemePreference): Theme =>
  preference === "system"
    ? systemTheme.matches
      ? "dark"
      : "light"
    : preference;

const preferenceLabel = (preference: ThemePreference) =>
  preference === "system"
    ? "SISTEMA"
    : preference === "light"
      ? "CLARO"
      : "ESCURO";

const applyTheme = (preference: ThemePreference) => {
  const theme = resolveTheme(preference);
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePreference = preference;

  if (themeButton) {
    const currentIndex = themePreferenceOrder.indexOf(preference);
    const nextPreference =
      themePreferenceOrder[(currentIndex + 1) % themePreferenceOrder.length];
    themeButton.textContent = `[${preferenceLabel(preference)}]`;
    themeButton.setAttribute(
      "aria-label",
      `Tema atual: ${preferenceLabel(preference).toLocaleLowerCase("pt-BR")}${preference === "system" ? ` (${preferenceLabel(theme).toLocaleLowerCase("pt-BR")})` : ""}. Ativar modo ${preferenceLabel(nextPreference).toLocaleLowerCase("pt-BR")}`,
    );
  }

  if (themeColor) themeColor.content = theme === "light" ? "#eee9de" : "#0a0a09";
  themeIcons.forEach((icon) => {
    icon.media = icon.dataset.themeIcon === theme ? "all" : "not all";
  });
};

const persistThemePreference = (preference: ThemePreference) => {
  try {
    if (preference === "system") localStorage.removeItem(themeStorageKey);
    else localStorage.setItem(themeStorageKey, preference);
  } catch {
    // The selected mode still works for this page when storage is unavailable.
  }
};

let activeThemePreference = readSavedThemePreference();
applyTheme(activeThemePreference);

themeButton?.addEventListener("click", () => {
  const currentIndex = themePreferenceOrder.indexOf(activeThemePreference);
  activeThemePreference =
    themePreferenceOrder[(currentIndex + 1) % themePreferenceOrder.length];
  applyTheme(activeThemePreference);
  persistThemePreference(activeThemePreference);
});

systemTheme.addEventListener("change", () => {
  if (activeThemePreference === "system") applyTheme(activeThemePreference);
});

let pauseCarousel = () => {};
const carouselRoot = document.querySelector<HTMLElement>("[data-carousel]");
const selectedProjectStorageKey = "selected-project";

const readSelectedProject = () => {
  try {
    return sessionStorage.getItem(selectedProjectStorageKey);
  } catch {
    return null;
  }
};

const rememberSelectedProject = (slug: string) => {
  if (!slug) return;
  try {
    sessionStorage.setItem(selectedProjectStorageKey, slug);
  } catch {
    return;
  }
};

if (carouselRoot) {
  const viewport = carouselRoot.querySelector<HTMLElement>(
    ".carousel__viewport",
  );
  const slides = Array.from(
    carouselRoot.querySelectorAll<HTMLElement>(".carousel__slide"),
  );
  const counter = carouselRoot.querySelector<HTMLElement>(
    "[data-carousel-counter]",
  );
  const playButton = carouselRoot.querySelector<HTMLButtonElement>(
    "[data-carousel-play]",
  );
  const previousButton = carouselRoot.querySelector<HTMLButtonElement>(
    "[data-carousel-prev]",
  );
  const nextButton = carouselRoot.querySelector<HTMLButtonElement>(
    "[data-carousel-next]",
  );
  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  );

  if (viewport && slides.length > 0) {
    const selectedProject = readSelectedProject();
    const restoredIndex = slides.findIndex(
      (slide) =>
        slide.querySelector<HTMLElement>("[data-project]")?.dataset.project ===
        selectedProject,
    );
    const initialIndex = restoredIndex >= 0 ? restoredIndex : 0;
    let autoplayRequested = !prefersReducedMotion.matches;
    const imageInterval = 2800;
    const temporaryPauseReasons = new Set<"hover" | "hidden">();
    let playbackTimer = 0;
    let phaseStartedAt = 0;
    let phaseRemaining = imageInterval;
    let activeImageIndex = 0;

    const carousel = EmblaCarousel(viewport, {
      align: "start",
      axis: "y",
      containScroll: false,
      direction: "ltr",
      duration: prefersReducedMotion.matches ? 0 : 28,
      loop: false,
      startIndex: initialIndex,
      watchFocus: false,
      watchResize: true,
    });

    let activeIndex = carousel.selectedScrollSnap();
    let lastPointerPosition: { x: number; y: number } | null = null;

    const suspendPointerPreview = (position?: { x: number; y: number }) => {
      if (position) lastPointerPosition = position;
      carouselRoot.removeAttribute("data-pointer-preview");
    };

    carouselRoot.addEventListener("pointermove", (event) => {
      if (event.pointerType === "touch") return;

      const position = { x: event.clientX, y: event.clientY };
      const pointerMoved =
        !lastPointerPosition ||
        position.x !== lastPointerPosition.x ||
        position.y !== lastPointerPosition.y;
      lastPointerPosition = position;

      if (pointerMoved) carouselRoot.setAttribute("data-pointer-preview", "");
    });

    const updateCarouselEdges = () => {
      carouselRoot.toggleAttribute(
        "data-scroll-end",
        carousel.canScrollNext(),
      );
      previousButton?.toggleAttribute("disabled", !carousel.canScrollPrev());
      nextButton?.toggleAttribute("disabled", !carousel.canScrollNext());
    };

    const projectImages = (slideIndex: number) =>
      Array.from(
        slides[slideIndex]?.querySelectorAll<HTMLImageElement>(
          "[data-project-image]",
        ) ?? [],
      );

    const activeImages = () => projectImages(activeIndex);

    const hydrateImage = (image: HTMLImageElement | undefined, eager = false) => {
      if (!image) return;
      if (eager) {
        image.loading = "eager";
        image.fetchPriority = "high";
      }
      if (!image.getAttribute("src") && image.dataset.src) {
        image.src = image.dataset.src;
      }
    };

    const prepareProjectImages = (slideIndex: number, imageIndex = 0) => {
      const images = projectImages(slideIndex);
      hydrateImage(images[imageIndex], true);
      hydrateImage(images[imageIndex + 1]);
    };

    const showProjectImage = (index: number) => {
      const images = activeImages();
      hydrateImage(images[index], true);
      hydrateImage(images[index + 1]);
      images.forEach((image, imageIndex) => {
        const current = imageIndex === index;
        image.classList.toggle("is-current", current);
        image.setAttribute("aria-hidden", String(!current));
      });
    };

    const updatePlayLabel = () => {
      if (!playButton) return;
      const temporarilyPaused = temporaryPauseReasons.size > 0;
      playButton.textContent = !autoplayRequested
        ? "[ ] REPRODUZIR"
        : temporarilyPaused
          ? "[ ] PAUSADO"
          : "[*] REPRODUZINDO";
      playButton.setAttribute(
        "aria-label",
        autoplayRequested ? "Pausar carrossel" : "Reproduzir carrossel",
      );
      playButton.setAttribute("aria-pressed", String(autoplayRequested));
    };

    const clearPlaybackTimer = () => {
      window.clearTimeout(playbackTimer);
      playbackTimer = 0;
    };

    const runPlaybackPhase = () => {
      phaseRemaining = imageInterval;
      const images = activeImages();
      if (activeImageIndex < images.length - 1) {
        activeImageIndex += 1;
        showProjectImage(activeImageIndex);
        schedulePlayback();
        return;
      }

      if (carousel.canScrollNext()) {
        carousel.scrollNext(true);
        return;
      }

      if (slides.length > 1) {
        carousel.scrollTo(0, true);
        return;
      }

      activeImageIndex = 0;
      showProjectImage(activeImageIndex);
      schedulePlayback();
    };

    function schedulePlayback(delay = phaseRemaining) {
      clearPlaybackTimer();
      if (!autoplayRequested || temporaryPauseReasons.size > 0) return;
      phaseRemaining = Math.max(1, delay);
      phaseStartedAt = performance.now();
      playbackTimer = window.setTimeout(runPlaybackPhase, phaseRemaining);
    }

    const pauseTemporarily = (reason: "hover" | "hidden") => {
      if (temporaryPauseReasons.has(reason)) return;
      if (temporaryPauseReasons.size === 0 && playbackTimer) {
        phaseRemaining = Math.max(
          1,
          phaseRemaining - (performance.now() - phaseStartedAt),
        );
        clearPlaybackTimer();
      }
      temporaryPauseReasons.add(reason);
      updatePlayLabel();
    };

    const resumeTemporarily = (reason: "hover" | "hidden") => {
      temporaryPauseReasons.delete(reason);
      if (temporaryPauseReasons.size === 0) schedulePlayback();
      updatePlayLabel();
    };

    pauseCarousel = () => {
      autoplayRequested = false;
      clearPlaybackTimer();
      updatePlayLabel();
    };

    const selectSlide = (index: number) => {
      suspendPointerPreview();
      activeIndex = index;
      slides.forEach((slide, slideIndex) => {
        const active = slideIndex === index;
        const next = slideIndex === index + 1;
        const visibleNext = slideIndex > index && slideIndex <= index + 2;
        const card = slide.querySelector<HTMLElement>("[data-project]");
        slide.classList.toggle("is-active", active);
        slide.classList.toggle("is-next", next);
        slide.classList.toggle("is-visible-next", visibleNext);
        card?.classList.toggle("is-active", active);
        const previousTab = card?.querySelector<HTMLButtonElement>(
          "[data-carousel-previous-tab]",
        );
        const hasPrevious = active && index > 0;
        if (previousTab) {
          const previousCard = slides[index - 1]?.querySelector<HTMLElement>(
            "[data-project]",
          );
          const previousIndex = previousCard?.dataset.projectIndex ?? "";
          const previousTitle =
            previousCard?.dataset.projectTitle ?? "projeto anterior";
          previousTab.hidden = !hasPrevious;
          previousTab.disabled = !hasPrevious;
          previousTab.tabIndex = hasPrevious ? 0 : -1;
          previousTab.setAttribute("aria-hidden", String(!hasPrevious));
          previousTab.setAttribute(
            "aria-label",
            hasPrevious
              ? `Voltar ao case ${previousIndex}: ${previousTitle}`
              : "Projeto anterior",
          );
          const previousIndexLabel = previousTab.querySelector<HTMLElement>(
            "[data-carousel-previous-index]",
          );
          if (previousIndexLabel) previousIndexLabel.textContent = previousIndex;
        }
        const selectLink = card?.querySelector<HTMLAnchorElement>(
          "[data-project-select]",
        );
        const projectTitle = card?.dataset.projectTitle ?? "projeto";
        selectLink?.setAttribute(
          "aria-label",
          active
            ? `Abrir projeto ${projectTitle}`
            : `Selecionar ${projectTitle}`,
        );
        const details = card?.querySelector<HTMLElement>(
          ".project-card__details",
        );
        details?.setAttribute("aria-hidden", String(!active));
        details?.toggleAttribute("inert", !active);
      });
      if (counter) {
        counter.textContent = `${String(index + 1).padStart(2, "0")} / ${String(slides.length).padStart(2, "0")}`;
      }
      carouselRoot.setAttribute(
        "data-visible-next",
        String(Math.min(2, slides.length - index - 1)),
      );
      carouselRoot.setAttribute("data-carousel-ready", "");
      updateCarouselEdges();
      activeImageIndex = 0;
      phaseRemaining = imageInterval;
      slides.forEach((slide, slideIndex) => {
        slide
          .querySelectorAll<HTMLImageElement>("[data-project-image]")
          .forEach((image, imageIndex) => {
            const current = imageIndex === 0;
            image.classList.toggle("is-current", current);
            image.setAttribute("aria-hidden", String(!current));
          });
      });
      prepareProjectImages(activeIndex);
      schedulePlayback();
    };

    carousel.on("select", () => {
      selectSlide(carousel.selectedScrollSnap());
    });
    carousel.on("reInit", () => {
      updateCarouselEdges();
      if (autoplayRequested)
        window.requestAnimationFrame(() => schedulePlayback());
    });
    selectSlide(carousel.selectedScrollSnap());
    updatePlayLabel();

    previousButton?.addEventListener("click", () => {
      pauseCarousel();
      carousel.scrollPrev(true);
    });

    nextButton?.addEventListener("click", () => {
      pauseCarousel();
      carousel.scrollNext(true);
    });

    carouselRoot
      .querySelectorAll<HTMLButtonElement>("[data-carousel-previous-tab]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          pauseCarousel();
          carousel.scrollPrev(true);
        });
      });

    let wheelDelta = 0;
    let wheelEndTimeout = 0;

    viewport.addEventListener(
      "wheel",
      (event) => {
        if (event.ctrlKey || Math.abs(event.deltaX) > Math.abs(event.deltaY))
          return;

        const forwards = event.deltaY > 0;
        const canScroll = forwards
          ? carousel.canScrollNext()
          : carousel.canScrollPrev();
        if (!canScroll) {
          wheelDelta = 0;
          return;
        }

        suspendPointerPreview({ x: event.clientX, y: event.clientY });
        event.preventDefault();
        wheelDelta += event.deltaY;
        window.clearTimeout(wheelEndTimeout);
        wheelEndTimeout = window.setTimeout(() => {
          const scrollDelta = wheelDelta;
          wheelDelta = 0;
          if (Math.abs(scrollDelta) < 18) return;

          pauseCarousel();
          scrollDelta > 0
            ? carousel.scrollNext(true)
            : carousel.scrollPrev(true);
        }, 360);
      },
      { passive: false },
    );

    playButton?.addEventListener("click", () => {
      if (autoplayRequested) {
        pauseCarousel();
        return;
      }
      autoplayRequested = true;
      schedulePlayback();
      updatePlayLabel();
    });

    carouselRoot.addEventListener("focusin", (event) => {
      if (event.target === playButton) return;
      pauseCarousel();
    });

    slides.forEach((slide) => {
      const card = slide.querySelector<HTMLElement>("[data-project]");
      card?.addEventListener("pointerenter", (event) => {
        if (
          event.pointerType !== "touch" &&
          card.classList.contains("is-active")
        ) {
          pauseTemporarily("hover");
        }
      });
      card?.addEventListener("pointerleave", (event) => {
        if (event.pointerType !== "touch") resumeTemporarily("hover");
      });
    });

    document.addEventListener("visibilitychange", () => {
      document.hidden
        ? pauseTemporarily("hidden")
        : resumeTemporarily("hidden");
    });

    prefersReducedMotion.addEventListener("change", () => {
      if (prefersReducedMotion.matches) pauseCarousel();
    });

    slides.forEach((slide, index) => {
      const card = slide.querySelector<HTMLElement>("[data-project]");
      if (!card) return;
      const selectLink = card.querySelector<HTMLAnchorElement>(
        "[data-project-select]",
      );
      let wasActiveOnPointerDown = false;

      selectLink?.addEventListener("pointerdown", () => {
        wasActiveOnPointerDown = activeIndex === index;
      });

      selectLink?.addEventListener("click", (event) => {
        const activatedByKeyboard = event.detail === 0;
        const shouldNavigate = activatedByKeyboard
          ? activeIndex === index
          : wasActiveOnPointerDown;
        wasActiveOnPointerDown = false;

        if (shouldNavigate) {
          pauseCarousel();
          rememberSelectedProject(card.dataset.project ?? "");
          return;
        }
        event.preventDefault();
        pauseCarousel();
        carousel.scrollTo(index, true);
      });

      card
        .querySelector("[data-project-link]")
        ?.addEventListener("click", () => {
          pauseCarousel();
          rememberSelectedProject(card.dataset.project ?? "");
        });
    });
  }
}

const panelLinks = Array.from(
  document.querySelectorAll<HTMLAnchorElement>("[data-panel-target]"),
);
const panels = Array.from(
  document.querySelectorAll<HTMLElement>("[data-panel]"),
);
const pageTitle = document.querySelector<HTMLElement>("[data-page-title]");
const siteShell = document.querySelector<HTMLElement>(".site-shell");
const fishMedia = document.querySelector<HTMLElement>("[data-fish-media]");
const fishVideo =
  fishMedia?.querySelector<HTMLVideoElement>("[data-fish-video]");
const fishPlayButton =
  document.querySelector<HTMLButtonElement>("[data-fish-play]");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let fishAutoplayAttempted = false;
let fishHasEnded = false;

const updateFishControl = (playing: boolean) => {
  if (!fishPlayButton) return;
  fishPlayButton.textContent = playing
    ? "[*] REPRODUZINDO"
    : "[ ] REPRODUZIR";
  fishPlayButton.setAttribute("aria-pressed", String(playing));
  fishPlayButton.setAttribute(
    "aria-label",
    playing
      ? "Pausar o vídeo ensaio"
      : "Reproduzir o vídeo ensaio desde o início",
  );
};

const showFishImage = () => {
  if (fishMedia) fishMedia.dataset.fishState = "image";
  updateFishControl(false);
};

const playFishVideo = async (restart = false) => {
  if (!fishMedia || !fishVideo) return;
  if (restart) {
    fishHasEnded = false;
    fishVideo.currentTime = 0;
  }

  fishVideo.muted = true;
  fishMedia.dataset.fishState = "loading";
  try {
    await fishVideo.play();
  } catch {
    showFishImage();
  }
};

const activateFishMedia = () => {
  if (!fishMedia || !fishVideo) return;
  if (fishHasEnded || reducedMotion.matches) {
    showFishImage();
    return;
  }

  if (!fishAutoplayAttempted) {
    fishAutoplayAttempted = true;
    void playFishVideo();
    return;
  }

  if (fishMedia.dataset.fishState === "video" && fishVideo.paused) {
    void playFishVideo();
  }
};

const deactivateFishMedia = () => {
  if (fishVideo && !fishVideo.paused) fishVideo.pause();
  showFishImage();
};

fishVideo?.addEventListener("playing", () => {
  if (fishMedia) fishMedia.dataset.fishState = "video";
  updateFishControl(true);
});

fishVideo?.addEventListener("pause", () => {
  if (!fishVideo.ended) showFishImage();
});

fishVideo?.addEventListener("ended", () => {
  fishHasEnded = true;
  showFishImage();
});

fishVideo?.addEventListener("error", showFishImage);

fishPlayButton?.addEventListener("click", () => {
  if (fishVideo && !fishVideo.paused) {
    fishVideo.pause();
    showFishImage();
    return;
  }
  void playFishVideo(true);
});

reducedMotion.addEventListener("change", () => {
  if (!reducedMotion.matches) return;
  deactivateFishMedia();
  showFishImage();
});

function showPanel(panelID: string, updateHistory = true) {
  const selectedPanel = panels.find((panel) => panel.id === panelID);
  if (!selectedPanel) return;
  if (panelID !== "case") pauseCarousel();
  panelID === "about" ? activateFishMedia() : deactivateFishMedia();
  siteShell?.classList.toggle("is-about-current", panelID === "about");
  if (pageTitle)
    pageTitle.textContent = selectedPanel.dataset.panelTitle ?? "Portfólio";

  panels.forEach((panel) => {
    const active = panel === selectedPanel;
    panel.hidden = !active;
    panel.classList.toggle("is-current", active);
  });

  panelLinks.forEach((link) => {
    const active = link.dataset.panelTarget === panelID;
    link.classList.toggle("is-current", active);
    active
      ? link.setAttribute("aria-current", "page")
      : link.removeAttribute("aria-current");
  });

  if (updateHistory) history.replaceState(null, "", `#${panelID}`);
}

panelLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    showPanel(link.dataset.panelTarget ?? "case");
  });
});

const initialPanel = window.location.hash.slice(1);
if (initialPanel) showPanel(initialPanel, false);
