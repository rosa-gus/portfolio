// Copyright (c) 2026 rosa gus. SPDX-License-Identifier: GPL-3.0-only
import type { SkiEngine, SkiEvent } from "./ski-engine";

type Snow = { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number };
type Caption = { text: string; x: number; y: number; age: number; life: number; count?: number; points?: number };

/** Presentation clock and particles. Never consumes the engine's world RNG. */
export class SkiFeedback {
  snow: Snow[] = [];
  captions: Caption[] = [];
  retreat: { x: number; y: number; age: number } | null = null;
  impact = 0;
  endAge = 0;
  carve = 0;
  private previousHeading = 0;
  private snowBudget = 0;
  private sequence = 0;
  private warned = false;
  private lastYetiStep = -1;

  reset() {
    this.snow = [];
    this.captions = [];
    this.retreat = null;
    this.impact = this.endAge = this.carve = this.previousHeading = this.snowBudget = this.sequence = 0;
    this.warned = false;
    this.lastYetiStep = -1;
  }

  private random() {
    const value = Math.sin(++this.sequence * 127.1) * 43758.5453;
    return value - Math.floor(value);
  }

  private puff(x: number, y: number, count: number, direction = 0) {
    for (let i = 0; i < count; i++) {
      this.snow.push({ x, y, vx: (this.random() - 0.5) * 75 + direction * 45,
        vy: (this.random() - 0.6) * 65, age: 0, life: 0.25 + this.random() * 0.4,
        size: this.random() < 0.75 ? 2 : 3 });
    }
    this.snow = this.snow.slice(-140);
  }

  step(game: SkiEngine, travel: number, dt: number, events: readonly SkiEvent[]) {
    this.impact = Math.max(0, this.impact - dt);
    if (game.phase === "over") this.endAge += dt;
    for (const particle of this.snow) {
      particle.age += dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt - travel;
      particle.vy += 75 * dt;
    }
    this.snow = this.snow.filter(particle => particle.age < particle.life);
    for (const caption of this.captions) caption.age += dt;
    this.captions = this.captions.filter(caption => caption.age < caption.life);
    if (this.retreat) {
      this.retreat.age += dt;
      this.retreat.y -= 90 * dt;
      if (this.retreat.age > 0.8) this.retreat = null;
    }
    const turn = Math.abs(game.player.heading - this.previousHeading) / dt;
    this.previousHeading = game.player.heading;
    this.carve = Math.min(1, Math.abs(Math.sin(game.player.heading)) * 0.5 + turn * 0.25);
    if (game.phase === "running") {
      this.snowBudget += dt * (4 + 30 * this.carve) * game.speed / 300;
      if (this.snowBudget >= 1) {
        const side = -Math.sign(game.player.heading);
        this.puff(game.player.x + side * 8, game.player.y - 2, Math.floor(this.snowBudget), side);
        this.snowBudget %= 1;
      }
      if (game.yeti) {
        const gap = Math.hypot(game.yeti.x - game.player.x, game.yeti.y - game.player.y);
        if (gap < 85 && !this.warned) {
          this.warned = true;
          this.captions.push({ text: "ele está perto.", x: 320, y: 42, age: 0, life: 1.3 });
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
          this.captions.push({ text: "slalom à frente.", x: 320, y: 42, age: 0, life: 1.8 });
          break;
        case "slalom-end":
          this.captions.push({ text: "pista aberta.", x: 320, y: 42, age: 0, life: 1.3 });
          break;
        case "collision":
          this.impact = 0.24;
          this.puff(event.x, event.y - 8, 26);
          break;
        case "near-miss": {
          const recent = this.captions.find(caption => caption.count !== undefined && caption.age < 0.25);
          if (recent) {
            recent.count = (recent.count ?? 1) + 1;
            recent.points = (recent.points ?? 0) + event.points;
            recent.text = `por pouco ×${recent.count} +${recent.points}`;
            recent.x = Math.max(110, Math.min(530, event.x));
            recent.age = 0;
          } else {
            this.captions.push({ text: `por pouco +${event.points}`, count: 1, points: event.points,
              x: Math.max(110, Math.min(530, event.x)), y: event.y - 66, age: 0, life: 1 });
          }
          this.puff(event.x, event.y - 3, 8);
          break;
        }
        case "yeti-appear":
          this.captions.push({ text: "companhia na pista.", x: 320, y: 42, age: 0, life: 1.6 });
          break;
        case "escape":
          this.retreat = { x: event.x, y: event.y, age: 0 };
          this.captions.push({ text: "ficou para trás.", x: 320, y: 66, age: 0, life: 1.4 });
          break;
        case "capture":
          this.puff(event.x, event.y - 15, 42);
          break;
      }
    }
    this.captions = this.captions.slice(-4);
  }
}
