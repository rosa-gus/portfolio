// Copyright (c) 2026 rosa gus. SPDX-License-Identifier: GPL-3.0-only
import { SKI_MAX_HEADING, SKI_METERS_PER_PIXEL, SKI_TRAIL_LIFETIME, SKI_YETI_GLIMPSE_DURATION, type SkiEngine } from "./ski-engine";
import { SKI_CAPTURE_CONTACT, SKI_CAPTURE_DURATION, type SkiFeedback } from "./ski-feedback";
import { drawSkierPose, prepareSkierPose, type SkiPose } from "./ski-skier";
import { drawSkiTerrain } from "./ski-terrain";
import { drawYetiRun } from "./ski-yeti";

const glidingNames = [
  "skier-front", "skier-left", "skier-right",
  "skier-diagonal-left", "skier-diagonal-left-01", "skier-diagonal-left-02",
  "skier-diagonal-right", "skier-diagonal-right-01", "skier-diagonal-right-02",
] as const;
const names = [
  ...glidingNames,
  "skier-stumble-left", "skier-stumble-right", "skier-fall-left", "skier-fall-right",
  "skier-recover-left", "skier-recover-right",
  "shadow-pine", "shadow-rock", "shadow-skis",
  "pine", "rock", "tracks", "yeti-glimpse", "yeti-idle", "yeti-run-01", "yeti-run-02",
] as const;
type Sprite = typeof names[number];
type GlidingSprite = typeof glidingNames[number];
export type SkiTheme = "light" | "dark";
export type SkiSprites = {
  images: Record<Sprite, HTMLImageElement>;
  poses: Record<GlidingSprite, SkiPose | null>;
};

export const loadSkiSprites = async (base: string, theme: SkiTheme): Promise<SkiSprites> => {
  const images = {} as SkiSprites["images"];
  await Promise.all(names.map(async name => {
    const image = new Image();
    image.src = `${base}/${theme}/${name}.png`;
    await image.decode();
    images[name] = image;
  }));
  const poses = {} as SkiSprites["poses"];
  for (const name of glidingNames) poses[name] = prepareSkierPose(images[name]);
  return { images, poses };
};

const glidingSprite = (signedHeading: number, stride: number, reducedMotion: boolean): GlidingSprite => {
  const heading = Math.abs(signedHeading);
  if (heading <= 0.15) return "skier-front";
  const side = signedHeading < 0 ? "left" : "right";
  // The original lateral poses face opposite to their filenames.
  if (heading >= SKI_MAX_HEADING - 0.08) return side === "left" ? "skier-right" : "skier-left";
  if (reducedMotion || heading < Math.PI * 0.28) return `skier-diagonal-${side}`;
  return `skier-diagonal-${side}-${stride < 0.5 ? "01" : "02"}`;
};

const drawWindSnow = (context: CanvasRenderingContext2D, grains: SkiFeedback["windSnow"], color: string, opacity: number) => {
  context.fillStyle = color;
  for (const grain of grains) {
    if (grain.age <= 0) continue;
    const life = grain.age / grain.life;
    const length = Math.round(2 + (2 + 3 * life) * grain.strength);
    const x = Math.round(grain.x);
    const y = Math.round(grain.y);
    context.globalAlpha = Math.min(life * 5, 1, (1 - life) * 2.3) * grain.strength * 0.38 * opacity;
    context.fillRect(grain.vx > 0 ? x - length + 1 : x, y, length, 1);
    if (length > 5) {
      context.globalAlpha *= 0.35;
      context.fillRect(grain.vx > 0 ? x - length - 2 : x + length + 1, y, 2, 1);
    }
  }
  context.globalAlpha = 1;
};

