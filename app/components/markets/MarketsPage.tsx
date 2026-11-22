import { useEffect, useMemo, useState } from "react";
import { TradeHeader } from "../trade/TradeHeader";
import { useListedMarkets } from "../../hooks/useListedMarkets";
import { useMarketsBoard } from "../../hooks/useMarketsBoard";
import { useNow } from "../../hooks/use-poll";
import { loadStore, type LocalPosition } from "../../lib/privacy/notes";
import { MARKET_RANGES, type RangeId } from "../../lib/markets-board";
import { MarketsHeatmap } from "./MarketsHeatmap";
import { MarketsTable } from "./MarketsTable";

type Tab = "overview" | "heatmap" | "watchlist";
const WATCH_KEY = "winx.watchlist.v1";

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

export function MarketsPage() {
  const listed = useListedMarkets();
  const [tab, setTab] = useState<Tab>("overview");
  const [range, setRange] = useState<RangeId>("1d");
  const [query, setQuery] = useState("");
  const [watched, setWatched] = useState<Set<string>>(() => readWatch());
  const [positions, setPositions] = useState<LocalPosition[]>([]);
  const quotes = useMarketsBoard(listed, range);
  const now = useNow();

  useEffect(() => {
    const read = () => setPositions(loadStore().positions);
    read();
    const id = window.setInterval(read, 3_000);
    window.addEventListener("storage", read);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("storage", read);
    };
  }, []);

  const toggleWatch = (key: string) => {
    setWatched((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      window.localStorage.setItem(WATCH_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const moves = useMemo(() => {
    const out: Record<string, number | null> = {};
    for (const market of listed ?? []) {
      const quote = quotes[market.key];
      if (range === "1d" && quote?.stats) {
        out[market.key] = quote.stats.dailyChangePct;
        continue;
      }
      const closes = quote?.closes ?? [];
      if (closes.length < 2 || closes[0] === 0) {
        out[market.key] = null;
        continue;
      }
      const first = closes[0]!;
      const last = closes[closes.length - 1]!;
      out[market.key] = ((last - first) / first) * 100;
    }
    return out;
  }, [listed, quotes, range]);

  return (
    <div className="markets-page">
      <TradeHeader />
      <main className="markets-main">
        <h1 className="markets-title">Markets</h1>

        <div className="markets-tabs" role="tablist" aria-label="Market views">
          {(
            [
              ["overview", "Overview"],
              ["heatmap", "Heatmap"],
              ["watchlist", "Watchlist"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`markets-tab ${tab === id ? "is-active" : ""}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="markets-stage">
          <div className="markets-ranges" role="group" aria-label="Range">
            {MARKET_RANGES.map((item) => (
              <button
                key={item.id}
                type="button"
                className={range === item.id ? "is-active" : ""}
                onClick={() => setRange(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {listed == null ? (
            <section className="markets-panel markets-loading">Loading listed markets…</section>
          ) : tab === "heatmap" ? (
            <MarketsHeatmap listed={listed} quotes={quotes} moves={moves} />
          ) : (
            <section className="markets-panel">
              <label className="markets-search">
                <span className="sr-only">Search markets</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search"
                />
                <SearchIcon />
              </label>
              <MarketsTable
                listed={listed}
                quotes={quotes}
                range={range}
                query={query}
                watchOnly={tab === "watchlist"}
                watched={watched}
                onToggleWatch={toggleWatch}
                positions={positions}
                now={now}
              />
            </section>
          )}
        </div>
      </main>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="markets-search-icon">
      <circle cx="7" cy="7" r="4.25" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1.4" />
      <path d="M10.2 10.2 13 13" stroke="rgba(255,255,255,0.55)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}
