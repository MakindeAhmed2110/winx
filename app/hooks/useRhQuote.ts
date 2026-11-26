import { useEffect, useState } from "react";
import { fetchRhQuote, type RhQuote } from "../lib/rh";

const EMPTY: RhQuote = { price: null, volume: null };

export function useRhQuote(symbol: string) {
  const [quote, setQuote] = useState<RhQuote>(EMPTY);

  useEffect(() => {
    if (!symbol) {
      setQuote(EMPTY);
      return;
    }
    let cancelled = false;
    setQuote(EMPTY);
    const load = async () => {
      try {
        const next = await fetchRhQuote(symbol);
        if (!cancelled) setQuote(next);
      } catch {
        // keep the last print
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [symbol]);

  return quote;
}
