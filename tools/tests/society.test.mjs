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
      if (time < 30_000) assert.equal(society.speech, null);
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

const holdOthers = (society, keep) => {
  for (const entity of society.entities) {
    entity.state = "rest"; entity.path = []; entity.home = null; entity.partner = null;
    entity.until = keep.includes(entity) ? 0 : 1e9;
    entity.nextDecision = 0;
  }
};

test("encounters build reciprocal memory and lead to a shared walk, independently of colour", () => {
  let deliberate = false;
  const seeded = seededRandom(9);
  const society = createSociety(environment, () => deliberate ? 0.1 : seeded());
  const [a, b] = society.entities;
  holdOthers(society, [a, b]);
  Object.assign(a, { x: 280, y: 400, state: "observe", partner: b.id, sociability: 1, timidity: 0 });
  Object.assign(b, { x: 320, y: 400, state: "observe", partner: a.id, sociability: 1, timidity: 0 });
  const identities = society.entities.map((entity) => [entity.id, entity.color, entity.fidelity]);
  deliberate = true;
  society.step(50);
  assert.ok(a.affinities.has(b.id) && b.affinities.has(a.id));
  assert.ok(a.color !== b.color);
  assert.equal(a.state, "walk");
  assert.equal(b.state, "walk");
  assert.ok(a.togetherUntil > 0 && a.togetherUntil === b.togetherUntil);
  assert.equal(a.partner, b.id);
  assert.equal(b.partner, a.id);
  society.remap(environment);
  assert.deepEqual(society.entities.map((entity) => [entity.id, entity.color, entity.fidelity]), identities);
  assert.ok(a.affinities.has(b.id) && b.affinities.has(a.id));
});

test("faithful residents return to preferred shelters and wait when those shelters are occupied", () => {
  const society = createSociety(environment, seededRandom(5));
  const [visitor, residentA, residentB] = society.entities;
  holdOthers(society, [visitor]);
  Object.assign(visitor, { x: 380, y: 330, preferredHome: "folder-a", fidelity: 1, exposedAt: -20000 });
  society.step(50);
  assert.equal(visitor.home, "folder-a");
  holdOthers(society, [visitor]);
  for (const resident of [residentA, residentB]) Object.assign(resident, { home: "folder-a", state: "hidden", x: 175, y: 225, until: 1e9 });
  Object.assign(visitor, { x: 100, y: 270, exposedAt: -20000 });
  society.step(50);
  assert.equal(visitor.state, "observe");
  assert.equal(visitor.interest, "folder-a");
  assert.equal(visitor.home, null);
  assert.equal(society.entities.filter((entity) => entity.home === "folder-a").length, 2);
});

test("long-running society preserves identities, bounded affinities and occasional quiet periods", () => {
  const society = createSociety(environment, seededRandom(2));
  const colors = society.entities.map((entity) => entity.color);
  let quiet = false, yielding = false, memories = false;
  for (let time = 0; time < 180000; time += 50) {
    society.step(50);
    quiet ||= society.quiet;
    yielding ||= society.entities.some((entity) => entity.state === "yield");
    memories ||= society.entities.some((entity) => entity.affinities.size > 0);
    for (const entity of society.entities) {
      assert.ok(entity.affinities.size <= 3);
      assert.ok(entity.color >= 0 && entity.color < 4);
      for (const [id, memory] of entity.affinities) {
        assert.ok(id !== entity.id && society.entities.some((other) => other.id === id));
        assert.ok(memory.strength > 0 && memory.strength <= 1);
      }
    }
    if (society.quiet) assert.equal(society.speech, null);
  }
  assert.ok(quiet && yielding && memories);
  assert.deepEqual(society.entities.map((entity) => entity.color), colors);
});

test("encounter speech uses invented murmurs and retains a global rare-event cooldown", () => {
  let deliberate = false;
  const seeded = seededRandom(9);
  const society = createSociety(environment, () => deliberate ? 0 : seeded());
  const [a, b] = society.entities;
  holdOthers(society, []);
  Object.assign(a, { x: 280, y: 400, state: "observe", partner: b.id });
  Object.assign(b, { x: 320, y: 400, state: "observe", partner: a.id });
  deliberate = true;
  const events = [];
  let previousSpeech = null;
  for (let time = 50; time <= 180000; time += 50) {
    society.step(50);
    if (time < 30000) assert.equal(society.speech, null);
    if (society.speech && society.speech !== previousSpeech) {
      assert.match(society.speech.text, /^[mnpruü.\s…?-]+$/u);
      assert.ok(society.speech.text.length <= 10);
      events.push(time);
      previousSpeech = society.speech;
    }
  }
  assert.ok(events.length >= 2);
  for (let index = 1; index < events.length; index++) assert.ok(events[index] - events[index - 1] >= 40000);
});

test("a blocked resident waits three times before passing through a stationary group", () => {
  const society = createSociety({ width: 900, height: 600, surfaces: [] }, seededRandom(9));
  const [walker, blocker, neighbour] = society.entities;
  holdOthers(society, []);
  Object.assign(walker, { x: 100, y: 300, state: "walk", path: [{ x: 300, y: 300 }], speed: 35 });
  Object.assign(blocker, { x: 150, y: 300 });
  Object.assign(neighbour, { x: 165, y: 300 });
  let crossed = false, faded = false;
  for (let time = 0; time < 9500; time += 50) {
    society.step(50);
    if (walker.passing) {
      crossed = true;
      // The counter may reset once clear, so check it only while approaching.
      if (walker.x < 150) assert.ok(walker.blockedAttempts >= 3);
    }
    if (!crossed) assert.ok(walker.x < 150);
    faded ||= walker.phase > 0.3;
    assert.ok(society.entities.filter((entity) => entity.passing).length <= 1);
  }
  assert.ok(crossed && faded);
  assert.ok(walker.x > 200);
  assert.equal(walker.passing, false);
  assert.ok(walker.phase < 0.01);
});

test("opposing residents grant passage to one stable priority and keep their routes", () => {
  const society = createSociety({ width: 900, height: 600, surfaces: [] }, seededRandom(3));
  const [a, b] = society.entities;
  holdOthers(society, []);
  Object.assign(a, { x: 120, y: 300, state: "yield", path: [{ x: 220, y: 300 }], until: 0, blockedAttempts: 3, blockedBy: b.id, waitingFor: b.id, speed: 40 });
  Object.assign(b, { x: 140, y: 300, state: "yield", path: [{ x: 70, y: 300 }], until: 0, blockedAttempts: 3, blockedBy: a.id, waitingFor: a.id, speed: 40 });
  society.step(50);
  assert.equal(a.passing, true);
  assert.equal(b.passing, false);
  for (let time = 0; time < 5000; time += 50) {
    society.step(50);
    assert.ok(society.entities.filter((entity) => entity.passing).length <= 1);
  }
  assert.ok(a.x > 180);
  assert.ok(b.x < 120);
  society.remap({ width: 900, height: 600, surfaces: [] });
  assert.ok(society.entities.every((entity) => !entity.passing && entity.phase === 0));
});
