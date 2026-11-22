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
