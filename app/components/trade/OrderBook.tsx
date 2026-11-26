import { useEffect, useRef, useState } from "react";
import { markets } from "../../lib/config";
import { formatCompactUsd, formatNumber } from "../../lib/format";
import type { MarketKey } from "../../hooks/useTradeDesk";
import {
  useOrderBook,
  usePublicTrades,
  type BookLevel,
} from "../../hooks/use-order-book";

type BookTab = "book" | "trades";
type SizeUnit = "coin" | "usd";

const ASK_GRADIENT =
  "linear-gradient(90deg, rgba(246,61,109,0.2) 2.8846%, rgba(246,61,109,0.116) 20.192%, rgba(246,61,109,0.073) 81.25%, rgba(246,61,109,0) 100%)";
const BID_GRADIENT =
  "linear-gradient(90deg, rgba(16,237,191,0.2) 2.8846%, rgba(16,237,191,0.116) 20.192%, rgba(16,237,191,0.073) 81.25%, rgba(16,237,191,0) 100%)";

export const ORDER_BOOK_WIDTH = 352;
const COLLAPSED_WIDTH = 40;
const EASE = "duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]";
const DEPTH = 6;
const TRADE_ROWS = 13;

/** Price grouping steps per market (Extended tick sizes upward). */
const TICKS: Partial<Record<MarketKey, number[]>> = {
  btc: [1, 10, 50, 100],
  eth: [0.1, 1, 5, 10],
  bnb: [0.1, 0.5, 1, 5],
  xrp: [0.0001, 0.001, 0.01, 0.1],
  sol: [0.01, 0.1, 1, 5],
  trx: [0.0001, 0.001, 0.01],
  hype: [0.01, 0.1, 1, 5],
  zec: [0.1, 1, 5, 10],
  xmr: [0.1, 1, 5, 10],
  doge: [0.00001, 0.0001, 0.001, 0.01],
};

function ticksFor(key: MarketKey, decimals: number): number[] {
  return (
    TICKS[key] ??
    (decimals >= 4 ? [0.0001, 0.001, 0.01, 0.1] : decimals >= 2 ? [0.01, 0.1, 1, 5] : [1, 10, 50, 100])
  );
}

const tickDecimals = (tick: number) =>
  tick >= 1 ? 0 : (String(tick).split(".")[1]?.length ?? 0);

