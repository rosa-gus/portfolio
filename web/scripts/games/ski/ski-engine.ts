/**
 * Inspired by SkiFree by Chris Pirih. Copyright (c) 2026 rosa gus.
 * SPDX-License-Identifier: GPL-3.0-only
 * Fixed-step simulation with no DOM, rendering, storage, or asset dependencies.
 */
export type SkiPhase = "ready" | "running" | "paused" | "over";
export type SkiInput = { steer: number; downhill?: boolean; heading?: number };
type SkiLayout = "landscape" | "portrait";
export type SkiObject = {
  id: number;
  kind: "pine" | "rock" | "tracks";
  x: number;
  y: number;
  hit: boolean;
  passed?: boolean;
  clearance?: number;
  slowPass?: boolean;
};
export type SkiTrail = {
  x: number;
  y: number;
  heading: number;
  age: number;
  tick: number;
  connected: boolean;
};
type SkiBalance = { side: "left" | "right"; ticks: number } & (
  | { pose: "stumble"; corrected: boolean }
  | { pose: "fall" }
  | { pose: "recover"; afterFall: boolean }
);
export type SkiEvent =
  | { type: "collision"; kind: "pine" | "rock"; x: number; y: number }
  | { type: "near-miss"; x: number; y: number; points: number }
  | { type: "fall"; side: SkiBalance["side"]; x: number; y: number }
  | {
      type: "yeti-appear" | "escape" | "capture" | "slalom-end";
      x: number;
      y: number;
    }
  | { type: "ski-contact" }
  | { type: "slalom-start"; level: number };
export type SkiSlalom = {
  level: number;
  gates: number;
  spacing: number;
  halfWidth: number;
  amplitude: number;
  direction: number;
  approach: boolean;
  spawned: number;
  lastGateY: number | null;
};
export const SKI_WIDTH = 640;
export const SKI_HEIGHT = 360;
export const SKI_STEP = 1 / 60;
export const SKI_METERS_PER_PIXEL = 0.16;
export const SKI_MAX_HEADING = Math.PI / 2;
const TURN_RATE = Math.PI * 0.85;
const BALANCE_TICKS = Math.round(0.7 / SKI_STEP);
const MIN_STUMBLE_TICKS = Math.round(0.12 / SKI_STEP);
const FALL_TICKS = Math.round(0.65 / SKI_STEP);
const RECOVERY_TICKS = Math.round(0.45 / SKI_STEP);
const FALL_RECOVERY_TICKS = Math.round(0.65 / SKI_STEP);
const BALANCE_HEADING = 0.28;
const STUMBLE_SPEED = 0.52;
const FALL_SPEED = 0.2;
const TRAIL_SPACING = 8;
const OBSTACLE_EDGE_INSET = 36;
const EDGE_BANK_SPACING = 40;
export const SKI_TRAIL_LIFETIME = 0.8;
export const SKI_DISTANCE_INTERVAL = 10;
export const SKI_DISTANCE_POINTS = 10;
export const SKI_NEAR_MISS_POINTS = 50;
export const SKI_NEAR_MISS_MIN_DESCENT_RATIO = 0.55;
export const SKI_YETI_ESCAPE_GAP = 260;
export const SKI_YETI_GLIMPSE_DURATION = 1.2;
export const SKI_FIRST_SLALOM = 700;
export const SKI_FIRST_YETI = 2000;
export const SKI_NORMAL_INTERVAL = 900;
export const SKI_SLALOM_INTERVAL = 1800;
export const SKI_YETI_INTERVAL = 2600;
const clamp = (n: number, low: number, high: number) =>
  Math.max(low, Math.min(high, n));

