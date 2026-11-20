import assert from "node:assert/strict";
import { test } from "node:test";
import { createNavigation, createSociety } from "../../web/scripts/society/engine.ts";

const seededRandom = (seed) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};
const environment = {
  width: 900, height: 600,
  surfaces: [
    { id: "folder-a", x: 140, y: 200, width: 75, height: 58, shelter: true },
    { id: "folder-b", x: 600, y: 310, width: 80, height: 65, shelter: true },
    { id: "image", x: 650, y: 100, width: 160, height: 120, shelter: true },
    { id: "text", x: 340, y: 180, width: 170, height: 90, shelter: false },
    { id: "header", x: 0, y: 0, width: 900, height: 65, shelter: false },
  ],
};
const inside = (point, rect) => point.x > rect.x && point.x < rect.x + rect.width
  && point.y > rect.y && point.y < rect.y + rect.height;

test("routes avoid text and surfaces, and cannot cross a full-height wall", () => {
  const map = createNavigation(environment);
  const path = map.route({ x: 100, y: 220 }, { x: 800, y: 240 });
  assert.ok(path.length > 1);
  for (let index = 1; index < path.length; index++) {
    for (let sample = 0; sample <= 40; sample++) {
      const a = path[index - 1], b = path[index], p = sample / 40;
      const point = { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p };
      assert.ok(!environment.surfaces.some((rect) => inside(point, rect)));
    }
  }
  const wall = createNavigation({ ...environment, surfaces: [
    { id: "wall", x: 440, y: 0, width: 25, height: 600, shelter: false },
  ] });
  assert.deepEqual(wall.route({ x: 100, y: 300 }, { x: 800, y: 300 }), []);
});

test("society continues beyond three seconds, hides and reappears without crowding shelters", () => {
  const seen = new Set();
  for (let seed = 1; seed <= 3; seed++) {
    const society = createSociety(environment, seededRandom(seed));
    assert.ok(society.entities.length > 0 && society.entities.length <= 10);
    for (let time = 0; time < 120_000; time += 50) {
      society.step(50);
      assert.equal(society.finished, false);
      for (const entity of society.entities) {
        seen.add(entity.state);
        assert.ok(Number.isFinite(entity.x) && Number.isFinite(entity.y));
        assert.ok(entity.opacity >= 0 && entity.opacity <= 1);
        assert.ok(entity.x >= 0 && entity.x <= environment.width);
        assert.ok(entity.y >= 0 && entity.y <= environment.height);
        if (entity.state === "walk") {
          assert.ok(!environment.surfaces.some((rect) => inside(entity, rect)), `walking through ${JSON.stringify(entity)}`);
        }
      }
      for (const surface of environment.surfaces.filter((rect) => rect.shelter)) {
        assert.ok(society.entities.filter((entity) => entity.home === surface.id).length <= 2);
      }
      if (time < 35_000) assert.equal(society.speech, null);
    }
  }
  for (const state of ["walk", "rest", "enter", "hidden", "leave", "peek", "observe"]) assert.ok(seen.has(state), state);
});

test("withdrawal is bounded, speech ends, and remapping does not end the society", () => {
  const society = createSociety(environment, seededRandom(8));
  society.step(50);
  society.remap({ ...environment, width: 500 });
  assert.equal(society.finished, false);
  society.retreat();
  assert.equal(society.retiring, true);
  assert.equal(society.speech, null);
  for (let i = 0; i < 18; i++) society.step(50);
  assert.equal(society.finished, true);
  assert.equal(society.opacity, 0);
});
