import EmblaCarousel from "embla-carousel";

const initializedGalleries = new WeakSet<HTMLElement>();
let imageViewerInitialized = false;
let imageViewerTrigger: HTMLElement | null = null;

type ImageViewerSession = {
  slides: HTMLElement[];
  index: number;
  select: (index: number) => void;
};
let imageViewerSession: ImageViewerSession | null = null;

const renderProjectImageViewer = (viewer: HTMLDialogElement) => {
  const session = imageViewerSession;
  if (!session) return;
  const slide = session.slides[session.index];
  const image = slide?.querySelector<HTMLImageElement>(".project-gallery__image");
  const viewerImage = viewer.querySelector<HTMLImageElement>("[data-project-image-viewer-image]");
  if (!image || !viewerImage) return;

  viewerImage.src = image.currentSrc || image.src;
  viewerImage.alt = image.alt;
  const label = slide.querySelector<HTMLElement>(".project-gallery__label")?.textContent?.trim();
  const description = slide.querySelector<HTMLElement>(".project-gallery__description")?.textContent?.trim();
  const note = slide.querySelector<HTMLElement>(".project-gallery__note")?.textContent?.trim();
  const title = viewer.querySelector<HTMLElement>("[data-project-image-viewer-title]");
  const caption = viewer.querySelector<HTMLElement>("[data-project-image-viewer-description]");
  const viewerNote = viewer.querySelector<HTMLElement>("[data-project-image-viewer-note]");
  const counter = viewer.querySelector<HTMLElement>("[data-project-image-viewer-counter]");
  const previous = viewer.querySelector<HTMLButtonElement>("[data-project-image-viewer-prev]");
  const next = viewer.querySelector<HTMLButtonElement>("[data-project-image-viewer-next]");
  if (title) title.textContent = label || "Imagem do projeto";
  if (caption) caption.textContent = description || "";
  if (viewerNote) {
    viewerNote.textContent = note || "";
    viewerNote.hidden = !note;
  }
  if (counter) counter.textContent = `${String(session.index + 1).padStart(2, "0")} / ${String(session.slides.length).padStart(2, "0")}`;
  if (previous) previous.disabled = session.index === 0;
  if (next) next.disabled = session.index === session.slides.length - 1;
  viewer.querySelector<HTMLElement>("[data-scroll-area-viewport]")?.scrollTo({ top: 0 });
};

const moveProjectImageViewer = (viewer: HTMLDialogElement, direction: number) => {
  const session = imageViewerSession;
  if (!session) return;
  const next = session.index + direction;
  if (next < 0 || next >= session.slides.length) return;
  session.index = next;
  session.select(next);
  renderProjectImageViewer(viewer);
};

const openProjectImageViewer = (
  gallery: HTMLElement,
  slides: HTMLElement[],
  index: number,
  select: (index: number) => void,
) => {
  const viewer = document.querySelector<HTMLDialogElement>("[data-project-image-viewer]");
  if (!viewer || viewer.open || !slides[index]) return;
  imageViewerTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  imageViewerSession = { slides, index, select };
  const tone = getComputedStyle(gallery).getPropertyValue("--project-tone").trim();
  if (tone) viewer.style.setProperty("--project-tone", tone);
  else viewer.style.removeProperty("--project-tone");
  renderProjectImageViewer(viewer);
  viewer.showModal();
  viewer.querySelector<HTMLButtonElement>("[data-project-image-viewer-close]")?.focus({ preventScroll: true });
};

export const initializeProjectImageViewer = () => {
  if (imageViewerInitialized) return;
  const viewer = document.querySelector<HTMLDialogElement>("[data-project-image-viewer]");
  const closeButton = viewer?.querySelector<HTMLButtonElement>("[data-project-image-viewer-close]");
  if (!viewer || !closeButton) return;

  imageViewerInitialized = true;
  closeButton.addEventListener("click", () => viewer.close());
  viewer.querySelector<HTMLButtonElement>("[data-project-image-viewer-prev]")
    ?.addEventListener("click", () => moveProjectImageViewer(viewer, -1));
  viewer.querySelector<HTMLButtonElement>("[data-project-image-viewer-next]")
    ?.addEventListener("click", () => moveProjectImageViewer(viewer, 1));
  viewer.addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    moveProjectImageViewer(viewer, event.key === "ArrowLeft" ? -1 : 1);
  });
  viewer.addEventListener("close", () => {
    const image = viewer.querySelector<HTMLImageElement>("[data-project-image-viewer-image]");
    image?.removeAttribute("src");
    if (image) image.alt = "";
    const title = viewer.querySelector<HTMLElement>("[data-project-image-viewer-title]");
    if (title) title.textContent = "Imagem do projeto";
    imageViewerSession = null;
    imageViewerTrigger?.focus({ preventScroll: true });
    imageViewerTrigger = null;
  });
};

export const initializeProjectGalleries = (root: ParentNode = document) => {
  root
    .querySelectorAll<HTMLElement>("[data-project-gallery]")
    .forEach((gallery) => {
      if (initializedGalleries.has(gallery)) return;

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
        openProjectImageViewer(gallery, slides, carousel.selectedScrollSnap(),
          (index) => carousel.scrollTo(index, true));
      });
      updateGallery();
    });
};
