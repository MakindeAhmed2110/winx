/** Extended sends `cache-control: max-age=60`, so a plain poll repeats the same print for a minute. */
export function extendedMarketStatsUrl(market: string): string {
  const q = new URLSearchParams({ market, _: String(Date.now()) });
  return `/extended/api/v1/info/markets?${q}`;
}

export const liveMarketFetch: RequestInit = {
  cache: "no-store",
  headers: { Accept: "application/json" },
};

export function parseMarketStats(raw: Record<string, string | number>): MarketStats {
  const n = (k: string) => Number(raw[k] ?? 0);
  return {
    lastPrice: n("lastPrice"),
    markPrice: n("markPrice"),
    indexPrice: n("indexPrice"),
    bidPrice: n("bidPrice"),
    askPrice: n("askPrice"),
    dailyChange: n("dailyPriceChange"),
    dailyChangePct: n("dailyPriceChangePercentage") * 100,
    dailyHigh: n("dailyHigh"),
    dailyLow: n("dailyLow"),
    dailyVolume: n("dailyVolume"),
    openInterest: n("openInterest"),
    fundingRate: n("fundingRate") * 100,
    nextFundingTs: n("nextFundingRate"),
  };
}

export interface MarketStats {
  lastPrice: number;
  markPrice: number;
  indexPrice: number;
  bidPrice: number;
  askPrice: number;
  dailyChange: number;
  dailyChangePct: number;
  dailyHigh: number;
  dailyLow: number;
  dailyVolume: number;
  openInterest: number;
  fundingRate: number;
  nextFundingTs: number;
}
