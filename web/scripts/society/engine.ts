export type Point = { x: number; y: number };
export type Surface = Point & { id: string; width: number; height: number; shelter: boolean };
export type Environment = { width: number; height: number; surfaces: Surface[] };
export type State = "rest" | "walk" | "observe" | "enter" | "hidden" | "peek" | "leave";
export type Entity = Point & {
  id: number; state: State; until: number; since: number; path: Point[];
  home: string | null; lastHome: string | null; partner: number | null;
  curiosity: number; sociability: number; timidity: number; speed: number;
  exposedAt: number; nextDecision: number; size: number; opacity: number; peeking: boolean;
};
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const inside = (p: Point, r: Surface, margin = 0) => p.x > r.x - margin && p.x < r.x + r.width + margin
  && p.y > r.y - margin && p.y < r.y + r.height + margin;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

// A small navigation grid is shared by every entity and rebuilt only when the
// environment changes. Text, links and surfaces are obstacles, not walking space.
export const createNavigation = (environment: Environment) => {
  const { width, height, surfaces } = environment;
  const step = Math.max(28, Math.sqrt(width * height / 2400));
  const cols = Math.max(1, Math.floor(width / step));
  const rows = Math.max(1, Math.floor(height / step));
  const point = (id: number) => ({ x: (id % cols + 0.5) * width / cols, y: (Math.floor(id / cols) + 0.5) * height / rows });
  const free: number[] = [];
  const blocked = new Uint8Array(cols * rows);
  for (let id = 0; id < blocked.length; id++) {
    const p = point(id);
    blocked[id] = Number(surfaces.some((surface) => inside(p, surface, 11)));
    if (!blocked[id]) free.push(id);
  }
  const nearest = (p: Point) => {
    let best = -1;
    let cost = Infinity;
    for (const id of free) {
      const d = distance(p, point(id));
      if (d < cost) { cost = d; best = id; }
    }
    return best;
  };
  const route = (from: Point, to: Point): Point[] => {
    const start = nearest(from), end = nearest(to);
    if (start < 0 || end < 0) return [];
    const parent = new Int32Array(blocked.length).fill(-1);
    const queue = [start];
    parent[start] = start;
    for (let head = 0; head < queue.length && parent[end] < 0; head++) {
      const id = queue[head], x = id % cols, y = Math.floor(id / cols);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, next = ny * cols + nx;
        if (nx < 0 || nx >= cols || ny < 0 || ny >= rows || blocked[next] || parent[next] >= 0) continue;
        // Also reject thin obstacles falling between neighbouring grid centres.
        const a = point(id), b = point(next);
        if (surfaces.some((r) => segmentHits(a, b, r))) continue;
        parent[next] = id;
        queue.push(next);
      }
    }
    if (parent[end] < 0) return [];
    const result: Point[] = [];
    for (let id = end; id !== start; id = parent[id]) result.push(point(id));
    result.push(point(start));
    result.reverse();
    const smooth: Point[] = [];
    for (let index = 0; index < result.length;) {
      smooth.push(result[index]);
      let next = result.length - 1;
      while (next > index + 1 && surfaces.some((surface) => segmentHits(result[index], result[next], surface))) next--;
      index = Math.max(index + 1, next);
    }
    if (smooth[smooth.length - 1] !== result[result.length - 1]) smooth.push(result[result.length - 1]);
    return smooth;
  };
  return { free: free.map(point), route, nearest: (p: Point) => { const id = nearest(p); return id < 0 ? null : point(id); } };
};

const segmentHits = (a: Point, b: Point, rect: Surface) => {
  // Slab intersection against a padded rectangle, including thin rules/text.
  let low = 0, high = 1;
  for (const [start, delta, min, max] of [
    [a.x, b.x - a.x, rect.x - 9, rect.x + rect.width + 9],
    [a.y, b.y - a.y, rect.y - 9, rect.y + rect.height + 9],
  ]) {
    if (Math.abs(delta) < 0.001) { if (start < min || start > max) return false; }
    else {
      const t1 = (min - start) / delta, t2 = (max - start) / delta;
      low = Math.max(low, Math.min(t1, t2)); high = Math.min(high, Math.max(t1, t2));
      if (low > high) return false;
    }
  }
  return true;
};

