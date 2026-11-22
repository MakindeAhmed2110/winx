type Props = {
  closes: number[];
  up: boolean;
};

export function Sparkline({ closes, up }: Props) {
  if (closes.length < 2) {
    return <span className="markets-spark markets-spark-empty" aria-hidden />;
  }
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const width = 78;
  const height = 28;
  const points = closes
    .map((close, index) => {
      const x = (index / (closes.length - 1)) * width;
      const y = height - ((close - min) / span) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      className="markets-spark"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke={up ? "#3dff9a" : "#ff5d73"}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
