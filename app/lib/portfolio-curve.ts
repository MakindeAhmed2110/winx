import { markets } from "./config";
import type { EquitySample } from "./portfolio-history";

export type CashStep = { t: number; delta: number };

export type CurvePosition = {
  marketId: number;
  isLong: boolean;
  entry: number;
  notional: number;
  createdAt: number;
  mark: number;
};

export type Candle = { t: number; c: number };

const DAY = 86_400_000;

const RANGE_MS: Record<string, number> = {
  "1D": DAY,
  "2D": 2 * DAY,
  "7D": 7 * DAY,
  "2W": 14 * DAY,
  "1M": 30 * DAY,
  All: 120 * DAY,
};

export function candleSpec(start: number, end: number): { interval: string; limit: number } {
  const hours = Math.max(1, (end - start) / 3_600_000);
  if (hours <= 36) return { interval: "PT5M", limit: 450 };
  if (hours <= 24 * 10) return { interval: "PT1H", limit: 260 };
  if (hours <= 24 * 50) return { interval: "PT4H", limit: 320 };
  return { interval: "P1D", limit: 220 };
}

export function curveWindow(
  range: string,
  positions: CurvePosition[],
  steps: CashStep[],
  now: number,
): { start: number; end: number } {
  const span = RANGE_MS[range] ?? DAY;
  const rangeStart = now - span;
  if (range !== "All") return { start: rangeStart, end: now };
  const times = [...positions.map((position) => position.createdAt), ...steps.map((step) => step.t)].filter(
    (time) => time > 1_000_000_000_000 && time < now,
  );
  if (times.length === 0) return { start: rangeStart, end: now };
  const first = Math.min(...times);
  const pad = Math.max(15 * 60_000, (now - first) * 0.06);
  return { start: Math.max(rangeStart, first - pad), end: now };
}

function candleAt(candles: Candle[], time: number): number | null {
  if (candles.length === 0) return null;
  if (time <= candles[0]!.t) return candles[0]!.c;
  const last = candles[candles.length - 1]!;
  if (time >= last.t) return last.c;
  let lo = 0;
  let hi = candles.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (candles[mid]!.t <= time) lo = mid;
    else hi = mid;
  }
  const left = candles[lo]!;
  const right = candles[hi]!;
  const span = right.t - left.t || 1;
  return left.c + ((right.c - left.c) * (time - left.t)) / span;
}

function mappedPrice(position: CurvePosition, candles: Candle[], time: number, now: number): number {
  const opened = position.createdAt;
  if (time <= opened) return position.entry;
  const entry = position.entry;
  const mark = position.mark > 0 ? position.mark : entry;
  const p0 = candleAt(candles, opened);
  const p1 = candleAt(candles, now);
  const pt = candleAt(candles, time);
  if (p0 == null || p1 == null || pt == null || Math.abs(p1 - p0) < 1e-8) {
    const span = Math.max(1, now - opened);
    return entry + (mark - entry) * Math.min(1, (time - opened) / span);
  }
  return entry + ((pt - p0) * (mark - entry)) / (p1 - p0);
}

function legPnl(position: CurvePosition, candles: Candle[], time: number, now: number): number {
  if (time < position.createdAt || position.entry <= 0 || position.notional <= 0) return 0;
  const price = mappedPrice(position, candles, time, now);
  const dir = position.isLong ? 1 : -1;
  return (dir * (price - position.entry) * position.notional) / position.entry;
}

function principalAt(principalNow: number, steps: CashStep[], time: number): number {
  let value = principalNow;
  for (const step of steps) {
    if (step.t > time) value -= step.delta;
  }
  return value;
}

/** Portfolio USDW across the range: cash principal plus each position's dollar move. */
export function buildEquityCurve(args: {
  principal: number;
  positions: CurvePosition[];
  candles: Record<number, Candle[]>;
  steps: CashStep[];
  range: string;
  now?: number;
}): { points: EquitySample[]; start: number; end: number } {
  const now = args.now ?? Date.now();
  const { start, end } = curveWindow(args.range, args.positions, args.steps, now);
  const span = Math.max(1, end - start);
  // A transfer stamped on the latest block is not a real end-of-chart deposit.
  const steps = args.steps.filter((step) => step.t >= start && step.t <= end - span * 0.04);
  const count = 96;
  const points: EquitySample[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = start + (span * i) / (count - 1);
    const pnl = args.positions.reduce(
      (sum, position) => sum + legPnl(position, args.candles[position.marketId] ?? [], t, now),
      0,
    );
    points.push({ t, v: Math.max(0, principalAt(args.principal, steps, t) + pnl) });
  }
  const live = args.positions.reduce((sum, position) => {
    if (position.entry <= 0 || position.notional <= 0) return sum;
    const dir = position.isLong ? 1 : -1;
    const mark = position.mark > 0 ? position.mark : position.entry;
    return sum + (dir * (mark - position.entry) * position.notional) / position.entry;
  }, 0);
  const endValue = Math.max(0, args.principal + live);
  points[points.length - 1] = { t: end, v: endValue };
  return { points, start, end };
}

export function marketCandleTargets(): { marketId: number; extendedMarket: string }[] {
  return [
    { marketId: markets.btc.id, extendedMarket: markets.btc.extendedMarket },
    { marketId: markets.eth.id, extendedMarket: markets.eth.extendedMarket },
  ];
}
