import { useEffect, useState } from "react";
import { fetchCmcChart, slicePoints } from "../lib/cmc";
import { fetchRhQuote } from "../lib/rh";
import { extendedMarketStatsUrl, liveMarketFetch, parseMarketStats, type MarketStats } from "../lib/market-stats";
import type { ListedMarket, RangeId } from "../lib/markets-board";

const RANGE_SECONDS: Record<RangeId, number> = {
  "1d": 86_400,
  "2d": 172_800,
  "7d": 604_800,
  "2w": 1_209_600,
  "1m": 2_592_000,
};

const CMC_RANGE: Record<RangeId, string> = {
  "1d": "1D",
  "2d": "7D",
  "7d": "7D",
  "2w": "1M",
  "1m": "1M",
};

export type BoardQuote = {
  stats?: MarketStats;
  closes: number[];
};

async function fetchStats(extendedMarket: string): Promise<MarketStats | null> {
  const res = await fetch(extendedMarketStatsUrl(extendedMarket), liveMarketFetch);
  if (!res.ok) return null;
  const body = (await res.json()) as {
    status: string;
    data?: { marketStats: Record<string, string | number> }[];
  };
  if (body.status !== "OK" || !body.data?.[0]?.marketStats) return null;
  return parseMarketStats(body.data[0].marketStats);
}

async function fetchSeries(market: ListedMarket, range: RangeId) {
  const points = slicePoints(await fetchCmcChart(market.cmcId, CMC_RANGE[range]), RANGE_SECONDS[range]);
  const closes = points.map((point) => point.price);
  const volume = points[points.length - 1]?.volume ?? 0;
  return { closes, volume };
}

function statsFromSeries(closes: number[], volume: number): MarketStats {
  const first = closes[0] ?? 0;
  const last = closes[closes.length - 1] ?? 0;
  return {
    lastPrice: last,
    markPrice: last,
    indexPrice: Number.NaN,
    bidPrice: last,
    askPrice: last,
    dailyChange: last - first,
    dailyChangePct: first ? ((last - first) / first) * 100 : 0,
    dailyHigh: closes.length ? Math.max(...closes) : last,
    dailyLow: closes.length ? Math.min(...closes) : last,
    dailyVolume: volume,
    openInterest: Number.NaN,
    fundingRate: Number.NaN,
    nextFundingTs: 0,
  };
}

/** Live Extended marks, funding, and range candles for the listed markets. */
export function useMarketsBoard(listed: ListedMarket[] | null, range: RangeId) {
  const [quotes, setQuotes] = useState<Record<string, BoardQuote>>({});
  const key = listed?.map((market) => market.key).join("|") ?? "";

  useEffect(() => {
    if (!listed?.length) return;
    let cancelled = false;

    const loadStats = async () => {
      const next: Record<string, MarketStats> = {};
      await Promise.all(
        listed.map(async (market) => {
          try {
            if (market.extendedMarket) {
              const stats = await fetchStats(market.extendedMarket);
              if (stats) next[market.key] = stats;
              return;
            }
            if (!market.rh) return;
            const quote = await fetchRhQuote(market.rh);
            if (quote.price == null) return;
            next[market.key] = statsFromSeries([quote.price, quote.price], quote.volume ?? 0);
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
      const next: Record<string, { closes: number[]; volume: number; quoteOnly: boolean }> = {};
      await Promise.all(
        listed.map(async (market) => {
          if (!market.cmcId) return;
          try {
            const series = await fetchSeries(market, range);
            next[market.key] = { ...series, quoteOnly: !market.extendedMarket };
          } catch {
            next[market.key] = { closes: [], volume: 0, quoteOnly: !market.extendedMarket };
          }
        }),
      );
      if (cancelled) return;
      setQuotes((prev) => {
        const merged = { ...prev };
        for (const [id, series] of Object.entries(next)) {
          const stats = series.quoteOnly ? statsFromSeries(series.closes, series.volume) : prev[id]?.stats;
          merged[id] = { stats, closes: series.closes };
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
