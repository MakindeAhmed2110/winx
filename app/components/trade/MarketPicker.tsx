import { useEffect, useId, useMemo, useRef, useState } from "react";
import { markets } from "../../lib/config";
import {
  formatCompactUsd,
  formatNumber,
  formatPct,
  formatUsd,
} from "../../lib/format";
import type { MarketKey } from "../../hooks/useTradeDesk";
import { useMarketStats } from "../../hooks/use-market-stats";

type Props = {
  marketKey: MarketKey;
  onSelect: (key: MarketKey) => void;
};

const MARKET_KEYS = Object.keys(markets) as MarketKey[];

export function MarketPicker({ marketKey, onSelect }: Props) {
  const market = markets[marketKey];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "crypto">("all");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MARKET_KEYS.filter((k) => {
      const m = markets[k];
      if (tab === "crypto" && !["btc", "eth"].includes(k)) return false;
      if (!q) return true;
      return (
        m.pair.toLowerCase().includes(q) ||
        m.label.toLowerCase().includes(q) ||
        k.includes(q)
      );
    });
  }, [query, tab]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => searchRef.current?.focus(), 60);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const pick = (key: MarketKey) => {
    onSelect(key);
    setOpen(false);
  };

  return (
    <div className={`market-picker ${open ? "is-open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="trade-pair-lockup"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <img
          src={market.icon}
          alt=""
          className="trade-pair-icon"
          width={28}
          height={28}
        />
        <span className="trade-pair-title">{market.pair}</span>
        <span className="trade-pair-badge">Perp</span>
        <span className="trade-pair-caret" aria-hidden />
      </button>

      <div
        className="market-picker-panel"
        id={listId}
        role="listbox"
        aria-label="Select market"
        aria-hidden={!open}
      >
        <div className="market-picker-search">
          <span className="market-picker-search-icon" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="2" />
              <path
                d="M16.5 16.5L21 21"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            aria-label="Search markets"
          />
        </div>

        <div className="market-picker-tabs" role="tablist">
          {(
            [
              ["all", "All Markets"],
              ["crypto", "Crypto"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? "is-active" : undefined}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="market-picker-head">
          <span>Market / Vol</span>
          <span>Last price</span>
          <span>24h change</span>
          <span>Funding</span>
          <span>Open interest</span>
        </div>

        <div className="market-picker-list">
          {filtered.length === 0 ? (
            <p className="market-picker-empty">No markets match “{query}”</p>
          ) : (
            filtered.map((key, i) => (
              <MarketRow
                key={key}
                marketKey={key}
                active={key === marketKey}
                index={i}
                onPick={pick}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function MarketRow({
  marketKey,
  active,
  index,
  onPick,
}: {
  marketKey: MarketKey;
  active: boolean;
  index: number;
  onPick: (key: MarketKey) => void;
}) {
  const m = markets[marketKey];
  const { data: stats } = useMarketStats(m.extendedMarket, 5000);
  const change = stats?.dailyChangePct;
  const up = change == null ? undefined : change >= 0;
  const funding = stats?.fundingRate;

  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      className={`market-picker-row ${active ? "is-active" : ""}`}
      style={{ animationDelay: `${index * 45}ms` }}
      onClick={() => onPick(marketKey)}
    >
      <span className="market-picker-market">
        <img src={m.icon} alt="" width={28} height={28} />
        <span className="market-picker-market-text">
          <span className="market-picker-pair-line">
            <span className="market-picker-pair">{m.pair}</span>
            <span className="market-picker-lev">{m.maxLeverage}x</span>
          </span>
          <span className="market-picker-vol">
            Vol {formatCompactUsd(stats?.dailyVolume)}
          </span>
        </span>
      </span>
      <span className="market-picker-cell tabular-nums">
        {formatUsd(stats?.lastPrice ?? stats?.markPrice, m.priceDecimals === 0 ? 2 : m.priceDecimals)}
      </span>
      <span
        className={`market-picker-cell tabular-nums ${
          up === true ? "is-up" : up === false ? "is-down" : ""
        }`}
      >
        {stats
          ? `${formatNumber(stats.dailyChange, m.priceDecimals === 0 ? 2 : m.priceDecimals)} ${formatPct(change, 2, true)}`
          : "—"}
      </span>
      <span
        className={`market-picker-cell tabular-nums ${
          funding == null
            ? ""
            : funding >= 0
              ? "is-up"
              : "is-down"
        }`}
      >
        {funding == null ? "—" : `${funding.toFixed(4)}%`}
      </span>
      <span className="market-picker-cell tabular-nums">
        {formatCompactUsd(stats?.openInterest)}
      </span>
    </button>
  );
}
