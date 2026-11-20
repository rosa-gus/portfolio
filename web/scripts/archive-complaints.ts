const DEBUG_COMPLAINTS = false;
const tapComplaint = { text: "tá batendo por quê?" };
const nauseaComplaint = {
  text: "fiquei com náusea...",
  effect: "nauseous" as const,
};
const returnHomeComplaint = {
  text: "quer saber? vou embora!",
  effect: "return-home" as const,
};

const phrases: { text: string; effect?: "nauseous" | "return-home" }[] = [
  { text: "me deixa em paz!" },
  { text: "para com isso!" },
  { text: "por que eu?" },
  { text: "eu tava bem ali." },
  { text: "de novo?" },
  { text: "O coração, se pudesse pensar, pararia." },
  nauseaComplaint,
  returnHomeComplaint,
];

export const createComplaintPolicy = (
  random = Math.random,
  debug = DEBUG_COMPLAINTS,
) => {
  const documents = new Map<
    number,
    { pushes: number; shown: number; lastShown: number }
  >();
  let nextAllowed = 0;
  let totalShown = 0;
  let lastPhrase = -1;

  return {
    record(ids: number[], now: number, trigger: "drag" | "tap" = "drag") {
      const pushed = [...new Set(ids)];
      if (debug) {
        if (!pushed.length || now < nextAllowed) return null;
        nextAllowed = now + 4_500;
        return { id: pushed[0], ...(trigger === "tap" ? tapComplaint : returnHomeComplaint) };
      }
      for (const id of pushed) {
        const state = documents.get(id) ?? {
          pushes: 0,
          shown: 0,
          lastShown: -Infinity,
        };
        state.pushes++;
        documents.set(id, state);
      }
      if (now < nextAllowed || totalShown >= 8) return null;
      const eligible = pushed
        .filter((id) => {
          const state = documents.get(id)!;
          return (
            (trigger === "tap" || state.pushes >= 3) &&
            state.shown < 4 &&
            now - state.lastShown >= 15_000
          );
        })
        .sort((a, b) => documents.get(b)!.pushes - documents.get(a)!.pushes);
      if (!eligible.length) return null;
      const id = eligible[0];
      const state = documents.get(id)!;
      state.pushes = 0;
      state.shown++;
      state.lastShown = now;
      nextAllowed = now + 8_000;
      totalShown++;
      if (trigger === "tap") return { id, ...tapComplaint };
      const choices = phrases
        .map((_, index) => index)
        .filter((index) => index !== lastPhrase);
      lastPhrase = choices[Math.floor(random() * choices.length)];
      return { id, ...phrases[lastPhrase] };
    },
    resetCounts() {
      // Restoring the grid does not reset cooldowns or the limit for this visit.
      documents.forEach((state) => {
        state.pushes = 0;
      });
    },
  };
};

