const shakes = new WeakMap<HTMLElement, Animation>();

export const cancelWindowShake = (root: HTMLElement) => {
  const animation = shakes.get(root);
  shakes.delete(root);
  animation?.cancel();
};

/** Animate the shared frame without disturbing its layout or opening transition. */
export const shakeWindow = (
  root: HTMLElement,
  { distance = 4, duration = 280 }: { distance?: number; duration?: number } = {},
) => {
  cancelWindowShake(root);
  if (
    root.hidden ||
    root.inert ||
    root.classList.contains("is-dragging") ||
    (root.localName === "dialog" && !(root as HTMLDialogElement).open) ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    typeof root.animate !== "function"
  )
    return;

  const translate = (x: number, y = 0) => ({
    translate: `${x * distance}px ${y * distance}px`,
  });
  const animation = root.animate(
    [translate(0), translate(-1, 0.25), translate(1, -0.25), translate(-0.75), translate(0.5), translate(0)],
    { duration, easing: "ease-out" },
  );
  shakes.set(root, animation);
  animation.addEventListener(
    "finish",
    () => {
      if (shakes.get(root) === animation) shakes.delete(root);
    },
    { once: true },
  );
};
