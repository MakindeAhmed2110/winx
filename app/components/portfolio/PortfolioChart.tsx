import { useId } from "react";
import type { EquitySample } from "../../lib/portfolio-history";

function niceStep(span: number): number {
  const raw = span / 4;
  if (raw <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / exp;
  const nice = [1, 2, 2.5, 5, 10].find((step) => step >= fraction) ?? 10;
  return nice * exp;
}

function axisLabel(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) {
    const k = value / 1000;
    const digits = Number.isInteger(k) ? 0 : 1;
    return `${k.toFixed(digits)}K`;
  }
  if (abs >= 100) return Math.round(value).toLocaleString("en-US");
  return value.toLocaleString("en-US", { maximumFractionDigits: abs >= 10 ? 0 : 2 });
}

function timeLabel(t: number, span: number): string {
  const date = new Date(t);
  if (span <= 2 * 86_400_000) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function scaleOf(values: number[]): { lo: number; hi: number } {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max - min < Math.max(1, max * 0.012)) {
    return { lo: 0, hi: Math.max(max * 1.18, 1) };
  }
  const pad = Math.max((max - min) * 0.22, 1);
  return { lo: Math.max(0, min - pad * 0.35), hi: max + pad };
}

function smoothPath(coords: readonly (readonly [number, number])[]): string {
  if (coords.length === 0) return "";
  if (coords.length === 1) return `M${coords[0]![0].toFixed(1)} ${coords[0]![1].toFixed(1)}`;
  const n = coords.length;
  const slopes: number[] = [];
  for (let i = 0; i < n - 1; i += 1) {
    const dx = coords[i + 1]![0] - coords[i]![0] || 1;
    slopes.push((coords[i + 1]![1] - coords[i]![1]) / dx);
  }
  const tangent = slopes.map((slope, index) => {
    if (index === 0) return slope;
    const prev = slopes[index - 1] ?? slope;
    if (prev * slope <= 0) return 0;
    return (prev + slope) / 2;
  });
  tangent.push(slopes[slopes.length - 1] ?? 0);
  for (let i = 0; i < n - 1; i += 1) {
    const slope = slopes[i] ?? 0;
    if (Math.abs(slope) < 1e-6) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = (tangent[i] ?? 0) / slope;
    const b = (tangent[i + 1] ?? 0) / slope;
    const size = a * a + b * b;
    if (size > 9) {
      const scale = 3 / Math.sqrt(size);
      tangent[i] = scale * a * slope;
      tangent[i + 1] = scale * b * slope;
    }
  }
  let path = `M${coords[0]![0].toFixed(1)} ${coords[0]![1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i += 1) {
    const from = coords[i]!;
    const to = coords[i + 1]!;
    const dx = to[0] - from[0];
    const c1x = from[0] + dx / 3;
    const c1y = from[1] + (tangent[i] ?? 0) * (dx / 3);
    const c2x = to[0] - dx / 3;
    const c2y = to[1] - (tangent[i + 1] ?? 0) * (dx / 3);
    path += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${to[0].toFixed(1)} ${to[1].toFixed(1)}`;
  }
  return path;
}

export function PortfolioChart({
  points,
  start,
  end,
}: {
  points: EquitySample[];
  start: number;
  end: number;
}) {
  const gradientId = useId().replace(/:/g, "");
  const width = 900;
  const height = 320;
  const span = Math.max(1, end - start);
  const plot = points.length > 1 ? points : [{ t: start, v: 0 }, { t: end, v: 0 }];
  const { lo, hi } = scaleOf(plot.map((point) => point.v));
  const ceiling = hi - lo || 1;
  const up = (plot[plot.length - 1]?.v ?? 0) >= (plot[0]?.v ?? 0);
  const stroke = up ? "#0fedbf" : "#f63d6d";
  const coords = plot.map((point) => {
    const x = 8 + ((Math.min(end, Math.max(start, point.t)) - start) / span) * (width - 20);
    const y = 16 + (1 - (Math.min(hi, Math.max(lo, point.v)) - lo) / ceiling) * (height - 32);
    return [x, y] as const;
  });
  const line = smoothPath(coords);
  const last = coords[coords.length - 1] ?? [width - 12, height / 2];
  const first = coords[0] ?? [8, height - 16];
  const area = `${line} L${last[0].toFixed(1)} ${height} L${first[0].toFixed(1)} ${height} Z`;
  const step = niceStep(ceiling);
  const ticks: number[] = [];
  for (let value = Math.ceil(lo / step) * step; value <= hi + step * 0.01; value += step) {
    ticks.push(Number(value.toFixed(6)));
  }
  const labels = Array.from({ length: 4 }, (_, index) => start + (span * index) / 3);
  const yOf = (value: number) => 16 + (1 - (value - lo) / ceiling) * (height - 32);

  return (
    <div className="portfolio-chart">
      <div className="portfolio-chart-plot">
        <div className="portfolio-chart-stage">
          <div className="portfolio-chart-canvas">
            <div className="portfolio-chart-y" aria-hidden="true">
              {ticks.map((tick) => (
                <span key={tick} style={{ top: `${(yOf(tick) / height) * 100}%` }}>
                  {axisLabel(tick)}
                </span>
              ))}
            </div>
            <div className="portfolio-chart-line">
            <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity="0.34" />
                  <stop offset="72%" stopColor={stroke} stopOpacity="0.08" />
                  <stop offset="100%" stopColor={stroke} stopOpacity="0" />
                </linearGradient>
              </defs>
              {ticks.map((tick) => (
                <line
                  key={tick}
                  x1="0"
                  x2={width}
                  y1={yOf(tick)}
                  y2={yOf(tick)}
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              <path d={area} fill={`url(#${gradientId})`} />
              <path d={line} fill="none" stroke={stroke} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </svg>
            <span
              className="portfolio-chart-now"
              style={{
                left: `${(last[0] / width) * 100}%`,
                top: `${(last[1] / height) * 100}%`,
                background: stroke,
                boxShadow: `0 0 0 6px ${up ? "rgba(15,237,191,0.28)" : "rgba(246,61,109,0.28)"}, 0 0 18px ${stroke}`,
              }}
            />
            </div>
          </div>
          <div className="portfolio-chart-x">
            {labels.map((tick) => (
              <span key={tick}>{timeLabel(tick, span)}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
