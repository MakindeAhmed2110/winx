const PRIVY_NODES =
  '#privy-dialog, #privy-dialog-backdrop, #privy-modal-content, [data-privy-dialog]';

/** Allow Privy’s own modal to show (e.g. intentional “View all wallets”). */
export function allowPrivyModal() {
  if (typeof document === "undefined") return;
  document.documentElement.classList.add("winx-privy-open");
}

/** Hide / inert Privy chrome so it can’t sit under our custom sheet. */
export function blockPrivyModal() {
  if (typeof document === "undefined") return;
  document.documentElement.classList.remove("winx-privy-open");
}

/** Click Privy’s close control and keep overlays blocked. */
export function dismissPrivyModals() {
  if (typeof document === "undefined") return;
  blockPrivyModal();

  document.querySelectorAll(PRIVY_NODES).forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    node.setAttribute("inert", "");
    const close =
      node.querySelector<HTMLElement>(
        'button[aria-label="Close"], button[aria-label="close"], [data-testid="close-button"]',
      ) ??
      node.querySelector<HTMLElement>('button[aria-label*="lose" i]');
    close?.click();
  });
}
