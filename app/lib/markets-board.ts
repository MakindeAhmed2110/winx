import type { MarketKey } from "../hooks/useTradeDesk";
import { markets } from "./config";

export type RangeId = "1d" | "2d" | "7d" | "2w" | "1m";

export const MARKET_RANGES: {
  id: RangeId;
  label: string;
  interval: string;
  limit: number;
  changeLabel: string;
}[] = [
  { id: "1d", label: "1D", interval: "PT1H", limit: 24, changeLabel: "24H CHANGE" },
  { id: "2d", label: "2D", interval: "PT1H", limit: 48, changeLabel: "2D CHANGE" },
  { id: "7d", label: "7D", interval: "PT4H", limit: 42, changeLabel: "7D CHANGE" },
  { id: "2w", label: "2W", interval: "P1D", limit: 14, changeLabel: "2W CHANGE" },
  { id: "1m", label: "1M", interval: "P1D", limit: 30, changeLabel: "1M CHANGE" },
];

export type ListedMarket = {
  key: MarketKey;
  id: number;
  label: string;
  symbol: string;
  icon: string;
  extendedMarket: string;
  priceDecimals: number;
  maxLeverage: number;
  cmcId: number;
  tradable: boolean;
  category: "crypto" | "equities";
  rh: string;
};

const CATALOG: ListedMarket[] = (Object.keys(markets) as MarketKey[]).map((key) => {
  const market = markets[key];
  return {
    key,
    id: market.id,
    label: market.label,
    symbol: market.pair.split("-")[0] ?? key.toUpperCase(),
    icon: market.icon,
    extendedMarket: market.extendedMarket,
    priceDecimals: market.priceDecimals,
    maxLeverage: market.maxLeverage,
    cmcId: market.cmcId,
    tradable: market.tradable,
    category: market.category,
    rh: market.rh,
  };
});

export function marketCatalog(): ListedMarket[] {
  return CATALOG;
}

export function rangeSpec(id: RangeId) {
  return MARKET_RANGES.find((range) => range.id === id) ?? MARKET_RANGES[0];
}

/** Slice-and-dice treemap. Coordinates are percentages of the parent box. */
export function treemap(weights: number[]): { x: number; y: number; w: number; h: number }[] {
  const count = weights.length;
  if (count === 0) return [];
  const positive = weights.map((weight) => (weight > 0 ? weight : 0));
  const sum = positive.reduce((total, weight) => total + weight, 0);
  const shares = sum > 0 ? positive.map((weight) => weight / sum) : weights.map(() => 1 / count);
  const floored = shares.map((share) => Math.max(share, count > 1 ? 0.12 : 1));
  const floorSum = floored.reduce((total, share) => total + share, 0);
  const items = floored.map((share, index) => ({
    index,
    area: (share / floorSum) * 10_000,
  }));
  items.sort((a, b) => b.area - a.area);
  const placed: { index: number; x: number; y: number; w: number; h: number }[] = [];
  split(
    items,
    { x: 0, y: 0, w: 100, h: 100 },
    placed,
  );
  return weights.map((_, index) => {
    const tile = placed.find((item) => item.index === index);
    return tile ?? { x: 0, y: 0, w: 0, h: 0 };
  });
}

function split(
  items: { index: number; area: number }[],
  box: { x: number; y: number; w: number; h: number },
  out: { index: number; x: number; y: number; w: number; h: number }[],
) {
  if (items.length === 0 || box.w <= 0 || box.h <= 0) return;
  if (items.length === 1) {
    out.push({ index: items[0]!.index, ...box });
    return;
  }
  const total = items.reduce((sum, item) => sum + item.area, 0) || 1;
  let cursor = 0;
  let cut = 1;
  for (; cut < items.length; cut += 1) {
    cursor += items[cut - 1]!.area;
    if (cursor >= total / 2) break;
  }
  // A tile bigger than everything before it would otherwise leave an empty side and recurse forever.
  if (cut >= items.length) cut = items.length - 1;
  const left = items.slice(0, cut);
  const right = items.slice(cut);
  const leftShare = left.reduce((sum, item) => sum + item.area, 0) / total;
  if (box.w >= box.h) {
    const width = box.w * leftShare;
    split(left, { x: box.x, y: box.y, w: width, h: box.h }, out);
    split(right, { x: box.x + width, y: box.y, w: box.w - width, h: box.h }, out);
  } else {
    const height = box.h * leftShare;
    split(left, { x: box.x, y: box.y, w: box.w, h: height }, out);
    split(right, { x: box.x, y: box.y + height, w: box.w, h: box.h - height }, out);
  }
}

export function heatStyle(pct: number | null): { background: string; ink: string } {
  if (pct == null || !Number.isFinite(pct) || Math.abs(pct) < 0.08) {
    return {
      background:
        "radial-gradient(120% 80% at 12% 0%, rgba(255,255,255,0.05), transparent 46%), #2a2c31",
      ink: "rgba(255,255,255,0.72)",
    };
  }
  const t = Math.max(-1, Math.min(1, pct / 13));
  if (t > 0) {
    const r = Math.round(12 + t * 20);
    const g = Math.round(52 + t * 130);
    const b = Math.round(58 + t * 40);
    return {
      background: `radial-gradient(130% 90% at 16% 0%, rgba(255,255,255,0.10), transparent 48%), rgb(${r},${g},${b})`,
      ink: t > 0.35 ? "#d8ffe8" : "#7dffa8",
    };
  }
  const mag = -t;
  const r = Math.round(58 + mag * 150);
  const g = Math.round(28 - mag * 8);
  const b = Math.round(42 + mag * 18);
  return {
    background: `radial-gradient(130% 90% at 16% 0%, rgba(255,255,255,0.06), transparent 46%), rgb(${r},${g},${b})`,
    ink: mag > 0.35 ? "#ffd0d8" : "#ff8fa3",
  };
}