const drawSkiTrails = (context: CanvasRenderingContext2D, game: SkiEngine, groove: string, ridge: string) => {
  const last = game.trails.at(-1);
  const liveTip = last && last.age > 0 && game.skisOnSnow && game.phase !== "over"
    ? { ...last, x: game.player.x, y: game.player.y - 4, heading: game.player.heading, age: 0, connected: true }
    : undefined;

  for (let index = 0; index <= game.trails.length; index++) {
    const trail = game.trails[index] ?? liveTip;
    if (!trail) break;
    const previous = trail.connected ? game.trails[index - 1] : undefined;
    const turn = trail.heading - (previous?.heading ?? trail.heading);
    const distance = previous ? Math.hypot(trail.x - previous.x, trail.y - previous.y) : 0;
    const pressure = Math.min(1, Math.abs(turn) * 55 / Math.max(1, distance));
    const acrossX = Math.cos(trail.heading);
    const acrossY = -Math.sin(trail.heading);
    const previousAcrossX = previous ? Math.cos(previous.heading) : acrossX;
    const previousAcrossY = previous ? -Math.sin(previous.heading) : acrossY;
    const horizontalEdge = Math.abs(acrossX) >= Math.abs(acrossY);
    const seed = previous?.tick ?? trail.tick;
    context.globalAlpha = 1 - (trail.age / SKI_TRAIL_LIFETIME) ** 1.35;

    for (const side of [-1, 1]) {
      const load = side === -Math.sign(turn) ? pressure : 0;
      const endX = Math.round(trail.x + side * acrossX * 9);
      const endY = Math.round(trail.y + side * acrossY * 9);
      const startX = Math.round(previous ? previous.x + side * previousAcrossX * 9 : endX + acrossY * 3);
      const startY = Math.round(previous ? previous.y + side * previousAcrossY * 9 : endY - acrossX * 3);
      const dx = endX - startX;
      const dy = endY - startY;
      const steps = Math.max(Math.abs(dx), Math.abs(dy));
      const edgeX = horizontalEdge ? side * Math.sign(acrossX) : 0;
      const edgeY = horizontalEdge ? 0 : side * Math.sign(acrossY);

      // Draw on integer pixels and group the grain into short, stable patches.
      for (let step = previous ? 1 : 0; step <= steps; step++) {
        const x = startX + Math.round(dx * step / steps);
        const y = startY + Math.round(dy * step / steps);
        const grain = Math.imul((seed * 31 + Math.floor(step / 3) * 17) ^ side, 0x9e3779b9);
        const texture = ((grain ^ (grain >>> 16)) >>> 24) / 256;
        context.fillStyle = groove;
        context.fillRect(x, y, 1, 1);
        if (texture < 0.3 + load * 0.45) {
          context.fillRect(x + edgeX, y + edgeY, 1, 1);
        }
        if (texture < 0.12 + load * 0.45) {
          context.fillStyle = ridge;
          context.fillRect(x + edgeX * 2, y + edgeY * 2, 1, 1);
        }
      }
    }
  }
  context.globalAlpha = 1;
};