export function OrderBook({
  marketKey,
  collapsed = false,
  collapsible = false,
  onToggle,
  forcedTab,
  hideTabs = false,
}: {
  marketKey: MarketKey;
  collapsed?: boolean;
  /** Beside the chart: fixed width with the collapse toggle. Otherwise it fills its row. */
  collapsible?: boolean;
  onToggle?: () => void;
  forcedTab?: BookTab;
  hideTabs?: boolean;
}) {
  const [tab, setTab] = useState<BookTab>(forcedTab ?? "book");
  const live = !collapsed;
  const activeTab = forcedTab ?? tab;

  return (
    <section
      className={`trade-book relative h-[420px] shrink-0 overflow-hidden transition-[width] sm:h-[561px] xl:h-full ${EASE}`}
      style={{
        width: collapsible ? (collapsed ? COLLAPSED_WIDTH : ORDER_BOOK_WIDTH) : "100%",
      }}
    >
      <div
        inert={collapsed || undefined}
        className={`absolute inset-y-0 left-0 flex h-full flex-col gap-[18px] overflow-hidden bg-black/70 p-2.5 transition-[opacity,translate] ${EASE} ${
          collapsed ? "-translate-x-6 opacity-0" : "translate-x-0 opacity-100 delay-100"
        }`}
        style={{ width: collapsible ? ORDER_BOOK_WIDTH : "100%" }}
      >
        {hideTabs ? null : (
        <div className="flex w-full items-center gap-4 border-b border-white/[0.06]">
          {(
            [
              ["book", "Order book"],
              ["trades", "Trades"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={`trade-tab ${activeTab === k ? "is-active" : ""}`}
              onClick={() => setTab(k)}
            >
              {label}
            </button>
          ))}
        </div>
        )}

        <div key={activeTab} className="trade-swap min-h-0 flex-1 overflow-hidden">
          {activeTab === "book" ? (
            <BookBody marketKey={marketKey} live={live} />
          ) : (
            <TradesBody marketKey={marketKey} live={live} />
          )}
        </div>
      </div>

      <button
        type="button"
        hidden={!collapsible}
        aria-label={collapsed ? "Show order book" : "Hide order book"}
        aria-expanded={!collapsed}
        onClick={onToggle}
        className="absolute top-2.5 right-2.5 z-10 size-5 opacity-80 hover:opacity-100"
      >
        <img
          src="/logo/icon-caret-right.svg"
          alt=""
          className={`block size-full transition-transform ${EASE} ${
            collapsed ? "rotate-180" : ""
          }`}
        />
      </button>
    </section>
  );
}

function BookBody({ marketKey, live }: { marketKey: MarketKey; live: boolean }) {
  const market = markets[marketKey];
  const ticks = ticksFor(marketKey, market.priceDecimals);
  const [tickIndex, setTickIndex] = useState(0);
  const [unit, setUnit] = useState<SizeUnit>("coin");
  const tick = ticks[Math.min(tickIndex, ticks.length - 1)];

  useEffect(() => setTickIndex(0), [marketKey]);

  const book = useOrderBook(live ? market.book : "", tick, DEPTH);
  const asks = [...book.asks].reverse();
  const maxTotal = Math.max(
    book.asks.at(-1)?.total ?? 0,
    book.bids.at(-1)?.total ?? 0,
    Number.EPSILON,
  );
  const spread =
    book.bestAsk != null && book.bestBid != null ? book.bestAsk - book.bestBid : null;
  const mid = spread != null ? (book.bestAsk! + book.bestBid!) / 2 : null;
  const priceDecimals = Math.max(tickDecimals(tick), tickDecimals(ticks[0]));

  const fmtSize = (l: BookLevel, total = false) => {
    const qty = total ? l.total : l.size;
    return unit === "usd"
      ? formatCompactUsd(qty * l.price)
      : formatNumber(qty, qty >= 100 ? 2 : 4);
  };

  const symbol = marketKey.toUpperCase();

  return (
    <div className="flex h-full w-full flex-col items-start gap-[18px]">
      <div className="flex w-full items-center justify-between">
        <Dropdown
          label={formatNumber(tick, tickDecimals(tick))}
          onClick={() => setTickIndex((i) => (i + 1) % ticks.length)}
        />
        <Dropdown
          label={unit === "coin" ? symbol : "USD"}
          onClick={() => setUnit((u) => (u === "coin" ? "usd" : "coin"))}
        />
      </div>

      <div className="flex min-h-0 w-full flex-1 flex-col items-center">
        <div className="mb-1 flex w-full items-center gap-2.5 px-5 py-1">
          {["Price", "Size"].map((h) => (
            <span key={h} className="flex min-w-px flex-1 items-center">
              <span className="text-[11px] whitespace-nowrap text-fog uppercase tracking-wide">
                {h}
              </span>
            </span>
          ))}
          <span className="flex min-w-px flex-1 items-center justify-end">
            <span className="text-[11px] whitespace-nowrap text-fog uppercase tracking-wide">
              Total
            </span>
          </span>
        </div>

        {!market.book ? (
          <div className="flex h-full w-full items-center justify-center px-6 text-center">
            <span className="text-sm text-fog">No public book for this market.</span>
          </div>
        ) : !book.connected && book.asks.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center">
            <span className="animate-pulse text-sm text-fog">
              Connecting to {market.book}…
            </span>
          </div>
        ) : (
          <>
            {Array.from({ length: DEPTH }, (_, i) => {
              const level = asks[i - (DEPTH - asks.length)];
              return level ? (
                <BookRow
                  key={`a${level.price}`}
                  level={level}
                  side="ask"
                  maxTotal={maxTotal}
                  priceDecimals={priceDecimals}
                  size={fmtSize(level)}
                  total={fmtSize(level, true)}
                />
              ) : (
                <EmptyRow key={`ae${i}`} />
              );
            })}
            <Spread
              mid={mid}
              spread={spread}
              decimals={Math.max(priceDecimals, market.priceDecimals)}
            />
            {Array.from({ length: DEPTH }, (_, i) => {
              const level = book.bids[i];
              return level ? (
                <BookRow
                  key={`b${level.price}`}
                  level={level}
                  side="bid"
                  maxTotal={maxTotal}
                  priceDecimals={priceDecimals}
                  size={fmtSize(level)}
                  total={fmtSize(level, true)}
                />
              ) : (
                <EmptyRow key={`be${i}`} />
              );
            })}
          </>
        )}
      </div>

      <p className="w-full px-1 text-[10px] text-fog/70">
        Display book · your size never paints it
      </p>
    </div>
  );
}

