import assert from "node:assert/strict";
import test from "node:test";
import { SkiEngine, SKI_WIDTH, SKI_MAX_HEADING, SKI_NEAR_MISS_POINTS, SKI_NEAR_MISS_MIN_DESCENT_RATIO, SKI_YETI_ESCAPE_GAP, SKI_NORMAL_INTERVAL, SKI_SLALOM_INTERVAL } from "../../web/scripts/games/ski/ski-engine.ts";

const neutral = { steer: 0, downhill: false };
const advance = (game, count, input = neutral) => {
  for (let i = 0; i < count; i++) game.tick(input);
};
const rng = () => {
  let seed = 12345;
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
};

// Invert downhillRatio = cos(heading) * (0.35 + 0.65 * cos(heading)).
const headingForDescent = ratio => Math.acos((-0.35 + Math.sqrt(0.35 ** 2 + 2.6 * ratio)) / 1.3);
const obstacleAtPlayer = (game, kind = "rock") => ({
  id: 999, kind, x: game.player.x + 8, y: game.player.y + 2, hit: false,
});
const closePass = (ratio, kind = "pine", distance = 0, side = 1) => {
  const game = new SkiEngine(rng());
  game.start();
  game.distance = distance;
  // Keep the skier at the boundary so horizontal drift does not change clearance.
  game.player.x = side > 0 ? SKI_WIDTH - 26 : 26;
  game.player.heading = side * headingForDescent(ratio);
  const obstacle = { id: 999, kind, x: game.player.x - side * (kind === "pine" ? 31 : 35), y: game.player.y + 12, hit: false };
  game.objects = [obstacle];
  return { game, obstacle };
};

test("near misses require 55% downhill speed at both early and late run speeds", () => {
  for (const kind of ["pine", "rock"]) for (const distance of [0, 3000]) for (const side of [-1, 1]) {
    for (const delta of [-0.0001, 0.0001]) {
      const { game, obstacle } = closePass(SKI_NEAR_MISS_MIN_DESCENT_RATIO + delta, kind, distance, side);
      const bonuses = [];
      for (let i = 0; i < 60; i++) {
        game.tick();
        bonuses.push(...game.events.filter(event => event.type === "near-miss"));
      }
      const expected = delta > 0 ? 1 : 0;
      assert.equal(obstacle.passed, true);
      assert.equal(obstacle.hit, false);
      assert.equal(game.nearMisses, expected);
      assert.equal(bonuses.length, expected);
      if (expected) assert.equal(bonuses[0].points, SKI_NEAR_MISS_POINTS);
      assert.equal(game.score, Math.floor(game.distance / 10) * 10 + expected * 50);
    }
  }
});

test("accelerating after a slow close approach cannot award a near miss", () => {
  const { game, obstacle } = closePass(0.4);
  game.tick();
  assert.equal(obstacle.slowPass, true);
  game.player.heading = 0;
  advance(game, 20);
  assert.equal(obstacle.passed, true);
  assert.equal(obstacle.hit, false);
  assert.equal(game.nearMisses, 0);
});

test("ready and paused simulations freeze all state and random consumption", () => {
  let calls = 0;
  const game = new SkiEngine(() => { calls++; return 0.5; });
  for (const state of ["ready", "paused"]) {
    if (state === "paused") { game.start(); game.pause(); }
    const before = JSON.stringify(game);
    const count = calls;
    advance(game, 120, { steer: 1, downhill: true });
    assert.equal(JSON.stringify(game), before);
    assert.equal(calls, count);
  }
});

test("released controls preserve heading and motion; down returns to the fall line", () => {
  const game = new SkiEngine(rng());
  game.start(); game.objects = [];
  advance(game, 20, { steer: 1 });
  const heading = game.player.heading;
  const x = game.player.x;
  assert.ok(heading > 0 && heading < SKI_MAX_HEADING);
  advance(game, 20);
  assert.equal(game.player.heading, heading);
  assert.ok(game.player.x > x);
  advance(game, 30, { steer: 0, downhill: true });
  assert.equal(game.player.heading, 0);
  assert.equal(game.velocity.x, 0);
  assert.ok(game.velocity.y > 0);
});

test("heading determines both velocity components and favors downhill speed", () => {
  const run = heading => {
    const game = new SkiEngine(rng());
    game.start(); game.objects = []; game.player.heading = heading;
    game.tick();
    return game;
  };
  const down = run(0);
  const diagonal = run(Math.PI / 4);
  const horizontal = run(SKI_MAX_HEADING);
  const left = run(-Math.PI / 4);
  assert.equal(down.velocity.x, 0);
  assert.ok(down.speed > diagonal.speed && diagonal.speed > horizontal.speed);
  assert.ok(down.velocity.y > diagonal.velocity.y);
  assert.ok(Math.abs(diagonal.velocity.x - diagonal.velocity.y) < 1e-9);
  assert.ok(Math.abs(horizontal.velocity.y) < 1e-9);
  assert.ok(Math.abs(horizontal.distance) < 1e-9);
  assert.ok(horizontal.velocity.x > 0);
  assert.equal(left.velocity.x, -diagonal.velocity.x);
  assert.equal(left.velocity.y, diagonal.velocity.y);
});

