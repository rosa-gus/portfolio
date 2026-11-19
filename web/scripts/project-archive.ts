import EmblaCarousel, { type EmblaCarouselType } from "embla-carousel";
import { migrateStorageValue, storageKey } from "./storage";
import { restoreArchivePositions, resolveArchiveCollisions, type ArchiveBounds, type ArchiveRect } from "./archive-layout";
import { initializeArchiveComplaints } from "./archive-complaints";

type ItemPosition = { x: number; y: number };
type ArchiveItem = HTMLButtonElement | HTMLAnchorElement;
type SurfaceDrag = {
  source: ArchiveItem;
  pointerId: number;
  startX: number;
  startY: number;
  initial: ItemPosition;
  origins: ArchiveRect[];
  bounds: ArchiveBounds;
  snapshot: Map<ArchiveItem, ItemPosition>;
  pushed: Set<ArchiveItem>;
  scroll: ItemPosition;
  zIndex: string;
  moved: boolean;
};

export const initializeProjectArchive = () => {
  const archive = document.querySelector<HTMLElement>("[data-project-archive]");
  const floating = archive?.querySelector<HTMLElement>("[data-archive-floating]");
  const surface = archive?.querySelector<HTMLElement>("[data-archive-surface]");
  const viewport = surface?.closest<HTMLElement>("[data-scroll-area-viewport]");
  const caseArea = archive?.querySelector<HTMLElement>(".project-archive__cases");
  const dismiss = archive?.querySelector<HTMLButtonElement>("[data-archive-dismiss]");
  const reset = archive?.querySelector<HTMLButtonElement>("[data-archive-reset]");
  const closeButton = floating?.querySelector<HTMLButtonElement>("[data-archive-close]");
  const title = floating?.querySelector<HTMLElement>("[data-archive-divider-title]");
  const count = floating?.querySelector<HTMLElement>("[data-archive-floating-count]");
  const announcement = archive?.querySelector<HTMLElement>("[data-archive-announcement]");
  if (!archive || !floating || !surface || !viewport || !caseArea || !dismiss || !reset || !closeButton || !title || !count) {
    return { close: (_restoreFocus = true, _immediate = false) => {} };
  }

  const cases = Array.from(archive.querySelectorAll<HTMLElement>("[data-archive-case]"));
  const items = Array.from(surface.querySelectorAll<ArchiveItem>("[data-archive-item]"));
  const groups = Array.from(floating.querySelectorAll<HTMLElement>("[data-archive-files]"));
  const previousFile = floating.querySelector<HTMLButtonElement>("[data-archive-files-prev]");
  const nextFile = floating.querySelector<HTMLButtonElement>("[data-archive-files-next]");
  const filePosition = floating.querySelector<HTMLElement>("[data-archive-files-position]");
  const resetArchiveCarousels = new Map<string, () => void>();
  const fileCarousels = new Map<HTMLElement, EmblaCarouselType>();
  const positions = new Map<ArchiveItem, ItemPosition>();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const desktop = window.matchMedia("(min-width: 901px)");
  const canDrag = window.matchMedia("(min-width: 901px) and (pointer: fine)");
  const complaints = initializeArchiveComplaints(surface, viewport, items, canDrag, (item) => returnItemToOrigin(item as ArchiveItem));
  let activeFolder: HTMLButtonElement | null = null;
  let activeGroup: HTMLElement | null = null;
  let drag: SurfaceDrag | null = null;
  let suppressedClick: ArchiveItem | null = null;
  let closing = false;
  let closeTimer = 0;
  let openFrame = 0;
  let synchronizingCarousel = false;
  let itemOrder = 0;
  let dragFrame = 0;
  let pendingMove: ItemPosition | null = null;

  const setItemPosition = (item: ArchiveItem, position: ItemPosition) => {
    positions.set(item, position);
    item.style.setProperty("--item-x", `${position.x}px`);
    item.style.setProperty("--item-y", `${position.y}px`);
  };

  const returnItemToOrigin = (item: ArchiveItem) => {
    const current = positions.get(item);
    if (drag || surface.inert || surface.closest("[hidden]") || document.querySelector("dialog[open]") || !canDrag.matches || !current || Math.hypot(current.x, current.y) < 0.5) return false;
    const origins = items.map((entry, id) => ({ id, x: entry.offsetLeft, y: entry.offsetTop, width: entry.offsetWidth, height: entry.offsetHeight }));
    const id = items.indexOf(item);
    const rects = origins.map((origin) => {
      const position = positions.get(items[origin.id]) ?? { x: 0, y: 0 };
      return { ...origin, x: origin.x + position.x, y: origin.y + position.y };
    });
    rects[id] = { ...origins[id] };
    const layout = resolveArchiveCollisions(rects, id, { width: viewport.clientWidth, height: Math.max(viewport.clientHeight, surface.offsetHeight), inset: 8 }, true);
    if (!layout) return false;
    for (const rect of layout) setItemPosition(items[rect.id], { x: rect.x - origins[rect.id].x, y: rect.y - origins[rect.id].y });
    item.style.removeProperty("z-index");
    updateResetVisibility();
    saveArchiveState();
    return true;
  };

  const clearPendingMove = () => {
    window.cancelAnimationFrame(dragFrame);
    dragFrame = 0;
    pendingMove = null;
  };

  const moveDraggedItem = (clientX: number, clientY: number, settle = false) => {
    if (!drag || !canDrag.matches) return;
    const dx = clientX - drag.startX;
    const dy = clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    if (!drag.moved) drag.source.style.zIndex = String(++itemOrder);
    drag.moved = true;
    drag.source.classList.add("is-dragging");
    const sourceId = items.indexOf(drag.source);
    const origin = drag.origins[sourceId];
    const x = Math.max(viewport.scrollLeft + 8, Math.min(
      drag.bounds.width - origin.width - 8,
      viewport.scrollLeft + viewport.clientWidth - origin.width - 8,
      origin.x + drag.initial.x + dx + viewport.scrollLeft - drag.scroll.x,
    ));
    const y = Math.max(viewport.scrollTop + 8, Math.min(
      drag.bounds.height - origin.height - 8,
      viewport.scrollTop + viewport.clientHeight - origin.height - 8,
      origin.y + drag.initial.y + dy + viewport.scrollTop - drag.scroll.y,
    ));
    const rects = drag.origins.map((rect) => {
      const position = positions.get(items[rect.id]) ?? { x: 0, y: 0 };
      return { ...rect, x: rect.x + position.x, y: rect.y + position.y };
    });
    rects[sourceId] = { ...origin, x, y };
    const layout = resolveArchiveCollisions(rects, sourceId, drag.bounds, settle);
    // If the container is completely packed, keep the last arrangement instead
    // of pushing a neighbour outside the archive or hiding it under another item.
    if (!layout) {
      if (settle) {
        drag.snapshot.forEach((position, item) => setItemPosition(item, position));
        drag.pushed.clear();
        updateResetVisibility();
      }
      return;
    }
    for (const rect of layout) {
      const item = items[rect.id];
      const position = { x: rect.x - drag.origins[rect.id].x, y: rect.y - drag.origins[rect.id].y };
      const previous = positions.get(item) ?? { x: 0, y: 0 };
      const before = drag.snapshot.get(item) ?? { x: 0, y: 0 };
      if (item !== drag.source && Math.hypot(position.x - before.x, position.y - before.y) >= 3) drag.pushed.add(item);
      if (Math.abs(previous.x - position.x) > 0.01 || Math.abs(previous.y - position.y) > 0.01) setItemPosition(item, position);
    }
    updateResetVisibility();
  };

  const updateResetVisibility = () => {
    reset.hidden = !desktop.matches || !Array.from(positions.values()).some(
      ({ x, y }) => Math.abs(x) > 0.5 || Math.abs(y) > 0.5,
    );
  };

  const legacyStateKey = `document-archive:${window.location.pathname}`;
  const stateKey = storageKey(legacyStateKey);
  const itemKey = (item: ArchiveItem) => item.dataset.archiveId ?? legacyItemKey(item);
  const legacyItemKey = (item: ArchiveItem) => {
    if (item.dataset.archiveFolder) return `folder:${item.dataset.archiveFolder}`;
    if (item.dataset.archiveProject) return `project:${item.dataset.archiveProject}`;
    if (item.dataset.documentNoteTrigger) return `note:${item.dataset.documentNoteTrigger}`;
    if (item.dataset.archiveArticle) return `article:${item.dataset.archiveArticle}`;
    if (item.dataset.popupTrigger) return `popup:${item.dataset.popupTrigger}`;
    return item instanceof HTMLAnchorElement ? `link:${item.href}` : "";
  };
  const saveArchiveState = () => {
    const panel = archive.closest<HTMLElement>(".projects-panel");
    try {
      sessionStorage.setItem(stateKey, JSON.stringify({
        version: 2,
        items: Object.fromEntries(items.map((item) => [itemKey(item), positions.get(item) ?? { x: 0, y: 0 }])),
        selected: cases.find((card) => card.classList.contains("is-current"))?.dataset.archiveCase,
        surfaceScroll: viewport.scrollTop,
        panelScroll: panel?.scrollTop ?? 0,
        pageScroll: window.scrollY,
      }));
    } catch {
      // Reading and navigation remain available when browser storage is disabled.
    }
  };

  const selectProject = (slug: string) => {
    const selected = cases.find((card) => card.dataset.archiveCase === slug);
    if (!selected) return;
    const changed = !selected.classList.contains("is-current");
    cases.forEach((card) => card.classList.toggle("is-current", card === selected));
    initializeArchiveCarousel(selected);
    if (changed) resetArchiveCarousels.get(slug)?.();
    floating.querySelectorAll<HTMLButtonElement>("[data-archive-file]").forEach((button) => {
      button.setAttribute("aria-current", String(button.dataset.archiveFile === slug));
    });
    items.forEach((item) => {
      if (item.dataset.archiveProject) item.setAttribute("aria-current", String(item.dataset.archiveProject === slug));
    });
    if (changed && announcement) announcement.textContent = `${selected.querySelector("h2")?.textContent ?? "Projeto"} em destaque.`;
  };

  const updateFileShadows = () => {
    if (!activeGroup) return;
    const carousel = fileCarousels.get(activeGroup);
    if (!carousel) return;
    const hasOverflow = carousel.scrollSnapList().length > 1;
    const progress = carousel.scrollProgress();
    activeGroup.toggleAttribute("data-scrollable", hasOverflow);
    activeGroup.toggleAttribute("data-scroll-start", hasOverflow && progress > 0.001);
    activeGroup.toggleAttribute("data-scroll-end", hasOverflow && progress < 0.999);
  };

  const updateFileNavigation = () => {
    if (!activeGroup) return;
    const carousel = fileCarousels.get(activeGroup);
    if (!carousel) return;
    updateFileShadows();
    if (previousFile) previousFile.disabled = !carousel.canScrollPrev();
    if (nextFile) nextFile.disabled = !carousel.canScrollNext();
    if (filePosition) {
      const total = carousel.slideNodes().length;
      const visible = carousel.slidesInView();
      const first = String((visible[0] ?? carousel.selectedScrollSnap()) + 1).padStart(2, "0");
      const last = String((visible.at(-1) ?? carousel.selectedScrollSnap()) + 1).padStart(2, "0");
      const range = first === last ? first : `${first}–${last}`;
      filePosition.textContent = `${range} / ${String(total).padStart(2, "0")} ${total === 1 ? "FICHA" : "FICHAS"}`;
    }
  };

  const initializeFileCarousel = (group: HTMLElement) => {
    let carousel = fileCarousels.get(group);
    if (carousel) {
      carousel.reInit({ duration: reducedMotion.matches ? 0 : 24 });
    } else {
      const viewport = group.querySelector<HTMLElement>(".project-archive__floating-files-viewport");
      if (!viewport) return;
      carousel = EmblaCarousel(viewport, {
        align: "start",
        containScroll: "trimSnaps",
        direction: "ltr",
        duration: reducedMotion.matches ? 0 : 24,
        loop: false,
        watchFocus: true,
      });
      fileCarousels.set(group, carousel);
      const update = () => {
        if (activeGroup === group) updateFileNavigation();
      };
      carousel.on("select", (api) => {
        if (activeGroup !== group || closing || synchronizingCarousel) return;
        const file = api.slideNodes()[api.selectedScrollSnap()]?.querySelector<HTMLElement>("[data-archive-file]");
        if (file?.dataset.archiveFile) selectProject(file.dataset.archiveFile);
        update();
      });
      carousel.on("reInit", update);
      carousel.on("slidesInView", update);
      carousel.on("scroll", () => {
        if (activeGroup !== group) return;
        updateFileShadows();
      });
      carousel.on("settle", update);
    }
    updateFileNavigation();
    return carousel;
  };

  previousFile?.addEventListener("click", () => {
    if (activeGroup) fileCarousels.get(activeGroup)?.scrollPrev();
  });
  nextFile?.addEventListener("click", () => {
    if (activeGroup) fileCarousels.get(activeGroup)?.scrollNext();
  });

  const initializeArchiveCarousel = (caseCard: HTMLElement) => {
    const slug = caseCard.dataset.archiveCase;
    const root = caseCard.querySelector<HTMLElement>("[data-archive-carousel]");
    const viewport = root?.querySelector<HTMLElement>(
      "[data-archive-carousel-viewport]",
    );
    const slides = Array.from(
      viewport?.querySelectorAll<HTMLElement>(
        ".project-archive__case-cover-slide",
      ) ?? [],
    );
    const previousButton = caseCard.querySelector<HTMLButtonElement>(
      "[data-archive-carousel-prev]",
    );
    const nextButton = caseCard.querySelector<HTMLButtonElement>(
      "[data-archive-carousel-next]",
    );
    if (
      !slug ||
      !viewport ||
      slides.length === 0 ||
      resetArchiveCarousels.has(slug)
    )
      return;

    const carousel = EmblaCarousel(viewport, {
      align: "start",
      containScroll: "trimSnaps",
      direction: "ltr",
      duration: reducedMotion.matches ? 0 : 24,
      loop: false,
      watchFocus: false,
    });

    const updateCarousel = () => {
      const selectedIndex = carousel.selectedScrollSnap();
      slides.forEach((slide, index) => {
        const active = index === selectedIndex;
        const image = slide.querySelector<HTMLImageElement>(
          "[data-archive-carousel-image]",
        );
        if (active && image && !image.hasAttribute("src")) {
          image.src = image.dataset.src ?? "";
        }
        slide.setAttribute("aria-hidden", String(!active));
        slide.inert = !active;
      });
      if (previousButton) previousButton.disabled = !carousel.canScrollPrev();
      if (nextButton) nextButton.disabled = !carousel.canScrollNext();
    };

    carousel.on("select", updateCarousel);
    carousel.on("reInit", updateCarousel);
    previousButton?.addEventListener("click", () => {
      carousel.scrollPrev();
    });
    nextButton?.addEventListener("click", () => {
      carousel.scrollNext();
    });
    resetArchiveCarousels.set(slug, () => carousel.scrollTo(0));
    updateCarousel();
  };

  cases
    .filter((caseCard) => caseCard.classList.contains("is-current"))
    .forEach(initializeArchiveCarousel);

  const initial = cases.find((card) => card.classList.contains("is-current"));
  if (initial?.dataset.archiveCase) selectProject(initial.dataset.archiveCase);

  const finishClose = (restoreFocus: boolean) => {
    window.clearTimeout(closeTimer);
    window.cancelAnimationFrame(openFrame);
    closeTimer = 0;
    openFrame = 0;
    const source = activeFolder;
    source?.setAttribute("aria-expanded", "false");
    floating.hidden = true;
    floating.inert = false;
    floating.classList.remove("is-open", "is-closing");
    archive.classList.remove("is-consulting");
    dismiss.hidden = true;
    surface.inert = false;
    reset.inert = false;
    activeFolder = null;
    activeGroup = null;
    closing = false;
    if (restoreFocus) source?.focus({ preventScroll: true });
  };

  const cancelDrag = () => {
    if (!drag) return;
    clearPendingMove();
    const { source, snapshot, pointerId, zIndex } = drag;
    snapshot.forEach((position, item) => setItemPosition(item, position));
    source.style.zIndex = zIndex;
    updateResetVisibility();
    source.classList.remove("is-dragging");
    drag = null;
    if (source.hasPointerCapture(pointerId)) source.releasePointerCapture(pointerId);
  };

  const close = (restoreFocus = true, immediate = false) => {
    complaints.hide();
    cancelDrag();
    if (!activeFolder) return;
    if (immediate || reducedMotion.matches) {
      finishClose(restoreFocus);
      return;
    }
    if (closing) return;
    closing = true;
    floating.inert = true;
    floating.classList.add("is-closing");
    closeTimer = window.setTimeout(() => {
      floating.classList.remove("is-open");
      closeTimer = window.setTimeout(() => finishClose(restoreFocus), 240);
    }, 120);
  };

  const open = (source: HTMLButtonElement) => {
    close(false, true);
    const group = groups.find((item) => item.dataset.archiveFiles === source.dataset.archiveFolder);
    if (!group) return;
    const files = Array.from(group.querySelectorAll<HTMLButtonElement>("[data-archive-file]"));
    if (files.length === 0) return;
    activeFolder = source;
    activeGroup = group;
    source.setAttribute("aria-expanded", "true");
    groups.forEach((item) => { item.hidden = item !== group; });
    title.textContent = `${source.dataset.folderSymbol ?? "+"} ${source.dataset.folderLabel ?? "COLEÇÃO"}`;
    count.textContent = `${String(files.length).padStart(2, "0")} CASE`;
    floating.setAttribute("aria-label", `Coleção ${source.dataset.folderLabel ?? ""}`);
    floating.hidden = false;
    floating.inert = false;
    dismiss.hidden = false;
    surface.inert = true;
    reset.inert = true;
    const currentSlug = cases.find((card) => card.classList.contains("is-current"))?.dataset.archiveCase;
    const selectedIndex = Math.max(0, files.findIndex((file) => file.dataset.archiveFile === currentSlug));
    const slug = files[selectedIndex]?.dataset.archiveFile;
    if (slug) selectProject(slug);
    synchronizingCarousel = true;
    const carousel = initializeFileCarousel(group);
    carousel?.scrollTo(selectedIndex, true);
    synchronizingCarousel = false;
    updateFileNavigation();
    const sourceRect = source.getBoundingClientRect();
    const pane = floating.getBoundingClientRect();
    floating.style.transformOrigin = `${sourceRect.left + sourceRect.width / 2 - pane.left}px ${sourceRect.top + sourceRect.height / 2 - pane.top}px`;
    floating.getBoundingClientRect();
    openFrame = window.requestAnimationFrame(() => {
      openFrame = 0;
      if (activeFolder !== source || closing) return;
      archive.classList.add("is-consulting");
      floating.classList.add("is-open");
      closeButton.focus({ preventScroll: true });
      if (!desktop.matches) floating.scrollIntoView({
        block: "start",
        behavior: reducedMotion.matches ? "auto" : "smooth",
      });
    });
  };

  surface.addEventListener("pointerdown", (event) => {
    if (!canDrag.matches || event.pointerType === "touch" || event.button !== 0 || !event.isPrimary || activeFolder || drag) return;
    if (!(event.target instanceof Element)) return;
    const source = event.target.closest<ArchiveItem>("[data-archive-item]");
    if (!source) return;
    drag = {
      source,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      initial: positions.get(source) ?? { x: 0, y: 0 },
      origins: items.map((item, id) => ({ id, x: item.offsetLeft, y: item.offsetTop, width: item.offsetWidth, height: item.offsetHeight })),
      bounds: { width: viewport.clientWidth, height: Math.max(viewport.clientHeight, surface.offsetHeight), inset: 8 },
      snapshot: new Map(items.map((item) => [item, positions.get(item) ?? { x: 0, y: 0 }])),
      pushed: new Set(),
      scroll: { x: viewport.scrollLeft, y: viewport.scrollTop },
      zIndex: source.style.zIndex,
      moved: false,
    };
    source.setPointerCapture(event.pointerId);
  });

  window.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    event.preventDefault();
    pendingMove = { x: event.clientX, y: event.clientY };
    if (!dragFrame) dragFrame = window.requestAnimationFrame(() => {
      dragFrame = 0;
      const point = pendingMove;
      pendingMove = null;
      if (point) moveDraggedItem(point.x, point.y);
    });
  });

  window.addEventListener("pointerup", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    clearPendingMove();
    moveDraggedItem(event.clientX, event.clientY, true);
    const { source, pointerId, moved, pushed } = drag;
    drag = null;
    source.classList.remove("is-dragging");
    if (source.hasPointerCapture(pointerId)) source.releasePointerCapture(pointerId);
    if (moved) {
      complaints.record([...pushed]);
      saveArchiveState();
      suppressedClick = source;
      window.setTimeout(() => { if (suppressedClick === source) suppressedClick = null; }, 0);
    }
  });
  window.addEventListener("pointercancel", (event) => {
    if (drag?.pointerId === event.pointerId) cancelDrag();
  });
  surface.addEventListener("lostpointercapture", cancelDrag);
  window.addEventListener("blur", cancelDrag);

  surface.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const source = event.target.closest<ArchiveItem>("[data-archive-item]");
    if (!source) return;
    if (event.detail !== 0 && suppressedClick) {
      event.preventDefault();
      suppressedClick = null;
      return;
    }
    if (source.dataset.archiveArticle) saveArchiveState();
    if (source instanceof HTMLButtonElement && source.dataset.archiveFolder) open(source);
    else if (source.dataset.archiveProject) {
      selectProject(source.dataset.archiveProject);
      if (!desktop.matches) caseArea.scrollIntoView({
        block: "start",
        behavior: reducedMotion.matches ? "auto" : "smooth",
      });
    }
  });

  caseArea.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || !(event.target instanceof Element)) return;
    const link = event.target.closest<HTMLAnchorElement>("[data-archive-related]");
    const slug = link?.dataset.archiveRelated;
    const target = cases.find((card) => card.dataset.archiveCase === slug);
    if (!slug || !target) return;
    event.preventDefault();
    selectProject(slug);
    target.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    saveArchiveState();
  });

  reset.addEventListener("click", () => {
    complaints.reset();
    cancelDrag();
    const firstMoved = items.find((item) => {
      const position = positions.get(item);
      return position && (Math.abs(position.x) > 0.5 || Math.abs(position.y) > 0.5);
    });
    positions.clear();
    itemOrder = 0;
    items.forEach((item) => {
      item.style.removeProperty("--item-x");
      item.style.removeProperty("--item-y");
      item.style.removeProperty("z-index");
    });
    updateResetVisibility();
    if (document.activeElement === reset) firstMoved?.focus({ preventScroll: true });
    saveArchiveState();
    if (announcement) announcement.textContent = "Organização original restaurada.";
  });

  floating.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const file = event.target.closest<HTMLButtonElement>("[data-archive-file]");
    if (file?.dataset.archiveFile) selectProject(file.dataset.archiveFile);
  });
  closeButton.addEventListener("click", () => close());
  dismiss.addEventListener("click", () => close());
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (drag) {
      event.preventDefault();
      cancelDrag();
    } else if (activeFolder) {
      event.preventDefault();
      close();
    }
  });

  const constrainItems = () => {
    cancelDrag();
    if (surface.getClientRects().length === 0) return;
    if (!canDrag.matches) {
      updateResetVisibility();
      return;
    }
    const restored = restoreArchivePositions(
      items.map((item, id) => ({ id, key: itemKey(item), x: item.offsetLeft, y: item.offsetTop, width: item.offsetWidth, height: item.offsetHeight })),
      Object.fromEntries(items.map((item) => [itemKey(item), positions.get(item) ?? { x: 0, y: 0 }])),
      { width: viewport.clientWidth, height: Math.max(viewport.clientHeight, surface.offsetHeight) },
    );
    positions.clear();
    items.forEach((item) => setItemPosition(item, restored[itemKey(item)] ?? { x: 0, y: 0 }));
    updateResetVisibility();
  };
  window.addEventListener("resize", constrainItems);
  canDrag.addEventListener("change", cancelDrag);
  reducedMotion.addEventListener("change", () => {
    if (activeFolder && closing && reducedMotion.matches) finishClose(true);
    fileCarousels.forEach((carousel) => carousel.reInit({ duration: reducedMotion.matches ? 0 : 24 }));
  });

  window.addEventListener("pagehide", saveArchiveState);
  try {
    const saved = JSON.parse(migrateStorageValue(sessionStorage, stateKey, legacyStateKey) ?? "null") as {
      version?: number;
      items?: Record<string, ItemPosition>;
      selected?: string;
      surfaceScroll?: number;
      panelScroll?: number;
      pageScroll?: number;
    } | null;
    if (saved?.version === 1 || saved?.version === 2) {
      items.forEach((item) => {
        const position = saved.items?.[saved.version === 1 ? legacyItemKey(item) : itemKey(item)];
        if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return;
        if (Math.abs(position.x) > 100000 || Math.abs(position.y) > 100000) return;
        if (position.x === 0 && position.y === 0) return;
        positions.set(item, position);
        item.style.setProperty("--item-x", `${position.x}px`);
        item.style.setProperty("--item-y", `${position.y}px`);
      });
      if (saved.selected) selectProject(saved.selected);
      updateResetVisibility();
      window.requestAnimationFrame(() => {
        if (archive.closest("[hidden]")) return;
        if (Number.isFinite(saved.surfaceScroll)) viewport.scrollTop = Math.max(0, saved.surfaceScroll ?? 0);
        const panel = archive.closest<HTMLElement>(".projects-panel");
        if (panel && Number.isFinite(saved.panelScroll)) panel.scrollTop = Math.max(0, saved.panelScroll ?? 0);
        if (Number.isFinite(saved.pageScroll)) window.scrollTo({ top: Math.max(0, saved.pageScroll ?? 0), behavior: "instant" });
        constrainItems();
      });
    }
  } catch {
    // Ignore unavailable storage and old or malformed layouts.
  }

  return { close };
};
