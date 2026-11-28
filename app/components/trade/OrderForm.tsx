import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { usePrivy } from "@privy-io/react-auth";
import { usePrivyStatus } from "../auth/privy-status";
import { formatUsdw } from "../../lib/format";
import { useLiveMark } from "../../hooks/use-live-mark";
import type { TradeDeskState } from "../../hooks/useTradeDesk";
import { LeverageSlider } from "./LeverageSlider";

/** Figma trims text boxes to cap height; this keeps boxes the same size here. */
const TRIM = "[text-box:trim-both_cap_alphabetic]";
const T12 = `text-[12px] uppercase tracking-[-0.24px] ${TRIM}`;
const T11 = `text-[11px] uppercase tracking-[-0.22px] ${TRIM}`;
const NUM = "font-mono tabular-nums";
/** Figma "Ease out" preset, as used by every transition in this panel. */
const FIGMA_EASE_OUT = "cubic-bezier(0,0,0.58,1)";
/** Figma strokes sit inside the box and take no layout space (inset shadows, not borders). */
const STROKE_5 = "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]";
const STROKE_7 = "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]";
const STROKE_15 = "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)]";

type OrderType = TradeDeskState["orderType"];
const TABS: readonly (readonly [OrderType, string])[] = [
  ["market", "Market"],
  ["limit", "Limit"],
  ["trigger", "Trigger"],
];

