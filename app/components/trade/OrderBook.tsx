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

/** Figma trims text boxes to cap height; this keeps boxes the same size here. */
const TRIM = "[text-box:trim-both_cap_alphabetic]";
/** Figma book text: Satoshi Regular 12px, -2% tracking, uppercase. */
const T12 = `text-[12px] uppercase leading-normal tracking-[-0.24px] tabular-nums ${TRIM}`;
/** Figma price colours: asks #f63c6b, bids #10edbf (trades: #f73b6b / #0fedbf). */
const ASK_TEXT = "text-[#f63c6b]";
const BID_TEXT = "text-[#10edbf]";

const ASK_GRADIENT =
  "linear-gradient(90deg, rgba(246,61,109,0.2) 2.8846%, rgba(246,61,109,0.116) 20.192%, rgba(246,61,109,0.073) 81.25%, rgba(246,61,109,0) 100%)";
const BID_GRADIENT =
  "linear-gradient(90deg, rgba(16,237,191,0.2) 2.8846%, rgba(16,237,191,0.116) 20.192%, rgba(16,237,191,0.073) 81.25%, rgba(16,237,191,0) 100%)";
/** Figma selected tab: white 10% under a purple-to-lavender fade at the bottom. */
const TAB_FILL =
  "linear-gradient(180deg, rgba(0,0,0,0) 50%, rgba(177,95,248,0.06) 76.923%, rgba(184,188,249,0.2) 100%), linear-gradient(90deg, rgba(255,255,255,0.1), rgba(255,255,255,0.1))";

/** Figma "Order book panel": 342px wide. */
export const ORDER_BOOK_WIDTH = 342;
const COLLAPSED_WIDTH = 40;
const EASE = "duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]";
const DEPTH = 6;
/** Figma Trades tab: 14 rows under the header. */
const TRADE_ROWS = 14;

const TABS = [
  ["book", "Order book"],
  ["trades", "Trades"],
] as const;

/** Price grouping steps per market (Extended tick sizes upward). */
const TICKS: Record<MarketKey, number[]> = {
  btc: [1, 10, 50, 100],
  eth: [0.1, 1, 5, 10],
};

const tickDecimals = (tick: number) =>
  tick >= 1 ? 0 : (String(tick).split(".")[1]?.length ?? 0);