test("steering clamps to horizontal headings and keeps the skier in bounds", () => {
  for (const steer of [-1, 1]) {
    const game = new SkiEngine(rng()); game.start();
    advance(game, 1200, { steer });
    assert.equal(game.player.heading, steer * SKI_MAX_HEADING);
    assert.equal(game.player.x, steer < 0 ? 26 : SKI_WIDTH - 26);
    assert.ok(game.trails.length < 40);
  }
});

test("pointer headings persist, clamp to the slope, and ignore non-finite input", () => {
  const game = new SkiEngine(rng()); game.start(); game.objects = [];
  advance(game, 40, { steer: 0, heading: -Math.PI / 4 });
  assert.equal(game.player.heading, -Math.PI / 4);
  advance(game, 10);
  assert.equal(game.player.heading, -Math.PI / 4);
  advance(game, 120, { steer: 0, heading: 5 });
  assert.equal(game.player.heading, SKI_MAX_HEADING);
  game.tick({ steer: NaN, heading: NaN });
  assert.equal(game.player.heading, SKI_MAX_HEADING);
});

test("only obstacles start a stumble; the balance window freezes while paused", () => {
  const game = new SkiEngine(rng());
  game.start();
  game.objects = [obstacleAtPlayer(game, "tracks")];
  game.tick();
  assert.equal(game.balance, null);
  game.objects = [obstacleAtPlayer(game)];
  game.tick();
  assert.equal(game.balance.pose, "stumble");
  assert.equal(game.balance.side, "left");
  assert.equal(game.objects[0].hit, true);
  assert.equal(game.phase, "running");
  assert.deepEqual(game.events.map(event => event.type), ["collision"]);
  game.pause();
  const frozen = JSON.stringify(game);
  advance(game, 80, { steer: 0, downhill: true });
  assert.equal(JSON.stringify(game), frozen);
  game.start();

  // A single press while already facing downhill still counts.
  game.tick({ steer: 0, downhill: true });
  assert.deepEqual(game.events, [{ type: "ski-contact" }]);
  assert.equal(game.trails.at(-1).age, 0);
  assert.equal(game.trails.at(-1).connected, false);
  const slowed = game.speed;
  assert.ok(slowed < 150);
  game.tick({ steer: 0, downhill: true });
  assert.equal(game.events.some(event => event.type === "ski-contact"), false);
  advance(game, 9);
  assert.deepEqual([game.balance.pose, game.balance.afterFall], ["recover", false]);
  assert.equal(game.trails.at(-1).connected, true);
  assert.ok(game.speed > slowed);
  advance(game, 30);
  assert.equal(game.balance, null);
  assert.ok(game.speed >= 240);
});

test("steering or aiming into the fall line in time avoids a fall", () => {
  for (const [heading, input] of [
    [SKI_MAX_HEADING, { steer: 0, downhill: true }],
    [-1.1, { steer: 1 }],
    [1.1, { steer: 0, heading: 0.1 }],
  ]) {
    const game = new SkiEngine(rng());
    game.start();
    game.player.heading = heading;
    game.objects = [obstacleAtPlayer(game, "pine")];
    game.tick();
    assert.equal(game.balance.pose, "stumble");
    advance(game, 30, input);
    assert.deepEqual([game.balance.pose, game.balance.afterFall], ["recover", false]);
    assert.ok(Math.abs(game.player.heading) <= 0.28);
  }
});

test("missing the balance window causes one fall, then an automatic recovery", () => {
  const game = new SkiEngine(rng());
  game.start();
  game.objects = [obstacleAtPlayer(game)];
  game.tick();
  advance(game, 41);
  assert.equal(game.balance.pose, "stumble", "neutral controls don't correct a stumble by themselves");
  const stumbleSpeed = game.speed;
  game.tick();
  assert.equal(game.balance.pose, "fall");
  assert.deepEqual(game.events.map(({ type, side }) => [type, side]), [["fall", "left"]]);
  const fallSpeed = game.speed;
  assert.ok(fallSpeed < stumbleSpeed / 2);
  assert.equal(game.phase, "running");
  const trails = game.trails.length;
  advance(game, 38, { steer: 1 });
  assert.equal(game.balance.pose, "fall");
  assert.equal(game.player.heading, 0);
  assert.ok(game.trails.length <= trails);
  assert.equal(game.events.some(event => event.type === "fall"), false);
  game.tick();
  assert.deepEqual([game.balance.pose, game.balance.afterFall], ["recover", true]);
  assert.deepEqual(game.events, [{ type: "ski-contact" }]);
  assert.equal(game.trails.at(-1).age, 0);
  assert.equal(game.trails.at(-1).connected, false);
  advance(game, 20);
  assert.ok(game.speed > fallSpeed && game.speed < 240);
  advance(game, 20);
  assert.equal(game.balance, null);
  assert.ok(game.speed >= 240);
});

const startFullFall = game => {
  game.objects = [obstacleAtPlayer(game)];
  game.tick();
  advance(game, 42);
  assert.equal(game.balance.pose, "fall");
  assert.equal(game.events.filter(event => event.type === "fall").length, 1);
};

