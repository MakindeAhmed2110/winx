import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { explorerTx } from "../../lib/config";
import { useOperatingAddress } from "../../lib/operating-wallet";

type FaucetStatus = {
  available: boolean;
  amount?: string;
  ethAmount?: string;
  nextClaimAt?: number | null;
  retryInMs?: number;
  gasOnly?: boolean;
  error?: string;
};

type ClaimResult = {
  ok?: boolean;
  amount?: string;
  ethAmount?: string;
  txHash?: string;
  ethTxHash?: string;
  nextClaimAt?: number;
  error?: string;
  retryInMs?: number;
};

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m.toString().padStart(2, "0")}m ${s.toString().padStart(2, "0")}s`;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function FaucetModal({
  open,
  onClose,
  onClaimed,
}: {
  open: boolean;
  onClose: () => void;
  onClaimed?: () => void;
}) {
  const address = useOperatingAddress();
  const [status, setStatus] = useState<FaucetStatus | null>(null);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [ethTxHash, setEthTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async (addr: string | undefined) => {
    if (!addr) {
      setStatus({ available: false });
      return;
    }
    try {
      const res = await fetch(`/api/faucet?address=${addr}`);
      const json = (await res.json()) as FaucetStatus;
      setStatus(json);
    } catch {
      setStatus({ available: true });
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setTxHash(null);
    setEthTxHash(null);
    setError(null);
    void loadStatus(address);
  }, [open, address, loadStatus]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [open]);

  if (!open) return null;

  const retryMs =
    status?.nextClaimAt != null
      ? Math.max(0, status.nextClaimAt - now)
      : status?.retryInMs ?? 0;
  const sent = Boolean(txHash || ethTxHash);
  const gasOnly = Boolean(status?.gasOnly) && !sent;
  const locked = Boolean(address) && !sent && retryMs > 0 && !gasOnly;

  async function claim() {
    if (!address || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const json = (await res.json()) as ClaimResult;
      if (!res.ok || !json.ok) {
        setError(json.error || "Claim failed");
        if (json.nextClaimAt) {
          setStatus((s) => ({
            available: false,
            amount: s?.amount ?? "1000",
            ethAmount: s?.ethAmount ?? "0.025",
            nextClaimAt: json.nextClaimAt,
            retryInMs: json.retryInMs,
          }));
        }
        return;
      }
      setTxHash(json.txHash || null);
      setEthTxHash(json.ethTxHash || null);
      setStatus({
        available: false,
        amount: json.amount,
        ethAmount: json.ethAmount ?? "0.025",
        nextClaimAt: json.nextClaimAt ?? Date.now() + 24 * 60 * 60 * 1000,
      });
      try {
        onClaimed?.();
      } catch {
        // Tokens already arrived — don't surface a balance-refresh failure as a claim error.
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Claim failed");
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="faucet-title"
      className="book-in fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[400px] overflow-hidden border border-white/10 bg-[#0a0c10] p-6 shadow-2xl"
        style={{ borderRadius: 4 }}
        onClick={(e) => e.stopPropagation()}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -top-16 left-1/2 h-32 w-48 -translate-x-1/2 rounded-full blur-3xl"
          style={{ background: "rgba(16,237,191,0.18)" }}
        />

        <div className="relative flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] tracking-[0.22em] text-fog uppercase">Testnet</p>
            <h2
              id="faucet-title"
              className="mt-1 font-[family-name:var(--font-display)] text-lg tracking-wide text-paper"
            >
              Faucet
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[11px] text-fog hover:text-paper"
          >
            Close
          </button>
        </div>

        <p className="relative mt-3 text-[13px] leading-relaxed text-mist">
          Claim <span className="tabular-nums text-paper">1,000 $USDW</span> and{" "}
          <span className="tabular-nums text-paper">0.025 ETH</span> to the connected
          wallet. One drop per address every 24 hours.
        </p>

        <div
          className="relative mt-5 flex flex-col gap-2.5 bg-white/[0.03] p-3"
          style={{ borderRadius: 2 }}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-fog">Amount</span>
            <span className="text-[13px] tabular-nums text-paper">1,000 USDW + 0.025 ETH</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-fog">Recipient</span>
            <span className="text-[12px] tabular-nums text-paper">
              {address ? shortAddr(address) : "Not connected"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-fog">Cooldown</span>
            <span className="text-[12px] tabular-nums text-paper">
              {txHash || locked ? formatCountdown(retryMs) : "Ready"}
            </span>
          </div>
        </div>

        {sent ? (
          <div className="relative mt-4 text-center">
            <p className="text-[13px]" style={{ color: "var(--trade-green)" }}>
              {txHash && ethTxHash
                ? "1,000 USDW + 0.025 ETH sent"
                : ethTxHash
                  ? "0.025 ETH sent"
                  : "1,000 USDW sent"}
            </p>
            {txHash ? (
              <a
                href={explorerTx(txHash)}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-[11px] text-fog underline hover:text-paper"
              >
                View USDW transaction
              </a>
            ) : null}
            {ethTxHash ? (
              <a
                href={explorerTx(ethTxHash)}
                target="_blank"
                rel="noreferrer"
                className="mt-1 ml-3 inline-block text-[11px] text-fog underline hover:text-paper"
              >
                View ETH transaction
              </a>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p className="relative mt-3 text-[12px] text-[#f63d6d]">{error}</p>
        ) : null}

        <button
          type="button"
          className="trade-place-btn relative mt-5 w-full py-2.5 disabled:opacity-50"
          disabled={!address || busy || locked || sent}
          onClick={() => void claim()}
        >
          {!address
            ? "Connect wallet"
            : busy
              ? "Sending…"
              : sent
                ? "Claimed"
                : locked
                  ? `Available in ${formatCountdown(retryMs)}`
                  : gasOnly
                    ? "Claim 0.025 ETH"
                    : "Claim 1,000 USDW + 0.025 ETH"}
        </button>
      </div>
    </div>,
    document.body,
  );
}
