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
      assert.ok(society.entities.filter((entity) => entity.state !== "hidden" && !entity.peeking).length <= 4);
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

test("gliding accelerates across waypoints and slows down only near the destination", () => {
  const society = createSociety({ width: 900, height: 600, surfaces: [] }, seededRandom(9));
  holdOthers(society, []);
  const [traveller, ...others] = society.entities;
  others.forEach((entity, index) => Object.assign(entity, { x: 800, y: 100 + index * 60 }));
  Object.assign(traveller, {
    x: 20, y: 300, state: "walk", speed: 40,
    path: [{ x: 60, y: 300 }, { x: 140, y: 300 }],
  });
  const moves = [];
  for (let time = 0; traveller.path.length && time < 6000; time += 50) {
    const from = traveller.x;
    society.step(50);
    moves.push({ from, distance: traveller.x - from });
  }

  assert.equal(traveller.x, 140);
  const afterWaypoint = moves.find(({ from }) => from === 60).distance;
  assert.ok(afterWaypoint > 2 * moves[0].distance);
  const nearArrival = moves.find(({ from }) => from > 135).distance;
  assert.ok(nearArrival < afterWaypoint / 2);
});

test("one resident can leave when another hides, even with multiple residents waiting", () => {
  const extraShelters = [
    { id: "folder-c", x: 110, y: 380, width: 60, height: 55, shelter: true },
    { id: "folder-d", x: 340, y: 460, width: 60, height: 55, shelter: true },
    { id: "folder-e", x: 520, y: 475, width: 60, height: 55, shelter: true },
  ];
  const scene = { ...environment, surfaces: [...environment.surfaces, ...extraShelters] };
  const society = createSociety(scene, seededRandom(4));
  assert.ok(society.entities.every((entity) => entity.state === "hidden"));
  holdOthers(society, []);
  const [entering, , , , firstWaiting, secondWaiting] = society.entities;
  Object.assign(firstWaiting, { state: "hidden", until: 0, home: "folder-a", x: 178, y: 229, timidity: 0 });
  Object.assign(secondWaiting, { state: "hidden", until: 0, home: "folder-b", x: 640, y: 342, timidity: 0 });
  const outside = () => society.entities.filter((entity) => entity.state !== "hidden");

  society.step(50);
  assert.equal(firstWaiting.state, "hidden");
  assert.equal(secondWaiting.state, "hidden");
  Object.assign(entering, { state: "enter", until: 100, home: "folder-c", x: 140, y: 407 });
  society.step(50);
  assert.equal(entering.state, "hidden");
  assert.equal(entering.opacity, 0);
  assert.equal(firstWaiting.state, "leave");
  assert.equal(secondWaiting.state, "hidden");
  assert.equal(outside().length, 4);

  society.remap({ ...scene, surfaces: [] });
  society.step(50);
  assert.equal(outside().length, 4);
  assert.equal(secondWaiting.state, "hidden");
});

test("a resident takes a clear first route toward a neighbour after fully leaving", () => {
  const society = createSociety(environment, seededRandom(9));
  holdOthers(society, []);
  const [resident, neighbour, ...others] = society.entities;
  others.forEach((entity, index) => Object.assign(entity, { x: 800, y: 350 + index * 60 }));
  const exit = { x: 245, y: 225 };
  Object.assign(resident, {
    x: 175, y: 225, state: "leave", since: 0, until: 50,
    home: "folder-a", path: [exit],
  });
  Object.assign(neighbour, { x: 330, y: 258 });

  society.step(50);
  assert.equal(resident.needsFirstWalk, true);
  assert.equal(resident.state, "rest");
  for (let time = 50; time < 400; time += 50) society.step(50);
  assert.equal(resident.state, "walk");
  assert.equal(resident.partner, null);

  for (let time = 400; resident.needsFirstWalk && time < 6000; time += 50) {
    society.step(50);
    assert.ok(!environment.surfaces.some((surface) => inside(resident, surface)));
  }
  assert.equal(resident.needsFirstWalk, false);
  assert.ok(Math.hypot(resident.x - exit.x, resident.y - exit.y) >= 40);
  assert.ok(Math.hypot(resident.x - neighbour.x, resident.y - neighbour.y) <
    Math.hypot(exit.x - neighbour.x, exit.y - neighbour.y));
});

