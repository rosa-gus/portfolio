import assert from "node:assert/strict";
import test from "node:test";
import { drawSkiTerrain } from "../../web/scripts/games/ski/ski-terrain.ts";

const renderTerrain = (width, height, travel) => {
  const marks = [];
  const context = {
    fillRect(x, y, width, height) {
      marks.push({ x, y, width, height, tone: this.fillStyle, alpha: this.globalAlpha });
    },
  };
  drawSkiTerrain(context, width, height, travel, "shadow", "highlight");
  assert.equal(context.globalAlpha, 1);
  return marks.filter(mark => mark.y >= 0 && mark.y < height && mark.x < width);
};

test("smooth snow, wind streaks and shallow ripples have distinct, low-contrast marks", () => {
  for (const [width, height] of [[640, 360], [400, 500]]) {
    const smooth = renderTerrain(width, height, 200);
    const swept = renderTerrain(width, height, 1240);
    const rippled = renderTerrain(width, height, 2280);
    assert.ok(smooth.length > 0 && smooth.every(mark => mark.width <= 3));
    assert.ok(swept.length > smooth.length && swept.some(mark => mark.width >= 15));
    assert.ok(rippled.some(mark => mark.width === 4) && rippled.some(mark => mark.width >= 10));
    assert.ok([...swept, ...rippled].every(mark => mark.alpha <= 0.4 && mark.height === 1));
    assert.ok(swept.some(mark => mark.tone === "highlight") && rippled.some(mark => mark.tone === "highlight"));
  }
});

test("marks keep their shape and brightness while the terrain scrolls through a section boundary", () => {
  const width = 640;
  const height = 360;
  const travel = 910;
  const shift = 19;
  const previous = renderTerrain(width, height, travel);
  const transition = previous.filter(mark => mark.y >= 130 && mark.y < 215);
  assert.ok(transition.length > 0 && transition.every(mark => mark.alpha < 0.25));
  assert.ok(previous.some(mark => mark.tone === "highlight" && mark.alpha >= 0.33));
  const next = renderTerrain(width, height, travel + shift);
  assert.deepEqual(next.filter(mark => mark.y < height - shift),
    previous.filter(mark => mark.y >= shift).map(mark => ({ ...mark, y: mark.y - shift })));
});
