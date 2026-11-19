import assert from "node:assert/strict";
import test from "node:test";
import { restoreArchivePositions } from "../../web/scripts/archive-layout.ts";

const origins = [
  { id: 0, key: "first", x: 10, y: 10, width: 60, height: 60 },
  { id: 1, key: "second", x: 100, y: 10, width: 60, height: 60 },
];
const bounds = { width: 400, height: 300 };
const assertUsable = (positions) => {
  const rects = origins.map((origin) => ({ ...origin, x: origin.x + (positions[origin.key]?.x ?? 0), y: origin.y + (positions[origin.key]?.y ?? 0) }));
  for (const a of rects) {
    assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.width <= bounds.width && a.y + a.height <= bounds.height);
    for (const b of rects) if (a.id !== b.id) assert.ok(!(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y));
  }
};

test("restores by stable ID after catalog reordering and ignores removed IDs", () => {
  const saved = { second: { x: 50, y: 100 }, removed: { x: 25, y: 25 } };
  const restored = restoreArchivePositions([...origins].reverse(), saved, bounds);
  assert.deepEqual(restored.first, { x: 0, y: 0 });
  assert.deepEqual(restored.second, { x: 50, y: 100 });
  assert.equal(restored.removed, undefined);
  assertUsable(restored);
});

test("resolves a saved position occupying a new document's origin", () => {
  const restored = restoreArchivePositions(origins, { first: { x: 90, y: 0 } }, bounds);
  assertUsable(restored);
});

test("clamps saved positions to the current viewport", () => {
  const restored = restoreArchivePositions(origins, { first: { x: 1000, y: -500 } }, bounds);
  assertUsable(restored);
});

test("ignores malformed offsets and unsupported geometry", () => {
  for (const value of [null, "position", { x: NaN, y: 1 }, { x: Infinity, y: 1 }, { x: 100001, y: 0 }, { x: "10", y: 1 }]) {
    assert.deepEqual(restoreArchivePositions(origins, { first: value }, bounds), {});
  }
  assert.deepEqual(restoreArchivePositions([], {}, bounds), {});
  assert.deepEqual(restoreArchivePositions(origins, { first: { x: 5, y: 0 } }, { width: 0, height: 0 }), {});
});

test("falls back to grid origins when a crowded saved arrangement cannot fit", () => {
  const crowded = origins.map((origin, index) => ({ ...origin, x: index * 60, y: 0 }));
  assert.deepEqual(restoreArchivePositions(crowded, { first: { x: 30, y: 0 } }, { width: 120, height: 60 }), {});
});