test("a resident waits ten seconds after fully leaving before seeking shelter", () => {
  const seeded = seededRandom(9);
  let deliberate = false;
  const society = createSociety(environment, () => deliberate ? 0.02 : seeded());
  holdOthers(society, []);
  const [resident, ...others] = society.entities;
  others.forEach((entity, index) => Object.assign(entity, { x: 800, y: 350 + index * 60 }));
  Object.assign(resident, {
    x: 175, y: 225, state: "leave", since: 0, until: 50,
    home: "folder-a", path: [{ x: 245, y: 225 }], timidity: 1,
  });
  deliberate = true;
  society.step(50);
  assert.equal(resident.exposedAt, 50);

  let time = 50;
  for (; resident.needsFirstWalk && time < 10_000; time += 50) society.step(50);
  assert.equal(resident.needsFirstWalk, false);
  Object.assign(resident, { state: "rest", path: [], until: 1e9 });
  for (; time < 10_000; time += 50) society.step(50);
  Object.assign(resident, { until: 0, nextDecision: 0 });
  society.step(0);
  assert.equal(resident.home, null);

  Object.assign(resident, { state: "rest", path: [], until: 0, nextDecision: 0 });
  society.step(50);
  assert.ok(resident.home);
});

test("a resident peeks and withdraws while all four corridor slots are occupied", () => {
  let deliberate = false;
  const seeded = seededRandom(9);
  const scene = { ...environment, surfaces: [...environment.surfaces,
    { id: "folder-c", x: 110, y: 380, width: 60, height: 55, shelter: true },
    { id: "folder-d", x: 340, y: 460, width: 60, height: 55, shelter: true },
  ] };
  const society = createSociety(scene, () => deliberate ? 0.02 : seeded());
  holdOthers(society, []);
  const [resident, ...outside] = society.entities;
  assert.equal(outside.length, 4);
  outside.forEach((entity, index) => Object.assign(entity, { x: 800, y: 350 + index * 60 }));
  Object.assign(resident, {
    x: 178, y: 229, state: "hidden", until: 0, home: "folder-a", timidity: 1,
  });
  deliberate = true;
  society.step(50);
  assert.equal(resident.state, "leave");
  assert.equal(resident.peeking, true);
  const seen = new Set();
  const shelter = environment.surfaces[0];
  for (let time = 50; time <= 2500; time += 50) {
    society.step(50);
    seen.add(resident.state);
    if (resident.state === "peek") {
      assert.ok([shelter.x, shelter.x + shelter.width].includes(resident.x) ||
        [shelter.y, shelter.y + shelter.height].includes(resident.y));
    }
    assert.equal(society.entities.filter((entity) => entity.state !== "hidden" && !entity.peeking).length, 4);
  }
  assert.ok(seen.has("peek") && seen.has("enter"));
  assert.equal(resident.state, "hidden");
  assert.equal(resident.needsFirstWalk, false);
});

test("folder tabs block exits and peeks even if the top edge is closest", () => {
  const tab = { id: "folder-tab", x: 140, y: 191, width: 38, height: 10, shelter: false, folderTab: true };
  const exit = (peeking, surfaces) => {
    let deliberate = false;
    const seeded = seededRandom(9);
    const society = createSociety({ ...environment, surfaces }, () => deliberate ? 0.02 : seeded());
    holdOthers(society, []);
    const [resident] = society.entities;
    Object.assign(resident, {
      x: 161, y: 215, state: "hidden", until: 0, home: "folder-a", timidity: peeking ? 1 : 0,
    });
    deliberate = true;
    society.step(50);
    assert.equal(resident.state, "leave");
    assert.equal(resident.peeking, peeking);
    return resident.path[0];
  };

  for (const peeking of [false, true]) {
    assert.ok(exit(peeking, environment.surfaces).y <= 200);
    const clearExit = exit(peeking, [...environment.surfaces, tab]);
    assert.ok(clearExit.y > 200);
  }
});

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

test("an active interest keeps a resident exploring after ten seconds, then expires", () => {
  const society = createSociety(environment, seededRandom(5));
  const [resident, ...others] = society.entities;
  holdOthers(society, [resident]);
  others.forEach((entity, index) => Object.assign(entity, { x: 800, y: 350 + index * 60 }));
  Object.assign(resident, { x: 380, y: 390, exposedAt: -11_000, interestsLeft: 2 });
  society.step(50);
  assert.equal(resident.state, "walk");
  assert.equal(resident.home, null);
  assert.equal(resident.interestsLeft, 1);

  holdOthers(society, [resident]);
  resident.exposedAt = -26_000;
  society.step(50);
  assert.ok(resident.home);
});

