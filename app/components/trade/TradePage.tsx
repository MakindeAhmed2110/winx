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
import { CardGlow, type GlowLayer } from "../CardGlow";
import { PageBackdrop } from "../PageBackdrop";
import { TradeFooter } from "./TradeFooter";
import { TradeHeader } from "./TradeHeader";
import { TradeSuccessModal } from "./TradeSuccessModal";
import { TradingChart } from "./TradingChart";

/**
 * The market card's two Figma glows (card 1261 x 649.94 in Figma).
 *
 * The TradingView chart paints an opaque background, which would hide a glow
 * placed behind it, so here the glow sits on top at 10%. Over the card's
 * near-black background that looks the same as a glow behind it. (A screen
 * blend doesn't reach into the chart's iframe in Chrome, so this uses normal
 * blending.)
 */
const MARKET_GLOW: readonly GlowLayer[] = [
  { left: "-63.8%", top: "3%", width: "220.8%", height: "52.59%", rotate: 37.2 },
  { left: "7.0%", top: "-40.77%", width: "134.57%", height: "89.26%", rotate: 30.1 },
];

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
    <div className="trade-desk relative isolate flex h-dvh min-h-0 flex-col overflow-hidden text-paper lg:min-h-[780px]">
      <PageBackdrop bottom />
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
            {/* Figma left column: the market card (ticker, chart, book) and the
                account panel under it, 10px apart. The account panel takes the
                rest of the height; below ~1117px tall the column scrolls. */}
            <div className="no-scrollbar max-lg:contents lg:flex lg:min-w-0 lg:flex-1 lg:flex-col lg:gap-2.5 lg:overflow-y-auto">
              {/* Figma market card: black 82% with two faint purple glows, a 1px
                  white 7% inside stroke and 10px padding inside the stroke.
                  z-[1] keeps the market dropdown above the account panel where
                  it hangs past the card. Figma also gives the card a 40.95px
                  backdrop blur; it's left off because the page behind is a
                  flat colour (so it changes nothing) and a blur here would stop
                  the dropdown's own blur reaching the account panel. */}
              <div className="max-lg:contents lg:relative lg:z-[1] lg:isolate lg:flex lg:shrink-0 lg:flex-col lg:gap-2.5 lg:bg-black/[0.82] lg:p-[11px] lg:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]">
                <CardGlow layers={MARKET_GLOW} className="z-[5]" />
                <div className="max-lg:order-1 lg:p-2.5">
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

              {/* Figma: chart (fills) beside the 342px book, 566.94px tall. Below
                  1280px the book drops under the chart. */}
              <div className="trade-chart-book max-lg:contents lg:flex lg:flex-col lg:items-stretch lg:gap-2.5 xl:h-[566.94px] xl:flex-row xl:gap-0">
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
              </div>

              <div className="max-lg:order-5 lg:flex lg:min-h-[344px] lg:flex-1 lg:flex-col" id="portfolio">
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

      <TradeFooter />

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
