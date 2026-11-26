import { useEffect, useState } from "react";
import { fetchCmcChart, quoteFromPoints, type CmcQuote } from "../lib/cmc";

const EMPTY: CmcQuote = { price: null, change: null, changePct: null, volume: null };

/** Latest CoinMarketCap print for one asset. Shares the chart cache. */
export function useCmcQuote(id: number | undefined, range = "1D") {
  const [quote, setQuote] = useState<CmcQuote>(EMPTY);

  useEffect(() => {
    if (!id) {
      setQuote(EMPTY);
      return;
    }
    let cancelled = false;
    setQuote(EMPTY);
    const load = async () => {
      try {
        const points = await fetchCmcChart(id, range);
        if (!cancelled) setQuote(quoteFromPoints(points));
      } catch {
        // keep the last print
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [id, range]);

  return quote;
}
