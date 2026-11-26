import { useEffect, useMemo, useRef, useState } from "react";
import { formatUnits, getAddress } from "viem";
import { usePrivy } from "@privy-io/react-auth";
import { usePrivyStatus } from "../auth/privy-status";
import { PrivyAddressSync } from "../../hooks/useSessionAddress";
import { useTradeDesk } from "../../hooks/useTradeDesk";
import { useSettlementMarks } from "../../hooks/useSettlementMarks";
import { marketById, markets } from "../../lib/config";
import {
  embeddedWalletAddress,
  externalWalletAddress,
  isDirectWallet,
} from "../../lib/operating-wallet";
import type { LocalPosition } from "../../lib/privacy/notes";
import { MobileTradeDock } from "../trade/MobileTradeDock";
import { TradeHeader } from "../trade/TradeHeader";
import { TradeSuccessModal } from "../trade/TradeSuccessModal";
import { useUsdwSeries } from "../../hooks/useUsdwSeries";
import { PortfolioCashModal } from "./PortfolioCashModal";
import { PortfolioChart } from "./PortfolioChart";

type WorthView = "all" | "shielded" | "unshielded";
type MobilePane = "worth" | "positions";
type AccountTab = "positions" | "balances" | "tools" | "orders" | "trades" | "ordersHistory";

const WORTH_TABS: { id: WorthView; label: string }[] = [
  { id: "all", label: "All" },
  { id: "shielded", label: "Shielded" },
  { id: "unshielded", label: "Unshielded" },
];

const RANGES = ["1D", "2D", "7D", "2W", "1M", "All"];

const ACCOUNT_TABS: { id: AccountTab; label: string }[] = [
  { id: "positions", label: "Positions" },
  { id: "balances", label: "Balances" },
  { id: "tools", label: "Tools" },
  { id: "orders", label: "Open orders" },
  { id: "trades", label: "Trade history" },
  { id: "ordersHistory", label: "Order history" },
];

function marketLabel(marketId: number): string {
  return marketById(marketId)?.label ?? `Market ${marketId}`;
}

