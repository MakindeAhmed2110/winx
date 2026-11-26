import { useEffect, useState } from "react";
import { fetchCmcQuotes, type CmcQuote } from "../lib/cmc";

const EMPTY: CmcQuote = { price: null, change: null, changePct: null, volume: null };

const cache = new Map<number, CmcQuote>();
const refs = new Map<number, number>();
const listeners = new Set<() => void>();
let kick: number | undefined;
let poll: number | undefined;
let inflight: Promise<void> | null = null;

function idsInUse(): number[] {
  return [...refs.keys()].filter((id) => (refs.get(id) ?? 0) > 0).sort((a, b) => a - b);
}

function flush(): Promise<void> {
  if (inflight) return inflight;
  const ids = idsInUse();
  if (ids.length === 0) return Promise.resolve();
  inflight = fetchCmcQuotes(ids)
    .then((quotes) => {
      for (const [id, quote] of quotes) cache.set(id, quote);
      listeners.forEach((listener) => listener());
    })
    .catch(() => {})
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

function schedule() {
  if (kick != null) return;
  kick = window.setTimeout(() => {
    kick = undefined;
    void flush();
  }, 40);
}

function ensurePoll() {
  if (poll != null || idsInUse().length === 0) return;
  poll = window.setInterval(() => {
    void flush();
  }, 20_000);
}

function retain(id: number) {
  refs.set(id, (refs.get(id) ?? 0) + 1);
  ensurePoll();
  schedule();
}

function release(id: number) {
  const next = (refs.get(id) ?? 1) - 1;
  if (next <= 0) refs.delete(id);
  else refs.set(id, next);
  if (idsInUse().length === 0 && poll != null) {
    window.clearInterval(poll);
    poll = undefined;
  }
}

/** Latest CoinMarketCap quote. Every mounted id shares one quotes request. */
export function useCmcQuote(id: number | undefined) {
  const [quote, setQuote] = useState<CmcQuote>(() => (id ? (cache.get(id) ?? EMPTY) : EMPTY));

  useEffect(() => {
    if (!id) {
      setQuote(EMPTY);
      return;
    }
    let cancelled = false;
    const pull = () => {
      if (cancelled) return;
      const next = cache.get(id);
      if (next) setQuote(next);
    };
    listeners.add(pull);
    retain(id);
    pull();
    return () => {
      cancelled = true;
      listeners.delete(pull);
      release(id);
    };
  }, [id]);

  return quote;
}

/** One CoinMarketCap read for every id currently on screen. */
export function useCmcQuotes(ids: number[]) {
  const key = [...new Set(ids.filter((id) => id > 0))].sort((a, b) => a - b).join(",");
  const [quotes, setQuotes] = useState<Record<number, CmcQuote>>({});

  useEffect(() => {
    const list = key ? key.split(",").map(Number) : [];
    if (list.length === 0) return;
    let cancelled = false;
    const pull = async () => {
      try {
        const loaded = await fetchCmcQuotes(list);
        if (cancelled) return;
        const next: Record<number, CmcQuote> = {};
        for (const id of list) {
          const quote = loaded.get(id);
          if (quote) {
            cache.set(id, quote);
            next[id] = quote;
          }
        }
        setQuotes(next);
        listeners.forEach((listener) => listener());
      } catch {
        // keep the last print
      }
    };
    void pull();
    const timer = window.setInterval(() => void pull(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [key]);

  return quotes;
}
