import { useEffect, useState, useSyncExternalStore } from "react";

export interface PollState<T> {
  data: T | undefined;
  error: boolean;
  loading: boolean;
}

/** Fetch JSON from `url` now and every `intervalMs`; state resets when the url changes. */
export function usePoll<T>(url: string | null, intervalMs: number): PollState<T> {
  const [state, setState] = useState<{
    url: string | null;
    data: T | undefined;
    error: boolean;
  }>({
    url,
    data: undefined,
    error: false,
  });

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    let controller: AbortController | undefined;

    const tick = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as T;
        if (!cancelled) setState({ url, data, error: false });
      } catch (err) {
        if (
          !cancelled &&
          !(err instanceof DOMException && err.name === "AbortError")
        ) {
          setState((prev) => ({
            url,
            data: prev.url === url ? prev.data : undefined,
            error: true,
          }));
        }
      }
    };

    tick();
    const id = intervalMs > 0 ? window.setInterval(tick, intervalMs) : undefined;
    return () => {
      cancelled = true;
      controller?.abort();
      window.clearInterval(id);
    };
  }, [url, intervalMs]);

  const current = state.url === url;
  return {
    data: current ? state.data : undefined,
    error: current && state.error,
    loading: !!url && (!current || (state.data === undefined && !state.error)),
  };
}

const subscribeClock = (onTick: () => void) => {
  const id = window.setInterval(onTick, 1000);
  return () => window.clearInterval(id);
};
const clockSnapshot = () => Math.floor(Date.now() / 1000);

/** Unix seconds, ticking each second; `0` during SSR and hydration. */
export function useNow(): number {
  return useSyncExternalStore(subscribeClock, clockSnapshot, () => 0);
}
