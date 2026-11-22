import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { LocalPosition } from "../../lib/privacy/notes";
import type { MarketStats } from "../../lib/market-stats";
import {
  formatCompactUsd,
  formatUsd,
} from "../../lib/format";
import { rangeSpec, type ListedMarket, type RangeId } from "../../lib/markets-board";
import { Sparkline } from "./Sparkline";

export type SortKey =
  | "market"
  | "mark"
  | "oracle"
  | "premium"
  | "change"
  | "funding"
  | "oi"
  | "volume"
  | "pnl";

type RowModel = ListedMarket & {
  stats?: MarketStats;
  closes: number[];
  change: number | null;
  changePct: number | null;
  premium: number | null;
  pnlPct: number | null;
};

type Props = {
  listed: ListedMarket[];
  quotes: Record<string, { stats?: MarketStats; closes: number[] }>;
  range: RangeId;
  query: string;
  watchOnly: boolean;
  watched: Set<string>;
  onToggleWatch: (key: string) => void;
  positions: LocalPosition[];
  now: number;
};

function moneyChange(value: number): string {
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : abs >= 1 ? 1 : abs >= 0.01 ? 3 : 4;
  return formatUsd(abs, digits);
}

function bookUsd(value: number | null | undefined): string {
  return formatCompactUsd(value).replace(/[kmb]$/i, (suffix) => suffix.toUpperCase());
}

function fundingClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "00:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(secs)}` : `${pad(minutes)}:${pad(secs)}`;
}

function pnlFor(positions: LocalPosition[], marketId: number, mark: number | undefined): number | null {
  const rows = positions.filter((position) => position.marketId === marketId);
  if (!rows.length || mark == null) return null;
  let pnl = 0;
  let margin = 0;
  for (const position of rows) {
    const entry = Number(position.entryPrice) / 1e8;
    const notional = Number(position.size) / 1e6;
    const posted = Number(position.margin) / 1e6;
    const direction = position.isLong ? 1 : -1;
    if (entry > 0 && Number.isFinite(notional)) {
      pnl += direction * ((mark - entry) / entry) * notional;
    }
    if (Number.isFinite(posted)) margin += posted;
  }
  if (margin <= 0) return null;
  return (pnl / margin) * 100;
}

function rangeMove(closes: number[], stats: MarketStats | undefined, range: RangeId) {
  if (range === "1d" && stats) {
    return { change: stats.dailyChange, changePct: stats.dailyChangePct };
  }
  if (closes.length < 2) return { change: null, changePct: null };
  const first = closes[0]!;
  const last = closes[closes.length - 1]!;
  if (first === 0) return { change: null, changePct: null };
  return { change: last - first, changePct: ((last - first) / first) * 100 };
}

