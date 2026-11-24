import "../../../styles/components/game-metadata.css";
import "../../../styles/components/snake-game.css";
import { SnakeEngine, type Cell, type Direction } from "./snake-engine";
import { createSnakeAudio } from "./snake-audio";
import { migrateStorageValue, storageKey } from "../../storage";
import { cancelWindowShake, shakeWindow } from "../../window-motion";

export const createSnakeGame = (dialog: HTMLDialogElement) => {
  const canvas = dialog.querySelector<HTMLCanvasElement>("[data-snake-canvas]");
  const context = canvas?.getContext("2d");
  const toggle = dialog.querySelector<HTMLButtonElement>("[data-snake-toggle]");
  const restart = dialog.querySelector<HTMLButtonElement>(
    "[data-snake-restart]",
  );
  const message = dialog.querySelector<HTMLElement>("[data-snake-message]");
  const messageText = dialog.querySelector<HTMLElement>(
    "[data-snake-message-text]",
  );
  const intro = dialog.querySelector<HTMLElement>("[data-snake-intro]");
  const score = dialog.querySelector<HTMLElement>("[data-snake-score]");
  const best = dialog.querySelector<HTMLElement>("[data-snake-best]");
  const sound = dialog.querySelector<HTMLButtonElement>("[data-snake-sound]");
  if (
    !canvas ||
    !context ||
    !toggle ||
    !restart ||
    !message ||
    !messageText ||
    !intro ||
    !score ||
    !best ||
    !sound
  ) {
    throw new Error("Snake window is incomplete");
  }
  const game = new SnakeEngine();
  let timer = 0;
  let highScore = 0;
  let muted = false;
  const audio = createSnakeAudio();
  const highScoreKey = storageKey("snake-highscore");
  try {
    const saved = Number(sessionStorage.getItem(highScoreKey));
    if (Number.isInteger(saved) && saved >= 0 && saved < 400) highScore = saved;
  } catch {
    /* Storage is optional. */
  }
  try {
    const saved = Number(
      migrateStorageValue(
        sessionStorage,
        highScoreKey,
        "snake-high-score",
        localStorage,
      ),
    );
    if (Number.isInteger(saved) && saved >= 0 && saved < 400) highScore = saved;
  } catch {
    /* The session record remains available if local storage is blocked. */
  }

  const render = () => {
    const style = getComputedStyle(canvas);
    const ink = style.color;
    const cell = canvas.width / game.size;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const square = (point: Cell, opacity: number) => {
      context.globalAlpha = opacity;
      context.fillStyle = ink;
      context.fillRect(
        point.x * cell + 1,
        point.y * cell + 1,
        cell - 2,
        cell - 2,
      );
    };
    game.body.forEach((point, index) => square(point, index === 0 ? 1 : 0.65));
    context.globalAlpha = 1;
    context.strokeStyle = ink;
    context.lineWidth = 2;
    if (game.food) {
      const { x, y, bonus } = game.food;
      if (bonus === 3)
        context.strokeRect(x * cell + 4, y * cell + 4, cell - 8, cell - 8);
      else {
        context.fillStyle = ink;
        context.fillRect(x * cell + 5, y * cell + 5, cell - 10, cell - 10);
      }
    }
    if (game.enemy) {
      const { x, y } = game.enemy;
      context.fillStyle = style.getPropertyValue("--snake-witch-tone").trim();
      context.beginPath();
      context.moveTo((x + 0.5) * cell, (y + 0.08) * cell);
      for (const [px, py] of [
        [0.78, 0.7],
        [0.95, 0.7],
        [0.95, 0.9],
        [0.05, 0.9],
        [0.05, 0.7],
        [0.22, 0.7],
      ]) {
        context.lineTo((x + px) * cell, (y + py) * cell);
      }
      context.closePath();
      context.fill();
      context.clearRect(
        (x + 0.3) * cell,
        (y + 0.56) * cell,
        cell * 0.4,
        cell * 0.07,
      );
    }
    dialog.classList.toggle(
      "has-witch",
      !!game.enemy &&
        (game.phase === "running" || game.phase === "paused") &&
        dialog.open &&
        !dialog.inert,
    );
    score.textContent = String(game.score).padStart(3, "0");
    if (game.score > highScore) {
      highScore = game.score;
      try {
        sessionStorage.setItem(highScoreKey, String(highScore));
      } catch {
        /* Keep the in-memory record. */
      }
    }
    best.textContent = String(highScore).padStart(3, "0");
    const labels = {
      ready: "Pronto para jogar?",
      running: "",
      paused: "Jogo pausado",
      over: "Fim de jogo",
      won: "Tabuleiro completo!",
    };
    message.hidden = game.phase === "running";
    message.classList.toggle("is-ready", game.phase === "ready");
    message.classList.toggle("is-paused", game.phase === "paused");
    intro.hidden = game.phase !== "ready";
    messageText.hidden = game.phase === "ready";
    if (messageText.textContent !== labels[game.phase])
      messageText.textContent = labels[game.phase];
    const actions = {
      ready: "[INICIAR]",
      running: "[PAUSAR]",
      paused: "[CONTINUAR]",
      over: "[JOGAR NOVAMENTE]",
      won: "[JOGAR NOVAMENTE]",
    };
    toggle.textContent = actions[game.phase];
    toggle.disabled = false;
    restart.hidden =
      game.phase === "ready" || game.phase === "over" || game.phase === "won";
  };

  const stop = () => {
    window.clearTimeout(timer);
    timer = 0;
  };
  const pause = () => {
    stop();
    audio.stop();
    cancelWindowShake(dialog);
    game.pause();
    render();
  };
  const schedule = () => {
    stop();
    if (game.phase !== "running" || !dialog.open || dialog.inert) return;
    timer = window.setTimeout(() => {
      for (const event of game.tick()) {
        if (event.type === "witch") {
          if (event.first) {
            void audio.play("witch");
          }
        } else {
          if (event.type === "death" && event.cause === "wall")
            shakeWindow(dialog);
          void audio.play(event.type);
        }
      }
      render();
      schedule();
    }, game.speed);
  };
  const play = () => {
    if (!dialog.open || dialog.inert) return;
    if (game.phase === "running") pause();
    else {
      audio.unlock();
      if (game.phase !== "paused") {
        audio.stop();
        cancelWindowShake(dialog);
      }
      game.start();
      render();
      canvas.focus({ preventScroll: true });
      schedule();
    }
  };
  dialog.addEventListener("popup:closing", () => {
    pause();
    dialog.classList.remove("has-witch");
  });
  dialog.addEventListener("close", pause);
  dialog.addEventListener("window:help", pause);
  window.addEventListener("blur", pause);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
  });
  toggle.addEventListener("click", play);
  restart.addEventListener("click", () => {
    stop();
    audio.stop();
    cancelWindowShake(dialog);
    game.reset();
    play();
  });
  sound.addEventListener("click", () => {
    muted = !muted;
    audio.setMuted(muted);
    if (!muted) audio.unlock();
    sound.setAttribute("aria-pressed", String(muted));
    sound.textContent = muted ? "[SOM DESLIGADO]" : "[SOM LIGADO]";
  });
  sound.disabled = false;
  dialog
    .querySelectorAll<HTMLButtonElement>("[data-snake-direction]")
    .forEach((button) => {
      button.addEventListener("click", () =>
        game.turn(button.dataset.snakeDirection as Direction),
      );
    });
  const keys: Record<string, Direction> = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    w: "up",
    s: "down",
    a: "left",
    d: "right",
  };
  dialog.addEventListener("keydown", (event) => {
    if (
      !dialog.open ||
      dialog.inert ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    const direction = keys[event.key] ?? keys[event.key.toLowerCase()];
    if (direction) {
      event.preventDefault();
      game.turn(direction);
    } else if (
      (event.key === " " || event.key === "Enter") &&
      !(event.target instanceof Element && event.target.closest("button"))
    ) {
      event.preventDefault();
      if (!event.repeat) play();
    }
  });
  new MutationObserver(() => {
    if (dialog.open) render();
  }).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme", "style"],
  });
  return { open: render };
};