test("the fifth fall starts an offscreen pursuit only after full recovery", () => {
  for (const [layout, distance] of [["landscape", 0], ["portrait", 6400]]) {
    const game = new SkiEngine(() => 0.5, layout);
    game.start();
    game.distance = distance;
    game.nextSlalom = game.nextYeti = Infinity;
    for (let fall = 0; fall < 4; fall++) {
      startFullFall(game);
      advance(game, 78);
      assert.equal(game.balance, null);
      assert.equal(game.yeti, null);
    }

    startFullFall(game);
    game.nextYeti = game.distance; // The regular encounter must not interrupt recovery.
    advance(game, 39);
    assert.equal(game.balance.pose, "recover");
    assert.equal(game.yeti, null);
    advance(game, 38);
    assert.equal(game.balance.pose, "recover");
    assert.equal(game.yeti, null);
    game.tick();
    assert.equal(game.balance, null);
    const appearance = game.events.find(event => event.type === "yeti-appear");
    assert.ok(appearance?.rush);
    assert.ok(appearance.y < 0 && game.yeti.y < 0);

    for (let tick = 0; tick < 720 && game.yeti; tick++) {
      game.objects = [];
      game.tick();
      assert.equal(game.events.some(event => event.type === "yeti-appear"), false);
    }
    assert.equal(game.phase, "running");
    assert.equal(game.escapes, 1);
  }
});

test("a corrected stumble does not count and a clean stretch clears the fall streak", () => {
  const game = new SkiEngine(() => 0.5);
  game.start();
  game.nextSlalom = game.nextYeti = Infinity;
  const fallAndRecover = () => {
    startFullFall(game);
    advance(game, 78);
  };
  for (let fall = 0; fall < 4; fall++) fallAndRecover();

  game.objects = [obstacleAtPlayer(game)];
  game.tick();
  game.tick({ steer: 0, downhill: true });
  advance(game, 40);
  assert.equal(game.balance, null);
  assert.equal(game.yeti, null);

  const cleanStart = game.distance;
  while (game.distance - cleanStart < 150) {
    game.objects = [];
    game.tick();
  }
  for (let fall = 0; fall < 4; fall++) {
    fallAndRecover();
    assert.equal(game.yeti, null);
  }
  fallAndRecover();
  assert.ok(game.yeti?.y < 0);
});

test("capture freezes the ended game", () => {
  const game = new SkiEngine(rng());
  game.start();
  assert.equal(game.stage, "descent");
  game.distance = game.nextYeti + 1;
  game.tick();
  assert.equal(game.stage, "pursuit");
  game.yeti.x = game.player.x;
  game.yeti.y = game.player.y - 10;
  game.tick();
  assert.equal(game.phase, "over");
  const ended = JSON.stringify(game);
  advance(game, 120);
  assert.equal(JSON.stringify(game), ended);
});

test("encounters vary in distance and side and leave just one clue", () => {
  const distances = new Set();
  const sides = new Set();
  for (const [roll, expected] of [[0.05, "tracks"], [0.25, "tracks"], [0.5, "glimpse"], [0.9, "step"]]) {
    let draws = 0;
    const game = new SkiEngine(() => ++draws === 5 ? 0.75 : roll);
    game.start();
    game.nextSlalom = Infinity;
    game.distance = game.nextYeti - 400;
    game.objects = [];
    game.player.x = 280;
    assert.ok(game.nextYeti >= 2000 && game.nextYeti < 2700);
    const tracks = new Set();
    const trees = new Set();
    let steps = 0;
    while (game.distance < game.nextYeti && !game.yeti) {
      game.tick();
      if (game.glimpse) trees.add(game.glimpse.treeId);
      for (const object of game.objects) {
        if (object.kind === "tracks") tracks.add(object.id);
      }
      steps += game.events.filter(event => event.type === "yeti-distant-step").length;
    }
    assert.deepEqual([tracks.size, trees.size, steps], [
      Number(expected === "tracks"), Number(expected === "glimpse"), Number(expected === "step"),
    ]);
    const appearance = game.events.find(event => event.type === "yeti-appear");
    assert.ok(appearance);
    sides.add(appearance.x);
    distances.add(game.distance);
  }
  assert.equal(distances.size, 4);
  assert.deepEqual(sides, new Set([70, SKI_WIDTH - 70]));
});

test("a single group of tracks reaches the viewport inside the ski corridor", () => {
  for (const layout of ["landscape", "portrait"]) {
    const game = new SkiEngine(() => 0.05, layout);
    game.start();
    game.objects = [];
    game.nextSlalom = Infinity;
    game.distance = game.nextYeti - 175;
    game.terrainRow = 13;
    game.laneCenter = game.player.x = game.width * 0.55;
    game.spawnDistance = 135;
    game.tick();

    const tracks = game.objects.find(object => object.kind === "tracks");
    assert.ok(tracks);
    assert.ok(Math.abs(tracks.x - game.player.x) <= 34);
    assert.ok(Math.abs(tracks.x - game.laneCenter) <= 26);
    assert.ok(tracks.y > game.height);
    advance(game, 30);
    assert.ok(tracks.y > game.player.y && tracks.y <= game.height);
    assert.deepEqual(game.objects.filter(object => object.kind === "tracks"), [tracks]);
    assert.equal(game.yeti, null);
  }
});

