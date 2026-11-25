import assert from "node:assert/strict";
import { test } from "node:test";
import { createSocietyEvents } from "../../web/scripts/society/events.ts";

const shelter = { id: "folder", x: 100, y: 100, width: 60, height: 60, shelter: true };
const entity = (id, options) => ({
  id, x: 130, y: 130, state: "hidden", home: shelter.id, since: 0,
  partner: null, passing: false, path: [], ...options,
});

const createScene = (entities, options = {}) => {
  const calls = [];
  let space = options.space ?? true;
  const events = createSocietyEvents({
    entities,
    freePoints: () => options.points ?? [],
    homeOf: (resident) => resident.home === shelter.id ? shelter : undefined,
    hasCorridorSpace: () => space,
    startExit(resident, peeking, toward) {
      calls.push(["exit", resident.id, peeking, { x: toward.x, y: toward.y }]);
      resident.state = "leave";
      return true;
    },
    pauseWalk(walker, duration) {
      calls.push(["pause", walker.id, duration]);
    },
    route: options.route ?? ((_, point) => [point]),
    followPath(walker, path) {
      calls.push(["fork", walker.id, path]);
    },
  }, () => 0);
  return { events, calls, setSpace(value) { space = value; } };
};

test("a passing resident prompts a peek even when the corridor is full", () => {
  const resident = entity(1);
  const passer = entity(2, { x: 188, y: 125, state: "walk", home: null, path: [{ x: 200, y: 180 }] });
  const { events, calls } = createScene([resident, passer], { space: false });
  events.step(3500);
  assert.deepEqual(calls, [["exit", 1, true, { x: 188, y: 125 }], ["pause", 2, 420]]);

  resident.state = "hidden";
  events.step(5000);
  assert.equal(calls.length, 2);
  assert.deepEqual(passer.path, [{ x: 200, y: 180 }]);
});

test("a pair can split onto a clear branch while the companion keeps its route", () => {
  const walker = entity(1, { x: 20, y: 20, state: "walk", home: null, partner: 2,
    path: [{ x: 120, y: 20 }], togetherUntil: 9000, lastStroll: 3000 });
  const companion = entity(2, { x: 20, y: 48, state: "walk", home: null, partner: 1,
    path: [{ x: 120, y: 48 }], togetherUntil: 9000, lastStroll: 3000 });
  const blocked = { x: 28, y: 87 };
  const free = { x: 36, y: 92 };
  const { events, calls } = createScene([walker, companion], {
    points: [blocked, free], route: (_, point) => point === free ? [point] : null,
  });

  events.step(3500);
  assert.deepEqual(calls, []);
  events.step(4200);
  assert.deepEqual(calls, [["fork", 1, [free]]]);
  assert.deepEqual(companion.path, [{ x: 120, y: 48 }]);
});

test("a handoff waits for a free slot and releases a different resident from the same shelter", () => {
  const entrant = entity(1, { x: 113, y: 130, since: 4000 });
  const resident = entity(2);
  const elsewhere = entity(3, { home: "other-folder" });
  const { events, calls, setSpace } = createScene([entrant, resident, elsewhere], { space: false });
  events.onSheltered(4000, entrant, shelter);
  assert.equal(events.holdsExit(resident, 4500), true);
  assert.equal(events.holdsExit(elsewhere, 4500), false);
  events.step(4650);
  assert.deepEqual(calls, []);
  setSpace(true);
  events.step(4800);
  assert.deepEqual(calls, [["exit", 2, false, { x: 147, y: 130 }]]);
  assert.equal(events.holdsExit(resident, 4800), false);
});

test("a remap cancels a handoff instead of opening the shelter later", () => {
  const entrant = entity(1, { since: 4000 });
  const resident = entity(2);
  const { events, calls } = createScene([entrant, resident]);
  events.onSheltered(4000, entrant, shelter);
  events.reset(4500);
  events.step(5000);
  assert.equal(events.holdsExit(resident, 5000), false);
  assert.deepEqual(calls, []);
});
