import type { Entity, Point, Surface } from "./engine.ts";

type EventControls = {
  entities: readonly Entity[];
  freePoints: () => readonly Point[];
  homeOf: (entity: Entity) => Surface | undefined;
  hasCorridorSpace: () => boolean;
  startExit: (entity: Entity, peeking: boolean, toward?: Point) => boolean;
  pauseWalk: (entity: Entity, duration: number) => void;
  route: (entity: Entity, target: Point, maximum: number) => Point[] | null;
  followPath: (entity: Entity, route: Point[]) => void;
};

type Handoff = {
  resident: Entity;
  shelter: Surface;
  toward: Point;
  readyAt: number;
  expiresAt: number;
};

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const distanceFromShelter = (point: Point, shelter: Surface) => Math.hypot(
  Math.max(shelter.x - point.x, point.x - shelter.x - shelter.width, 0),
  Math.max(shelter.y - point.y, point.y - shelter.y - shelter.height, 0),
);

export const createSocietyEvents = (controls: EventControls, random = Math.random) => {
  let nextEventAt = 3500;
  let nextCheckAt = 0;
  let handoff: Handoff | null = null;

  const finishEvent = (now: number) => {
    nextEventAt = now + 9000 + random() * 6000;
  };

  const passingPeek = (now: number) => {
    for (const resident of controls.entities) {
      if (resident.state !== "hidden" || now - resident.since < 900) continue;
      const shelter = controls.homeOf(resident);
      if (!shelter) continue;
      const passer = controls.entities.find((entity) => {
        if (entity.state !== "walk" || !entity.path.length || entity.home || entity.partner !== null || entity.passing) return false;
        const gap = distanceFromShelter(entity, shelter);
        return gap >= 20 && gap <= 56;
      });
      if (!passer || random() >= 0.55 || !controls.startExit(resident, true, passer)) continue;
      controls.pauseWalk(passer, 420);
      return true;
    }
    return false;
  };

  const forkWalk = (now: number) => {
    for (const walker of controls.entities) {
      if (walker.state !== "walk" || walker.togetherUntil <= now || now - walker.lastStroll < 1100) continue;
      const companion = controls.entities.find((entity) => entity.id === walker.partner);
      const destination = walker.path.at(-1);
      if (companion?.state !== "walk" || companion.partner !== walker.id || !destination) continue;
      const heading = distance(walker, destination);
      if (heading < 20) continue;

      const branches = controls.freePoints().filter((point) => {
        const length = distance(walker, point);
        if (length < 42 || length > 85 || distance(point, companion) < 36) return false;
        const alignment = ((point.x - walker.x) * (destination.x - walker.x) +
          (point.y - walker.y) * (destination.y - walker.y)) / (length * heading);
        return alignment > -0.3 && alignment < 0.55;
      });
      if (!branches.length || random() >= 0.45) continue;
      for (const point of branches) {
        const route = controls.route(walker, point, 85);
        if (route?.length !== 1) continue;
        controls.followPath(walker, route);
        return true;
      }
    }
    return false;
  };

  return {
    onSheltered(now: number, entrant: Entity, shelter: Surface) {
      if (handoff || now < nextEventAt) return;
      const resident = controls.entities.find((entity) =>
        entity !== entrant && entity.state === "hidden" && entity.home === shelter.id && now - entity.since >= 900,
      );
      if (!resident || random() >= 0.65) return;
      handoff = {
        resident,
        shelter,
        toward: { x: 2 * shelter.x + shelter.width - entrant.x, y: 2 * shelter.y + shelter.height - entrant.y },
        readyAt: now + 650,
        expiresAt: now + 2300,
      };
    },
    holdsExit(entity: Entity, now: number) {
      return handoff?.resident === entity && now < handoff.expiresAt;
    },
    step(now: number) {
      if (handoff) {
        const { resident, shelter, toward, readyAt, expiresAt } = handoff;
        if (now >= expiresAt || resident.state !== "hidden" || resident.home !== shelter.id) {
          handoff = null;
        } else if (now >= readyAt && controls.hasCorridorSpace() && controls.startExit(resident, false, toward)) {
          handoff = null;
          finishEvent(now);
        }
        return;
      }
      if (now < nextEventAt || now < nextCheckAt) return;
      nextCheckAt = now + 650;
      if (forkWalk(now) || passingPeek(now)) finishEvent(now);
    },
    reset(now: number) {
      handoff = null;
      nextCheckAt = now + 650;
    },
  };
};
