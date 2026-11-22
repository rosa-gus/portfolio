// Copyright (c) 2026 rosa gus. SPDX-License-Identifier: GPL-3.0-only
import { SkiEngine, SKI_STEP, SKI_WIDTH, SKI_HEIGHT } from "./ski-engine";
import { drawSki, loadSkiSprites } from "./ski-renderer";
import { SkiFeedback } from "./ski-feedback";
import { createSkiAudio } from "./ski-audio";
import { storageKey } from "../../storage";

/** Browser lifecycle, input, and persistence. Simulation lives in ski-engine. */
export const createSkiSession = async (dialog: HTMLDialogElement) => {
  const canvas = dialog.querySelector<HTMLCanvasElement>("[data-ski-canvas]")!;
  const sprites = await loadSkiSprites(dialog.dataset.skiAssets!);
  const game = new SkiEngine();
  const feedback = new SkiFeedback();
  const audio = createSkiAudio();
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const toggle = dialog.querySelector<HTMLButtonElement>("[data-ski-toggle]")!;
  const restart = dialog.querySelector<HTMLButtonElement>("[data-ski-restart]")!;
  const message = dialog.querySelector<HTMLElement>("[data-ski-message]")!;
  const messageText = dialog.querySelector<HTMLElement>("[data-ski-message-text]")!;
  const intro = dialog.querySelector<HTMLElement>("[data-ski-intro]")!;
  const resultVersion = dialog.querySelector<HTMLElement>("[data-ski-result-version]")!;
  const gameOverText = dialog.querySelector<HTMLElement>("[data-ski-game-over]")!;
  const results = dialog.querySelector<HTMLElement>("[data-ski-results]")!;
  const resultScore = dialog.querySelector<HTMLElement>("[data-ski-result-score]")!;
  const resultDistance = dialog.querySelector<HTMLElement>("[data-ski-result-distance]")!;
  const resultNearMisses = dialog.querySelector<HTMLElement>("[data-ski-result-near-misses]")!;
  const resultBest = dialog.querySelector<HTMLElement>("[data-ski-result-best]")!;
  const resultRecordLabel = dialog.querySelector<HTMLElement>("[data-ski-result-record-label]")!;
  const distance = dialog.querySelector<HTMLElement>("[data-ski-distance]")!;
  const record = dialog.querySelector<HTMLElement>("[data-ski-best]")!;
  const score = dialog.querySelector<HTMLElement>("[data-ski-score]")!;
  const sound = dialog.querySelector<HTMLButtonElement>("[data-ski-sound]")!;
  let muted = false;
  const keys = new Set<string>();
  const touches = new Map<number, string>();
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
  let pointer: { id: number; heading: number } | null = null;
  const available = () => dialog.open && !dialog.inert && !document.hidden;
  const setText = (element: HTMLElement, value: string) => { if (element.textContent !== value) element.textContent = value; };
  const persist = () => {
    best = Math.max(best, Math.floor(game.distance));
    bestScore = Math.max(bestScore, game.score);
    try {
      if (best > storedBest) { localStorage.setItem(bestKey, String(best)); storedBest = best; }
      if (bestScore > storedBestScore) { localStorage.setItem(bestScoreKey, String(bestScore)); storedBestScore = bestScore; }
    } catch { /* Storage is optional. */ }
  };
  const render = () => {
    best = Math.max(best, Math.floor(game.distance));
    bestScore = Math.max(bestScore, game.score);
    drawSki(canvas, game, sprites, feedback, reducedMotion.matches);
    setText(distance, `${String(Math.floor(game.distance)).padStart(4, "0")} m`);
    setText(record, `${String(best).padStart(4, "0")} m`);
    setText(score, String(game.score).padStart(4, "0"));
    const labels = { ready: "Uma pista pela frente.", running: "", paused: "Descida pausada", over: "Fim da descida. Alguém alcançou você." };
    message.hidden = game.phase === "running" || (game.phase === "over" && feedback.endAge < 0.7);
    message.classList.toggle("is-over", game.phase === "over");
    message.classList.toggle("is-ready", game.phase === "ready");
    message.classList.toggle("is-paused", game.phase === "paused");
    intro.hidden = game.phase !== "ready";
    resultVersion.hidden = game.phase !== "over";
    messageText.hidden = game.phase === "ready" || game.phase === "over";
    gameOverText.hidden = game.phase !== "over";
    results.hidden = game.phase !== "over";
    setText(messageText, labels[game.phase]);
    if (game.phase === "over") {
      setText(resultScore, String(game.score));
      setText(resultDistance, `${Math.floor(game.distance)} m`);
      setText(resultNearMisses, String(game.nearMisses));
      setText(resultBest, String(bestScore));
      setText(resultRecordLabel, game.score > runBestScore ? "NOVO RECORDE" : "MELHOR PONTUAÇÃO");
    }
    const actions = { ready: "[INICIAR]", running: "[PAUSAR]", paused: "[CONTINUAR]", over: "[NOVA DESCIDA]" };
    setText(toggle, actions[game.phase]);
    toggle.disabled = false;
    restart.hidden = game.phase === "ready" || game.phase === "over";
  };
  const clearInput = () => {
    keys.clear(); touches.clear(); pointer = null;
    dialog.querySelectorAll("[data-ski-control]").forEach(button => button.classList.remove("is-pressed"));
  };
  const stop = () => {
    cancelAnimationFrame(frame); frame = 0; previous = 0; accumulator = 0;
    audio.stop();
  };
  const pause = () => {
    stop(); clearInput(); game.pause();
    if (game.phase === "over") feedback.endAge = Math.max(0.7, feedback.endAge);
    persist(); render();
  };
  const input = () => {
    const held = new Set([...keys, ...touches.values()]);
    const left = held.has("ArrowLeft") || held.has("a") || held.has("left");
    const right = held.has("ArrowRight") || held.has("d") || held.has("right");
    return {
      steer: Number(right) - Number(left),
      heading: pointer?.heading,
      downhill: held.has("ArrowDown") || held.has("s") || held.has("downhill"),
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
        feedback.step(game, (game.distance - before) / 0.16, SKI_STEP, game.events);
        audio.events(game.events);
        if ((game.phase as string) === "over") { audio.stop(); clearInput(); persist(); }
      } else {
        feedback.step(game, 0, SKI_STEP, []);
      }
      accumulator -= SKI_STEP;
    }
    audio.update(game, feedback.carve);
    render();
    if (game.phase === "running" || (game.phase === "over" && feedback.endAge < 1)) frame = requestAnimationFrame(loop);
    else { clearInput(); persist(); }
  };
  const play = () => {
    if (!available()) return;
    if (game.phase === "running") { pause(); return; }
    audio.unlock();
    stop(); clearInput();
    if (game.phase === "over" || game.phase === "ready") { feedback.reset(); runBestScore = bestScore; }
    game.start(); render();
    canvas.focus({ preventScroll: true });
    frame = requestAnimationFrame(loop);
  };
  toggle.addEventListener("click", play);
  restart.addEventListener("click", () => { stop(); persist(); game.reset(); feedback.reset(); play(); });
  sound.addEventListener("click", () => {
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
  document.addEventListener("visibilitychange", () => { if (document.hidden) pause(); });
  dialog.addEventListener("keydown", event => {
    if (!available() || event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (["ArrowLeft", "ArrowRight", "ArrowDown", "a", "d", "s"].includes(key)) {
      event.preventDefault(); keys.add(key);
    } else if ([" ", "Enter"].includes(key) && !(event.target instanceof Element && event.target.closest("button"))) {
      event.preventDefault(); if (!event.repeat) play();
    }
  });
  dialog.addEventListener("keyup", event => keys.delete(event.key.length === 1 ? event.key.toLowerCase() : event.key));
  const pointerHeading = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const dx = (event.clientX - rect.left) * SKI_WIDTH / rect.width - game.player.x;
    const dy = (event.clientY - rect.top) * SKI_HEIGHT / rect.height - game.player.y;
    return Math.atan2(dx, Math.max(0, dy));
  };
  canvas.addEventListener("pointerdown", event => {
    if (!available() || game.phase !== "running" || !event.isPrimary || event.button !== 0) return;
    event.preventDefault(); canvas.focus({ preventScroll: true });
    pointer = { id: event.pointerId, heading: pointerHeading(event) }; canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", event => { if (pointer?.id === event.pointerId) pointer.heading = pointerHeading(event); });
  const release = (event: PointerEvent) => { if (pointer?.id === event.pointerId) pointer = null; };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("lostpointercapture", release);
  dialog.querySelectorAll<HTMLButtonElement>("[data-ski-control]").forEach(button => {
    button.addEventListener("pointerdown", event => {
      if (game.phase !== "running" || !available() || event.button !== 0) return;
      event.preventDefault(); touches.set(event.pointerId, button.dataset.skiControl!);
      button.classList.add("is-pressed"); button.setPointerCapture(event.pointerId);
    });
    const up = (event: PointerEvent) => { touches.delete(event.pointerId); button.classList.remove("is-pressed"); };
    button.addEventListener("pointerup", up);
    button.addEventListener("pointercancel", up);
    button.addEventListener("lostpointercapture", up);
  });
  new MutationObserver(() => { if (dialog.open) render(); }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style"] });
  return { open: render };
};