test("a fast downhill run can escape a pursuit; next encounter has a quiet interval", () => {
  const game = new SkiEngine(() => 0.75);
  game.start(); game.distance = game.nextYeti + 1;
  for (let i = 0; i < 1442 && game.escapes === 0; i++) {
    game.objects = [];
    game.tick({ steer: 0, downhill: true });
  }
  assert.equal(game.phase, "running");
  assert.equal(game.yeti, null);
  assert.equal(game.escapes, 1);
  assert.equal(game.stage, "descent");
  advance(game, 120, { steer: 0, downhill: true });
  assert.equal(game.stage, "descent");
});

test("the yeti closes the gap in one rush and loses ground while catching its breath", () => {
  const game = new SkiEngine(() => 0.1);
  game.start();
  game.distance = game.nextYeti;
  let tiredCues = 0;
  const downhill = () => {
    game.objects = [];
    game.tick({ steer: 0, downhill: true });
    tiredCues += game.events.filter(event => event.type === "yeti-tired").length;
  };
  downhill();
  const entrance = game.events.find(event => event.type === "yeti-appear");
  assert.ok(entrance);
  while (game.yeti.age < 1 && tiredCues === 0) downhill();
  assert.equal(tiredCues, 1);
  assert.ok(game.yeti.y - entrance.y >= 40 && game.yeti.y - entrance.y <= 60);
  assert.ok(Math.abs(game.yeti.x - game.player.x) < Math.abs(entrance.x - game.player.x) - 100);
  assert.ok(game.yeti.strideAge > game.yeti.age);

  const { y, strideAge } = game.yeti;
  downhill();
  const tiredLoss = y - game.yeti.y;
  assert.ok(tiredLoss > 0);
  assert.ok(game.yeti.strideAge - strideAge < 1 / 60);
  while (game.yeti.age < 2.8) downhill();
  const recoveredY = game.yeti.y;
  downhill();
  assert.ok(recoveredY - game.yeti.y < tiredLoss);
  assert.equal(tiredCues, 1);
  assert.equal(game.phase, "running");
});

test("both entrances keep the whole yeti on screen during its rush and leave room to react", () => {
  for (const layout of ["landscape", "portrait"]) for (const side of [-1, 1]) {
    const game = new SkiEngine(() => 0.1, layout);
    game.yetiSide = side;
    game.start();
    game.distance = game.nextYeti;
    game.player.x = side < 0 ? 26 : game.width - 26;
    game.player.heading = side * SKI_MAX_HEADING;
    let tired = false;
    for (let tick = 0; tick < 60 && !tired; tick++) {
      game.objects = [];
      game.tick();
      assert.ok(game.yeti.y >= 66);
      assert.ok(game.player.y - game.yeti.y > 23);
      assert.equal(game.phase, "running");
      tired = game.events.some(event => event.type === "yeti-tired");
    }
    assert.ok(tired);
  }
});

test("a delayed rush gives one warning and steady or distant pursuit does not rush", () => {
  for (const [roll, nearby] of [[0.5, true], [0.5, false], [0.75, true]]) {
    const game = new SkiEngine(() => roll);
    game.start();
    game.distance = game.nextYeti;
    if (!nearby) game.player.x = 26;
    const warningTimes = [];
    let breathCount = 0;
    for (let tick = 0; tick < 180; tick++) {
      game.objects = [];
      game.tick({ steer: 0, downhill: true });
      if (game.events.some(event => event.type === "yeti-windup")) warningTimes.push(game.yeti.age);
      breathCount += game.events.filter(event => event.type === "yeti-tired").length;
    }
    if (roll === 0.5 && nearby) {
      assert.equal(warningTimes.length, 1);
      assert.ok(game.yeti.blinkAt >= 0.8 && game.yeti.blinkAt <= 1.6);
      assert.ok(game.yeti.blinkAt - warningTimes[0] >= 0.18);
      assert.equal(breathCount, 1);
    } else {
      assert.deepEqual(warningTimes, []);
      assert.equal(game.yeti.blinkAt, null);
      assert.equal(breathCount, 0);
    }
  }
});

test("the front yeti waits on the slope, then leaves a path past the charge and pine", () => {
  for (const layout of ["landscape", "portrait"]) for (const side of [-1, 1]) {
    const game = new SkiEngine(() => 0.9, layout);
    game.start();
    game.nextSlalom = Infinity;
    game.distance = game.nextYeti - 64;
    game.player.x = side < 0 ? 26 : game.width - 26;
    for (let tick = 0; tick < 150 && !game.yeti; tick++) game.tick();
    assert.equal(game.yeti.attack.kind, "standing");
    assert.ok(game.yeti.y > game.height + 64);
    assert.equal(game.stage, "descent");
    const line = game.yeti.x;
    const pine = game.objects.find(object => object.kind === "pine" && object.y === game.yeti.y + 25);
    assert.ok(pine);
    for (let tick = 0; tick < 30 && game.yeti.y > game.height; tick++) {
      game.tick();
      assert.equal(game.yeti.attack.kind, "standing");
      assert.equal(game.yeti.x, line);
      assert.equal(game.yeti.strideAge, 0);
      assert.ok(Math.abs(pine.y - game.yeti.y - 25) < 1e-8);
      assert.ok(!game.events.some(event => event.type === "yeti-appear"));
    }
    assert.ok(game.yeti.y <= game.height);
    const target = (line + pine.x) / 2;
    let passed = false;
    let turned = false;
    let charges = 0;
    let visibleStandingTicks = 0;
    for (let tick = 0; tick < 540 && !game.escapes; tick++) {
      if (passed) game.objects = [];
      game.tick({ steer: 0, heading: Math.atan2(target - game.player.x, 84) });
      if (game.yeti?.attack.kind === "standing") visibleStandingTicks++;
      charges += game.events.filter(event => event.type === "yeti-appear" && event.front).length;
      if (game.yeti?.attack.kind === "head-on") assert.equal(game.yeti.x, line);
      if (game.yeti?.attack.kind === "turning") {
        assert.ok(game.yeti.y < game.player.y);
        turned = true;
      }
      assert.equal(game.events.some(event => event.type === "collision"), false);
      assert.equal(game.phase, "running");
      passed ||= pine.passed && game.yeti?.y < game.player.y;
    }
    assert.ok(visibleStandingTicks >= 12);
    assert.equal(charges, 1);
    assert.ok(passed && turned);
    assert.equal(game.escapes, 1);
  }
});

