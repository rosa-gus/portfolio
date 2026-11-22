export const initializeGameCredits = () => {
  const leaders = document.querySelectorAll<HTMLElement>("[data-credit-leader]");
  if (!leaders.length) return;

  const glyph = document.createRange();
  const fill = (leader: Element) => {
    const width = leader.getBoundingClientRect().width;
    const text = leader.firstChild;
    if (width <= 0 || !(text instanceof Text)) return;

    if (!text.length) text.data = ".";
    glyph.setStart(text, 0);
    glyph.setEnd(text, 1);
    const dotWidth = glyph.getBoundingClientRect().width;
    if (dotWidth <= 0) return;

    const dots = ".".repeat(Math.floor(width / dotWidth));
    if (text.data !== dots) text.data = dots;
  };

  const refresh = () => leaders.forEach(fill);
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(entries => entries.forEach(({ target }) => fill(target)));
    leaders.forEach(leader => observer.observe(leader));
  } else {
    window.addEventListener("resize", refresh);
  }
  refresh();
  void document.fonts?.ready.then(refresh);
};
