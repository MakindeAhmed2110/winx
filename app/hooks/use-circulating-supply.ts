import { useEffect, useState } from "react";
import type { MarketKey } from "./useTradeDesk";

/**
 * Circulating supply per market, for the ticker's MCAP (supply × live mark).
 * The Extended stats feed has no market cap, so supply comes from CoinGecko's
 * public API. Supply moves slowly: one request covers every market, results
 * are shared across mounts, and they refresh every 10 minutes.
 */
const COINGECKO_ID: Record<MarketKey, string> = { btc: "bitcoin", eth: "ethereum" };
const SUPPLY_URL = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${Object.values(
  COINGECKO_ID,
).join(",")}`;
const REFRESH_MS = 10 * 60_000;

type Supply = Record<string, number>;

let cache: { at: number; supply: Supply } | null = null;
let inflight: Promise<Supply> | null = null;

function loadSupply(): Promise<Supply> {
  if (cache && Date.now() - cache.at < REFRESH_MS) return Promise.resolve(cache.supply);
  inflight ??= fetch(SUPPLY_URL, { headers: { Accept: "application/json" } })
    .then((res) => {
      if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
      return res.json() as Promise<{ id: string; circulating_supply: number | null }[]>;
    })
    .then((rows) => {
      const supply: Supply = {};
      for (const row of rows) {
        if (row.circulating_supply && row.circulating_supply > 0) {
          supply[row.id] = row.circulating_supply;
        }
      }
      cache = { at: Date.now(), supply };
      return supply;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Circulating supply for the market, or null until it loads (or if it can't). */
export function useCirculatingSupply(marketKey: MarketKey): number | null {
  const id = COINGECKO_ID[marketKey];
  const [supply, setSupply] = useState<number | null>(() => cache?.supply[id] ?? null);

  useEffect(() => {
    let cancelled = false;
    // Never pair one market's supply with another market's price.
    setSupply(cache?.supply[id] ?? null);
    const load = () =>
      loadSupply()
        .then((s) => {
          if (!cancelled) setSupply(s[id] ?? null);
        })
        // Keep the last value (or the dash) if CoinGecko is down or rate-limited.
        .catch(() => {});
    void load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [id]);

  return supply;
}
