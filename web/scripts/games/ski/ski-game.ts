// Copyright (c) 2026 rosa gus. SPDX-License-Identifier: GPL-3.0-only
/** Small archive entry point; assets and the game load only when opened. */
export const initializeSkiGame = () => {
  const dialog = document.querySelector<HTMLDialogElement>('[data-popup="ski"]');
  if (!dialog) return;
  const toggle = dialog.querySelector<HTMLButtonElement>("[data-ski-toggle]")!;
  const message = dialog.querySelector<HTMLElement>("[data-ski-message-text]")!;
  let session: { open: () => void } | undefined;
  let loading: Promise<void> | undefined;
  dialog.addEventListener("popup:open", () => {
    if (session) { session.open(); return; }
    toggle.disabled = true;
    dialog.querySelector<HTMLElement>("[data-ski-message]")!.hidden = false;
    message.textContent = "Preparando a descida…";
    loading ??= import("./ski-session").then(async ({ createSkiSession }) => {
      session = await createSkiSession(dialog);
      if (dialog.open && !dialog.inert) session.open();
    }).catch(() => {
      message.textContent = "Não foi possível carregar. Feche e tente novamente.";
      loading = undefined;
    });
  });
};
