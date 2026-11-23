// Copyright (c) 2026 rosa gus. SPDX-License-Identifier: GPL-3.0-only
type YetiRunSprites = Record<"yeti-run-01" | "yeti-run-02", HTMLImageElement>;

const SCALE = 2;
const STRIDE_DURATION = 1 / 3;
const HEAD_LEFT = 8;
const HEAD_RIGHT = 20;
const SHOULDER_ROW = 10;
const JAW_ROW = 16;
const HIP_ROW = 26;

export const yetiBlinkOpacity = (age: number) =>
  0.36 * Math.max(0, Math.min(age / 0.04, (0.17 - age) / 0.13));

export const yetiStride = (age: number) => {
  const stride = Math.floor(age / STRIDE_DURATION);
  const beat = age - stride * STRIDE_DURATION;
  const plantDuration = stride % 2 === 0 ? 0.22 : 0.19;
  return { stride, quickStep: beat - plantDuration };
};

export const drawYetiRun = (
  context: CanvasRenderingContext2D,
  sprites: YetiRunSprites,
  x: number,
  y: number,
  age: number,
  direction: number,
) => {
  const { quickStep } = yetiStride(age);
  const image = sprites[quickStep >= 0 ? "yeti-run-02" : "yeti-run-01"];
  const { width, height } = image;
  const left = Math.round(x - (width * SCALE) / 2);
  const top = Math.round(y - height * SCALE);

  if (quickStep < -0.04) {
    context.drawImage(image, left, top, width * SCALE, height * SCALE);
    return;
  }

  // Compress at the end of the long plant, then throw the shoulders ahead of the head.
  const lunging = quickStep >= 0 && quickStep < 0.075;
  const headCaughtUp = quickStep >= 0.04;
  const bodyX = lunging ? direction : 0;
  const bodyY = quickStep < 0 ? 1 : lunging ? -1 : 0;
  const headX = headCaughtUp ? direction : 0;
  const headY = headCaughtUp ? -1 : 0;
  const drawPart = (
    sx: number,
    sy: number,
    w: number,
    h: number,
    dx = 0,
    dy = 0,
  ) => {
    context.drawImage(
      image,
      sx,
      sy,
      w,
      h,
      left + (sx + dx) * SCALE,
      top + (sy + dy) * SCALE,
      w * SCALE,
      h * SCALE,
    );
  };

  // Overlap the joins by one source pixel and keep the lower body on the contact line.
  drawPart(0, HIP_ROW, width, height - HIP_ROW);
  drawPart(0, JAW_ROW, width, HIP_ROW - JAW_ROW + 1, bodyX, bodyY);
  const shoulderHeight = JAW_ROW - SHOULDER_ROW + 1;
  drawPart(0, SHOULDER_ROW, HEAD_LEFT + 1, shoulderHeight, bodyX, bodyY);
  drawPart(
    HEAD_RIGHT - 1,
    SHOULDER_ROW,
    width - HEAD_RIGHT + 1,
    shoulderHeight,
    bodyX,
    bodyY,
  );
  drawPart(HEAD_LEFT, 0, HEAD_RIGHT - HEAD_LEFT, JAW_ROW + 1, headX, headY);
};
