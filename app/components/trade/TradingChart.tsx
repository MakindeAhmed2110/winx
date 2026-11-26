import { useEffect, useRef } from "react";
import { markets } from "../../lib/config";
import type { MarketKey } from "../../hooks/useTradeDesk";

declare global {
  interface Window {
    TradingView?: {
      widget: new (opts: Record<string, unknown>) => unknown;
    };
  }
}

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

  useEffect(() => {
    let cancelled = false;
    const host = containerRef.current;
    const symbol = markets[marketKey].tv;
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
  }, [marketKey]);

  return (
    <div className="trade-chart relative h-[420px] w-full overflow-hidden bg-black sm:h-[561px] xl:h-full xl:min-h-[561px]">
      <div ref={containerRef} className="absolute inset-0" />
    </div>
  );
}
