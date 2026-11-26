export type RhQuote = { price: number | null; volume: number | null };

export async function fetchRhQuote(symbol: string): Promise<RhQuote> {
  if (!symbol) return { price: null, volume: null };
  const res = await fetch(`/rhj/prices/${encodeURIComponent(symbol)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Robinhood HTTP ${res.status}`);
  const body = (await res.json()) as {
    quotes?: { tokenBid?: string; tokenAsk?: string; dailyTradingVolume?: string }[];
  };
  const quote = body.quotes?.[0];
  const bid = Number(quote?.tokenBid);
  const ask = Number(quote?.tokenAsk);
  const mid = (bid + ask) / 2;
  const volume = Number(quote?.dailyTradingVolume);
  return {
    price: Number.isFinite(mid) && mid > 0 ? mid : null,
    volume: Number.isFinite(volume) && volume > 0 ? volume : null,
  };
}
