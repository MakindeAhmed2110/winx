import { useEffect, useState } from "react";
import type { MarketKey } from "./useTradeDesk";

/**
 * Token supply per market, for the ticker's MCAP and FDV (supply × live mark).
 * The Extended stats feed has neither, so supply comes from CoinGecko's public
 * API. Supply moves slowly: one request covers every market, results are
 * shared across mounts, and they refresh every 10 minutes.
 */
const COINGECKO_ID: Record<MarketKey, string> = { btc: "bitcoin", eth: "ethereum" };
const SUPPLY_URL = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${Object.values(
  COINGECKO_ID,
).join(",")}`;
const REFRESH_MS = 10 * 60_000;

export type TokenSupply = {
  /** Coins in circulation (for market cap). */
  circulating: number;
  /**
   * Supply for fully diluted valuation: the max supply when the coin has one
   * (BTC: 21M), otherwise the total supply. CoinGecko's own FDV uses total
   * supply, which for BTC equals circulating and would make FDV match MCAP.
   */
  fullyDiluted: number;
};

type SupplyRow = {
  id: string;
  circulating_supply: number | null;
  total_supply: number | null;
  max_supply: number | null;
};

const positive = (n: number | null | undefined) => (n != null && n > 0 ? n : null);

let cache: { at: number; supply: Record<string, TokenSupply> } | null = null;
let inflight: Promise<Record<string, TokenSupply>> | null = null;

function loadSupply(): Promise<Record<string, TokenSupply>> {
  if (cache && Date.now() - cache.at < REFRESH_MS) return Promise.resolve(cache.supply);
  inflight ??= fetch(SUPPLY_URL, { headers: { Accept: "application/json" } })
    .then((res) => {
      if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
      return res.json() as Promise<SupplyRow[]>;
    })
    .then((rows) => {
      const supply: Record<string, TokenSupply> = {};
      for (const row of rows) {
        const circulating = positive(row.circulating_supply);
        if (circulating == null) continue;
        supply[row.id] = {
          circulating,
          fullyDiluted: positive(row.max_supply) ?? positive(row.total_supply) ?? circulating,
        };
      }
      cache = { at: Date.now(), supply };
      return supply;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Supply for the market, or null until it loads (or if it can't). */
export function useTokenSupply(marketKey: MarketKey): TokenSupply | null {
  const id = COINGECKO_ID[marketKey];
  const [supply, setSupply] = useState<TokenSupply | null>(() => cache?.supply[id] ?? null);

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
