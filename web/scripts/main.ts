import "@fontsource-variable/instrument-sans/standard.css";
import "@fontsource-variable/instrument-sans/standard-italic.css";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "../styles/app.css";

import {
  initializeProjectGalleries,
  initializeProjectImageViewer,
} from "./project-gallery";
import { initializeContactCopy } from "./contact";
import { initializeAboutStudy } from "./about-study";
import { initializeProjectStories } from "./project-story";
import { initializeScrollAreas } from "./scroll-area";
import { initializeProjectArchive } from "./project-archive";
import { initializePanelNavigation } from "./panel-navigation";

initializeContactCopy();
initializeAboutStudy();
initializeProjectImageViewer();
initializeProjectGalleries();
initializeProjectStories();
initializeScrollAreas();
const projectArchive = initializeProjectArchive();

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

const isThemePreference = (
  value: string | undefined | null,
): value is ThemePreference =>
  value === "system" || value === "light" || value === "dark";

const readSavedThemePreference = (): ThemePreference => {
  const initializedPreference =
    document.documentElement.dataset.themePreference;
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

  if (themeColor)
    themeColor.content = theme === "light" ? "#eee9de" : "#0a0a09";
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

const aboutMedia = document.querySelector<HTMLElement>("[data-about-media]");
const aboutVideo =
  aboutMedia?.querySelector<HTMLVideoElement>("[data-about-video]");
const aboutPlayButton =
  document.querySelector<HTMLButtonElement>("[data-about-play]");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let aboutAutoplayAttempted = false;
let aboutHasEnded = false;
let aboutMediaActive = false;
let aboutPlayRequest = 0;
let aboutIntroTimer: number | undefined;
let aboutRevealTimer: number | undefined;

const clearAboutIntro = () => {
  window.clearTimeout(aboutIntroTimer);
  window.clearTimeout(aboutRevealTimer);
  aboutIntroTimer = undefined;
  aboutRevealTimer = undefined;
};

const updateAboutControl = (playing: boolean) => {
  if (!aboutPlayButton) return;
  aboutPlayButton.textContent = playing ? "[*] REPRODUZINDO" : "[ ] REPRODUZIR";
  aboutPlayButton.setAttribute("aria-pressed", String(playing));
  aboutPlayButton.setAttribute(
    "aria-label",
    playing
      ? "Pausar o vídeo ensaio"
      : "Reproduzir o vídeo ensaio desde o início",
  );
};

const showAboutImage = () => {
  aboutPlayRequest += 1;
  clearAboutIntro();
  if (aboutMedia) aboutMedia.dataset.aboutState = "image";
  updateAboutControl(false);
};

const showPausedAboutVideo = () => {
  aboutPlayRequest += 1;
  clearAboutIntro();
  if (aboutMedia && aboutMedia.dataset.aboutState !== "image") {
    aboutMedia.dataset.aboutState =
      aboutVideo && aboutVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
        ? "paused"
        : "image";
  }
  updateAboutControl(false);
};

const playAboutVideo = async (restart = false) => {
  if (!aboutMedia || !aboutVideo) return;
  clearAboutIntro();
  const request = ++aboutPlayRequest;
  if (restart) {
    aboutHasEnded = false;
    aboutVideo.currentTime = 0;
  }

  aboutVideo.muted = true;
  aboutMedia.dataset.aboutState = "loading";
  try {
    // Confirm playback permission before committing to the opening effect.
    await aboutVideo.play();
    if (request !== aboutPlayRequest || !aboutMediaActive) return;
    updateAboutControl(true);
    if (reducedMotion.matches) {
      aboutMedia.dataset.aboutState = "video";
      return;
    }

    aboutMedia.dataset.aboutState = "intro";
    aboutIntroTimer = window.setTimeout(() => {
      aboutMedia.dataset.aboutState = "revealing";
      aboutRevealTimer = window.setTimeout(() => {
        aboutMedia.dataset.aboutState = "video";
        clearAboutIntro();
      }, 400);
    }, 250);
  } catch {
    if (request === aboutPlayRequest) showAboutImage();
  }
};

const activateAboutMedia = () => {
  if (!aboutMedia || !aboutVideo) return;
  aboutMediaActive = true;
  if (reducedMotion.matches) {
    showAboutImage();
    return;
  }
  if (aboutHasEnded) {
    showPausedAboutVideo();
    return;
  }

  if (!aboutAutoplayAttempted) {
    aboutAutoplayAttempted = true;
    void playAboutVideo();
  }
};

const deactivateAboutMedia = () => {
  aboutMediaActive = false;
  if (aboutVideo && !aboutVideo.paused) aboutVideo.pause();
  showPausedAboutVideo();
};

aboutVideo?.addEventListener("playing", () => {
  if (!aboutMediaActive) {
    aboutVideo.pause();
    showPausedAboutVideo();
  }
});

aboutVideo?.addEventListener("pause", () => {
  if (!aboutVideo.ended) showPausedAboutVideo();
});

aboutVideo?.addEventListener("ended", () => {
  aboutHasEnded = true;
  showPausedAboutVideo();
});

aboutVideo?.addEventListener("error", showAboutImage);

aboutPlayButton?.addEventListener("click", () => {
  if (aboutVideo && !aboutVideo.paused) {
    aboutVideo.pause();
    showPausedAboutVideo();
    return;
  }
  void playAboutVideo(true);
});

reducedMotion.addEventListener("change", () => {
  if (!reducedMotion.matches) return;
  if (aboutVideo && !aboutVideo.paused) aboutVideo.pause();
  showAboutImage();
});

initializePanelNavigation({
  onChange: (panelID) => {
    if (panelID !== "case") projectArchive.close(false, true);
    if (panelID === "about") activateAboutMedia();
    else deactivateAboutMedia();
  },
});
