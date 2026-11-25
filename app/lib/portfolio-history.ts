export type EquitySample = { t: number; v: number };

const MAX_SAMPLES = 720;

const RANGE_MS: Record<string, number | null> = {
  "1D": 86_400_000,
  "2D": 2 * 86_400_000,
  "7D": 7 * 86_400_000,
  "2W": 14 * 86_400_000,
  "1M": 30 * 86_400_000,
  All: null,
};

function key(address: string) {
  return `winx.equity.v1:${address.toLowerCase()}`;
}

export function readEquity(address: string): EquitySample[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key(address));
    const list = raw ? (JSON.parse(raw) as EquitySample[]) : [];
    if (!Array.isArray(list)) return [];
    return list.filter(
      (sample) =>
        sample &&
        typeof sample.t === "number" &&
        typeof sample.v === "number" &&
        Number.isFinite(sample.t) &&
        Number.isFinite(sample.v),
    );
  } catch {
    return [];
  }
}

/** Keep a real sample when the live equity moves. Flat stretches are stored once a minute. */
export function recordEquity(address: string, value: number): EquitySample[] {
  const prev = readEquity(address);
  const now = Date.now();
  const safe = Number.isFinite(value) ? value : 0;
  const last = prev[prev.length - 1];
  if (last) {
    const dt = now - last.t;
    const dv = Math.abs(last.v - safe);
    if (dt < 5_000) return prev;
    if (dt < 60_000 && dv < 0.01) return prev;
  }
  const next = [...prev, { t: now, v: safe }].slice(-MAX_SAMPLES);
  window.localStorage.setItem(key(address), JSON.stringify(next));
  return next;
}

export function rangeWindow(range: string, samples: EquitySample[], now = Date.now()) {
  const span = RANGE_MS[range];
  const end = now;
  const start =
    span == null
      ? samples[0]?.t ?? now - 86_400_000
      : now - span;
  return {
    start,
    end,
    points: samples.filter((sample) => sample.t >= start && sample.t <= end),
  };
}