test("skiing straight into a head-on yeti ends the run", () => {
  const game = new SkiEngine(() => 0.9);
  game.start();
  game.distance = game.nextYeti;
  for (let tick = 0; tick < 60 && game.phase === "running"; tick++) game.tick();
  assert.equal(game.phase, "over");
  assert.ok(game.events.some(event => event.type === "capture"));
  assert.equal(game.escapes, 0);
});

test("escaping requires a real gap rather than simply surviving a timer", () => {
  const game = new SkiEngine(() => 0.75);
  game.start(); game.distance = game.nextYeti + 1; game.objects = [];
  game.tick();
  game.yeti.x = game.player.x;
  game.yeti.y = game.player.y - 90;
  game.yeti.age = 30;
  game.player.heading = headingForDescent(0.9);
  game.tick();
  assert.equal(game.phase, "running");
  assert.equal(game.escapes, 0);
  assert.ok(game.yeti);
  assert.ok(Math.abs((game.player.y - game.yeti.y) - 90) < 1e-9);
  game.player.heading = 0;
  const before = game.player.y - game.yeti.y;
  game.tick();
  assert.ok(game.player.y - game.yeti.y > before);
  game.yeti.y = game.player.y - SKI_YETI_ESCAPE_GAP;
  game.tick();
  assert.equal(game.yeti, null);
  assert.equal(game.escapes, 1);
  assert.equal(game.events.filter(event => event.type === "escape").length, 1);
});

test("turning and collision recovery let the yeti gain ground without overshooting", () => {
  for (const hit of [false, true]) {
    const game = new SkiEngine(() => 0.75);
    game.start(); game.distance = game.nextYeti + 1; game.objects = [];
    game.tick();
    game.yeti.age = 3;
    game.yeti.x = game.player.x;
    game.yeti.y = game.player.y - 90;
    if (hit) {
      game.objects = [obstacleAtPlayer(game)];
      game.tick({ steer: 0, downhill: true });
      assert.equal(game.balance.pose, "stumble");
    } else {
      game.player.heading = headingForDescent(0.6);
    }
    const before = game.player.y - game.yeti.y;
    game.tick();
    assert.ok(game.player.y - game.yeti.y < before);
    game.yeti.x = game.player.x > SKI_WIDTH / 2 ? 26 : SKI_WIDTH - 26;
    game.yeti.y = game.player.y;
    game.player.heading = SKI_MAX_HEADING;
    game.tick();
    assert.equal(game.yeti.y, game.player.y);
  }
});

test("terrain phrases vary density and corridor width while preserving a traversable gap", () => {
  const game = new SkiEngine(() => 0.5);
  game.start();
  const rows = [];
  for (let i = 0; i < 24; i++) {
    game.objects = [];
    // Each tick asks for one new row without depending on a particular player route.
    game.spawnDistance = 135;
    game.tick();
    if (i >= 15 && i <= 17) continue; // The edge bank replaces one side of these rows.
    const obstacles = game.objects.filter(object => object.kind !== "tracks");
    assert.equal(obstacles.length, 2);
    assert.ok(obstacles[1].x - obstacles[0].x >= 140);
    rows[i] = obstacles.map(object => object.x);
  }
  const width = row => row[1] - row[0];
  assert.ok(width(rows[0]) > width(rows[6]));
  assert.ok(width(rows[6]) > width(rows[12]));
  assert.ok(width(rows[18]) > width(rows[12]));
  assert.notEqual(rows[7][0], rows[8][0]);
});

test("edge banks grow inward over three rows and alternate sides in both layouts", () => {
  for (const layout of ["landscape", "portrait"]) {
    // Force ordinary obstacles to be skipped so the bank must close the edge on its own.
    const game = new SkiEngine(() => 0, layout);
    game.start();
    const rows = [];
    for (let i = 0; i < 48; i++) {
      game.objects = [];
      game.spawnDistance = 135;
      game.tick();
      rows.push(game.objects.map(object => object.x));
    }
    for (const [start, fromEdge] of [[15, inset => inset], [39, inset => game.width - inset]]) {
      assert.deepEqual(rows[start - 1], []);
      assert.deepEqual(rows[start + 3], []);
      for (const [step, count] of [1, 2, 3].entries()) {
        const bank = rows[start + step];
        assert.equal(bank.length, count);
        for (let inset = 26; inset <= 36 + step * 40; inset++) {
          assert.ok(bank.some(x => Math.abs(x - fromEdge(inset)) < 23), `unblocked edge at inset ${inset}`);
        }
        assert.ok(bank.every(x => Math.abs(x - game.width / 2) >= 70), "the middle remains open");
      }
    }
  }
});

