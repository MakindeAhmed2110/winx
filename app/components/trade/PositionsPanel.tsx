import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatUnits } from "viem";
import { marketById } from "../../lib/config";
import { formatUsdw } from "../../lib/format";
import { useSettlementMarks } from "../../hooks/useSettlementMarks";
import type { LocalNote } from "../../lib/privacy/notes";
import type { TradeDeskState } from "../../hooks/useTradeDesk";

export function PositionsPanel({ desk }: { desk: TradeDeskState }) {
  const {
    bottomTab,
    setBottomTab,
    positions,
    notes,
    ethDisplay,
    usdwDisplay,
    shieldedDisplay,
    shieldedBal,
    onWithdraw,
    onWithdrawNote,
    onClosePosition,
    onDownloadNotes,
    onDownloadNote,
    busy,
    address,
  } = desk;
  // Same oracle family as settlement: mainnet Chainlink (→ testnet Aggregator).
  const liveMarkByMarket = useSettlementMarks();
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [settingsPair, setSettingsPair] = useState<string | null>(null);
  const ordersRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!settingsPair) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsPair(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsPair]);

  useEffect(() => {
    if (!ordersOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (!ordersRef.current?.contains(event.target as Node)) setOrdersOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, [ordersOpen]);

  const tabs = [
    ["positions", "Positions"],
    ["balances", "Balances"],
    ["notes", "Notes"],
    ["orders", "Open orders"],
    ["history", "Trade history"],
  ] as const;

  return (
    <div className="trade-panel flex min-h-[220px] flex-col overflow-hidden bg-black/70 lg:min-h-[280px]">
      <div className="pos-tabs lg:hidden">
        <button
          type="button"
          className={`pos-tab ${bottomTab === "positions" ? "is-active" : ""}`}
          onClick={() => {
            setOrdersOpen(false);
            setBottomTab("positions");
          }}
        >
          Positions
        </button>
        <div className="pos-orders" ref={ordersRef}>
          <button
            type="button"
            className={`pos-tab pos-tab-orders ${
              bottomTab === "orders" || bottomTab === "history" ? "is-active" : ""
            }`}
            aria-expanded={ordersOpen}
            onClick={() => setOrdersOpen((open) => !open)}
          >
            Open orders
            <img src="/logo/icon-caret-down.svg" alt="" width={16} height={16} />
          </button>
          {ordersOpen ? (
            <div className="pos-orders-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setBottomTab("orders");
                  setOrdersOpen(false);
                }}
              >
                Open orders
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setBottomTab("history");
                  setOrdersOpen(false);
                }}
              >
                Trade history
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setBottomTab("history");
                  setOrdersOpen(false);
                }}
              >
                Order history
              </button>
            </div>
          ) : null}
        </div>
        <button
          type="button"
          className={`pos-tab ${
            bottomTab === "balances" || bottomTab === "notes" ? "is-active" : ""
          }`}
          onClick={() => {
            setOrdersOpen(false);
            setBottomTab("balances");
          }}
        >
          Info
        </button>
      </div>
      <div className="hidden items-center gap-4 overflow-x-auto border-b border-white/[0.06] px-3 pt-2 lg:flex">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`trade-tab whitespace-nowrap ${bottomTab === k ? "is-active" : ""}`}
            onClick={() => setBottomTab(k)}
          >
            {label}
          </button>
        ))}
      </div>

      <div key={bottomTab} className="trade-swap min-h-0 flex-1 overflow-auto">
        {bottomTab === "positions" && (
          <>
          <div className="pos-mobile lg:hidden">
            {positions.length === 0 && (
              <p className="px-3 py-8 text-center text-sm text-fog">
                No private positions yet. Place an order to open one.
              </p>
            )}
            {positions.map((p) => {
              const entry = Number(p.entryPrice) / 1e8;
              const live = liveMarkByMarket[p.marketId];
              const mark = live != null ? live : entry;
              const margin = Number(formatUnits(BigInt(p.margin), 6));
              const notional = Number(formatUnits(BigInt(p.size), 6));
              const dir = p.isLong ? 1 : -1;
              const pnl = entry > 0 ? dir * ((mark - entry) / entry) * notional : 0;
              const pct = margin > 0 ? (pnl / margin) * 100 : 0;
              const up = pnl >= 0;
              const pair = marketById(p.marketId)?.label ?? `Market ${p.marketId}`;
              const money = Math.abs(pnl).toLocaleString(undefined, { maximumFractionDigits: 0 });
              return (
                <div key={p.commitment} className="pos-card">
                  <div className="pos-card-top">
                    <span className="pos-card-pair">{pair}</span>
                    <span className={`pos-card-pnl ${up ? "is-up" : "is-down"}`}>
                      {pnl < 0 ? "-" : ""}${money} ({pct.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="pos-card-row">
                    <div className="pos-card-meta">
                      <span>
                        Cost basis
                        <b>${margin.toLocaleString(undefined, { maximumFractionDigits: 0 })}</b>
                      </span>
                      <span>
                        Entry
                        <b>${entry.toLocaleString(undefined, { maximumFractionDigits: 0 })}</b>
                      </span>
                      <span>
                        Mark
                        <b>${mark.toLocaleString(undefined, { maximumFractionDigits: 0 })}</b>
                      </span>
                    </div>
                    <div className="pos-card-actions">
                      <button
                        type="button"
                        className="pos-card-sell"
                        disabled={busy || !address}
                        onClick={() => void onClosePosition(p)}
                      >
                        Close
                      </button>
                      <button
                        type="button"
                        className="pos-card-gear"
                        aria-label="Position settings"
                        onClick={() => setSettingsPair(pair)}
                      >
                        <img src="/logo/gear.svg" alt="" width={16} height={16} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <table className="trade-table hidden lg:table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Side</th>
                <th>Leverage</th>
                <th>Margin</th>
                <th>Notional</th>
                <th>Entry</th>
                <th>Mark</th>
                <th>Unrealized PnL</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {positions.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-fog">
                    No private positions yet. Place an order to open one.
                  </td>
                </tr>
              )}
              {positions.map((p) => {
                const entry = Number(p.entryPrice) / 1e8;
                const live = liveMarkByMarket[p.marketId];
                const mark = live != null ? live : entry;
                const margin = Number(formatUnits(BigInt(p.margin), 6));
                const notional = Number(formatUnits(BigInt(p.size), 6));
                const dir = p.isLong ? 1 : -1;
                const pnl = entry > 0 ? dir * ((mark - entry) / entry) * notional : 0;
                const pct = margin > 0 ? (pnl / margin) * 100 : 0;
                const up = pnl >= 0;
                return (
                  <tr key={p.commitment}>
                    <td className="text-paper">
                      {marketById(p.marketId)?.label ?? `Market ${p.marketId}`}
                    </td>
                    <td className={p.isLong ? "text-[var(--trade-green)]" : "text-[var(--trade-red)]"}>
                      {p.isLong ? "Long" : "Short"}
                    </td>
                    <td className="tabular-nums">{p.leverage}x</td>
                    <td className="tabular-nums">${margin.toFixed(2)}</td>
                    <td className="tabular-nums">${formatUsdw(notional, 0)}</td>
                    <td className="tabular-nums">
                      ${entry.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                    <td className="tabular-nums">
                      ${mark.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                    <td
                      className={`tabular-nums ${up ? "text-[var(--trade-green)]" : "text-[var(--trade-red)]"}`}
                    >
                      {up ? "+" : ""}
                      ${pnl.toFixed(2)} ({up ? "+" : ""}
                      {pct.toFixed(1)}%)
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="rounded border border-white/[0.12] px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] text-paper hover:border-white/30 disabled:opacity-40"
                        disabled={busy || !address}
                        onClick={() => void onClosePosition(p)}
                      >
                        Close
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </>
        )}

        {(bottomTab === "balances" || bottomTab === "notes") && (
          <div className="pos-info lg:hidden">
            <div className="pos-info-row">
              <span>USDW wallet</span>
              <b>{usdwDisplay}</b>
            </div>
            <div className="pos-info-row">
              <span>Shielded</span>
              <b>{shieldedDisplay}</b>
            </div>
            <div className="pos-info-row">
              <span>ETH</span>
              <b>{ethDisplay}</b>
            </div>
            {shieldedBal > 0n && (
              <button
                type="button"
                className="pos-info-withdraw"
                disabled={busy || !address}
                onClick={() => void onWithdraw()}
              >
                Unshield
              </button>
            )}
          </div>
        )}

        {bottomTab === "balances" && (
          <table className="trade-table hidden lg:table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Wallet</th>
                <th>Shielded (Live notes)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="text-paper">USDW</td>
                <td className="tabular-nums">{usdwDisplay}</td>
                <td className="tabular-nums" title="Sum of unspent Live notes only. Trade/Withdraw tags are spent.">
                  {shieldedDisplay}
                </td>
                <td className="text-right">
                  {shieldedBal > 0n && (
                    <button
                      type="button"
                      className="trade-tab-pill rounded border border-white/[0.12] px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] text-paper hover:border-white/30 disabled:opacity-40"
                      disabled={busy || !address}
                      onClick={() => void onWithdraw()}
                    >
                      Unshield
                    </button>
                  )}
                </td>
              </tr>
              <tr>
                <td className="text-paper">ETH</td>
                <td className="tabular-nums">{ethDisplay}</td>
                <td className="tabular-nums text-fog">—</td>
                <td />
              </tr>
            </tbody>
          </table>
        )}

        {(bottomTab === "notes" || bottomTab === "balances") && (
          <div className={`flex flex-col gap-2 p-3 ${bottomTab === "balances" ? "lg:hidden" : ""}`}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] text-fog">
                Close payouts appear as <span className="text-paper">Live</span> notes.
                Trade/Withdraw = already spent (do not add to Shielded). Download a backup
                before clearing storage.
              </p>
              {notes.length > 0 && (
                <button
                  type="button"
                  className="shrink-0 rounded border border-white/[0.12] px-2.5 py-1 text-[11px] uppercase tracking-[0.08em] text-paper hover:border-white/30"
                  onClick={() => onDownloadNotes()}
                >
                  Download all
                </button>
              )}
            </div>
            {(() => {
              const live = notes.filter((n) => !n.spent && !n.pending);
              const pending = notes.filter((n) => !n.spent && n.pending);
              const spent = notes.filter((n) => n.spent);
              if (notes.length === 0) {
                return (
                  <p className="py-6 text-center text-sm text-fog">
                    No shielded notes in this browser.
                  </p>
                );
              }
              return (
                <div className="space-y-4">
                  <div>
                    <p className="mb-1.5 text-[10px] uppercase tracking-[0.12em] text-fog">
                      Live · withdrawable ({live.length})
                    </p>
                    {live.length === 0 ? (
                      <p className="rounded-md border border-white/[0.06] px-3 py-3 text-xs text-fog">
                        No Live payout notes. After a successful close you should see one
                        here — then Unshield to move USDW to Wallet.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {live.map((n) => (
                          <NoteRow
                            key={n.commitment}
                            note={n}
                            onDownload={onDownloadNote}
                            onWithdraw={
                              address && !busy ? () => onWithdrawNote(n) : undefined
                            }
                          />
                        ))}
                      </ul>
                    )}
                  </div>
                  {pending.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-[10px] uppercase tracking-[0.12em] text-fog">
                        Pending confirm ({pending.length})
                      </p>
                      <ul className="space-y-2">
                        {pending.map((n) => (
                          <NoteRow key={n.commitment} note={n} onDownload={onDownloadNote} />
                        ))}
                      </ul>
                    </div>
                  )}
                  {spent.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-[10px] uppercase tracking-[0.12em] text-fog">
                        Spent history ({spent.length})
                      </p>
                      <ul className="space-y-2">
                        {spent.map((n) => (
                          <NoteRow key={n.commitment} note={n} onDownload={onDownloadNote} />
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        {(bottomTab === "orders" || bottomTab === "history") && (
          <div className="flex h-full items-center justify-center p-6 text-sm text-fog">
            {bottomTab === "orders"
              ? "No resting private orders. Market opens settle as commitments."
              : "Fill history stays local until you export notes."}
          </div>
        )}
      </div>
      {settingsPair
        ? createPortal(
            <div
              className="pos-settings-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="pos-settings-title"
              onClick={() => setSettingsPair(null)}
            >
              <div className="pos-settings-card" onClick={(event) => event.stopPropagation()}>
                <div className="pos-settings-head">
                  <h2 id="pos-settings-title">Position settings</h2>
                  <span className="pos-soon">Coming soon</span>
                </div>
                <p className="pos-settings-pair">{settingsPair}</p>
                <div className="pos-settings-list">
                  <div className="pos-settings-row">
                    <span>TP/SL</span>
                  </div>
                  <div className="pos-settings-row">
                    <span>Price settings</span>
                  </div>
                </div>
                <button type="button" className="pos-settings-dismiss" onClick={() => setSettingsPair(null)}>
                  Close
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function NoteRow({
  note,
  onDownload,
  onWithdraw,
}: {
  note: LocalNote;
  onDownload: (n: LocalNote) => void;
  onWithdraw?: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-white/[0.06] px-3 py-2 text-xs">
      <div className="min-w-0">
        <div className="tabular-nums text-paper">
          ${formatUsdw(formatUnits(BigInt(note.amount), 6))}
        </div>
        <div className="mt-0.5 truncate font-mono text-fog">{note.commitment}</div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <NoteStatusTag note={note} />
        {onWithdraw && (
          <button
            type="button"
            className="rounded border border-white/[0.12] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-paper hover:border-white/30"
            onClick={() => onWithdraw()}
          >
            Unshield
          </button>
        )}
        <button
          type="button"
          className="rounded border border-white/[0.12] px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] text-paper hover:border-white/30"
          onClick={() => onDownload(note)}
        >
          Download
        </button>
      </div>
    </li>
  );
}

function NoteStatusTag({ note }: { note: LocalNote }) {
  if (note.pending && !note.spent) {
    return (
      <span className="rounded border border-white/20 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-fog">
        Pending
      </span>
    );
  }
  if (!note.spent) {
    return (
      <span className="rounded border border-[var(--trade-green)]/40 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-[var(--trade-green)]">
        Live
      </span>
    );
  }
  if (note.spentBy === "withdraw") {
    return (
      <span className="rounded border border-white/20 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-fog">
        Withdraw
      </span>
    );
  }
  if (note.spentBy === "trade") {
    return (
      <span className="rounded border border-[var(--trade-red)]/35 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-[var(--trade-red)]">
        Trade
      </span>
    );
  }
  return (
    <span className="rounded border border-white/15 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-fog">
      Spent
    </span>
  );
}
