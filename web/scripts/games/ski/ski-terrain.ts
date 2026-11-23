// Copyright (c) 2026 rosa gus. SPDX-License-Identifier: GPL-3.0-only
const SECTION_LENGTH = 1040;
const SECTION_FADE = 160;
const CELL_WIDTH = 96;
const CELL_HEIGHT = 56;
const sections = [
  "smooth",
  "swept",
  "rippled",
  "smooth",
  "rippled",
  "swept",
] as const;

const cellSeed = (row: number, column: number) => {
  const origin = Math.imul(row, 0x9e3779b1) ^ Math.imul(column, 0x85ebca6b);
  const mixed = Math.imul(origin ^ (origin >>> 16), 0x7feb352d);
  return (mixed ^ (mixed >>> 15)) >>> 0;
};

/** The marks belong to the slope, so their shape and color stay fixed as it scrolls. */
export const drawSkiTerrain = (
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  travel: number,
  shadow: string,
  highlight: string,
) => {
  const scroll = Math.round(travel);
  for (
    let row = Math.floor(scroll / CELL_HEIGHT);
    row * CELL_HEIGHT < scroll + height;
    row++
  ) {
    const stagger = row % 2 ? -CELL_WIDTH / 2 : 0;
    for (let column = 0; column * CELL_WIDTH + stagger < width; column++) {
      const seed = cellSeed(row, column);
      const chance = seed & 255;
      const x = column * CELL_WIDTH + stagger + 8 + ((seed >>> 8) & 31);
      const worldY = row * CELL_HEIGHT + 5 + ((seed >>> 13) % 43);
      const y = worldY - scroll;
      const section =
        sections[Math.floor(worldY / SECTION_LENGTH) % sections.length];
      const offset = worldY % SECTION_LENGTH;
      const fade = Math.min(
        1,
        offset / SECTION_FADE,
        (SECTION_LENGTH - offset) / SECTION_FADE,
      );
      const length = 10 + ((seed >>> 17) & 15);
      context.fillStyle = shadow;

      if (section === "smooth") {
        if (chance < 52) {
          context.globalAlpha = fade * 0.22;
          context.fillRect(x, y, 1 + (length % 3), 1);
        }
      } else if (section === "swept" && chance < 168) {
        context.globalAlpha = fade * 0.36;
        context.fillRect(x, y, length, 1);
        context.fillRect(x + length + 4, y + 1, 7 + (length >>> 1), 1);
        context.fillRect(x + 7, y + 4, length - 3, 1);
        context.fillStyle = highlight;
        context.globalAlpha = fade * 0.34;
        context.fillRect(x + 4, y + 2, length + 2, 1);
      } else if (section === "rippled" && chance < 143) {
        const bend = seed & 256 ? 1 : -1;
        context.globalAlpha = fade * 0.4;
        context.fillRect(x, y + bend * 2, 4, 1);
        context.fillRect(x + 4, y + bend, 5, 1);
        context.fillRect(x + 9, y, length, 1);
        context.fillRect(x + 9 + length, y + bend, 6, 1);
        context.fillRect(x + 15 + length, y + bend * 2, 4, 1);
        context.fillStyle = highlight;
        context.globalAlpha = fade * 0.38;
        context.fillRect(x + 10, y - bend, length - 3, 1);
      }
    }
  }
  context.globalAlpha = 1;
};
