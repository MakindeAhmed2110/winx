import type { ReactNode } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { usePrivyStatus } from "../auth/privy-status";
import { formatUsdw } from "../../lib/format";
import { useLiveMark } from "../../hooks/use-live-mark";
import type { TradeDeskState } from "../../hooks/useTradeDesk";
import { LeverageSlider } from "./LeverageSlider";

const LABEL = "text-[12px] uppercase tracking-[-0.24px] text-white/50";
const VALUE = "text-[12px] uppercase tracking-[-0.24px] text-white";
const NUM = "font-mono tabular-nums";

/** Figma "Order panel" (405:24509). */
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
    positions,
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

  // Net base size held in this market (long minus short), from local notes.
  const base = market.label.split("-")[0];
  let netBase = 0;
  let held = false;
  for (const p of positions) {
    if (p.marketId !== market.id) continue;
    const entry = Number(p.entryPrice) / 1e8;
    if (entry <= 0) continue;
    held = true;
    netBase += ((p.isLong ? 1 : -1) * (Number(p.size) / 1e6)) / entry;
  }

  return (
    <div className="flex h-full min-h-0 flex-col border border-white/[0.07] bg-black/[0.82] px-[18px] py-2.5 backdrop-blur-[41px]">
      <div className="no-scrollbar flex min-h-0 flex-1 flex-col gap-[23px] overflow-y-auto pb-[27px]">
        <div className="flex flex-col gap-9">
          <div className="flex h-[38px] items-stretch">
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
                className={`flex flex-1 items-center justify-center border-b-2 px-5 font-display text-[11px] font-semibold uppercase tracking-[0.88px] text-white transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                  orderType === k ? "border-white bg-white/10" : "border-transparent hover:bg-white/5"
                }`}
                onClick={() => setOrderType(k)}
                disabled={k !== "market"}
                title={k !== "market" ? "Coming with private limit book" : undefined}
              >
                {label}
              </button>
            ))}
          </div>

          <SideSwitch isLong={isLong} onChange={setIsLong} />

          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <Row k="Available" v={address ? `${usdwDisplay} USDW` : "—"} num />
                <Row
                  k="Current position"
                  v={held ? `${netBase.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${base}` : "—"}
                  num
                />
              </div>

              <label className="flex cursor-text items-center justify-between gap-3 border border-white/15 bg-white/5 px-2.5 py-2 transition-colors focus-within:border-white/35">
                <span className="text-[11px] uppercase tracking-[-0.22px] text-white/50">Size</span>
                <span className="flex min-w-0 items-center gap-1.5">
                  <input
                    className={`${NUM} w-full min-w-0 bg-transparent text-right text-[12px] text-white outline-none placeholder:text-white/30`}
                    value={sizeUsd}
                    onChange={(e) => setSizeUsd(e.target.value)}
                    inputMode="decimal"
                    placeholder="0"
                    aria-label="Size in USDW"
                  />
                  <span className={VALUE}>USDW</span>
                </span>
              </label>
            </div>

            <LeverageSlider
              value={leverage}
              min={1}
              max={market.maxLeverage}
              onChange={setLeverage}
            />

            <div className="flex flex-col gap-3">
              <PlaceOrderButton
                isConnected={isConnected}
                canSign={canSign}
                needsNetworkSwitch={needsNetworkSwitch}
                busy={busy}
                onOpen={onOpen}
                onSwitchNetwork={ensureNetwork}
              />
              {status.kind !== "idle" ? (
                <p
                  role="status"
                  className={`border px-2.5 py-2 text-[11px] leading-snug ${
                    status.kind === "err"
                      ? "border-short/40 text-short"
                      : status.kind === "ok"
                        ? "border-long/40 text-long"
                        : "border-warn/40 text-warn"
                  }`}
                >
                  {status.text}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Row
            k="Est. liquidation"
            v={liqApprox ? `$${liqApprox.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "N/A"}
            num
          />
          <Row k="Order value" v={notional ? `${formatUsdw(notional, 0)} USDW` : "N/A"} num />
          <Row k="Margin required" v={marginUsd ? `${formatUsdw(marginUsd)} USDW` : "N/A"} num />
          <Row k="Private" v="On" />
          <Row k="Leverage" v={`${leverage}x`} num />
          <Row k="Market" v={market.label} />
          <Row k="Side" v={isLong ? "Long" : "Short"} />
          <Row k="Proof" v="Groth16" />
        </div>
      </div>
    </div>
  );
}

/** Long / Short toggle with a highlight that slides between the two. */
function SideSwitch({ isLong, onChange }: { isLong: boolean; onChange: (long: boolean) => void }) {
  return (
    <div
      role="group"
      aria-label="Position side"
      className="relative grid grid-cols-2 gap-1 border border-white/5 bg-white/5 px-[5px] py-1"
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-y-1 left-[5px] w-[calc(50%-7px)] border border-white/25 transition-[transform,background-color,box-shadow] duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${
          isLong
            ? "translate-x-0 bg-[rgba(16,237,191,0.24)] shadow-[inset_0_0_4px_0_#10edbf]"
            : "translate-x-[calc(100%+4px)] bg-[rgba(246,61,109,0.24)] shadow-[inset_0_0_4px_0_#f63d6d]"
        }`}
      />
      <SideButton active={isLong} onClick={() => onChange(true)}>
        Long
      </SideButton>
      <SideButton active={!isLong} onClick={() => onChange(false)}>
        Short
      </SideButton>
    </div>
  );
}

function SideButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="relative z-[1] flex h-6 items-center justify-center px-5 font-display text-[11px] font-semibold uppercase tracking-[0.88px] text-white outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/35"
    >
      {children}
    </button>
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
      className="w-full border border-white/40 bg-white px-6 py-2.5 font-display text-[11px] font-semibold uppercase tracking-[0.88px] text-black backdrop-blur-[5.4px] transition-opacity hover:enabled:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
      disabled={!canTrade || busy}
      aria-busy={softDisable || busy}
      onClick={() => void onClick()}
    >
      {busy ? "Shielding & proving…" : label}
    </button>
  );
}

function Row({ k, v, num = false }: { k: string; v: string; num?: boolean }) {
  return (
    <div className="flex h-5 items-center justify-between gap-2">
      <span className={LABEL}>{k}</span>
      <span className={`${VALUE} ${num ? NUM : ""}`}>{v}</span>
    </div>
  );
}
