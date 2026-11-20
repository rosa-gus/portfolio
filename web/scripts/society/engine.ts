export type Point = { x: number; y: number };
export type Surface = Point & { id: string; width: number; height: number; shelter: boolean };
export type Environment = { width: number; height: number; surfaces: Surface[] };
export type State = "rest" | "walk" | "observe" | "yield" | "enter" | "hidden" | "peek" | "leave";
export type Entity = Point & {
  id: number; state: State; until: number; since: number; path: Point[];
  home: string | null; lastHome: string | null; partner: number | null;
  curiosity: number; sociability: number; timidity: number; speed: number;
  exposedAt: number; nextDecision: number; size: number; opacity: number; peeking: boolean;
  color: number; fidelity: number; preferredHome: string | null; interest: string | null;
  affinities: Map<number, { strength: number; lastMet: number }>;
  lastEncounter: number; lastStroll: number; togetherUntil: number; waitingFor: number | null;
  lastOccupiedVisit: number;
  blockedAttempts: number; blockedBy: number | null; passing: boolean; phase: number;
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
  let nextSpeech = 30_000 + random() * 20_000;
  let speech: { id: number; text: string; until: number } | null = null;
  let nextQuiet = 45_000 + random() * 45_000;
  let quietUntil = 0;
  let quietSince = 0;
  let quietExplorer: number | null = null;
  let passage: { id: number; until: number; since: number } | null = null;
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
    entity.togetherUntil = 0;
  };
  const walk = (entity: Entity, target: Point, home: string | null = null) => {
    const route = navigation.route(entity, target);
    if (!route.length) return false;
    release(entity);
    entity.path = route; entity.home = home; entity.waitingFor = null; entity.interest = null;
    entity.blockedAttempts = 0; entity.blockedBy = null;
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
    const preferredBusy = shelters().find((surface) => surface.id === entity.preferredHome
      && distance(surface, entity) < 140 && entities.filter((other) => other.home === surface.id).length >= 2);
    if (preferredBusy && now - entity.lastOccupiedVisit > 6500) {
      release(entity); entity.home = null; entity.interest = preferredBusy.id; entity.lastOccupiedVisit = now;
      setState(entity, "observe", 1000 + random() * 1400);
      return true;
    }
    const shelterCost = (surface: Surface) => distance(surface, entity)
      - (surface.id === entity.preferredHome ? 180 * entity.fidelity : 0)
      + (surface.id === entity.lastHome ? 35 * (1 - entity.fidelity) : 0);
    const options = shelters().filter((surface) => entities.filter((other) => other.home === surface.id).length < 2)
      .sort((a, b) => shelterCost(a) - shelterCost(b));
    for (const surface of options.slice(0, 5)) {
      const target = edge(surface, entity);
      if (target && walk(entity, target, surface.id)) return true;
    }
    const occupied = shelters().find((surface) => distance(surface, entity) < 120
      && entities.filter((other) => other.home === surface.id).length >= 2);
    if (occupied && now - entity.lastOccupiedVisit > 6500) {
      release(entity); entity.home = null; entity.interest = occupied.id; entity.lastOccupiedVisit = now;
      setState(entity, "observe", 1000 + random() * 1400);
      return true;
    }
    return false;
  };
  const count = environment.width < 620 ? 5 : 10;
  const firstColor = Math.floor(random() * 4);
  for (let id = 0; id < count && navigation.free.length; id++) {
    const region = { x: environment.width * (0.1 + random() * 0.8), y: environment.height * (0.12 + random() * 0.76) };
    const point = navigation.nearest(region)!;
    if (entities.some((entity) => distance(entity, point) < 26)) continue;
    entities.push({ ...point, id, state: "rest", since: 0, until: 500 + random() * 2200, path: [],
      home: null, lastHome: null, partner: null, curiosity: random(), sociability: random(), timidity: random(),
      speed: 22 + random() * 24, exposedAt: 0, nextDecision: 0, size: 16 + random() * 3, opacity: 0, peeking: false,
      color: (firstColor + id) % 4, fidelity: random(), preferredHome: shelters().length ? pick(shelters()).id : null,
      interest: null, affinities: new Map(), lastEncounter: -Infinity, lastStroll: -Infinity,
      togetherUntil: 0, waitingFor: null, lastOccupiedVisit: -Infinity,
      blockedAttempts: 0, blockedBy: null, passing: false, phase: 0 });
  }

  const bond = (a: Entity, b: Entity) => {
    if (now - a.lastEncounter < 8000 || now - b.lastEncounter < 8000) return;
    for (const [entity, other] of [[a, b], [b, a]]) {
      const memory = entity.affinities.get(other.id);
      const faded = memory ? Math.max(0, memory.strength - (now - memory.lastMet) / 180_000) : 0;
      entity.affinities.set(other.id, { strength: Math.min(1, faded + 0.28), lastMet: now });
      if (entity.affinities.size > 3) {
        const weakest = [...entity.affinities.entries()].filter(([id]) => id !== other.id)
          .sort((a, b) => a[1].strength - b[1].strength)[0];
        if (weakest) entity.affinities.delete(weakest[0]);
      }
      entity.lastEncounter = now;
    }
  };
  const affinity = (entity: Entity, other: Entity) => {
    const memory = entity.affinities.get(other.id);
    return memory ? Math.max(0, memory.strength - (now - memory.lastMet) / 180_000) : 0;
  };
  const stroll = (a: Entity, b: Entity) => {
    const choices = navigation.free.filter((point) => distance(a, point) > 65 && distance(a, point) < 145);
    if (!choices.length) return false;
    const target = pick(choices);
    const companionTarget = navigation.nearest({ x: target.x + (a.x < b.x ? 32 : -32), y: target.y + 18 });
    if (!companionTarget || distance(target, companionTarget) < 24) return false;
    const routeA = navigation.route(a, target), routeB = navigation.route(b, companionTarget);
    if (!routeA.length || !routeB.length) return false;
    release(a); release(b);
    a.path = routeA; b.path = routeB; a.home = null; b.home = null;
    a.partner = b.id; b.partner = a.id;
    a.togetherUntil = b.togetherUntil = now + 8000;
    a.lastStroll = b.lastStroll = now;
    setState(a, "walk"); setState(b, "walk");
    return true;
  };

  const decide = (entity: Entity) => {
    entity.nextDecision = now + 300 + random() * 600;
    if (now < entity.until) return;
    if (now < quietUntil && entity.id !== quietExplorer) {
      setState(entity, "rest", quietUntil - now + random() * 500);
      return;
    }
    const expected = entities.find((other) => other.id === entity.partner);
    if (entity.state === "observe" && expected?.state === "walk" && expected.partner === entity.id && now - entity.since < 6500) {
      entity.until = now + 500;
      return;
    }
    if (expected && expected.partner === entity.id && distance(entity, expected) < 80) {
      bond(entity, expected);
      if (now - entity.lastStroll > 16_000 && random() < entity.sociability * 0.65 && stroll(entity, expected)) return;
    }
    if (now - entity.exposedAt > 12_000 - entity.timidity * 5000 || random() < entity.timidity * 0.4) {
      if (seekShelter(entity)) return;
    }
    const neighbour = entities.filter((other) => other !== entity && ["rest", "observe"].includes(other.state)
      && other.partner === null && distance(entity, other) > 30 && distance(entity, other) < 170 + affinity(entity, other) * 60)
      .sort((a, b) => distance(a, entity) - affinity(entity, a) * 100 - distance(b, entity) + affinity(entity, b) * 100)[0];
    if (neighbour && random() < entity.sociability * 0.75 + affinity(entity, neighbour) * 0.2) {
      // The neighbour may decline; agreements are reciprocal and temporary.
      if (random() > neighbour.timidity * 0.65) {
        const target = { x: neighbour.x + (entity.x < neighbour.x ? -30 : 30), y: neighbour.y + 12 };
        if (walk(entity, target)) {
          entity.interest = neighbour.interest;
          entity.partner = neighbour.id; neighbour.partner = entity.id;
          setState(neighbour, "observe", 2500 + random() * 1500);
          return;
        }
      } else { setState(entity, "observe", 900 + random() * 1200); return; }
    }
    if (random() < entity.curiosity * 0.3 && shelters().length) {
      const surface = pick(shelters());
      const target = edge(surface, entity);
      if (target && walk(entity, target)) { entity.interest = surface.id; return; }
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
    get quiet() { return now < quietUntil; },
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
      passage = null;
      environment = next; navigation = createNavigation(next);
      for (const entity of entities) {
        entity.passing = false; entity.phase = 0; entity.blockedAttempts = 0; entity.blockedBy = null;
        const home = homeOf(entity);
        if (entity.preferredHome && !shelters().some((surface) => surface.id === entity.preferredHome)) entity.preferredHome = null;
        if (entity.state === "hidden" && home) { entity.x = home.x + home.width / 2; entity.y = home.y + home.height / 2; continue; }
        const point = navigation.nearest(entity);
        if (point) { entity.x = point.x; entity.y = point.y; }
        entity.path = []; entity.home = null; entity.partner = null; entity.togetherUntil = 0; entity.waitingFor = null;
        setState(entity, "rest", 400 + random() * 900);
      }
    },
    step(delta: number) {
      const dt = clamp(delta, 0, 64); now += dt;
      if (passage) {
        const active = entities.find((entity) => entity.id === passage!.id);
        const clear = active && !entities.some((other) => other !== active && other.state !== "hidden" && distance(active, other) < 32);
        if (!active || active.state !== "walk" || now >= passage.until || (now - passage.since > 150 && clear)) {
          if (active) { active.passing = false; active.blockedAttempts = 0; active.blockedBy = null; }
          passage = null;
        }
      }
      if (!passage) {
        // One shared permit, with stable ID priority. Wait and attempt a detour
        // three times before treating another entity as temporarily intangible.
        const candidate = entities.filter((entity) => entity.state === "yield" && entity.blockedAttempts >= 3
          && now >= entity.until && entity.path.length > 0
          && entities.some((other) => other !== entity && other.state !== "hidden" && distance(entity, other) < 32))
          .sort((a, b) => a.id - b.id)[0];
        if (candidate) {
          passage = { id: candidate.id, since: now, until: now + 4000 };
          candidate.passing = true; candidate.waitingFor = null;
          setState(candidate, "walk");
        }
      }
      if (retreatAt === null && now >= nextQuiet) {
        quietSince = now;
        quietUntil = now + 4000 + random() * 3000;
        nextQuiet = quietUntil + 40_000 + random() * 40_000;
        quietExplorer = entities.filter((entity) => entity.state !== "hidden")
          .sort((a, b) => b.curiosity - a.curiosity)[0]?.id ?? null;
        speech = null;
      }
      for (const entity of entities) {
        entity.opacity = clamp((now - entity.id * 100) / 900, 0, 1);
        entity.phase += ((entity.passing ? 1 : 0) - entity.phase) * Math.min(1, dt / 140);
        if (now < quietUntil && entity.id !== quietExplorer && now - quietSince > entity.id * 90
          && entity.state === "walk" && entity.home === null) {
          release(entity); entity.path = []; setState(entity, "rest", quietUntil - now);
        }
        if (entity.togetherUntil > 0 && now > entity.togetherUntil) release(entity);
        if (entity.state === "walk") {
          const target = entity.path[0];
          if (target) {
            const companion = entity.togetherUntil > now ? entities.find((other) => other.id === entity.partner) : null;
            const speed = companion ? Math.min(entity.speed, companion.speed) : entity.speed;
            const d = distance(entity, target), amount = speed * dt / 1000 * (retreatAt === null ? 1 : 4);
            const next = d <= amount ? target : { x: entity.x + (target.x - entity.x) / d * amount, y: entity.y + (target.y - entity.y) / d * amount };
            const crowded = entity.passing ? undefined : entities.find((other) => other !== entity && other.state !== "hidden" && distance(next, other) < 22);
            if (!crowded) {
              entity.x = next.x; entity.y = next.y;
              if (d <= amount) entity.path.shift();
              const blocker = entities.find((other) => other.id === entity.blockedBy);
              if (!blocker || blocker.state === "hidden" || distance(entity, blocker) > 32) {
                entity.blockedAttempts = 0; entity.blockedBy = null;
              }
            } else {
              entity.blockedAttempts++; entity.blockedBy = crowded.id;
              entity.waitingFor = crowded.id; setState(entity, "yield", 650 + random() * 650);
            }
          } else if (homeOf(entity)) { setState(entity, "enter", 550); }
          else {
            const companion = entities.find((other) => other.id === entity.partner);
            if (companion && distance(entity, companion) < 80) bond(entity, companion);
            setState(entity, entity.partner === null && entity.interest === null ? "rest" : "observe", 1400 + random() * 2500);
          }
        } else if (entity.state === "yield") {
          if (now < entity.until) continue;
          const other = entities.find((candidate) => candidate.id === entity.waitingFor);
          if (other && distance(entity, other) < 30 && entity.id > other.id) {
            const candidates = navigation.free.filter((point) => distance(point, entity) > 30 && distance(point, entity) < 75
              && distance(point, other) > Math.max(35, distance(entity, other) + 8)
              && !environment.surfaces.some((surface) => segmentHits(entity, point, surface)));
            const sidestep = candidates.length ? pick(candidates) : null;
            const destination = entity.path[entity.path.length - 1];
            if (sidestep && destination) {
              const onward = navigation.route(sidestep, destination);
              if (onward.length) entity.path = [sidestep, ...onward];
            }
          }
          entity.waitingFor = null;
          setState(entity, "walk");
        } else if (entity.state === "enter") {
          const home = homeOf(entity);
          if (!home) { setState(entity, "rest", 500); continue; }
          // Enter the nearest edge; drawing clips the silhouette behind it.
          const target = { x: clamp(entity.x, home.x + 13, home.x + home.width - 13), y: clamp(entity.y, home.y + 13, home.y + home.height - 13) };
          const amount = Math.min(1, dt / Math.max(dt, entity.until - now));
          entity.x += (target.x - entity.x) * amount; entity.y += (target.y - entity.y) * amount;
          if (now >= entity.until) {
            entity.lastHome = home.id;
            if (entity.preferredHome === null || random() < (1 - entity.fidelity) * 0.12) entity.preferredHome = home.id;
            setState(entity, "hidden", 3500 + random() * 9000);
          }
        } else if (entity.state === "hidden") {
          entity.opacity = 0;
          if (now >= entity.until && retreatAt === null && now >= quietUntil) {
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
        if (!speech && speaker && now >= quietUntil && random() < 0.24) {
          const companion = entities.find((other) => other.id === speaker.partner);
          const phrases = speaker.interest
            ? ["mru?", "nüm…?", "pru?"]
            : companion && affinity(speaker, companion) > 0.35
              ? ["mm. pru.", "pru… pru.", "mru-mru."] : ["mru…", "nüm?", "mm."];
          speech = { id: speaker.id, text: pick(phrases), until: now + 3000 };
          nextSpeech = now + 40_000 + random() * 25_000;
        }
      }
    },
  };
};
