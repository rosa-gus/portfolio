// Copyright (c) 2026 rosa gus. SPDX-License-Identifier: GPL-3.0-only
import type { SkiEngine, SkiEvent } from "./ski-engine";

const urls = {
  slide: new URL("./audio/ski-slide-loop.wav", import.meta.url),
  pine: new URL("./audio/impact-pine.ogg", import.meta.url),
  rock: new URL("./audio/impact-rock.ogg", import.meta.url),
  bell: new URL("./audio/near-miss-bell.ogg", import.meta.url),
  step: new URL("./audio/yeti-step.ogg", import.meta.url),
  appear: new URL("./audio/yeti-appear.ogg", import.meta.url),
};
type Sound = keyof typeof urls;

export const createSkiAudio = () => {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let muted = false;
  let generation = 0;
  let slide: { source: AudioBufferSourceNode; gain: GainNode; lowpass: BiquadFilterNode } | null = null;
  let slidePending = false;
  let nextStep = 0;
  let nextBell = 0;
  let duckUntil = 0;
  const buffers = new Map<Sound, Promise<AudioBuffer | null>>();
  const playing = new Set<AudioBufferSourceNode>();

  // Run synchronously inside the start/resume gesture, before awaiting fetches.
  const unlock = () => {
    try {
      if (!context) {
        context = new AudioContext();
        master = context.createGain();
        master.gain.value = muted ? 0 : 0.5;
        master.connect(context.destination);
      }
      void context.resume().catch(() => {});
      const ctx = context;
      for (const name of Object.keys(urls) as Sound[]) {
        if (!buffers.has(name)) {
          buffers.set(name, fetch(urls[name]).then(response => {
            if (!response.ok) throw new Error("Audio unavailable");
            return response.arrayBuffer();
          }).then(bytes => ctx.decodeAudioData(bytes)).catch(() => null));
        }
      }
    } catch { /* Audio is optional; the simulation and visual feedback continue. */ }
  };

  const play = async (name: Sound, volume: number) => {
    if (muted) return;
    const token = generation;
    const buffer = await buffers.get(name);
    if (!buffer || token !== generation || !context || !master || context.state !== "running" || muted) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(gain).connect(master);
    playing.add(source);
    source.onended = () => { playing.delete(source); source.disconnect(); gain.disconnect(); };
    source.start();
  };

  const startSlide = async () => {
    slidePending = true;
    const token = generation;
    const buffer = await buffers.get("slide");
    // A previous start must not clear a newer generation's pending flag.
    if (token !== generation) return;
    slidePending = false;
    if (!buffer || !context || !master || context.state !== "running") return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    const highpass = context.createBiquadFilter();
    const lowpass = context.createBiquadFilter();
    source.buffer = buffer;
    source.loop = true;
    highpass.type = "highpass";
    highpass.frequency.value = 140;
    highpass.Q.value = 0.5;
    lowpass.type = "lowpass";
    lowpass.frequency.value = 1600;
    lowpass.Q.value = 0.5;
    gain.gain.value = 0;
    source.connect(highpass).connect(lowpass).connect(gain).connect(master);
    slide = { source, gain, lowpass };
    source.onended = () => { source.disconnect(); highpass.disconnect(); lowpass.disconnect(); gain.disconnect(); };
    source.start();
  };

  const events = (items: readonly SkiEvent[]) => {
    if (items.length && context) duckUntil = context.currentTime + 0.3;
    for (const event of items) {
      if (event.type === "collision") void play(event.kind, 0.7);
      if (event.type === "near-miss" && context && context.currentTime >= nextBell) {
        void play("bell", 0.3);
        nextBell = context.currentTime + 0.12;
      }
      if (event.type === "yeti-appear") { nextStep = 0; void play("appear", 0.45); }
    }
  };

  const update = (game: SkiEngine, carve: number) => {
    if (game.phase !== "running" || !context || context.state !== "running") return;
    if (!muted && !slide && !slidePending && buffers.has("slide")) void startSlide();
    if (slide) {
      // Keep the loop behind discrete cues: quiet even at full speed, with a soft
      // attack, less bright friction, and only a small change in pitch.
      const speed = Math.min(1, game.speed / 360);
      const volume = (0.03 + carve * 0.004) * speed ** 1.6;
      const duck = context.currentTime < duckUntil ? 0.45 : 1;
      slide.gain.gain.setTargetAtTime(muted ? 0 : volume * duck, context.currentTime, 0.22);
      slide.source.playbackRate.setTargetAtTime(0.94 + speed * 0.06, context.currentTime, 0.35);
      slide.lowpass.frequency.setTargetAtTime(1200 + speed * 800, context.currentTime, 0.3);
    }
    if (game.yeti && game.yeti.age >= nextStep) {
      const proximity = Math.max(0, 1 - Math.hypot(game.yeti.x - game.player.x, game.yeti.y - game.player.y) / 400);
      void play("step", 0.12 + proximity * 0.65);
      nextStep = game.yeti.age + 1 / 3;
    }
  };

  const stop = () => {
    generation++;
    duckUntil = 0;
    nextBell = 0;
    slidePending = false;
    if (slide) { slide.source.stop(); slide = null; }
    for (const source of playing) source.stop();
    playing.clear();
  };

  const setMuted = (value: boolean) => {
    muted = value;
    if (master && context) master.gain.setTargetAtTime(muted ? 0 : 0.5, context.currentTime, 0.03);
  };
  return { unlock, events, update, stop, setMuted };
};