const startSlalom = (distance, random = () => 0.5, layout = "landscape") => {
  const game = new SkiEngine(random, layout);
  game.start();
  game.objects = [];
  game.distance = distance;
  game.nextYeti = 1e9;
  game.spawnDistance = 135;
  game.tick();
  return game;
};

test("slalom starts after the tutorial, previews its gates, and increases difficulty by distance", () => {
  const tutorial = startSlalom(200);
  assert.equal(tutorial.slalom, null);
  const courses = [700, 3500, 6500].map(distance => startSlalom(distance));
  for (let i = 0; i < courses.length; i++) {
    const game = courses[i];
    assert.equal(game.slalom.level, i + 1);
    assert.equal(game.slalom.spawned, 0);
    assert.equal(game.events.filter(event => event.type === "slalom-start").length, 1);
    assert.ok(game.objects.length <= 2, "the approach remains open");
  }
  for (let i = 1; i < courses.length; i++) {
    assert.ok(courses[i].slalom.gates > courses[i - 1].slalom.gates);
    assert.ok(courses[i].slalom.halfWidth < courses[i - 1].slalom.halfWidth);
    assert.ok(courses[i].slalom.spacing < courses[i - 1].slalom.spacing);
  }
});

test("slalom gates alternate real openings with no straight center or edge bypass", () => {
  for (const distance of [700, 3500, 6500]) {
    const game = startSlalom(distance);
    const course = game.slalom;
    const openings = [];
    for (let i = 0; i < course.gates; i++) {
      game.objects = [];
      game.spawnDistance = course.spacing;
      game.tick();
      const bank = [...game.objects].sort((a, b) => a.x - b.x);
      const gaps = bank.slice(1).map((object, index) => [bank[index].x, object.x]);
      const opening = gaps.find(([left, right]) => right - left > 44.01);
      assert.ok(opening);
      assert.equal(gaps.filter(([left, right]) => right - left > 44.01).length, 1);
      assert.equal(opening[1] - opening[0], course.halfWidth * 2);
      assert.equal(bank[0].x, 36);
      assert.equal(bank.at(-1).x, SKI_WIDTH - 36);
      openings.push([opening[0] + 27, opening[1] - 27]);
      if (i) assert.ok((openings[i][0] - 320) * (openings[i - 1][0] - 320) < 0);
    }
    assert.ok(Math.max(...openings.map(([left]) => left)) > Math.min(...openings.map(([, right]) => right)));
    assert.ok(game.slalom, "the last gate must reach the skier before the course ends");
    let ended = false;
    for (let i = 0; i < 180 && !ended; i++) {
      game.objects = [];
      game.tick();
      ended = game.events.some(event => event.type === "slalom-end");
    }
    assert.ok(ended);
    assert.equal(game.slalom, null);
    advance(game, 120);
    assert.equal(game.slalom, null, "a recovery interval separates courses");
  }
});

test("pursuit and slalom stay separate even in experienced advanced runs", () => {
  for (const [distance, escapes, expected] of [[2000, 0, false], [6500, 0, false], [3500, 1, false], [6500, 1, false]]) {
    const game = new SkiEngine(() => 0.5);
    game.start(); game.objects = []; game.distance = distance; game.escapes = escapes;
    game.yeti = { x: 70, y: 16, age: 0, strideAge: 0, blinkAt: null, attack: { kind: "pursuit" } };
    game.spawnDistance = 135;
    game.tick();
    assert.equal(Boolean(game.slalom), expected);
  }
});

test("finishing slalom reserves normal terrain before the next challenge", () => {
  const game = startSlalom(700);
  game.slalom.spawned = game.slalom.gates;
  game.slalom.lastGateY = game.player.y - 12;
  game.nextYeti = game.distance + 10;
  game.tick();
  const finished = game.distance;
  assert.equal(game.slalom, null);
  assert.equal(game.nextSlalom, finished + SKI_SLALOM_INTERVAL);
  assert.ok(game.nextYeti > finished + SKI_NORMAL_INTERVAL);
  assert.equal(game.stage, "descent");
  game.nextSlalom = 0; // Even an overdue slalom must respect the shared interval.
  let normalRows = 0;
  while (game.distance < finished + SKI_NORMAL_INTERVAL - 2) {
    game.objects = [];
    game.tick({ steer: 0, downhill: true });
    if (game.objects.some(object => object.kind === "pine" || object.kind === "rock")) normalRows++;
    assert.equal(game.slalom, null);
    assert.equal(game.yeti, null);
    assert.equal(game.stage, "descent");
  }
  assert.ok(normalRows >= 30, "ordinary obstacle rows occupy the interval");
});

test("a fall-streak pursuit waits until the skier is past the slalom exit", () => {
  const game = startSlalom(700);
  for (let fall = 0; fall < 5; fall++) {
    startFullFall(game);
    advance(game, 78);
    assert.equal(game.yeti, null);
  }
  assert.equal(game.balance, null);
  assert.ok(game.slalom);

  game.slalom.spawned = game.slalom.gates;
  game.slalom.lastGateY = game.player.y - 12;
  game.objects = [];
  game.tick();
  assert.equal(game.slalom, null);
  assert.equal(game.yeti, null);
  for (let tick = 0; tick < 150 && !game.yeti; tick++) {
    game.objects = [];
    game.tick();
  }
  assert.ok(game.yeti?.y < 0);
});