function money(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function PortfolioPage() {
  const desk = useTradeDesk();
  const privyStatus = usePrivyStatus();
  const marks = useSettlementMarks();
  const [view, setView] = useState<WorthView>("all");
  const [range, setRange] = useState("All");
  const [pane, setPane] = useState<MobilePane>("worth");
  const [accountTab, setAccountTab] = useState<AccountTab>("positions");
  const [cash, setCash] = useState<"deposit" | "withdraw" | null>(null);

  const rows = useMemo(() => {
    return desk.positions.map((position) => {
      const entry = Number(position.entryPrice) / 1e8;
      const live = marks[position.marketId];
      const mark = live != null && live > 0 ? live : entry;
      const margin = Number(formatUnits(BigInt(position.margin), 6));
      const notional = Number(formatUnits(BigInt(position.size), 6));
      const dir = position.isLong ? 1 : -1;
      const pnl = entry > 0 ? dir * ((mark - entry) / entry) * notional : 0;
      const pct = margin > 0 ? (pnl / margin) * 100 : 0;
      const qty = mark > 0 ? notional / mark : 0;
      return { position, entry, mark, margin, notional, pnl, pct, qty };
    });
  }, [desk.positions, marks]);

  const wallet = desk.usdwBal !== undefined ? Number(desk.usdwBal) / 1e6 : 0;
  const shielded = Number(desk.shieldedBal) / 1e6;
  const perpsEquity = rows.reduce((sum, row) => sum + row.margin + row.pnl, 0);
  const pnl = rows.reduce((sum, row) => sum + row.pnl, 0);
  const totalEquity = wallet + shielded + Math.max(perpsEquity, 0);
  const headline =
    view === "shielded" ? shielded : view === "unshielded" ? wallet : totalEquity;
  const connected = Boolean(desk.address);
  const btcQty = rows
    .filter((row) => row.position.marketId === markets.btc.id)
    .reduce((sum, row) => sum + row.qty, 0);

  const curvePositions = useMemo(
    () =>
      rows.map((row) => ({
        marketId: row.position.marketId,
        isLong: row.position.isLong,
        entry: row.entry,
        notional: row.notional,
        createdAt: row.position.createdAt,
        mark: row.mark,
      })),
    [rows],
  );
  const principal = wallet + shielded + rows.reduce((sum, row) => sum + row.margin, 0);
  const usdw = useUsdwSeries(desk.address, connected ? principal : 0, curvePositions, range);
  const usdwStart = usdw.points[0]?.v ?? 0;
  const usdwEnd = usdw.points[usdw.points.length - 1]?.v ?? (connected ? totalEquity : 0);
  const usdwChange = usdwEnd - usdwStart;

  const stats = [
    ["shielded", "Shielded", `${money(connected ? shielded : 0)} USDW`, false],
    ["unshielded", "Unshielded", `${money(connected ? wallet : 0)} USDW`, false],
    ["pnl", "PNL", `${connected && pnl < 0 ? "" : "+"}${money(connected ? pnl : 0)} USDW`, pnl >= 0],
    ["volume", "Volume", "—", false],
    ["drawdown", "Max drawdown", "—", false],
    ["equity", "Total equity", `${money(connected ? totalEquity : 0)} USDW`, false],
    ["perps", "Perps account equity", `${money(connected ? perpsEquity : 0)} USDW`, false],
  ] as const;

  return (
    <div className={`portfolio-page is-${pane}`}>
      <div className="portfolio-glow" aria-hidden="true" />
      {privyStatus === "ready" ? <PrivyAddressSync onAddress={desk.onPrivyAddress} /> : null}
      <TradeHeader onFaucetClaimed={() => void desk.refetchUsdw?.()} />

      <main className="portfolio-main">
        <header className="portfolio-head">
          <div className="portfolio-title">
            <div className="portfolio-title-row">
              <h1>Portfolio</h1>
              <WalletKind />
            </div>
          </div>
          <div className="portfolio-actions">
            <button type="button" onClick={() => setCash("deposit")}>
              Deposit
            </button>
            <button type="button" onClick={() => setCash("withdraw")}>
              Withdraw
            </button>
            <button type="button">Swap</button>
            <button type="button" className="portfolio-gear" aria-label="Settings">
              <img src="/logo/gear.svg" alt="" width={16} height={16} />
            </button>
          </div>
        </header>

        {desk.status.kind === "work" || desk.status.kind === "err" || desk.status.kind === "ok" ? (
          <p className={`portfolio-status is-${desk.status.kind}`}>{desk.status.text}</p>
        ) : null}

        <div className="portfolio-mobile-switch" role="tablist" aria-label="Portfolio">
          <button
            type="button"
            className={pane === "worth" ? "is-active" : ""}
            onClick={() => setPane("worth")}
          >
            Total worth
          </button>
          <button
            type="button"
            className={pane === "positions" ? "is-active" : ""}
            onClick={() => setPane("positions")}
          >
            Positions
          </button>
        </div>

        <section className="portfolio-overview">
          <div className="portfolio-overview-copy">
            <div className="portfolio-tabs" role="tablist" aria-label="Balance view">
              {WORTH_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={view === tab.id ? "is-active" : ""}
                  onClick={() => setView(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <p className="portfolio-kicker">Total portfolio</p>
            <div className="portfolio-total">
              <strong>${money(connected ? headline : 0)}</strong>
              <span className={usdwChange >= 0 ? "is-up" : "is-down"}>
                {usdwChange >= 0 ? "+" : "-"}${money(Math.abs(usdwChange))}
              </span>
            </div>
            <div className="portfolio-chips">
              <span>
                <img src="/logo/winx-mark.svg" alt="" width={20} height={16} />
                {money(connected ? wallet + shielded : 0, 4)}
              </span>
              <i />
              <span>
                <img src="/assets/eth.svg" alt="" width={16} height={16} />
                {desk.ethDisplay}
              </span>
              <i />
              <span>
                <img src="/assets/btc.svg" alt="" width={16} height={16} />
                {(connected ? btcQty : 0).toFixed(4)}
              </span>
            </div>
          </div>
          <div className="portfolio-overview-chart">
            <div className="portfolio-ranges" role="group" aria-label="Range">
              {RANGES.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={range === item ? "is-active" : ""}
                  onClick={() => setRange(item)}
                >
                  {item}
                </button>
              ))}
            </div>
            <PortfolioChart points={usdw.points} start={usdw.start} end={usdw.end} />
          </div>
          <div className="portfolio-stats">
            {stats.map(([key, label, value, up]) => (
              <div key={key} className={`portfolio-stat is-${key}`}>
                <span className={key === "volume" ? "is-dotted" : undefined}>{label}</span>
                <b className={key === "pnl" ? (up ? "is-up" : "is-down") : undefined}>
                  {value}
                </b>
              </div>
            ))}
          </div>
        </section>

        <section className="portfolio-account">
          <div className="portfolio-account-bar">
            <div className="portfolio-tabs" role="tablist" aria-label="Account">
              {ACCOUNT_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={accountTab === tab.id ? "is-active" : ""}
                  onClick={() => setAccountTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button type="button" className="portfolio-filter">
              Filter
              <FilterIcon />
            </button>
          </div>

          {accountTab === "positions" ? (
            <PositionsTable
              rows={rows}
              busy={desk.busy}
              canClose={connected}
              onClose={(position, opts) => desk.onClosePosition(position, opts)}
            />
          ) : null}

          {accountTab === "balances" ? (
            <div className="portfolio-table-wrap">
              <div className="portfolio-row is-head">
                <span>Asset</span>
                <span>Wallet</span>
                <span>Shielded</span>
                <span />
              </div>
              <div className="portfolio-row">
                <span>USDW</span>
                <span>{desk.usdwDisplay}</span>
                <span>{desk.shieldedDisplay}</span>
                <span className="portfolio-row-action">
                  {desk.shieldedBal > 0n ? (
                    <button
                      type="button"
                      className="portfolio-unshield"
                      disabled={desk.busy || !connected}
                      onClick={() => void desk.onWithdraw()}
                    >
                      Unshield
                    </button>
                  ) : null}
                </span>
              </div>
              <div className="portfolio-row">
                <span>ETH</span>
                <span>{desk.ethDisplay}</span>
                <span>—</span>
                <span />
              </div>
            </div>
          ) : null}

          {accountTab !== "positions" && accountTab !== "balances" ? (
            <p className="portfolio-empty">Nothing here yet.</p>
          ) : null}
        </section>
      </main>

      <footer className="portfolio-footer">
        <span>
          <i />
          Online
        </span>
        <span>Powered by Winx v1.0</span>
      </footer>

      <MobileTradeDock active="portfolio" showSides={false} />

      {cash ? (
        <PortfolioCashModal
          mode={cash}
          address={desk.address}
          unshielded={connected ? wallet : 0}
          onClose={() => setCash(null)}
          onDone={() => {
            void desk.refetchUsdw?.();
          }}
        />
      ) : null}

      {desk.success ? (
        <TradeSuccessModal
          result={desk.success}
          onClose={desk.dismissSuccess}
          onPrimary={() => {
            if (desk.success?.kind === "unshield") setAccountTab("balances");
            else desk.setBottomTab("positions");
          }}
        />
      ) : null}
    </div>
  );
}

function WalletKind() {
  const { user, authenticated } = usePrivy();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!authenticated) return null;
  const external = externalWalletAddress(user);
  const embedded = embeddedWalletAddress(user);
  const direct = isDirectWallet(external);
  const trading = direct ? external : embedded;
  const tradingLabel = trading ? getAddress(trading) : "";
  const linked = !direct && external ? getAddress(external) : "";

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      window.setTimeout(() => setCopied((current) => (current === value ? null : current)), 1200);
    } catch {
      // Clipboard can be blocked. The address stays visible in the menu.
    }
  }

  return (
    <div className="portfolio-wallet" ref={rootRef}>
      <button
        type="button"
        className="portfolio-wallet-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Wallet addresses"
        onClick={() => setOpen((value) => !value)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="2.5" y="6" width="19" height="13" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M2.5 10h19" stroke="currentColor" strokeWidth="1.6" />
          <circle cx="16.5" cy="14.5" r="1.15" fill="currentColor" />
        </svg>
      </button>
      {open ? (
        <div className="portfolio-wallet-menu" role="dialog" aria-label="Wallet addresses">
          <button
            type="button"
            className="portfolio-wallet-row"
            disabled={!tradingLabel}
            onClick={() => tradingLabel && void copy(tradingLabel)}
          >
            <span>{direct ? "Direct wallet" : "Embedded wallet"}</span>
            <b>{tradingLabel || "Creating your trading wallet"}</b>
            {tradingLabel ? <em>{copied === tradingLabel ? "Copied" : "Copy"}</em> : null}
          </button>
          {linked ? (
            <button type="button" className="portfolio-wallet-row" onClick={() => void copy(linked)}>
              <span>Linked external</span>
              <b>{linked}</b>
              <em>{copied === linked ? "Copied" : "Copy"}</em>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function PositionsTable({
  rows,
  busy,
  canClose,
  onClose,
}: {
  rows: {
    position: LocalPosition;
    entry: number;
    mark: number;
    margin: number;
    qty: number;
    pnl: number;
    pct: number;
  }[];
  busy: boolean;
  canClose: boolean;
  onClose: (position: LocalPosition, opts?: { quiet?: boolean }) => Promise<boolean>;
}) {
  const [closingAll, setClosingAll] = useState(false);
  const locked = busy || closingAll || !canClose;

  const closeAll = async () => {
    if (locked || rows.length === 0) return;
    setClosingAll(true);
    try {
      const batch = rows.length > 1;
      for (const row of rows) {
        const ok = await onClose(row.position, batch ? { quiet: true } : undefined);
        if (!ok) return;
      }
    } finally {
      setClosingAll(false);
    }
  };

  return (
    <div className="portfolio-table-wrap">
      <div className="portfolio-row is-head is-positions">
        <span>Asset</span>
        <span>Quantity</span>
        <span>Cost basis</span>
        <span>Entry price</span>
        <span>
          Mark price
          <CaretIcon />
        </span>
        <span>Unrealized P&L</span>
        <span className="portfolio-row-action">
          <button
            type="button"
            className="portfolio-close"
            disabled={locked || rows.length === 0}
            onClick={() => void closeAll()}
          >
            {closingAll ? "Closing…" : "Close all"}
          </button>
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="portfolio-empty">No private positions yet.</p>
      ) : (
        rows.map((row) => {
          const up = row.pnl >= 0;
          return (
            <div className="portfolio-row is-positions" key={row.position.commitment}>
              <span>{marketLabel(row.position.marketId)}</span>
              <span>{row.qty.toLocaleString("en-US", { maximumFractionDigits: 4 })}</span>
              <span>${money(row.margin, 0)}</span>
              <span>${row.entry.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
              <span>${row.mark.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
              <span className={up ? "is-up" : "is-down"}>
                {up ? "" : "-"}${Math.abs(row.pnl).toLocaleString("en-US", { maximumFractionDigits: 0 })} (
                {Math.abs(row.pct).toFixed(1)}%)
              </span>
              <span className="portfolio-row-action">
                <button
                  type="button"
                  className="portfolio-close"
                  disabled={locked}
                  onClick={() => void onClose(row.position)}
                >
                  {busy ? "Closing…" : "Close"}
                </button>
              </span>
            </div>
          );
        })
      )}
    </div>
  );
}

function FilterIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3 4.5h14l-5.2 6.1v4.2l-3.6 1.6V10.6L3 4.5Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function CaretIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 3.2 11 6.4H5L8 3.2Zm0 9.6L5 9.6h6L8 12.8Z" fill="currentColor" />
    </svg>
  );
}
