/** Product-scale visuals - orderbook, veiled market, settlement - not decorative icons. */

import { useEffect, useState } from "react";

type BookLevel = { price: number; size: number; flash: number };

const ASK_BASE = [74120.5, 74118.0, 74115.5, 74112.0, 74108.5];
const BID_BASE = [74105.0, 74102.5, 74098.0, 74095.5, 74090.0];
const ASK_SIZE0 = [0.842, 1.204, 0.51, 2.11, 0.78];
const BID_SIZE0 = [1.02, 0.64, 1.88, 0.42, 2.45];

function fmtPrice(n: number) {
  return n.toFixed(1);
}
function fmtSize(n: number) {
  return n.toFixed(3);
}
function withTotals(levels: BookLevel[]) {
  let run = 0;
  return levels.map((l) => {
    run += l.size;
    return { ...l, total: run };
  });
}
function seedLevels(prices: number[], sizes: number[]): BookLevel[] {
  return prices.map((price, i) => ({ price, size: sizes[i], flash: 0 }));
}

export function OrderbookVisual() {
  const [asks, setAsks] = useState(() => seedLevels(ASK_BASE, ASK_SIZE0));
  const [bids, setBids] = useState(() => seedLevels(BID_BASE, BID_SIZE0));
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setTick((t) => t + 1);
      setAsks((prev) => {
        const next = prev.map((l) => ({ ...l, flash: Math.max(0, l.flash - 1) }));
        const i = Math.floor(Math.random() * next.length);
        const delta = (Math.random() - 0.42) * 0.55;
        next[i] = {
          ...next[i],
          size: Math.max(0.12, Math.min(3.8, next[i].size + delta)),
          flash: 3,
        };
        // Occasional micro price walk on best ask
        if (Math.random() > 0.62) {
          const step = Math.random() > 0.5 ? 0.5 : -0.5;
          next[next.length - 1] = {
            ...next[next.length - 1],
            price: Math.max(next[next.length - 2].price - 2, next[next.length - 1].price + step),
            flash: 3,
          };
        }
        return next;
      });
      setBids((prev) => {
        const next = prev.map((l) => ({ ...l, flash: Math.max(0, l.flash - 1) }));
        const i = Math.floor(Math.random() * next.length);
        const delta = (Math.random() - 0.42) * 0.55;
        next[i] = {
          ...next[i],
          size: Math.max(0.12, Math.min(3.8, next[i].size + delta)),
          flash: 3,
        };
        if (Math.random() > 0.62) {
          const step = Math.random() > 0.5 ? 0.5 : -0.5;
          next[0] = {
            ...next[0],
            price: Math.min(next[1].price + 2, next[0].price + step),
            flash: 3,
          };
        }
        return next;
      });
    }, 720);
    return () => window.clearInterval(id);
  }, []);

  const askRows = withTotals(asks);
  const bidRows = withTotals(bids);
  const bestAsk = asks[asks.length - 1]?.price ?? 74108.5;
  const bestBid = bids[0]?.price ?? 74105.0;
  const mid = (bestAsk + bestBid) / 2;
  const spread = Math.max(0.5, bestAsk - bestBid);
  const maxAskTotal = Math.max(...askRows.map((r) => r.total), 1);
  const maxBidTotal = Math.max(...bidRows.map((r) => r.total), 1);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b12]/92 shadow-[0_0_80px_rgba(61,92,255,0.12)]">
      <div className="flex items-center gap-6 border-b border-white/8 px-5 py-3 text-xs tracking-wide text-fog">
        <span className="text-paper">ORDER BOOK</span>
        <span className="opacity-40">TRADES</span>
        <span className="ml-auto flex items-center gap-2 opacity-70">
          <span
            className="inline-block h-1.5 w-1.5 rounded-full bg-long"
            style={{ animation: "ob-pulse 1.4s ease-in-out infinite" }}
          />
          0.5 · BTC
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 px-5 py-2 text-[10px] uppercase tracking-[0.16em] text-fog/70">
        <span>Price</span>
        <span className="text-right">Size</span>
        <span className="text-right">Total</span>
      </div>
      <div className="relative px-2 pb-2">
        {askRows.map((row, i) => (
          <div
            key={`a-${i}`}
            className={`ob-row relative grid grid-cols-3 gap-2 px-3 py-[5px] text-sm ${
              row.flash > 0 ? "ob-flash-short" : ""
            }`}
          >
            <div
              className="ob-depth absolute inset-y-0 right-0 bg-short/15"
              style={{ width: `${Math.max(12, (row.total / maxAskTotal) * 72)}%` }}
            />
            <span className="relative text-short">{fmtPrice(row.price)}</span>
            <span className="relative text-right text-paper/80">{fmtSize(row.size)}</span>
            <span className="relative text-right text-fog">{fmtSize(row.total)}</span>
          </div>
        ))}
        <div
          key={tick}
          className="ob-mid my-2 flex items-center justify-between rounded-md bg-white/[0.03] px-3 py-2 text-sm"
        >
          <span className="font-medium text-paper tabular-nums">
            {mid.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
          </span>
          <span className="text-xs text-fog tabular-nums">
            Spread {spread.toFixed(1)} · {((spread / mid) * 100).toFixed(3)}%
          </span>
        </div>
        {bidRows.map((row, i) => (
          <div
            key={`b-${i}`}
            className={`ob-row relative grid grid-cols-3 gap-2 px-3 py-[5px] text-sm ${
              row.flash > 0 ? "ob-flash-long" : ""
            }`}
          >
            <div
              className="ob-depth absolute inset-y-0 right-0 bg-long/15"
              style={{ width: `${Math.max(12, (row.total / maxBidTotal) * 72)}%` }}
            />
            <span className="relative text-long">{fmtPrice(row.price)}</span>
            <span className="relative text-right text-paper/80">{fmtSize(row.size)}</span>
            <span className="relative text-right text-fog">{fmtSize(row.total)}</span>
          </div>
        ))}
        {/* privacy veil */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#050507]/10 via-[#050507]/55 to-[#050507]/25 backdrop-blur-[1.5px]" />
        <div className="pointer-events-none absolute inset-x-8 top-1/2 -translate-y-1/2 rounded-xl border border-sky/25 bg-[#0b0b12]/75 px-4 py-3 text-center backdrop-blur-md">
          <p className="brand text-[11px] tracking-[0.22em] text-sky">Sealed depth</p>
          <p className="mt-1 text-sm text-fog">Your size never paints the book</p>
        </div>
      </div>
    </div>
  );
}

