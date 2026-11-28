import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { formatCompactUsd, formatPct } from "../../lib/format";
import { treemap, type ListedMarket } from "../../lib/markets-board";
import type { MarketStats } from "../../lib/market-stats";
import { CardGlow } from "../CardGlow";
import { MARKETS_HEAT_GLOW } from "./markets-glow";

type Props = {
  listed: ListedMarket[];
  quotes: Record<string, { stats?: MarketStats; closes: number[] }>;
  moves: Record<string, number | null>;
  /** The timeframe selector, shown at the right of the header row. */
  ranges?: ReactNode;
};

/** Figma legend: seven 40px steps, a 10px label over a 3px bar. */
const LEGEND = [
  ["-13%", "rgba(246,61,109,0.8)"],
  ["-9%", "rgba(246,61,109,0.5)"],
  ["-4%", "rgba(246,61,109,0.25)"],
  ["0%", "rgba(56,56,64,0.25)"],
  ["+4%", "rgba(16,237,191,0.25)"],
  ["+9%", "rgba(16,237,191,0.5)"],
  ["+13%", "rgba(16,237,191,0.8)"],
] as const;

/**
 * Figma tile tint by the move: grey when it's flat (under 0.1%), otherwise
 * teal (up) or pink (down) at 16% (under 3%), 32% (under 8%) or 60%, with a
 * 0.5px edge in the same hue at 35%. The change reads in the hue, or white
 * on the strongest tiles; flat tiles read in grey.
 */
function tileTone(move: number | null) {
  if (move == null || Math.abs(move) < 0.1) {
    return {
      fill: "rgba(140,140,153,0.12)",
      edge: "rgba(140,140,153,0.35)",
      ink: "rgb(191,191,204)",
    };
  }
  const rgb = move > 0 ? "15,237,191" : "245,61,110";
  const size = Math.abs(move);
  const alpha = size >= 8 ? 0.6 : size >= 3 ? 0.32 : 0.16;
  return {
    fill: `rgba(${rgb},${alpha})`,
    edge: `rgba(${rgb},0.35)`,
    ink: alpha === 0.6 ? "#fff" : `rgb(${rgb})`,
  };
}

/**
 * Figma tile content scales with the tile's shorter side (px): logo size,
 * the symbol (Orbitron SemiBold) and the change (Satoshi). Small tiles drop
 * the symbol, then the change.
 */
function tileScale(minSide: number) {
  if (minSide >= 500) return { logo: 56, symbol: 26, change: 20, gap: 10 };
  if (minSide >= 300) return { logo: 56, symbol: 21, change: 18, gap: 10 };
  if (minSide >= 180) return { logo: 40, symbol: 13, change: 11, gap: 6 };
  if (minSide >= 140) return { logo: 30, symbol: 10, change: 8, gap: 4 };
  if (minSide >= 70) return { logo: 16, symbol: 9, change: 8, gap: 2 };
  if (minSide >= 50) return { logo: 11, symbol: 0, change: 8, gap: 2 };
  return { logo: 10, symbol: 0, change: 0, gap: 0 };
}

function bookUsd(value: number): string {
  return formatCompactUsd(value).replace(/[kmbt]$/i, (suffix) => suffix.toUpperCase());
}

/**
 * Figma "Markets" (Tab=Heatmap): a header row (total and its change, the
 * legend in the middle, the timeframe on the right) over a 1px white 20%
 * divider, then a 611px treemap with 2px between tiles.
 */
export function MarketsHeatmap({ listed, quotes, moves, ranges }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [mapSize, setMapSize] = useState({ w: 1348, h: 611 });

  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setMapSize({ w: entry.contentRect.width, h: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
      <CardGlow layers={MARKETS_HEAT_GLOW} className="-z-10" />
      <div className="markets-heat-summary">
        <div className="markets-heat-head">
          <div className="markets-heat-total-group">
            <span className="markets-heat-total">{notional > 0 ? bookUsd(notional) : "—"}</span>
            <span
              className={`markets-heat-change ${
                headline == null ? "is-muted" : headline >= 0 ? "is-up" : "is-down"
              }`}
            >
              {formatPct(headline, 2, true)}
            </span>
          </div>
          <div className="markets-heat-legend" aria-hidden>
            {LEGEND.map(([label, color]) => (
              <span key={label} className="markets-heat-step">
                <span>{label}</span>
                <i style={{ background: color }} />
              </span>
            ))}
          </div>
          <div className="markets-heat-ranges">{ranges}</div>
        </div>
        <div className="markets-heat-divider" />
      </div>

      <div ref={mapRef} className="markets-heat-map">
        {listed.map((market, index) => {
          const tile = tiles[index];
          if (!tile || tile.w <= 0 || tile.h <= 0) return null;
          const move = moves[market.key] ?? null;
          const tone = tileTone(move);
          const scale = tileScale(
            Math.min((tile.w / 100) * mapSize.w, (tile.h / 100) * mapSize.h) - 2,
          );
          return (
            <Link
              key={market.key}
              to={`/trade?market=${market.key}`}
              className="markets-heat-tile"
              aria-label={`${market.symbol} ${move == null ? "" : `${move >= 0 ? "+" : "−"}${Math.abs(move).toFixed(2)}%`}`}
              style={{
                left: `calc(${tile.x}% + 1px)`,
                top: `calc(${tile.y}% + 1px)`,
                width: `calc(${tile.w}% - 2px)`,
                height: `calc(${tile.h}% - 2px)`,
                gap: scale.gap,
                background: tone.fill,
                boxShadow: `inset 0 0 0 0.5px ${tone.edge}`,
              }}
            >
              <img
                src={market.icon}
                alt=""
                width={scale.logo}
                height={scale.logo}
                style={{ width: scale.logo, height: scale.logo }}
              />
              {scale.symbol ? (
                <strong style={{ fontSize: scale.symbol }}>{market.symbol}</strong>
              ) : null}
              {scale.change ? (
                <span style={{ fontSize: scale.change, color: tone.ink }}>
                  {move == null ? "—" : `${move >= 0 ? "+" : "−"}${Math.abs(move).toFixed(2)}%`}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
