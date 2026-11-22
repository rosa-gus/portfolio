// Copyright (c) 2026 rosa gus. SPDX-License-Identifier: GPL-3.0-only
import { SKI_HEIGHT, SKI_WIDTH, type SkiEngine } from "./ski-engine";
import type { SkiFeedback } from "./ski-feedback";

const names = ["skier-down", "skier-left", "skier-right", "pine", "rock", "tracks", "yeti-idle", "yeti-run-01", "yeti-run-02"] as const;
type Sprite = typeof names[number];
type Theme = "light" | "dark";
type Sprites = Record<Theme, Record<Sprite, HTMLImageElement>>;

export const loadSkiSprites = async (base: string): Promise<Sprites> => {
  const sprites = { light: {}, dark: {} } as Sprites;
  await Promise.all((["light", "dark"] as const).flatMap(theme => names.map(async name => {
    const image = new Image();
    image.src = `${base}/${theme}/${name}.png`;
    await image.decode();
    sprites[theme][name] = image;
  })));
  return sprites;
};

/** Scene presentation only. All positions and progression come from the engine. */
export const drawSki = (canvas: HTMLCanvasElement, game: SkiEngine, sprites: Sprites, feedback: SkiFeedback, reducedMotion = false) => {
  const context = canvas.getContext("2d");
  if (!context) return;
  const style = getComputedStyle(canvas);
  const dark = getComputedStyle(document.documentElement).colorScheme === "dark";
  const bank = sprites[dark ? "dark" : "light"];
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, SKI_WIDTH, SKI_HEIGHT);
  context.fillStyle = style.getPropertyValue("--ski-track-tone").trim();
  for (const trail of game.trails) {
    const dx = Math.round(Math.cos(trail.heading) * 9);
    const dy = Math.round(Math.sin(trail.heading) * 9);
    // Rasterize short angled tracks on integer pixels, without rotating the art.
    for (const side of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        context.fillRect(Math.round(trail.x + side * dx + Math.sin(trail.heading) * i),
          Math.round(trail.y - side * dy + Math.cos(trail.heading) * i), 1, 1);
      }
    }
  }
  const draw = (name: Sprite, x: number, y: number) => {
    const image = bank[name];
    context.drawImage(image, Math.round(x - image.width), Math.round(y - image.height * 2), image.width * 2, image.height * 2);
  };
  const scene: { y: number; render: () => void }[] = game.objects.map(object => ({
    y: object.y,
    render: () => draw(object.kind, object.x, object.y),
  }));
  scene.push({ y: game.player.y, render: () => {
    if (game.phase === "over" && feedback.endAge > 0.18) return;
    if (game.stumble > 0) context.globalAlpha = 0.75;
    const wobble = reducedMotion ? 0 : Math.sin(game.elapsed * 48) * feedback.impact * 12;
    draw(game.player.heading < -0.15 ? "skier-right" : game.player.heading > 0.15 ? "skier-left" : "skier-down", game.player.x + wobble, game.player.y);
    context.globalAlpha = 1;
  } });
  if (game.yeti) {
    const enemy = game.yeti;
    scene.push({ y: enemy.y, render: () => draw(game.phase === "over" ? "yeti-idle" : Math.floor(enemy.age * 6) % 2 ? "yeti-run-02" : "yeti-run-01", enemy.x, enemy.y) });
  }
  if (feedback.retreat) {
    const enemy = feedback.retreat;
    scene.push({ y: enemy.y, render: () => {
      context.globalAlpha = Math.max(0, 1 - enemy.age / 0.8);
      draw("yeti-idle", enemy.x, enemy.y);
      context.globalAlpha = 1;
    } });
  }
  scene.sort((a, b) => a.y - b.y).forEach(item => item.render());
  if (!reducedMotion) {
    context.fillStyle = style.getPropertyValue("--ski-snow-tone").trim();
    for (const particle of feedback.snow) {
      context.globalAlpha = Math.min(1, (1 - particle.age / particle.life) * 2);
      context.fillRect(Math.round(particle.x), Math.round(particle.y), particle.size, particle.size);
    }
    context.globalAlpha = 1;
  }
  context.font = `500 13px ${style.getPropertyValue("--font-mono").trim() || "monospace"}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  for (const caption of feedback.captions) {
    context.globalAlpha = Math.min(1, (caption.life - caption.age) / 0.2);
    const y = Math.round(caption.y - (reducedMotion ? 0 : caption.age * 16));
    const width = context.measureText(caption.text).width + 16;
    context.fillStyle = style.getPropertyValue("--color-surface-canvas").trim();
    context.fillRect(Math.round(caption.x - width / 2), y - 12, Math.ceil(width), 24);
    context.fillStyle = style.getPropertyValue("--color-text-primary").trim();
    context.fillText(caption.text, Math.round(caption.x), y);
  }
  context.globalAlpha = 1;
};
