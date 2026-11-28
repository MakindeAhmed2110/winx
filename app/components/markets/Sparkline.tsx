import { useId } from "react";

type Props = {
  closes: number[];
  up: boolean;
  width?: number;
  height?: number;
};

/**
 * Figma market sparkline (Markets "Chart" cell, 74.79 x 26): a 1px line with
 * the area under it filled from the line colour at 20% down to clear. Teal
 * (#0fedbe) when the market is up, pink (#f63c6b) when it's down.
 */
export function Sparkline({ closes, up, width = 75, height = 26 }: Props) {
  const gradientId = useId();
  if (closes.length < 2) {
    return <span className="markets-spark markets-spark-empty" aria-hidden />;
  }
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const pts = closes.map((close, index) => {
    const x = (index / (closes.length - 1)) * width;
    // 1px inset top and bottom so the 1px stroke isn't clipped.
    const y = height - 1 - ((close - min) / span) * (height - 2);
    return [x, y] as const;
  });
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `M0,${height} L${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L")} L${width},${height} Z`;
  const color = up ? "#0fedbe" : "#f63c6b";

  return (
    <svg
      className="markets-spark"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.2" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="1"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
