import { useEffect, useId, useMemo, useRef, useState } from "react";
import { markets } from "../../lib/config";
import { formatUsd } from "../../lib/format";
import type { MarketKey } from "../../hooks/useTradeDesk";
import { useCmcQuote } from "../../hooks/useCmcQuote";
import { useRhQuote } from "../../hooks/useRhQuote";
import { useLiveMark } from "../../hooks/use-live-mark";
import { useMarketStats } from "../../hooks/use-market-stats";
import { MarketIcon } from "./MarketIcon";

type Props = {
  marketKey: MarketKey;
  onSelect: (key: MarketKey) => void;
};

const WATCH_KEY = "winx.watchlist.v1";

const TABS = [
  { id: "watch", label: "Watchlist" },
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "crypto", label: "Crypto" },
  { id: "xstocks", label: "xStocks" },
  { id: "equities", label: "Equities" },
  { id: "commodities", label: "Commodities" },
  { id: "indices", label: "Indices" },
] as const;

type TabId = (typeof TABS)[number]["id"];
type SortKey = "market" | "price" | "change" | "volume";

const MARKET_KEYS = Object.keys(markets) as MarketKey[];

function readWatch(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(WATCH_KEY);
    const list = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

function formatChange(change: number, changePct: number) {
  const abs = Math.abs(change);
  const digits = abs >= 100 ? 2 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  const money = abs.toLocaleString("en-US", {
    minimumFractionDigits: digits > 2 ? 2 : 0,
    maximumFractionDigits: digits,
  });
  return `${changePct >= 0 ? "+" : "−"}$${money}/${Math.abs(changePct).toFixed(2)}%`;
}

function volumeLabel(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—";
  const abs = Math.abs(value);
  const scaled =
    abs >= 1e9
      ? `${(abs / 1e9).toFixed(1)}B`
      : abs >= 1e6
        ? `${(abs / 1e6).toFixed(abs >= 10e6 ? 0 : 1)}M`
        : abs >= 1e3
          ? `${(abs / 1e3).toFixed(0)}K`
          : abs.toFixed(0);
  return `$${scaled}`;
}

export function MarketPicker({ marketKey, onSelect }: Props) {
  const market = markets[marketKey];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<TabId>("all");
  const [sortKey, setSortKey] = useState<SortKey>("market");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [watched, setWatched] = useState<Set<string>>(() => readWatch());
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return MARKET_KEYS.filter((k) => {
      const m = markets[k];
      if (tab === "watch" && !watched.has(k)) return false;
      if (tab === "new" || tab === "commodities" || tab === "indices") return false;
      if ((tab === "equities" || tab === "xstocks") && markets[k].category !== "equities") return false;
      if (tab === "crypto" && markets[k].category !== "crypto") return false;
      if (!q) return true;
      return (
        m.pair.toLowerCase().includes(q) ||
        m.label.toLowerCase().includes(q) ||
        k.includes(q)
      );
    });
  }, [query, tab, watched]);

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

  const toggleWatch = (key: string) => {
    setWatched((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      window.localStorage.setItem(WATCH_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const sortBy = (key: SortKey) => {
    setSortKey((current) => {
      if (current === key) {
        setSortDir((dir) => (dir === 1 ? -1 : 1));
        return current;
      }
      setSortDir(key === "market" ? 1 : -1);
      return key;
    });
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
        <MarketIcon
          symbol={market.pair.split("-")[0] ?? ""}
          icon={market.icon}
          size={28}
          className="trade-pair-icon"
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
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            aria-label="Search markets"
          />
          <span className="market-picker-search-icon" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="6.25" stroke="currentColor" strokeWidth="1.6" />
              <path d="M16 16.5L20.5 21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </span>
        </div>

        <div className="market-picker-tabs" role="tablist">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              aria-label={item.label}
              className={tab === item.id ? "is-active" : undefined}
              onClick={() => setTab(item.id)}
            >
              {item.id === "watch" ? <StarIcon filled={tab === "watch"} /> : item.label}
            </button>
          ))}
        </div>

        <div className="market-picker-head">
          <SortButton label="Market" active={sortKey === "market"} dir={sortDir} onClick={() => sortBy("market")} />
          <SortButton label="Mark price" active={sortKey === "price"} dir={sortDir} onClick={() => sortBy("price")} />
          <SortButton label="24h change" active={sortKey === "change"} dir={sortDir} onClick={() => sortBy("change")} />
          <SortButton label="24h volume" active={sortKey === "volume"} dir={sortDir} onClick={() => sortBy("volume")} />
        </div>

        <PickerList
          keys={filtered}
          query={query}
          tab={tab}
          sortKey={sortKey}
          sortDir={sortDir}
          marketKey={marketKey}
          watched={watched}
          onPick={pick}
          onToggleWatch={toggleWatch}
        />
      </div>
    </div>
  );
}