export class SkiEngine {
  phase: SkiPhase = "ready";
  distance = 0;
  elapsed = 0;
  speed = 0;
  player = { x: 0, y: 0, heading: 0 };
  velocity = { x: 0, y: 0 };
  objects: SkiObject[] = [];
  trails: SkiTrail[] = [];
  yeti: { x: number; y: number; age: number } | null = null;
  glimpse: { treeId: number; side: number; age: number } | null = null;
  balance: SkiBalance | null = null;
  escapes = 0;
  nearMisses = 0;
  slalom: SkiSlalom | null = null;
  /** Events belong to the last simulation step; consumers read them after every tick. */
  events: SkiEvent[] = [];
  private nextYeti = SKI_FIRST_YETI;
  private spawnDistance = 0;
  private trailDistance = 0;
  private trailConnected = false;
  private sequence = 0;
  private terrainRow = 0;
  private laneCenter = 0;
  private laneDirection = 1;
  private nextSlalom = SKI_FIRST_SLALOM;
  private normalUntil = 0;
  private recoveryRows = 0;
  private glimpseEncounter = 0;

  private readonly random: () => number;
  readonly layout: SkiLayout;
  readonly width: number;
  readonly height: number;

  constructor(
    random: () => number = Math.random,
    layout: SkiLayout = "landscape",
  ) {
    this.random = random;
    this.layout = layout;
    this.width = layout === "portrait" ? 400 : SKI_WIDTH;
    this.height = layout === "portrait" ? 500 : SKI_HEIGHT;
    this.reset();
  }

  reset() {
    this.phase = "ready";
    this.distance =
      this.elapsed =
      this.speed =
      this.escapes =
      this.nearMisses =
        0;
    this.balance = null;
    this.events = [];
    this.player = {
      x: this.width / 2,
      y: this.layout === "portrait" ? 150 : 142,
      heading: 0,
    };
    this.velocity = { x: 0, y: 0 };
    this.objects = [];
    this.trails = [];
    this.yeti = null;
    this.glimpse = null;
    this.glimpseEncounter = 0;
    this.slalom = null;
    this.nextSlalom = SKI_FIRST_SLALOM;
    this.normalUntil = 0;
    this.recoveryRows = 0;
    this.nextYeti = SKI_FIRST_YETI;
    this.spawnDistance = this.trailDistance = this.sequence = 0;
    this.trailConnected = false;
    this.terrainRow = 0;
    this.laneCenter = this.width / 2;
    this.laneDirection = this.random() < 0.5 ? -1 : 1;
    // The initial lane stays clear while the player learns the controls.
    for (let y = this.player.y + 98; y < this.height + 70; y += 90)
      this.spawnRow(y, this.laneCenter);
  }

  start() {
    if (this.phase === "over") this.reset();
    this.phase = "running";
  }

  pause() {
    if (this.phase === "running") this.phase = "paused";
  }

  get score() {
    return (
      Math.floor(this.distance / SKI_DISTANCE_INTERVAL) * SKI_DISTANCE_POINTS +
      this.nearMisses * SKI_NEAR_MISS_POINTS
    );
  }

  get stage(): "descent" | "tracks" | "pursuit" {
    return this.yeti
      ? "pursuit"
      : this.distance >= this.nextYeti - 380
        ? "tracks"
        : "descent";
  }

  private get rowSpacing() {
    if (this.slalom)
      return this.slalom.spawned < this.slalom.gates
        ? this.slalom.spacing
        : 140;
    if (this.recoveryRows > 0) return 140;
    return [125, 105, 95, 135][Math.floor(this.terrainRow / 6) % 4];
  }

