import { useEffect, useState } from "react";
import { parseMarketStats, type MarketStats } from "../lib/market-stats";

/** Live Extended market stats via the Vite `/extended` proxy (SPA has no SSR loaders). */
export function useMarketStats(market: string, intervalMs = 3000) {
  const [data, setData] = useState<MarketStats | undefined>(undefined);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!market) return;
    let cancelled = false;
    let controller: AbortController | undefined;

    const tick = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const res = await fetch(
          `/extended/api/v1/info/markets?market=${encodeURIComponent(market)}`,
          { signal: controller.signal, headers: { Accept: "application/json" } },
        );
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as {
          status: string;
          data?: { marketStats: Record<string, string | number> }[];
        };
        if (body.status !== "OK" || !body.data?.[0]?.marketStats) {
          throw new Error("bad payload");
        }
        if (!cancelled) {
          setData(parseMarketStats(body.data[0].marketStats));
          setError(false);
        }
      } catch (err) {
        if (
          !cancelled &&
          !(err instanceof DOMException && err.name === "AbortError")
        ) {
          setError(true);
        }
      }
    };

    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => {
      cancelled = true;
      controller?.abort();
      window.clearInterval(id);
    };
  }, [market, intervalMs]);

  return { data, error, loading: !data && !error };
}
