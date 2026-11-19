import assert from "node:assert/strict";
import test from "node:test";
import { resolveArchiveCollisions } from "../../web/scripts/archive-layout.ts";

const rect = (id, x, y, width = 60, height = 60) => ({ id, x, y, width, height });
const bounds = { width: 400, height: 400 };
const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const checkLayout = (layout, limits) => {
  assert.ok(layout);
  for (const a of layout) {
    assert.ok(a.x >= 2 && a.y >= 2 && a.x + a.width <= limits.width - 2 && a.y + a.height <= limits.height - 2);
    for (const b of layout) if (a.id !== b.id) assert.ok(!overlaps(a, b), `Items ${a.id} and ${b.id} overlap`);
  }
};

for (const [name, dragged, expected] of [
  ["left", rect(0, 105, 100), { x: 35, y: 100 }],
  ["right", rect(0, 95, 100), { x: 165, y: 100 }],
  ["up", rect(0, 100, 105), { x: 100, y: 35 }],
  ["down", rect(0, 100, 95), { x: 100, y: 165 }],
]) {
  test(`moves a covered item ${name} by the shortest distance`, () => {
    const input = [dragged, rect(1, 100, 100)];
    const result = resolveArchiveCollisions(input, 0, bounds);
    checkLayout(result, bounds);
    assert.deepEqual(result[0], dragged);
    assert.equal(result[1].x, expected.x);
    assert.equal(result[1].y, expected.y);
    assert.equal(input[1].x, 100);
    assert.equal(input[1].y, 100);
  });
}

test("small overlaps do not jitter during dragging and resolve on release", () => {
  const input = [rect(0, 45, 100), rect(1, 100, 100)];
  assert.deepEqual(resolveArchiveCollisions(input, 0, bounds), input);
  checkLayout(resolveArchiveCollisions(input, 0, bounds, true), bounds);
});

test("pushes a chain of neighbours inside a constrained row", () => {
  const limits = { width: 400, height: 90 };
  const input = [rect(0, 65, 10), rect(1, 75, 10), rect(2, 145, 10), rect(3, 215, 10)];
  const result = resolveArchiveCollisions(input, 0, limits);
  checkLayout(result, limits);
  assert.deepEqual(result.map((item) => item.x), [65, 135, 205, 275]);
});

test("uses another direction when the nearest exit crosses a container edge", () => {
  const input = [rect(0, 12, 100), rect(1, 2, 100)];
  checkLayout(resolveArchiveCollisions(input, 0, bounds), bounds);
});

test("the hit area includes the label below the icon", () => {
  const input = [rect(0, 100, 170, 116, 132), rect(1, 100, 70, 116, 132)];
  const result = resolveArchiveCollisions(input, 0, bounds);
  checkLayout(result, bounds);
  assert.notDeepEqual(result[1], input[1]);
});

test("returns no layout if nothing fits, without mutating any item", () => {
  const input = [rect(0, 32, 2), rect(1, 72, 2)];
  const snapshot = structuredClone(input);
  assert.equal(resolveArchiveCollisions(input, 0, { width: 142, height: 64 }), null);
  assert.deepEqual(input, snapshot);
});

test("a document returning home keeps its original position and moves an occupying neighbour", () => {
  const home = rect(0, 12, 24);
  const layout = resolveArchiveCollisions([home, rect(1, 20, 30), rect(2, 160, 24)], 0, bounds, true);
  checkLayout(layout, bounds);
  assert.deepEqual(layout[0], home);
  assert.notDeepEqual(layout[1], rect(1, 20, 30));
});

test("dragged and displaced items reserve room for the lifting scale at every edge", () => {
  const limits = { width: 400, height: 400, inset: 8 };
  const layout = resolveArchiveCollisions([rect(0, 8, 8, 116, 132), rect(1, 14, 14, 116, 132)], 0, limits, true);
  checkLayout(layout, limits);
  for (const item of layout) {
    const growthX = item.width * 0.03;
    const growthY = item.height * 0.03;
    assert.ok(item.x - growthX >= 0 && item.y - growthY >= 0);
    assert.ok(item.x + item.width + growthX <= limits.width);
    assert.ok(item.y + item.height + growthY <= limits.height);
  }
});

test("repeated dragging keeps all successful arrangements inside bounds without overlaps", () => {
  const limits = { width: 420, height: 400 };
  let layout = Array.from({ length: 12 }, (_, id) => rect(id, 12 + (id % 4) * 80, 12 + Math.floor(id / 4) * 90));
  let seed = 42;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  let resolved = 0;
  for (let step = 0; step < 150; step++) {
    const id = Math.floor(random() * layout.length);
    const proposed = layout.map((item) => item.id === id ? { ...item, x: 2 + random() * 356, y: 2 + random() * 336 } : item);
    const next = resolveArchiveCollisions(proposed, id, limits, true);
    if (!next) continue;
    checkLayout(next, limits);
    layout = next;
    resolved++;
  }
  assert.ok(resolved > 100);
});
