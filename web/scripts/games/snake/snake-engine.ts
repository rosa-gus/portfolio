export type Direction = "up" | "down" | "left" | "right";
export type Cell = { x: number; y: number };
export type Phase = "ready" | "running" | "paused" | "over" | "won";
export type TickEvent =
  | { type: "eat" }
  | { type: "death"; cause: "wall" | "body" | "witch" }
  | { type: "witch"; first: boolean };
type Enemy = Cell & { dx: number; dy: number; preparing: boolean };
const vectors: Record<Direction, Cell> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
const opposite: Record<Direction, Direction> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};
const same = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;

export class SnakeEngine {
  readonly size = 20;
  body: Cell[] = [];
  direction: Direction = "right";
  food: (Cell & { bonus: number }) | null = null;
  enemy: Enemy | null = null;
  phase: Phase = "ready";
  private pendingDirection: Direction | null = null;
  private growth = 0;
  private nextEnemyAt = 10;
  private witchAppeared = false;
  private random: () => number;

  constructor(random: () => number = Math.random) {
    this.random = random;
    this.reset();
  }

  get score() {
    return this.body.length - 1;
  }
  get speed() {
    const thresholds = [
      [100, 40],
      [80, 45],
      [60, 55],
      [50, 65],
      [40, 75],
      [30, 90],
      [25, 105],
      [20, 120],
      [15, 140],
      [10, 160],
      [5, 180],
    ];
    return thresholds.find(([score]) => this.score >= score)?.[1] ?? 200;
  }

  reset() {
    this.body = [{ x: 9, y: 9 }];
    this.direction = "right";
    this.pendingDirection = null;
    this.growth = 0;
    this.nextEnemyAt = 10;
    this.witchAppeared = false;
    this.enemy = null;
    this.phase = "ready";
    this.spawnFood();
  }

  start() {
    if (this.phase === "over" || this.phase === "won") this.reset();
    this.phase = "running";
  }

  pause() {
    if (this.phase === "running") this.phase = "paused";
  }

  turn(direction: Direction) {
    if (
      this.phase !== "running" ||
      this.pendingDirection ||
      direction === this.direction ||
      direction === opposite[this.direction]
    )
      return;
    this.pendingDirection = direction;
  }

  private outside(cell: Cell) {
    return (
      cell.x < 0 || cell.y < 0 || cell.x >= this.size || cell.y >= this.size
    );
  }

  private spawnFood() {
    const free: Cell[] = [];
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (!this.body.some((cell) => cell.x === x && cell.y === y))
          free.push({ x, y });
      }
    }
    if (!free.length) {
      this.food = null;
      this.phase = "won";
      return;
    }
    this.food = {
      ...free[Math.floor(this.random() * free.length)],
      bonus: this.random() < 0.05 ? 3 : 1,
    };
  }

  tick(): TickEvent[] {
    if (this.phase !== "running") return [];
    const events: TickEvent[] = [];
    this.direction = this.pendingDirection ?? this.direction;
    this.pendingDirection = null;
    const vector = vectors[this.direction];
    const head = { x: this.body[0].x + vector.x, y: this.body[0].y + vector.y };
    const eats = this.food !== null && same(head, this.food);
    const grows = eats || this.growth > 0;
    const occupied = grows ? this.body : this.body.slice(0, -1);
    const hitsWall = this.outside(head);
    if (hitsWall || occupied.some((cell) => same(cell, head))) {
      this.phase = "over";
      return [{ type: "death", cause: hitsWall ? "wall" : "body" }];
    }
    if (eats && this.food) this.growth += this.food.bonus;
    this.body.unshift(head);
    if (this.growth > 0) this.growth--;
    else this.body.pop();
    if (eats) {
      events.push({ type: "eat" });
      this.spawnFood();
    }
    if (!this.food) return events;
    const enemyEvent = this.updateEnemy();
    if (enemyEvent === "spawn") {
      events.push({ type: "witch", first: !this.witchAppeared });
      this.witchAppeared = true;
    } else if (enemyEvent === "death")
      events.push({ type: "death", cause: "witch" });
    return events;
  }

  private updateEnemy() {
    if (!this.enemy) {
      if (this.score < this.nextEnemyAt) return;
      const corners = [
        { x: 0, y: 0, dx: 1, dy: 1 },
        { x: 19, y: 0, dx: -1, dy: 1 },
        { x: 0, y: 19, dx: 1, dy: -1 },
        { x: 19, y: 19, dx: -1, dy: -1 },
      ];
      this.enemy = {
        ...corners[Math.floor(this.random() * corners.length)],
        preparing: true,
      };
      this.nextEnemyAt += 15;
      return "spawn";
    }
    const enemy = this.enemy;
    if (enemy.preparing) {
      enemy.x = Math.max(
        0,
        Math.min(19, enemy.x + (this.random() > 0.5 ? 1 : -1)),
      );
      enemy.y = Math.max(
        0,
        Math.min(19, enemy.y + (this.random() > 0.5 ? 1 : -1)),
      );
      if (this.random() > 0.8) enemy.preparing = false;
    } else {
      enemy.x += enemy.dx;
      enemy.y += enemy.dy;
    }
    if (this.outside(enemy)) this.enemy = null;
    else if (same(enemy, this.body[0])) {
      this.phase = "over";
      return "death";
    } else if (this.body.slice(1).some((cell) => same(cell, enemy))) {
      this.body.pop();
      this.enemy = null;
    }
  }
}