  private prepareSlalom() {
    if (
      this.slalom ||
      this.yeti ||
      this.glimpse ||
      this.recoveryRows > 0 ||
      this.distance < this.nextSlalom ||
      this.distance < this.normalUntil
    )
      return;
    const level = this.distance < 3000 ? 1 : this.distance < 6000 ? 2 : 3;
    const gates = [4, 6, 8][level - 1];
    const spacing = [330, 305, 285][level - 1];
    const endDistance =
      this.distance +
      (gates * spacing + this.height + 70 - this.player.y + 12) *
        SKI_METERS_PER_PIXEL;
    // Keep each challenge separate and leave normal terrain between events.
    if (endDistance + 100 >= this.nextYeti) return;
    const halfWidth = this.layout === "portrait" ? [75, 66, 59] : [96, 84, 74];
    const amplitude = this.layout === "portrait" ? [60, 66, 72] : [84, 92, 100];
    this.slalom = {
      level,
      gates,
      spacing,
      halfWidth: halfWidth[level - 1],
      amplitude: amplitude[level - 1],
      direction: this.laneDirection,
      approach: true,
      spawned: 0,
      lastGateY: null,
    };
    this.events.push({ type: "slalom-start", level });
  }

  private spawnSlalomGate(y: number, course: SkiSlalom) {
    const side = course.direction * (course.spawned % 2 === 0 ? -1 : 1);
    this.laneCenter = this.width / 2 + side * course.amplitude;
    // Dense banks leave one explicit opening. Their hitboxes overlap, so a
    // stationary line at the center or the edges cannot bypass every gate.
    for (const [start, end] of [
      [OBSTACLE_EDGE_INSET, this.laneCenter - course.halfWidth],
      [this.laneCenter + course.halfWidth, this.width - OBSTACLE_EDGE_INSET],
    ]) {
      const intervals = Math.ceil((end - start) / 44);
      for (let i = 0; i <= intervals; i++) {
        this.objects.push({
          id: ++this.sequence,
          kind: this.random() < 0.7 ? "pine" : "rock",
          x: start + ((end - start) * i) / intervals,
          y,
          hit: false,
        });
      }
    }
    course.spawned++;
    if (course.spawned === course.gates) course.lastGateY = y;
  }

  private prepareGlimpse(y: number, gap: number, halfWidth: number) {
    if (
      this.glimpseEncounter === this.nextYeti ||
      this.yeti ||
      this.slalom ||
      this.distance < this.normalUntil ||
      this.distance < this.nextYeti - 220 ||
      this.distance >= this.nextYeti - 110
    )
      return;
    // Reuse a tree on the far side of a wide row. If necessary, turn the existing
    // obstacle into a pine or add one outside the corridor; the peek has no hitbox.
    const side = this.player.x < this.width / 2 ? 1 : -1;
    let tree = this.objects.find(
      (object) =>
        object.y === y &&
        object.kind !== "tracks" &&
        side * (object.x - gap) >= halfWidth,
    );
    if (tree) {
      tree.kind = "pine";
      tree.x = clamp(tree.x, 48, this.width - 48);
    } else {
      tree = {
        id: ++this.sequence,
        kind: "pine",
        x: clamp(gap + side * (halfWidth + 20), 48, this.width - 48),
        y,
        hit: false,
      };
      this.objects.push(tree);
    }
    this.glimpse = {
      treeId: tree.id,
      side: tree.x < this.width / 2 ? 1 : -1,
      age: 0,
    };
    this.glimpseEncounter = this.nextYeti;
  }

