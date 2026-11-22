import { markets } from "../lib/config";
import { useMarketStats } from "./use-market-stats";

/**
 * Live marks for Positions unrealized PnL.
 *
 * Robinhood mainnet Chainlink only updates on heartbeat/deviation (often
 * hours), so it looks static. Positions use Extended mark (same live feed as
 * the ticker) — open/close still push that live price into the testnet
 * Aggregator so settlement matches what you see here.
 */
export function useSettlementMarks(pollMs = 3_000): Record<number, number | null> {
  const { data: btc } = useMarketStats(markets.btc.extendedMarket, pollMs);
  const { data: eth } = useMarketStats(markets.eth.extendedMarket, pollMs);

  return {
    [markets.btc.id]: btc?.markPrice ?? btc?.indexPrice ?? null,
    [markets.eth.id]: eth?.markPrice ?? eth?.indexPrice ?? null,
  };
}
