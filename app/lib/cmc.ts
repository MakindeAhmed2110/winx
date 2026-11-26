export type CmcPoint = {
  t: number;
  price: number;
  volume: number;
};

export type CmcQuote = {
  price: number | null;
  change: number | null;
  changePct: number | null;
  volume: number | null;
};

const EMPTY: CmcQuote = { price: null, change: null, changePct: null, volume: null };
const cache = new Map<string, { at: number; points: CmcPoint[] }>();
const inflight = new Map<string, Promise<CmcPoint[]>>();
const quoteCache = new Map<string, { at: number; quotes: Map<number, CmcQuote> }>();
const quoteInflight = new Map<string, Promise<Map<number, CmcQuote>>>();
const TTL_MS = 20_000;

export function quoteFromPoints(points: CmcPoint[]): CmcQuote {
  if (points.length === 0) return EMPTY;
  const first = points[0]!.price;
  const last = points[points.length - 1]!;
  if (!Number.isFinite(first) || !Number.isFinite(last.price) || first === 0) {
    return { price: last.price, change: null, changePct: null, volume: last.volume };
  }
  const change = last.price - first;
  return {
    price: last.price,
    change,
    changePct: (change / first) * 100,
    volume: last.volume,
  };
}

/** Dollar move implied by CoinMarketCap's 24h percent change. */
export function changeFromPct(price: number, changePct: number): number | null {
  if (!Number.isFinite(price) || !Number.isFinite(changePct)) return null;
  const base = 1 + changePct / 100;
  if (base === 0) return null;
  return price - price / base;
}

type CmcUsdQuote = {
  symbol?: string;
  price?: number | null;
  volume_24h?: number | null;
  percent_change_24h?: number | null;
};

/** Latest CoinMarketCap quotes, including the official 24h percent change. */
export function fetchCmcQuotes(ids: number[]): Promise<Map<number, CmcQuote>> {
  const unique = [...new Set(ids.filter((id) => id > 0))].sort((a, b) => a - b);
  if (unique.length === 0) return Promise.resolve(new Map());
  const key = unique.join(",");
  const hit = quoteCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.quotes);
  const pending = quoteInflight.get(key);
  if (pending) return pending;
  const run = loadQuotes(unique)
    .then((quotes) => {
      quoteCache.set(key, { at: Date.now(), quotes });
      return quotes;
    })
    .finally(() => {
      quoteInflight.delete(key);
    });
  quoteInflight.set(key, run);
  return run;
}

async function loadQuotes(ids: number[]): Promise<Map<number, CmcQuote>> {
  const res = await fetch(
    `/cmc-pro/public-api/v3/cryptocurrency/quotes/latest?id=${ids.join(",")}&convert=USD`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`CoinMarketCap ${res.status}`);
  const body = (await res.json()) as {
    data?: { id?: number; quote?: CmcUsdQuote[] }[];
  };
  const out = new Map<number, CmcQuote>();
  for (const row of body.data ?? []) {
    if (!row.id) continue;
    const usd = row.quote?.find((quote) => quote.symbol === "USD") ?? row.quote?.[0];
    if (!usd) continue;
    const price = finiteOrNull(usd.price);
    const changePct = finiteOrNull(usd.percent_change_24h);
    const volume = finiteOrNull(usd.volume_24h);
    out.set(row.id, {
      price,
      changePct,
      change: price != null && changePct != null ? changeFromPct(price, changePct) : null,
      volume,
    });
  }
  return out;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null;
}

/** Public CoinMarketCap chart. Same payload the site uses, through our proxy. */
export function fetchCmcChart(id: number, range: string): Promise<CmcPoint[]> {
  const key = `${id}:${range}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.points);
  const pending = inflight.get(key);
  if (pending) return pending;
  const run = load(id, range)
    .then((points) => {
      cache.set(key, { at: Date.now(), points });
      return points;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, run);
  return run;
}

async function load(id: number, range: string): Promise<CmcPoint[]> {
  const res = await fetch(
    `/cmc/data-api/v3/cryptocurrency/detail/chart?id=${id}&range=${encodeURIComponent(range)}`,
    { headers: { Accept: "application/json" } },
  );
  if (!res.ok) throw new Error(`CoinMarketCap ${res.status}`);
  const body = (await res.json()) as {
    data?: { points?: Record<string, { v?: number[] }> };
  };
  const raw = body.data?.points;
  if (!raw) return [];
  return Object.entries(raw)
    .map(([stamp, row]) => ({
      t: Number(stamp),
      price: Number(row.v?.[0]),
      volume: Number(row.v?.[1]),
    }))
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.price) && point.price > 0)
    .sort((a, b) => a.t - b.t);
}

export function slicePoints(points: CmcPoint[], seconds: number): CmcPoint[] {
  if (points.length === 0) return points;
  const last = points[points.length - 1]!.t;
  const cut = last - seconds;
  const sliced = points.filter((point) => point.t >= cut);
  return sliced.length >= 2 ? sliced : points;
}

export function downsample(points: CmcPoint[], max: number): CmcPoint[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const out: CmcPoint[] = [];
  for (let i = 0; i < max; i += 1) {
    out.push(points[Math.round(i * step)]!);
  }
  return out;
}
