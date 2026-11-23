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
  | { type: "yeti-appear"; x: number; y: number; front: boolean; rush: boolean }
  | {
      type: "escape" | "capture" | "slalom-end";
      x: number;
      y: number;
    }
  | { type: "ski-contact" }
  | { type: "yeti-distant-step" }
  | { type: "yeti-crack"; count: number; side: number }
  | { type: "yeti-explanation" }
  | { type: "yeti-windup" }
  | { type: "yeti-tired" }
  | { type: "slalom-start"; level: number };
type SkiYetiClue = "tracks" | "glimpse" | "step";
type SkiGlimpse = {
  treeId: number;
  side: number;
  age: number;
  duration?: number;
  exitTreeId?: number;
};
type SkiYetiScene = {
  beats: readonly [number, number, number];
  side: number;
  heard: number;
  pending: SkiGlimpse | null;
  revealAt: number | null;
};
type SkiYetiMode = "immediate" | "delayed" | "steady" | "front";
type SkiYetiAttack =
  | { kind: "pursuit" | "standing" | "head-on" }
  | { kind: "waiting" | "windup" | "sprint" | "turning"; until: number }
  | { kind: "tired"; since: number };
type SkiYeti = {
  x: number;
  y: number;
  age: number;
  strideAge: number;
  blinkAt: number | null;
  attack: SkiYetiAttack;
};
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
export const SKI_NORMAL_INTERVAL = 900;
export const SKI_SLALOM_INTERVAL = 1800;
const YETI_CLUE_MAX_LEAD = 340;
const YETI_VISUAL_CLUE_MIN_LEAD = 90;
const YETI_ENTRY_Y = 66; // Leave room for the 64-pixel sprite and its stride.
const YETI_SPRINT_DURATION = 0.8;
const YETI_RECOVERY_DURATION = 1.8;
const YETI_WINDUP_DURATION = 0.22;
const YETI_FRONT_LEAD = 128;
const YETI_FRONT_PINE_OFFSET = 25;
const YETI_FRONT_SPAWN_MARGIN = 84;
const YETI_CORRIDOR_LEAD = 72;
const YETI_CORRIDOR_TAIL = 106;
const YETI_EXPLANATION_DELAY = 1.3;
const clamp = (n: number, low: number, high: number) =>
  Math.max(low, Math.min(high, n));
const inYetiCorridor = (distance: number, beat: number) =>
  distance >= beat - YETI_CORRIDOR_LEAD &&
  distance <= beat + YETI_CORRIDOR_TAIL;

