import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { formatUnits } from "viem";
import { formatUsdw } from "../../lib/format";
import { useSettlementMarks } from "../../hooks/useSettlementMarks";
import type { LocalNote } from "../../lib/privacy/notes";
import type { TradeDeskState } from "../../hooks/useTradeDesk";

/** Figma table text: Satoshi 12px, -2% tracking, uppercase. */
const TEXT = "text-[12px] uppercase leading-normal tracking-[-0.24px] tabular-nums";
/** Single labels are trimmed to cap height like Figma's text boxes. Table cells
 * aren't, so truncation doesn't clip descenders; Satoshi's cap centre sits
 * within ~0.1px of its line-box centre, so they still line up with Figma. */
const CELL = `${TEXT} [text-box:trim-both_cap_alphabetic]`;
/** Figma gain / loss colours. */
const UP = "text-[#0fedbe]";
const DOWN = "text-[#f63c6b]";

/**
 * Figma account table header: 35px row, 20px side padding, 10px between the
 * equal-width columns and a 120px action column; labels at 50% with a 1px
 * white 20% line under the row. The first row starts 10.94px below it.
 * Below 1536px wide the action column narrows to 80px (Close + More need 71)
 * so the column labels still fit.
 */
function TableHead({ cols }: { cols: readonly string[] }) {
  return (
    <div className="mb-[10.94px] flex h-[35px] items-center gap-2.5 px-5 shadow-[0_1px_0_rgba(255,255,255,0.2)]">
      {cols.map((c) => (
        <span key={c} className="flex min-w-px flex-1 items-center">
          <span className={`truncate text-white opacity-50 ${TEXT}`}>{c}</span>
        </span>
      ))}
      <span className="w-[120px] shrink-0 max-2xl:w-20" />
    </div>
  );
}

/** Figma account table row: 38.41px tall, rows 2px apart. */
function TableRow({ cells, action }: { cells: ReactNode[]; action: ReactNode }) {
  return (
    <div className="flex h-[38.41px] items-center gap-2.5 px-5">
      {cells.map((c, i) => (
        <span key={i} className="flex min-w-px flex-1 items-center">
          <span className={`truncate text-white ${TEXT}`}>{c}</span>
        </span>
      ))}
      <span className="flex w-[120px] shrink-0 items-center justify-end gap-0.5 max-2xl:w-20">
        {action}
      </span>
    </div>
  );
}

function EmptyRow({ children }: { children: string }) {
  return (
    <div className="flex h-[38.41px] items-center justify-center px-5">
      <span className="text-[12px] leading-normal tracking-[-0.24px] text-white/50">{children}</span>
    </div>
  );
}

/** Figma "Glass button" (Text): white 10%, 12px side padding, 19px tall. */
function GlassButton({
  children,
  disabled,
  onClick,
}: {
  children: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-[19px] items-center justify-center bg-white/10 px-3 transition-colors duration-200 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white/10"
    >
      <span className={`text-white ${CELL}`}>{children}</span>
    </button>
  );
}

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
      {/* Figma "Account panel" tabs row: 20px tall, tabs on the left (bottom
          aligned), Filter on the right 20px in from the edge. */}
      <div className="hidden h-5 shrink-0 items-end justify-between pr-5 lg:flex">
        <div className="no-scrollbar flex min-w-0 items-center overflow-x-auto">
          {tabs.map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={bottomTab === k}
              className={`trade-tab ${bottomTab === k ? "is-active" : ""}`}
              onClick={() => setBottomTab(k)}
            >
              <span>{label}</span>
            </button>
          ))}
        </div>
        {/* Figma Filter trigger (50%). Filtering isn't built yet. */}
        <button
          type="button"
          disabled
          title="Filters are coming soon"
          className="flex h-5 shrink-0 items-center gap-1.5 opacity-50"
        >
          <span className={`text-white ${CELL}`}>Filter</span>
          <img src="/icons/funnel-20.svg" alt="" width={20} height={20} className="size-5" />
        </button>
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
              const pair = p.marketId === 1 ? "BTC/USD" : "ETH/USD";
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
          <div className="hidden lg:block">
            <TableHead
              cols={["Asset", "Side", "Leverage", "Margin", "Notional", "Entry", "Mark", "Unrealized PnL"]}
            />
            <div className="flex flex-col gap-0.5">
              {positions.length === 0 && (
                <EmptyRow>No private positions yet. Place an order to open one.</EmptyRow>
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
                const pair = p.marketId === 1 ? "BTC-PERP" : "ETH-PERP";
                return (
                  <TableRow
                    key={p.commitment}
                    cells={[
                      pair,
                      <span key="side" className={p.isLong ? UP : DOWN}>
                        {p.isLong ? "Long" : "Short"}
                      </span>,
                      `${p.leverage}x`,
                      `$${margin.toFixed(2)}`,
                      `$${formatUsdw(notional, 0)}`,
                      `$${entry.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
                      `$${mark.toLocaleString(undefined, { maximumFractionDigits: 2 })}`,
                      <span key="pnl" className={up ? UP : DOWN}>
                        {up ? "+" : ""}${pnl.toFixed(2)} ({up ? "+" : ""}
                        {pct.toFixed(1)}%)
                      </span>,
                    ]}
                    action={
                      <>
                        <GlassButton
                          disabled={busy || !address}
                          onClick={() => void onClosePosition(p)}
                        >
                          Close
                        </GlassButton>
                        <button
                          type="button"
                          aria-label={`${pair} settings`}
                          onClick={() => setSettingsPair(p.marketId === 1 ? "BTC/USD" : "ETH/USD")}
                          className="flex size-[19px] items-center justify-center bg-white/10 transition-colors duration-200 hover:bg-white/15"
                        >
                          <img
                            src="/icons/dots-three-vertical-16.svg"
                            alt=""
                            width={16}
                            height={16}
                          />
                        </button>
                      </>
                    }
                  />
                );
              })}
            </div>
          </div>
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
          <div className="hidden lg:block">
            <TableHead cols={["Asset", "Wallet", "Shielded (Live notes)"]} />
            <div className="flex flex-col gap-0.5">
              <TableRow
                cells={[
                  "USDW",
                  usdwDisplay,
                  <span
                    key="shielded"
                    title="Sum of unspent Live notes only. Trade/Withdraw tags are spent."
                  >
                    {shieldedDisplay}
                  </span>,
                ]}
                action={
                  shieldedBal > 0n ? (
                    <GlassButton disabled={busy || !address} onClick={() => void onWithdraw()}>
                      Unshield
                    </GlassButton>
                  ) : null
                }
              />
              <TableRow
                cells={["ETH", ethDisplay, <span key="eth" className="opacity-50">—</span>]}
                action={null}
              />
            </div>
          </div>
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
          <div className="flex h-full items-center justify-center p-6 text-sm text-fog lg:text-[12px] lg:tracking-[-0.24px] lg:text-white/50">
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
