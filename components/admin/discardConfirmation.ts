"use client";

let activeDialog: HTMLDialogElement | null = null;

/** A document-owned modal also works above a mobile inspector dialog. It
 * deliberately uses textContent, never HTML from editor copy. */
export function requestDiscardConfirmation(message: string, signal?: AbortSignal): Promise<boolean> {
  if (activeDialog || signal?.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    const dialog = document.createElement("dialog");
    activeDialog = dialog;
    dialog.className = "m-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-3xl border border-white/15 bg-[#121214] p-6 text-white shadow-2xl backdrop:bg-black/75";
    dialog.setAttribute("aria-labelledby", "editor-discard-title");
    dialog.setAttribute("aria-describedby", "editor-discard-description");
    const title = document.createElement("h2");
    title.id = "editor-discard-title";
    title.className = "text-lg font-semibold";
    title.textContent = "Discard unsaved changes?";
    const description = document.createElement("p");
    description.id = "editor-discard-description";
    description.className = "mt-3 text-sm leading-6 text-white/65";
    description.textContent = message;
    const buttons = document.createElement("div");
    buttons.className = "mt-6 flex flex-wrap justify-end gap-3";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Keep editing";
    cancel.className = "min-h-11 rounded-xl border border-white/25 px-4 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
    const discard = document.createElement("button");
    discard.type = "button";
    discard.textContent = "Discard changes";
    discard.className = "min-h-11 rounded-xl bg-[#ff806c] px-4 text-sm font-semibold text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
    let settled = false;
    function finish(accepted: boolean) {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      dialog.close();
      dialog.remove();
      activeDialog = null;
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
      resolve(accepted);
    }
    const abort = () => finish(false);
    cancel.addEventListener("click", () => finish(false));
    discard.addEventListener("click", () => finish(true));
    dialog.addEventListener("cancel", (event) => { event.preventDefault(); finish(false); });
    dialog.addEventListener("close", () => finish(false));
    signal?.addEventListener("abort", abort, { once: true });
    buttons.append(cancel, discard);
    dialog.append(title, description, buttons);
    document.body.append(dialog);
    try {
      dialog.showModal();
      document.body.style.overflow = "hidden";
      cancel.focus();
    } catch {
      finish(false);
    }
  });
}
