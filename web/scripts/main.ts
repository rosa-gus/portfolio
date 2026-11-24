import "@fontsource-variable/instrument-sans/standard.css";
import "@fontsource-variable/instrument-sans/standard-italic.css";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "../styles/fonts.css";
import "../styles/app.css";

import {
  initializeProjectGalleries,
  initializeProjectImageViewer,
} from "./project-gallery";
import { initializeTooltips } from "./tooltip";
import { initializeContactCopy } from "./contact";
import { initializeAboutStudy } from "./about-study";
import { initializeProjectStories } from "./project-story";
import { initializeScrollAreas } from "./scroll-area";
import { initializeProjectArchive } from "./project-archive";
import { initializePanelNavigation } from "./panel-navigation";
import { initializeDocuments } from "./documents";
import { initializeGameCredits } from "./game-credits";
import { initializeWindows } from "./windows";
import { migrateStorageValue, storageKey } from "./storage";
import { initializeSociety } from "./society";

initializeTooltips();
initializeContactCopy();
initializeAboutStudy();
initializeProjectImageViewer();
initializeProjectGalleries();
initializeProjectStories();
initializeScrollAreas();
const projectArchive = initializeProjectArchive();
initializeDocuments();
initializeGameCredits();
const windows = initializeWindows({
  beforeOpen: () => projectArchive.close(false, true),
  loadFeatures: {
    "ski-game": () => import("./games/ski/ski-session").then(({ createSkiSession }) => createSkiSession),
    "snake-game": () => import("./games/snake/snake-game").then(({ createSnakeGame }) => createSnakeGame),
  },
});

type Theme = "light" | "dark";
type ThemePreference = Theme | "system";

const themeStorageKey = storageKey("ui-theme");
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
    const savedPreference = migrateStorageValue(localStorage, themeStorageKey, "ui-theme");
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
  if (aboutMedia) aboutMedia.dataset.aboutState = "image";
  updateAboutControl(false);
};

const showPausedAboutVideo = () => {
  aboutPlayRequest += 1;
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
  const request = ++aboutPlayRequest;
  if (restart) {
    aboutHasEnded = false;
    aboutVideo.currentTime = 0;
  }

  aboutVideo.muted = true;
  aboutMedia.dataset.aboutState = "loading";
  try {
    await aboutVideo.play();
    if (request !== aboutPlayRequest || !aboutMediaActive) return;
    aboutMedia.dataset.aboutState = "video";
    updateAboutControl(true);
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

const archiveOpenID = new URLSearchParams(window.location.search).get("open");
const initialArchiveItem = archiveOpenID
  ? Array.from(document.querySelectorAll<HTMLButtonElement>(
    "#case [data-archive-surface] button[data-archive-id]:is([data-window-trigger], [data-archive-folder], [data-archive-project])",
  )).find((item) =>
    item.dataset.archiveId === archiveOpenID && !item.disabled && !item.closest("[hidden]"),
  )
  : undefined;

let stopSociety: ReturnType<typeof initializeSociety>;

initializePanelNavigation({
  initialPanel: initialArchiveItem
    ? { id: "case", updateHistory: initialArchiveItem.hasAttribute("data-window-trigger") }
    : undefined,
  onChange: (panelID) => {
    if (panelID !== "case") {
      stopSociety?.();
      stopSociety = undefined;
      projectArchive.close(false, true);
      windows.close(false, true);
    }
    if (panelID === "about") activateAboutMedia();
    else deactivateAboutMedia();
    if (panelID === "case") stopSociety = initializeSociety();
  },
});

if (initialArchiveItem) {
  window.requestAnimationFrame(() => {
    if (initialArchiveItem.isConnected && !initialArchiveItem.closest("[hidden], [inert]")) {
      initialArchiveItem.click();
    }
  });
} else if (archiveOpenID && !document.querySelector(".site-shell")) {
  windows.openApp(archiveOpenID);
}