export class SkiEngine {
  phase: SkiPhase = "ready";
  distance = 0;
  elapsed = 0;
  speed = 0;
  player = { x: 0, y: 0, heading: 0 };
  velocity = { x: 0, y: 0 };
  objects: SkiObject[] = [];
  trails: SkiTrail[] = [];
  yeti: SkiYeti | null = null;
  glimpse: SkiGlimpse | null = null;
  balance: SkiBalance | null = null;
  escapes = 0;
  nearMisses = 0;
  slalom: SkiSlalom | null = null;
  /** Events belong to the last simulation step; consumers read them after every tick. */
  events: SkiEvent[] = [];
  private nextYeti = 0;
  private yetiSide = 1;
  private yetiMode: SkiYetiMode = "steady";
  private yetiClue: SkiYetiClue | null = null;
  private yetiClueLead = 0;
  private yetiScene: SkiYetiScene | null = null;
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
    this.yetiScene = null;
    this.slalom = null;
    this.nextSlalom = SKI_FIRST_SLALOM;
    this.normalUntil = 0;
    this.recoveryRows = 0;
    this.scheduleYeti(2000, 700);
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
    return this.yeti && this.yeti.attack.kind !== "standing"
      ? "pursuit"
      : this.objects.some((object) => object.kind === "tracks")
        ? "tracks"
        : "descent";
  }

  private scheduleYeti(earliest: number, spread: number) {
    this.nextYeti = earliest + this.random() * spread;
    this.yetiSide = this.random() < 0.5 ? -1 : 1;
    const clue = this.random();
    this.yetiClue = clue < 0.33 ? "tracks" : clue < 0.67 ? "glimpse" : "step";
    // A glimpse may have to wait through a full stretch of narrow rows.
    const visualLead = this.yetiClue === "glimpse" ? 295 : 170;
    this.yetiClueLead =
      this.yetiClue === "step"
        ? 35 + this.random() * 55
        : visualLead + this.random() * (YETI_CLUE_MAX_LEAD - visualLead);
    const attack = this.random();
    if (attack < 0.35) this.yetiMode = "immediate";
    else if (attack < 0.65) this.yetiMode = "delayed";
    else if (attack < 0.85) this.yetiMode = "steady";
    else this.yetiMode = "front";
  }

  private startYeti() {
    this.glimpse = null;
    this.yetiClue = null;
    const rush = this.yetiMode === "immediate";
    const enemy: SkiYeti = {
      x: this.yetiSide < 0 ? 70 : this.width - 70,
      y: YETI_ENTRY_Y,
      age: 0,
      strideAge: 0,
      blinkAt: rush ? 0 : null,
      attack: { kind: "pursuit" },
    };
    if (rush) {
      enemy.attack = { kind: "sprint", until: YETI_SPRINT_DURATION };
    } else if (this.yetiMode === "delayed") {
      enemy.attack = {
        kind: "waiting",
        until: 0.8 + this.random() * 0.8 - YETI_WINDUP_DURATION,
      };
    }
    this.yeti = enemy;
    this.events.push({
      type: "yeti-appear",
      x: enemy.x,
      y: enemy.y,
      front: false,
      rush,
    });
  }

  private get frontYetiY() {
    return (
      this.player.y +
      YETI_FRONT_LEAD +
      (this.nextYeti - this.distance) / SKI_METERS_PER_PIXEL
    );
  }

  private placeFrontYeti() {
    const x = clamp(this.player.x, 45, this.width - 45);
    const y = this.frontYetiY;
    this.yeti = {
      x,
      y,
      age: 0,
      strideAge: 0,
      blinkAt: null,
      attack: { kind: "standing" },
    };
    const escapeSide = x < this.width / 2 ? 1 : -1;
    this.addPine(x + escapeSide * 100, y + YETI_FRONT_PINE_OFFSET);
  }

  private moveYeti(enemy: SkiYeti, base: number) {
    const dt = SKI_STEP;
    if (enemy.attack.kind === "standing") {
      enemy.y = this.frontYetiY;
      if (this.distance < this.nextYeti) return;
      this.glimpse = null;
      this.yetiClue = null;
      enemy.attack = { kind: "head-on" };
      this.events.push({
        type: "yeti-appear",
        x: enemy.x,
        y: enemy.y,
        front: true,
        rush: false,
      });
    }
    const gapY = this.player.y - enemy.y;
    if (enemy.attack.kind === "waiting" && enemy.age >= enemy.attack.until) {
      const gapX = this.player.x - enemy.x;
      if (gapY >= 74 && Math.hypot(gapX, gapY) <= 220) {
        enemy.attack = {
          kind: "windup",
          until: enemy.age + YETI_WINDUP_DURATION,
        };
        this.events.push({ type: "yeti-windup" });
      } else {
        enemy.attack = { kind: "pursuit" };
      }
    } else if (
      enemy.attack.kind === "windup" &&
      enemy.age >= enemy.attack.until
    ) {
      enemy.attack = {
        kind: "sprint",
        until: enemy.age + YETI_SPRINT_DURATION,
      };
      enemy.blinkAt = enemy.age;
    }

    const attack = enemy.attack;
    const age = enemy.age;
    enemy.age += dt;
    if (attack.kind === "head-on") {
      // Hold the line through the crossing so the skier can commit to a dodge.
      enemy.y -= (120 + this.velocity.y * 0.45) * dt;
      enemy.strideAge += 1.8 * dt;
      if (enemy.y <= this.player.y - 48)
        enemy.attack = { kind: "turning", until: enemy.age + 0.65 };
      return;
    }
    if (attack.kind === "turning") {
      enemy.y -= (72 + this.velocity.y * 0.32) * dt;
      enemy.strideAge += 0.6 * dt;
      if (enemy.age >= attack.until) enemy.attack = { kind: "pursuit" };
      return;
    }

    const sprinting = attack.kind === "sprint";
    const fatigue =
      attack.kind === "tired"
        ? 1 - clamp((age - attack.since) / YETI_RECOVERY_DURATION, 0, 1)
        : 0;
    enemy.strideAge += (sprinting ? 1.8 : 1 - fatigue * 0.34) * dt;
    const lateralStep = (sprinting ? 245 : 100 - fatigue * 32) * dt;
    enemy.x += clamp(this.player.x - enemy.x, -lateralStep, lateralStep);
    const pursuit = clamp((base * 0.9 - this.velocity.y) * 0.5, -22, 36);
    // Preserve a reaction gap if the skier slowed during a delayed windup.
    const closingSpeed = sprinting
      ? Math.min(53 + pursuit * 0.15, Math.max(0, (gapY - 28) / dt))
      : pursuit - fatigue * 24;
    enemy.y = Math.min(this.player.y, enemy.y + closingSpeed * dt);
    if (sprinting && enemy.age >= attack.until) {
      enemy.attack = { kind: "tired", since: enemy.age };
      this.events.push({ type: "yeti-tired" });
    } else if (attack.kind === "tired" && fatigue === 0) {
      enemy.attack = { kind: "pursuit" };
    }
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

  private showGlimpse(y: number, gap: number, halfWidth: number) {
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
      tree = this.addPine(
        clamp(gap + side * (halfWidth + 20), 48, this.width - 48),
        y,
      );
    }
    this.glimpse = {
      treeId: tree.id,
      side: tree.x < this.width / 2 ? 1 : -1,
      age: 0,
    };
  }

  private addPine(x: number, y: number) {
    const pine: SkiObject = {
      id: ++this.sequence,
      kind: "pine",
      x,
      y,
      hit: false,
    };
    this.objects.push(pine);
    return pine;
  }

  private prepareSceneGlimpse(
    rowDistance: number,
    y: number,
    gap: number,
    halfWidth: number,
  ) {
    const scene = this.yetiScene;
    if (
      !scene ||
      scene.pending ||
      scene.heard >= scene.beats.length ||
      rowDistance < scene.beats[scene.heard]
    )
      return;

    const crossing = scene.heard === 1;
    const side = crossing ? -scene.side : scene.side;
    const tree =
      this.objects.find(
        (object) =>
          object.y === y &&
          object.kind === "pine" &&
          side * (object.x - gap) >= halfWidth,
      ) ??
      this.addPine(
        clamp(gap + side * (halfWidth + 18), 36, this.width - 36),
        y,
      );
    const exit = crossing
      ? this.addPine(clamp(tree.x + side * 38, 36, this.width - 36), y + 62)
      : null;
    scene.pending = {
      treeId: tree.id,
      side: -side,
      age: 0,
      duration: crossing ? 0.43 : 0.28,
      exitTreeId: exit?.id,
    };
  }

  private advanceGlimpse(dt: number) {
    const scene = this.yetiScene;
    if (scene?.pending) {
      const pending = scene.pending;
      const tree = this.objects.find((object) => object.id === pending.treeId);
      if (!tree) scene.pending = null;
      else if (tree.y <= this.player.y + (scene.heard === 2 ? 62 : -6)) {
        scene.pending = null;
        const count = ++scene.heard;
        if (count === 3) scene.revealAt = this.elapsed + YETI_EXPLANATION_DELAY;
        else this.glimpse = pending;
        this.events.push({ type: "yeti-crack", count, side: -pending.side });
      }
    }
    if (
      scene &&
      scene.revealAt !== null &&
      this.elapsed + 1e-6 >= scene.revealAt
    ) {
      scene.revealAt = null;
      const targetY = this.player.y + 62;
      // Pick the pine now so the reveal stays visible even at full downhill speed.
      const tree = this.objects
        .filter((object) => {
          const distance =
            this.distance + (object.y - this.player.y) * SKI_METERS_PER_PIXEL;
          return (
            object.kind === "pine" &&
            object.y > 64 &&
            object.y <= this.height &&
            scene.side * (object.x - this.width / 2) > 0 &&
            inYetiCorridor(distance, scene.beats[2])
          );
        })
        .sort((a, b) => Math.abs(a.y - targetY) - Math.abs(b.y - targetY))[0];
      if (tree)
        this.glimpse = {
          treeId: tree.id,
          side: -scene.side,
          age: 0,
          duration: 0.72,
        };
      this.events.push({ type: "yeti-explanation" });
    }
    if (this.glimpse) {
      const peek = this.glimpse;
      const tree = this.objects.find((object) => object.id === peek.treeId);
      if (tree && tree.y <= this.height) peek.age += dt;
      if (
        !tree ||
        this.slalom ||
        this.yeti ||
        peek.age >= (peek.duration ?? SKI_YETI_GLIMPSE_DURATION)
      )
        this.glimpse = null;
    }
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
    const rowDistance =
      this.distance + (y - this.player.y) * SKI_METERS_PER_PIXEL;
    const finalBeat = this.yetiScene?.beats[2];
    const corridor =
      finalBeat !== undefined &&
      !resting &&
      inYetiCorridor(rowDistance, finalBeat);
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
      this.width / 2 +
      (corridor ? 0 : (this.laneDirection * offset * this.width) / SKI_WIDTH);
    if (initialGap === undefined)
      this.laneCenter += clamp(target - this.laneCenter, -30, 30);
    const gap = initialGap ?? this.laneCenter;
    const halfWidth = corridor ? 92 : [120, 88, 70, 145][section];
    // The last three tight rows extend one bank inward, opposite the corridor's turn.
    // Overlapping collision radii close the edge even when the other obstacle is skipped.
    const edgeBankSize =
      section === 2 && this.stage === "descent"
        ? Math.max(0, sectionRow - 2)
        : 0;
    // Reserve the stretch before it scrolls into view. The encounter places its own pine.
    const frontCrossing =
      this.yetiMode === "front" &&
      rowDistance >= this.nextYeti - 10 &&
      rowDistance <= this.nextYeti + 62;
    for (const side of frontCrossing ? [] : [-1, 1]) {
      if (corridor) {
        this.addPine(gap + side * halfWidth, y);
        continue;
      }
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
    if (initialGap === undefined && !resting && !this.yeti)
      this.prepareSceneGlimpse(rowDistance, y, gap, halfWidth);
    const lead = this.nextYeti - this.distance;
    if (
      initialGap === undefined &&
      !resting &&
      !this.yeti &&
      (finalBeat === undefined ||
        this.distance >= finalBeat + YETI_CORRIDOR_TAIL) &&
      this.distance >= this.normalUntil &&
      lead <= this.yetiClueLead &&
      lead >= YETI_VISUAL_CLUE_MIN_LEAD
    ) {
      if (this.yetiClue === "tracks") {
        // Keep the clue beside the skier's route and inside the clear corridor.
        const offset = this.random() < 0.5 ? -34 : 34;
        const trackHalfWidth = halfWidth - 44;
        this.objects.push({
          id: ++this.sequence,
          kind: "tracks",
          x: clamp(
            this.player.x + offset,
            gap - trackHalfWidth,
            gap + trackHalfWidth,
          ),
          y: y + 32,
          hit: false,
        });
        this.yetiClue = null;
      } else if (
        this.yetiClue === "glimpse" &&
        (section === 0 || section === 3)
      ) {
        this.showGlimpse(y, gap, halfWidth);
        this.yetiClue = null;
      }
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
        // Leave room for a clue after the full normal-terrain interval.
        const earliestYeti = this.normalUntil + YETI_CLUE_MAX_LEAD;
        if (this.nextYeti < earliestYeti)
          this.nextYeti = earliestYeti + this.random() * 350;
        if (!this.yetiScene && this.escapes === 0) {
          this.yetiScene = {
            beats: [
              this.distance + 300 + this.random() * 80,
              this.distance + 620 + this.random() * 70,
              this.distance + 990 + this.random() * 40,
            ],
            side: this.random() < 0.5 ? -1 : 1,
            heard: 0,
            pending: null,
            revealAt: null,
          };
        }
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
    this.advanceGlimpse(dt);
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
      (!this.yeti || this.yeti.attack.kind === "standing") &&
      !this.slalom &&
      this.distance >= this.normalUntil
    ) {
      const lead = this.nextYeti - this.distance;
      if (
        !this.yeti &&
        this.yetiMode === "front" &&
        this.frontYetiY <= this.height + YETI_FRONT_SPAWN_MARGIN
      )
        this.placeFrontYeti();
      if (!this.yeti && lead <= 0) {
        this.startYeti();
      } else if (
        lead > 0 &&
        this.yetiClue &&
        lead <= (this.yetiClue === "step" ? this.yetiClueLead : 45)
      ) {
        // A planned visual clue can miss its window if there is no suitable row.
        this.yetiClue = null;
        this.events.push({ type: "yeti-distant-step" });
      }
    }
    if (this.yeti) {
      const enemy = this.yeti;
      this.moveYeti(enemy, base);
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
        this.scheduleYeti(this.distance + 2200, 1000);
        this.normalUntil = this.distance + SKI_NORMAL_INTERVAL;
        this.yeti = null;
      }
    }
  }
}
