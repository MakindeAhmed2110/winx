const INK: Record<string, string> = {
  BNB: "#f3ba2f",
  USDC: "#2775ca",
  XRP: "#23292f",
  SOL: "#9945ff",
  TRX: "#ff060a",
  HYPE: "#9deb6a",
  ZEC: "#f4b728",
  XMR: "#ff6b2c",
  DOGE: "#c2a633",
  NVDA: "#76b900",
  SPCX: "#d7d7dc",
  TSLA: "#e82127",
  META: "#0668e1",
  ANT: "#f0efe9",
};

export function MarketIcon({
  symbol,
  icon,
  size,
  className,
}: {
  symbol: string;
  icon?: string;
  size: number;
  className?: string;
}) {
  if (icon) {
    return <img src={icon} alt="" width={size} height={size} className={className} />;
  }
  const fill = INK[symbol] ?? "#3a3a42";
  const ink = symbol === "BNB" || symbol === "HYPE" || symbol === "ZEC" || symbol === "SPCX" || symbol === "DOGE" || symbol === "ANT"
    ? "#161616"
    : "#fff";
  return (
    <span
      className={`market-mark ${className ?? ""}`}
      style={{ width: size, height: size, background: fill, color: ink, fontSize: Math.max(9, Math.round(size * 0.38)) }}
      aria-hidden
    >
      {symbol.slice(0, 1)}
    </span>
  );
}
