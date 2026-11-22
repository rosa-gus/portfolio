/**
 * Inspired by SkiFree by Chris Pirih. Copyright (c) 2026 rosa gus.
 * SPDX-License-Identifier: GPL-3.0-only
 * Fixed-step simulation with no DOM, rendering, storage, or asset dependencies.
 */
export type SkiPhase = "ready" | "running" | "paused" | "over";
export type SkiInput = { steer: number; downhill?: boolean; heading?: number };
export type SkiObject = { id: number; kind: "pine" | "rock" | "tracks"; x: number; y: number; hit: boolean };
export type SkiTrail = { x: number; y: number; heading: number; age: number };
export const SKI_WIDTH = 640;
export const SKI_HEIGHT = 360;
export const SKI_STEP = 1 / 60;
export const SKI_MAX_HEADING = Math.PI / 2;
const TURN_RATE = Math.PI * 0.85;
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));

export class SkiEngine {
  phase: SkiPhase = "ready";
  distance = 0;
  elapsed = 0;
  speed = 0;
  player = { x: SKI_WIDTH / 2, y: 142, heading: 0 };
  velocity = { x: 0, y: 0 };
  objects: SkiObject[] = [];
  trails: SkiTrail[] = [];
  yeti: { x: number; y: number; age: number } | null = null;
  stumble = 0;
  escapes = 0;
  private nextYeti = 800;
  private spawnDistance = 0;
  private trailDistance = 0;
  private sequence = 0;

  private readonly random: () => number;

  constructor(random: () => number = Math.random) {
    this.random = random;
    this.reset();
  }

  reset() {
    this.phase = "ready";
    this.distance = this.elapsed = this.speed = this.stumble = this.escapes = 0;
    this.player = { x: SKI_WIDTH / 2, y: 142, heading: 0 };
    this.velocity = { x: 0, y: 0 };
    this.objects = [];
    this.trails = [];
    this.yeti = null;
    this.nextYeti = 800;
    this.spawnDistance = this.trailDistance = this.sequence = 0;
    // The initial lane stays clear while the player learns the controls.
    for (let row = 0; row < 3; row++) this.spawnRow(240 + row * 90, SKI_WIDTH / 2);
  }

  start() {
    if (this.phase === "over") this.reset();
    this.phase = "running";
  }

  pause() { if (this.phase === "running") this.phase = "paused"; }

  get stage(): "descent" | "tracks" | "pursuit" {
    return this.yeti ? "pursuit" : this.distance >= this.nextYeti - 380 ? "tracks" : "descent";
  }

  private spawnRow(y: number, gap = 130 + this.random() * 380) {
    // A broad traversable gap shifts between rows instead of a permanent safe lane.
    for (const side of [0, 1]) {
      if (this.random() < 0.22) continue;
      this.objects.push({ id: ++this.sequence, kind: this.random() < 0.7 ? "pine" : "rock",
        x: clamp(gap + (side === 0 ? -1 : 1) * (100 + this.random() * 150), 36, SKI_WIDTH - 36), y, hit: false });
    }
    if (this.stage === "tracks") {
      this.objects.push({ id: ++this.sequence, kind: "tracks", x: 100 + this.random() * 440, y: y + 32, hit: false });
    }
  }

  /** Advance precisely one 1/60-second step. Paused games do not consume RNG. */
  tick(input: SkiInput = { steer: 0 }) {
    if (this.phase !== "running") return;
    const dt = SKI_STEP;
    this.elapsed += dt;
    this.stumble = Math.max(0, this.stumble - dt);
    const steer = Number.isFinite(input.steer) ? clamp(input.steer, -1, 1) : 0;
    if (input.downhill) {
      this.player.heading += clamp(-this.player.heading, -TURN_RATE * dt, TURN_RATE * dt);
    } else if (input.heading !== undefined && Number.isFinite(input.heading)) {
      const target = clamp(input.heading, -SKI_MAX_HEADING, SKI_MAX_HEADING);
      this.player.heading += clamp(target - this.player.heading, -TURN_RATE * dt, TURN_RATE * dt);
    } else {
      this.player.heading = clamp(this.player.heading + steer * TURN_RATE * dt, -SKI_MAX_HEADING, SKI_MAX_HEADING);
    }
    // Heading persists when controls are released. Gravity favors the fall line.
    const downhill = Math.max(0, Math.cos(this.player.heading));
    const base = Math.min(360, 240 + this.distance * 0.05);
    this.speed = base * (0.35 + 0.65 * downhill) * (this.stumble > 0 ? 0.32 : 1);
    this.velocity = { x: Math.sin(this.player.heading) * this.speed, y: downhill * this.speed };
    const previousX = this.player.x;
    this.player.x = clamp(previousX + this.velocity.x * dt, 26, SKI_WIDTH - 26);
    const travel = this.velocity.y * dt;
    this.distance += travel * 0.16;
    this.spawnDistance += travel;
    this.trailDistance += Math.hypot(this.player.x - previousX, travel);
    for (const object of this.objects) object.y -= travel;
    for (const trail of this.trails) { trail.y -= travel; trail.age += dt; }
    this.objects = this.objects.filter(object => object.y > -70);
    this.trails = this.trails.filter(trail => trail.y > -10 && trail.age < 0.8);
    if (this.trailDistance >= 8) {
      this.trailDistance %= 8;
      this.trails.push({ x: this.player.x, y: this.player.y - 4, heading: this.player.heading, age: 0 });
    }
    if (this.spawnDistance >= 90) {
      this.spawnDistance %= 90;
      this.spawnRow(SKI_HEIGHT + 70);
    }
    for (const object of this.objects) {
      if (object.kind === "tracks" || object.hit || this.stumble > 0) continue;
      if (Math.abs(object.x - this.player.x) < (object.kind === "pine" ? 23 : 27)
          && Math.abs(object.y - this.player.y) < 12) {
        object.hit = true;
        this.stumble = 1.1;
      }
    }
    if (!this.yeti && this.distance >= this.nextYeti) {
      this.yeti = { x: this.player.x < SKI_WIDTH / 2 ? SKI_WIDTH - 70 : 70, y: -16, age: 0 };
    }
    if (this.yeti) {
      const enemy = this.yeti;
      enemy.age += dt;
      enemy.x += clamp(this.player.x - enemy.x, -100 * dt, 100 * dt);
      const descentRatio = this.velocity.y / base;
      enemy.y += Math.max(2, 8 + enemy.age * 0.45 + (1 - descentRatio) * 20 - descentRatio * 9) * dt;
      if (Math.abs(enemy.x - this.player.x) < 27 && Math.abs(enemy.y - this.player.y) < 23) {
        this.phase = "over";
      } else if (enemy.age >= 24) {
        this.escapes++;
        this.nextYeti = this.distance + 1000;
        this.yeti = null;
      }
    }
  }
}