export function MarketsTable({
  listed,
  quotes,
  range,
  query,
  watchOnly,
  watched,
  onToggleWatch,
  positions,
  now,
}: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "oi",
    dir: "desc",
  });
  const changeLabel = rangeSpec(range).changeLabel;

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const models: RowModel[] = listed
      .filter((market) => !watchOnly || watched.has(market.key))
      .filter((market) => {
        if (!needle) return true;
        return (
          market.label.toLowerCase().includes(needle) ||
          market.symbol.toLowerCase().includes(needle)
        );
      })
      .map((market) => {
        const quote = quotes[market.key];
        const stats = quote?.stats;
        const closes = quote?.closes ?? [];
        const move = rangeMove(closes, stats, range);
        const premium =
          stats && stats.indexPrice > 0
            ? ((stats.markPrice - stats.indexPrice) / stats.indexPrice) * 100
            : null;
        return {
          ...market,
          stats,
          closes,
          change: move.change,
          changePct: move.changePct,
          premium,
          pnlPct: pnlFor(positions, market.id, stats?.markPrice),
        };
      });

    const value = (row: RowModel): number | string => {
      switch (sort.key) {
        case "market":
          return row.label;
        case "mark":
          return row.stats?.markPrice ?? -Infinity;
        case "oracle":
          return row.stats?.indexPrice ?? -Infinity;
        case "premium":
          return row.premium ?? -Infinity;
        case "change":
          return row.changePct ?? -Infinity;
        case "funding":
          return row.stats?.fundingRate ?? -Infinity;
        case "oi":
          return row.stats?.openInterest ?? -Infinity;
        case "volume":
          return row.stats?.dailyVolume ?? -Infinity;
        case "pnl":
          return row.pnlPct ?? -Infinity;
      }
    };

    return models.sort((a, b) => {
      const left = value(a);
      const right = value(b);
      const order =
        typeof left === "string" || typeof right === "string"
          ? String(left).localeCompare(String(right))
          : left - right;
      return sort.dir === "asc" ? order : -order;
    });
  }, [listed, quotes, query, range, sort, watchOnly, watched, positions]);

  const toggle = (key: SortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "market" ? "asc" : "desc" },
    );
  };

  return (
    <div className="markets-table-scroll">
      <table className="markets-table">
        <thead>
          <tr>
            <SortHead label="Market" sortKey="market" sort={sort} onSort={toggle} />
            <SortHead label="Mark price" sortKey="mark" sort={sort} onSort={toggle} />
            <SortHead label="Oracle price" sortKey="oracle" sort={sort} onSort={toggle} />
            <SortHead label="Premium" sortKey="premium" sort={sort} onSort={toggle} />
            <SortHead label={changeLabel} sortKey="change" sort={sort} onSort={toggle} />
            <th>Chart</th>
            <SortHead label="Funding" sortKey="funding" sort={sort} onSort={toggle} />
            <SortHead label="Open interest" sortKey="oi" sort={sort} onSort={toggle} />
            <SortHead label="24h volume" sortKey="volume" sort={sort} onSort={toggle} />
            <SortHead label="PnL" sortKey="pnl" sort={sort} onSort={toggle} />
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className="markets-empty" colSpan={11}>
                {watchOnly
                  ? "No markets on your watchlist. Star one from Overview."
                  : query
                    ? "No listed market matches that search."
                    : "No markets are listed on the engine."}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const up = (row.changePct ?? 0) >= 0;
              const premiumUp = (row.premium ?? 0) >= 0;
              const funding = row.stats?.fundingRate;
              const fundingUp = (funding ?? 0) >= 0;
              const countdown =
                row.stats && now > 0
                  ? fundingClock(row.stats.nextFundingTs / 1000 - now)
                  : null;
              const decimals = row.priceDecimals;
              return (
                <tr key={row.key}>
                  <td>
                    <div className="markets-name">
                      <button
                        type="button"
                        className={`markets-star ${watched.has(row.key) ? "is-on" : ""}`}
                        aria-label={watched.has(row.key) ? `Unstar ${row.label}` : `Star ${row.label}`}
                        aria-pressed={watched.has(row.key)}
                        onClick={() => onToggleWatch(row.key)}
                      >
                        <Star filled={watched.has(row.key)} />
                      </button>
                      <img src={row.icon} alt="" width={22} height={22} />
                      <span>{row.label}</span>
                      <span className="markets-lev">{row.maxLeverage}X</span>
                    </div>
                  </td>
                  <td>{formatUsd(row.stats?.markPrice, decimals)}</td>
                  <td className="is-muted">
                    {formatUsd(row.stats?.indexPrice, decimals === 0 ? 0 : Math.max(decimals, 1))}
                  </td>
                  <td className={row.premium == null ? "" : premiumUp ? "is-up" : "is-down"}>
                    {row.premium == null ? "—" : `${premiumUp ? "+" : ""}${row.premium.toFixed(3)}%`}
                  </td>
                  <td className={row.changePct == null ? "" : up ? "is-up" : "is-down"}>
                    {row.change == null || row.changePct == null
                      ? "—"
                      : `${moneyChange(row.change)}/${Math.abs(row.changePct).toFixed(2)}%`}
                  </td>
                  <td>
                    <Sparkline closes={row.closes} up={up} />
                  </td>
                  <td className={funding == null ? "" : fundingUp ? "is-up" : "is-down"}>
                    {funding == null
                      ? "—"
                      : `${funding.toFixed(4)}%${countdown ? ` ${countdown}` : ""}`}
                  </td>
                  <td>{bookUsd(row.stats?.openInterest)}</td>
                  <td>{bookUsd(row.stats?.dailyVolume)}</td>
                  <td className={row.pnlPct == null ? "is-muted" : row.pnlPct >= 0 ? "is-up" : "is-down"}>
                    {row.pnlPct == null
                      ? "—"
                      : `${row.pnlPct < 0 ? "" : ""}${row.pnlPct.toFixed(1)}%`}
                  </td>
                  <td className="markets-trade-cell">
                    <Link className="markets-trade" to={`/trade?market=${row.key}`}>
                      Trade
                    </Link>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function SortHead({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (key: SortKey) => void;
}) {
  const active = sort.key === sortKey;
  return (
    <th>
      <button type="button" className={active ? "is-active" : ""} onClick={() => onSort(sortKey)}>
        {label}
        <Caret dir={active ? sort.dir : undefined} />
      </button>
    </th>
  );
}

function Caret({ dir }: { dir?: "asc" | "desc" }) {
  return (
    <svg width="8" height="10" viewBox="0 0 8 10" aria-hidden className="markets-caret">
      <path d="M4 1.2 6.4 4H1.6L4 1.2Z" fill={dir === "asc" ? "#fff" : "rgba(255,255,255,0.35)"} />
      <path d="M4 8.8 1.6 6h4.8L4 8.8Z" fill={dir === "desc" ? "#fff" : "rgba(255,255,255,0.35)"} />
    </svg>
  );
}

function Star({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path
        d="M7 1.4 8.5 4.7l3.6.4-2.7 2.4.8 3.5L7 9.3 3.8 11l.8-3.5L1.9 5.1l3.6-.4L7 1.4Z"
        fill={filled ? "#fff" : "none"}
        stroke={filled ? "#fff" : "rgba(255,255,255,0.72)"}
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}
