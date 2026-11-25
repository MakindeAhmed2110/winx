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

export type UnshieldSuccess = {
  kind: "unshield";
  txHash: string;
  amount: string;
};

export type TradeSuccess = OpenSuccess | CloseSuccess | UnshieldSuccess;

function marketMeta(marketId: number) {
  if (marketId === markets.eth.id) return markets.eth;
  return markets.btc;
}

function SuccessMark() {
  return (
    <svg className="sheet-check" viewBox="0 0 120 120" aria-hidden>
      <circle cx="60" cy="60" r="46" fill="none" stroke="white" strokeWidth="3" />
      <path d="M38 62l14 14 30-32" fill="none" stroke="white" strokeWidth="3" />
    </svg>
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
  const unshielded = result.kind === "unshield";
  const meta = unshielded ? null : marketMeta(result.marketId);
  const side = unshielded ? "" : result.isLong ? "Long" : "Short";
  const opened = result.kind === "open";
  const unshieldedAmount = unshielded ? formatUsdw(safeTokenAmount(result.amount)) : "";

  let pnlLine: string | null = null;
  if (result.kind === "close") {
    const margin = safeTokenAmount(result.margin);
    const leftover = safeTokenAmount(result.leftover);
    const pnl = leftover - margin;
    const pnlPct = margin > 0 ? (pnl / margin) * 100 : 0;
    pnlLine = `${pnl >= 0 ? "+" : "−"}$${formatUsdw(Math.abs(pnl))} (${pnl >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%)`;
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="trade-success" role="dialog" aria-modal="true" aria-labelledby="trade-success-title" onClick={onClose}>
      <div className="trade-success-card" onClick={(e) => e.stopPropagation()}>
        <SuccessMark />
        <h2 id="trade-success-title">
          {unshielded ? (
            <>
              USDW
              <br />
              unshielded
            </>
          ) : opened ? (
            <>
              Order has been
              <br />
              filled
            </>
          ) : (
            <>
              Position has
              <br />
              been closed
            </>
          )}
        </h2>
        {unshielded ? (
          <p className="is-up">{unshieldedAmount} USDW</p>
        ) : (
          <p>
            {side} {meta?.label}
          </p>
        )}
        {pnlLine ? <p className={pnlLine.startsWith("+") ? "is-up" : "is-down"}>{pnlLine}</p> : null}
        <button
          type="button"
          className="sheet-review"
          autoFocus
          onClick={() => {
            onClose();
            onPrimary();
          }}
        >
          Done
        </button>
        {result.txHash ? (
          <a href={explorerTx(result.txHash)} target="_blank" rel="noreferrer">
            View transaction
          </a>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