  private spawnRow(y: number, initialGap?: number) {
    let resting = false;
    if (initialGap === undefined) {
      this.prepareSlalom();
      if (this.slalom) {
        if (!this.slalom.approach && this.slalom.spawned < this.slalom.gates) {
          this.spawnSlalomGate(y, this.slalom);
          return;
        }
        this.slalom.approach = false;
        resting = true;
      } else if (this.recoveryRows > 0) {
        this.recoveryRows--;
        resting = true;
      }
    }
    // Six-row phrases alternate open snow, suggested turns, tighter passes, and rest.
    // Limit corridor movement so consecutive rows always leave a reachable route.
    const section = resting
      ? 3
      : initialGap !== undefined
        ? 0
        : Math.floor(this.terrainRow / 6) % 4;
    const sectionRow = this.terrainRow % 6;
    const turnOffsets = [0, 70, 140, 70, 0, -70];
    const offset =
      section === 1 ? turnOffsets[sectionRow] : section === 2 ? -80 : 0;
    const target =
      this.width / 2 + (this.laneDirection * offset * this.width) / SKI_WIDTH;
    if (initialGap === undefined)
      this.laneCenter += clamp(target - this.laneCenter, -30, 30);
    const gap = initialGap ?? this.laneCenter;
    const halfWidth = [120, 88, 70, 145][section];
    // The last three tight rows extend one bank inward, opposite the corridor's turn.
    // Overlapping collision radii close the edge even when the other obstacle is skipped.
    const edgeBankSize =
      section === 2 && this.stage === "descent"
        ? Math.max(0, sectionRow - 2)
        : 0;
    for (const side of [-1, 1]) {
      if (side === this.laneDirection && edgeBankSize > 0) {
        for (let i = 0; i < edgeBankSize; i++) {
          const inset = OBSTACLE_EDGE_INSET + i * EDGE_BANK_SPACING;
          const x = side < 0 ? inset : this.width - inset;
          this.objects.push({
            id: ++this.sequence,
            kind: this.random() < 0.7 ? "pine" : "rock",
            x,
            y,
            hit: false,
          });
        }
        continue;
      }
      if (this.random() < (section === 0 || section === 3 ? 0.45 : 0.1))
        continue;
      this.objects.push({
        id: ++this.sequence,
        kind: this.random() < 0.7 ? "pine" : "rock",
        x: clamp(
          gap + side * (halfWidth + this.random() * 45),
          OBSTACLE_EDGE_INSET,
          this.width - OBSTACLE_EDGE_INSET,
        ),
        y,
        hit: false,
      });
    }
    if (initialGap === undefined && (section === 0 || section === 3))
      this.prepareGlimpse(y, gap, halfWidth);
    if (this.stage === "tracks") {
      this.objects.push({
        id: ++this.sequence,
        kind: "tracks",
        x: 100 + this.random() * (this.width - 200),
        y: y + 32,
        hit: false,
      });
    }
    if (initialGap === undefined && !resting && ++this.terrainRow % 24 === 0)
      this.laneDirection *= -1;
  }

  private steer(input: SkiInput) {
    const previousHeading = this.player.heading;
    const maxTurn = TURN_RATE * SKI_STEP;
    const pointerHeading =
      input.heading !== undefined && Number.isFinite(input.heading)
        ? clamp(input.heading, -SKI_MAX_HEADING, SKI_MAX_HEADING)
        : undefined;
    const target =
      input.downhill || this.balance?.pose === "fall" ? 0 : pointerHeading;
    const steer = Number.isFinite(input.steer) ? clamp(input.steer, -1, 1) : 0;
    this.player.heading =
      target === undefined
        ? clamp(
            previousHeading + steer * maxTurn,
            -SKI_MAX_HEADING,
            SKI_MAX_HEADING,
          )
        : previousHeading + clamp(target - previousHeading, -maxTurn, maxTurn);
    const heading = Math.abs(this.player.heading);
    return (
      heading <= BALANCE_HEADING &&
      (target !== undefined
        ? Math.abs(target) <= BALANCE_HEADING
        : heading < Math.abs(previousHeading))
    );
  }

  private plantSkis() {
    this.trailDistance = TRAIL_SPACING;
    this.events.push({ type: "ski-contact" });
  }

  get skisOnSnow() {
    return (
      !this.balance ||
      this.balance.pose === "recover" ||
      (this.balance.pose === "stumble" && this.balance.corrected)
    );
  }