/** Scene presentation only. All positions and progression come from the engine. */
export const drawSki = (canvas: HTMLCanvasElement, game: SkiEngine, { images, poses }: SkiSprites, feedback: SkiFeedback, balanceHint: string, reducedMotion = false) => {
  const context = canvas.getContext("2d");
  if (!context) return;
  const style = getComputedStyle(canvas);
  context.imageSmoothingEnabled = false;
  context.clearRect(0, 0, game.width, game.height);
  if (!reducedMotion) {
    drawSkiTerrain(context, game.width, game.height, game.distance / SKI_METERS_PER_PIXEL,
      style.getPropertyValue("--ski-terrain-shadow-tone").trim(), style.getPropertyValue("--ski-terrain-highlight-tone").trim());
  }
  if (!reducedMotion && feedback.windSnow.length) {
    drawWindSnow(context, feedback.windSnow, style.getPropertyValue("--ski-wind-tone").trim(),
      Math.max(0, 1 - feedback.endAge / SKI_CAPTURE_DURATION));
  }
  drawSkiTrails(context, game, style.getPropertyValue("--ski-track-tone").trim(),
    style.getPropertyValue("--ski-track-ridge-tone").trim());
  const draw = (name: Sprite, x: number, y: number, anchorY = images[name].height) => {
    const image = images[name];
    context.drawImage(image, Math.round(x - image.width), Math.round(y - anchorY * 2), image.width * 2, image.height * 2);
  };
  const ending = game.phase === "over";
  const captured = ending && feedback.endAge >= SKI_CAPTURE_CONTACT;
  const wobble = !reducedMotion && game.balance?.pose === "stumble"
    ? Math.sin(game.elapsed * 48) * feedback.impact * 12 : 0;
  const playerX = game.player.x + wobble;
  // The contact line sits three source pixels below the top of each shadow.
  for (const { kind, x, y } of game.objects) {
    if (kind !== "tracks") draw(`shadow-${kind}`, x, y, 3);
  }
  draw("shadow-skis", playerX, game.player.y, 3);
  const scene: { y: number; render: () => void }[] = game.objects.map(object => ({
    y: object.y,
    render: () => draw(object.kind, object.x, object.y),
  }));
  if (game.glimpse) {
    const peek = game.glimpse;
    const tree = game.objects.find(object => object.id === peek.treeId);
    if (tree) scene.push({ y: tree.y - 0.1, render: () => {
      // Draw before the anchor tree so its branches conceal part of the face.
      context.globalAlpha = Math.max(0, Math.min(1, peek.age / 0.12, (SKI_YETI_GLIMPSE_DURATION - peek.age) / 0.18));
      draw("yeti-glimpse", tree.x + peek.side * 19, tree.y - 3);
      context.globalAlpha = 1;
    } });
  }
  scene.push({ y: game.player.y, render: () => {
    if (!captured) {
      if (game.balance) {
        draw(`skier-${game.balance.pose}-${game.balance.side}`, playerX, game.player.y);
        return;
      }
      const name = glidingSprite(game.player.heading, feedback.stride, reducedMotion);
      const pose = poses[name];
      if (pose && !reducedMotion && (game.phase === "running" || game.phase === "paused")) {
        drawSkierPose(context, pose, playerX, game.player.y, game.elapsed, feedback.skierLean);
      } else {
        draw(name, playerX, game.player.y);
      }
      return;
    }
    const front = images["skier-front"];
    const x = Math.round(playerX);
    const y = Math.round(game.player.y);
    // The bottom rows of the front sprite contain the ski tips.
    context.drawImage(front, 7, 28, 3, 4, x - 13, y - 7, 6, 8);
    context.drawImage(front, 14, 28, 3, 4, x + 7, y - 11, 6, 8);
  } });
  if (game.yeti) {
    const enemy = game.yeti;
    const approach = ending && !reducedMotion ? Math.min(1, feedback.endAge / SKI_CAPTURE_CONTACT) : 0;
    const settle = captured && !reducedMotion
      ? Math.min(1, (feedback.endAge - SKI_CAPTURE_CONTACT) / (SKI_CAPTURE_DURATION - SKI_CAPTURE_CONTACT)) : 0;
    const direction = Math.sign(game.player.x - enemy.x) || 1;
    const x = enemy.x + (game.player.x - enemy.x) * approach + direction * settle * 11;
    const y = enemy.y + (game.player.y + 4 - enemy.y) * approach - settle * 15;
    // At contact the yeti overlaps the skier, then the skier's skis remain in front.
    scene.push({ y: ending && !captured && !reducedMotion && approach > 0.85 ? game.player.y + 1 : y,
      render: () => {
        if (captured || reducedMotion) draw("yeti-idle", x, y);
        else drawYetiRun(context, images, x, y, enemy.age + (ending ? feedback.endAge : 0), direction);
      } });
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
  const drawCaption = (text: string, x: number, y: number, opacity: number) => {
    context.globalAlpha = opacity;
    context.fillStyle = style.getPropertyValue("--color-text-primary").trim();
    context.fillText(text, Math.round(x), y);
  };
  for (const caption of feedback.captions) {
    const y = Math.round(caption.y - (reducedMotion ? 0 : caption.age * 16));
    drawCaption(caption.text, caption.x, y, Math.min(1, (caption.life - caption.age) / 0.2));
  }
  if (game.phase === "running" && game.balance?.pose === "stumble" && !game.balance.corrected) {
    const x = Math.max(100, Math.min(game.width - 100, game.player.x));
    drawCaption(balanceHint, x, game.player.y + 17, 1);
  }
  context.globalAlpha = 1;
};
