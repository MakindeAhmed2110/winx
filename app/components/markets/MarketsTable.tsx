import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { LocalPosition } from "../../lib/privacy/notes";
import type { MarketStats } from "../../lib/market-stats";
import {
  formatCompactUsd,
  formatPct,
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
    <>
    <div className="markets-mobile lg:hidden">
      <div className="markets-mobile-head">
        <span>Market</span>
        <span>Price / 24h change</span>
      </div>
      {rows.length === 0 ? (
        <p className="markets-empty">
          {watchOnly
            ? "No markets on your watchlist. Star one from Overview."
            : query
              ? "No listed market matches that search."
              : "No markets are listed on the engine."}
        </p>
      ) : (
        rows.map((row) => {
          const up = (row.changePct ?? 0) >= 0;
          const starred = watched.has(row.key);
          const vol = formatCompactUsd(row.stats?.dailyVolume).replace(/[kmb]$/i, (s) => s.toUpperCase());
          return (
            <div key={row.key} className="markets-mobile-row">
              <button
                type="button"
                className={`markets-star ${starred ? "is-on" : ""}`}
                aria-label={starred ? `Unstar ${row.label}` : `Star ${row.label}`}
                aria-pressed={starred}
                onClick={() => onToggleWatch(row.key)}
              >
                <img
                  src={starred ? "/logo/markets/star-filled.svg" : "/logo/markets/star.svg"}
                  alt=""
                  width={16}
                  height={16}
                />
              </button>
              <Link className="markets-mobile-link" to={`/trade?market=${row.key}`}>
                <span className="markets-mobile-name">
                  <span className="markets-mobile-pair">
                    <img src={row.icon} alt="" width={19} height={19} />
                    <span>{row.label}</span>
                    <span className="markets-mobile-lev">{row.maxLeverage}x</span>
                  </span>
                  <span className="markets-mobile-vol">Vol {vol}</span>
                </span>
                <Sparkline closes={row.closes} up={up} width={45} height={16} />
                <span className="markets-mobile-px">
                  <span>{formatUsd(row.stats?.markPrice, row.priceDecimals)}</span>
                  <span className={row.changePct == null ? "" : up ? "is-up" : "is-down"}>
                    {formatPct(row.changePct, 2)}
                  </span>
                </span>
              </Link>
            </div>
          );
        })
      )}
    </div>
    {/* Figma Markets table: a 26.72px header (labels at 50%, sortable columns
        with the caret-up-down icon) and 42px rows 10px apart, in fixed
        columns (see .markets-grid in app.css). Values are Satoshi 14px. */}
    <div className="markets-grid hidden lg:block">
      <div className="markets-grid-inner">
        <div className="markets-grid-head">
          <HeadCell label="Market" sortKey="market" sort={sort} onSort={toggle} />
          <HeadCell label="Mark price" sortKey="mark" sort={sort} onSort={toggle} />
          <HeadCell label="Oracle price" />
          <HeadCell label="Premium" />
          <HeadCell label={changeLabel} sortKey="change" sort={sort} onSort={toggle} />
          <HeadCell label="Chart" />
          <HeadCell label="Funding" sortKey="funding" sort={sort} onSort={toggle} />
          <HeadCell label="Open interest" sortKey="oi" sort={sort} onSort={toggle} />
          <HeadCell label="24h volume" sortKey="volume" sort={sort} onSort={toggle} />
          <HeadCell label="PnL" />
          <span />
        </div>
        <div className="markets-grid-body">
          {rows.length === 0 ? (
            <p className="markets-empty">
              {watchOnly
                ? "No markets on your watchlist. Star one from Overview."
                : query
                  ? "No listed market matches that search."
                  : "No markets are listed on the engine."}
            </p>
          ) : (
            rows.map((row) => {
              const up = (row.changePct ?? 0) >= 0;
              const funding = row.stats?.fundingRate;
              const fundingUp = (funding ?? 0) >= 0;
              const countdown =
                row.stats && now > 0
                  ? fundingClock(row.stats.nextFundingTs / 1000 - now)
                  : null;
              const decimals = row.priceDecimals;
              const starred = watched.has(row.key);
              return (
                <div key={row.key} className="markets-grid-row">
                  <div className="markets-name">
                    <button
                      type="button"
                      className="markets-star"
                      aria-label={starred ? `Unstar ${row.label}` : `Star ${row.label}`}
                      aria-pressed={starred}
                      onClick={() => onToggleWatch(row.key)}
                    >
                      <img
                        src={starred ? "/icons/star-filled-16.svg" : "/icons/star-16.svg"}
                        alt=""
                        width={16}
                        height={16}
                      />
                    </button>
                    <img src={row.icon} alt="" width={19} height={19} className="markets-name-icon" />
                    <span className="markets-name-pair">{row.label}</span>
                    <span className="markets-lev">
                      <span>{row.maxLeverage}x</span>
                    </span>
                  </div>
                  <span>{formatUsd(row.stats?.markPrice, decimals)}</span>
                  <span>
                    {formatUsd(row.stats?.indexPrice, decimals === 0 ? 0 : Math.max(decimals, 1))}
                  </span>
                  {/* Figma shows premium and PnL in white either way. */}
                  <span>
                    {row.premium == null
                      ? "—"
                      : `${row.premium >= 0 ? "+" : ""}${row.premium.toFixed(3)}%`}
                  </span>
                  <span className={row.changePct == null ? "" : up ? "is-up" : "is-down"}>
                    {row.change == null || row.changePct == null
                      ? "—"
                      : `${up ? "" : "-"}${moneyChange(row.change)}/${Math.abs(row.changePct).toFixed(2)}%`}
                  </span>
                  <span>
                    <Sparkline closes={row.closes} up={up} />
                  </span>
                  <span className={funding == null ? "" : fundingUp ? "is-up" : "is-down"}>
                    {funding == null
                      ? "—"
                      : `${funding.toFixed(4)}%${countdown ? ` ${countdown}` : ""}`}
                  </span>
                  <span>{bookUsd(row.stats?.openInterest)}</span>
                  <span>{bookUsd(row.stats?.dailyVolume)}</span>
                  <span>{row.pnlPct == null ? "—" : `${row.pnlPct.toFixed(1)}%`}</span>
                  <span className="markets-trade-cell">
                    <Link className="markets-trade" to={`/trade?market=${row.key}`}>
                      Trade
                    </Link>
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
    </>
  );
}

/**
 * Figma header cell: the label at 50%; sortable columns add the
 * caret-up-down icon (50% in the file) 4px after it. Figma shows no
 * active-sort styling, so the direction is exposed to assistive tech only.
 */
function HeadCell({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey?: SortKey;
  sort?: { key: SortKey; dir: "asc" | "desc" };
  onSort?: (key: SortKey) => void;
}) {
  if (!sortKey || !sort || !onSort) {
    return (
      <span className="markets-head-cell">
        <span>{label}</span>
      </span>
    );
  }
  const active = sort.key === sortKey;
  return (
    <button
      type="button"
      className="markets-head-cell"
      aria-label={
        active
          ? `${label}, sorted ${sort.dir === "asc" ? "ascending" : "descending"}`
          : `Sort by ${label}`
      }
      onClick={() => onSort(sortKey)}
    >
      <span>{label}</span>
      <img src="/icons/caret-up-down-18.svg" alt="" aria-hidden width={18.72} height={18.72} />
    </button>
  );
}
