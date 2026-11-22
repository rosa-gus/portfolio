// Copyright (c) 2026 rosa gus. SPDX-License-Identifier: GPL-3.0-only
const NECK_ROW = 10;
const WAIST_ROW = 20;
const POLE_MARGIN = 4;
const SCALE = 2;

export type SkiPose = {
  body: HTMLCanvasElement;
  poles: HTMLCanvasElement;
  pivots: [number, number];
};

/** Keep the original pose and its palette, separating pole pixels once at load time. */
export const prepareSkierPose = (sprite: HTMLImageElement): SkiPose | null => {
  const { width, height } = sprite;
  const body = document.createElement("canvas");
  const poles = document.createElement("canvas");
  body.width = poles.width = width;
  body.height = poles.height = height;
  const bodyContext = body.getContext("2d");
  const poleContext = poles.getContext("2d");
  if (!bodyContext || !poleContext) return null;

  bodyContext.drawImage(sprite, 0, 0);
  const bodyPixels = bodyContext.getImageData(0, 0, width, height);
  const polePixels = poleContext.createImageData(width, height);
  const { data } = bodyPixels;
  const pixel = (x: number, y: number) => (y * width + x) * 4;
  // Column 1 meets the basket of the left pole in every gliding pose. Sample it
  // from the bottom because the shade varies between poses and themes.
  let sampleY = height - 1;
  while (sampleY >= 0 && data[pixel(1, sampleY) + 3] === 0) sampleY--;
  if (sampleY < 0) return null;
  const sample = pixel(1, sampleY);
  const poleColor = data.slice(sample, sample + 4);
  const pivots: [number, number] = [height, height];

  for (const side of [0, 1] as const) {
    const start = side === 0 ? 0 : width - POLE_MARGIN;
    for (let y = 0; y < height; y++) {
      for (let x = start; x < start + POLE_MARGIN; x++) {
        const index = pixel(x, y);
        if (!poleColor.every((channel, offset) => channel === data[index + offset])) continue;
        polePixels.data.set(poleColor, index);
        data[index + 3] = 0;
        pivots[side] = Math.min(pivots[side], y + 4);
      }
    }
  }
  if (pivots.includes(height)) return null;
  bodyContext.putImageData(bodyPixels, 0, 0);
  poleContext.putImageData(polePixels, 0, 0);
  return { body, poles, pivots };
};

export const drawSkierPose = (context: CanvasRenderingContext2D, pose: SkiPose, x: number, y: number, elapsed: number, lean: number) => {
  const { body, poles, pivots } = pose;
  const { width, height } = body;
  const left = Math.round(x - width * SCALE / 2);
  const top = Math.round(y - height * SCALE);
  const cycle = elapsed * Math.PI * 2 * 1.25;
  const shoulderX = Math.round(lean * 1.25);
  const liftThreshold = 0.42 + Math.abs(lean) * 0.3;
  const shoulderY = Math.sin(cycle) > liftThreshold ? -1 : 0;
  const headY = Math.sin(cycle - 0.65) > liftThreshold ? -1 : 0;
  const swing = Math.round(Math.sin(cycle - 0.5));
  const drawPart = (layer: HTMLCanvasElement, sx: number, sy: number, w: number, h: number, dx = 0, dy = 0) => {
    context.drawImage(layer, sx, sy, w, h, left + (sx + dx) * SCALE, top + (sy + dy) * SCALE, w * SCALE, h * SCALE);
  };

  for (const side of [0, 1] as const) {
    const sx = side === 0 ? 0 : width - POLE_MARGIN;
    const pivot = pivots[side];
    // Keep the grip with the arm, and overlap one row where the shaft swings.
    drawPart(poles, sx, 0, POLE_MARGIN, pivot + 1, shoulderX, shoulderY);
    drawPart(poles, sx, pivot, POLE_MARGIN, height - pivot, shoulderX + (side === 0 ? swing : -swing), shoulderY);
  }
  // The shared neck and waist rows keep the outline connected through the lift.
  drawPart(body, 0, WAIST_ROW, width, height - WAIST_ROW);
  drawPart(body, 0, NECK_ROW, width, WAIST_ROW - NECK_ROW + 1, shoulderX, shoulderY);
  drawPart(body, 0, 0, width, NECK_ROW + 1, shoulderX, headY);
};
