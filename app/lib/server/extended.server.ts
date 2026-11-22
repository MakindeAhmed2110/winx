import type { MarketStats } from "../market-stats";

export type { MarketStats };

const BASE =
  process.env.EXTENDED_API_URL ?? "https://api.starknet.extended.exchange/api/v1";

const cache = new Map<string, { at: number; value: unknown }>();

async function getJson<T>(path: string, ttlMs: number): Promise<T> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;

  const res = await fetch(`${BASE}${path}`, {
    headers: { "User-Agent": "winx-perp/1.0", Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Extended ${path} → HTTP ${res.status}`);
  const body = (await res.json()) as {
    status: string;
    data: T;
    error?: { message: string };
  };
  if (body.status !== "OK") {
    throw new Error(`Extended ${path} → ${body.error?.message ?? body.status}`);
  }
  cache.set(path, { at: Date.now(), value: body.data });
  return body.data;
}

interface RawMarket {
  name: string;
  marketStats: Record<string, string | number>;
}

export async function getMarketStats(market: string): Promise<MarketStats> {
  const [m] = await getJson<RawMarket[]>(
    `/info/markets?market=${encodeURIComponent(market)}`,
    2_000,
  );
  if (!m) throw new Error(`Unknown Extended market ${market}`);
  const s = m.marketStats;
  const n = (k: string) => Number(s[k] ?? 0);
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
