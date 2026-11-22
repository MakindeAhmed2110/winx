import { useState } from "react";
import { usePrivyStatus } from "../auth/privy-status";
import { PrivyAddressSync } from "../../hooks/useSessionAddress";
import { useTradeDesk } from "../../hooks/useTradeDesk";
import { useMediaQuery } from "../../lib/use-media-query";
import { MarketTicker } from "./MarketTicker";
import { OrderBook } from "./OrderBook";
import { OrderForm } from "./OrderForm";
import { PositionsPanel } from "./PositionsPanel";
import { TradeHeader } from "./TradeHeader";
import { TradeSuccessModal } from "./TradeSuccessModal";
import { TradingChart } from "./TradingChart";

/** Book sits beside the chart only from this width (matches example/frontend). */
const BOOK_BESIDE_CHART = "(min-width: 1280px)";
const DESKTOP = "(min-width: 1024px)";
const EASE = "duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]";

/**
 * Layout mirrors example/frontend TerminalView:
 * main column → pair+stats, chart|book, positions
 * right rail → order form
 * Below lg, `display: contents` + order so the form sits under the chart.
 */
export function TradePage() {
  const desk = useTradeDesk();
  const privyStatus = usePrivyStatus();
  const [bookCollapsed, setBookCollapsed] = useState(false);
  const [bookOpenMobile, setBookOpenMobile] = useState(false);
  const bookBeside = useMediaQuery(BOOK_BESIDE_CHART);
  const desktop = useMediaQuery(DESKTOP);
  const bookHidden = bookBeside ? bookCollapsed : !desktop && !bookOpenMobile;

  return (
    <div className="trade-desk relative flex h-dvh min-h-[780px] flex-col overflow-hidden text-paper">
      <div className="noise opacity-[0.06]" />
      {privyStatus === "ready" ? <PrivyAddressSync onAddress={desk.onPrivyAddress} /> : null}

      <TradeHeader
        onFaucetClaimed={() => {
          void desk.refetchUsdw?.();
        }}
      />

      <div className="trade-shell relative z-10 mx-2 mb-2 min-h-0 flex-1 md:mx-2.5 md:mb-2.5">
        <div className="trade-shell-inner relative z-[1] h-full min-h-0">
          <div className="no-scrollbar flex h-full flex-col gap-5 overflow-x-hidden overflow-y-auto overscroll-x-none px-4 pt-4 pb-6 sm:px-6 lg:flex-row lg:gap-0 lg:overflow-hidden lg:p-0">
            <div className="no-scrollbar max-lg:contents lg:min-w-0 lg:flex-1 lg:overflow-auto lg:pt-[22px] lg:pr-[11px] lg:pb-6 lg:pl-2">
              <div className="max-lg:order-1">
                <MarketTicker
                  marketKey={desk.marketKey}
                  onSelect={desk.selectMarket}
                  markUsd={desk.markUsd}
                />
              </div>

              <div className="trade-chart-book max-lg:contents lg:mt-[26px] lg:flex lg:flex-col lg:items-stretch lg:gap-4 xl:flex-row xl:items-stretch xl:gap-2">
                <div className="flex min-w-0 max-lg:order-2 lg:min-w-0 lg:flex-1">
                  <div className="trade-chart-wrap w-full min-w-0">
                    <TradingChart marketKey={desk.marketKey} />
                  </div>
                </div>

                <div className="shrink-0 max-lg:order-4 xl:self-stretch" id="markets">
                  <button
                    type="button"
                    aria-expanded={bookOpenMobile}
                    onClick={() => setBookOpenMobile((v) => !v)}
                    className="trade-book-mobile-toggle flex w-full items-center justify-between px-4 py-3 lg:hidden"
                  >
                    <span className="text-sm whitespace-nowrap">Order book &amp; trades</span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs whitespace-nowrap text-fog">
                        {bookOpenMobile ? "Hide" : "Show"}
                      </span>
                      <img
                        src="/logo/icon-caret-down.svg"
                        alt=""
                        className={`size-5 transition-transform ${EASE} ${
                          bookOpenMobile ? "rotate-180" : ""
                        }`}
                      />
                    </span>
                  </button>

                  {/* Mobile: collapsible grid. Desktop: always full height beside chart. */}
                  <div
                    className={`grid lg:hidden ${EASE} ${
                      bookOpenMobile ? "mt-2 grid-rows-[1fr]" : "grid-rows-[0fr]"
                    }`}
                  >
                    <div className="min-h-0 overflow-hidden">
                      <OrderBook
                        marketKey={desk.marketKey}
                        collapsed={bookHidden}
                        collapsible={false}
                        onToggle={() => setBookCollapsed((v) => !v)}
                      />
                    </div>
                  </div>

                  <div className="trade-book-desktop hidden h-full lg:block">
                    <OrderBook
                      marketKey={desk.marketKey}
                      collapsed={bookHidden}
                      collapsible={bookBeside}
                      onToggle={() => setBookCollapsed((v) => !v)}
                    />
                  </div>
                </div>
              </div>

              <div className="max-lg:order-5 lg:mt-5" id="portfolio">
                <PositionsPanel desk={desk} />
              </div>
            </div>

            <aside className="no-scrollbar max-lg:contents lg:h-full lg:w-[360px] lg:shrink-0 lg:overflow-x-hidden lg:overflow-y-auto lg:border-l lg:border-white/10 xl:w-[388px]">
              <div className="relative max-lg:contents lg:flex lg:flex-col lg:px-4 lg:pt-[27px] lg:pb-[27px]">
                <div className="max-lg:order-3 max-lg:border-y max-lg:border-white/10 max-lg:py-6">
                  <OrderForm desk={desk} />
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>

      <footer className="relative z-20 flex h-7 shrink-0 items-center justify-between border-t border-white/[0.08] bg-black px-4 text-[10px] uppercase tracking-[0.14em] text-fog">
        <span className="inline-flex items-center gap-1.5 text-long">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-long" />
          Online
        </span>
        <span>Powered by Winx v1.0</span>
      </footer>

      {desk.success && (
        <TradeSuccessModal
          result={desk.success}
          onClose={desk.dismissSuccess}
          onPrimary={() => {
            desk.setBottomTab(desk.success?.kind === "close" ? "notes" : "positions");
          }}
        />
      )}
    </div>
  );
}