/**
 * Figma "Order panel" (298:10702), 407 x 1004. Variants: Type = Market /
 * Limit / Trigger and TPSL = Off / On, switched with a 200ms Smart Animate.
 * The trading hook only places market orders today, so Limit, Trigger, TP/SL
 * and Reduce only show their Figma layout but keep Place order disabled
 * ("Coming soon"), as the mobile order sheet does.
 */
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

  // UI-only fields for the Figma variants the trading hook can't place yet.
  const [reduceOnly, setReduceOnly] = useState(false);
  const [tpsl, setTpsl] = useState(false);
  const [limitPx, setLimitPx] = useState("");
  const [triggerPx, setTriggerPx] = useState("");
  const [tpPrice, setTpPrice] = useState("");
  const [tpGain, setTpGain] = useState("");
  const [slPrice, setSlPrice] = useState("");
  const [slLoss, setSlLoss] = useState("");
  const soon = orderType !== "market" || tpsl || reduceOnly;
  const pxText = px
    ? px.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : "0";

  // Smart Animate between variants: moved blocks slide, new ones fade in.
  const flipRoot = useRef<HTMLDivElement>(null);
  const flip = useFlip(flipRoot);
  useLayoutEffect(() => flip.play(), [orderType, tpsl]); // eslint-disable-line react-hooks/exhaustive-deps
  const switchType = (k: OrderType) => {
    if (k === orderType) return;
    flip.capture();
    setOrderType(k);
  };
  const toggleTpsl = () => {
    flip.capture();
    setTpsl((v) => !v);
  };

  return (
    <div
      className={`relative flex h-full min-h-0 flex-col bg-black/[0.82] py-2.5 backdrop-blur-[40.95px] ${STROKE_7}`}
    >
      {/* Order type tabs stay fixed above the scrolling form. z-[1] keeps
          the selected tab's outside stroke above content scrolling under it. */}
      <div className="relative z-[1] mx-[10px] mb-[10px] flex h-[38px] shrink-0">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={orderType === k}
            onClick={() => switchType(k)}
            className="group relative flex flex-1 items-center justify-center px-5 outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/35"
          >
            {/* Selected tab: 10% fill and a 2px stroke outside the bottom edge.
                Hovering an unselected tab shows the fill at half opacity,
                with no stroke. */}
            <span
              aria-hidden
              className={`pointer-events-none absolute inset-0 bg-white/10 transition-opacity duration-200 ease-[cubic-bezier(0,0,0.58,1)] motion-reduce:transition-none ${
                orderType === k ? "opacity-100" : "opacity-0 group-hover:opacity-50"
              }`}
            />
            {/* Stroke animates like the positions panel tabs (.trade-tab in
                app.css): grows from the centre and fades in over 0.3s using
                the shared `trade-tab-in` keyframes; gone at once on deselect. */}
            {orderType === k ? (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 -bottom-0.5 h-0.5 origin-center animate-[trade-tab-in_0.3s_ease] bg-white motion-reduce:animate-none"
              />
            ) : null}
            <span
              className={`relative font-display text-[11px] font-semibold uppercase tracking-[0.88px] text-white ${TRIM}`}
            >
              {label}
            </span>
          </button>
        ))}
      </div>

      <div
        ref={flipRoot}
        // Side padding sits inside the scroller: a vertical scroller also clips
        // sideways, and the slider knob overhangs the content edge at max.
        className="no-scrollbar relative flex min-h-0 flex-1 flex-col gap-[23px] overflow-y-auto px-[10px] pt-9 pb-[27px]"
      >
        <div className="flex flex-col gap-9">
          <SideSwitch isLong={isLong} onChange={setIsLong} />

          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <Row k="Available" v={address ? `${usdwDisplay} USDW` : "—"} num caret />
                <Row
                  k="Current position"
                  v={held ? `${netBase.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${base}` : "—"}
                  num
                />
                {orderType === "trigger" ? (
                  <div data-flip="trigger-by">
                    <Row k="Trigger by" v="Mark price" caret />
                  </div>
                ) : null}
              </div>
              {orderType === "limit" ? (
                <Field
                  key="limit"
                  flip="limit-price"
                  label="Limit price"
                  value={limitPx}
                  onChange={setLimitPx}
                  placeholder={pxText}
                  unit="USD"
                  icon="arrows"
                />
              ) : null}
              {orderType === "trigger" ? (
                <Field
                  key="trigger"
                  flip="trigger-price"
                  label="Trigger price"
                  value={triggerPx}
                  onChange={setTriggerPx}
                  placeholder={pxText}
                  unit="USD"
                  icon="arrows"
                />
              ) : null}
              <Field
                flip="size"
                label="Size"
                value={sizeUsd}
                onChange={setSizeUsd}
                placeholder="0"
                unit="USDW"
                icon="arrows"
                ariaLabel="Size in USDW"
              />
            </div>

            <div data-flip="slider">
              <LeverageSlider
                value={leverage}
                min={1}
                max={market.maxLeverage}
                onChange={setLeverage}
              />
            </div>

            <div className="flex flex-col gap-6">
              <div data-flip="tp-row" className="flex h-4 items-center justify-between">
                <div className="flex items-center gap-[23px]">
                  <CheckButton checked={reduceOnly} onToggle={() => setReduceOnly((v) => !v)}>
                    Reduce only
                  </CheckButton>
                  <CheckButton checked={tpsl} onToggle={toggleTpsl}>
                    TP/SL
                  </CheckButton>
                </div>
                <span className="flex items-center gap-1">
                  <span className={`${T11} text-white`}>Isolated</span>
                  <Icon name="arrows" size={16} />
                </span>
              </div>
              {tpsl ? (
                <div data-flip="tp-fields" className="flex flex-col gap-2.5">
                  <div className="grid grid-cols-2 gap-2.5">
                    <Field label="TP price" value={tpPrice} onChange={setTpPrice} />
                    <Field label="Gain" value={tpGain} onChange={setTpGain} unit="%" icon="caret" />
                  </div>
                  <div aria-hidden className="relative h-0">
                    <span className="absolute inset-x-0 top-[-0.5px] h-px bg-white/10" />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <Field label="SL price" value={slPrice} onChange={setSlPrice} />
                    <Field label="Loss" value={slLoss} onChange={setSlLoss} unit="%" icon="caret" />
                  </div>
                </div>
              ) : null}
            </div>

            <div data-flip="place">
              <PlaceOrderButton
                isConnected={isConnected}
                canSign={canSign}
                needsNetworkSwitch={needsNetworkSwitch}
                busy={busy}
                soon={soon}
                onOpen={onOpen}
                onSwitchNetwork={ensureNetwork}
              />
            </div>
          </div>

          <div data-flip="summary" className="flex flex-col gap-2">
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

        {/* Not in Figma: proof progress and errors, kept below the Figma layout
            so nothing above it moves. */}
        {status.kind !== "idle" ? (
          <p
            role="status"
            data-flip="status"
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
  );
}

/**
 * Smart Animate for variant switches (FLIP, transform and opacity only).
 * Call `capture` right before the state change and `play` after the DOM
 * updates. Blocks tagged `data-flip` that moved slide from their old spot;
 * blocks that are new fade in. Removed blocks disappear at once.
 */