function Spread({
  mid,
  spread,
  decimals,
}: {
  mid: number | null;
  spread: number | null;
  decimals: number;
}) {
  const prevMid = useRef<number | null>(null);
  const [dir, setDir] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (mid == null) return;
    if (prevMid.current != null && mid !== prevMid.current) {
      setDir(mid > prevMid.current ? "up" : "down");
    }
    prevMid.current = mid;
  }, [mid]);

  return (
    <div className="flex h-9 w-full items-center justify-between px-5 py-1.5">
      <span
        className={`flex items-center gap-1 whitespace-nowrap tabular-nums transition-colors duration-300 ${
          dir === "up"
            ? "text-[var(--trade-green)]"
            : dir === "down"
              ? "text-[var(--trade-red)]"
              : "text-paper"
        }`}
        style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500 }}
      >
        <span
          aria-hidden
          className={`inline-block text-[9px] transition-transform duration-300 ${
            dir === "down" ? "rotate-180" : ""
          } ${dir ? "opacity-100" : "opacity-0"}`}
        >
          ▲
        </span>
        {mid == null ? "—" : formatNumber(mid, decimals)}
      </span>
      <span className="whitespace-nowrap text-[11px] tabular-nums text-fog">
        Spread:{" "}
        {spread == null || mid == null
          ? "—"
          : `${formatNumber(spread, decimals)} (${((spread / mid) * 100).toFixed(4)}%)`}
      </span>
    </div>
  );
}

function Dropdown({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center gap-1.5 opacity-50 transition-opacity hover:opacity-80"
    >
      <span className="text-[12px] whitespace-nowrap text-paper">{label}</span>
      <img src="/logo/icon-caret-down.svg" alt="" className="size-5" />
    </button>
  );
}

function EmptyRow() {
  return <div className="h-[33px] w-full" />;
}

function BookRow({
  level,
  side,
  maxTotal,
  priceDecimals,
  size,
  total,
}: {
  level: BookLevel;
  side: "ask" | "bid";
  maxTotal: number;
  priceDecimals: number;
  size: string;
  total: string;
}) {
  const ask = side === "ask";
  const prevSize = useRef(level.size);
  const [flash, setFlash] = useState<{ id: number; grew: boolean } | null>(null);

  useEffect(() => {
    if (level.size === prevSize.current) return;
    setFlash((f) => ({ id: (f?.id ?? 0) + 1, grew: level.size > prevSize.current }));
    prevSize.current = level.size;
  }, [level.size]);

  return (
    <div className="book-in relative flex h-[33px] w-full items-center gap-2.5 overflow-clip px-5">
      <span
        aria-hidden
        className={`absolute top-1/2 left-0 h-[38px] -translate-y-1/2 border-l-[3px] transition-[width] duration-300 ease-out ${
          ask ? "border-[var(--trade-red)]" : "border-[var(--trade-green)]"
        }`}
        style={{
          width: `${Math.max(2, (level.total / maxTotal) * 100)}%`,
          backgroundImage: ask ? ASK_GRADIENT : BID_GRADIENT,
        }}
      />
      {flash && (
        <span
          key={flash.id}
          aria-hidden
          className={`book-flash pointer-events-none absolute inset-0 ${
            flash.grew === ask ? "bg-[#f63d6d]/15" : "bg-[#10edbf]/15"
          }`}
        />
      )}
      <span className="relative flex min-w-px flex-1 items-center">
        <span
          className={`whitespace-nowrap tabular-nums ${
            ask ? "text-[var(--trade-red)]" : "text-[var(--trade-green)]"
          }`}
          style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500 }}
        >
          {formatNumber(level.price, priceDecimals)}
        </span>
      </span>
      <span className="relative flex min-w-px flex-1 items-center">
        <span
          className="whitespace-nowrap tabular-nums text-paper"
          style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500 }}
        >
          {size}
        </span>
      </span>
      <span className="relative flex min-w-px flex-1 items-center justify-end">
        <span
          className="whitespace-nowrap tabular-nums text-paper"
          style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500 }}
        >
          {total}
        </span>
      </span>
    </div>
  );
}

