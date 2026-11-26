import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { usePrivyStatus } from "../auth/privy-status";
import { PrivyAddressSync } from "../../hooks/useSessionAddress";
import { useTradeDesk } from "../../hooks/useTradeDesk";
import { useMediaQuery } from "../../lib/use-media-query";
import { MarketTicker } from "./MarketTicker";
import { MobileOrderSheet } from "./MobileOrderSheet";
import { MobileTradeDock } from "./MobileTradeDock";
import { OrderBook } from "./OrderBook";
import { OrderForm } from "./OrderForm";
import { PositionsPanel } from "./PositionsPanel";
import { TradeHeader } from "./TradeHeader";
import { TradeSuccessModal } from "./TradeSuccessModal";
import { TradingChart } from "./TradingChart";

/** Book sits beside the chart only from this width (matches example/frontend). */
const BOOK_BESIDE_CHART = "(min-width: 1280px)";
const DESKTOP = "(min-width: 1024px)";

type MobilePane = "chart" | "book" | "trades";

/**
 * Layout mirrors example/frontend TerminalView:
 * main column → pair+stats, chart|book, positions
 * right rail → order form
 * Below lg, Figma mobile: chart tabs, positions, LONG/SHORT + bottom nav.
 */
export function TradePage() {
  const desk = useTradeDesk();
  const location = useLocation();
  const navigate = useNavigate();
  const privyStatus = usePrivyStatus();
  const [bookCollapsed, setBookCollapsed] = useState(false);
  const [mobilePane, setMobilePane] = useState<MobilePane>("chart");
  const [orderOpen, setOrderOpen] = useState(false);
  const bookBeside = useMediaQuery(BOOK_BESIDE_CHART);
  const desktop = useMediaQuery(DESKTOP);
  const bookHidden = bookBeside ? bookCollapsed : false;
  const navActive =
    location.hash === "#portfolio" ? "portfolio" : "perps";

  useEffect(() => {
    if (location.hash === "#portfolio") {
      navigate("/portfolio", { replace: true });
    }
  }, [location.hash, navigate]);

  const openSide = (long: boolean) => {
    desk.setIsLong(long);
    setOrderOpen(true);
  };

  return (
    <div className="trade-desk relative flex h-dvh min-h-0 flex-col overflow-hidden text-paper lg:min-h-[780px]">
      <div className="noise opacity-[0.06]" />
      {privyStatus === "ready" ? <PrivyAddressSync onAddress={desk.onPrivyAddress} /> : null}

      <TradeHeader
        onFaucetClaimed={() => {
          void desk.refetchUsdw?.();
        }}
      />

      {/* Desktop frame from Figma (1728 x 1117): content 25px from each side,
          top at y 58 (1px under the 59px header), 23px above the 32px footer. */}
      <div className="trade-shell relative z-10 mx-0 mb-0 min-h-0 flex-1 md:mx-2.5 md:mb-2.5 lg:mx-[25px] lg:-mt-px lg:mb-[23px]">
        <div className="trade-shell-inner relative z-[1] h-full min-h-0">
          <div className="no-scrollbar flex h-full flex-col gap-4 overflow-x-hidden overflow-y-auto overscroll-x-none px-3 pt-3 pb-[148px] sm:px-6 lg:flex-row lg:gap-[10px] lg:overflow-hidden lg:p-0 lg:pb-0">
            <div className="no-scrollbar max-lg:contents lg:min-w-0 lg:flex-1 lg:overflow-auto lg:pt-[22px] lg:pr-[11px] lg:pb-6 lg:pl-2">
              <div className="max-lg:order-1">
                <MarketTicker
                  marketKey={desk.marketKey}
                  onSelect={desk.selectMarket}
                  markUsd={desk.markUsd}
                  leverage={desk.leverage}
                />
              </div>

              <div className="trade-mobile-panes max-lg:order-2 lg:hidden">
                {(
                  [
                    ["chart", "Chart"],
                    ["book", "Order book"],
                    ["trades", "Trades"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`trade-mobile-pane ${mobilePane === id ? "is-active" : ""}`}
                    onClick={() => setMobilePane(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="trade-chart-book max-lg:contents lg:mt-[26px] lg:flex lg:flex-col lg:items-stretch lg:gap-4 xl:flex-row xl:items-stretch xl:gap-2">
                <div
                  className={`flex min-w-0 max-lg:order-2 lg:min-w-0 lg:flex-1 ${
                    mobilePane === "chart" ? "" : "max-lg:hidden"
                  }`}
                >
                  <div className="trade-chart-wrap trade-chart-wrap-mobile w-full min-w-0">
                    <TradingChart marketKey={desk.marketKey} />
                  </div>
                </div>

                <div className="shrink-0 max-lg:order-4 xl:self-stretch" id="markets">
                  <div
                    className={`lg:hidden ${
                      mobilePane === "book" || mobilePane === "trades" ? "" : "hidden"
                    }`}
                  >
                    <OrderBook
                      marketKey={desk.marketKey}
                      collapsed={false}
                      collapsible={false}
                      forcedTab={mobilePane === "trades" ? "trades" : "book"}
                      hideTabs
                    />
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

            {/* Figma: 407 x 1004 order panel, 10px right of the left column. */}
            <aside className="hidden lg:block lg:h-full lg:w-[407px] lg:shrink-0">
              <OrderForm desk={desk} />
            </aside>
          </div>
        </div>
      </div>

      <footer className="relative z-20 hidden h-8 shrink-0 items-center justify-between border-t border-white/[0.08] bg-black px-4 text-[10px] uppercase tracking-[0.14em] text-fog lg:flex">
        <span className="inline-flex items-center gap-1.5 text-long">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-long" />
          Online
        </span>
        <span>Powered by Winx v1.0</span>
      </footer>

      <MobileTradeDock
        active={navActive}
        onLong={() => openSide(true)}
        onShort={() => openSide(false)}
      />

      {orderOpen && !desktop ? (
        <MobileOrderSheet desk={desk} onClose={() => setOrderOpen(false)} />
      ) : null}

      {desk.success && (!orderOpen || desktop) ? (
        <TradeSuccessModal
          result={desk.success}
          onClose={desk.dismissSuccess}
          onPrimary={() => {
            desk.setBottomTab(
              desk.success?.kind === "close"
                ? "notes"
                : desk.success?.kind === "unshield"
                  ? "balances"
                  : "positions",
            );
          }}
        />
      ) : null}
    </div>
  );
}
