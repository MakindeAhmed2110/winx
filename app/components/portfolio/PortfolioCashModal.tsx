import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatUnits, getAddress, isAddress, parseUnits } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import { addresses, robinhoodTestnet } from "../../lib/config";
import { useLinkedWallet } from "../../lib/operating-wallet";
import { qrModules } from "../../lib/qr";

const transferAbi = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const;

type Mode = "deposit" | "withdraw";

export function PortfolioCashModal({
  mode,
  address,
  unshielded,
  onClose,
  onDone,
}: {
  mode: Mode;
  address: `0x${string}` | undefined;
  unshielded: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const publicClient = usePublicClient({ chainId: robinhoodTestnet.id });
  const { writeContractAsync } = useWriteContract();
  const linked = useLinkedWallet();
  const [amount, setAmount] = useState(mode === "deposit" ? "1000" : "");
  const [dest, setDest] = useState<"linked" | "other">(linked ? "linked" : "other");
  const [wallet, setWallet] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shown = address ? getAddress(address) : "";
  const destination = dest === "linked" && linked ? linked : wallet;

  useEffect(() => {
    if (linked) setDest("linked");
  }, [linked]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const submit = async () => {
    if (!address) throw new Error("Connect a wallet first.");
    const clean = amount.endsWith(".") ? amount.slice(0, -1) : amount;
    const parsed = Number(clean);
    if (!Number.isFinite(parsed) || parsed <= 0) throw new Error("Enter an amount.");
    if (mode === "deposit") {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, amount: clean }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string; amount?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Deposit failed");
      setDone(`${json.amount ?? amount} USDW is on its way to your wallet.`);
      onDone();
      return;
    }
    if (!isAddress(destination)) throw new Error("Enter the wallet that should receive the USDW.");
    if (destination.toLowerCase() === address.toLowerCase()) {
      throw new Error("That is already the wallet holding this unshielded balance.");
    }
    if (parsed > unshielded + 1e-6) throw new Error("Amount is above your unshielded balance.");
    if (!publicClient) throw new Error("RPC not ready. Refresh and try again.");
    const units = parseUnits(clean, 6);
    const hash = await writeContractAsync({
      address: addresses.usdw,
      abi: transferAbi,
      functionName: "transfer",
      args: [destination, units],
      chainId: robinhoodTestnet.id,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === "reverted") throw new Error("Withdraw reverted.");
    setDone(`Sent ${formatUnits(units, 6)} USDW to ${destination.slice(0, 6)}…${destination.slice(-4)}.`);
    onDone();
  };

  return createPortal(
    <div className="portfolio-cash" role="presentation">
      <button type="button" className="portfolio-cash-backdrop" aria-label="Close" onClick={busy ? undefined : onClose} />
      <div className="portfolio-cash-card" role="dialog" aria-modal="true" aria-labelledby="portfolio-cash-title">
        <div className="portfolio-cash-head">
          <h2 id="portfolio-cash-title">{mode === "deposit" ? "Deposit" : "Withdraw"}</h2>
          <button type="button" onClick={onClose} disabled={busy}>
            Close
          </button>
        </div>
        {done ? (
          <p className="portfolio-cash-done">{done}</p>
        ) : (
          <>
            <label className="portfolio-cash-field">
              <span>Amount</span>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value.replace(/[^\d.]/g, ""))}
                placeholder="0.00"
              />
              <b>USDW</b>
            </label>
            {mode === "deposit" ? (
              <DepositAddress address={shown} copied={copied} onCopy={() => setCopied(true)} />
            ) : (
              <>
                <p className="portfolio-cash-note">
                  Unshielded balance <strong>{unshielded.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDW</strong>
                  <button type="button" onClick={() => setAmount(unshielded.toFixed(2))}>
                    Max
                  </button>
                </p>
                {linked ? (
                  <div className="portfolio-cash-dest" role="group" aria-label="Withdraw to">
                    <button
                      type="button"
                      className={dest === "linked" ? "is-active" : ""}
                      onClick={() => setDest("linked")}
                    >
                      <span>Connected wallet</span>
                      <b>{`${linked.slice(0, 6)}…${linked.slice(-4)}`}</b>
                    </button>
                    <button
                      type="button"
                      className={dest === "other" ? "is-active" : ""}
                      onClick={() => setDest("other")}
                    >
                      <span>Another wallet</span>
                      <b>New address</b>
                    </button>
                  </div>
                ) : null}
                {dest === "other" || !linked ? (
                  <label className="portfolio-cash-field is-address">
                    <span>Wallet</span>
                    <input
                      value={wallet}
                      onChange={(event) => setWallet(event.target.value.trim())}
                      placeholder="0x…"
                      spellCheck={false}
                    />
                  </label>
                ) : null}
              </>
            )}
            {error ? <p className="portfolio-cash-error">{error}</p> : null}
            <SwipeConfirm
              busy={busy}
              disabled={!address}
              label={mode === "deposit" ? "Swipe to deposit" : "Swipe to withdraw"}
              onConfirm={async () => {
                setBusy(true);
                setError(null);
                try {
                  await submit();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Transaction failed");
                  throw e;
                } finally {
                  setBusy(false);
                }
              }}
            />
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function DepositAddress({
  address,
  copied,
  onCopy,
}: {
  address: string;
  copied: boolean;
  onCopy: () => void;
}) {
  if (!address) {
    return <p className="portfolio-cash-note">Preparing your trading wallet.</p>;
  }
  return (
    <div className="portfolio-cash-receive">
      <WalletQr value={address} />
      <p className="portfolio-cash-note">Send USDW on Robinhood testnet to this trading wallet</p>
      <button
        type="button"
        className="portfolio-cash-address"
        onClick={() => {
          void navigator.clipboard?.writeText(address).then(onCopy).catch(() => undefined);
        }}
      >
        <span>{address}</span>
        <b>{copied ? "Copied" : "Copy"}</b>
      </button>
    </div>
  );
}

function WalletQr({ value }: { value: string }) {
  const modules = qrModules(value);
  const size = modules.length;
  const cells: string[] = [];
  modules.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) cells.push(`${x},${y}`);
    });
  });
  return (
    <svg className="portfolio-cash-qr" viewBox={`-2 -2 ${size + 4} ${size + 4}`} role="img" aria-label={value}>
      <rect x="-2" y="-2" width={size + 4} height={size + 4} fill="#fff" />
      {cells.map((cell) => {
        const [x, y] = cell.split(",");
        return <rect key={cell} x={x} y={y} width="1" height="1" fill="#000" />;
      })}
    </svg>
  );
}

