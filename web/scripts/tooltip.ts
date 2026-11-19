// CSS handles the responsive corners, hover and focus. JavaScript only handles
// dismissal, keeping Escape effective until the next deliberate interaction.
export const initializeTooltips = () => {
  const tooltips = Array.from(document.querySelectorAll<HTMLElement>("[data-tooltip]"));
  if (!tooltips.length) return;

  tooltips.forEach((tooltip) => {
    const resetDismissal = () => {
      delete tooltip.dataset.tooltipDismissed;
    };
    tooltip.addEventListener("pointerenter", resetDismissal);
    tooltip.addEventListener("focusin", resetDismissal);
    tooltip.addEventListener("pointerleave", () => {
      if (!tooltip.contains(document.activeElement)) resetDismissal();
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    tooltips.forEach((tooltip) => {
      if (tooltip.matches(":hover, :focus-within")) tooltip.dataset.tooltipDismissed = "";
    });
  });
};