  private advanceBalance(corrected: boolean) {
    const balance = this.balance;
    if (!balance) return 1;
    balance.ticks++;
    if (balance.pose === "stumble") {
      if (corrected && !balance.corrected) {
        balance.corrected = true;
        this.plantSkis();
      }
      if (balance.corrected && balance.ticks >= MIN_STUMBLE_TICKS) {
        this.balance = {
          pose: "recover",
          side: balance.side,
          ticks: 0,
          afterFall: false,
        };
      } else if (balance.ticks >= BALANCE_TICKS) {
        this.balance = { pose: "fall", side: balance.side, ticks: 0 };
        this.events.push({
          type: "fall",
          side: balance.side,
          x: this.player.x,
          y: this.player.y,
        });
        return FALL_SPEED;
      }
      return STUMBLE_SPEED;
    }
    if (balance.pose === "fall") {
      if (balance.ticks >= FALL_TICKS) {
        this.balance = {
          pose: "recover",
          side: balance.side,
          ticks: 0,
          afterFall: true,
        };
        this.plantSkis();
      }
      return FALL_SPEED;
    }
    const duration = balance.afterFall ? FALL_RECOVERY_TICKS : RECOVERY_TICKS;
    if (balance.ticks >= duration) {
      this.balance = null;
      return 1;
    }
    const progress = balance.ticks / duration;
    const eased = progress * progress * (3 - 2 * progress);
    const minimum = balance.afterFall ? FALL_SPEED : STUMBLE_SPEED;
    return minimum + (1 - minimum) * eased;
  }