test("a resident waits for an accepted approach after ten seconds outside", () => {
  let deliberate = false;
  const seeded = seededRandom(9);
  const society = createSociety(environment, () => deliberate ? 0.2 : seeded());
  const [walker, neighbour, ...others] = society.entities;
  holdOthers(society, [walker]);
  others.forEach((entity, index) => Object.assign(entity, { x: 800, y: 350 + index * 60 }));
  Object.assign(walker, { x: 265, y: 405, exposedAt: -13_000, interestsLeft: 1 });
  Object.assign(neighbour, { x: 380, y: 405, exposedAt: -14_000, timidity: 0, interestsLeft: 0 });
  deliberate = true;
  society.step(50);
  assert.equal(walker.partner, neighbour.id);
  assert.equal(neighbour.state, "observe");
  for (let time = 50; !walker.togetherUntil && time < 8000; time += 50) {
    assert.equal(neighbour.x, 380);
    assert.equal(neighbour.home, null);
    society.step(50);
  }
  assert.ok(walker.togetherUntil > 0);
  assert.equal(neighbour.togetherUntil, walker.togetherUntil);
});

test("faithful residents return to preferred shelters and wait when those shelters are occupied", () => {
  const society = createSociety(environment, seededRandom(5));
  const [visitor, residentA, residentB] = society.entities;
  holdOthers(society, [visitor]);
  Object.assign(visitor, { x: 380, y: 330, preferredHome: "folder-a", fidelity: 1, exposedAt: -20000, interestsLeft: 0 });
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
  const grid = {
    width: 550, height: 460,
    surfaces: Array.from({ length: 6 }, (_, index) => ({
      id: `document-${index}`, x: 40 + (index % 3) * 132, y: 40 + Math.floor(index / 3) * 148,
      width: 72, height: 66, shelter: true,
    })),
  };
  const society = createSociety(grid, seededRandom(2));
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

test("only a displayed murmur starts the global speech cooldown", () => {
  let deliberate = false;
  let draws = [];
  const seeded = seededRandom(9);
  const society = createSociety(environment, () => deliberate ? draws.shift() ?? 0.1 : seeded());
  const [a, b] = society.entities;
  holdOthers(society, []);
  deliberate = true;
  const encounter = (roll = 0.1) => {
    Object.assign(a, { x: 280, y: 400, state: "observe", until: 0, nextDecision: 0,
      partner: b.id, interest: "folder-a", lastStroll: 0 });
    Object.assign(b, { x: 320, y: 400, state: "observe", partner: a.id, lastStroll: 0 });
    draws = [0.1, roll, 0.9, 0];
    society.step(50);
  };
  const wait = (duration) => {
    holdOthers(society, []);
    for (let time = 0; time < duration; time += 50) society.step(50);
  };
  encounter(0.35);
  assert.equal(society.speech, null);
  encounter();
  const hiddenLine = society.speech;
  assert.equal(hiddenLine?.text, "oru?");
  wait(5000);
  encounter();
  assert.equal(society.speech?.text, "oru?");
  society.markSpeechShown(hiddenLine);
  assert.equal(society.speech.shown, false);
  draws = [0];
  society.markSpeechShown(society.speech);
  assert.equal(society.speech.shown, true);
  wait(10_000);
  encounter();
  assert.equal(society.speech, null);
  wait(24_000);
  encounter();
  assert.equal(society.speech?.text, "oru?");
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
  const [a, b, ...others] = society.entities;
  holdOthers(society, []);
  others.forEach((entity, index) => Object.assign(entity, { x: 800, y: 100 + index * 60 }));
  Object.assign(a, { x: 120, y: 300, state: "yield", path: [{ x: 220, y: 300 }], until: 0, blockedAttempts: 3, blockedBy: b.id, waitingFor: b.id, speed: 40 });
  Object.assign(b, { x: 140, y: 300, state: "yield", path: [{ x: 70, y: 300 }], until: 0, blockedAttempts: 3, blockedBy: a.id, waitingFor: a.id, speed: 40 });
  society.step(50);
  assert.equal(a.passing, true);
  assert.equal(b.passing, false);
  let aArrived = false, bArrived = false;
  for (let time = 0; time < 7000 && !(aArrived && bArrived); time += 50) {
    society.step(50);
    assert.ok(society.entities.filter((entity) => entity.passing).length <= 1);
    aArrived ||= !a.path.length && a.x === 220;
    bArrived ||= !b.path.length && Math.hypot(b.x - 70, b.y - 300) < 20;
  }
  assert.ok(aArrived && bArrived);
  society.remap({ width: 900, height: 600, surfaces: [] });
  assert.ok(society.entities.every((entity) => !entity.passing && entity.phase === 0));
});
