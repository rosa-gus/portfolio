export const initializeAboutStudy = () => {
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
