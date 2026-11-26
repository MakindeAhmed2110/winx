import { useState } from "react";
import { Link, NavLink } from "react-router";
import { ConnectButton } from "../ConnectButton";
import { FaucetModal } from "./FaucetModal";

export function TradeHeader({ onFaucetClaimed }: { onFaucetClaimed?: () => void }) {
  const [faucetOpen, setFaucetOpen] = useState(false);

  return (
    <header className="trade-header relative z-20 flex h-[59px] shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] px-4 md:gap-4 md:px-6">
      <div className="trade-header-start flex min-w-0 items-center">
        <Link to="/" className="trade-logo no-underline" aria-label="Winx Perp home">
          <img
            src="/logo/winx-mark.svg"
            alt=""
            className="trade-logo-mark"
            width={38}
            height={30}
          />
          <span className="trade-logo-type">
            <img
              src="/logo/winx-wordmark.svg"
              alt="WINX"
              className="trade-logo-wordmark"
              width={78}
              height={17}
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
              ["/docs", "Docs"],
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
        <Link to="/docs" className="trade-nav-link sm:hidden">
          Docs
        </Link>
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
