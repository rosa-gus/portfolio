const DEBUG_COMPLAINTS = false;
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
    record(ids: number[], now: number) {
      const pushed = [...new Set(ids)];
      if (debug) {
        if (!pushed.length || now < nextAllowed) return null;
        nextAllowed = now + 4_500;
        return { id: pushed[0], ...returnHomeComplaint };
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
            state.pushes >= 3 &&
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
    active?.classList.remove("is-nauseous");
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
      !enabled.matches ||
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
  window.addEventListener("blur", finishHide);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) finishHide();
  });
  return {
    record(itemsPushed: HTMLElement[]) {
      if (!enabled.matches || surface.inert || surface.closest("[hidden]"))
        return;
      const complaint = policy.record(
        itemsPushed.map((item) => items.indexOf(item)).filter((id) => id >= 0),
        performance.now(),
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
      // Reveal on the next frame so the short fade starts from opacity zero.
      window.requestAnimationFrame(() => {
        if (active) balloon.classList.add("is-visible");
      });
      timer = window.setTimeout(hide, 4_000);
    },
    hide: finishHide,
    reset() {
      finishHide();
      policy.resetCounts();
    },
  };
};
