export type ArchiveRect = {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
};
export type ArchiveBounds = { width: number; height: number; inset?: number };
const gap = 10;

const intersects = (a: ArchiveRect, b: ArchiveRect, spacing = gap) =>
  a.x < b.x + b.width + spacing &&
  a.x + a.width + spacing > b.x &&
  a.y < b.y + b.height + spacing &&
  a.y + a.height + spacing > b.y;

const covered = (a: ArchiveRect, b: ArchiveRect) => {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return (
    width > 6 &&
    height > 6 &&
    width * height >= Math.min(a.width * a.height, b.width * b.height) * 0.08
  );
};

// Geometry uses target positions, independent of CSS transitions. Neighbours stay
// where they were pushed instead of chasing their original positions on each move.
export const resolveArchiveCollisions = (
  rects: ArchiveRect[],
  draggedId: number,
  bounds: ArchiveBounds,
  settle = false,
): ArchiveRect[] | null => {
  let remaining = 400;
  const inset = bounds.inset ?? 2;
  const fits = (rect: ArchiveRect) =>
    rect.x >= inset &&
    rect.y >= inset &&
    rect.x + rect.width <= bounds.width - inset &&
    rect.y + rect.height <= bounds.height - inset;

  const moveAside = (
    id: number,
    obstacleId: number,
    layout: ArchiveRect[],
    locked: Set<number>,
  ): ArchiveRect[] | null => {
    if (--remaining < 0) return null;
    const item = layout.find((rect) => rect.id === id)!;
    const obstacle = layout.find((rect) => rect.id === obstacleId)!;
    const candidates = [
      { ...item, x: obstacle.x - item.width - gap },
      { ...item, x: obstacle.x + obstacle.width + gap },
      { ...item, y: obstacle.y - item.height - gap },
      { ...item, y: obstacle.y + obstacle.height + gap },
    ].sort(
      (a, b) =>
        Math.hypot(a.x - item.x, a.y - item.y) -
        Math.hypot(b.x - item.x, b.y - item.y),
    );

    const tryPosition = (candidate: ArchiveRect): ArchiveRect[] | null => {
      if (
        !fits(candidate) ||
        layout.some(
          (rect) => locked.has(rect.id) && intersects(candidate, rect),
        )
      )
        return null;
      let next = layout.map((rect) => (rect.id === id ? candidate : rect));
      const nextLocked = new Set([...locked, id]);
      for (const other of layout) {
        if (other.id === id || nextLocked.has(other.id)) continue;
        const current = next.find((rect) => rect.id === other.id)!;
        if (!intersects(candidate, current)) continue;
        const pushed = moveAside(other.id, id, next, nextLocked);
        if (!pushed) return null;
        next = pushed;
      }
      return next;
    };

    for (const candidate of candidates) {
      const next = tryPosition(candidate);
      if (next) return next;
    }

    // At an edge or in a crowded row, look for the nearest free pocket. Including
    // obstacle edges finds small gaps without relying on a fixed grid of slots.
    const xs = new Set([item.x, inset, bounds.width - item.width - inset]);
    const ys = new Set([item.y, inset, bounds.height - item.height - inset]);
    for (const rect of layout) {
      if (rect.id === id) continue;
      xs.add(rect.x - item.width - gap);
      xs.add(rect.x + rect.width + gap);
      ys.add(rect.y - item.height - gap);
      ys.add(rect.y + rect.height + gap);
    }
    const pockets: ArchiveRect[] = [];
    for (const x of xs)
      for (const y of ys) {
        const candidate = { ...item, x, y };
        if (
          fits(candidate) &&
          !layout.some((rect) => rect.id !== id && intersects(candidate, rect))
        )
          pockets.push(candidate);
      }
    pockets.sort(
      (a, b) =>
        Math.hypot(a.x - item.x, a.y - item.y) -
        Math.hypot(b.x - item.x, b.y - item.y),
    );
    if (pockets[0])
      return layout.map((rect) => (rect.id === id ? pockets[0] : rect));
    return null;
  };

  let layout = rects.map((rect) => ({ ...rect }));
  const dragged = layout.find((rect) => rect.id === draggedId);
  if (!dragged || !fits(dragged)) return null;
  for (const rect of rects) {
    if (rect.id === draggedId) continue;
    const current = layout.find((item) => item.id === rect.id)!;
    if (settle ? !intersects(dragged, current, 0) : !covered(dragged, current))
      continue;
    const next = moveAside(rect.id, draggedId, layout, new Set([draggedId]));
    if (!next) return null;
    layout = next;
  }
  return layout;
};

type Position = { x: number; y: number };
export type ArchiveOrigin = ArchiveRect & { key: string };

// Stored offsets belong to stable catalog IDs. Removed entries are ignored and
// new entries start at their grid origin. Invalid or crowded layouts fall back
// to the authored grid rather than leaving documents on top of each other.
export const restoreArchivePositions = (
  origins: ArchiveOrigin[],
  stored: Record<string, unknown>,
  bounds: ArchiveBounds,
): Record<string, Position> => {
  if (!origins.length || bounds.width <= 0 || bounds.height <= 0) return {};
  let moved = false;
  let layout: ArchiveRect[] = origins.map((origin) => {
    const value = stored[origin.key];
    if (!value || typeof value !== "object") return origin;
    const position = value as Partial<Position>;
    if (typeof position.x !== "number" || typeof position.y !== "number" ||
      !Number.isFinite(position.x) || !Number.isFinite(position.y) ||
      Math.abs(position.x) > 100000 || Math.abs(position.y) > 100000) return origin;
    if (position.x === 0 && position.y === 0) return origin;
    moved = true;
    return {
      ...origin,
      x: Math.max(0, Math.min(bounds.width - origin.width, origin.x + position.x)),
      y: Math.max(0, Math.min(bounds.height - origin.height, origin.y + position.y)),
    };
  });
  if (!moved) return {};
  for (const rect of origins) {
    const resolved = resolveArchiveCollisions(layout, rect.id, { ...bounds, inset: 0 }, true);
    if (!resolved) return {};
    layout = resolved;
  }
  return Object.fromEntries(origins.map((origin) => {
    const rect = layout.find((entry) => entry.id === origin.id)!;
    return [origin.key, { x: rect.x - origin.x, y: rect.y - origin.y }];
  }));
};
