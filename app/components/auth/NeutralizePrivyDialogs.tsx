import { useEffect } from "react";
import { blockPrivyModal, dismissPrivyModals } from "../../lib/dismiss-privy";

const PRIVY_NODES =
  '#privy-dialog, #privy-dialog-backdrop, #privy-modal-content, [data-privy-dialog]';

/**
 * Privy often mounts a connect dialog on restore / after a cancelled flow.
 * Keep it inert unless `html.winx-privy-open` is set.
 */
export function NeutralizePrivyDialogs() {
  useEffect(() => {
    blockPrivyModal();

    const apply = () => {
      const allow = document.documentElement.classList.contains("winx-privy-open");
      document.querySelectorAll(PRIVY_NODES).forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        if (allow) {
          node.removeAttribute("inert");
        } else {
          node.setAttribute("inert", "");
        }
      });
    };

    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      dismissPrivyModals();
    };
  }, []);

  return null;
}