function SwipeConfirm({
  label,
  busy,
  disabled,
  onConfirm,
}: {
  label: string;
  busy: boolean;
  disabled: boolean;
  onConfirm: () => Promise<void>;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; start: number } | null>(null);
  const swipeRef = useRef(0);
  const [swipePx, setSwipePx] = useState(0);
  const [dragging, setDragging] = useState(false);

  const travel = () => {
    const track = trackRef.current;
    if (!track) return 120;
    return Math.max(40, track.clientWidth - 8 - 36);
  };

  const move = (px: number) => {
    const next = Math.min(travel(), Math.max(0, px));
    swipeRef.current = next;
    setSwipePx(next);
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: PointerEvent) => {
      if (!drag.current) return;
      move(drag.current.start + event.clientX - drag.current.x);
    };
    const onUp = (event: PointerEvent) => {
      const dx = drag.current ? event.clientX - drag.current.x : 0;
      const start = drag.current?.start ?? 0;
      drag.current = null;
      setDragging(false);
      const next = Math.min(travel(), Math.max(0, start + dx));
      move(next);
      if (next > travel() * 0.75) {
        move(travel());
        void onConfirm().catch(() => move(0));
        return;
      }
      move(0);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging, onConfirm]);

  return (
    <div
      ref={trackRef}
      className={`sheet-swipe ${busy ? "is-busy" : ""} ${dragging ? "is-dragging" : ""}`}
    >
      <button
        type="button"
        className="sheet-swipe-handle"
        style={{ width: busy ? "100%" : `${36 + swipePx}px` }}
        disabled={disabled || busy}
        aria-label={label}
        onPointerDown={(event) => {
          if (disabled || busy) return;
          drag.current = { x: event.clientX, start: swipeRef.current };
          setDragging(true);
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            /* window listeners follow the pointer */
          }
        }}
      >
        <span className="sheet-swipe-knob">
          {busy ? <span className="sheet-spinner" /> : <DoubleCaret />}
        </span>
      </button>
      <span className="sheet-swipe-label">{busy ? "Confirming" : label}</span>
    </div>
  );
}

function DoubleCaret() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 4l4 4-4 4M8.5 4l4 4-4 4" fill="none" stroke="black" strokeWidth="1.4" />
    </svg>
  );
}
