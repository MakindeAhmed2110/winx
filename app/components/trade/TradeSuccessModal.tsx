import { useEffect } from "react";
import { createPortal } from "react-dom";
import { formatUnits } from "viem";
import { explorerTx, markets } from "../../lib/config";
import { formatUsdw } from "../../lib/format";

function safeTokenAmount(raw: string): number {
  try {
    return Number(formatUnits(BigInt(raw || "0"), 6));
  } catch {
    return 0;
  }
}

export type OpenSuccess = {
  kind: "open";
  txHash: string;
  marketId: number;
  isLong: boolean;
  leverage: number;
  margin: string;
  size: string;
  entryPrice: string;
};

export type CloseSuccess = {
  kind: "close";
  txHash: string;
  marketId: number;
  isLong: boolean;
  leverage: number;
  margin: string;
  size: string;
  entryPrice: string;
  exitPrice: string;
  leftover: string;
  protocolFee: string;
};

export type TradeSuccess = OpenSuccess | CloseSuccess;

function marketMeta(marketId: number) {
  if (marketId === markets.eth.id) return markets.eth;
  return markets.btc;
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] text-fog">{label}</span>
      <span className="text-[12px] tabular-nums text-paper">{value}</span>
    </div>
  );
}

export function TradeSuccessModal({
  result,
  onClose,
  onPrimary,
}: {
  result: TradeSuccess;
  onClose: () => void;
  onPrimary: () => void;
}) {
  const meta = marketMeta(result.marketId);
  const long = result.isLong;
  const accent = long ? "var(--trade-green)" : "var(--trade-red)";
  const margin = safeTokenAmount(result.margin);
  const notional = safeTokenAmount(result.size);
  const entry = Number(result.entryPrice) / 1e8;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const openRows =
    result.kind === "open"
      ? [
          { label: "Leverage", value: `${result.leverage}x` },
          { label: "Margin", value: `${formatUsdw(margin)} USDW` },
          { label: "Notional", value: `${formatUsdw(notional, 0)} USDW` },
          {
            label: "Entry",
            value: `$${entry.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
          },
        ]
      : null;

  let closeHero: { pnl: number; pnlPct: number; leftover: number } | null = null;
  let closeRows: { label: string; value: string }[] | null = null;
  if (result.kind === "close") {
    const exit = Number(result.exitPrice) / 1e8;
    const leftover = safeTokenAmount(result.leftover);
    const fee = safeTokenAmount(result.protocolFee);
    const pnl = leftover - margin;
    const pnlPct = margin > 0 ? (pnl / margin) * 100 : 0;
    closeHero = { pnl, pnlPct, leftover };
    closeRows = [
      { label: "Leverage", value: `${result.leverage}x` },
      { label: "Margin", value: `${formatUsdw(margin)} USDW` },
      {
        label: "Entry → Exit",
        value: `$${entry.toLocaleString(undefined, { maximumFractionDigits: 2 })} → $${exit.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
      },
      { label: "Payout note", value: `${formatUsdw(leftover)} USDW` },
      { label: "Protocol fee", value: `${formatUsdw(fee)} USDW` },
    ];
  }

  const title = result.kind === "open" ? "Position opened" : "Position closed";
  const primaryLabel = result.kind === "open" ? "View position" : "View notes";

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="trade-success-title"
      className="book-in fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[380px] overflow-hidden border border-white/10 bg-[#0a0c10] p-6 shadow-2xl"
        style={{ borderRadius: 4 }}
        onClick={(e) => e.stopPropagation()}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -top-16 left-1/2 h-32 w-48 -translate-x-1/2 rounded-full blur-3xl"
          style={{ background: long ? "rgba(16,237,191,0.22)" : "rgba(246,61,109,0.22)" }}
        />

        <div className="relative flex flex-col items-center gap-3 text-center">
          <span
            className="flex size-12 items-center justify-center rounded-full"
            style={{
              background: long ? "rgba(16,237,191,0.15)" : "rgba(246,61,109,0.15)",
              color: accent,
            }}
          >
            <CheckIcon className="size-6" />
          </span>
          <h2 id="trade-success-title" className="font-[family-name:var(--font-display)] text-lg tracking-wide text-paper">
            {title}
          </h2>
          <p className="flex items-center gap-2 text-[12px] text-fog">
            <img src={meta.icon} alt="" className="size-4" />
            {meta.label} ·{" "}
            <span style={{ color: accent }}>{long ? "Long" : "Short"}</span>
            {result.kind === "open" ? ` · ${result.leverage}x` : null}
          </p>
        </div>

        {closeHero && (
          <div className="relative mt-5 flex flex-col items-center gap-1 bg-white/[0.03] py-4" style={{ borderRadius: 2 }}>
            <span className="text-[11px] text-fog">Realised PnL</span>
            <span
              className="font-[family-name:var(--font-display)] text-2xl tabular-nums"
              style={{ color: closeHero.pnl >= 0 ? "var(--trade-green)" : "var(--trade-red)" }}
            >
              {closeHero.pnl >= 0 ? "+" : "−"}${formatUsdw(Math.abs(closeHero.pnl))}
            </span>
            <span
              className="text-[11px] tabular-nums"
              style={{ color: closeHero.pnl >= 0 ? "var(--trade-green)" : "var(--trade-red)" }}
            >
              {closeHero.pnl >= 0 ? "+" : ""}
              {closeHero.pnlPct.toFixed(1)}%
            </span>
          </div>
        )}

        <div className="relative mt-5 flex flex-col gap-2.5 bg-white/[0.03] p-3" style={{ borderRadius: 2 }}>
          {(openRows ?? closeRows ?? []).map((row) => (
            <Row key={row.label} label={row.label} value={row.value} />
          ))}
        </div>

        <div className="relative mt-5 flex flex-col gap-2.5">
          <button
            type="button"
            autoFocus
            onClick={() => {
              onClose();
              onPrimary();
            }}
            className="trade-place-btn w-full py-2.5"
          >
            {primaryLabel}
          </button>
          <div className="flex items-center justify-between">
            {result.txHash ? (
              <a
                href={explorerTx(result.txHash)}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-fog underline hover:text-paper"
              >
                View transaction
              </a>
            ) : (
              <span />
            )}
            <button type="button" onClick={onClose} className="text-[11px] text-fog hover:text-paper">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