test("three separate cracks reveal the yeti before the first pursuit and end in a pine corridor", () => {
  for (const layout of ["landscape", "portrait"]) for (const roll of [0.05, 0.5, 0.9]) {
    const game = new SkiEngine(() => roll, layout);
    const beats = [];
    let explanations = 0;
    let lastGlimpseDuration = 0;
    game.start();
    for (let tick = 0; tick < 7500 && game.stage !== "pursuit"; tick++) {
      game.tick({ steer: 0, downhill: true });
      if (game.events.some(event => event.type === "yeti-explanation")) {
        explanations++;
        assert.ok(Math.abs(game.elapsed - beats[2].elapsed - 1.3) < 1e-4);
        const peek = game.glimpse;
        assert.ok(peek && peek.age < 0.02);
        const tree = game.objects.find(object => object.id === peek.treeId);
        assert.ok(tree.y > 64 && tree.y < game.height);
        const oppositeTree = game.objects.find(object => object.kind === "pine" &&
          object.y === tree.y && Math.abs(object.x - tree.x) >= 175);
        assert.ok(oppositeTree);
        lastGlimpseDuration = peek.duration;
        const distance = game.distance;
        const x = game.player.x;
        game.tick({ steer: 1 });
        assert.ok(game.distance > distance && game.player.x > x);
        game.tick({ steer: 0, downhill: true });
      }
      const crack = game.events.find(event => event.type === "yeti-crack");
      if (!crack) continue;
      assert.equal(game.phase, "running");
      assert.equal(game.yeti, null);
      const peek = game.glimpse;
      if (crack.count === 3) assert.equal(peek, null);
      else {
        const tree = game.objects.find(object => object.id === peek.treeId);
        assert.equal(tree.kind, "pine");
        assert.ok(tree.y > 0 && tree.y < game.height);
        if (crack.count === 2)
          assert.ok(game.objects.some(object => object.id === peek.exitTreeId && object.kind === "pine"));
      }
      beats.push({ count: crack.count, side: crack.side, duration: peek?.duration, distance: game.distance, elapsed: game.elapsed });
    }
    assert.deepEqual(beats.map(beat => beat.count), [1, 2, 3]);
    assert.deepEqual(beats.map(beat => beat.side), [beats[0].side, -beats[0].side, beats[0].side]);
    assert.equal(explanations, 1);
    assert.ok(lastGlimpseDuration > beats[1].duration && beats[1].duration > beats[0].duration);
    assert.ok(game.yeti && game.distance - beats[2].distance > 170);
    game.reset();
    assert.equal(game.yetiScene, null);
    assert.equal(game.glimpse, null);
  }
});

test("escaping the yeti also postpones slalom and schedules a longer repeat interval", () => {
  const game = new SkiEngine(() => 0.5);
  game.start(); game.objects = []; game.distance = game.nextYeti + 1;
  game.tick();
  game.yeti.age = 6;
  game.yeti.y = game.player.y - SKI_YETI_ESCAPE_GAP;
  game.tick();
  const finished = game.distance;
  assert.equal(game.yeti, null);
  assert.ok(game.nextYeti >= finished + 2200 && game.nextYeti < finished + 3200);
  game.nextSlalom = 0;
  game.distance = finished + SKI_NORMAL_INTERVAL - 100;
  game.spawnDistance = 135;
  game.tick();
  assert.equal(game.slalom, null);
  assert.equal(game.stage, "descent");
  assert.equal(game.glimpse, null);
});

const startGlimpse = () => {
  const game = new SkiEngine(() => 0.5);
  game.start(); game.objects = []; game.distance = game.nextYeti - 200;
  game.nextSlalom = Infinity; game.spawnDistance = 135;
  game.tick();
  return game;
};

test("the yeti silently peeks behind a lateral pine only after its tree becomes visible", () => {
  const game = startGlimpse();
  assert.equal(game.stage, "descent");
  assert.ok(game.glimpse);
  const tree = game.objects.find(object => object.id === game.glimpse.treeId);
  assert.equal(tree.kind, "pine");
  assert.ok(Math.abs(tree.x - SKI_WIDTH / 2) >= 120);
  assert.equal(game.glimpse.side, tree.x < SKI_WIDTH / 2 ? 1 : -1);
  assert.equal(game.glimpse.age, 0);
  assert.deepEqual(game.events, [], "the glimpse produces no audio or feedback event");
  const initialY = tree.y;
  advance(game, 20);
  assert.ok(tree.y < initialY);
  assert.ok(game.glimpse.age > 0);
  assert.equal(game.glimpse.treeId, tree.id);
  game.pause();
  const frozen = JSON.stringify(game);
  advance(game, 120);
  assert.equal(JSON.stringify(game), frozen);
  game.start();
  advance(game, 100);
  assert.equal(game.glimpse, null);
  assert.equal(game.yeti, null);
  assert.equal(game.balance, null);
  game.distance = game.nextYeti - 150; game.terrainRow = 0; game.spawnDistance = 135;
  game.tick();
  assert.equal(game.glimpse, null, "only one glimpse per encounter");
});

