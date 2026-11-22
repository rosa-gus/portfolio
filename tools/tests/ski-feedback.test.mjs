import assert from "node:assert/strict";
import test from "node:test";
import { SkiEngine, SKI_STEP } from "../../web/scripts/games/ski/ski-engine.ts";
import { SKI_CAPTURE_CONTACT, SKI_CAPTURE_DURATION, SkiFeedback } from "../../web/scripts/games/ski/ski-feedback.ts";

test("close successive near misses share one readable caption without changing score", () => {
  const game = new SkiEngine(() => 0.5);
  game.start();
  const feedback = new SkiFeedback();
  const event = { type: "near-miss", x: 610, y: 142, points: 50 };
  feedback.step(game, 0, 1 / 60, [event]);
  feedback.step(game, 0, 0.1, [event]);
  assert.equal(feedback.captions.length, 1);
  assert.equal(feedback.captions[0].text, "por pouco ×2 +100");
  assert.ok(feedback.captions[0].x <= 530);
  assert.equal(game.score, 0);
  feedback.step(game, 0, 0.3, [event]);
  assert.equal(feedback.captions.length, 2);
  feedback.reset();
  assert.equal(feedback.captions.length, 0);
  assert.equal(feedback.snow.length, 0);
});

test("slalom entry and exit use the existing floating feedback", () => {
  const game = new SkiEngine(() => 0.5);
  const feedback = new SkiFeedback();
  feedback.step(game, 0, 1 / 60, [{ type: "slalom-start", level: 1 }]);
  assert.equal(feedback.captions[0].text, "slalom à frente.");
  feedback.step(game, 0, 2, [{ type: "slalom-end", x: 320, y: 142 }]);
  assert.equal(feedback.captions.length, 1);
  assert.equal(feedback.captions[0].text, "pista aberta.");
});

test("a fall sends a low spray to the side and leaves a short snow trail", () => {
  for (const side of ["left", "right"]) {
    const game = new SkiEngine(() => 0.5);
    game.start();
    game.speed = 60;
    game.balance = { pose: "fall", side, ticks: 0 };
    const feedback = new SkiFeedback();
    const { x, y } = game.player;
    feedback.step(game, 1, SKI_STEP, [{ type: "fall", side, x, y }]);
    assert.ok(feedback.snow.length > 0);
    assert.ok(feedback.snow.every(particle => (side === "left" ? particle.vx < 0 : particle.vx > 0)
      && particle.vy <= 0 && particle.vy >= -22));

    for (let ticks = 1; ticks <= 3; ticks++) {
      game.balance.ticks = ticks;
      feedback.step(game, 1, SKI_STEP, []);
    }
    assert.ok(feedback.snow.some(particle => particle.age === 0), "the slide leaves fresh snow behind");
    game.balance.ticks = 12;
    feedback.step(game, 1, SKI_STEP, []);
    assert.ok(feedback.snow.every(particle => particle.age > 0), "the tail ends early in the fall");
  }
});

test("capture snow starts at contact and clears before the results", () => {
  const game = new SkiEngine(() => 0.5);
  game.phase = "over";
  const feedback = new SkiFeedback();
  feedback.step(game, 0, SKI_STEP, [{ type: "capture", x: game.player.x, y: game.player.y }]);
  assert.equal(feedback.endAge, 0);
  while (feedback.endAge + SKI_STEP < SKI_CAPTURE_CONTACT) feedback.step(game, 0, SKI_STEP, []);
  assert.equal(feedback.snow.length, 0);
  feedback.step(game, 0, SKI_STEP, []);
  assert.ok(feedback.snow.length > 0);
  while (feedback.endAge + 1e-6 < SKI_CAPTURE_DURATION) {
    feedback.step(game, 0, SKI_STEP, []);
    assert.ok(feedback.snow.every(particle => particle.age > 0), "contact emits once");
  }
  assert.equal(feedback.snow.length, 0);
});
