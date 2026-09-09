import EmblaCarousel from "embla-carousel";

const initializedGalleries = new WeakSet<HTMLElement>();
let imageViewerInitialized = false;
let imageViewerTrigger: HTMLElement | null = null;

const openProjectImageViewer = (image: HTMLImageElement, label: string) => {
  const viewer = document.querySelector<HTMLDialogElement>(
    "[data-project-image-viewer]",
  );
  const viewerImage = viewer?.querySelector<HTMLImageElement>(
    "[data-project-image-viewer-image]",
  );
  const viewerTitle = viewer?.querySelector<HTMLElement>(
    "[data-project-image-viewer-title]",
  );
  if (!viewer || !viewerImage || viewer.open) return;

  imageViewerTrigger =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  viewerImage.src = image.currentSrc || image.src;
  viewerImage.alt = image.alt;
  if (viewerTitle) viewerTitle.textContent = label || "Imagem do projeto";
  viewer.showModal();
  viewer
    .querySelector<HTMLButtonElement>("[data-project-image-viewer-close]")
    ?.focus();
};

export const initializeProjectImageViewer = () => {
  if (imageViewerInitialized) return;

  const viewer = document.querySelector<HTMLDialogElement>(
    "[data-project-image-viewer]",
  );
  const closeButton = viewer?.querySelector<HTMLButtonElement>(
    "[data-project-image-viewer-close]",
  );
  const viewerImage = viewer?.querySelector<HTMLImageElement>(
    "[data-project-image-viewer-image]",
  );
  const viewerTitle = viewer?.querySelector<HTMLElement>(
    "[data-project-image-viewer-title]",
  );
  if (!viewer || !closeButton || !viewerImage) return;

  imageViewerInitialized = true;
  closeButton.addEventListener("click", () => viewer.close());
  viewer.addEventListener("close", () => {
    viewerImage.removeAttribute("src");
    viewerImage.alt = "";
    if (viewerTitle) viewerTitle.textContent = "Imagem do projeto";
    imageViewerTrigger?.focus();
    imageViewerTrigger = null;
  });
};

export const initializeProjectGalleries = (root: ParentNode = document) => {
  root
    .querySelectorAll<HTMLElement>("[data-project-gallery]")
    .forEach((gallery) => {
      if (initializedGalleries.has(gallery)) return;
      if (gallery.closest<HTMLElement>("[data-project-panel]")?.hidden) return;

      const viewport = gallery.querySelector<HTMLElement>(
        "[data-gallery-viewport]",
      );
      const slides = Array.from(
        gallery.querySelectorAll<HTMLElement>("[data-gallery-slide]"),
      );
      const counter = gallery.querySelector<HTMLElement>(
        "[data-gallery-counter]",
      );
      const expandButton = gallery.querySelector<HTMLButtonElement>(
        "[data-gallery-expand]",
      );
      const previousButton = gallery.querySelector<HTMLButtonElement>(
        "[data-gallery-prev]",
      );
      const nextButton = gallery.querySelector<HTMLButtonElement>(
        "[data-gallery-next]",
      );
      if (!viewport || slides.length === 0) return;

      initializedGalleries.add(gallery);
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      );
      const carousel = EmblaCarousel(viewport, {
        align: "start",
        containScroll: "trimSnaps",
        direction: "ltr",
        duration: reducedMotion.matches ? 0 : 24,
        loop: false,
        watchFocus: false,
      });

      const updateGallery = () => {
        const selectedIndex = carousel.selectedScrollSnap();
        slides.forEach((slide, index) => {
          slide.setAttribute("aria-hidden", String(index !== selectedIndex));
        });
        if (counter) {
          counter.textContent = `${String(selectedIndex + 1).padStart(2, "0")} / ${String(slides.length).padStart(2, "0")}`;
        }
        if (previousButton) previousButton.disabled = !carousel.canScrollPrev();
        if (nextButton) nextButton.disabled = !carousel.canScrollNext();
        if (expandButton) {
          const label = slides[selectedIndex]
            ?.querySelector<HTMLElement>(".project-gallery__label")
            ?.textContent?.trim();
          expandButton.setAttribute(
            "aria-label",
            label ? `Ampliar ${label}` : "Ampliar imagem selecionada",
          );
        }
      };

      carousel.on("select", updateGallery);
      carousel.on("reInit", updateGallery);
      previousButton?.addEventListener("click", () => carousel.scrollPrev());
      nextButton?.addEventListener("click", () => carousel.scrollNext());
      expandButton?.addEventListener("click", () => {
        const selectedSlide = slides[carousel.selectedScrollSnap()];
        const selectedImage = selectedSlide?.querySelector<HTMLImageElement>(
          ".project-gallery__image",
        );
        const label =
          selectedSlide
            ?.querySelector<HTMLElement>(".project-gallery__label")
            ?.textContent?.trim() ?? "";
        if (selectedImage) openProjectImageViewer(selectedImage, label);
      });
      updateGallery();
    });
};
