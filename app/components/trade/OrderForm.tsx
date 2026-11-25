import { usePrivy } from "@privy-io/react-auth";
import { usePrivyStatus } from "../auth/privy-status";
import { formatUsdw } from "../../lib/format";
import { useLiveMark } from "../../hooks/use-live-mark";
import type { TradeDeskState } from "../../hooks/useTradeDesk";
import { LeverageSlider } from "./LeverageSlider";

export function OrderForm({ desk }: { desk: TradeDeskState }) {
  const {
    address,
    isConnected,
    canSign,
    needsNetworkSwitch,
    ensureNetwork,
    isLong,
    setIsLong,
    orderType,
    setOrderType,
    leverage,
    setLeverage,
    market,
    sizeUsd,
    setSizeUsd,
    usdwDisplay,
    markUsd,
    onOpen,
    busy,
    status,
  } = desk;

  const live = useLiveMark(market.extendedMarket);
  const px = live ?? markUsd;
  const marginUsd = Number(sizeUsd) || 0;
  const notional = marginUsd * leverage;
  const liqApprox =
    px && marginUsd > 0
      ? isLong
        ? px * (1 - 0.9 / leverage)
        : px * (1 + 0.9 / leverage)
      : null;

  return (
    <div className="trade-panel flex min-h-0 flex-col overflow-hidden bg-black/80 lg:min-h-[640px]">
      <div className="flex items-stretch border-b border-white/[0.08]">
        {(
          [
            ["market", "Market"],
            ["limit", "Limit"],
            ["trigger", "Trigger"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`trade-tab trade-tab-pill ${orderType === k ? "is-active" : ""}`}
            onClick={() => setOrderType(k)}
            disabled={k !== "market"}
            title={k !== "market" ? "Coming with private limit book" : undefined}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <div
          className={`trade-side-switch ${isLong ? "is-long" : "is-short"}`}
          role="group"
          aria-label="Position side"
        >
          <span className="trade-side-glow" aria-hidden />
          <button
            type="button"
            className={`trade-side-btn ${isLong ? "is-active" : ""}`}
            aria-pressed={isLong}
            onClick={() => setIsLong(true)}
          >
            Long
          </button>
          <button
            type="button"
            className={`trade-side-btn ${!isLong ? "is-active" : ""}`}
            aria-pressed={!isLong}
            onClick={() => setIsLong(false)}
          >
            Short
          </button>
        </div>

        <div className="space-y-3 text-[11px]">
          <div className="flex items-center justify-between">
            <span className="text-fog">Available</span>
            <span className="tabular-nums text-paper">
              {address ? `${usdwDisplay} USDW` : "—"}
            </span>
          </div>
          <LeverageSlider
            value={leverage}
            min={1}
            max={market.maxLeverage}
            onChange={setLeverage}
          />
        </div>

        <div className="space-y-1">
          <div className="trade-input-wrap">
            <span className="text-[11px] uppercase tracking-wide text-fog">Size</span>
            <input
              className="trade-input text-right"
              value={sizeUsd}
              onChange={(e) => setSizeUsd(e.target.value)}
              inputMode="decimal"
            />
            <span className="text-[11px] text-fog">USDW</span>
          </div>
        </div>

        <PlaceOrderButton
          isConnected={isConnected}
          canSign={canSign}
          needsNetworkSwitch={needsNetworkSwitch}
          busy={busy}
          onOpen={onOpen}
          onSwitchNetwork={ensureNetwork}
        />

        <div className="space-y-1.5 border-t border-white/[0.08] pt-3 text-[11px]">
          <Row
            k="Est. liquidation"
            v={liqApprox ? `$${liqApprox.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "N/A"}
          />
          <Row
            k="Order value"
            v={notional ? `${formatUsdw(notional, 0)} USDW` : "N/A"}
          />
          <Row
            k="Margin required"
            v={marginUsd ? `${formatUsdw(marginUsd)} USDW` : "N/A"}
          />
        </div>

        <div className="trade-metrics-grid">
          {[
            ["Private", "On"],
            ["Leverage", `${leverage}x`],
            ["Market", market.label],
            ["Side", isLong ? "Long" : "Short"],
            ["Proof", "Groth16"],
            ["Margin", `${formatUsdw(marginUsd)} USDW`],
          ].map(([label, value]) => (
            <div key={label} className="trade-metric">
              <span className="text-fog">{value}</span>
              <span className="metric-label">{label}</span>
            </div>
          ))}
        </div>

        <div
          className={`border px-2.5 py-2 text-[11px] leading-snug ${
            status.kind === "err"
              ? "border-short/40 text-short"
              : status.kind === "ok"
                ? "border-long/40 text-long"
                : status.kind === "work"
                  ? "border-warn/40 text-warn"
                  : "border-white/[0.08] text-fog"
          }`}
          style={{ borderRadius: 0 }}
        >
          {status.text}
        </div>
      </div>
    </div>
  );
}

function PlaceOrderButton({
  isConnected,
  canSign,
  needsNetworkSwitch,
  busy,
  onOpen,
  onSwitchNetwork,
}: {
  isConnected: boolean;
  canSign: boolean;
  needsNetworkSwitch: boolean;
  busy: boolean;
  onOpen: () => void | Promise<void>;
  onSwitchNetwork: () => Promise<boolean>;
}) {
  const status = usePrivyStatus();
  if (status !== "ready") {
    return (
      <OrderButton canTrade={false} busy={busy} onClick={onOpen} label="Place order" />
    );
  }
  return (
    <AuthedPlaceOrder
      isConnected={isConnected}
      canSign={canSign}
      needsNetworkSwitch={needsNetworkSwitch}
      busy={busy}
      onOpen={onOpen}
      onSwitchNetwork={onSwitchNetwork}
    />
  );
}

function AuthedPlaceOrder({
  isConnected,
  canSign,
  needsNetworkSwitch,
  busy,
  onOpen,
  onSwitchNetwork,
}: {
  isConnected: boolean;
  canSign: boolean;
  needsNetworkSwitch: boolean;
  busy: boolean;
  onOpen: () => void | Promise<void>;
  onSwitchNetwork: () => Promise<boolean>;
}) {
  const { authenticated } = usePrivy();
  const canTrade = authenticated && isConnected;
  const label = needsNetworkSwitch
    ? "Switch to Robinhood testnet"
    : "Place order";

  const onClick = async () => {
    if (needsNetworkSwitch) {
      const ok = await onSwitchNetwork();
      if (!ok) return;
    }
    await onOpen();
  };

  return (
    <OrderButton
      canTrade={canTrade}
      busy={busy}
      onClick={onClick}
      label={label}
      softDisable={canTrade && !canSign && !needsNetworkSwitch}
    />
  );
}

function OrderButton({
  canTrade,
  busy,
  onClick,
  label,
  softDisable = false,
}: {
  canTrade: boolean;
  busy: boolean;
  onClick: () => void | Promise<void>;
  label: string;
  softDisable?: boolean;
}) {
  return (
    <button
      type="button"
      className="trade-place-btn"
      disabled={!canTrade || busy}
      aria-busy={softDisable || busy}
      onClick={() => void onClick()}
    >
      {busy ? "Shielding & proving…" : label}
    </button>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-fog">{k}</span>
      <span className="tabular-nums text-paper">{v}</span>
    </div>
  );
}