export const createSociety = (initial: Environment, random: () => number = Math.random) => {
  let environment = initial;
  let navigation = createNavigation(environment);
  let now = 0;
  let retreatAt: number | null = null;
  let nextSpeech = 35_000 + random() * 25_000;
  let speech: { id: number; text: string; until: number } | null = null;
  const entities: Entity[] = [];
  const pick = <T>(values: T[]) => values[Math.min(values.length - 1, Math.floor(random() * values.length))];
  const shelters = () => environment.surfaces.filter((surface) => surface.shelter);
  const homeOf = (entity: Entity) => shelters().find((surface) => surface.id === entity.home);
  const setState = (entity: Entity, state: State, duration = 0) => {
    entity.state = state; entity.since = now; entity.until = now + duration;
  };
  const release = (entity: Entity) => {
    const other = entities.find((candidate) => candidate.id === entity.partner);
    if (other?.partner === entity.id) other.partner = null;
    entity.partner = null;
  };
  const walk = (entity: Entity, target: Point, home: string | null = null) => {
    const route = navigation.route(entity, target);
    if (!route.length) return false;
    release(entity);
    entity.path = route; entity.home = home;
    setState(entity, "walk");
    return true;
  };
  const edge = (surface: Surface, entity: Point) => {
    const candidates = [
      { x: surface.x - 22, y: surface.y + surface.height * (0.25 + random() * 0.5) },
      { x: surface.x + surface.width + 22, y: surface.y + surface.height * (0.25 + random() * 0.5) },
      { x: surface.x + surface.width * (0.25 + random() * 0.5), y: surface.y - 22 },
      { x: surface.x + surface.width * (0.25 + random() * 0.5), y: surface.y + surface.height + 22 },
    ].filter((p) => p.x > 12 && p.x < environment.width - 12 && p.y > 12 && p.y < environment.height - 12);
    return candidates.sort((a, b) => distance(a, entity) - distance(b, entity))[0];
  };
  const seekShelter = (entity: Entity) => {
    const options = shelters().filter((surface) => entities.filter((other) => other.home === surface.id).length < 2)
      .sort((a, b) => distance(a, entity) + (a.id === entity.lastHome ? 120 : 0) - distance(b, entity) - (b.id === entity.lastHome ? 120 : 0));
    for (const surface of options.slice(0, 5)) {
      const target = edge(surface, entity);
      if (target && walk(entity, target, surface.id)) return true;
    }
    return false;
  };
  const count = environment.width < 620 ? 5 : 10;
  for (let id = 0; id < count && navigation.free.length; id++) {
    const region = { x: environment.width * (0.1 + random() * 0.8), y: environment.height * (0.12 + random() * 0.76) };
    const point = navigation.nearest(region)!;
    if (entities.some((entity) => distance(entity, point) < 26)) continue;
    entities.push({ ...point, id, state: "rest", since: 0, until: 500 + random() * 2200, path: [],
      home: null, lastHome: null, partner: null, curiosity: random(), sociability: random(), timidity: random(),
      speed: 22 + random() * 24, exposedAt: 0, nextDecision: 0, size: 16 + random() * 3, opacity: 0, peeking: false });
  }

  const decide = (entity: Entity) => {
    entity.nextDecision = now + 300 + random() * 600;
    if (now < entity.until) return;
    const expected = entities.find((other) => other.id === entity.partner);
    if (entity.state === "observe" && expected?.state === "walk" && expected.partner === entity.id) {
      entity.until = now + 500;
      return;
    }
    if (now - entity.exposedAt > 12_000 - entity.timidity * 5000 || random() < entity.timidity * 0.4) {
      if (seekShelter(entity)) return;
    }
    const neighbour = entities.filter((other) => other !== entity && ["rest", "observe"].includes(other.state)
      && other.partner === null && distance(entity, other) > 30 && distance(entity, other) < 170)
      .sort((a, b) => distance(a, entity) - distance(b, entity))[0];
    if (neighbour && random() < entity.sociability * 0.75) {
      // The neighbour may decline; agreements are reciprocal and temporary.
      if (random() > neighbour.timidity * 0.65) {
        const target = { x: neighbour.x + (entity.x < neighbour.x ? -30 : 30), y: neighbour.y + 12 };
        if (walk(entity, target)) {
          entity.partner = neighbour.id; neighbour.partner = entity.id;
          setState(neighbour, "observe", 2500 + random() * 1500);
          return;
        }
      } else { setState(entity, "observe", 900 + random() * 1200); return; }
    }
    if (random() < 0.35 + entity.curiosity * 0.45) {
      const choices = navigation.free.filter((p) => distance(p, entity) > 40 && distance(p, entity) < 180);
      if (choices.length && walk(entity, pick(choices))) return;
    }
    release(entity);
    setState(entity, "rest", 1500 + random() * 4500);
  };

  return {
    entities,
    get speech() { return speech; },
    get retiring() { return retreatAt !== null; },
    get finished() { return retreatAt !== null && now - retreatAt >= 900; },
    get opacity() { return retreatAt === null ? 1 : clamp(1 - (now - retreatAt - 250) / 650, 0, 1); },
    retreat() {
      if (retreatAt !== null) return;
      retreatAt = now; speech = null;
      for (const entity of entities) {
        if (!["hidden", "enter"].includes(entity.state)) seekShelter(entity);
      }
    },
    remap(next: Environment) {
      environment = next; navigation = createNavigation(next);
      for (const entity of entities) {
        const home = homeOf(entity);
        if (entity.state === "hidden" && home) { entity.x = home.x + home.width / 2; entity.y = home.y + home.height / 2; continue; }
        const point = navigation.nearest(entity);
        if (point) { entity.x = point.x; entity.y = point.y; }
        entity.path = []; entity.home = null; entity.partner = null;
        setState(entity, "rest", 400 + random() * 900);
      }
    },
    step(delta: number) {
      const dt = clamp(delta, 0, 64); now += dt;
      for (const entity of entities) {
        entity.opacity = clamp((now - entity.id * 100) / 900, 0, 1);
        if (entity.state === "walk") {
          const target = entity.path[0];
          if (target) {
            const d = distance(entity, target), amount = entity.speed * dt / 1000 * (retreatAt === null ? 1 : 4);
            if (d <= amount) { entity.x = target.x; entity.y = target.y; entity.path.shift(); }
            else {
              const next = { x: entity.x + (target.x - entity.x) / d * amount, y: entity.y + (target.y - entity.y) / d * amount };
              const crowded = entities.some((other) => other !== entity && other.state !== "hidden" && distance(next, other) < 17);
              if (!crowded) { entity.x = next.x; entity.y = next.y; }
              else if (now > entity.nextDecision) { entity.path = []; setState(entity, "observe", 600 + random() * 1200); }
            }
          } else if (homeOf(entity)) { setState(entity, "enter", 550); }
          else { setState(entity, entity.partner === null ? "rest" : "observe", 1400 + random() * 2500); }
        } else if (entity.state === "enter") {
          const home = homeOf(entity);
          if (!home) { setState(entity, "rest", 500); continue; }
          // Enter the nearest edge; drawing clips the silhouette behind it.
          const target = { x: clamp(entity.x, home.x + 13, home.x + home.width - 13), y: clamp(entity.y, home.y + 13, home.y + home.height - 13) };
          const amount = Math.min(1, dt / Math.max(dt, entity.until - now));
          entity.x += (target.x - entity.x) * amount; entity.y += (target.y - entity.y) * amount;
          if (now >= entity.until) { entity.lastHome = home.id; setState(entity, "hidden", 3500 + random() * 9000); }
        } else if (entity.state === "hidden") {
          entity.opacity = 0;
          if (now >= entity.until && retreatAt === null) {
            const home = homeOf(entity);
            const point = home && edge(home, entity);
            let exit = point && navigation.nearest(point);
            entity.peeking = random() < entity.timidity;
            if (exit && home && point && entity.peeking) {
              exit = {
                x: point.x < home.x ? home.x - 3 : point.x > home.x + home.width ? home.x + home.width + 3 : point.x,
                y: point.y < home.y ? home.y - 3 : point.y > home.y + home.height ? home.y + home.height + 3 : point.y,
              };
            }
            if (exit) { entity.path = [exit]; setState(entity, "leave", 650); }
            else setState(entity, "hidden", 2000);
          }
        } else if (entity.state === "leave" || entity.state === "peek") {
          const target = entity.path[0];
          if (!target) { entity.home = null; entity.exposedAt = now; setState(entity, "rest", 900); continue; }
          const amount = Math.min(1, dt / Math.max(dt, entity.until - now));
          entity.x += (target.x - entity.x) * amount; entity.y += (target.y - entity.y) * amount;
          if (now >= entity.until) {
            if (entity.state === "leave" && entity.peeking) setState(entity, "peek", 1000 + random() * 1500);
            else if (entity.state === "peek" && random() < 0.5 && homeOf(entity)) {
              entity.path = []; setState(entity, "enter", 500);
            } else {
              const outside = navigation.nearest(entity);
              entity.path = outside ? [outside] : []; entity.home = null; entity.exposedAt = now;
              setState(entity, "walk");
            }
          }
        } else if (retreatAt === null && now >= entity.nextDecision) decide(entity);
      }
      if (speech && now >= speech.until) speech = null;
      if (retreatAt === null && now >= nextSpeech) {
        nextSpeech = now + 8000 + random() * 5000;
        const speaker = entities.find((entity) => entity.state === "observe" && entity.partner !== null
          && entities.some((other) => other.id === entity.partner && other.state !== "hidden" && distance(entity, other) < 75));
        if (!speech && speaker && random() < 0.18) {
          speech = { id: speaker.id, text: pick(["por aqui.", "ficou aberto…", "você ouviu?", "já volto."]), until: now + 3000 };
          nextSpeech = now + 45_000 + random() * 30_000;
        }
      }
    },
  };
};