/**
 * Figma "Order book panel" (Tab=Order book / Tab=Trades): 10px padding, 18px
 * between the tabs, the selectors and the table. Rows are 33px with 20px side
 * padding; the depth bar runs from the left with a 3px edge.
 */
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
        className={`absolute inset-y-0 left-0 flex h-full flex-col gap-[18px] overflow-hidden bg-black/70 p-2.5 transition-[opacity,translate] lg:bg-transparent ${EASE} ${
          collapsed ? "-translate-x-6 opacity-0" : "translate-x-0 opacity-100 delay-100"
        }`}
        style={{ width: collapsible ? ORDER_BOOK_WIDTH : "100%" }}
      >
        {hideTabs ? null : (
          // The 20px caret toggle sits at the right end of this row.
          <div className={`flex h-5 w-full shrink-0 ${collapsible ? "pr-5" : ""}`}>
            {TABS.map(([k, label]) => (
              <BookTabButton
                key={k}
                label={label}
                active={activeTab === k}
                onClick={() => setTab(k)}
              />
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
        className="absolute top-2.5 right-2.5 z-10 size-5 transition-opacity duration-200 hover:opacity-80"
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

/**
 * Figma book tab: 20px tall, 20px side padding, Orbitron SemiBold 11px.
 * Selected: white 10% fill with a purple fade and a 2px white stroke outside
 * the bottom edge. The stroke grows in like the positions tabs; hover shows
 * the fill at half strength, as on the order type tabs.
 */
function BookTabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="group relative flex h-5 min-w-px flex-1 items-center justify-center px-5 outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/35"
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-0 transition-opacity duration-200 ease-[cubic-bezier(0,0,0.58,1)] motion-reduce:transition-none ${
          active ? "opacity-100" : "opacity-0 group-hover:opacity-50"
        }`}
        style={{ backgroundImage: TAB_FILL }}
      />
      {active ? (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -bottom-0.5 h-0.5 origin-center animate-[trade-tab-in_0.3s_ease] bg-white motion-reduce:animate-none"
        />
      ) : null}
      <span
        className={`relative whitespace-nowrap font-display text-[11px] font-semibold uppercase leading-normal tracking-[0.88px] text-white ${TRIM}`}
      >
        {label}
      </span>
    </button>
  );
}

/**
 * Figma table header: 28px tall, 20px side padding, labels at 50%, with a 1px
 * white 20% line just under it. Rows start 10.94px below the row (10px gap
 * plus a 0.94px spacer in Figma).
 */
function HeaderRow({ cols }: { cols: readonly [string, string, string] }) {
  return (
    <div className="mb-[10.94px] flex h-7 w-full shrink-0 items-center gap-2.5 px-5 shadow-[0_1px_0_rgba(255,255,255,0.2)]">
      <span className="flex min-w-px flex-1 items-center">
        <span className={`whitespace-nowrap text-white opacity-50 ${T12}`}>{cols[0]}</span>
      </span>
      <span className="flex min-w-px flex-1 items-center">
        <span className={`whitespace-nowrap text-white opacity-50 ${T12}`}>{cols[1]}</span>
      </span>
      <span className="flex min-w-px flex-1 items-center justify-end">
        <span className={`whitespace-nowrap text-white opacity-50 ${T12}`}>{cols[2]}</span>
      </span>
    </div>
  );
}

function BookBody({ marketKey, live }: { marketKey: MarketKey; live: boolean }) {
  const market = markets[marketKey];
  const ticks = TICKS[marketKey];
  const [tickIndex, setTickIndex] = useState(0);
  const [unit, setUnit] = useState<SizeUnit>("coin");
  const tick = ticks[Math.min(tickIndex, ticks.length - 1)];

  useEffect(() => setTickIndex(0), [marketKey]);

  const book = useOrderBook(live ? market.extendedMarket : "", tick, DEPTH);
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
  const unitLabel = unit === "coin" ? symbol : "USD";

  return (
    <div className="flex h-full w-full flex-col items-start gap-[18px]">
      <div className="flex h-5 w-full shrink-0 items-center justify-between">
        <Dropdown
          label={formatNumber(tick, tickDecimals(tick))}
          onClick={() => setTickIndex((i) => (i + 1) % ticks.length)}
        />
        <Dropdown
          label={unitLabel}
          onClick={() => setUnit((u) => (u === "coin" ? "usd" : "coin"))}
        />
      </div>

      <div className="flex min-h-0 w-full flex-1 flex-col items-center">
        <HeaderRow cols={["Price", `Size (${unitLabel})`, `Total (${unitLabel})`]} />

        {!book.connected && book.asks.length === 0 ? (
          <div className="flex w-full flex-1 items-center justify-center">
            <span className={`animate-pulse whitespace-nowrap text-white opacity-50 ${T12}`}>
              Connecting to {market.extendedMarket}…
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
            {/* Figma spread row: 36px, centred, 50%. */}
            <div className="flex h-9 w-full shrink-0 items-center justify-center px-5">
              <span className={`whitespace-nowrap text-white opacity-50 ${T12}`}>
                Spread:{" "}
                {spread == null || mid == null
                  ? "—"
                  : `${formatNumber(spread, Math.max(priceDecimals, market.priceDecimals))} (${((spread / mid) * 100).toFixed(4)}%)`}
              </span>
            </div>
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
    </div>
  );
}

/** Figma selector: Satoshi 14px at 50% with a 20px caret, 6px apart. */
function Dropdown({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-5 items-center justify-center gap-1.5 opacity-50 transition-opacity duration-200 hover:opacity-80"
    >
      <span
        className={`whitespace-nowrap text-[14px] uppercase leading-normal tracking-[-0.28px] text-white ${TRIM}`}
      >
        {label}
      </span>
      <img src="/logo/icon-caret-down.svg" alt="" width={20} height={20} className="size-5" />
    </button>
  );
}

function EmptyRow() {
  return <div className="h-[33px] w-full shrink-0" />;
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
    <div className="book-in relative flex h-[33px] w-full shrink-0 items-center gap-2.5 overflow-clip px-5">
      <span
        aria-hidden
        className={`absolute top-1/2 left-0 h-[38px] -translate-y-1/2 border-l-[3px] transition-[width] duration-300 ease-out ${
          ask ? "border-[#f63d6d]" : "border-[#10edbf]"
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
        <span className={`whitespace-nowrap ${ask ? ASK_TEXT : BID_TEXT} ${T12}`}>
          ${formatNumber(level.price, priceDecimals)}
        </span>
      </span>
      <span className="relative flex min-w-px flex-1 items-center">
        <span className={`whitespace-nowrap text-white ${T12}`}>{size}</span>
      </span>
      <span className="relative flex min-w-px flex-1 items-center justify-end">
        <span className={`whitespace-nowrap text-white ${T12}`}>{total}</span>
      </span>
    </div>
  );
}

/** Figma Trades tab: the header, then 33px rows of price, size and time (50%). */
function TradesBody({ marketKey, live }: { marketKey: MarketKey; live: boolean }) {
  const market = markets[marketKey];
  const trades = usePublicTrades(market.extendedMarket, TRADE_ROWS, live);
  const symbol = marketKey.toUpperCase();

  return (
    <div className="flex h-full w-full flex-col items-start">
      <HeaderRow cols={["Price", `Size (${symbol})`, "Time"]} />
      {trades.length === 0 ? (
        <div className="flex w-full flex-1 items-center justify-center">
          <span className={`animate-pulse whitespace-nowrap text-white opacity-50 ${T12}`}>
            Waiting for trades…
          </span>
        </div>
      ) : (
        <div className="flex w-full flex-col overflow-hidden">
          {trades.map((t) => (
            <div
              key={t.id}
              className="book-in relative flex h-[33px] w-full shrink-0 items-center gap-2.5 overflow-clip px-5"
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
                  className={`whitespace-nowrap ${
                    t.side === "buy" ? "text-[#0fedbf]" : "text-[#f73b6b]"
                  } ${T12}`}
                >
                  ${formatNumber(t.price, market.priceDecimals)}
                </span>
              </span>
              <span className="relative flex min-w-px flex-1 items-center">
                <span className={`whitespace-nowrap text-white ${T12}`}>
                  {formatNumber(t.size, 4)}
                </span>
              </span>
              <span className="relative flex min-w-px flex-1 items-center justify-end">
                <span className={`whitespace-nowrap text-white opacity-50 ${T12}`}>
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
