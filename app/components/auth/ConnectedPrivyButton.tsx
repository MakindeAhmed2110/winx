import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useRef, useState } from "react";
import { useAccount, useDisconnect, useSwitchChain } from "wagmi";
import { robinhoodTestnet } from "../../lib/config";
import { dismissPrivyModals } from "../../lib/dismiss-privy";
import {
  embeddedWalletAddress,
  externalWalletAddress,
  isDirectWallet,
} from "../../lib/operating-wallet";
import { ConnectLabel } from "../ConnectButton";
import { ConnectModal } from "./ConnectModal";

function clearPrivyLocalState() {
  if (typeof window === "undefined") return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (/privy|wagmi|walletconnect|wc@|rk-/i.test(k)) keys.push(k);
    }
    for (const k of keys) localStorage.removeItem(k);

    const sKeys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (!k) continue;
      if (/privy|wagmi|walletconnect|wc@|rk-/i.test(k)) sKeys.push(k);
    }
    for (const k of sKeys) sessionStorage.removeItem(k);
  } catch {
    // Storage may be blocked
  }
}

export default function ConnectedPrivyButton() {
  const { ready, authenticated, logout, user } = usePrivy();
  const { address, chainId } = useAccount();
  const { disconnectAsync, connectors } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  function closeModal() {
    setOpen(false);
  }

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const embedded = authenticated ? embeddedWalletAddress(user) : undefined;
  const external = authenticated ? externalWalletAddress(user) : undefined;
  const direct = isDirectWallet(external);
  const trading = direct ? (address ?? external) : embedded;
  const display = trading ?? user?.email?.address ?? null;

  if (!ready) {
    return (
      <button type="button" className="trade-connect-btn" disabled>
        Loading…
      </button>
    );
  }

  // Session is Privy-owned. Injected extensions can stay "connected" in wagmi
  // after logout — don't treat that as a logged-in Winx session.
  if (!authenticated) {
    return (
      <>
        <button type="button" className="trade-connect-btn" onClick={() => setOpen(true)}>
          <ConnectLabel />
        </button>
        <ConnectModal open={open} onClose={closeModal} />
      </>
    );
  }

  const wrong = chainId != null && chainId !== robinhoodTestnet.id;
  const kind = !display ? "" : direct ? "Direct" : "Embedded";
  const short = display
    ? display.startsWith("0x")
      ? `${display.slice(0, 6)}…${display.slice(-4)}`
      : display
    : direct
      ? "Account"
      : "Embedded wallet";

  async function disconnect() {
    if (busy) return;
    setBusy(true);
    setMenuOpen(false);
    dismissPrivyModals();
    try {
      // Clear Privy session first so UI flips to Connect immediately.
      await logout();
      try {
        await disconnectAsync();
      } catch {
        // Injected wallets often can't fully disconnect from the page.
      }
      for (const c of connectors) {
        try {
          await disconnectAsync({ connector: c });
        } catch {
          // ignore
        }
      }
      clearPrivyLocalState();
      dismissPrivyModals();
    } catch (e) {
      console.error("[winx] disconnect failed", e);
      clearPrivyLocalState();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {wrong && (
        <button
          type="button"
          className="rounded-md border border-warn px-3 py-2 text-sm text-warn"
          onClick={() => switchChain({ chainId: robinhoodTestnet.id })}
        >
          Switch to RH testnet
        </button>
      )}
      <div className="winx-account" ref={menuRef}>
        <button
          type="button"
          className="winx-account-trigger"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          title={display ?? undefined}
          disabled={busy}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span className="winx-account-dot" aria-hidden />
          {kind ? <span className="winx-account-kind">{kind}</span> : null}
          <span className="mono">{short}</span>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M6 9l6 6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>

        {menuOpen ? (
          <div className="winx-account-menu" role="menu">
            {display ? (
              <div className="winx-account-menu-addr" title={display}>
                <span>{direct ? "Direct wallet" : "Embedded wallet"}</span>
                {display.startsWith("0x")
                  ? `${display.slice(0, 10)}…${display.slice(-8)}`
                  : display}
              </div>
            ) : null}
            {!direct && external ? (
              <div className="winx-account-menu-addr" title={external}>
                <span>Linked external</span>
                {`${external.slice(0, 10)}…${external.slice(-8)}`}
              </div>
            ) : null}
            <button
              type="button"
              className="winx-account-disconnect"
              role="menuitem"
              disabled={busy}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void disconnect();
              }}
            >
              {busy ? "Disconnecting…" : "Disconnect"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
