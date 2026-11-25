import { useEffect, useMemo, useState } from "react";
import {
  buildEquityCurve,
  candleSpec,
  curveWindow,
  marketCandleTargets,
  type Candle,
  type CashStep,
  type CurvePosition,
} from "../lib/portfolio-curve";
import { loadPrincipalSteps } from "../lib/usdw-series";

const FALLBACKS = ["PT5M", "PT15M", "PT30M", "PT1H", "PT4H", "P1D"];

async function fetchCandles(market: string, interval: string, limit: number): Promise<Candle[]> {
  const order = [interval, ...FALLBACKS.filter((item) => item !== interval)];
  for (const item of order) {
    try {
      const res = await fetch(
        `/extended/api/v1/info/candles/${encodeURIComponent(market)}/trades?interval=${item}&limit=${limit}`,
        { headers: { Accept: "application/json" } },
      );
      if (!res.ok) continue;
      const body = (await res.json()) as { status?: string; data?: { c?: string; T?: number }[] };
      if (body.status !== "OK" || !Array.isArray(body.data) || body.data.length < 2) continue;
      const rows = body.data
        .map((row) => {
          const raw = Number(row.T ?? 0);
          return { t: raw > 1e12 ? raw : raw * 1000, c: Number(row.c) };
        })
        .filter((row) => row.t > 0 && Number.isFinite(row.c) && row.c > 0)
        .sort((a, b) => a.t - b.t);
      if (rows.length >= 2) return rows;
    } catch {
      // try the next interval
    }
  }
  return [];
}

export function useUsdwSeries(
  address: `0x${string}` | undefined,
  principal: number,
  positions: CurvePosition[],
  range: string,
) {
  const [candles, setCandles] = useState<Record<number, Candle[]>>({});
  const [steps, setSteps] = useState<CashStep[]>([]);
  const opened = positions.map((position) => position.createdAt).filter((time) => time > 0);
  const earliest = opened.length > 0 ? Math.min(...opened) : 0;
  const windowKey = `${range}:${earliest}`;

  useEffect(() => {
    let cancel = false;
    const now = Date.now();
    const window = curveWindow(range, positions, [], now);
    const historyStart = earliest > 0 ? Math.min(earliest, window.start) : window.start;
    const spec = candleSpec(historyStart, now);
    void Promise.all(
      marketCandleTargets().map(async (target) => {
        const rows = await fetchCandles(target.extendedMarket, spec.interval, spec.limit);
        return [target.marketId, rows] as const;
      }),
    ).then((rows) => {
      if (cancel) return;
      const next: Record<number, Candle[]> = {};
      for (const [marketId, series] of rows) next[marketId] = series;
      setCandles(next);
    });
    return () => {
      cancel = true;
    };
    // positions are read for the window only; mark ticks must not refetch candles
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowKey]);

  useEffect(() => {
    if (!address) {
      setSteps([]);
      return;
    }
    let cancel = false;
    void loadPrincipalSteps(address, range)
      .then((next) => {
        if (!cancel) setSteps(next);
      })
      .catch(() => {
        if (!cancel) setSteps([]);
      });
    return () => {
      cancel = true;
    };
  }, [address, range]);

  return useMemo(
    () => buildEquityCurve({ principal, positions, candles, steps, range }),
    [principal, positions, candles, steps, range],
  );
}
