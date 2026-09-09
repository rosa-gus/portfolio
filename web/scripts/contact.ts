const copyWithFallback = (value: string) => {
  const field = document.createElement("textarea");
  field.value = value;
  field.readOnly = true;
  field.style.position = "fixed";
  field.style.opacity = "0";
  field.style.pointerEvents = "none";
  document.body.append(field);
  field.select();

  const copied = document.execCommand("copy");
  field.remove();
  if (!copied) throw new Error("copy command unavailable");
};

const copyText = async (value: string) => {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Some browsers expose Clipboard API but deny it outside a secure context.
    }
  }
  copyWithFallback(value);
};

export const initializeContactCopy = () => {
  const button = document.querySelector<HTMLButtonElement>(
    "[data-contact-copy]",
  );
  const status = document.querySelector<HTMLElement>(
    "[data-contact-copy-status]",
  );
  const email = button?.dataset.copyValue;
  if (!button || !status || !email) return;

  button.hidden = false;

  let resetTimer: number | undefined;
  const reset = () => {
    button.textContent = "[COPIAR]";
    status.textContent = "";
  };

  button.addEventListener("click", async () => {
    window.clearTimeout(resetTimer);
    try {
      await copyText(email);
      button.textContent = "[COPIADO]";
      status.textContent = "E-mail copiado para a área de transferência.";
    } catch {
      button.textContent = "[TENTE NOVAMENTE]";
      status.textContent = "Não foi possível copiar. Selecione o endereço acima.";
    }
    resetTimer = window.setTimeout(reset, 3500);
  });
};
