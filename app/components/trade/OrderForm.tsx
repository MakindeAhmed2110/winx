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

/**
 * Figma "Trade side button" variants (296:56428), colors as RGB triplets.
 * Gradient alphas are the Figma stop alpha (0.71) times the paint opacity.
 */
const SIDE = {
  long: { rgb: "16,237,191", glow: "#416161" },
  short: { rgb: "246,61,109", glow: "#614149" },
} as const;
type Side = keyof typeof SIDE;

const edgeGlow = (rgb: string, a: number) =>
  `radial-gradient(58.68% 100% at 50% 100%, rgba(${rgb},${a}) 0%, rgba(${rgb},0) 100%)`;

/** State=Default: fill 24%, radial 19%, stroke white 25%, inner shadow 4px. */
const activeLayer = (rgb: string) => ({
  backgroundColor: `rgba(${rgb},0.24)`,
  backgroundImage: edgeGlow(rgb, 0.135),
  boxShadow: `inset 0 0 4px 0 rgb(${rgb})`,
  border: "1px solid rgba(255,255,255,0.25)",
});
/** State=Inactive hover: fill 24%, radial 40.5%, stroke 12.5%, shadow at 50%. */
const hoverLayer = (rgb: string) => ({
  backgroundColor: `rgba(${rgb},0.24)`,
  backgroundImage: edgeGlow(rgb, 0.2876),
  boxShadow: `inset 0 0 4px 0 rgba(${rgb},0.5)`,
  border: "1px solid rgba(255,255,255,0.125)",
});
/** State=Hover (selected side hovered): fill 48%, radial 81%, stroke 25%, inner shadow 4px. */
const overLayer = (rgb: string) => ({
  backgroundColor: `rgba(${rgb},0.48)`,
  backgroundImage: edgeGlow(rgb, 0.575),
  boxShadow: `inset 0 0 4px 0 rgb(${rgb})`,
  border: "1px solid rgba(255,255,255,0.25)",
});
/** State=Pressed: fill 30%, radial 81% with the stops reversed (bright edges). */
const pressedLayer = (rgb: string) => ({
  backgroundColor: `rgba(${rgb},0.3)`,
  backgroundImage: `radial-gradient(63.86% 308.8% at 50% 50%, rgba(${rgb},0) 0%, rgba(${rgb},0.575) 100%)`,
  boxShadow: `inset 0 0 4px 0 rgb(${rgb})`,
  border: "1px solid rgba(255,255,255,0.25)",
});

/**
 * Figma "Position tab" (305:10975). Interactions, mirrored 1:1:
 * - Click the inactive side: it lights instantly; the old side stays lit,
 *   then fades to Inactive over 300ms ease-out (Switching → Settled).
 * - Hover the inactive side: dissolves to Inactive hover in 100ms ease-out.
 * - Hover the selected side: dissolves to the Hover variant in 100ms ease-out.
 * - While pressing: instant swap to the Pressed variant.
 * Each state is its own layer and only opacity animates.
 */
function SideSwitch({ isLong, onChange }: { isLong: boolean; onChange: (long: boolean) => void }) {
  const side: Side = isLong ? "long" : "short";
  return (
    <div
      role="group"
      aria-label="Position side"
      className="relative isolate grid grid-cols-2 gap-1 overflow-hidden border border-white/5 bg-white/5 px-[5px] py-1"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute top-[-3px] left-1/2 h-[38px] w-9 -translate-x-1/2 rounded-[300px] opacity-40 blur-[38.75px]"
        style={{ backgroundColor: SIDE[side].glow }}
      />
      <SideButton side="long" active={isLong} onClick={() => onChange(true)}>
        Long
      </SideButton>
      <SideButton side="short" active={!isLong} onClick={() => onChange(false)}>
        Short
      </SideButton>
    </div>
  );
}

function SideButton({
  side,
  active,
  onClick,
  children,
}: {
  side: Side;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const { rgb, glow } = SIDE[side];
  // Figma "Ease out" is the CSS standard curve, not Tailwind's ease-out.
  const layer =
    "pointer-events-none absolute inset-0 ease-[cubic-bezier(0,0,0.58,1)] motion-reduce:transition-none";
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="group relative isolate flex h-6 items-center justify-center overflow-hidden px-5 outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/35"
    >
      {/* Resting states. Pressed is a separate variant in Figma, so this whole
          stack hides instantly while pressing instead of sitting under it. */}
      <span aria-hidden className="pointer-events-none absolute inset-0 group-active:opacity-0">
        {/* Inactive: 1% tint + background blur; fades in with the 300ms settle. */}
        <span
          className={`${layer} backdrop-blur-[5.4px] transition-opacity ${
            active ? "opacity-0 duration-0" : "opacity-100 duration-300"
          }`}
          style={{ backgroundColor: `rgba(${rgb},0.01)` }}
        />
        <span
          className={`${layer} transition-opacity ${
            active ? "opacity-0 duration-0" : "opacity-0 duration-100 group-hover:opacity-100"
          }`}
          style={hoverLayer(rgb)}
        />
        <span
          className={`${layer} transition-opacity ${
            active ? "opacity-100 duration-0" : "opacity-0 duration-300"
          }`}
          style={activeLayer(rgb)}
        />
        {/* Hover on the selected side; same 100ms dissolve as the inactive hover. */}
        <span
          className={`${layer} transition-opacity ${
            active ? "opacity-0 duration-100 group-hover:opacity-100" : "opacity-0 duration-0"
          }`}
          style={overLayer(rgb)}
        />
      </span>
      <span aria-hidden className={`${layer} opacity-0 group-active:opacity-100`} style={pressedLayer(rgb)} />
      {/* Glow blob (36x38, 27px down, layer blur 77.5). Default and Inactive keep
          the text on top ("first on top"); Hover, Inactive hover and Pressed
          draw the blob over the text, which dims it slightly. */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-[27px] left-1/2 z-[1] h-[38px] w-9 -translate-x-1/2 rounded-[300px] blur-[38.75px] group-hover:z-[3] group-active:z-[3]"
        style={{ backgroundColor: glow }}
      />
      <span className="relative z-[2] font-display text-[11px] font-semibold uppercase tracking-[0.88px] text-white">
        {children}
      </span>
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
