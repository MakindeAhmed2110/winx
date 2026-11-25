import { markets } from "../lib/config";
import { useLiveMark } from "./use-live-mark";
import { useMarketStats } from "./use-market-stats";

/**
 * Position marks. The book stream paints every frame; the REST mark only
 * covers the moment before the socket's first snapshot.
 */
export function useSettlementMarks(): Record<number, number | null> {
  const btcLive = useLiveMark(markets.btc.extendedMarket);
  const ethLive = useLiveMark(markets.eth.extendedMarket);
  const { data: btc } = useMarketStats(markets.btc.extendedMarket, 3_000);
  const { data: eth } = useMarketStats(markets.eth.extendedMarket, 3_000);

  return {
    [markets.btc.id]: btcLive ?? btc?.markPrice ?? btc?.indexPrice ?? null,
    [markets.eth.id]: ethLive ?? eth?.markPrice ?? eth?.indexPrice ?? null,
  };
}
