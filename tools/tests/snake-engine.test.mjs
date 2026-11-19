import assert from "node:assert/strict";
import test from "node:test";
import { SnakeEngine } from "../../web/scripts/snake/snake-engine.ts";

test("only one turn per tick; reversing direction is rejected", () => {
  const game = new SnakeEngine(() => 0.5);
  game.start();
  game.turn("left");
  game.tick();
  assert.deepEqual(game.body[0], { x: 10, y: 9 });
  game.turn("up");
  game.turn("left");
  game.tick();
  assert.deepEqual(game.body[0], { x: 10, y: 8 });
});

test("food grows the snake and respawns outside its body", () => {
  const game = new SnakeEngine(() => 0.5);
  game.food = { x: 10, y: 9, bonus: 1 };
  game.start();
  game.tick();
  assert.equal(game.score, 1);
  assert.ok(!game.body.some((cell) => cell.x === game.food.x && cell.y === game.food.y));
});

test("rare food adds three segments over successive ticks", () => {
  const game = new SnakeEngine(() => 0.5);
  game.food = { x: 10, y: 9, bonus: 3 };
  game.start();
  for (let step = 0; step < 3; step++) game.tick();
  assert.equal(game.score, 3);
});

test("pause freezes the game; restart resets direction and progression", () => {
  const game = new SnakeEngine(() => 0.5);
  game.start();
  game.pause();
  const before = JSON.stringify(game.body);
  game.tick();
  assert.equal(JSON.stringify(game.body), before);
  game.start();
  game.tick();
  assert.notEqual(JSON.stringify(game.body), before);
  game.reset();
  assert.equal(game.phase, "ready");
  assert.equal(game.score, 0);
  assert.equal(game.speed, 200);
  assert.equal(game.enemy, null);
});

test("wall and body collisions end the game", () => {
  for (const body of [
    [{ x: 19, y: 9 }],
    [{ x: 9, y: 9 }, { x: 10, y: 9 }, { x: 11, y: 9 }],
  ]) {
    const game = new SnakeEngine(() => 0.5);
    game.body = body;
    game.start();
    game.tick();
    assert.equal(game.phase, "over");
  }
});

test("moving into the departing tail is allowed", () => {
  const game = new SnakeEngine(() => 0.5);
  game.body = [{ x: 9, y: 9 }, { x: 9, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 9 }];
  game.start();
  game.tick();
  assert.equal(game.phase, "running");
});

test("filling the board wins without an infinite food respawn", () => {
  const game = new SnakeEngine(() => 0.5);
  game.body = [{ x: 0, y: 0 }];
  for (let y = 0; y < 20; y++) {
    for (let x = 0; x < 20; x++) {
      if ((x !== 0 && x !== 1) || y !== 0) game.body.push({ x, y });
    }
  }
  game.food = { x: 1, y: 0, bonus: 1 };
  game.start();
  game.tick();
  assert.equal(game.phase, "won");
  assert.equal(game.body.length, 400);
  assert.equal(game.food, null);
});

test("enemy progression and collisions remain active", () => {
  const game = new SnakeEngine(() => 0.5);
  game.body = Array.from({ length: 11 }, (_, x) => ({ x: 10 - x, y: 9 }));
  game.start();
  game.tick();
  assert.ok(game.enemy);
  assert.equal(game.speed, 160);
  game.enemy = { x: 11, y: 8, dx: 1, dy: 1, preparing: false };
  const events = game.tick();
  assert.equal(game.phase, "over");
  assert.deepEqual(events, [{ type: "death", cause: "witch" }]);
  assert.deepEqual(game.tick(), []);
});

test("witch introduction happens only once per game and resets for a new game", () => {
  const game = new SnakeEngine(() => 0.5);
  const prepare = (score) => {
    game.body = [{ x: 9, y: 9 }, ...Array.from({ length: score }, (_, index) => ({ x: index % 20, y: 15 + Math.floor(index / 20) }))];
    game.food = { x: 19, y: 0, bonus: 1 };
    game.enemy = null;
  };
  prepare(10);
  game.start();
  assert.deepEqual(game.tick(), [{ type: "witch", first: true }]);
  game.pause();
  assert.deepEqual(game.tick(), []);
  game.start();
  prepare(25);
  assert.deepEqual(game.tick(), [{ type: "witch", first: false }]);
  game.reset();
  prepare(10);
  game.start();
  assert.deepEqual(game.tick(), [{ type: "witch", first: true }]);
});

test("eating and witch arrival on the same tick both produce events", () => {
  const game = new SnakeEngine(() => 0.5);
  game.body = [{ x: 8, y: 9 }, ...Array.from({ length: 9 }, (_, x) => ({ x, y: 15 }))];
  game.food = { x: 9, y: 9, bonus: 1 };
  game.start();
  assert.deepEqual(game.tick(), [{ type: "eat" }, { type: "witch", first: true }]);
});

test("wall death produces a single death event", () => {
  const game = new SnakeEngine(() => 0.5);
  game.body = [{ x: 19, y: 9 }];
  game.start();
  assert.deepEqual(game.tick(), [{ type: "death", cause: "wall" }]);
  assert.deepEqual(game.tick(), []);
});

test("self collision is distinguished from a wall hit", () => {
  const game = new SnakeEngine(() => 0.5);
  game.body = [{ x: 9, y: 9 }, { x: 10, y: 9 }, { x: 11, y: 9 }];
  game.start();
  assert.deepEqual(game.tick(), [{ type: "death", cause: "body" }]);
});
