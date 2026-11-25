export const initializeTextLeaders = () => {
  const leaders = document.querySelectorAll("[data-credit-leader], [data-text-leader]");
  if (!leaders.length) return;

  const glyph = document.createRange();
  const fill = (leader: Element) => {
    const width = leader.getBoundingClientRect().width;
    const text = leader.firstChild;
    if (width <= 0 || !(text instanceof Text)) return;
    const mark = leader.getAttribute("data-text-leader") || ".";

    if (!text.length) text.data = mark;
    glyph.setStart(text, 0);
    glyph.setEnd(text, 1);
    const glyphWidth = glyph.getBoundingClientRect().width;
    if (glyphWidth <= 0) return;

    const line = mark.repeat(Math.floor(width / glyphWidth));
    if (text.data !== line) text.data = line;
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
