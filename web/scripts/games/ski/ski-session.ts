// Copyright (c) 2026 rosa gus. SPDX-License-Identifier: GPL-3.0-only
import "../../../styles/components/game-metadata.css";
import "../../../styles/components/ski-game.css";
import { SkiEngine, SKI_STEP, SKI_MAX_HEADING } from "./ski-engine";
import { drawSki, loadSkiSprites, type SkiSprites, type SkiTheme } from "./ski-renderer";
import { SKI_CAPTURE_CONTACT, SKI_CAPTURE_DURATION, SkiFeedback } from "./ski-feedback";
import { createSkiAudio } from "./ski-audio";
import { storageKey } from "../../storage";
import { fitWindowMedia } from "../../window-layout";

const TAP_DISTANCE = 8;
const TAP_DURATION = 250;

/** Browser lifecycle, input, and persistence. Simulation lives in ski-engine. */
export const createSkiSession = (dialog: HTMLDialogElement) => {
  const canvas = dialog.querySelector<HTMLCanvasElement>("[data-ski-canvas]")!;
  const board = dialog.querySelector<HTMLElement>("[data-ski-board]")!;
  const spriteBanks = new Map<SkiTheme, SkiSprites>();
  const loadingThemes = new Set<SkiTheme>();
  let sprites: SkiSprites | undefined;
  const portraitViewport = matchMedia("(max-width: 620px) and (any-pointer: coarse)");
  const viewportLayout = () => portraitViewport.matches ? "portrait" : "landscape";
  let game = new SkiEngine(Math.random, viewportLayout());
  const sizeBoard = () => {
    canvas.width = game.width;
    canvas.height = game.height;
    board.style.setProperty("--window-aspect", `${game.width} / ${game.height}`);
    dialog.classList.toggle("ski-game--portrait", game.layout === "portrait");
    fitWindowMedia(dialog);
  };
  const applyViewportLayout = () => {
    const layout = viewportLayout();
    if (game.layout === layout) return false;
    game = new SkiEngine(Math.random, layout);
    sizeBoard();
    return true;
  };
  sizeBoard();
  const feedback = new SkiFeedback();
  const audio = createSkiAudio();
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const touchControls = matchMedia("(any-pointer: coarse)");
  const toggle = dialog.querySelector<HTMLButtonElement>("[data-ski-toggle]")!;
  const restart = dialog.querySelector<HTMLButtonElement>("[data-ski-restart]")!;
  const message = dialog.querySelector<HTMLElement>("[data-ski-message]")!;
  const messageText = dialog.querySelector<HTMLElement>("[data-ski-message-text]")!;
  const intro = dialog.querySelector<HTMLElement>("[data-ski-intro]")!;
  const gameOverText = dialog.querySelector<HTMLElement>("[data-ski-game-over]")!;
  const results = dialog.querySelector<HTMLElement>("[data-ski-results]")!;
  const resultScore = dialog.querySelector<HTMLElement>("[data-ski-result-score]")!;
  const resultDistance = dialog.querySelector<HTMLElement>("[data-ski-result-distance]")!;
  const resultNearMisses = dialog.querySelector<HTMLElement>("[data-ski-result-near-misses]")!;
  const resultRecord = dialog.querySelector<HTMLElement>("[data-ski-result-record]")!;
  const resultBest = dialog.querySelector<HTMLElement>("[data-ski-result-best]")!;
  const resultRecordLabel = dialog.querySelector<HTMLElement>("[data-ski-result-record-label]")!;
  const distance = dialog.querySelector<HTMLElement>("[data-ski-distance]")!;
  const record = dialog.querySelector<HTMLElement>("[data-ski-best]")!;
  const formatResult = new Intl.NumberFormat("pt-BR", { useGrouping: true });
  const score = dialog.querySelector<HTMLElement>("[data-ski-score]")!;
  const sound = dialog.querySelector<HTMLButtonElement>("[data-ski-sound]")!;
  const touchInstructions = dialog.querySelector<HTMLElement>("[data-ski-touch-instructions]")!;
  const updateTouchInstructions = () => { touchInstructions.hidden = !touchControls.matches; };
  updateTouchInstructions();
  touchControls.addEventListener("change", updateTouchInstructions);
  let muted = false;
  const keys = new Set<string>();
  const bestKey = storageKey("ski-best-distance");
  const bestScoreKey = storageKey("ski-best-score");
  const readRecord = (key: string) => {
    try {
      const saved = Number(localStorage.getItem(key));
      if (Number.isSafeInteger(saved) && saved >= 0) return saved;
    } catch { /* Records still work in memory. */ }
    return 0;
  };
  let best = readRecord(bestKey);
  let storedBest = best;
  let bestScore = readRecord(bestScoreKey);
  let storedBestScore = bestScore;
  let runBestScore = bestScore;
  let frame = 0;
  let previous = 0;
  let accumulator = 0;
  let pointer: {
    id: number;
    heading?: number;
    touch?: { x: number; y: number; width: number; heading: number; started: number; moved: boolean };
  } | null = null;
  let downhillRequested = false;
  let usingKeyboard = false;
  const available = () => dialog.open && !dialog.inert && !document.hidden;
  const setText = (element: HTMLElement, value: string) => { if (element.textContent !== value) element.textContent = value; };
  const capturing = () => game.phase === "over" && feedback.endAge + 1e-6 < SKI_CAPTURE_DURATION;
  const persist = () => {
    best = Math.max(best, Math.floor(game.distance));
    bestScore = Math.max(bestScore, game.score);
    try {
      if (best > storedBest) { localStorage.setItem(bestKey, String(best)); storedBest = best; }
      if (bestScore > storedBestScore) { localStorage.setItem(bestScoreKey, String(bestScore)); storedBestScore = bestScore; }
    } catch { /* Storage is optional. */ }
  };
  const render = () => {
    if (!sprites) return;
    best = Math.max(best, Math.floor(game.distance));
    bestScore = Math.max(bestScore, game.score);
    const balanceHint = touchControls.matches && !usingKeyboard ? "toque na pista." : "pressione ↓ / S.";
    drawSki(canvas, game, sprites, feedback, balanceHint, reducedMotion.matches);
    setText(distance, `${String(Math.floor(game.distance)).padStart(4, "0")} m`);
    setText(record, `${String(best).padStart(4, "0")} m`);
    setText(score, String(game.score).padStart(4, "0"));
    const labels = { ready: "Uma pista pela frente.", running: "", paused: "Descida pausada", over: "Fim da descida. Alguém alcançou você." };
    const showResults = game.phase === "over" && !capturing();
    board.classList.toggle("is-playing", game.phase === "running");
    message.hidden = game.phase === "running" || capturing();
    message.classList.toggle("is-over", game.phase === "over");
    message.classList.toggle("is-ready", game.phase === "ready");
    message.classList.toggle("is-paused", game.phase === "paused");
    intro.hidden = game.phase !== "ready";
    messageText.hidden = game.phase === "ready" || game.phase === "over";
    gameOverText.hidden = !showResults;
    results.hidden = !showResults;
    setText(messageText, labels[game.phase]);
    if (showResults) {
      setText(resultScore, formatResult.format(game.score));
      setText(resultDistance, `${formatResult.format(Math.floor(game.distance))} m`);
      setText(resultNearMisses, formatResult.format(game.nearMisses));
      const improvement = game.score - runBestScore;
      setText(resultBest, improvement > 0 ? `+${formatResult.format(improvement)}` : formatResult.format(bestScore));
      setText(resultRecordLabel, improvement > 0 ? "Novo recorde" : "Melhor pontuação");
      resultRecord.classList.toggle("is-new-record", improvement > 0);
    }
    const actions = { ready: "[INICIAR]", running: "[PAUSAR]", paused: "[CONTINUAR]", over: "[NOVA DESCIDA]" };
    setText(toggle, actions[game.phase]);
    toggle.disabled = capturing();
    restart.hidden = game.phase === "ready" || game.phase === "over";
  };
  const updateReadyLayout = () => {
    if (game.phase === "ready" && available() && applyViewportLayout()) render();
  };
  portraitViewport.addEventListener("change", updateReadyLayout);
  const currentTheme = (): SkiTheme => getComputedStyle(document.documentElement).colorScheme === "dark" ? "dark" : "light";
  const refreshSprites = () => {
    if (!dialog.open || dialog.inert) return;
    const theme = currentTheme();
    const cached = spriteBanks.get(theme);
    if (cached) {
      sprites = cached;
      render();
      return;
    }
    if (loadingThemes.has(theme)) return;
    if (!sprites) setText(messageText, "Preparando a descida…");
    loadingThemes.add(theme);
    void loadSkiSprites(dialog.dataset.skiAssets!, theme).then(bank => {
      spriteBanks.set(theme, bank);
      if (dialog.open && !dialog.inert && currentTheme() === theme) {
        sprites = bank;
        render();
      }
    }).catch(() => {
      if (!sprites && dialog.open && !dialog.inert && currentTheme() === theme) {
        setText(messageText, "Não foi possível carregar. Feche e tente novamente.");
      }
    }).finally(() => { loadingThemes.delete(theme); });
  };
  const clearInput = () => {
    keys.clear(); pointer = null; downhillRequested = false;
  };
  const stop = () => {
    cancelAnimationFrame(frame); frame = 0; previous = 0; accumulator = 0;
    audio.stop();
  };
  const pause = () => {
    stop(); clearInput(); game.pause();
    if (game.phase === "over") feedback.endAge = Math.max(SKI_CAPTURE_DURATION, feedback.endAge);
    persist(); render();
  };
  const input = () => {
    const left = keys.has("ArrowLeft") || keys.has("a");
    const right = keys.has("ArrowRight") || keys.has("d");
    return {
      steer: Number(right) - Number(left),
      heading: pointer?.heading,
      downhill: downhillRequested || keys.has("ArrowDown") || keys.has("s"),
    };
  };
  const loop = (now: number) => {
    frame = 0;
    if (!available() || (game.phase !== "running" && game.phase !== "over")) { pause(); return; }
    if (previous) accumulator += Math.min((now - previous) / 1000, 0.1);
    previous = now;
    while (accumulator >= SKI_STEP) {
      if (game.phase === "running") {
        const before = game.distance;
        game.tick(input());
        if (game.player.heading === 0) downhillRequested = false;
        feedback.step(game, (game.distance - before) / 0.16, SKI_STEP, game.events);
        if ((game.phase as string) === "over") {
          audio.capture(SKI_CAPTURE_CONTACT);
          clearInput(); persist();
        } else {
          audio.events(game.events);
        }
      } else {
        feedback.step(game, 0, SKI_STEP, []);
      }
      accumulator -= SKI_STEP;
    }
    audio.update(game, feedback.carve);
    render();
    if (game.phase === "running" || capturing()) frame = requestAnimationFrame(loop);
    else { clearInput(); persist(); }
  };
  const play = () => {
    if (!sprites || !available() || capturing()) return;
    if (game.phase === "running") { pause(); return; }
    audio.unlock();
    stop(); clearInput();
    if (game.phase === "over" || game.phase === "ready") {
      applyViewportLayout();
      feedback.reset(); runBestScore = bestScore;
    }
    game.start(); render();
    canvas.focus({ preventScroll: true });
    frame = requestAnimationFrame(loop);
  };
  toggle.addEventListener("click", play);
  restart.addEventListener("click", () => {
    if (!available()) return;
    stop(); persist();
    if (!applyViewportLayout()) game.reset();
    play();
  });
  sound.addEventListener("click", () => {
    if (!sprites) return;
    muted = !muted;
    audio.setMuted(muted);
    if (!muted) audio.unlock();
    sound.setAttribute("aria-pressed", String(muted));
    setText(sound, muted ? "[SOM DESLIGADO]" : "[SOM LIGADO]");
  });
  dialog.addEventListener("popup:closing", pause);
  dialog.addEventListener("window:help", pause);
  dialog.addEventListener("close", pause);
  window.addEventListener("blur", pause);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
    else updateReadyLayout();
  });
  dialog.addEventListener("keydown", event => {
    if (!available() || event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (["ArrowLeft", "ArrowRight", "ArrowDown", "a", "d", "s"].includes(key)) {
      event.preventDefault(); keys.add(key);
      usingKeyboard = true;
      if (key !== "ArrowDown" && key !== "s") downhillRequested = false;
    } else if ([" ", "Enter"].includes(key) && !(event.target instanceof Element && event.target.closest("button"))) {
      event.preventDefault(); if (!event.repeat) play();
    }
  });
  dialog.addEventListener("keyup", event => keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key));
  const pointerHeading = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const dx = (event.clientX - rect.left) * game.width / rect.width - game.player.x;
    const dy = (event.clientY - rect.top) * game.height / rect.height - game.player.y;
    return Math.atan2(dx, Math.max(0, dy));
  };
  board.addEventListener("pointerdown", event => {
    if (!available() || game.phase !== "running" || pointer || !event.isPrimary || event.button !== 0) return;
    const { width } = canvas.getBoundingClientRect();
    if (width <= 0) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    if (event.pointerType === "touch") {
      usingKeyboard = false;
      pointer = { id: event.pointerId, touch: { x: event.clientX, y: event.clientY, width,
        heading: game.player.heading, started: event.timeStamp, moved: false } };
    } else {
      downhillRequested = false;
      pointer = { id: event.pointerId, heading: pointerHeading(event) };
    }
    board.setPointerCapture(event.pointerId);
  });
  board.addEventListener("pointermove", event => {
    if (pointer?.id !== event.pointerId) return;
    const touch = pointer.touch;
    if (!touch) { pointer.heading = pointerHeading(event); return; }
    const dx = event.clientX - touch.x;
    touch.moved ||= Math.hypot(dx, event.clientY - touch.y) >= TAP_DISTANCE;
    if (Math.abs(dx) < TAP_DISTANCE && pointer.heading === undefined) return;
    downhillRequested = false;
    const target = touch.heading + dx / touch.width * 2 * SKI_MAX_HEADING;
    pointer.heading = Math.max(-SKI_MAX_HEADING, Math.min(SKI_MAX_HEADING, target));
  });
  const release = (event: PointerEvent) => { if (pointer?.id === event.pointerId) pointer = null; };
  board.addEventListener("pointerup", event => {
    if (pointer?.id !== event.pointerId) return;
    const touch = pointer.touch;
    if (touch && !touch.moved && event.timeStamp - touch.started <= TAP_DURATION
        && Math.hypot(event.clientX - touch.x, event.clientY - touch.y) < TAP_DISTANCE) {
      downhillRequested = true;
    }
    release(event);
  });
  board.addEventListener("pointercancel", release);
  board.addEventListener("lostpointercapture", release);
  board.addEventListener("contextmenu", event => {
    if (game.phase === "running" && (touchControls.matches || (event instanceof PointerEvent && event.pointerType === "touch"))) {
      event.preventDefault();
    }
  });
  new MutationObserver(refreshSprites).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style"] });
  return { open: () => {
    if (game.phase === "ready") applyViewportLayout();
    refreshSprites();
  } };
};