  /** Advance precisely one 1/60-second step. Paused games do not consume RNG. */
  tick(input: SkiInput = { steer: 0 }) {
    if (this.phase !== "running") return;
    this.events = [];
    const dt = SKI_STEP;
    this.elapsed += dt;
    const speedFactor = this.advanceBalance(this.steer(input));
    // Heading persists when controls are released. Gravity favors the fall line.
    const downhill = Math.max(0, Math.cos(this.player.heading));
    const base = Math.min(360, 240 + this.distance * 0.05);
    this.speed = base * (0.35 + 0.65 * downhill) * speedFactor;
    this.velocity = {
      x: Math.sin(this.player.heading) * this.speed,
      y: downhill * this.speed,
    };
    const previousX = this.player.x;
    this.player.x = clamp(
      previousX + this.velocity.x * dt,
      26,
      this.width - 26,
    );
    const travel = this.velocity.y * dt;
    const fastPass = this.velocity.y >= base * SKI_NEAR_MISS_MIN_DESCENT_RATIO;
    this.distance += travel * SKI_METERS_PER_PIXEL;
    this.spawnDistance += travel;
    if (this.skisOnSnow) {
      this.trailDistance += Math.hypot(this.player.x - previousX, travel);
    }
    for (const object of this.objects) object.y -= travel;
    if (this.slalom && this.slalom.lastGateY !== null) {
      this.slalom.lastGateY -= travel;
      if (this.slalom.lastGateY <= this.player.y - 12) {
        this.slalom = null;
        this.nextSlalom = this.distance + SKI_SLALOM_INTERVAL;
        this.normalUntil = this.distance + SKI_NORMAL_INTERVAL;
        // Footprints also wait until the full normal-terrain interval has passed.
        this.nextYeti = Math.max(this.nextYeti, this.normalUntil + 380);
        this.recoveryRows = 3;
        this.events.push({
          type: "slalom-end",
          x: this.player.x,
          y: this.player.y,
        });
      }
    }
    for (const trail of this.trails) {
      trail.y -= travel;
      trail.age += dt;
    }
    this.objects = this.objects.filter((object) => object.y > -70);
    if (this.glimpse) {
      const tree = this.objects.find(
        (object) => object.id === this.glimpse!.treeId,
      );
      // Start the brief peek only once its tree is fully inside the viewport.
      if (tree && tree.y <= this.height) this.glimpse.age += dt;
      if (
        !tree ||
        this.slalom ||
        this.yeti ||
        this.glimpse.age >= SKI_YETI_GLIMPSE_DURATION
      )
        this.glimpse = null;
    }
    this.trails = this.trails.filter(
      (trail) => trail.y > -10 && trail.age < SKI_TRAIL_LIFETIME,
    );
    if (this.trailDistance >= TRAIL_SPACING) {
      this.trailDistance %= TRAIL_SPACING;
      this.trails.push({
        x: this.player.x,
        y: this.player.y - 4,
        heading: this.player.heading,
        age: 0,
        tick: Math.round(this.elapsed / SKI_STEP),
        connected: this.trailConnected,
      });
      this.trailConnected = true;
    }
    const rowSpacing = this.rowSpacing;
    if (this.spawnDistance >= rowSpacing) {
      this.spawnDistance %= rowSpacing;
      this.spawnRow(this.height + 70);
    }
    for (const object of this.objects) {
      if (object.kind === "tracks" || object.passed) continue;
      const dx = Math.abs(object.x - this.player.x);
      const dy = object.y - this.player.y;
      const radius = object.kind === "pine" ? 23 : 27;
      if (Math.abs(dy) < 12) {
        // Measure the closest approach throughout the collision band, not just at exit.
        object.clearance = Math.min(object.clearance ?? Infinity, dx);
        // Accelerating only at the exit cannot turn a slow traverse into a bonus.
        if (!fastPass) object.slowPass = true;
        if (dx < radius) {
          const alreadyHit = object.hit;
          object.hit = true;
          if (!alreadyHit && !this.balance) {
            const side = this.player.x < object.x ? "left" : "right";
            this.balance = {
              pose: "stumble",
              side,
              ticks: 0,
              corrected: false,
            };
            this.trailDistance = 0;
            this.trailConnected = false;
            this.events.push({
              type: "collision",
              kind: object.kind,
              x: this.player.x,
              y: this.player.y,
            });
          }
        }
        // An invulnerable pass must never count as a skillful dodge.
        if (this.balance) object.hit = true;
      }
      if (dy <= -12) {
        object.passed = true;
        if (
          !object.hit &&
          !object.slowPass &&
          fastPass &&
          !this.balance &&
          object.clearance !== undefined &&
          object.clearance >= radius &&
          object.clearance < radius + 16
        ) {
          this.nearMisses++;
          this.events.push({
            type: "near-miss",
            x: this.player.x,
            y: this.player.y,
            points: SKI_NEAR_MISS_POINTS,
          });
        }
      }
    }
    if (
      !this.yeti &&
      !this.slalom &&
      this.distance >= this.nextYeti &&
      this.distance >= this.normalUntil
    ) {
      this.glimpse = null;
      this.yeti = {
        x: this.player.x < this.width / 2 ? this.width - 70 : 70,
        y: 16,
        age: 0,
      };
      this.events.push({ type: "yeti-appear", x: this.yeti.x, y: this.yeti.y });
    }
    if (this.yeti) {
      const enemy = this.yeti;
      enemy.age += dt;
      enemy.x += clamp(this.player.x - enemy.x, -100 * dt, 100 * dt);
      // Relative motion makes downhill skiing visibly open a gap; turns and hits
      // let the yeti close it. It waits alongside rather than overshooting laterally.
      enemy.y = Math.min(
        this.player.y,
        enemy.y + clamp((base * 0.9 - this.velocity.y) * 0.5, -22, 36) * dt,
      );
      if (
        Math.abs(enemy.x - this.player.x) < 27 &&
        Math.abs(enemy.y - this.player.y) < 23
      ) {
        this.phase = "over";
        this.events.push({
          type: "capture",
          x: this.player.x,
          y: this.player.y,
        });
      } else if (
        enemy.age >= 6 &&
        this.player.y - enemy.y >= SKI_YETI_ESCAPE_GAP
      ) {
        this.events.push({ type: "escape", x: enemy.x, y: enemy.y });
        this.escapes++;
        this.nextYeti = this.distance + SKI_YETI_INTERVAL;
        this.normalUntil = this.distance + SKI_NORMAL_INTERVAL;
        this.yeti = null;
      }
    }
  }
}
