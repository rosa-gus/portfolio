import { dismissWindowHelp, fitWindowMedia, initializeWindowLayout } from "./window-layout";

type WindowFeature = (dialog: HTMLDialogElement) => { open: () => void };
type WindowOptions = {
  beforeOpen?: () => void;
  loadFeatures?: Record<string, () => Promise<WindowFeature>>;
};

const syncWindowURL = (id: string | undefined, open: boolean) => {
  if (!id) return;

  const url = new URL(window.location.href);
  const isInURL = url.searchParams.get("open") === id;
  if (isInURL === open) return;
  if (open) url.searchParams.set("open", id);
  else url.searchParams.delete("open");
  window.history.replaceState(window.history.state, "", url);
};

export const initializeWindows = ({ beforeOpen, loadFeatures }: WindowOptions = {}) => {
  initializeWindowLayout();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const recordViewport = window.matchMedia("(min-width: 48rem)");
  const windows = Array.from(document.querySelectorAll<HTMLDialogElement>("dialog[data-window]"));
  let active: HTMLDialogElement | null = null;
  let trigger: HTMLElement | null = null;
  let openID: string | undefined;
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

  const positionWindow = (dialog: HTMLDialogElement, left: number, top: number) => {
    const margin = 16;
    const topMargin = dialog.dataset.windowDecoration === "tab" ? 40 : margin;
    const shadow = 7;
    const maxLeft = Math.max(margin, window.innerWidth - dialog.offsetWidth - margin - shadow);
    const maxTop = Math.max(topMargin, window.innerHeight - dialog.offsetHeight - margin - shadow);
    dialog.classList.add("is-positioned");
    dialog.style.left = `${Math.min(maxLeft, Math.max(margin, left))}px`;
    dialog.style.top = `${Math.min(maxTop, Math.max(topMargin, top))}px`;
  };

  const enableDrag = (dialog: HTMLDialogElement, available: () => boolean) => {
    const handle = dialog.querySelector<HTMLElement>("[data-window-handle]");
    handle?.addEventListener("pointerdown", (event) => {
      if (!available() || !event.isPrimary || event.button !== 0) return;
      if (event.target instanceof Element && event.target.closest("a, button, input, select, textarea")) return;
      event.preventDefault();
      stopDrag();
      dialog.classList.add("is-dragging");
      const rect = dialog.getBoundingClientRect();
      positionWindow(dialog, rect.left, rect.top);
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
      if (drag?.handle === handle && drag.pointerId === event.pointerId) stopDrag();
    });
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
    syncWindowURL(openID, false);
    openID = undefined;
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

  const open = (dialog: HTMLDialogElement, source: HTMLElement | null, id?: string) => {
    close(false, true);
    beforeOpen?.();
    active = dialog;
    trigger = source;
    openID = id;
    returnFocus = true;
    dialog.showModal();
    syncWindowURL(openID, true);
    fitWindowMedia(dialog);
    dialog.dispatchEvent(new Event("popup:open"));
    const viewport = dialog.querySelector<HTMLElement>("[data-scroll-area-viewport]");
    if (viewport) viewport.scrollTop = 0;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      if (active !== dialog || closing) return;
      dialog.classList.add("is-open");
      dialog.querySelector<HTMLButtonElement>("[data-window-close]")?.focus({ preventScroll: true });
    });
  };

  const openApp = (id: string, source: HTMLElement | null = null) => {
    const dialog = windows.find((item) => item.dataset.popup === id);
    if (!dialog) return false;
    open(dialog, source, id);
    return true;
  };

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || !(event.target instanceof Element)) return;
    const source = event.target.closest<HTMLElement>("[data-window-trigger]");
    if (source) {
      const dialog = windows.find((item) => item.id === source.dataset.windowTrigger);
      if (!dialog) return;
      const { archiveId, popupTrigger, documentNoteTrigger } = source.dataset;
      const syncURL = popupTrigger !== undefined || documentNoteTrigger !== undefined;
      open(dialog, source, syncURL ? archiveId : undefined);
      return;
    }

    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest<HTMLAnchorElement>('a[href^="?open="]');
    if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download") || link.hash) return;
    const params = new URLSearchParams(link.search);
    const appID = params.get("open");
    if (params.size === 1 && appID && openApp(appID, link)) event.preventDefault();
  });

  windows.forEach((dialog) => {
    const available = () => active === dialog && dialog.open && !closing;
    enableDrag(dialog, available);
    const record = dialog.querySelector<HTMLDialogElement>("[data-window-record]");
    const recordToggle = dialog.querySelector<HTMLButtonElement>("[data-window-record-toggle]");
    const closeButton = dialog.querySelector<HTMLButtonElement>("[data-window-close]");
    const dismissRecord = (focusTarget: HTMLElement | null = recordToggle) => {
      if (!record?.open) return false;
      if (drag?.dialog === record) stopDrag();
      record.close();
      record.classList.remove("is-open", "is-positioned", "is-behind");
      record.style.removeProperty("left");
      record.style.removeProperty("top");
      recordToggle?.setAttribute("aria-expanded", "false");
      focusTarget?.focus({ preventScroll: true });
      return true;
    };

    if (record && recordToggle) {
      const recordClose = record.querySelector<HTMLButtonElement>("[data-window-close]");
      recordToggle.addEventListener("click", () => {
        if (!available() || !recordViewport.matches) return;
        if (!record.open) {
          record.show();
          const parent = dialog.getBoundingClientRect();
          const gap = 16;
          const edge = 23;
          const fitsRight = parent.right + gap + record.offsetWidth <= window.innerWidth - edge;
          const fitsLeft = parent.left - gap - record.offsetWidth >= edge;
          const left = fitsRight ? parent.right + gap : fitsLeft ? parent.left - gap - record.offsetWidth : parent.right;
          positionWindow(record, left, parent.top + (fitsRight || fitsLeft ? 24 : 72));
          record.classList.add("is-open");
          recordToggle.setAttribute("aria-expanded", "true");
        }
        record.classList.remove("is-behind");
        recordClose?.focus({ preventScroll: true });
      });
      const updateStack = (event: Event) => {
        if (record.open && event.target instanceof Element) {
          record.classList.toggle("is-behind", !record.contains(event.target));
        }
      };
      dialog.addEventListener("pointerdown", updateStack);
      dialog.addEventListener("focusin", updateStack);
      record.addEventListener("keydown", event => event.stopPropagation());
      recordClose?.addEventListener("click", () => dismissRecord());
      enableDrag(record, () => available() && record.open);
      dialog.addEventListener("popup:closing", () => dismissRecord(null));
      dialog.addEventListener("popup:open", () => dismissRecord(null));
      recordViewport.addEventListener("change", () => {
        if (!recordViewport.matches) {
          const restoreFocus = record.contains(document.activeElement) || document.activeElement === recordToggle;
          dismissRecord(null);
          if (restoreFocus) closeButton?.focus({ preventScroll: true });
        }
      });
    }
    const loadFeature = loadFeatures?.[dialog.id];
    if (loadFeature) {
      let feature: ReturnType<WindowFeature> | undefined;
      let loading = false;
      dialog.addEventListener("popup:open", () => {
        if (feature) { feature.open(); return; }
        if (loading) return;
        loading = true;
        const status = dialog.querySelector<HTMLElement>("[data-window-feature-status]");
        if (status) status.textContent = "Carregando…";
        void loadFeature().then(create => {
          if (active !== dialog || closing || !dialog.open) return;
          feature = create(dialog);
          feature.open();
        }).catch(() => {
          if (status) status.textContent = "Não foi possível carregar. Feche e tente novamente.";
        }).finally(() => { loading = false; });
      });
    }
    dialog.addEventListener("window:layout", () => {
      if (active !== dialog || closing || !dialog.classList.contains("is-positioned")) return;
      positionWindow(dialog, Number.parseFloat(dialog.style.left), Number.parseFloat(dialog.style.top));
    });
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      if (dismissRecord()) return;
      if (dismissWindowHelp(dialog)) return;
      close();
    });
    closeButton?.addEventListener("click", () => close());
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) close();
    });
    dialog.addEventListener("close", () => {
      if (dialog.open) return;
      dismissRecord(null);
      if (active === dialog) finishClose();
    });
  });

  window.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId || closing) return;
    event.preventDefault();
    positionWindow(drag.dialog, event.clientX - drag.offsetX, event.clientY - drag.offsetY);
  });
  for (const name of ["pointerup", "pointercancel"] as const) {
    window.addEventListener(name, (event) => {
      if (drag?.pointerId === event.pointerId) stopDrag();
    });
  }
  window.addEventListener("blur", stopDrag);
  window.addEventListener("resize", () => {
    stopDrag();
    if (!active || closing) return;
    if (active.classList.contains("is-positioned")) {
      positionWindow(active, Number.parseFloat(active.style.left), Number.parseFloat(active.style.top));
    }
    const record = active.querySelector<HTMLDialogElement>("[data-window-record]");
    if (record?.open) positionWindow(record, Number.parseFloat(record.style.left), Number.parseFloat(record.style.top));
  });

  reducedMotion.addEventListener("change", () => {
    if (closing && reducedMotion.matches) finishClose();
  });
  return { close, openApp };
};
