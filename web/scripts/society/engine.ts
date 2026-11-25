import { createSocietyEvents } from "./events.ts";

export type Point = { x: number; y: number };
export type Surface = Point & {
  id: string;
  width: number;
  height: number;
  shelter: boolean;
  folderTab?: boolean;
};
export type Environment = {
  width: number;
  height: number;
  surfaces: Surface[];
};
export type State =
  | "rest"
  | "walk"
  | "observe"
  | "yield"
  | "enter"
  | "hidden"
  | "peek"
  | "leave";
export type Entity = Point & {
  id: number;
  state: State;
  until: number;
  since: number;
  path: Point[];
  home: string | null;
  lastHome: string | null;
  partner: number | null;
  curiosity: number;
  sociability: number;
  timidity: number;
  speed: number;
  exposedAt: number;
  needsFirstWalk: boolean;
  interestsLeft: number;
  nextDecision: number;
  size: number;
  opacity: number;
  peeking: boolean;
  color: number;
  fidelity: number;
  preferredHome: string | null;
  interest: string | null;
  affinities: Map<number, { strength: number; lastMet: number }>;
  lastEncounter: number;
  lastStroll: number;
  meetingUntil: number;
  togetherUntil: number;
  waitingFor: number | null;
  lastOccupiedVisit: number;
  blockedAttempts: number;
  blockedBy: number | null;
  passing: boolean;
  phase: number;
};
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const pathDistance = (from: Point, path: Point[]) => path.reduce(
  (length, point, index) => length + distance(path[index - 1] ?? from, point),
  0,
);
const inside = (p: Point, r: Surface, margin = 0) =>
  p.x > r.x - margin &&
  p.x < r.x + r.width + margin &&
  p.y > r.y - margin &&
  p.y < r.y + r.height + margin;
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const ease = (progress: number) => {
  const t = clamp(progress, 0, 1);
  return t * t * (3 - 2 * t);
};
const visibleLimit = 4;
const minimumExposure = 10_000;

// A small navigation grid is shared by every entity and rebuilt only when the
// environment changes. Text, links and surfaces are obstacles, not walking space.
export const createNavigation = (environment: Environment) => {
  const { width, height, surfaces } = environment;
  const step = Math.max(28, Math.sqrt((width * height) / 2400));
  const cols = Math.max(1, Math.floor(width / step));
  const rows = Math.max(1, Math.floor(height / step));
  const point = (id: number) => ({
    x: (((id % cols) + 0.5) * width) / cols,
    y: ((Math.floor(id / cols) + 0.5) * height) / rows,
  });
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
      if (d < cost) {
        cost = d;
        best = id;
      }
    }
    return best;
  };
  const route = (from: Point, to: Point): Point[] => {
    const start = nearest(from),
      end = nearest(to);
    if (start < 0 || end < 0) return [];
    const parent = new Int32Array(blocked.length).fill(-1);
    const queue = [start];
    parent[start] = start;
    for (let head = 0; head < queue.length && parent[end] < 0; head++) {
      const id = queue[head],
        x = id % cols,
        y = Math.floor(id / cols);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx,
          ny = y + dy,
          next = ny * cols + nx;
        if (
          nx < 0 ||
          nx >= cols ||
          ny < 0 ||
          ny >= rows ||
          blocked[next] ||
          parent[next] >= 0
        )
          continue;
        // Also reject thin obstacles falling between neighbouring grid centres.
        const a = point(id),
          b = point(next);
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
    for (let index = 0; index < result.length; ) {
      smooth.push(result[index]);
      let next = result.length - 1;
      while (
        next > index + 1 &&
        surfaces.some((surface) =>
          segmentHits(result[index], result[next], surface),
        )
      )
        next--;
      index = Math.max(index + 1, next);
    }
    if (smooth[smooth.length - 1] !== result[result.length - 1])
      smooth.push(result[result.length - 1]);
    return smooth;
  };
  return {
    free: free.map(point),
    route,
    nearest: (p: Point) => {
      const id = nearest(p);
      return id < 0 ? null : point(id);
    },
  };
};

