import { useEffect, useMemo, useRef, useState } from "react";
import { markets } from "../../lib/config";
import type { MarketKey } from "../../hooks/useTradeDesk";

declare global {
  interface Window {
    TradingView?: {
      widget: new (opts: Record<string, unknown>) => unknown;
    };
  }
}

type Candle = { o: number; h: number; l: number; c: number; t: number };
type Interval = "15m" | "1h" | "4h" | "1d";

const INTERVALS: Interval[] = ["15m", "1h", "4h", "1d"];
let tvScriptPromise: Promise<void> | null = null;

function loadTradingView(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.TradingView) return Promise.resolve();
  if (tvScriptPromise) return tvScriptPromise;
  tvScriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById("tradingview-widget-script");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      return;
    }
    const script = document.createElement("script");
    script.id = "tradingview-widget-script";
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("TradingView failed to load"));
    document.head.appendChild(script);
  });
  return tvScriptPromise;
}

function formatAxisTime(ts: number, interval: Interval, spanMs: number): string {
  const d = new Date(ts);
  if (interval === "1d" || spanMs > 36 * 3600 * 1000) {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function CandleFallbackChart({
  book,
  pair,
  decimals,
}: {
  book: string;
  pair: string;
  decimals: number;
}) {
  const [interval, setInterval] = useState<Interval>("1h");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const plotRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 680, h: 480 });

  useEffect(() => {
    const el = plotRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const sync = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setBox({ w: Math.round(r.width), h: Math.round(r.height) });
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(
          `/extended/api/v1/info/candles/${encodeURIComponent(book)}/mark-prices?interval=${interval}&limit=96`,
          { cache: "no-store" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as {
          data?: { o?: string; h?: string; l?: string; c?: string; T?: number }[];
        };
        const parsed = (json.data ?? [])
          .map((row) => ({
            o: Number(row.o),
            h: Number(row.h),
            l: Number(row.l),
            c: Number(row.c),
            t: Number(row.T),
          }))
          .filter(
            (c) =>
              Number.isFinite(c.o) &&
              Number.isFinite(c.h) &&
              Number.isFinite(c.l) &&
              Number.isFinite(c.c) &&
              c.t > 0,
          )
          .sort((a, b) => a.t - b.t);
        if (!cancelled) {
          setCandles(parsed);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [book, interval]);

  const metrics = useMemo(() => {
    if (!candles.length) return null;
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of candles) {
      if (c.l < lo) lo = c.l;
      if (c.h > hi) hi = c.h;
    }
    const span = Math.max(hi - lo, Math.max(hi * 0.005, 0.01));
    const pad = span * 0.1;
    return { min: lo - pad, max: hi + pad };
  }, [candles]);

  const active = hoverIdx != null && candles[hoverIdx] ? candles[hoverIdx] : candles[candles.length - 1];
  const last = candles[candles.length - 1];
  const digits = Math.max(decimals, 2);

  const W = box.w;
  const H = box.h;
  const padL = 10;
  const padR = 64;
  const padT = 16;
  const padB = 28;
  const plotW = Math.max(W - padL - padR, 40);
  const plotH = Math.max(H - padT - padB, 40);
  const spanMs =
    candles.length > 1 ? candles[candles.length - 1].t - candles[0].t : 0;

  const yOf = (price: number) => {
    if (!metrics) return padT;
    return padT + ((metrics.max - price) / (metrics.max - metrics.min)) * plotH;
  };

  return (
    <div className="flex h-full w-full flex-col bg-black text-paper select-none">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-2 text-[11px]">
        <div className="flex items-center gap-1">
          {INTERVALS.map((iv) => (
            <button
              key={iv}
              type="button"
              onClick={() => setInterval(iv)}
              className={`rounded px-2 py-0.5 uppercase tracking-wider transition ${
                interval === iv
                  ? "bg-white/12 text-paper"
                  : "text-fog hover:text-paper"
              }`}
            >
              {iv}
            </button>
          ))}
        </div>
        {active ? (
          <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] tabular-nums text-fog">
            <span className="text-paper">{pair}</span>
            <span>O {active.o.toFixed(digits)}</span>
            <span>H {active.h.toFixed(digits)}</span>
            <span>L {active.l.toFixed(digits)}</span>
            <span className={active.c >= active.o ? "text-[#22c55e]" : "text-[#ef4444]"}>
              C {active.c.toFixed(digits)}
            </span>
          </div>
        ) : null}
      </div>

      <div ref={plotRef} className="relative min-h-0 flex-1">
        {!candles.length || !metrics ? (
          <div className="flex h-full items-center justify-center text-sm text-fog">
            {error ? "Chart unavailable" : "Loading chart…"}
          </div>
        ) : (
          <svg
            width={W}
            height={H}
            viewBox={`0 0 ${W} ${H}`}
            className="block h-full w-full"
            onMouseLeave={() => setHoverIdx(null)}
          >
            {[0, 0.25, 0.5, 0.75, 1].map((t) => {
              const y = padT + t * plotH;
              const price = metrics.max - t * (metrics.max - metrics.min);
              return (
                <g key={t}>
                  <line
                    x1={padL}
                    x2={W - padR}
                    y1={y}
                    y2={y}
                    stroke="rgba(255,255,255,0.08)"
                    strokeWidth="1"
                  />
                  <text
                    x={W - padR + 8}
                    y={y + 4}
                    fill="rgba(255,255,255,0.55)"
                    fontSize="11"
                    fontFamily="var(--font-mono), monospace"
                  >
                    {price.toFixed(digits)}
                  </text>
                </g>
              );
            })}

            {candles.map((c, i) => {
              const step = plotW / Math.max(candles.length, 1);
              const cx = padL + i * step + step / 2;
              const bodyW = Math.max(2, Math.min(step * 0.68, 10));
              const up = c.c >= c.o;
              const color = up ? "#22c55e" : "#ef4444";
              const yH = yOf(c.h);
              const yL = yOf(c.l);
              const yTop = yOf(Math.max(c.o, c.c));
              const yBot = yOf(Math.min(c.o, c.c));
              const bodyH = Math.max(1.5, yBot - yTop);
              return (
                <g
                  key={c.t}
                  onMouseEnter={() => setHoverIdx(i)}
                >
                  <rect
                    x={cx - step / 2}
                    y={padT}
                    width={step}
                    height={plotH}
                    fill="transparent"
                  />
                  <line x1={cx} x2={cx} y1={yH} y2={yL} stroke={color} strokeWidth="1.2" />
                  <rect
                    x={cx - bodyW / 2}
                    y={yTop}
                    width={bodyW}
                    height={bodyH}
                    fill={color}
                  />
                </g>
              );
            })}

            {last ? (
              <g>
                <line
                  x1={padL}
                  x2={W - padR}
                  y1={yOf(last.c)}
                  y2={yOf(last.c)}
                  stroke="#10edbf"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <rect
                  x={W - padR + 2}
                  y={yOf(last.c) - 9}
                  width={padR - 6}
                  height={18}
                  rx="2"
                  fill="#10edbf"
                />
                <text
                  x={W - padR + 8}
                  y={yOf(last.c) + 4}
                  fill="#050507"
                  fontSize="11"
                  fontWeight="600"
                  fontFamily="var(--font-mono), monospace"
                >
                  {last.c.toFixed(digits)}
                </text>
              </g>
            ) : null}

            {[0, 0.25, 0.5, 0.75, 0.99].map((ratio) => {
              const idx = Math.min(candles.length - 1, Math.floor(ratio * candles.length));
              const c = candles[idx];
              if (!c) return null;
              const step = plotW / Math.max(candles.length, 1);
              const x = padL + idx * step + step / 2;
              return (
                <text
                  key={ratio}
                  x={x}
                  y={H - 10}
                  textAnchor="middle"
                  fill="rgba(255,255,255,0.48)"
                  fontSize="10"
                  fontFamily="var(--font-mono), monospace"
                >
                  {formatAxisTime(c.t, interval, spanMs)}
                </text>
              );
            })}
          </svg>
        )}
      </div>
    </div>
  );
}

export function TradingChart({ marketKey }: { marketKey: MarketKey }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const market = markets[marketKey];
  const symbol = market.tv;

  useEffect(() => {
    let cancelled = false;
    const host = containerRef.current;
    if (!host) return;
    if (!symbol) {
      host.innerHTML = "";
      return;
    }

    const mountId = `tv_${marketKey}_${Math.random().toString(36).slice(2, 9)}`;
    host.innerHTML = "";
    const mount = document.createElement("div");
    mount.id = mountId;
    mount.style.height = "100%";
    mount.style.width = "100%";
    host.appendChild(mount);

    loadTradingView()
      .then(() => {
        if (cancelled || !window.TradingView) return;
        // eslint-disable-next-line no-new
        new window.TradingView.widget({
          autosize: true,
          symbol,
          interval: "60",
          timezone: "Etc/UTC",
          theme: "dark",
          style: "1",
          locale: "en",
          toolbar_bg: "#000000",
          enable_publishing: false,
          hide_top_toolbar: true,
          hide_side_toolbar: false,
          hide_legend: true,
          withdateranges: false,
          allow_symbol_change: false,
          details: false,
          hotlist: false,
          calendar: false,
          save_image: false,
          container_id: mountId,
          backgroundColor: "#000000",
          gridColor: "rgba(255, 255, 255, 0.1)",
          studies_overrides: {},
          disabled_features: [
            "header_widget",
            "header_symbol_search",
            "header_resolutions",
            "header_chart_type",
            "header_compare",
            "header_undo_redo",
            "header_screenshot",
            "header_saveload",
            "display_market_status",
            "legend_widget",
          ],
          enabled_features: [
            "left_toolbar",
            "side_toolbar_in_fullscreen_mode",
            "seconds_resolution",
          ],
          overrides: {
            "paneProperties.background": "#000000",
            "paneProperties.backgroundType": "solid",
            "paneProperties.vertGridProperties.color": "rgba(255,255,255,0.1)",
            "paneProperties.vertGridProperties.style": 0,
            "paneProperties.horzGridProperties.color": "rgba(255,255,255,0.1)",
            "paneProperties.horzGridProperties.style": 0,
            "paneProperties.separatorColor": "rgba(255,255,255,0.12)",
            "mainSeriesProperties.candleStyle.upColor": "#22c55e",
            "mainSeriesProperties.candleStyle.downColor": "#ef4444",
            "mainSeriesProperties.candleStyle.borderUpColor": "#22c55e",
            "mainSeriesProperties.candleStyle.borderDownColor": "#ef4444",
            "mainSeriesProperties.candleStyle.wickUpColor": "#22c55e",
            "mainSeriesProperties.candleStyle.wickDownColor": "#ef4444",
            "mainSeriesProperties.showPriceLine": true,
            "mainSeriesProperties.priceLineVisible": true,
            "mainSeriesProperties.priceLineWidth": 1,
            "mainSeriesProperties.priceLineColor": "#10edbf",
            "mainSeriesProperties.priceLineStyle": 2,
            "mainSeriesProperties.highLowAvgPrice.highLowPriceLinesVisible": false,
            "scalesProperties.showSeriesLastValue": true,
            "scalesProperties.seriesLastValueMode": 1,
            "scalesProperties.lineColor": "rgba(255,255,255,0.12)",
            "scalesProperties.textColor": "rgba(255,255,255,0.55)",
          },
        });
      })
      .catch(() => {
        if (!cancelled && host) {
          host.innerHTML =
            '<div class="flex h-full items-center justify-center text-sm text-fog">Chart unavailable</div>';
        }
      });

    return () => {
      cancelled = true;
      if (host) host.innerHTML = "";
    };
  }, [marketKey, symbol]);

  return (
    <div className="trade-chart relative h-[420px] w-full overflow-hidden bg-black sm:h-[561px] xl:h-full xl:min-h-[561px]">
      {!symbol && market.book ? (
        <CandleFallbackChart
          book={market.book}
          pair={market.pair}
          decimals={market.priceDecimals}
        />
      ) : (
        <div ref={containerRef} className="absolute inset-0" />
      )}
    </div>
  );
}
