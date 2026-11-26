import { useEffect, useState } from "react";
import { liveMarketFetch, parseMarketStats, type MarketStats } from "../lib/market-stats";

const cache = new Map<string, MarketStats>();
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;
let subscribers = 0;
let timer: number | undefined;

/** One Extended markets read, shared by every row. Per-market polls were aborting the slower ones. */
function loadAll(): Promise<void> {
  if (inflight) return inflight;
  inflight = (async () => {
    const res = await fetch(`/extended/api/v1/info/markets?_=${Date.now()}`, liveMarketFetch);
    if (!res.ok) throw new Error(String(res.status));
    const body = (await res.json()) as {
      status: string;
      data?: { name?: string; marketStats?: Record<string, string | number> }[];
    };
    if (body.status !== "OK" || !body.data) throw new Error("bad payload");
    for (const row of body.data) {
      if (!row.name || !row.marketStats) continue;
      cache.set(row.name, parseMarketStats(row.marketStats));
    }
    listeners.forEach((listener) => listener());
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

function retain() {
  subscribers += 1;
  if (timer != null) return;
  void loadAll().catch(() => {});
  timer = window.setInterval(() => {
    void loadAll().catch(() => {});
  }, 4000);
}

function release() {
  subscribers = Math.max(0, subscribers - 1);
  if (subscribers > 0 || timer == null) return;
  window.clearInterval(timer);
  timer = undefined;
}

/** Live Extended market stats. `intervalMs` is unused; every subscriber shares one poll. */
export function useMarketStats(market: string, _intervalMs = 3000) {
  const [data, setData] = useState<MarketStats | undefined>(() =>
    market ? cache.get(market) : undefined,
  );
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!market) {
      setData(undefined);
      setError(false);
      return;
    }
    let cancelled = false;
    setData(cache.get(market));
    const pull = () => {
      const next = cache.get(market);
      if (!next || cancelled) return;
      setData(next);
      setError(false);
    };
    listeners.add(pull);
    retain();
    pull();
    void loadAll()
      .then(pull)
      .catch(() => {
        if (!cancelled && !cache.has(market)) setError(true);
      });
    return () => {
      cancelled = true;
      listeners.delete(pull);
      release();
    };
  }, [market]);

  return { data, error, loading: !data && !error };
}
