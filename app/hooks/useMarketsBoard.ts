import { useEffect, useState } from "react";
import { parseMarketStats, type MarketStats } from "../lib/market-stats";
import { rangeSpec, type ListedMarket, type RangeId } from "../lib/markets-board";

export type BoardQuote = {
  stats?: MarketStats;
  closes: number[];
};

async function fetchStats(extendedMarket: string): Promise<MarketStats | null> {
  const res = await fetch(
    `/extended/api/v1/info/markets?market=${encodeURIComponent(extendedMarket)}`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) return null;
  const body = (await res.json()) as {
    status: string;
    data?: { marketStats: Record<string, string | number> }[];
  };
  if (body.status !== "OK" || !body.data?.[0]?.marketStats) return null;
  return parseMarketStats(body.data[0].marketStats);
}

async function fetchCloses(extendedMarket: string, range: RangeId): Promise<number[]> {
  const spec = rangeSpec(range);
  const res = await fetch(
    `/extended/api/v1/info/candles/${encodeURIComponent(extendedMarket)}/trades?interval=${spec.interval}&limit=${spec.limit}`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) return [];
  const body = (await res.json()) as {
    status: string;
    data?: { c: string; T: number }[];
  };
  if (body.status !== "OK" || !body.data) return [];
  return [...body.data]
    .sort((a, b) => a.T - b.T)
    .map((candle) => Number(candle.c))
    .filter((close) => Number.isFinite(close));
}

/** Live Extended marks, funding, and range candles for the listed markets. */
export function useMarketsBoard(listed: ListedMarket[] | null, range: RangeId) {
  const [quotes, setQuotes] = useState<Record<string, BoardQuote>>({});
  const key = listed?.map((market) => market.extendedMarket).join("|") ?? "";

  useEffect(() => {
    if (!listed?.length) return;
    let cancelled = false;

    const loadStats = async () => {
      const next: Record<string, MarketStats> = {};
      await Promise.all(
        listed.map(async (market) => {
          try {
            const stats = await fetchStats(market.extendedMarket);
            if (stats) next[market.key] = stats;
          } catch {
            // keep the last quote
          }
        }),
      );
      if (cancelled) return;
      setQuotes((prev) => {
        const merged = { ...prev };
        for (const [id, stats] of Object.entries(next)) {
          merged[id] = { closes: prev[id]?.closes ?? [], stats };
        }
        return merged;
      });
    };

    void loadStats();
    const id = window.setInterval(() => void loadStats(), 3_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [key, listed]);

  useEffect(() => {
    if (!listed?.length) return;
    let cancelled = false;

    const loadCandles = async () => {
      const next: Record<string, number[]> = {};
      await Promise.all(
        listed.map(async (market) => {
          try {
            next[market.key] = await fetchCloses(market.extendedMarket, range);
          } catch {
            next[market.key] = [];
          }
        }),
      );
      if (cancelled) return;
      setQuotes((prev) => {
        const merged = { ...prev };
        for (const [id, closes] of Object.entries(next)) {
          merged[id] = { stats: prev[id]?.stats, closes };
        }
        return merged;
      });
    };

    void loadCandles();
    const id = window.setInterval(() => void loadCandles(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [key, range, listed]);

  return quotes;
}
