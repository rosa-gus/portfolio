// Copyright (c) 2026 rosa gus. SPDX-License-Identifier: GPL-3.0-only
import type { SkiEngine, SkiEvent } from "./ski-engine";

type Snow = { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number };
type WindSnow = { x: number; y: number; vx: number; vy: number; age: number; life: number; strength: number };
type Caption = { text: string; x: number; y: number; age: number; life: number; count?: number; points?: number };

export const SKI_CAPTURE_DURATION = 0.4;
export const SKI_CAPTURE_CONTACT = 0.13;

const visualRandom = (sequence: number) => {
  const value = Math.sin(sequence * 127.1) * 43758.5453;
  return value - Math.floor(value);
};

/** Presentation clock and particles. Never consumes the engine's world RNG. */
export class SkiFeedback {
  snow: Snow[] = [];
  windSnow: WindSnow[] = [];
  captions: Caption[] = [];
  retreat: { x: number; y: number; age: number } | null = null;
  impact = 0;
  endAge = 0;
  carve = 0;
  stride = 0;
  skierLean = 0;
  private previousHeading = 0;
  private previousX: number | null = null;
  private snowBudget = 0;
  private sequence = 0;
  private windSequence = 0;
  private windDirection = 1;
  private windGrainIn = 0.12;
  private windGustIn = 1.9;
  private warned = false;
  private lastYetiStep = -1;

  reset() {
    this.snow = [];
    this.windSnow = [];
    this.captions = [];
    this.retreat = null;
    this.impact = this.endAge = this.carve = this.previousHeading = this.snowBudget = this.sequence = 0;
    this.stride = this.skierLean = 0;
    this.previousX = null;
    this.windSequence = 0;
    this.windDirection = 1;
    this.windGrainIn = 0.12;
    this.windGustIn = 1.9;
    this.warned = false;
    this.lastYetiStep = -1;
  }

  private random() {
    return visualRandom(++this.sequence);
  }

  private windRandom() {
    return visualRandom(911 + ++this.windSequence);
  }

  private liftWindSnow(x: number, y: number, gust: boolean) {
    this.windSnow.push({ x, y,
      vx: this.windDirection * (gust ? 120 + this.windRandom() * 85 : 48 + this.windRandom() * 40),
      vy: (this.windRandom() - 0.5) * 14,
      age: gust ? -this.windRandom() * 0.22 : 0,
      life: gust ? 0.66 + this.windRandom() * 0.34 : 0.48 + this.windRandom() * 0.24,
      strength: gust ? 0.78 + this.windRandom() * 0.22 : 0.42 + this.windRandom() * 0.23 });
  }

  private stepWind(width: number, height: number, travel: number, dt: number) {
    for (const grain of this.windSnow) {
      grain.age += dt;
      grain.x += grain.vx * (0.7 + 0.6 * Math.max(0, grain.age) / grain.life) * dt;
      grain.y += grain.vy * dt - travel;
    }
    this.windSnow = this.windSnow.filter(grain => grain.age < grain.life && grain.y >= -2
      && grain.x > -12 && grain.x < width + 12);

    this.windGustIn -= dt;
    this.windGrainIn -= dt;
    if (this.windGustIn <= 0) {
      // One gust lifts a patch of snow. The staggered lifetimes break it up as it drifts.
      if (this.windRandom() < 0.5) this.windDirection *= -1;
      const x = width * (0.2 + this.windRandom() * 0.6);
      const y = height * (0.65 + this.windRandom() * 0.3);
      const count = 13 + Math.floor(this.windRandom() * 5);
      for (let i = 0; i < count; i++) {
        this.liftWindSnow(x + (this.windRandom() - 0.5) * 50, y + (this.windRandom() - 0.5) * 30, true);
      }
      this.windGustIn = 3.6 + this.windRandom() * 2.9;
      this.windGrainIn = 0.95;
    } else if (this.windGrainIn <= 0) {
      this.liftWindSnow(this.windRandom() * width, height * (0.25 + this.windRandom() * 0.7), false);
      this.windGrainIn = 0.34 + this.windRandom() * 0.32;
    }
  }

  private puff(x: number, y: number, count: number, direction = 0, lowSpray = false, lifeScale = 1) {
    for (let i = 0; i < count; i++) {
      this.snow.push({ x, y, vx: (this.random() - 0.5) * 75 + direction * 45,
        vy: lowSpray ? -this.random() * 22 : (this.random() - 0.6) * 65,
        age: 0, life: (0.25 + this.random() * 0.4) * lifeScale,
        size: this.random() < 0.75 ? 2 : 3 });
    }
    this.snow = this.snow.slice(-140);
  }