export const initializeArchiveComplaints = (
  surface: HTMLElement,
  viewport: HTMLElement,
  items: HTMLElement[],
  enabled: MediaQueryList,
  returnToOrigin: (item: HTMLElement) => boolean,
) => {
  const policy = createComplaintPolicy();
  const mobile = window.matchMedia("(max-width: 900px) and (pointer: coarse)");
  const balloon = document.createElement("div");
  balloon.className = "project-archive__complaint";
  balloon.setAttribute("role", "status");
  balloon.setAttribute("aria-atomic", "true");
  balloon.hidden = true;
  document.body.append(balloon);
  let active: HTMLElement | null = null;
  let frame = 0;
  let timer = 0;
  let returnHomeItem: HTMLElement | null = null;

  const finishHide = () => {
    window.clearTimeout(timer);
    window.cancelAnimationFrame(frame);
    frame = 0;
    active?.classList.remove("is-nauseous", "is-complaining");
    active = null;
    returnHomeItem = null;
    balloon.hidden = true;
    balloon.textContent = "";
    balloon.classList.remove("is-visible");
  };
  const hide = () => {
    window.clearTimeout(timer);
    balloon.classList.remove("is-visible");
    timer = window.setTimeout(() => {
      const returning = returnHomeItem;
      finishHide();
      if (returning) returnToOrigin(returning);
    }, 140);
  };

  const follow = () => {
    if (
      !active ||
      document.hidden ||
      !(enabled.matches || mobile.matches) ||
      surface.inert ||
      surface.closest("[hidden]") ||
      document.querySelector("dialog[open]")
    ) {
      finishHide();
      return;
    }
    const icon =
      active.querySelector<HTMLElement>(".project-archive__item-icon") ??
      active;
    const rect = icon.getBoundingClientRect();
    const bounds = viewport.getBoundingClientRect();
    if (
      !rect.width ||
      rect.bottom <= Math.max(0, bounds.top) ||
      rect.top >= Math.min(window.innerHeight, bounds.bottom) ||
      rect.right <= bounds.left ||
      rect.left >= bounds.right
    ) {
      finishHide();
      return;
    }
    const width = balloon.offsetWidth;
    const height = balloon.offsetHeight;
    const center = rect.left + rect.width / 2;
    const left = Math.max(
      12,
      Math.min(window.innerWidth - width - 12, center - 22),
    );
    const above = rect.top - height - 10 >= 12;
    const top = Math.max(
      12,
      Math.min(
        window.innerHeight - height - 12,
        above ? rect.top - height - 10 : rect.bottom + 10,
      ),
    );
    balloon.dataset.placement = above ? "above" : "below";
    balloon.style.left = `${left}px`;
    balloon.style.top = `${top}px`;
    balloon.style.setProperty(
      "--complaint-tail-x",
      `${Math.max(9, Math.min(width - 10, center - left))}px`,
    );
    frame = window.requestAnimationFrame(follow);
  };

  enabled.addEventListener("change", finishHide);
  mobile.addEventListener("change", finishHide);
  window.addEventListener("blur", finishHide);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) finishHide();
  });
  const record = (itemsPushed: HTMLElement[], trigger: "drag" | "tap" = "drag") => {
    if (!(trigger === "tap" ? mobile.matches : enabled.matches) || document.hidden || surface.inert || surface.closest("[hidden]") || document.querySelector("dialog[open]"))
      return;
    const complaint = policy.record(
      itemsPushed.map((item) => items.indexOf(item)).filter((id) => id >= 0),
      performance.now(),
      trigger,
    );
    if (!complaint) return;
    finishHide();
    active = items[complaint.id];
    active.classList.toggle("is-nauseous", complaint.effect === "nauseous");
    balloon.hidden = false;
    balloon.textContent = complaint.text;
    if (complaint.effect === "return-home") returnHomeItem = active;
    follow();
    if (!active) return;
    active.classList.add("is-complaining");
    // Reveal on the next frame so the short fade starts from opacity zero.
    window.requestAnimationFrame(() => {
      if (active) balloon.classList.add("is-visible");
    });
    timer = window.setTimeout(hide, 4_000);
  };

  const taps = createComplaintTapGesture();
  const tapTarget = surface.closest("[data-project-archive]")?.querySelector("[data-archive-complaint-trigger]");
  document.addEventListener("pointerdown", (event) => {
    if (!mobile.matches || event.pointerType !== "touch" || !event.isPrimary || event.target !== tapTarget || surface.inert || surface.closest("[hidden]") || document.querySelector("dialog[open]")) {
      taps.reset();
      return;
    }
    taps.start(event.pointerId, event.clientX, event.clientY, performance.now());
  });
  window.addEventListener("pointermove", (event) => taps.move(event.pointerId, event.clientX, event.clientY), { passive: true });
  window.addEventListener("pointerup", (event) => {
    if (!taps.end(event.pointerId, event.clientX, event.clientY, performance.now())) return;
    const bounds = viewport.getBoundingClientRect();
    const visible = items.filter((item) => {
      const rect = item.getBoundingClientRect();
      return rect.width > 0 && rect.bottom > Math.max(0, bounds.top) && rect.top < Math.min(window.innerHeight, bounds.bottom) && rect.right > Math.max(0, bounds.left) && rect.left < Math.min(window.innerWidth, bounds.right);
    });
    if (visible.length) {
      const first = Math.floor(Math.random() * visible.length);
      record([...visible.slice(first), ...visible.slice(0, first)], "tap");
    }
  });
  window.addEventListener("pointercancel", () => taps.reset());
  document.addEventListener("scroll", () => taps.reset(), { capture: true, passive: true });
  window.addEventListener("blur", () => taps.reset());
  document.addEventListener("visibilitychange", () => taps.reset());
  mobile.addEventListener("change", () => taps.reset());

  return {
    record,
    hide: finishHide,
    reset() {
      finishHide();
      policy.resetCounts();
      taps.reset();
    },
  };
};

// Observe taps without capturing the pointer or cancelling native scrolling.
export const createComplaintTapGesture = () => {
  let count = 0;
  let lastTap = -Infinity;
  let pointer: { id: number; x: number; y: number; time: number } | null = null;
  const reset = () => { count = 0; lastTap = -Infinity; pointer = null; };
  const move = (id: number, x: number, y: number) => {
    if (pointer?.id === id && Math.hypot(x - pointer.x, y - pointer.y) > 12) reset();
  };
  return {
    reset,
    start(id: number, x: number, y: number, now: number) {
      if (pointer || now - lastTap > 450) reset();
      pointer = { id, x, y, time: now };
    },
    move,
    end(id: number, x: number, y: number, now: number) {
      move(id, x, y);
      if (!pointer || pointer.id !== id) return false;
      if (now - pointer.time > 300) { reset(); return false; }
      pointer = null;
      lastTap = now;
      if (++count < 5) return false;
      reset();
      return true;
    },
  };
};
