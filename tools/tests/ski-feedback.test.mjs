import assert from "node:assert/strict";
import test from "node:test";
import { SkiEngine, SKI_STEP } from "../../web/scripts/games/ski/ski-engine.ts";
import { SKI_CAPTURE_CONTACT, SKI_CAPTURE_DURATION, SkiFeedback } from "../../web/scripts/games/ski/ski-feedback.ts";

function onlyCaption(feedback) {
  assert.equal(feedback.captions.length, 1);
  const [caption] = feedback.captions;
  assert.ok(caption.text.trim(), "the caption has visible text");
  return caption;
}

test("close successive near misses share one readable caption without changing score", () => {
  const game = new SkiEngine(() => 0.5);
  game.start();
  const feedback = new SkiFeedback();
  const event = { type: "near-miss", x: 610, y: 142, points: 50 };
  feedback.step(game, 0, 1 / 60, [event]);
  feedback.step(game, 0, 0.1, [event]);
  const caption = onlyCaption(feedback);
  assert.equal(caption.count, 2);
  assert.equal(caption.points, event.points * 2);
  assert.match(caption.text, new RegExp(`\\b${caption.count}\\b`));
  assert.match(caption.text, new RegExp(`\\b${caption.points}\\b`));
  assert.ok(caption.x <= 530);
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
  const entry = onlyCaption(feedback);
  assert.equal(entry.announcement, true);
  feedback.step(game, 0, 2, [{ type: "slalom-end", x: 320, y: 142 }]);
  const exit = onlyCaption(feedback);
  assert.equal(exit.announcement, true);
  assert.notEqual(exit.text, entry.text);
});

test("entering a blizzard displays its caption", () => {
  const game = new SkiEngine(() => 0.5);
  const feedback = new SkiFeedback();
  game.start();
  feedback.step(game, 0, SKI_STEP, [{ type: "blizzard-start", thunder: 0 }]);
  assert.equal(onlyCaption(feedback).announcement, true);
});

test("a Yeti sprint shows only the proximity caption for either entrance", () => {
  for (const rush of [true, false]) {
    const game = new SkiEngine(() => 0.5);
    const feedback = new SkiFeedback();
    game.start();
    const x = game.player.x;
    const y = rush ? -16 : game.player.y - 140;
    let previous;
    if (rush) {
      feedback.step(game, 0, SKI_STEP, [{ type: "slalom-end", x, y: game.player.y }]);
      previous = onlyCaption(feedback);
    }
    game.yeti = {
      x, y, age: 0, strideAge: 0, blinkAt: null,
      attack: { kind: rush ? "sprint" : "waiting", until: 1 },
    };
    feedback.step(game, 0, SKI_STEP, [{ type: "yeti-appear", x, y, front: false, rush }]);

    if (!rush) {
      previous = onlyCaption(feedback);
      game.yeti.attack = { kind: "sprint", until: 2 };
      feedback.step(game, 0, SKI_STEP, []);
    }
    const warning = onlyCaption(feedback);
    assert.equal(warning.announcement, true);
    assert.notEqual(warning.text, previous.text);
    feedback.step(game, 0, SKI_STEP, []);
    assert.equal(onlyCaption(feedback), warning);
  }
});

test("the third crack starts the first line and leaves space for the second", () => {
  const game = new SkiEngine(() => 0.5);
  game.start();
  const feedback = new SkiFeedback();
  const crackCaptions = [];
  for (const count of [1, 2]) {
    feedback.step(game, 0, 2, [{ type: "yeti-crack", count, side: 1 }]);
    const caption = onlyCaption(feedback);
    assert.equal(caption.fixed, true);
    crackCaptions.push(caption);
  }
  feedback.step(game, 0, 2, [{ type: "yeti-crack", count: 3, side: 1 }]);
  const firstLine = onlyCaption(feedback);
  assert.equal(firstLine.fixed, true);
  assert.equal(firstLine.y, game.player.y - 78);
  assert.ok(crackCaptions.every(caption => caption.text !== firstLine.text));
  assert.equal(firstLine.life, 0.9);
  feedback.step(game, 0, 0.9, []);
  assert.deepEqual(feedback.captions, []);
  feedback.step(game, 0, 0.4, [{ type: "yeti-explanation" }]);
  const secondLine = onlyCaption(feedback);
  assert.notEqual(secondLine.text, firstLine.text);
  assert.equal(secondLine.fixed, true);
  assert.equal(secondLine.life, 1.8);
  assert.equal(secondLine.y, firstLine.y);
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

test("wind lifts a staggered patch of snow between quiet stretches", () => {
  for (const layout of ["landscape", "portrait"]) {
    const game = new SkiEngine(() => 0.5, layout);
    const feedback = new SkiFeedback();
    game.start();
    for (let tick = 0; tick < 110; tick++) feedback.step(game, 4, SKI_STEP, []);
    assert.ok(feedback.windSnow.length <= 3);

    let gust = [];
    for (let tick = 0; tick < 10 && !gust.length; tick++) {
      feedback.step(game, 4, SKI_STEP, []);
      gust = feedback.windSnow.filter(grain => Math.abs(grain.vx) >= 120);
    }
    assert.ok(gust.length >= 13);
    assert.ok(gust.every(grain => Math.sign(grain.vx) === Math.sign(gust[0].vx)));
    assert.ok(Math.max(...gust.map(grain => grain.y)) - Math.min(...gust.map(grain => grain.y)) <= 30);
    assert.ok(gust.every(grain => grain.age < 0));
    assert.ok(new Set(gust.map(grain => grain.age)).size > 1);

    for (let tick = 0; tick < 90; tick++) feedback.step(game, 4, SKI_STEP, []);
    assert.ok(feedback.windSnow.length <= 3, "the gust has dispersed");
    feedback.reset();
    assert.deepEqual(feedback.windSnow, []);
  }
});

test("wind follows the terrain without taking its direction from the skier", () => {
  const game = new SkiEngine(() => 0.5);
  const feedback = new SkiFeedback();
  game.start();
  for (let tick = 0; tick < 9; tick++) feedback.step(game, 0, SKI_STEP, []);
  const grain = feedback.windSnow[0];
  const { x, y, vx, vy } = grain;
  game.player.heading = -Math.sign(vx);
  feedback.step(game, 5, SKI_STEP, []);
  assert.equal(Math.sign(grain.x - x), Math.sign(vx));
  assert.equal(grain.y, y + (vy * SKI_STEP - 5));
  game.pause();
  const paused = structuredClone(feedback.windSnow);
  feedback.step(game, 0, SKI_STEP, []);
  assert.deepEqual(feedback.windSnow, paused);
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
