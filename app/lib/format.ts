export function formatUsd(value: number | null | undefined, decimals = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** USDW token amounts (6 decimals) with thousands separators. */
export function formatUsdw(
  value: number | string | bigint | null | undefined,
  decimals = 2,
): string {
  if (value == null || value === "") return "—";
  const n = typeof value === "bigint" ? Number(value) / 1e6 : Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

export function formatCompactUsd(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `$${new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  })
    .format(value)
    .toLowerCase()}`;
}

export function formatPct(
  value: number | null | undefined,
  decimals = 2,
  signed = true,
): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${signed && value > 0 ? "+" : ""}${value.toFixed(decimals)}%`;
}

/** `hh:mm:ss`, or `Nd hh:mm` past a day. */
export function formatCountdown(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "00:00:00";
  const s = Math.floor(seconds);
  const pad = (n: number) => String(n).padStart(2, "0");
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d > 0
    ? `${d}d ${pad(h)}:${pad(m)}`
    : `${pad(h)}:${pad(m)}:${pad(s % 60)}`;
}
