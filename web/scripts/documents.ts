type DocumentOptions = { beforeOpen: () => void };

export const initializeDocuments = ({ beforeOpen }: DocumentOptions) => {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const notes = Array.from(document.querySelectorAll<HTMLDialogElement>("dialog[data-document-note], dialog[data-popup]"));
  let active: HTMLDialogElement | null = null;
  let trigger: HTMLElement | null = null;
  let timer = 0;
  let frame = 0;
  let closing = false;
  let returnFocus = true;
  let drag: {
    dialog: HTMLDialogElement;
    handle: HTMLElement;
    pointerId: number;
    offsetX: number;
    offsetY: number;
  } | null = null;

  const stopDrag = () => {
    if (!drag) return;
    const current = drag;
    drag = null;
    current.dialog.classList.remove("is-dragging");
    if (current.handle.hasPointerCapture(current.pointerId)) current.handle.releasePointerCapture(current.pointerId);
  };

  const positionNote = (dialog: HTMLDialogElement, left: number, top: number) => {
    const margin = 12;
    const shadow = 7;
    const maxLeft = Math.max(margin, window.innerWidth - dialog.offsetWidth - margin - shadow);
    const maxTop = Math.max(margin, window.innerHeight - dialog.offsetHeight - margin - shadow);
    dialog.classList.add("is-positioned");
    dialog.style.left = `${Math.min(maxLeft, Math.max(margin, left))}px`;
    dialog.style.top = `${Math.min(maxTop, Math.max(margin, top))}px`;
  };

  const finishClose = () => {
    stopDrag();
    window.clearTimeout(timer);
    window.cancelAnimationFrame(frame);
    timer = 0;
    frame = 0;
    const dialog = active;
    const source = trigger;
    active = null;
    trigger = null;
    closing = false;
    if (dialog?.open) dialog.close();
    if (dialog) dialog.inert = false;
    dialog?.classList.remove("is-open", "is-closing", "is-positioned");
    dialog?.style.removeProperty("left");
    dialog?.style.removeProperty("top");
    dialog?.removeAttribute("aria-busy");
    if (returnFocus && source?.isConnected && !source.closest("[hidden]")) source.focus({ preventScroll: true });
  };

  const close = (restoreFocus = true, immediate = false) => {
    if (!active) return;
    stopDrag();
    if (!closing) active.dispatchEvent(new Event("popup:closing"));
    returnFocus = restoreFocus;
    if (immediate || reducedMotion.matches) {
      finishClose();
      return;
    }
    if (closing) return;
    closing = true;
    const dialog = active;
    dialog.inert = true;
    dialog.classList.add("is-closing");
    dialog.setAttribute("aria-busy", "true");
    timer = window.setTimeout(() => {
      dialog.classList.remove("is-open");
      timer = window.setTimeout(finishClose, 240);
    }, 120);
  };

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || !(event.target instanceof Element)) return;
    const source = event.target.closest<HTMLButtonElement>("[data-document-note-trigger], [data-popup-trigger]");
    if (!source) return;
    const dialog = notes.find((note) => (note.dataset.documentNote ?? note.dataset.popup) === (source.dataset.documentNoteTrigger ?? source.dataset.popupTrigger));
    if (!dialog) return;
    close(false, true);
    beforeOpen();
    active = dialog;
    trigger = source;
    returnFocus = true;
    dialog.showModal();
    dialog.dispatchEvent(new Event("popup:open"));
    const viewport = dialog.querySelector<HTMLElement>("[data-scroll-area-viewport]");
    if (viewport) viewport.scrollTop = 0;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      if (active !== dialog || closing) return;
      dialog.classList.add("is-open");
      dialog.querySelector<HTMLButtonElement>("[data-document-note-close], [data-popup-close]")?.focus({ preventScroll: true });
    });
  });

  notes.forEach((dialog) => {
    const handle = dialog.querySelector<HTMLElement>("[data-document-note-handle], [data-popup-handle]");
    handle?.addEventListener("pointerdown", (event) => {
      if (active !== dialog || closing || !event.isPrimary || event.button !== 0) return;
      if (event.target instanceof Element && event.target.closest("a, button, input, select, textarea")) return;
      event.preventDefault();
      dialog.classList.add("is-dragging");
      const rect = dialog.getBoundingClientRect();
      positionNote(dialog, rect.left, rect.top);
      drag = {
        dialog,
        handle,
        pointerId: event.pointerId,
        offsetX: event.clientX - Number.parseFloat(dialog.style.left),
        offsetY: event.clientY - Number.parseFloat(dialog.style.top),
      };
      handle.setPointerCapture(event.pointerId);
    });
    handle?.addEventListener("lostpointercapture", (event) => {
      if (drag?.pointerId === event.pointerId) stopDrag();
    });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      close();
    });
    dialog.querySelector<HTMLButtonElement>("[data-document-note-close], [data-popup-close]")?.addEventListener("click", () => close());
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    });
    dialog.addEventListener("close", () => {
      if (active === dialog && !dialog.open) finishClose();
    });
  });

  window.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId || closing) return;
    event.preventDefault();
    positionNote(drag.dialog, event.clientX - drag.offsetX, event.clientY - drag.offsetY);
  });
  for (const name of ["pointerup", "pointercancel"] as const) {
    window.addEventListener(name, (event) => {
      if (drag?.pointerId === event.pointerId) stopDrag();
    });
  }
  window.addEventListener("blur", stopDrag);
  window.addEventListener("resize", () => {
    stopDrag();
    if (!active || closing || !active.classList.contains("is-positioned")) return;
    positionNote(active, Number.parseFloat(active.style.left), Number.parseFloat(active.style.top));
  });

  document.querySelector<HTMLAnchorElement>("[data-documents-back]")?.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const link = event.currentTarget as HTMLAnchorElement;
    try {
      const previous = new URL(document.referrer);
      const destination = new URL(link.href);
      if (history.length > 1 && previous.origin === destination.origin && previous.pathname === destination.pathname) {
        event.preventDefault();
        history.back();
      }
    } catch {
      // Direct article visits use the ordinary archive link.
    }
  });

  reducedMotion.addEventListener("change", () => {
    if (closing && reducedMotion.matches) finishClose();
  });
  return { close };
};
