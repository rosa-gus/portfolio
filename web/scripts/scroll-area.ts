const scrollThreshold = 1;

type ScrollAreaState = {
  root: HTMLElement;
  viewport: HTMLElement;
  resizeObserver: ResizeObserver;
  mutationObserver: MutationObserver;
  update: () => void;
};

const scrollAreas = new WeakMap<HTMLElement, ScrollAreaState>();

const updateScrollArea = (root: HTMLElement, viewport: HTMLElement) => {
  const vertical = root.dataset.axis === "vertical";
  const scrollSize = vertical ? viewport.scrollHeight : viewport.scrollWidth;
  const clientSize = vertical ? viewport.clientHeight : viewport.clientWidth;
  const position = vertical ? viewport.scrollTop : viewport.scrollLeft;
  const maximumScroll = Math.max(0, scrollSize - clientSize);
  const hasOverflow = maximumScroll > scrollThreshold;

  root.toggleAttribute("data-scrollable", hasOverflow);
  root.toggleAttribute(
    "data-scroll-start",
    hasOverflow && position > scrollThreshold,
  );
  root.toggleAttribute(
    "data-scroll-end",
    hasOverflow && position < maximumScroll - scrollThreshold,
  );
};

const connectScrollArea = (root: HTMLElement) => {
  if (scrollAreas.has(root)) return;

  const viewport = root.querySelector<HTMLElement>(
    ":scope > [data-scroll-area-viewport]",
  );
  if (!viewport) return;

  const update = () => updateScrollArea(root, viewport);
  const resizeObserver = new ResizeObserver(update);
  const mutationObserver = new MutationObserver(update);

  viewport.addEventListener("scroll", update, { passive: true });
  resizeObserver.observe(viewport);
  if (viewport.firstElementChild)
    resizeObserver.observe(viewport.firstElementChild);
  mutationObserver.observe(viewport, {
    attributes: true,
    attributeFilter: ["class", "hidden", "style"],
    childList: true,
    subtree: true,
    characterData: true,
  });

  scrollAreas.set(root, {
    root,
    viewport,
    resizeObserver,
    mutationObserver,
    update,
  });
  window.requestAnimationFrame(update);
};

const disconnectScrollArea = (root: HTMLElement) => {
  const state = scrollAreas.get(root);
  if (!state) return;

  state.viewport.removeEventListener("scroll", state.update);
  state.resizeObserver.disconnect();
  state.mutationObserver.disconnect();
  scrollAreas.delete(root);
};

const findScrollAreas = (node: Node) => {
  if (!(node instanceof HTMLElement)) return [];

  const roots = Array.from(
    node.querySelectorAll<HTMLElement>("[data-scroll-area]"),
  );
  if (node.matches("[data-scroll-area]")) roots.unshift(node);
  return roots;
};

export const initializeScrollAreas = () => {
  document
    .querySelectorAll<HTMLElement>("[data-scroll-area]")
    .forEach(connectScrollArea);

  const documentObserver = new MutationObserver((records) => {
    records.forEach((record) => {
      record.removedNodes.forEach((node) =>
        findScrollAreas(node).forEach(disconnectScrollArea),
      );
      record.addedNodes.forEach((node) =>
        findScrollAreas(node).forEach(connectScrollArea),
      );
    });
  });

  documentObserver.observe(document.body, { childList: true, subtree: true });
};
