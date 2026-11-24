export const initializeAboutStudy = () => {
  const media = document.querySelector<HTMLElement>("[data-about-media]");
  const image = media?.querySelector<HTMLImageElement>("[data-about-image]");
  const video = media?.querySelector<HTMLVideoElement>("[data-about-video]");

  if (media && image && video) {
    const setFrameSize = (frame: HTMLElement, width: number, height: number) => {
      if (!width || !height) return;
      // Map each encoded pixel to one physical display pixel.
      const ratio = window.devicePixelRatio;
      frame.style.setProperty("--about-frame-width", `${width / ratio}px`);
      frame.style.setProperty("--about-frame-height", `${height / ratio}px`);
      frame.setAttribute("data-about-native-size", "");
    };
    const sizeImage = () => setFrameSize(image, image.naturalWidth, image.naturalHeight);
    const sizeVideo = () => setFrameSize(video, video.videoWidth, video.videoHeight);
    const trackPixelRatio = () => {
      const ratio = window.devicePixelRatio;
      media.style.setProperty("--about-device-pixel", `${1 / ratio}px`);
      sizeImage();
      sizeVideo();
      window.matchMedia(`(resolution: ${ratio}dppx)`).addEventListener(
        "change", trackPixelRatio, { once: true },
      );
    };

    image.addEventListener("load", sizeImage);
    video.addEventListener("resize", sizeVideo);
    trackPixelRatio();
  }

  const study = document.querySelector<HTMLDetailsElement>(".about-study");
  if (!study) return;

  document.addEventListener("click", (event) => {
    if (
      study.open &&
      event.target instanceof Node &&
      !study.contains(event.target)
    ) {
      study.open = false;
    }
  });
};