const segmentHits = (a: Point, b: Point, rect: Surface) => {
  // Slab intersection against a padded rectangle, including thin rules/text.
  let low = 0,
    high = 1;
  for (const [start, delta, min, max] of [
    [a.x, b.x - a.x, rect.x - 9, rect.x + rect.width + 9],
    [a.y, b.y - a.y, rect.y - 9, rect.y + rect.height + 9],
  ]) {
    if (Math.abs(delta) < 0.001) {
      if (start < min || start > max) return false;
    } else {
      const t1 = (min - start) / delta,
        t2 = (max - start) / delta;
      low = Math.max(low, Math.min(t1, t2));
      high = Math.min(high, Math.max(t1, t2));
      if (low > high) return false;
    }
  }
  return true;
};

export const createSociety = (
  initial: Environment,
  random: () => number = Math.random,
) => {
  let environment = initial;
  let navigation = createNavigation(environment);
  let now = 0;
  let retreatAt: number | null = null;
  let nextSpeech = 0;
  let speech: { id: number; text: string; until: number; shown: boolean } | null = null;
  let nextQuiet = 45_000 + random() * 45_000;
  let quietUntil = 0;
  let quietSince = 0;
  let quietExplorer: number | null = null;
  let passage: { id: number; until: number; since: number } | null = null;
  const entities: Entity[] = [];
  const occupiesCorridor = (entity: Entity) => entity.state !== "hidden" && !entity.peeking;
  const hasCorridorSpace = () => entities.filter(occupiesCorridor).length < visibleLimit;
  const pick = <T>(values: T[]) =>
    values[Math.min(values.length - 1, Math.floor(random() * values.length))];
  const shelters = () =>
    environment.surfaces.filter((surface) => surface.shelter);
  const homeOf = (entity: Entity) =>
    shelters().find((surface) => surface.id === entity.home);
  const setState = (entity: Entity, state: State, duration = 0) => {
    entity.state = state;
    entity.since = now;
    entity.until = now + duration;
    if (state === "hidden") entity.opacity = 0;
  };
  const glide = (entity: Entity) => {
    const remaining = pathDistance(entity, entity.path);
    const departure = ease((now - entity.since) / 450);
    const arrival = ease(remaining / 16);
    return 0.4 + 0.98 * Math.min(departure, arrival);
  };
  const crossShelterEdge = (entity: Entity, target: Point, dt: number) => {
    const duration = entity.until - entity.since;
    const elapsed = now - entity.since;
    const previous = ease((elapsed - dt) / duration);
    const current = ease(elapsed / duration);
    const amount = previous < 1 ? (current - previous) / (1 - previous) : 1;
    entity.x += (target.x - entity.x) * amount;
    entity.y += (target.y - entity.y) * amount;
  };
  const release = (entity: Entity) => {
    const other = entities.find((candidate) => candidate.id === entity.partner);
    if (other?.partner === entity.id) {
      other.partner = null;
      other.meetingUntil = 0;
      other.togetherUntil = 0;
    }
    entity.partner = null;
    entity.meetingUntil = 0;
    entity.togetherUntil = 0;
  };
  const followPath = (entity: Entity, route: Point[], home: string | null = null) => {
    release(entity);
    entity.path = route;
    entity.home = home;
    entity.waitingFor = null;
    entity.interest = null;
    entity.blockedAttempts = 0;
    entity.blockedBy = null;
    setState(entity, "walk");
  };
  const walk = (entity: Entity, target: Point, home: string | null = null) => {
    const route = navigation.route(entity, target);
    if (!route.length) return false;
    followPath(entity, route, home);
    return true;
  };
  const shortRoute = (entity: Entity, target: Point, maximum: number) => {
    const clear = (point: Point) =>
      !environment.surfaces.some((surface) => segmentHits(entity, point, surface));
    const route = clear(target) ? [target] : navigation.route(entity, target);
    return route.length && clear(route[0]) && pathDistance(entity, route) <= maximum
      ? route
      : null;
  };
  const firstWalk = (entity: Entity) => {
    const outside = entities.filter((other) => other !== entity && other.state !== "hidden");
    const neighbour = outside
      .filter((other) => other.home === null && distance(entity, other) <= 135)
      .sort((a, b) => distance(entity, a) - distance(entity, b))[0];
    const destinations = navigation.free
      .filter((point) => {
        const length = distance(entity, point);
        return length >= 24 && length <= 80 &&
          outside.every((other) => distance(point, other) >= 26);
      })
      .map((point) => {
        const remaining = neighbour ? distance(point, neighbour) : random() * 8;
        return {
          point,
          towardNeighbour: neighbour ? remaining < distance(entity, neighbour) : false,
          score: Math.abs(distance(entity, point) - 50) + remaining,
        };
      })
      .sort((a, b) => Number(b.towardNeighbour) - Number(a.towardNeighbour) || a.score - b.score);
    for (const { point } of destinations) {
      const route = shortRoute(entity, point, 95);
      if (route) {
        followPath(entity, route);
        return true;
      }
    }
    return false;
  };
  const finishDeparture = (entity: Entity) => {
    entity.home = null;
    entity.path = [];
    entity.exposedAt = now;
    entity.peeking = false;
    entity.needsFirstWalk = true;
    entity.interestsLeft = 1 + Math.floor(entity.curiosity * 3);
    setState(entity, "rest", 320);
    entity.nextDecision = entity.until;
  };
  const edges = (surface: Surface, entity: Point) => {
    const candidates = [
      {
        x: surface.x - 22,
        y: surface.y + surface.height * (0.25 + random() * 0.5),
      },
      {
        x: surface.x + surface.width + 22,
        y: surface.y + surface.height * (0.25 + random() * 0.5),
      },
      {
        x: surface.x + surface.width * (0.25 + random() * 0.5),
        y: surface.y - 22,
      },
      {
        x: surface.x + surface.width * (0.25 + random() * 0.5),
        y: surface.y + surface.height + 22,
      },
    ].filter(
      (p) =>
        p.x > 12 &&
        p.x < environment.width - 12 &&
        p.y > 12 &&
        p.y < environment.height - 12 &&
        !environment.surfaces.some((other) => inside(p, other, 6)),
    );
    return candidates.sort(
      (a, b) => distance(a, entity) - distance(b, entity),
    );
  };
  const edge = (surface: Surface, entity: Point) => edges(surface, entity)[0];
  const startExit = (entity: Entity, peeking: boolean, toward: Point = entity) => {
    if (entity.state !== "hidden" || (!peeking && !hasCorridorSpace())) return false;
    const home = homeOf(entity);
    if (!home) return false;
    const exit = edges(home, toward)
      .map((point) => peeking ? {
        x: clamp(point.x, home.x, home.x + home.width),
        y: clamp(point.y, home.y, home.y + home.height),
      } : navigation.nearest(point))
      .find((point) => point && !environment.surfaces.some(
        (surface) => surface.folderTab && segmentHits(entity, point, surface),
      ));
    if (!exit) return false;
    entity.peeking = peeking;
    entity.path = [exit];
    setState(entity, "leave", 650);
    return true;
  };
  const events = createSocietyEvents({
    entities,
    freePoints: () => navigation.free,
    homeOf,
    hasCorridorSpace,
    startExit,
    pauseWalk(entity, duration) {
      entity.waitingFor = null;
      entity.blockedAttempts = 0;
      entity.blockedBy = null;
      setState(entity, "yield", duration);
    },
    route: shortRoute,
    followPath,
  }, random);
  const hasRoom = (surface: Surface) =>
    entities.filter((other) => other.home === surface.id).length < 2;
  const settleIn = (entity: Entity, home: Surface) => {
    entity.home = home.id;
    entity.x = home.x + home.width / 2;
    entity.y = home.y + home.height / 2;
  };
  const seekShelter = (entity: Entity) => {
    const preferredBusy = shelters().find(
      (surface) =>
        surface.id === entity.preferredHome &&
        distance(surface, entity) < 140 &&
        entities.filter((other) => other.home === surface.id).length >= 2,
    );
    if (preferredBusy && now - entity.lastOccupiedVisit > 6500) {
      release(entity);
      entity.home = null;
      entity.interest = preferredBusy.id;
      entity.lastOccupiedVisit = now;
      setState(entity, "observe", 1000 + random() * 1400);
      return true;
    }
    const shelterCost = (surface: Surface) =>
      distance(surface, entity) -
      (surface.id === entity.preferredHome ? 180 * entity.fidelity : 0) +
      (surface.id === entity.lastHome ? 35 * (1 - entity.fidelity) : 0);
    const options = shelters()
      .filter(hasRoom)
      .sort((a, b) => shelterCost(a) - shelterCost(b));
    for (const surface of options.slice(0, 5)) {
      const target = edge(surface, entity);
      if (target && walk(entity, target, surface.id)) return true;
    }
    const occupied = shelters().find(
      (surface) =>
        distance(surface, entity) < 120 &&
        entities.filter((other) => other.home === surface.id).length >= 2,
    );
    if (occupied && now - entity.lastOccupiedVisit > 6500) {
      release(entity);
      entity.home = null;
      entity.interest = occupied.id;
      entity.lastOccupiedVisit = now;
      setState(entity, "observe", 1000 + random() * 1400);
      return true;
    }
    return false;
  };
  const count = environment.width < 620 ? 5 : 10;
  const firstColor = Math.floor(random() * 4);
  for (let id = 0; id < count && navigation.free.length; id++) {
    const region = {
      x: environment.width * (0.1 + random() * 0.8),
      y: environment.height * (0.12 + random() * 0.76),
    };
    const point = navigation.nearest(region)!;
    const homeOptions = shelters().filter(
      (surface) => !entities.some((entity) => entity.home === surface.id),
    );
    const home = homeOptions.length ? pick(homeOptions) : null;
    if (
      !home && (entities.length >= visibleLimit || entities.some(
        (entity) => entity.state !== "hidden" && distance(entity, point) < 26,
      ))
    ) continue;
    const entity: Entity = {
      ...point,
      id,
      state: "rest",
      since: 0,
      until: 500 + random() * 2200,
      path: [],
      home: null,
      lastHome: null,
      partner: null,
      curiosity: random(),
      sociability: random(),
      timidity: random(),
      speed: 22 + random() * 24,
      exposedAt: 0,
      needsFirstWalk: false,
      interestsLeft: 1,
      nextDecision: 0,
      size: 16 + random() * 3,
      opacity: 0,
      peeking: false,
      color: (firstColor + id) % 4,
      fidelity: random(),
      preferredHome: home?.id ?? null,
      interest: null,
      affinities: new Map(),
      lastEncounter: -Infinity,
      lastStroll: -Infinity,
      meetingUntil: 0,
      togetherUntil: 0,
      waitingFor: null,
      lastOccupiedVisit: -Infinity,
      blockedAttempts: 0,
      blockedBy: null,
      passing: false,
      phase: 0,
    };
    if (home) {
      settleIn(entity, home);
      setState(entity, "hidden", 150 + id * 480 + random() * 300);
    }
    entities.push(entity);
  }

  const bond = (a: Entity, b: Entity) => {
    if (now - a.lastEncounter < 8000 || now - b.lastEncounter < 8000) return;
    for (const [entity, other] of [
      [a, b],
      [b, a],
    ]) {
      const memory = entity.affinities.get(other.id);
      const faded = memory
        ? Math.max(0, memory.strength - (now - memory.lastMet) / 180_000)
        : 0;
      entity.affinities.set(other.id, {
        strength: Math.min(1, faded + 0.28),
        lastMet: now,
      });
      if (entity.affinities.size > 3) {
        const weakest = [...entity.affinities.entries()]
          .filter(([id]) => id !== other.id)
          .sort((a, b) => a[1].strength - b[1].strength)[0];
        if (weakest) entity.affinities.delete(weakest[0]);
      }
      entity.lastEncounter = now;
    }
  };
  const affinity = (entity: Entity, other: Entity) => {
    const memory = entity.affinities.get(other.id);
    return memory
      ? Math.max(0, memory.strength - (now - memory.lastMet) / 180_000)
      : 0;
  };
  const stroll = (a: Entity, b: Entity) => {
    const choices = navigation.free.filter(
      (point) => distance(a, point) > 65 && distance(a, point) < 145,
    );
    const spacing = 36 / Math.max(1, distance(a, b));
    for (let attempt = 0; attempt < 6 && choices.length; attempt++) {
      const target = pick(choices);
      choices.splice(choices.indexOf(target), 1);
      const companionTarget = navigation.nearest({
        x: target.x + (b.x - a.x) * spacing,
        y: target.y + (b.y - a.y) * spacing,
      });
      if (!companionTarget || distance(target, companionTarget) < 24) continue;
      const routeA = shortRoute(a, target, 180);
      const routeB = shortRoute(b, companionTarget, 180);
      if (!routeA || !routeB) continue;
      followPath(a, routeA);
      followPath(b, routeB);
      a.partner = b.id;
      b.partner = a.id;
      a.togetherUntil = b.togetherUntil = now + 8000;
      a.lastStroll = b.lastStroll = now;
      return true;
    }
    return false;
  };

  const confirmEncounter = (a: Entity, b: Entity) => {
    if (retreatAt !== null || b.partner !== a.id || distance(a, b) > 75) return false;
    bond(a, b);
    if (!speech && now >= nextSpeech && now >= quietUntil && random() < 0.34) {
      const phrases = a.interest
        ? ["mru?", "nüm…?", "oru?"]
        : affinity(a, b) > 0.35
          ? ["mm. oru.", "oru… oru.", "mru-mru."]
          : ["mru…", "nüm?", "mm."];
      speech = { id: a.id, text: pick(phrases), until: now + 3000, shown: false };
    }
    if (
      now - Math.max(a.lastStroll, b.lastStroll) > 16_000 &&
      random() < 0.48 + (a.sociability + b.sociability) * 0.2 &&
      stroll(a, b)
    ) return true;

    release(a);
    setState(a, "observe", 1100);
    setState(b, "observe", 1100);
    return true;
  };
  const reserveMeeting = (entity: Entity, neighbour: Entity) => {
    const destinations = navigation.free
      .filter((point) => distance(point, neighbour) >= 30 && distance(point, neighbour) <= 62)
      .sort((a, b) => distance(entity, a) - distance(entity, b));
    for (const destination of destinations) {
      const route = shortRoute(entity, destination, 180);
      if (!route) continue;
      followPath(entity, route);
      const duration = clamp(pathDistance(entity, route) * 1000 / entity.speed + 2000, 3000, 9000);
      entity.meetingUntil = neighbour.meetingUntil = now + duration;
      entity.partner = neighbour.id;
      neighbour.partner = entity.id;
      setState(neighbour, "observe", duration);
      return true;
    }
    return false;
  };

  const decide = (entity: Entity) => {
    entity.nextDecision = now + 300 + random() * 600;
    if (now < entity.until) return;
    const exposedFor = now - entity.exposedAt;
    if (entity.needsFirstWalk) {
      if (firstWalk(entity) || exposedFor < minimumExposure) return;
      entity.needsFirstWalk = false;
    }
    const expected = entities.find((other) => other.id === entity.partner);
    if (expected?.partner === entity.id) {
      if (entity.togetherUntil > now) {
        if (expected.path.length) return;
        release(entity);
        return;
      }
      if (entity.meetingUntil > now) return;
      if (confirmEncounter(entity, expected)) return;
      release(entity);
    }
    if (now < quietUntil && entity.id !== quietExplorer) {
      setState(entity, "rest", quietUntil - now + random() * 500);
      return;
    }
    const interestExpired = exposedFor >= 20_000 + entity.curiosity * 5000;
    if (
      exposedFor >= minimumExposure &&
      (interestExpired || entity.interestsLeft === 0)
    ) {
      if (!seekShelter(entity)) setState(entity, "rest", 1000);
      return;
    }
    const neighbours = entities
      .filter(
        (other) =>
          other !== entity &&
          ["rest", "observe"].includes(other.state) &&
          !other.needsFirstWalk &&
          other.partner === null &&
          now - Math.max(entity.lastEncounter, other.lastEncounter) >= 8000 &&
          now - other.exposedAt < 20_000 + other.curiosity * 5000 &&
          distance(entity, other) > 30 &&
          distance(entity, other) < 170 + affinity(entity, other) * 60,
      )
      .sort(
        (a, b) =>
          distance(a, entity) -
          affinity(entity, a) * 100 -
          distance(b, entity) +
          affinity(entity, b) * 100,
      );
    for (const neighbour of neighbours) {
      if (
        random() < 0.42 + entity.sociability * 0.44 + affinity(entity, neighbour) * 0.12 &&
        random() > neighbour.timidity * 0.55 &&
        reserveMeeting(entity, neighbour)
      ) {
        entity.interestsLeft = Math.max(0, entity.interestsLeft - 1);
        neighbour.interestsLeft = Math.max(0, neighbour.interestsLeft - 1);
        return;
      }
    }
    if (random() < entity.curiosity * 0.3 && shelters().length) {
      const surface = pick(shelters());
      const target = edge(surface, entity);
      if (target && walk(entity, target)) {
        entity.interest = surface.id;
        entity.interestsLeft = Math.max(0, entity.interestsLeft - 1);
        return;
      }
    }
    const choices = navigation.free.filter((point) => {
      const length = distance(point, entity);
      return length > 45 && length < 120;
    });
    for (let attempt = 0; attempt < 4 && choices.length; attempt++) {
      const point = pick(choices);
      choices.splice(choices.indexOf(point), 1);
      const route = shortRoute(entity, point, 150);
      if (!route) continue;
      followPath(entity, route);
      entity.interestsLeft = Math.max(0, entity.interestsLeft - 1);
      return;
    }
    entity.interestsLeft = 0;
    setState(entity, "rest", 650 + random() * 650);
  };

  return {
    entities,
    get speech() {
      return speech;
    },
    markSpeechShown(line: typeof speech) {
      if (!line || speech !== line || line.shown) return;
      line.shown = true;
      line.until = now + 3000;
      nextSpeech = now + 34_000 + random() * 20_000;
    },
    get retiring() {
      return retreatAt !== null;
    },
    get quiet() {
      return now < quietUntil;
    },
    get finished() {
      return retreatAt !== null && now - retreatAt >= 900;
    },
    get opacity() {
      return retreatAt === null
        ? 1
        : clamp(1 - (now - retreatAt - 250) / 650, 0, 1);
    },
    retreat() {
      if (retreatAt !== null) return;
      retreatAt = now;
      events.reset(now);
      speech = null;
      for (const entity of entities) {
        if (entity.state === "hidden" || entity.state === "enter") continue;
        if (entity.peeking && homeOf(entity)) setState(entity, "enter", 500);
        else seekShelter(entity);
      }
    },
    remap(next: Environment) {
      passage = null;
      events.reset(now);
      environment = next;
      navigation = createNavigation(next);
      for (const entity of entities) {
        entity.passing = false;
        entity.phase = 0;
        entity.blockedAttempts = 0;
        entity.blockedBy = null;
        const home = homeOf(entity);
        if (
          entity.preferredHome &&
          !shelters().some((surface) => surface.id === entity.preferredHome)
        )
          entity.preferredHome = null;
        if (entity.state === "hidden" || entity.peeking) {
          if (entity.peeking) {
            entity.peeking = false;
            entity.path = [];
            setState(entity, "hidden", 700);
          }
          const shelter = home ?? shelters().find(hasRoom);
          if (shelter) settleIn(entity, shelter);
          else entity.home = null;
          continue;
        }
        const point = navigation.nearest(entity);
        if (point) {
          entity.x = point.x;
          entity.y = point.y;
        }
        entity.path = [];
        entity.home = null;
        entity.partner = null;
        entity.meetingUntil = 0;
        entity.togetherUntil = 0;
        entity.waitingFor = null;
        setState(entity, "rest", 400 + random() * 900);
      }
    },
    step(delta: number) {
      const dt = clamp(delta, 0, 64);
      now += dt;
      if (passage) {
        const active = entities.find((entity) => entity.id === passage!.id);
        const clear =
          active &&
          !entities.some(
            (other) =>
              other !== active &&
              other.state !== "hidden" &&
              distance(active, other) < 32,
          );
        if (
          !active ||
          active.state !== "walk" ||
          now >= passage.until ||
          (now - passage.since > 150 && clear)
        ) {
          if (active) {
            active.passing = false;
            active.blockedAttempts = 0;
            active.blockedBy = null;
          }
          passage = null;
        }
      }
      if (!passage) {
        // One shared permit, with stable ID priority. Wait and attempt a detour
        // three times before treating another entity as temporarily intangible.
        const candidate = entities
          .filter(
            (entity) =>
              entity.state === "yield" &&
              entity.blockedAttempts >= 3 &&
              now >= entity.until &&
              entity.path.length > 0 &&
              entities.some(
                (other) =>
                  other !== entity &&
                  other.state !== "hidden" &&
                  distance(entity, other) < 32,
              ),
          )
          .sort((a, b) => a.id - b.id)[0];
        if (candidate) {
          passage = { id: candidate.id, since: now, until: now + 4000 };
          candidate.passing = true;
          candidate.waitingFor = null;
          setState(candidate, "walk");
        }
      }
      if (retreatAt === null && now >= nextQuiet) {
        quietSince = now;
        quietUntil = now + 4000 + random() * 3000;
        nextQuiet = quietUntil + 40_000 + random() * 40_000;
        quietExplorer =
          entities
            .filter(occupiesCorridor)
            .sort((a, b) => b.curiosity - a.curiosity)[0]?.id ?? null;
        speech = null;
      }
      if (retreatAt === null && now >= quietUntil) events.step(now);
      for (const entity of entities) {
        entity.opacity = clamp((now - entity.id * 100) / 900, 0, 1);
        entity.phase +=
          ((entity.passing ? 1 : 0) - entity.phase) * Math.min(1, dt / 140);
        if (
          now < quietUntil &&
          entity.id !== quietExplorer &&
          now - quietSince > entity.id * 90 &&
          entity.state === "walk" &&
          entity.home === null &&
          entity.partner === null &&
          !entity.needsFirstWalk
        ) {
          release(entity);
          entity.path = [];
          setState(entity, "rest", quietUntil - now);
        }
        if ((entity.meetingUntil > 0 && now >= entity.meetingUntil) ||
            (entity.togetherUntil > 0 && now >= entity.togetherUntil))
          release(entity);
        if (entity.state === "walk") {
          const target = entity.path[0];
          if (target) {
            const companion =
              entity.togetherUntil > now
                ? entities.find((other) => other.id === entity.partner)
                : null;
            const speed = companion
              ? Math.min(entity.speed, companion.speed)
              : entity.speed;
            const pace = retreatAt !== null ? 4 : entity.passing ? 1 : glide(entity);
            const d = distance(entity, target),
              amount = (speed * dt * pace) / 1000;
            const next =
              d <= amount
                ? target
                : {
                    x: entity.x + ((target.x - entity.x) / d) * amount,
                    y: entity.y + ((target.y - entity.y) / d) * amount,
                  };
            const crowded = entity.passing
              ? undefined
              : entities.find(
                  (other) =>
                    other !== entity &&
                    other.state !== "hidden" &&
                    distance(next, other) < 22,
                );
            if (!crowded) {
              entity.x = next.x;
              entity.y = next.y;
              if (d <= amount) entity.path.shift();
              const blocker = entities.find(
                (other) => other.id === entity.blockedBy,
              );
              if (
                !blocker ||
                blocker.state === "hidden" ||
                distance(entity, blocker) > 32
              ) {
                entity.blockedAttempts = 0;
                entity.blockedBy = null;
              }
            } else {
              entity.blockedAttempts++;
              entity.blockedBy = crowded.id;
              entity.waitingFor = crowded.id;
              setState(entity, "yield", 650 + random() * 650);
            }
          } else if (homeOf(entity)) {
            setState(entity, "enter", 550);
          } else {
            const finishedFirstWalk = entity.needsFirstWalk;
            entity.needsFirstWalk = false;
            if (finishedFirstWalk && retreatAt === null) {
              setState(entity, "observe", 500 + random() * 450);
              continue;
            }
            const companion = entities.find(
              (other) => other.id === entity.partner,
            );
            if (entity.togetherUntil > now) {
              setState(entity, "observe", 500);
              continue;
            }
            if (companion && confirmEncounter(entity, companion)) continue;
            if (companion) release(entity);
            setState(
              entity,
              entity.partner === null && entity.interest === null
                ? "rest"
                : "observe",
              1400 + random() * 2500,
            );
          }
        } else if (entity.state === "yield") {
          if (now < entity.until) continue;
          const other = entities.find(
            (candidate) => candidate.id === entity.waitingFor,
          );
          if (other && distance(entity, other) < 30 && entity.id > other.id) {
            const candidates = navigation.free.filter(
              (point) =>
                distance(point, entity) > 30 &&
                distance(point, entity) < 75 &&
                distance(point, other) >
                  Math.max(35, distance(entity, other) + 8) &&
                !environment.surfaces.some((surface) =>
                  segmentHits(entity, point, surface),
                ),
            );
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
          if (!home) {
            setState(entity, "rest", 500);
            continue;
          }
          // Enter the nearest edge; drawing clips the silhouette behind it.
          const target = {
            x: clamp(entity.x, home.x + 13, home.x + home.width - 13),
            y: clamp(entity.y, home.y + 13, home.y + home.height - 13),
          };
          crossShelterEdge(entity, target, dt);
          if (now >= entity.until) {
            entity.lastHome = home.id;
            if (
              entity.preferredHome === null ||
              random() < (1 - entity.fidelity) * 0.12
            )
              entity.preferredHome = home.id;
            const wasPeeking = entity.peeking;
            entity.peeking = false;
            setState(entity, "hidden", 3500 + random() * 9000);
            if (!wasPeeking && retreatAt === null && now >= quietUntil) {
              events.onSheltered(now, entity, home);
            }
          }
        } else if (entity.state === "hidden") {
          entity.opacity = 0;
          if (now >= entity.until && retreatAt === null && now >= quietUntil && !events.holdsExit(entity, now)) {
            const canLeave = hasCorridorSpace();
            if (!canLeave && now < entity.nextDecision) continue;
            const peeking = random() < entity.timidity * (canLeave ? 0.5 : 1);
            if (!canLeave && !peeking) {
              entity.nextDecision = now + 2000;
              continue;
            }
            if (!startExit(entity, peeking)) setState(entity, "hidden", 2000);
          }
        } else if (entity.state === "leave" || entity.state === "peek") {
          const target = entity.path[0];
          if (!target) {
            finishDeparture(entity);
            continue;
          }
          crossShelterEdge(entity, target, dt);
          if (now >= entity.until) {
            if (entity.state === "leave" && entity.peeking)
              setState(entity, "peek", 1000 + random() * 1500);
            else if (entity.state === "peek" && homeOf(entity)) {
              entity.peeking = true;
              entity.path = [];
              setState(entity, "enter", 500);
            } else {
              finishDeparture(entity);
            }
          }
        } else if (retreatAt === null && now >= entity.nextDecision)
          decide(entity);
      }
      if (speech && (now >= speech.until || entities.some(
        (entity) => entity.id === speech?.id && entity.state === "hidden",
      ))) speech = null;
    },
  };
};