  step(game: SkiEngine, travel: number, dt: number, events: readonly SkiEvent[]) {
    this.impact = Math.max(0, this.impact - dt);
    for (const particle of this.snow) {
      particle.age += dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt - travel;
      particle.vy += 75 * dt;
    }
    this.snow = this.snow.filter(particle => particle.age < particle.life);
    if (game.phase === "over") {
      const before = this.endAge;
      this.endAge += dt;
      if (before < SKI_CAPTURE_CONTACT && this.endAge >= SKI_CAPTURE_CONTACT) {
        this.puff(game.player.x, game.player.y - 14, 36, 0, false, 0.4);
      }
    }
    for (const caption of this.captions) caption.age += dt;
    this.captions = this.captions.filter(caption => caption.age < caption.life);
    if (this.retreat) {
      this.retreat.age += dt;
      this.retreat.y -= 90 * dt;
      if (this.retreat.age > 0.8) this.retreat = null;
    }
    const turn = (game.player.heading - this.previousHeading) / dt;
    this.previousHeading = game.player.heading;
    const leanTarget = Math.sin(game.player.heading);
    this.carve = Math.min(1, Math.abs(leanTarget) * 0.5 + Math.abs(turn) * 0.25);
    this.skierLean += (leanTarget - this.skierLean) * (1 - Math.exp(-dt * 12));
    const lateralTravel = Math.abs(game.player.x - (this.previousX ?? game.player.x));
    this.previousX = game.player.x;
    this.stride = game.phase === "running" && !game.balance && lateralTravel > 0.01
      ? (this.stride + lateralTravel / 44) % 1 : 0;
    if (game.phase === "running") {
      this.stepWind(game.width, game.height, travel, dt);
      const balance = game.balance;
      const falling = balance?.pose === "fall";
      const slidingOnSnow = falling && balance.ticks * dt <= 0.18;
      if (!falling || slidingOnSnow) {
        const side = falling ? 0 : -Math.sign(turn || game.player.heading);
        const rate = falling ? 0.45 : (4 + 36 * this.carve) / 300;
        this.snowBudget += dt * rate * game.speed;
        if (this.snowBudget >= 1) this.puff(game.player.x + side * 8, game.player.y - 2, Math.floor(this.snowBudget), side, falling);
        this.snowBudget %= 1;
      }
      if (game.yeti) {
        const gap = Math.hypot(game.yeti.x - game.player.x, game.yeti.y - game.player.y);
        if (gap < 85 && !this.warned) {
          this.warned = true;
          this.captions.push({ text: "ele está perto.", x: game.width / 2, y: 42, age: 0, life: 1.3 });
        } else if (gap > 125) this.warned = false;
        const step = Math.floor(game.yeti.age * 3);
        if (step !== this.lastYetiStep && game.yeti.y > 0) this.puff(game.yeti.x, game.yeti.y - 2, 4);
        this.lastYetiStep = step;
      } else {
        this.warned = false;
        this.lastYetiStep = -1;
      }
    }
    for (const event of events) {
      switch (event.type) {
        case "slalom-start":
          this.captions.push({ text: "slalom à frente.", x: game.width / 2, y: 42, age: 0, life: 1.8 });
          break;
        case "slalom-end":
          this.captions.push({ text: "pista aberta.", x: game.width / 2, y: 42, age: 0, life: 1.3 });
          break;
        case "collision":
          this.impact = 0.24;
          this.puff(event.x, event.y - 8, 26);
          break;
        case "fall":
          this.snowBudget = 0;
          this.puff(event.x, event.y - 3, 22, event.side === "left" ? -1 : 1, true);
          break;
        case "near-miss": {
          const x = Math.max(110, Math.min(game.width - 110, event.x));
          const recent = this.captions.find(caption => caption.count !== undefined && caption.age < 0.25);
          if (recent) {
            recent.count = (recent.count ?? 1) + 1;
            recent.points = (recent.points ?? 0) + event.points;
            recent.text = `por pouco ×${recent.count} +${recent.points}`;
            recent.x = x;
            recent.age = 0;
          } else {
            this.captions.push({ text: `por pouco +${event.points}`, count: 1, points: event.points,
              x, y: event.y - 66, age: 0, life: 1 });
          }
          this.puff(event.x, event.y - 3, 8);
          break;
        }
        case "yeti-appear":
          this.captions.push({ text: "companhia na pista.", x: game.width / 2, y: 42, age: 0, life: 1.6 });
          break;
        case "escape":
          this.retreat = { x: event.x, y: event.y, age: 0 };
          this.captions.push({ text: "ficou para trás.", x: game.width / 2, y: 66, age: 0, life: 1.4 });
          break;
        case "capture":
          this.endAge = 0;
          this.captions = [];
          break;
      }
    }
    this.captions = this.captions.slice(-4);
  }
}
