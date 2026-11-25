import { NavLink } from "react-router";

const TABS = [
  { id: "perps", to: "/trade", label: "Perps", icon: "/logo/nav/perps.svg" },
  { id: "markets", to: "/markets", label: "Markets", icon: "/logo/nav/markets.svg" },
  { id: "portfolio", to: "/portfolio", label: "Portfolio", icon: "/logo/nav/portfolio.svg" },
] as const;

type Props = {
  active: "perps" | "markets" | "portfolio";
  onLong?: () => void;
  onShort?: () => void;
  showSides?: boolean;
};

export function MobileTradeDock({
  active,
  onLong,
  onShort,
  showSides = true,
}: Props) {
  return (
    <div className="mobile-dock lg:hidden">
      {showSides ? (
        <div className="mobile-dock-sides">
          <button type="button" className="mobile-dock-long" onClick={onLong}>
            Long
          </button>
          <button type="button" className="mobile-dock-short" onClick={onShort}>
            Short
          </button>
        </div>
      ) : null}

      <nav className="mobile-dock-nav" aria-label="Trade">
        {TABS.map((tab) => (
          <NavLink
            key={tab.id}
            to={tab.to}
            className={() => `mobile-dock-tab ${active === tab.id ? "is-active" : ""}`}
          >
            <img src={tab.icon} alt="" width={20} height={20} />
            <span>{tab.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
