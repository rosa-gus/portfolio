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
import { initializeProjectStories } from "./project-story";
import { initializeScrollAreas } from "./scroll-area";
import { initializeProjectArchive } from "./project-archive";

initializeContactCopy();
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
  if (panelID !== "case") projectArchive.close(false, true);
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