function TradesBody({ marketKey, live }: { marketKey: MarketKey; live: boolean }) {
  const market = markets[marketKey];
  const trades = usePublicTrades(market.book, TRADE_ROWS, live && !!market.book);

  return (
    <div className="flex h-full w-full flex-col items-start gap-2.5">
      <div className="flex w-full items-center justify-between px-1">
        <span className="text-[11px] whitespace-nowrap text-fog">{market.book || market.pair}</span>
        <span className="flex items-center gap-1.5">
          <span className="relative flex size-1.5">
            <span
              className={`absolute inset-0 rounded-full bg-[var(--trade-green)] ${
                trades.length ? "animate-ping" : ""
              }`}
            />
            <span className="relative size-1.5 rounded-full bg-[var(--trade-green)]" />
          </span>
          <span className="text-[11px] whitespace-nowrap text-[var(--trade-green)]">Live</span>
        </span>
      </div>
      <div className="flex w-full items-center gap-2.5 px-5 py-1">
        {["Price", "Size", "Time (UTC)"].map((h, i) => (
          <span
            key={h}
            className={`flex min-w-px flex-1 items-center ${i === 2 ? "justify-end" : ""}`}
          >
            <span className="text-[11px] whitespace-nowrap text-fog uppercase tracking-wide">
              {h}
            </span>
          </span>
        ))}
      </div>
      {trades.length === 0 ? (
        <div className="flex flex-1 w-full items-center justify-center px-6 text-center">
          <span className={`text-sm text-fog ${market.book ? "animate-pulse" : ""}`}>
            {market.book ? "Waiting for trades…" : "No public trades for this market."}
          </span>
        </div>
      ) : (
        <div className="flex w-full flex-col overflow-hidden">
          {trades.map((t) => (
            <div
              key={t.id}
              className="book-in relative flex h-[33px] w-full items-center gap-2.5 overflow-clip px-5"
            >
              {t.fresh && (
                <span
                  aria-hidden
                  className={`book-flash pointer-events-none absolute inset-0 ${
                    t.side === "buy" ? "bg-[#10edbf]/20" : "bg-[#f63d6d]/20"
                  }`}
                />
              )}
              <span className="relative flex min-w-px flex-1 items-center">
                <span
                  className={`whitespace-nowrap tabular-nums ${
                    t.side === "buy"
                      ? "text-[var(--trade-green)]"
                      : "text-[var(--trade-red)]"
                  }`}
                  style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500 }}
                >
                  {formatNumber(t.price, market.priceDecimals)}
                </span>
              </span>
              <span className="relative flex min-w-px flex-1 items-center">
                <span
                  className="whitespace-nowrap tabular-nums text-paper"
                  style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500 }}
                >
                  {formatNumber(t.size, 4)}
                </span>
              </span>
              <span className="relative flex min-w-px flex-1 items-center justify-end">
                <span className="whitespace-nowrap text-[11px] tabular-nums text-fog">
                  {new Date(t.ts).toISOString().slice(11, 19)}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