function useFlip(root: RefObject<HTMLElement | null>) {
  const before = useRef<Map<string, number> | null>(null);
  const measure = () => {
    const r = root.current;
    if (!r) return null;
    const top = r.getBoundingClientRect().top;
    const map = new Map<string, number>();
    r.querySelectorAll<HTMLElement>("[data-flip]").forEach((el) => {
      map.set(el.dataset.flip ?? "", el.getBoundingClientRect().top - top);
    });
    return map;
  };
  return {
    capture() {
      before.current = measure();
    },
    play() {
      const prev = before.current;
      before.current = null;
      const r = root.current;
      if (!prev || !r) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const top = r.getBoundingClientRect().top;
      const timing = { duration: 200, easing: FIGMA_EASE_OUT };
      r.querySelectorAll<HTMLElement>("[data-flip]").forEach((el) => {
        const y = el.getBoundingClientRect().top - top;
        const old = prev.get(el.dataset.flip ?? "");
        if (old === undefined) {
          el.animate([{ opacity: 0 }, { opacity: 1 }], timing);
        } else if (Math.abs(old - y) > 0.5) {
          el.animate([{ transform: `translateY(${old - y}px)` }, { transform: "none" }], timing);
        }
      });
    },
  };
}

/** Figma input box: 32px tall, 10px side padding, 15% inside stroke. */
function Field({
  label,
  value,
  onChange,
  placeholder,
  unit,
  icon,
  flip,
  ariaLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  unit?: string;
  icon?: "arrows" | "caret";
  flip?: string;
  ariaLabel?: string;
}) {
  return (
    <label
      data-flip={flip}
      className={`flex h-8 min-w-0 shrink-0 cursor-text items-center justify-between gap-2.5 bg-white/5 px-2.5 ${STROKE_15} focus-within:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)]`}
    >
      <span className={`shrink-0 ${T11} text-white/50`}>{label}</span>
      <span className="flex h-4 min-w-0 flex-1 items-center justify-end gap-1.5">
        <input
          className={`${NUM} h-4 w-full min-w-0 bg-transparent text-right text-[11px] leading-4 text-white/50 outline-none placeholder:text-white/50`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          placeholder={placeholder}
          aria-label={ariaLabel ?? label}
        />
        {unit ? (
          <span className="flex shrink-0 items-center gap-1">
            <span className={`${T12} text-white`}>{unit}</span>
            {icon ? <Icon name={icon} size={16} /> : null}
          </span>
        ) : null}
      </span>
    </label>
  );
}

/** Figma "Box" checkbox: 16px at 10% white. Pressed shows a 10px square at 50%, checked a 6px white square. */
function CheckButton({
  checked,
  onToggle,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className="group flex items-center gap-[13px] outline-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-white/35"
    >
      <span aria-hidden className="relative size-4 shrink-0 bg-white/10">
        <span
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white group-active:size-2.5 group-active:opacity-50 ${
            checked ? "size-1.5 opacity-100" : "size-px opacity-0"
          }`}
        />
      </span>
      <span className={`${T12} text-white`}>{children}</span>
    </button>
  );
}

function Icon({ name, size }: { name: "arrows" | "caret"; size: 16 | 20 }) {
  const src =
    name === "arrows"
      ? "/icons/arrows-left-right-16.svg"
      : size === 20
        ? "/icons/caret-down-20.svg"
        : "/icons/caret-down-16.svg";
  return <img src={src} alt="" aria-hidden width={size} height={size} className="shrink-0" />;
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
/**
 * State=Hover (selected side hovered) is fill 48% + radial 81%, with the same
 * stroke and shadow as Default. This layer is drawn over Default, so it holds
 * only the difference: alphas solved so Default + this = Hover at every point
 * of the gradient (all layers share one color, so this is exact). The 1px
 * transparent border keeps it off Default's white stroke. Because it adds to
 * Default instead of replacing it, hover can fade over 100ms while selecting
 * a side stays instant.
 */
const overLayer = (rgb: string) => ({
  border: "1px solid transparent",
  backgroundClip: "padding-box",
  backgroundOrigin: "border-box",
  backgroundImage: `radial-gradient(58.68% 100% at 50% 100%, ${[
    [0.6639, 0],
    [0.6146, 12.5],
    [0.5671, 25],
    [0.5214, 37.5],
    [0.4773, 50],
    [0.4348, 62.5],
    [0.3937, 75],
    [0.3541, 87.5],
    [0.3158, 100],
  ]
    .map(([a, at]) => `rgba(${rgb},${a}) ${at}%`)
    .join(", ")})`,
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
      className={`relative isolate grid h-8 grid-cols-2 gap-1 overflow-hidden bg-white/5 px-[5px] py-1 ${STROKE_5}`}
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
        {/* Hover on the selected side (Default + this = Figma Hover); same 100ms
            dissolve as the inactive hover. */}
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
      <span
        className={`relative z-[2] font-display text-[11px] font-semibold uppercase tracking-[0.88px] text-white ${TRIM}`}
      >
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
  soon,
  onOpen,
  onSwitchNetwork,
}: {
  isConnected: boolean;
  canSign: boolean;
  needsNetworkSwitch: boolean;
  busy: boolean;
  soon: boolean;
  onOpen: () => void | Promise<void>;
  onSwitchNetwork: () => Promise<boolean>;
}) {
  const status = usePrivyStatus();
  if (status !== "ready") {
    return (
      <OrderButton canTrade={false} busy={busy} soon={soon} onClick={onOpen} label="Place order" />
    );
  }
  return (
    <AuthedPlaceOrder
      isConnected={isConnected}
      canSign={canSign}
      needsNetworkSwitch={needsNetworkSwitch}
      busy={busy}
      soon={soon}
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
  soon,
  onOpen,
  onSwitchNetwork,
}: {
  isConnected: boolean;
  canSign: boolean;
  needsNetworkSwitch: boolean;
  busy: boolean;
  soon: boolean;
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
      soon={soon}
      onClick={onClick}
      label={label}
      softDisable={canTrade && !canSign && !needsNetworkSwitch}
    />
  );
}

/** Figma "Primary button" stroke: 1px inside, white 40% → 100% top to bottom, at 27%. */
const PRIMARY_STROKE: CSSProperties = {
  border: "1px solid transparent",
  background: "linear-gradient(rgba(255,255,255,0.108), rgba(255,255,255,0.27)) border-box",
  WebkitMask: "linear-gradient(#000 0 0) padding-box, linear-gradient(#000 0 0)",
  WebkitMaskComposite: "xor",
  mask: "linear-gradient(#000 0 0) padding-box, linear-gradient(#000 0 0)",
  maskComposite: "exclude",
};

/**
 * Figma "Primary button" (Size=Default, Color=White): 28px tall, 24px side
 * padding, background blur 5.4. Hover fades the fill to 80% and press to 60%,
 * each with a 200ms Smart Animate (ease out); only the fill's opacity animates.
 */
function OrderButton({
  canTrade,
  busy,
  soon = false,
  onClick,
  label,
  softDisable = false,
}: {
  canTrade: boolean;
  busy: boolean;
  soon?: boolean;
  onClick: () => void | Promise<void>;
  label: string;
  softDisable?: boolean;
}) {
  return (
    <button
      type="button"
      className="group relative flex h-7 w-full items-center justify-center px-6 backdrop-blur-[5.4px] disabled:cursor-not-allowed disabled:opacity-45"
      disabled={!canTrade || busy || soon}
      aria-busy={softDisable || busy}
      onClick={() => void onClick()}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-white transition-opacity duration-200 ease-[cubic-bezier(0,0,0.58,1)] motion-reduce:transition-none group-enabled:group-hover:opacity-80 group-enabled:group-active:opacity-60"
      />
      <span aria-hidden className="pointer-events-none absolute inset-0" style={PRIMARY_STROKE} />
      <span
        className={`relative font-display text-[11px] font-semibold uppercase tracking-[0.88px] text-black ${TRIM}`}
      >
        {busy ? "Shielding & proving…" : soon ? "Coming soon" : label}
      </span>
    </button>
  );
}

/** Figma info row: 20px tall; the label (and its caret) sit at 50% opacity. */
function Row({
  k,
  v,
  num = false,
  caret = false,
}: {
  k: string;
  v: string;
  num?: boolean;
  caret?: boolean;
}) {
  return (
    <div className="flex h-5 items-center justify-between gap-3">
      <span className="flex items-center gap-1.5 opacity-50">
        <span className={`${T12} text-white`}>{k}</span>
        {caret ? <Icon name="caret" size={20} /> : null}
      </span>
      <span className={`${T12} text-white ${num ? NUM : ""}`}>{v}</span>
    </div>
  );
}
