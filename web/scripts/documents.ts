export const initializeDocuments = () => {
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
};
