import { markets } from "../lib/config";
import { useLiveMark } from "./use-live-mark";
import { useMarketStats } from "./use-market-stats";
import { useRhQuote } from "./useRhQuote";

/**
 * Position marks for every listed market. Crypto uses the Extended book,
 * the same stream as BTC. Stocks use the Robinhood mid.
 */
export function useSettlementMarks(): Record<number, number | null> {
  const btcLive = useLiveMark(markets.btc.extendedMarket);
  const ethLive = useLiveMark(markets.eth.extendedMarket);
  const bnbLive = useLiveMark(markets.bnb.extendedMarket);
  const xrpLive = useLiveMark(markets.xrp.extendedMarket);
  const solLive = useLiveMark(markets.sol.extendedMarket);
  const trxLive = useLiveMark(markets.trx.extendedMarket);
  const hypeLive = useLiveMark(markets.hype.extendedMarket);
  const zecLive = useLiveMark(markets.zec.extendedMarket);
  const xmrLive = useLiveMark(markets.xmr.extendedMarket);
  const dogeLive = useLiveMark(markets.doge.extendedMarket);

  const { data: btc } = useMarketStats(markets.btc.extendedMarket);
  const { data: eth } = useMarketStats(markets.eth.extendedMarket);
  const { data: bnb } = useMarketStats(markets.bnb.extendedMarket);
  const { data: xrp } = useMarketStats(markets.xrp.extendedMarket);
  const { data: sol } = useMarketStats(markets.sol.extendedMarket);
  const { data: trx } = useMarketStats(markets.trx.extendedMarket);
  const { data: hype } = useMarketStats(markets.hype.extendedMarket);
  const { data: zec } = useMarketStats(markets.zec.extendedMarket);
  const { data: xmr } = useMarketStats(markets.xmr.extendedMarket);
  const { data: doge } = useMarketStats(markets.doge.extendedMarket);

  const nvda = useRhQuote(markets.nvda.rh);
  const spcx = useRhQuote(markets.spcx.rh);
  const meta = useRhQuote(markets.meta.rh);
  const coin = useRhQuote(markets.coin.rh);
  const tteq = useRhQuote(markets.tteq.rh);
  const tsla = useRhQuote(markets.tsla.rh);
  const googl = useRhQuote(markets.googl.rh);
  const aapl = useRhQuote(markets.aapl.rh);
  const ant = useRhQuote(markets.ant.rh);

  const book = (
    live: number | null,
    stats: { markPrice?: number; indexPrice?: number } | undefined,
  ) => live ?? stats?.markPrice ?? stats?.indexPrice ?? null;

  return {
    [markets.btc.id]: book(btcLive, btc),
    [markets.eth.id]: book(ethLive, eth),
    [markets.bnb.id]: book(bnbLive, bnb),
    [markets.xrp.id]: book(xrpLive, xrp),
    [markets.sol.id]: book(solLive, sol),
    [markets.trx.id]: book(trxLive, trx),
    [markets.hype.id]: book(hypeLive, hype),
    [markets.zec.id]: book(zecLive, zec),
    [markets.xmr.id]: book(xmrLive, xmr),
    [markets.doge.id]: book(dogeLive, doge),
    [markets.nvda.id]: nvda.price,
    [markets.spcx.id]: spcx.price,
    [markets.meta.id]: meta.price,
    [markets.coin.id]: coin.price,
    [markets.tteq.id]: tteq.price,
    [markets.tsla.id]: tsla.price,
    [markets.googl.id]: googl.price,
    [markets.aapl.id]: aapl.price,
    [markets.ant.id]: ant.price,
  };
}
