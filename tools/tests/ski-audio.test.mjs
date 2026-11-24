import assert from "node:assert/strict";
import test from "node:test";
import { createSkiAudio } from "../../web/scripts/games/ski/ski-audio.ts";
import { yetiStride } from "../../web/scripts/games/ski/ski-yeti.ts";

const withAudioMock = async (run, rejectedAsset) => {
  const originalAudio = globalThis.AudioContext;
  const originalFetch = globalThis.fetch;
  const sources = [];
  const filters = [];
  const requests = [];
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
    async decodeAudioData(bytes) {
      const asset = new TextDecoder().decode(bytes);
      if (rejectedAsset && asset.endsWith(rejectedAsset)) throw new Error("Unsupported audio");
      return asset;
    }
    createGain() { return { ...node(), gain: parameter() }; }
    createStereoPanner() { return { ...node(), pan: parameter() }; }
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
  globalThis.fetch = async url => {
    requests.push(String(url));
    return { ok: true, arrayBuffer: async () => new TextEncoder().encode(String(url)).buffer };
  };
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  try {
    await run({ audio: createSkiAudio(yetiStride), sources, filters, requests, flush });
  } finally {
    globalThis.AudioContext = originalAudio;
    globalThis.fetch = originalFetch;
  }
};

test("a blizzard loads only its thunder and plays it on the thunder cue", () =>
  withAudioMock(async ({ audio, sources, requests, flush }) => {
    audio.unlock();
    assert.equal(requests.some(url => url.includes("thunder-")), false);
    audio.events([{ type: "blizzard-start", thunder: 2 }]);
    await flush();
    assert.deepEqual(requests.filter(url => url.includes("thunder-")).map(url => url.split("/").at(-1)), ["thunder-3.ogg"]);
    assert.equal(sources.length, 0);
    audio.events([{ type: "blizzard-thunder", thunder: 2 }]);
    await flush();
    assert.ok(sources[0].buffer.endsWith("/thunder-3.ogg"));
    assert.deepEqual(sources[0].startArgs, [0, 0.12, 2.25]);
  }));

test("the three cracks share the branch and distant step, with snow on the third", () =>
  withAudioMock(async ({ audio, sources, filters, flush }) => {
    audio.unlock();
    await flush();
    for (const [count, side] of [[1, -1], [2, 1], [3, -1]]) {
      const from = sources.length;
      audio.events([{ type: "yeti-crack", count, side }]);
      await flush();
      const [crack, step, snow] = sources.slice(from);
      assert.ok(crack.buffer.endsWith("/yeti-crack.ogg"));
      assert.deepEqual(crack.startArgs, [0, 1.74, 0.36]);
      assert.ok(step.buffer.endsWith("/yeti-step.ogg"));
      assert.deepEqual(step.startArgs, [0.12, 0, 0.17]);
      assert.equal(Math.sign(step.output.output.pan.value), side);
      if (count === 3) {
        assert.ok(snow.buffer.endsWith("/ski-slide-loop.ogg"));
        assert.equal(snow.startArgs[0], 0.2);
      } else assert.equal(snow, undefined);
    }
    assert.deepEqual(filters.map(filter => [filter.type, filter.frequency.value]), [["lowpass", 1600]]);
  }));

test("a converted cue falls back to WAV when its Opus file cannot be decoded", () =>
  withAudioMock(async ({ audio, sources, flush }) => {
    audio.unlock();
    await flush();
    audio.events([{ type: "yeti-crack", count: 1, side: -1 }]);
    await flush();
    assert.ok(sources[0].buffer.endsWith("/source/yeti-crack.wav"));
  }, "/yeti-crack.ogg"));

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
    const beforeDistantStep = sources.length;
    audio.events([{ type: "yeti-distant-step" }]);
    await flush();
    assert.equal(sources.length, beforeDistantStep + 1);
    assert.ok(sources.at(-1).buffer.endsWith("/yeti-step.ogg"));
    assert.ok(sources.at(-1).playbackRate.value < 1);
    audio.update(game, 1);
    assert.equal(gain.gain.target, fast);
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
    assert.ok(fallScrape.buffer.endsWith("/ski-slide-loop.ogg"));
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
    game.yeti = { x: 320, y: 260, age: 0, strideAge: 0, attack: { kind: "standing" } };
    game.stage = "descent";
    audio.update(game, 0);
    assert.equal(gain.target, normal);
    game.stage = "pursuit";
    game.yeti = { x: 320, y: 60, age: 0.1, strideAge: 0.1, attack: { kind: "pursuit" } };
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

test("the appearance lands a heavy step and fatigue plays the breathing recording", () =>
  withAudioMock(async ({ audio, sources, flush }) => {
    audio.unlock();
    await flush();
    audio.events([{ type: "yeti-appear", x: 70, y: 66, front: false, rush: true }]);
    await flush();
    const [appearance, step] = sources;
    assert.ok(appearance.buffer.endsWith("/yeti-appear.ogg"));
    assert.ok(step.buffer.endsWith("/yeti-step.ogg"));
    assert.ok(step.playbackRate.value < 1);
    audio.events([{ type: "yeti-appear", x: 70, y: 66, front: false, rush: false }]);
    await flush();
    assert.equal(sources.length, 3);
    assert.ok(sources.at(-1).buffer.endsWith("/yeti-appear.ogg"));
    audio.events([{ type: "yeti-windup" }]);
    await flush();
    assert.ok(sources.at(-1).buffer.endsWith("/yeti-step.ogg"));
    audio.events([{ type: "yeti-tired" }]);
    await flush();
    const breath = sources.at(-1);
    assert.ok(breath.buffer.endsWith("/yeti-breath.ogg"));
    assert.deepEqual(breath.startArgs, []);
    audio.stop();
    assert.equal(breath.stopped, true);
  }));

test("pursuit footsteps share the irregular gait and get louder as the gap closes", () =>
  withAudioMock(async ({ audio, sources, flush }) => {
    const yeti = { x: 0, y: 142, age: 0.1, strideAge: 0.20, attack: { kind: "pursuit" } };
    const game = { phase: "running", stage: "pursuit", speed: 360, elapsed: 10,
      yeti, player: { x: 320, y: 142 } };
    const footsteps = () => sources.filter(source => source.buffer?.endsWith("/yeti-step.ogg"));
    const advanceTo = async age => { yeti.strideAge = age; audio.update(game, 0); await flush(); };
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
