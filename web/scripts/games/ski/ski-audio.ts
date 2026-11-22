// Copyright (c) 2026 rosa gus. SPDX-License-Identifier: GPL-3.0-only
import type { SkiEngine, SkiEvent } from "./ski-engine";
import type { yetiStride } from "./ski-yeti";

const urls = {
  slide: new URL("./audio/ski-slide-loop.wav", import.meta.url),
  pine: new URL("./audio/impact-pine.ogg", import.meta.url),
  rock: new URL("./audio/impact-rock.ogg", import.meta.url),
  fall: new URL("./audio/impact-fall.ogg", import.meta.url),
  bell: new URL("./audio/near-miss-bell.ogg", import.meta.url),
  step: new URL("./audio/yeti-step.ogg", import.meta.url),
  appear: new URL("./audio/yeti-appear.ogg", import.meta.url),
};
type Sound = keyof typeof urls;

export const createSkiAudio = (strideAt: typeof yetiStride) => {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let muted = false;
  let generation = 0;
  let slide: {
    source: AudioBufferSourceNode;
    gain: GainNode;
    lowpass: BiquadFilterNode;
  } | null = null;
  let slidePending = false;
  let lastYetiStep = -1;
  let tracksAt: number | null = null;
  let escapeAt = -Infinity;
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
          buffers.set(
            name,
            fetch(urls[name])
              .then((response) => {
                if (!response.ok) throw new Error("Audio unavailable");
                return response.arrayBuffer();
              })
              .then((bytes) => ctx.decodeAudioData(bytes))
              .catch(() => null),
          );
        }
      }
    } catch {
      /* Audio is optional; the simulation and visual feedback continue. */
    }
  };

  const play = async (
    name: Sound,
    volume: number,
    clip?: {
      duration: number;
      delay?: number;
      rate?: number;
      maxLatency?: number;
    },
  ) => {
    if (muted) return;
    const token = generation;
    const requestedAt = context?.currentTime ?? 0;
    const buffer = await buffers.get(name);
    if (
      !buffer ||
      token !== generation ||
      !context ||
      !master ||
      context.state !== "running" ||
      muted
    )
      return;
    if (
      clip?.maxLatency !== undefined &&
      context.currentTime - requestedAt > clip.maxLatency
    )
      return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(gain).connect(master);
    playing.add(source);
    source.onended = () => {
      playing.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    if (clip) {
      const start = context.currentTime + (clip.delay ?? 0);
      source.playbackRate.value = clip.rate ?? 1;
      gain.gain.value = 0;
      gain.gain.setTargetAtTime(volume, start, 0.01);
      gain.gain.setTargetAtTime(
        0,
        start + clip.duration / 3,
        clip.duration / 7,
      );
      source.start(start, 0, clip.duration);
    } else {
      source.start();
    }
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
    source.onended = () => {
      source.disconnect();
      highpass.disconnect();
      lowpass.disconnect();
      gain.disconnect();
    };
    source.start();
  };

  const events = (items: readonly SkiEvent[]) => {
    if (context && items.some((event) => event.type !== "escape"))
      duckUntil = context.currentTime + 0.3;
    for (const event of items) {
      if (event.type === "collision") void play(event.kind, 0.7);
      if (event.type === "fall") {
        void play("fall", 0.7);
        void play("slide", 0.14, { delay: 0.07, duration: 0.18 });
      }
      if (event.type === "ski-contact")
        void play("slide", 0.11, { duration: 0.11 });
      if (
        event.type === "near-miss" &&
        context &&
        context.currentTime >= nextBell
      ) {
        void play("bell", 0.3);
        nextBell = context.currentTime + 0.12;
      }
      if (event.type === "yeti-appear") {
        lastYetiStep = -1;
        void play("appear", 0.45);
      }
    }
  };

  const update = (game: SkiEngine, carve: number) => {
    if (game.phase !== "running") return;
    if (game.stage !== "tracks") tracksAt = null;
    else if (
      tracksAt === null &&
      game.objects.some(
        (object) =>
          object.kind === "tracks" && object.y >= 0 && object.y <= game.height,
      )
    ) {
      tracksAt = game.elapsed;
    }

    const yeti = game.yeti;
    let proximity = 0;
    if (yeti) {
      const gap = Math.hypot(yeti.x - game.player.x, yeti.y - game.player.y);
      proximity = Math.max(0, 1 - gap / 420);
      const { stride, quickStep } = strideAt(yeti.age);
      const quick = quickStep >= 0;
      const step = stride * 2 + Number(quick);
      if (step !== lastYetiStep) {
        lastYetiStep = step;
        if (step > 0) {
          const volume = (0.07 + 0.55 * proximity ** 1.6) * (quick ? 0.72 : 1);
          void play("step", volume, {
            duration: quick ? 0.1 : 0.15,
            rate: quick ? 1.14 : 0.92,
            maxLatency: 0.1,
          });
        }
      }
    } else if (lastYetiStep >= 0) {
      lastYetiStep = -1;
      escapeAt = game.elapsed;
    }

    if (!context || context.state !== "running") return;
    if (!muted && !slide && !slidePending && buffers.has("slide"))
      void startSlide();
    if (slide) {
      // Keep the loop behind discrete cues: quiet even at full speed, with a soft
      // attack, less bright friction, and only a small change in pitch.
      const speed = Math.min(1, game.speed / 360);
      const volume = (0.025 + carve * 0.009) * speed ** 1.6;
      const duck = context.currentTime < duckUntil ? 0.45 : 1;
      // Start the hush while the glimpse is still entering the viewport.
      const trackDip = tracksAt !== null && game.elapsed - tracksAt < 0.85;
      const terrainMix = game.glimpse
        ? 0.4
        : trackDip
          ? 0.68
          : yeti
            ? 0.84 - proximity * 0.28
            : 1;
      const easing =
        game.elapsed - escapeAt < 1.7 ? 0.58 : terrainMix < 0.7 ? 0.12 : 0.22;
      slide.gain.gain.setTargetAtTime(
        muted ? 0 : volume * terrainMix * duck,
        context.currentTime,
        easing,
      );
      slide.source.playbackRate.setTargetAtTime(
        0.94 + speed * 0.06,
        context.currentTime,
        0.35,
      );
      const cutoff =
        (1150 + speed * 650 + carve * 300) * (0.64 + terrainMix * 0.36);
      slide.lowpass.frequency.setTargetAtTime(
        cutoff,
        context.currentTime,
        easing,
      );
    }
  };

  const stop = () => {
    generation++;
    duckUntil = 0;
    nextBell = 0;
    slidePending = false;
    if (slide) {
      slide.source.stop();
      slide = null;
    }
    for (const source of playing) source.stop();
    playing.clear();
  };

  const setMuted = (value: boolean) => {
    muted = value;
    if (master && context)
      master.gain.setTargetAtTime(muted ? 0 : 0.5, context.currentTime, 0.03);
  };
  const capture = (delay: number) => {
    stop();
    void play("step", 0.85, { delay, duration: 0.22, rate: 0.72 });
  };
  const reset = () => {
    tracksAt = null;
    escapeAt = -Infinity;
    lastYetiStep = -1;
  };
  return { unlock, events, update, stop, reset, setMuted, capture };
};
