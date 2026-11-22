import assert from "node:assert/strict";
import test from "node:test";
import { createSkiAudio } from "../../web/scripts/games/ski/ski-audio.ts";

test("sliding stays quiet, follows speed, ducks for cues, and cancels pending starts", async () => {
  const originalAudio = globalThis.AudioContext;
  const originalFetch = globalThis.fetch;
  const sources = [];
  const filters = [];
  const parameter = () => ({ value: 0, target: 0, setTargetAtTime(value) { this.target = value; } });
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
      const source = { ...node(), playbackRate: parameter(), start() {}, stop() { this.stopped = true; this.onended?.(); } };
      sources.push(source);
      return source;
    }
  };
  globalThis.fetch = async url => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode(String(url)).buffer });
  const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  try {
    const audio = createSkiAudio();
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
    audio.update(game, 1);
    assert.ok(gain.gain.target > slow);
    assert.ok(gain.gain.target <= 0.034);
    assert.equal(filters[0].type, "highpass");
    assert.equal(filters[1].type, "lowpass");
    const fast = gain.gain.target;
    audio.events([{ type: "collision", kind: "pine" }]);
    audio.update(game, 1);
    assert.ok(gain.gain.target < fast / 2);
    await flush();
    audio.stop();
    assert.ok(sources.every(source => source.stopped));
    const count = sources.length;
    audio.update(game, 0);
    audio.stop();
    await flush();
    assert.equal(sources.length, count);
  } finally {
    globalThis.AudioContext = originalAudio;
    globalThis.fetch = originalFetch;
  }
});
