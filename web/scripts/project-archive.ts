type DragState = {
  pointerId: number;
  offsetX: number;
  offsetY: number;
};

export const initializeProjectArchive = () => {
  const archive = document.querySelector<HTMLElement>("[data-project-archive]");
  const floating = document.querySelector<HTMLElement>("[data-archive-floating]");
  const handle = floating?.querySelector<HTMLElement>("[data-archive-handle]");
  const sheet = floating?.querySelector<HTMLElement>("[data-archive-sheet]");
  const closeButton = floating?.querySelector<HTMLButtonElement>(
    "[data-archive-close]",
  );
  const title = floating?.querySelector<HTMLElement>(
    "[data-archive-floating-title]",
  );
  const count = floating?.querySelector<HTMLElement>(
    "[data-archive-floating-count]",
  );
  const closedTitle = floating?.querySelector<HTMLElement>(
    "[data-archive-closed-title]",
  );
  const closedCount = floating?.querySelector<HTMLElement>(
    "[data-archive-closed-count]",
  );

  if (!archive || !floating || !handle || !sheet || !closeButton || !title || !count || !closedTitle || !closedCount) {
    return { close: (_restoreFocus = true, _immediate = false) => {} };
  }

  const folders = Array.from(
    archive.querySelectorAll<HTMLButtonElement>("[data-archive-folder]"),
  );
  const cases = Array.from(
    archive.querySelectorAll<HTMLElement>("[data-archive-case]"),
  );
  const groups = Array.from(
    floating.querySelectorAll<HTMLElement>("[data-archive-files]"),
  );
  const stack = archive.querySelector<HTMLElement>(".project-archive__stack");
  const firstCase = cases[0]?.dataset.archiveCase ?? "";
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  archive.querySelectorAll<HTMLButtonElement>("[data-archive-jump]").forEach((button) => {
    button.addEventListener("click", () => {
      const panel = archive.closest<HTMLElement>(".projects-panel");
      if (!panel || !stack) return;
      const targetTop = panel.scrollTop + stack.getBoundingClientRect().top - panel.getBoundingClientRect().top - 12;
      folders[0]?.focus({ preventScroll: true });
      panel.scrollTo({ top: targetTop, behavior: reducedMotion.matches ? "auto" : "smooth" });
    });
  });

  let activeFolder: HTMLButtonElement | null = null;
  let drag: DragState | null = null;
  let returnTimer = 0;
  let returnFrame = 0;
  let openFrame = 0;
  let returnFocus = false;

  const selectProject = (slug: string) => {
    if (!cases.some((card) => card.dataset.archiveCase === slug)) return;
    cases.forEach((card) => {
      card.classList.toggle("is-current", card.dataset.archiveCase === slug);
    });
    floating
      .querySelectorAll<HTMLButtonElement>("[data-archive-file]")
      .forEach((button) => {
        button.setAttribute(
          "aria-current",
          String(button.dataset.archiveFile === slug),
        );
      });
  };

  const finishReturn = () => {
    window.clearTimeout(returnTimer);
    window.cancelAnimationFrame(returnFrame);
    window.cancelAnimationFrame(openFrame);
    returnTimer = 0;
    returnFrame = 0;
    openFrame = 0;
    const source = activeFolder;
    source?.classList.remove("is-lifted");
    source?.setAttribute("aria-expanded", "false");
    floating.hidden = true;
    floating.classList.remove("is-open", "is-closing", "is-closed", "is-returning", "is-positioning");
    floating.style.removeProperty("left");
    floating.style.removeProperty("top");
    floating.style.removeProperty("width");
    floating.style.removeProperty("height");
    activeFolder = null;
    drag = null;
    if (returnFocus) source?.focus();
    returnFocus = false;
  };

  const close = (restoreFocus = true, immediate = false) => {
    if (!activeFolder) return;
    if (returnTimer || floating.classList.contains("is-closing") || floating.classList.contains("is-returning")) {
      if (immediate) finishReturn();
      return;
    }

    returnFocus = restoreFocus;
    drag = null;
    window.cancelAnimationFrame(openFrame);
    openFrame = 0;
    floating.classList.remove("is-open");
    floating.classList.add("is-closing");
    activeFolder.setAttribute("aria-expanded", "false");

    if (immediate || reducedMotion.matches) {
      finishReturn();
      return;
    }

    const source = activeFolder;
    returnTimer = window.setTimeout(() => {
      returnTimer = 0;
      if (activeFolder !== source || !floating.classList.contains("is-closing")) return;
      const sourceRect = source.getBoundingClientRect();
      closedTitle.textContent = `${source.dataset.folderIndex ?? "00"} / ${source.dataset.folderLabel ?? "PASTA"}`;
      closedCount.textContent = source.dataset.folderCount ?? "00";
      const closedRect = floating.getBoundingClientRect();
      floating.style.width = `${closedRect.width}px`;
      floating.style.height = `${closedRect.height}px`;
      floating.getBoundingClientRect();
      floating.classList.add("is-closed");
      floating.style.width = `${sourceRect.width}px`;
      floating.style.height = `${sourceRect.height}px`;
      returnTimer = window.setTimeout(() => {
        returnTimer = 0;
        if (activeFolder !== source || !floating.classList.contains("is-closed")) return;
        floating.classList.add("is-returning");
        floating.getBoundingClientRect();
        returnFrame = window.requestAnimationFrame(() => {
          returnFrame = 0;
          if (activeFolder !== source || !floating.classList.contains("is-returning")) return;
          floating.style.left = `${sourceRect.left}px`;
          floating.style.top = `${sourceRect.top}px`;
        });
        returnTimer = window.setTimeout(finishReturn, 460);
      }, 260);
    }, 420);
  };

  const positionFloating = (left: number, top: number) => {
    const margin = 12;
    const width = floating.offsetWidth;
    const fullHeight = handle.offsetHeight + Math.min(
      sheet.scrollHeight,
      304,
      Math.max(0, window.innerHeight - handle.offsetHeight - margin * 2),
    );
    const maxLeft = Math.max(margin, window.innerWidth - width - margin);
    const maxTop = Math.max(margin, window.innerHeight - fullHeight - margin);
    floating.style.left = `${Math.min(maxLeft, Math.max(margin, left))}px`;
    floating.style.top = `${Math.min(maxTop, Math.max(margin, top))}px`;
  };

  const open = (source: HTMLButtonElement) => {
    if (activeFolder) finishReturn();
    const key = source.dataset.archiveFolder;
    const group = groups.find((item) => item.dataset.archiveFiles === key);
    if (!key || !group) return;

    activeFolder = source;
    source.classList.add("is-lifted");
    source.setAttribute("aria-expanded", "true");
    groups.forEach((item) => { item.hidden = item !== group; });
    title.textContent = source.dataset.folderLabel ?? "PASTA";
    count.textContent = `${source.dataset.folderCount ?? "00"} ARQ.`;
    closedTitle.textContent = `${source.dataset.folderIndex ?? "00"} / ${source.dataset.folderLabel ?? "PASTA"}`;
    closedCount.textContent = source.dataset.folderCount ?? "00";
    floating.setAttribute("aria-label", `Pasta ${source.dataset.folderLabel ?? ""} aberta`);
    floating.hidden = false;
    floating.classList.remove("is-open", "is-closing", "is-closed", "is-returning");
    floating.classList.add("is-positioning");
    floating.style.removeProperty("width");
    floating.style.removeProperty("height");
    const sourceRect = source.getBoundingClientRect();
    positionFloating(sourceRect.left, sourceRect.top);
    floating.getBoundingClientRect();
    floating.classList.remove("is-positioning");
    openFrame = window.requestAnimationFrame(() => {
      openFrame = 0;
      if (activeFolder === source && !floating.hidden) floating.classList.add("is-open");
    });
  };

  const beginDrag = (event: PointerEvent, capture: HTMLElement, rect: DOMRect) => {
    drag = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    try {
      capture.setPointerCapture(event.pointerId);
    } catch {
      // Window listeners still handle the drag if capture is unavailable.
    }
  };

  archive.addEventListener("pointerdown", (event) => {
    if (!(event.target instanceof Element)) return;
    const source = event.target.closest<HTMLButtonElement>("[data-archive-folder]");
    if (!source || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    const rect = source.getBoundingClientRect();
    open(source);
    beginDrag(event, source, rect);
  });

  archive.addEventListener("click", (event) => {
    if (event.detail !== 0 || !(event.target instanceof Element)) return;
    const source = event.target.closest<HTMLButtonElement>("[data-archive-folder]");
    if (!source) return;
    open(source);
    closeButton.focus();
  });

  handle.addEventListener("pointerdown", (event) => {
    if ((event.target instanceof Element && event.target.closest("button")) ||
      (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    beginDrag(event, handle, floating.getBoundingClientRect());
  });

  window.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId || floating.hidden) return;
    positionFloating(event.clientX - drag.offsetX, event.clientY - drag.offsetY);
  });

  const stopDrag = (event: PointerEvent) => {
    if (drag?.pointerId === event.pointerId) drag = null;
  };
  window.addEventListener("pointerup", stopDrag);
  window.addEventListener("pointercancel", stopDrag);

  floating.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const file = event.target.closest<HTMLButtonElement>("[data-archive-file]");
    if (file?.dataset.archiveFile) selectProject(file.dataset.archiveFile);
  });

  closeButton.addEventListener("click", () => close());

  document.addEventListener("pointerdown", (event) => {
    if (!activeFolder || floating.hidden || !(event.target instanceof Node)) return;
    if (floating.contains(event.target)) return;
    if (event.target instanceof Element && event.target.closest("[data-archive-folder]")) return;
    close(false);
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && activeFolder) close();
  });

  window.addEventListener("resize", () => {
    if (floating.hidden || floating.classList.contains("is-closing") || floating.classList.contains("is-returning")) return;
    positionFloating(
      Number.parseFloat(floating.style.left) || 12,
      Number.parseFloat(floating.style.top) || 12,
    );
  });

  return { close };
};