function PickerList({
  keys,
  query,
  tab,
  sortKey,
  sortDir,
  marketKey,
  watched,
  onPick,
  onToggleWatch,
}: {
  keys: MarketKey[];
  query: string;
  tab: TabId;
  sortKey: SortKey;
  sortDir: 1 | -1;
  marketKey: MarketKey;
  watched: Set<string>;
  onPick: (key: MarketKey) => void;
  onToggleWatch: (key: string) => void;
}) {
  if (keys.length === 0) {
    return (
      <p className="market-picker-empty">
        {query
          ? `No markets match “${query}”`
          : tab === "watch"
            ? "No markets on your watchlist. Star one from All."
            : "No listed markets in this category."}
      </p>
    );
  }

  return (
    <div className="market-picker-list">
      {keys.map((key, i) => (
        <MarketRow
          key={key}
          marketKey={key}
          active={key === marketKey}
          watched={watched.has(key)}
          index={i}
          sortKey={sortKey}
          sortDir={sortDir}
          onPick={onPick}
          onToggleWatch={onToggleWatch}
        />
      ))}
    </div>
  );
}

function SortButton({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: 1 | -1;
  onClick: () => void;
}) {
  return (
    <button type="button" className={active ? "is-active" : undefined} onClick={onClick}>
      {label}
      <span aria-hidden>{active ? (dir < 0 ? "↓" : "↑") : "↕"}</span>
    </button>
  );
}

function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 3.2l2.4 5.1 5.6.7-4.1 3.8 1.1 5.5L12 15.8 7 18.3l1.1-5.5L4 9l5.6-.7L12 3.2z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MarketRow({
  marketKey,
  active,
  watched,
  index,
  sortKey,
  sortDir,
  onPick,
  onToggleWatch,
}: {
  marketKey: MarketKey;
  active: boolean;
  watched: boolean;
  index: number;
  sortKey: SortKey;
  sortDir: 1 | -1;
  onPick: (key: MarketKey) => void;
  onToggleWatch: (key: string) => void;
}) {
  const m = markets[marketKey];
  const { data: stats } = useMarketStats(m.extendedMarket, 5000);
  const live = useLiveMark(m.extendedMarket);
  const cmc = useCmcQuote(m.cmcId || undefined);
  const rh = useRhQuote(m.extendedMarket ? "" : m.rh);
  const price = live ?? stats?.markPrice ?? rh.price ?? cmc.price ?? undefined;
  const change = cmc.change ?? undefined;
  const changePct = cmc.changePct ?? undefined;
  const up = changePct == null ? undefined : changePct >= 0;
  const volume = stats?.dailyVolume ?? rh.volume ?? cmc.volume ?? undefined;
  const order = sortRank(sortKey, m.label, price, changePct, volume) * sortDir;

  return (
    <div
      className={`market-picker-row ${active ? "is-active" : ""}`}
      style={{ animationDelay: `${index * 45}ms`, order }}
      role="option"
      aria-selected={active}
    >
      <div className="market-picker-market">
        <button
          type="button"
          className={`market-picker-star ${watched ? "is-on" : ""}`}
          aria-label={watched ? `Remove ${m.label} from watchlist` : `Add ${m.label} to watchlist`}
          aria-pressed={watched}
          onClick={() => onToggleWatch(marketKey)}
        >
          <StarIcon filled={watched} />
        </button>
        <button type="button" className="market-picker-select" onClick={() => onPick(marketKey)}>
          <MarketIcon symbol={m.pair.split("-")[0] ?? ""} icon={m.icon} size={22} />
          <span className="market-picker-pair">{m.label}</span>
          {m.maxLeverage > 0 ? <span className="market-picker-lev">{m.maxLeverage}X</span> : null}
        </button>
      </div>
      <button type="button" className="market-picker-cell tabular-nums" onClick={() => onPick(marketKey)}>
        {price == null ? "—" : formatUsd(price, m.priceDecimals === 0 ? 0 : m.priceDecimals)}
      </button>
      <button
        type="button"
        className={`market-picker-cell tabular-nums ${up === true ? "is-up" : up === false ? "is-down" : ""}`}
        onClick={() => onPick(marketKey)}
      >
        {change == null || changePct == null ? "—" : formatChange(change, changePct)}
      </button>
      <button type="button" className="market-picker-cell tabular-nums" onClick={() => onPick(marketKey)}>
        {volumeLabel(volume)}
      </button>
    </div>
  );
}

function sortRank(
  key: SortKey,
  label: string,
  price: number | undefined,
  change: number | undefined,
  volume: number | undefined,
) {
  if (key === "market") {
    return [...label].reduce((sum, char, i) => sum + char.charCodeAt(0) / 100 ** i, 0);
  }
  if (key === "price") return price ?? -1;
  if (key === "change") return change ?? -1e6;
  return (volume ?? -1) / 1e6;
}
