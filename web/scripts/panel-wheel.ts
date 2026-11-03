export type ScrollDirection = -1 | 1;

type ScrollMetrics = {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
};

export const canScrollInDirection = (
  viewport: ScrollMetrics,
  direction: ScrollDirection,
) => {
  const maximum = viewport.scrollHeight - viewport.clientHeight;
  return (
    maximum > 1 &&
    (direction > 0 ? viewport.scrollTop < maximum - 1 : viewport.scrollTop > 1)
  );
};

export const normalizeWheelDelta = (
  delta: number,
  mode: number,
  pageHeight: number,
) => delta * (mode === 1 ? 16 : mode === 2 ? pageHeight : 1);

/** One section per gesture, including its momentum and any internal scrolling. */
export const createWheelGesture = ({ threshold = 80, idle = 240 } = {}) => {
  let lastTime = -Infinity;
  let direction = 0;
  let distance = 0;
  let consumed = false;
  let navigated = false;

  const reset = () => {
    lastTime = -Infinity;
    direction = 0;
    distance = 0;
    consumed = false;
    navigated = false;
  };

  return {
    reset,
    blocksScroll: (time: number) => navigated && time - lastTime <= idle,
    add(delta: number, time: number, consume = false): ScrollDirection | 0 {
      if (time - lastTime > idle) reset();
      lastTime = time;
      consumed ||= consume;
      if (consumed || delta === 0) return 0;

      const nextDirection: ScrollDirection = delta > 0 ? 1 : -1;
      if (nextDirection !== direction) distance = 0;
      direction = nextDirection;
      distance += Math.abs(delta);
      if (distance < threshold) return 0;

      consumed = true;
      navigated = true;
      return nextDirection;
    },
  };
};
