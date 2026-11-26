import { formatCompactUsd, formatPct } from "../../lib/format";
import { heatStyle, treemap, type ListedMarket } from "../../lib/markets-board";
import type { MarketStats } from "../../lib/market-stats";
import { Link } from "react-router";
import { MarketIcon } from "../trade/MarketIcon";

type Props = {
  listed: ListedMarket[];
  quotes: Record<string, { stats?: MarketStats; closes: number[] }>;
  moves: Record<string, number | null>;
};

function bookUsd(value: number): string {
  return formatCompactUsd(value).replace(/[kmb]$/i, (suffix) => suffix.toUpperCase());
}

export function MarketsHeatmap({ listed, quotes, moves }: Props) {
  const weights = listed.map((market) => {
    const stats = quotes[market.key]?.stats;
    return stats?.openInterest || stats?.dailyVolume || 1;
  });
  const tiles = treemap(weights);
  let notional = 0;
  let weighted = 0;
  for (const market of listed) {
    const stats = quotes[market.key]?.stats;
    const size = stats?.openInterest || stats?.dailyVolume || 0;
    const move = moves[market.key];
    notional += size;
    if (move != null) weighted += move * size;
  }
  const headline = notional > 0 ? weighted / notional : null;

  return (
    <section className="markets-panel markets-heat">
      <div className="markets-heat-head">
        <span className="markets-heat-total">{notional > 0 ? bookUsd(notional) : "—"}</span>
        <span className={headline == null ? "is-muted" : headline >= 0 ? "is-up" : "is-down"}>
          {formatPct(headline, 2, true)}
        </span>
      </div>
      <div className="markets-heat-map">
        {listed.map((market, index) => {
          const tile = tiles[index];
          if (!tile || tile.w <= 0 || tile.h <= 0) return null;
          const move = moves[market.key] ?? null;
          const tone = heatStyle(move);
          const compact = tile.w < 16 || tile.h < 22;
          return (
            <Link
              key={market.key}
              to={`/trade?market=${market.key}`}
              className={`markets-heat-tile ${compact ? "is-compact" : ""}`}
              style={{
                left: `calc(${tile.x}% + 3px)`,
                top: `calc(${tile.y}% + 3px)`,
                width: `calc(${tile.w}% - 6px)`,
                height: `calc(${tile.h}% - 6px)`,
                background: tone.background,
                color: tone.ink,
              }}
            >
              <MarketIcon symbol={market.symbol} icon={market.icon} size={compact ? 18 : 36} />
              <strong>{market.symbol}</strong>
              <span>{move == null ? "—" : `${move >= 0 ? "+" : ""}${move.toFixed(2)}%`}</span>
            </Link>
          );
        })}
      </div>
      <div className="markets-heat-legend" aria-hidden>
        <div className="markets-heat-scale" />
        <div className="markets-heat-ticks">
          {["-13%", "-9%", "-4%", "0%", "+4%", "+9%", "+13%"].map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
