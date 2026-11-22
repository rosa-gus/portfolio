import assert from "node:assert/strict";
import test from "node:test";
import { SkiEngine } from "../../web/scripts/games/ski/ski-engine.ts";
import { SkiFeedback } from "../../web/scripts/games/ski/ski-feedback.ts";

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
