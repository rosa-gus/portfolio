import assert from "node:assert/strict";
import test from "node:test";
import { SkiEngine, SKI_WIDTH, SKI_MAX_HEADING } from "../../web/scripts/games/ski/ski-engine.ts";

const neutral = { steer: 0, downhill: false };
const advance = (game, count, input = neutral) => {
  for (let i = 0; i < count; i++) game.tick(input);
};
const rng = () => {
  let seed = 12345;
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
};

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

test("obstacle collisions slow instead of killing; footprints do not collide", () => {
  const game = new SkiEngine(rng());
  game.start();
  const object = kind => ({ id: 999, kind, x: game.player.x, y: game.player.y + 2, hit: false });
  game.objects = [object("tracks")];
  game.tick();
  assert.equal(game.stumble, 0);
  game.objects = [object("rock")];
  game.tick();
  assert.equal(game.stumble, 1.1);
  assert.equal(game.objects[0].hit, true);
  assert.equal(game.phase, "running");
  const speed = game.speed;
  game.tick({ steer: 0, downhill: true });
  assert.ok(game.speed < speed / 2);
  advance(game, 70);
  assert.equal(game.stumble, 0);
});

test("clues precede pursuit and capture freezes the ended game", () => {
  const game = new SkiEngine(rng());
  game.start();
  assert.equal(game.stage, "descent");
  game.distance = 450;
  assert.equal(game.stage, "tracks");
  game.distance = 801;
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

test("a fast downhill run can escape a pursuit; next encounter has a quiet interval", () => {
  const game = new SkiEngine(rng());
  game.start(); game.distance = 801;
  for (let i = 0; i < 1442; i++) {
    game.objects = [];
    game.tick({ steer: 0, downhill: true });
  }
  assert.equal(game.phase, "running");
  assert.equal(game.yeti, null);
  assert.equal(game.escapes, 1);
  assert.equal(game.stage, "descent");
});

test("reset clears pursuit, records of the run, heading, and trails", () => {
  const game = new SkiEngine(rng());
  game.start(); game.distance = 900;
  advance(game, 30, { steer: 1, downhill: true });
  game.reset();
  assert.equal(game.phase, "ready");
  assert.equal(game.distance, 0);
  assert.equal(game.elapsed, 0);
  assert.equal(game.yeti, null);
  assert.equal(game.stumble, 0);
  assert.equal(game.escapes, 0);
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
