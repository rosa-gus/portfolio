import assert from "node:assert/strict";
import test from "node:test";
import { createSkiAudio } from "../../web/scripts/games/ski/ski-audio.ts";
import { yetiStride } from "../../web/scripts/games/ski/ski-yeti.ts";

const withAudioMock = async run => {
  const originalAudio = globalThis.AudioContext;
  const originalFetch = globalThis.fetch;
  const sources = [];
  const filters = [];
  const parameter = () => ({ value: 0, targets: [], setTargetAtTime(value, _time, easing) {
    this.target = value;
    this.easing = easing;
    this.targets.push(value);
  } });
  const node = () => ({ connect(target) { this.output = target; return target; }, disconnect() {} });
  globalThis.AudioContext = class {
    currentTime = 0;
    state = "running";
    destination = node();
    resume() { return Promise.resolve(); }
    decodeAudioData(bytes) { return Promise.resolve(new TextDecoder().decode(bytes)); }
    createGain() { return { ...node(), gain: parameter() }; }
    createBiquadFilter() {
      const filter = { ...node(), frequency: parameter(), Q: parameter() };
      filters.push(filter);
      return filter;
    }
    createBufferSource() {
      const source = { ...node(), playbackRate: parameter(), start(...args) { this.startArgs = args; }, stop() { this.stopped = true; this.onended?.(); } };
      sources.push(source);
      return source;
    }
  };
  globalThis.fetch = async url => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode(String(url)).buffer });
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  try {
    await run({ audio: createSkiAudio(yetiStride), sources, filters, flush });
  } finally {
    globalThis.AudioContext = originalAudio;
    globalThis.fetch = originalFetch;
  }
};

test("sliding stays quiet, follows speed, ducks for cues, and cancels pending starts", () =>
  withAudioMock(async ({ audio, sources, filters, flush }) => {
    const game = { phase: "running", speed: 100, yeti: null };
    audio.unlock();
    await flush();
    audio.update(game, 0);
    await flush();
    audio.update(game, 0);
    const loop = sources.find(source => source.loop);
    assert.ok(loop);
    const gain = loop.output.output.output;
    const slow = gain.gain.target;
    game.speed = 360;
    audio.update(game, 0);
    const straight = gain.gain.target;
    const straightCutoff = filters[1].frequency.target;
    audio.update(game, 1);
    assert.ok(gain.gain.target > slow);
    assert.ok(gain.gain.target > straight);
    assert.ok(filters[1].frequency.target > straightCutoff);
    assert.ok(gain.gain.target <= 0.034);
    assert.equal(filters[0].type, "highpass");
    assert.equal(filters[1].type, "lowpass");
    const fast = gain.gain.target;
    audio.events([{ type: "collision", kind: "pine" }]);
    audio.update(game, 1);
    assert.ok(gain.gain.target < fast / 2);
    await flush();
    const firstFallCue = sources.length;
    audio.events([{ type: "fall", x: 320, y: 142, side: "left" }]);
    await flush();
    const [impact, fallScrape] = sources.slice(firstFallCue);
    assert.ok(impact.buffer.endsWith("/impact-fall.ogg"));
    assert.deepEqual(impact.startArgs, []);
    assert.ok(fallScrape.buffer.endsWith("/ski-slide-loop.wav"));
    assert.deepEqual(fallScrape.startArgs, [0.07, 0, 0.18]);
    audio.events([{ type: "ski-contact" }]);
    await flush();
    assert.deepEqual(sources.at(-1).startArgs, [0, 0, 0.11]);
    const beforeCapture = sources.length;
    audio.capture(0.13);
    assert.ok(sources.every(source => source.stopped));
    await flush();
    assert.equal(sources.length, beforeCapture + 1);
    const captureStep = sources.at(-1);
    assert.ok(captureStep.buffer.endsWith("/yeti-step.ogg"));
    assert.deepEqual(captureStep.startArgs, [0.13, 0, 0.22]);
    assert.ok(captureStep.playbackRate.value < 1);
    audio.stop();
    assert.ok(sources.every(source => source.stopped));
    const count = sources.length;
    audio.update(game, 0);
    audio.stop();
    await flush();
    assert.equal(sources.length, count);
  }));

test("visible tracks and the glimpse soften the snow, then escape restores the normal mix gradually", () =>
  withAudioMock(async ({ audio, sources, filters, flush }) => {
    const tracks = { kind: "tracks", y: 390 };
    const game = { phase: "running", stage: "tracks", speed: 360, height: 360, elapsed: 20,
      objects: [tracks], glimpse: null, yeti: null, player: { x: 320, y: 142 } };
    audio.unlock();
    await flush();
    audio.update(game, 0);
    await flush();
    audio.update(game, 0);
    const gain = sources.find(source => source.loop).output.output.output.gain;
    const lowpass = filters[1].frequency;
    const normal = gain.target;
    const normalEasing = gain.easing;
    const normalCutoff = lowpass.target;

    tracks.y = game.height;
    audio.update(game, 0);
    const trackMix = gain.target;
    assert.ok(trackMix < normal);
    game.elapsed += 0.9;
    audio.update(game, 0);
    assert.equal(gain.target, normal);
    game.glimpse = { age: 0 };
    audio.update(game, 0);
    assert.ok(gain.target < trackMix);
    assert.ok(lowpass.target < normalCutoff);

    game.glimpse = null;
    game.stage = "pursuit";
    game.yeti = { x: 320, y: 60, age: 0.1 };
    audio.update(game, 0);
    const pursuitEasing = gain.easing;
    assert.ok(gain.target < normal);
    game.stage = "descent";
    game.yeti = null;
    audio.events([{ type: "escape" }]);
    audio.update(game, 0);
    assert.equal(gain.target, normal);
    assert.equal(lowpass.target, normalCutoff);
    assert.ok(gain.easing > pursuitEasing && lowpass.easing > pursuitEasing);
    game.elapsed += 2;
    audio.update(game, 0);
    assert.equal(gain.easing, normalEasing);
  }));

test("pursuit footsteps share the irregular gait and get louder as the gap closes", () =>
  withAudioMock(async ({ audio, sources, flush }) => {
    const yeti = { x: 0, y: 142, age: 0.20 };
    const game = { phase: "running", stage: "pursuit", speed: 360, elapsed: 10,
      yeti, player: { x: 320, y: 142 } };
    const footsteps = () => sources.filter(source => source.buffer?.endsWith("/yeti-step.ogg"));
    const advanceTo = async age => { yeti.age = age; audio.update(game, 0); await flush(); };
    audio.unlock();
    await flush();
    await advanceTo(0.20);
    assert.equal(footsteps().length, 0);
    await advanceTo(0.23);
    const [farQuick] = footsteps();
    assert.equal(farQuick.startArgs[2], 0.10);
    await advanceTo(0.30);
    assert.equal(footsteps().length, 1);
    await advanceTo(0.35);
    const plant = footsteps().at(-1);
    assert.equal(plant.startArgs[2], 0.15);
    assert.ok(plant.playbackRate.value < farQuick.playbackRate.value);
    await advanceTo(1 / 3 + 0.18);
    assert.equal(footsteps().length, 2);
    yeti.x = 270;
    await advanceTo(1 / 3 + 0.20);
    const nearQuick = footsteps().at(-1);
    assert.equal(footsteps().length, 3);
    assert.equal(nearQuick.startArgs[2], 0.10);
    assert.ok(nearQuick.output.gain.targets[0] > farQuick.output.gain.targets[0]);
    audio.stop();
    await advanceTo(1 / 3 + 0.20);
    assert.equal(footsteps().length, 3, "resume does not repeat the current step");
  }));