type MarketCell = {
  t: string;
  w: string;
  h: string;
  price: number;
  open: number;
  flash: number;
  decimals: number;
};

const MARKET_SEED: Omit<MarketCell, "flash">[] = [
  { t: "BTC", w: "42%", h: "48%", price: 74106.5, open: 72060, decimals: 1 },
  { t: "ETH", w: "28%", h: "48%", price: 3892.4, open: 3849, decimals: 1 },
  { t: "SOL", w: "30%", h: "48%", price: 178.42, open: 179.92, decimals: 2 },
  { t: "BNB", w: "22%", h: "52%", price: 612.8, open: 620.2, decimals: 1 },
  { t: "LINK", w: "26%", h: "52%", price: 18.64, open: 18.03, decimals: 2 },
  { t: "ARB", w: "24%", h: "52%", price: 0.842, open: 0.837, decimals: 3 },
  { t: "OP", w: "28%", h: "52%", price: 1.926, open: 1.932, decimals: 3 },
];

function fmtUsd(n: number, decimals: number) {
  if (n >= 1000) {
    return n.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
  return n.toFixed(decimals);
}

function pctFromOpen(price: number, open: number) {
  return ((price - open) / open) * 100;
}

export function MarketVisual() {
  const [cells, setCells] = useState<MarketCell[]>(() =>
    MARKET_SEED.map((c) => ({ ...c, flash: 0 })),
  );
  const [mktTick, setMktTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setMktTick((t) => t + 1);
      setCells((prev) =>
        prev.map((c) => {
          // Tick every cell lightly; occasionally a stronger move
          const strong = Math.random() > 0.55;
          const bps = strong ? (Math.random() - 0.48) * 18 : (Math.random() - 0.5) * 6;
          const next = Math.max(c.price * 0.002, c.price * (1 + bps / 10000));
          return {
            ...c,
            price: Number(next.toFixed(c.decimals + 2)),
            flash: strong ? 3 : Math.max(0, c.flash - 1),
          };
        }),
      );
    }, 780);
    return () => window.clearInterval(id);
  }, []);

  const avgPct =
    cells.reduce((s, c) => s + pctFromOpen(c.price, c.open), 0) / Math.max(cells.length, 1);
  const mktUp = avgPct >= 0;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b12]/92 p-4 shadow-[0_0_80px_rgba(122,43,255,0.12)]">
      <div className="mb-3 flex items-center justify-between px-1">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-fog">Crypto market</p>
          <p className="mt-1 text-lg text-paper">
            $3.42T{" "}
            <span
              key={mktTick}
              className={`mkt-header-pct text-sm tabular-nums ${mktUp ? "text-long" : "text-short"}`}
            >
              {mktUp ? "+" : ""}
              {avgPct.toFixed(2)}%
            </span>
          </p>
        </div>
        <div className="flex gap-2 text-[11px] tracking-wide text-fog">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-paper">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full bg-long"
              style={{ animation: "ob-pulse 1.4s ease-in-out infinite" }}
            />
            24H
          </span>
          <span className="rounded-full px-2.5 py-1">7D</span>
          <span className="rounded-full px-2.5 py-1">30D</span>
        </div>
      </div>
      <div className="relative flex h-[280px] flex-wrap content-start gap-1.5 overflow-hidden rounded-xl">
        <div className="mkt-tiles-layer absolute inset-0 flex flex-wrap content-start gap-1.5 overflow-hidden p-0">
          {cells.map((c) => {
            const pct = pctFromOpen(c.price, c.open);
            const up = pct >= 0;
            return (
              <div
                key={c.t}
                className={`mkt-tile relative flex flex-col justify-between overflow-hidden rounded-lg p-3 ${
                  up ? "bg-long/25" : "bg-short/20"
                } ${c.flash > 0 ? (up ? "mkt-flash-up" : "mkt-flash-down") : ""}`}
                style={{ width: `calc(${c.w} - 4px)`, height: c.h }}
              >
                <span
                  className="mkt-price-bg pointer-events-none absolute inset-0 flex items-center justify-center tabular-nums"
                  aria-hidden
                >
                  {fmtUsd(c.price, c.decimals)}
                </span>
                <span className="relative z-[1] text-sm font-medium text-paper/80">{c.t}</span>
                <div className="relative z-[1] flex items-end justify-between gap-2">
                  <span className="text-[11px] tabular-nums text-paper/55">
                    ${fmtUsd(c.price, c.decimals)}
                  </span>
                  <span className={`text-xs tabular-nums ${up ? "text-long" : "text-short"}`}>
                    {up ? "+" : ""}
                    {pct.toFixed(2)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mkt-veil pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center p-4">
          <div className="mkt-seal rounded-xl border border-violet/40 bg-[#0b0b12]/92 px-5 py-3.5 text-center backdrop-blur-md">
            <p className="brand text-[11px] tracking-[0.22em] text-sky">Positions hidden</p>
            <p className="mt-1 text-sm text-fog">No public map of who is long or short</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SettlementVisual() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b12]/92 p-5 shadow-[0_0_80px_rgba(61,92,255,0.12)] md:p-8">
      <div className="grid gap-6 md:grid-cols-[1fr_auto_1fr] md:items-center">
        <div className="space-y-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-fog">Private notes</p>
          {["0x7a…e21", "0x3f…91c", "0xb2…04d"].map((n, i) => (
            <div
              key={n}
              className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3"
              style={{ opacity: 1 - i * 0.15 }}
            >
              <span className="mono text-sm text-paper">{n}</span>
              <span className="text-xs text-fog">commitment</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col items-center gap-2 py-2">
          <div className="h-px w-16 bg-gradient-to-r from-magenta via-violet to-cobalt md:h-20 md:w-px md:bg-gradient-to-b" />
          <p className="brand text-[10px] tracking-[0.2em] text-sky">ZK proof</p>
          <div className="h-px w-16 bg-gradient-to-r from-cobalt via-violet to-magenta md:h-20 md:w-px md:bg-gradient-to-b" />
        </div>
        <div className="rounded-xl border border-cobalt/30 bg-cobalt/10 p-5">
          <p className="text-[11px] uppercase tracking-[0.18em] text-sky">Settlement</p>
          <p className="mt-3 text-2xl text-paper">Verified</p>
          <p className="mt-2 text-sm leading-relaxed text-fog">
            Chain accepts the proof. Size, side, and margin never appear in plaintext.
          </p>
          <div className="mt-5 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-long" />
            <span className="text-xs text-fog">Nullifier spent · note inserted</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SideToggleVisual() {
  return (
    <div className="overflow-hidden rounded-2xl border border-violet/30 bg-[#0b0b12] p-2 shadow-[0_0_60px_rgba(122,43,255,0.15)]">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-gradient-to-br from-long to-[#1a7a6e] px-6 py-8 text-center">
          <p className="brand text-xl tracking-[0.28em] text-white md:text-2xl">Long</p>
        </div>
        <div className="rounded-xl border border-white/8 px-6 py-8 text-center">
          <p className="brand text-xl tracking-[0.28em] text-white/55 md:text-2xl">Short</p>
        </div>
      </div>
    </div>
  );
}
