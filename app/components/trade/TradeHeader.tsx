import { useState } from "react";
import { Link, NavLink } from "react-router";
import { ConnectButton } from "../ConnectButton";
import { FaucetModal } from "./FaucetModal";

export function TradeHeader({ onFaucetClaimed }: { onFaucetClaimed?: () => void }) {
  const [faucetOpen, setFaucetOpen] = useState(false);

  return (
    // Figma "Header" (Device=Desktop): 59px tall, 25px side padding, no fill
    // and no divider (the page background shows through).
    <header className="trade-header relative z-20 flex h-[59px] shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] px-4 md:gap-4 md:px-6 lg:border-b-0 lg:px-[25px]">
      <div className="trade-header-start flex min-w-0 items-center">
        <Link to="/" className="trade-logo no-underline" aria-label="Winx Perp home">
          <img
            src="/logo/winx-mark.svg"
            alt=""
            className="trade-logo-mark"
            width={38.115}
            height={30}
          />
          <span className="trade-logo-type">
            <img
              src="/logo/winx-wordmark.svg"
              alt="WINX"
              className="trade-logo-wordmark"
              width={78.425}
              height={16.665}
            />
            <span className="trade-logo-perp">Perp</span>
          </span>
        </Link>

        <nav className="trade-nav hidden items-center sm:flex">
          {(
            [
              ["/trade", "Perps"],
              ["/markets", "Markets"],
              ["/portfolio", "Portfolio"],
            ] as const
          ).map(([to, label]) => (
            <NavLink
              key={label}
              to={to}
              className={({ isActive }) =>
                `trade-nav-link ${isActive ? "is-active" : ""}`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="trade-header-actions flex shrink-0 items-center gap-2 md:gap-2.5">
        <button
          type="button"
          className="trade-faucet-btn"
          onClick={() => setFaucetOpen(true)}
        >
          Faucet
        </button>
        <ConnectButton />
        <button
          type="button"
          className="trade-settings-btn"
          aria-label="Settings"
        >
          <img src="/logo/gear.svg" alt="" width={16} height={16} />
        </button>
      </div>
      <FaucetModal
        open={faucetOpen}
        onClose={() => setFaucetOpen(false)}
        onClaimed={onFaucetClaimed}
      />
    </header>
  );
}