test("glimpses wait for open rows and never appear in slalom gates or their exit", () => {
  const narrow = new SkiEngine(() => 0.5);
  narrow.start(); narrow.objects = []; narrow.distance = narrow.nextYeti - 200; narrow.nextSlalom = Infinity;
  narrow.terrainRow = 12; narrow.spawnDistance = 135;
  narrow.tick();
  assert.equal(narrow.glimpse, null);
  narrow.terrainRow = 18; narrow.spawnDistance = 135;
  narrow.tick();
  assert.ok(narrow.glimpse);
  const course = startSlalom(700);
  course.nextYeti = 2000; course.distance = 1800;
  for (let i = 0; i < 8; i++) {
    course.spawnDistance = 330;
    course.tick();
    assert.ok(course.slalom);
    assert.equal(course.glimpse, null);
  }
});

test("pursuit and reset remove the glimpse without turning it into a collidable enemy", () => {
  const game = startGlimpse();
  const tree = game.objects.find(object => object.id === game.glimpse.treeId);
  game.player.x = tree.x + game.glimpse.side * 40;
  tree.y = game.player.y + 2;
  game.tick();
  assert.equal(game.balance, null);
  assert.equal(game.nearMisses, 0);
  assert.deepEqual(game.events, []);
  game.distance = game.nextYeti + 1;
  game.tick();
  assert.equal(game.glimpse, null);
  assert.ok(game.yeti);
  assert.equal(game.events.filter(event => event.type === "yeti-appear").length, 1);
  game.reset();
  assert.equal(game.glimpse, null);
  assert.equal(game.yetiClue, "glimpse");
});

for (const layout of ["landscape", "portrait"]) test(`every ${layout} slalom tier is traversable without collisions`, () => {
  for (const distance of [700, 3500, 6500]) for (const seed of [0, 1, 2, 3]) {
    let value = seed;
    const game = startSlalom(distance, () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 2 ** 32; }, layout);
    let ended = false;
    for (let i = 0; i < 1800 && !ended; i++) {
      const rows = new Map();
      for (const object of game.objects) {
        if (object.kind === "tracks" || object.y < game.player.y - 12) continue;
        const key = object.y.toFixed(3);
        if (!rows.has(key)) rows.set(key, []);
        rows.get(key).push(object);
      }
      const gate = [...rows.values()].filter(row => row.length >= 4).sort((a, b) => a[0].y - b[0].y)[0];
      let heading = 0;
      if (gate) {
        gate.sort((a, b) => a.x - b.x);
        const gaps = gate.slice(1).map((object, index) => [gate[index].x, object.x]);
        const [left, right] = gaps.sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0];
        // Anticipate the next turn by taking the inner side of the opening,
        // with twenty pixels of clearance beyond the largest collision radius.
        const target = (left + right) / 2 < game.width / 2 ? right - 47 : left + 47;
        heading = Math.atan2(target - game.player.x, Math.max(45, gate[0].y - game.player.y));
      }
      game.tick({ steer: 0, heading });
      assert.equal(game.events.some(event => event.type === "collision"), false, `tier ${game.slalom?.level}, seed ${seed}`);
      assert.ok(game.objects.length < 40);
      ended = game.events.some(event => event.type === "slalom-end");
    }
    assert.ok(ended);
  }
});

test("portrait bounds cover terrain, player, and pursuit", () => {
  const game = new SkiEngine(() => 0.5, "portrait");
  assert.deepEqual([game.width, game.height, game.player.x, game.player.y], [400, 500, 200, 150]);
  assert.ok(game.objects.some(object => object.y > 360 && object.y < game.height));
  game.start();
  game.objects = [];
  game.player.x -= 1;
  game.distance = game.nextYeti + 1;
  game.tick();
  assert.ok(game.yeti.x >= game.width - 75 && game.yeti.x <= game.width - 70);
  game.yeti = null;
  game.nextYeti = Infinity;
  advance(game, 210, { steer: 1 });
  assert.equal(game.player.x, game.width - 26);
});

test("reset clears pursuit, records of the run, heading, and trails", () => {
  const game = new SkiEngine(rng());
  game.start(); game.distance = 900;
  advance(game, 30, { steer: 1, downhill: true });
  game.objects = [obstacleAtPlayer(game)];
  game.tick();
  assert.equal(game.balance.pose, "stumble");
  game.reset();
  assert.equal(game.phase, "ready");
  assert.equal(game.distance, 0);
  assert.equal(game.elapsed, 0);
  assert.equal(game.yeti, null);
  assert.equal(game.balance, null);
  assert.equal(game.escapes, 0);
  assert.equal(game.slalom, null);
  assert.deepEqual(game.trails, []);
  assert.deepEqual(game.player, { x: 320, y: 142, heading: 0 });
});

test("seeded runs are deterministic and world collections remain bounded", () => {
  const a = new SkiEngine(rng()); const b = new SkiEngine(rng());
  a.start(); b.start();
  for (let i = 0; i < 5000; i++) {
    const input = { steer: Math.sin(i / 90), downhill: i % 360 < 90 };
    a.tick(input); b.tick(input);
    assert.ok(a.objects.length < 40);
    assert.ok(a.trails.length < 40);
    if (a.phase === "over") { a.start(); b.start(); }
  }
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});
