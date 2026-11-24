// Copyright (c) 2026 rosa gus. SPDX-License-Identifier: GPL-3.0-only
import { skiBlizzardFlashAt } from "./ski-engine";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (value: number) => {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
};

export const blizzardFrame = (
  { age, duration }: { age: number; duration: number },
  reducedMotion: boolean,
) => {
  const lightAge = age - skiBlizzardFlashAt(duration);
  const attack = reducedMotion ? 0.16 : 0.065;
  const decay = reducedMotion ? 0.42 : 0.28;
  const flash =
    smooth(lightAge / attack) * (1 - smooth((lightAge - attack) / decay));
  return {
    strength: smooth(age / 4) * smooth((duration - age) / 5),
    flash: flash * (reducedMotion ? 0.35 : 1),
    windAge: reducedMotion ? 0 : age,
  };
};

type BlizzardFrame = ReturnType<typeof blizzardFrame>;

const fogTones = {
  light: [
    [188, 174, 194],
    [244, 235, 247],
  ],
  dark: [
    [119, 105, 129],
    [186, 175, 198],
  ],
} as const;
const fogTiles = new Map<keyof typeof fogTones, HTMLCanvasElement[]>();
const fogSurfaces = new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D>();
const tileWidth = 128;
const tileHeight = 80;
const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

const drawSurface = (width: number, height: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas.getContext("2d");
};

const tilesFor = (theme: keyof typeof fogTones) => {
  const cached = fogTiles.get(theme);
  if (cached) return cached;
  const tiles: HTMLCanvasElement[] = [];
  for (const [layer, [red, green, blue]] of fogTones[theme].entries()) {
    const surface = drawSurface(tileWidth, tileHeight);
    if (!surface) return;
    const image = surface.createImageData(tileWidth, tileHeight);
    for (let y = 0; y < tileHeight; y++) {
      const v = (y / tileHeight) * Math.PI * 2;
      for (let x = 0; x < tileWidth; x++) {
        const u = (x / tileWidth) * Math.PI * 2;
        // The frequencies wrap at the tile edge, so gusts can drift continuously.
        const cloud =
          0.5 +
          Math.sin(v * 2 - u + layer * 2.1) * 0.28 +
          Math.sin(v * 3 + u * 2 + layer * 1.6) * 0.14 +
          Math.sin(v * 5 - u * 3) * 0.08;
        const density = smooth((cloud - 0.12) / 0.79);
        const grain = (bayer[(y % 4) * 4 + (x % 4)] - 7.5) * 0.005;
        const index = (y * tileWidth + x) * 4;
        image.data[index] = red;
        image.data[index + 1] = green;
        image.data[index + 2] = blue;
        image.data[index + 3] = Math.round(
          clamp01(0.06 + density * (0.77 + grain)) * 255,
        );
      }
    }
    surface.putImageData(image, 0, 0);
    tiles.push(surface.canvas);
  }
  fogTiles.set(theme, tiles);
  return tiles;
};

const fogSurfaceFor = (canvas: HTMLCanvasElement) => {
  const width = Math.ceil(canvas.width / 3);
  const height = Math.ceil(canvas.height / 3);
  let surface = fogSurfaces.get(canvas);
  if (
    !surface ||
    surface.canvas.width !== width ||
    surface.canvas.height !== height
  ) {
    surface = drawSurface(width, height) ?? undefined;
    if (surface) fogSurfaces.set(canvas, surface);
  }
  return surface;
};

const sightAhead = (speed: number) => Math.max(160, speed * 0.65);

export const blizzardSceneryOpacity = (
  x: number,
  y: number,
  downhillSpeed: number,
  { strength, flash }: BlizzardFrame,
) => {
  // Keep obstacles on the skier's path readable until there is time to react.
  const side = smooth((Math.abs(x) - 80) / 175);
  const depth = smooth(Math.max(y - sightAhead(downhillSpeed), -y - 48) / 120);
  const fade = 1 - (1 - side) * (1 - depth);
  return 1 - fade * strength * (0.58 - 0.18 * flash);
};

