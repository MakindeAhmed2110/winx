import { useEffect, useRef } from "react";
import type { MarketKey } from "../../hooks/useTradeDesk";

declare global {
  interface Window {
    TradingView?: {
      widget: new (opts: Record<string, unknown>) => unknown;
    };
  }
}

const SYMBOLS: Record<MarketKey, string> = {
  btc: "BINANCE:BTCUSDT",
  eth: "BINANCE:ETHUSDT",
};

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

export function TradingChart({ marketKey }: { marketKey: MarketKey }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(`tv_${marketKey}_${Math.random().toString(36).slice(2, 9)}`);

  useEffect(() => {
    let cancelled = false;
    const host = containerRef.current;
    if (!host) return;

    host.innerHTML = "";
    const mount = document.createElement("div");
    mount.id = idRef.current;
    mount.style.height = "100%";
    mount.style.width = "100%";
    host.appendChild(mount);

    loadTradingView()
      .then(() => {
        if (cancelled || !window.TradingView) return;
        // eslint-disable-next-line no-new
        new window.TradingView.widget({
          autosize: true,
          symbol: SYMBOLS[marketKey],
          interval: "60",
          timezone: "Etc/UTC",
          theme: "dark",
          style: "1",
          locale: "en",
          // Transparent so the market card's background and glow show through,
          // as in Figma.
          toolbar_bg: "rgba(0, 0, 0, 0)",
          enable_publishing: false,
          // Figma chart: no top toolbar and no drawing tools; the date-range
          // bar (1D 5D 1M …) runs along the bottom.
          hide_top_toolbar: true,
          hide_side_toolbar: true,
          hide_legend: true,
          withdateranges: true,
          allow_symbol_change: false,
          details: false,
          hotlist: false,
          calendar: false,
          save_image: false,
          container_id: idRef.current,
          backgroundColor: "rgba(0, 0, 0, 0)",
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
          enabled_features: ["seconds_resolution"],
          overrides: {
            "paneProperties.background": "rgba(0, 0, 0, 0)",
            "paneProperties.backgroundType": "solid",
            "paneProperties.vertGridProperties.color": "rgba(255,255,255,0.1)",
            "paneProperties.vertGridProperties.style": 0,
            "paneProperties.horzGridProperties.color": "rgba(255,255,255,0.1)",
            "paneProperties.horzGridProperties.style": 0,
            "paneProperties.separatorColor": "rgba(255,255,255,0.12)",
            // Figma candles: #10edbf up, #f63d6d down.
            "mainSeriesProperties.candleStyle.upColor": "#10edbf",
            "mainSeriesProperties.candleStyle.downColor": "#f63d6d",
            "mainSeriesProperties.candleStyle.borderUpColor": "#10edbf",
            "mainSeriesProperties.candleStyle.borderDownColor": "#f63d6d",
            "mainSeriesProperties.candleStyle.wickUpColor": "#10edbf",
            "mainSeriesProperties.candleStyle.wickDownColor": "#f63d6d",
            // Last-price line (both naming variants — free widget is picky)
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
  }, [marketKey]);

  return (
    // Figma chart frame: rgba(1,2,4,0.2) fill and, beside the book, a 1px
    // inside stroke on its right edge (white 40% -> 100% top to bottom, at 20%).
    <div className="trade-chart relative h-[420px] w-full overflow-hidden bg-black sm:h-[561px] lg:bg-[rgba(1,2,4,0.2)] xl:h-full">
      <div ref={containerRef} className="absolute inset-0" />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-px bg-[linear-gradient(rgba(255,255,255,0.08),rgba(255,255,255,0.2))] xl:block"
      />
    </div>
  );
}