export const drawBlizzardHaze = (
  context: CanvasRenderingContext2D,
  player: { x: number; y: number },
  downhillSpeed: number,
  { strength, flash, windAge }: BlizzardFrame,
  dark: boolean,
) => {
  const tiles = tilesFor(dark ? "dark" : "light");
  const fog = fogSurfaceFor(context.canvas);
  if (!tiles || !fog) return;
  const { width, height } = fog.canvas;
  const worldWidth = context.canvas.width;
  const worldHeight = context.canvas.height;
  const scaleX = width / worldWidth;
  const scaleY = height / worldHeight;
  fog.clearRect(0, 0, width, height);
  for (const [layer, tile] of tiles.entries()) {
    const span = Math.round(width * (layer === 0 ? 1.35 : 1.1));
    const gust = windAge + Math.sin(windAge * 1.7 + layer) * 0.15;
    const offset = Math.round(
      (gust * (layer === 0 ? 76 : 158) * scaleX + span) % span,
    );
    fog.globalAlpha = layer === 0 ? 0.9 : 0.66;
    fog.drawImage(tile, offset - span, 0, span, height);
    fog.drawImage(tile, offset, 0, span, height);
  }

  // Thin the passing sheets gently over the path instead of cutting an opening.
  const ahead = sightAhead(downhillSpeed);
  fog.save();
  fog.globalAlpha = 1;
  fog.globalCompositeOperation = "destination-out";
  fog.translate(player.x * scaleX, (player.y + ahead * 0.2 - 20) * scaleY);
  fog.scale(Math.min(worldWidth * 0.4, 240) * scaleX, (ahead + 60) * scaleY);
  const clearance = fog.createRadialGradient(0, 0, 0, 0, 0, 1);
  clearance.addColorStop(0, "rgba(0,0,0,0.96)");
  clearance.addColorStop(0.38, "rgba(0,0,0,0.88)");
  clearance.addColorStop(0.7, "rgba(0,0,0,0.43)");
  clearance.addColorStop(1, "rgba(0,0,0,0)");
  fog.fillStyle = clearance;
  fog.fillRect(-1, -1, 2, 2);
  fog.restore();

  if (flash > 0) {
    fog.save();
    fog.globalCompositeOperation = "source-atop";
    const glow = fog.createLinearGradient(0, 0, width * 0.6, height * 0.65);
    glow.addColorStop(0, "rgba(251, 243, 255, 0.58)");
    glow.addColorStop(1, "rgba(251, 243, 255, 0.05)");
    fog.globalAlpha = flash;
    fog.fillStyle = glow;
    fog.fillRect(0, 0, width, height);
    fog.restore();
  }
  context.globalAlpha = strength * (1 - flash * 0.12);
  context.drawImage(fog.canvas, 0, 0, worldWidth, worldHeight);
  context.globalAlpha = 1;
};

export const drawLightning = (
  context: CanvasRenderingContext2D,
  flash: number,
) => {
  if (flash <= 0) return;
  const { width, height } = context.canvas;
  const light = context.createLinearGradient(0, 0, 0, height);
  light.addColorStop(0, "rgba(255, 248, 255, 0.3)");
  light.addColorStop(1, "rgba(255, 248, 255, 0.025)");
  context.fillStyle = light;
  context.globalAlpha = flash;
  context.fillRect(0, 0, width, height);
  context.globalAlpha = 1;
};

const fraction = (value: number) => value - Math.floor(value);
const farFlakes = 78;
const nearFlakes = 32;
const flakes = Array.from({ length: farFlakes + nearFlakes }, (_, index) => ({
  x: fraction((index + 1) * 0.618034),
  y: fraction((index + 1) * 0.414214),
  drift: fraction((index + 1) * 0.732051),
}));

export const drawBlizzardSnow = (
  context: CanvasRenderingContext2D,
  age: number,
  strength: number,
  flash: number,
  dark: boolean,
  foreground: boolean,
  reducedMotion: boolean,
) => {
  const { width, height } = context.canvas;
  const first = foreground ? farFlakes : 0;
  const count = foreground ? nearFlakes : farFlakes;
  const visible = Math.round(count * strength * (reducedMotion ? 0.4 : 1));
  const motionAge = reducedMotion ? 0 : age;
  const gust = motionAge + Math.sin(motionAge * 2.1) * 0.22;
  const highlights = flash > 0 && foreground;
  context.fillStyle = dark ? "#e9dfea" : "#857889";
  context.globalAlpha = (foreground ? 0.56 : 0.3) * strength;
  if (highlights) context.beginPath();
  for (let index = first; index < first + visible; index++) {
    const flake = flakes[index];
    const speed = (foreground ? 175 : 80) + flake.drift * 55;
    const x = Math.round(fraction(flake.x + (gust * speed) / width) * width);
    const y = Math.round(
      fraction(flake.y + (motionAge * (foreground ? 40 : 17)) / height) *
        height,
    );
    const length = foreground
      ? 3 + Math.round(flake.drift * 6)
      : 1 + Math.round(flake.drift * 3);
    context.fillRect(x, y, length, foreground && flake.drift > 0.78 ? 2 : 1);
    if (highlights) context.rect(x, y - 1, 2, 1);
  }
  if (highlights) {
    context.globalAlpha = flash * 0.8;
    context.fillStyle = "#fff8ff";
    context.fill();
  }
  context.globalAlpha = 1;
};
