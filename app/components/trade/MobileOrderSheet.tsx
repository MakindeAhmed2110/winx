import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useCmcQuote } from "../../hooks/useCmcQuote";
import { useLiveMark } from "../../hooks/use-live-mark";
import { useRhQuote } from "../../hooks/useRhQuote";
import { formatUsd, formatUsdw } from "../../lib/format";
import type { TradeDeskState } from "../../hooks/useTradeDesk";
import { LeverageSlider } from "./LeverageSlider";

type Step = "ticket" | "review" | "filled";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"] as const;

export function MobileOrderSheet({
  desk,
  onClose,
}: {
  desk: TradeDeskState;
  onClose: () => void;
}) {
  const {
    isLong,
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
    success,
    dismissSuccess,
    address,
  } = desk;

  const live = useLiveMark(market.extendedMarket);
  const cmc = useCmcQuote(market.extendedMarket ? undefined : market.cmcId || undefined);
  const rh = useRhQuote(market.extendedMarket ? "" : market.rh);
  const px = live ?? rh.price ?? markUsd ?? cmc.price;
  const [step, setStep] = useState<Step>("ticket");
  const [keypad, setKeypad] = useState(false);
  const [reduceOnly, setReduceOnly] = useState(false);
  const [tpsl, setTpsl] = useState(false);
  const [swipePx, setSwipePx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const swipeRef = useRef(0);
  const drag = useRef<{ x: number; start: number } | null>(null);

  const moveSwipe = (px: number) => {
    swipeRef.current = px;
    setSwipePx(px);
  };

  const travel = () => {
    const track = trackRef.current;
    if (!track) return 240;
    const pad = Number.parseFloat(getComputedStyle(track).paddingLeft) + Number.parseFloat(getComputedStyle(track).paddingRight);
    return Math.max(track.clientWidth - pad - 36, 0);
  };

  const margin = Number(sizeUsd) || 0;
  const notional = margin * leverage;
  const liq =
    px && margin > 0
      ? isLong
        ? px * (1 - 0.9 / leverage)
        : px * (1 + 0.9 / leverage)
      : null;
  const side = isLong ? "Long" : "Short";
  const amountLabel = formatAmount(sizeUsd);

  useEffect(() => {
    if (success?.kind === "open") setStep("filled");
  }, [success]);

  const back = () => {
    if (step === "review") {
      setStep("ticket");
      moveSwipe(0);
      return;
    }
    if (keypad) {
      setKeypad(false);
      return;
    }
    onClose();
  };

  const typeKey = (key: (typeof KEYS)[number]) => {
    setSizeUsd((prev) => {
      const current = prev || "";
      if (key === "back") {
        const next = current.slice(0, -1);
        return next === "" ? "0" : next;
      }
      if (key === ".") {
        if (current.includes(".")) return current;
        return current === "" ? "0." : `${current}.`;
      }
      if (current === "0") return key;
      const next = `${current}${key}`;
      const [, frac] = next.split(".");
      if (frac && frac.length > 2) return current;
      if (next.replace(".", "").length > 9) return current;
      return next;
    });
  };

  const finishSwipe = async () => {
    if (confirming || busy) return;
    setConfirming(true);
    moveSwipe(travel());
    try {
      await onOpen();
    } finally {
      setConfirming(false);
      if (!success) moveSwipe(0);
    }
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (confirming || busy || orderType !== "market") return;
    drag.current = { x: event.clientX, start: swipeRef.current };
    setDragging(true);
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* capture is optional; window listeners follow the pointer */
    }
  };

  useEffect(() => {
    if (!dragging) return;
    const move = (event: PointerEvent) => {
      if (!drag.current) return;
      const dx = event.clientX - drag.current.x;
      moveSwipe(Math.min(travel(), Math.max(0, drag.current.start + dx)));
    };
    const up = (event: PointerEvent) => {
      if (drag.current) {
        const dx = event.clientX - drag.current.x;
        moveSwipe(Math.min(travel(), Math.max(0, drag.current.start + dx)));
      }
      drag.current = null;
      setDragging(false);
      if (swipeRef.current > travel() * 0.75) {
        void finishSwipe();
        return;
      }
      moveSwipe(0);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [dragging, confirming, busy, orderType]);

  return (
    <div className={`mobile-order-sheet ${keypad ? "is-keypad" : ""} ${step === "review" ? "is-review" : ""} ${step === "filled" ? "is-filled" : ""}`}>
      <button type="button" className="mobile-order-backdrop" aria-label="Close order" onClick={onClose} />
      <div className="mobile-order-panel is-flow" role="dialog" aria-modal="true">
        <button type="button" className="sheet-back" aria-label="Back" onClick={back}>
          <CaretLeft />
        </button>
        {step === "ticket" && (
          <div className="sheet-body">
            <div className="sheet-ticket-scroll">
            <div className="sheet-types">
              {(
                [
                  ["market", "Market"],
                  ["limit", "Limit"],
                  ["trigger", "Trigger"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={orderType === id ? "is-active" : ""}
                  onClick={() => setOrderType(id)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="sheet-title">
              <div className="sheet-pair">
                <span>
                  {side} {market.label}
                </span>
                <span className="sheet-q" title="Private perpetual">
                  ?
                </span>
              </div>
              <p>Mark {px ? formatUsd(px, market.priceDecimals === 0 ? 2 : market.priceDecimals) : "—"}</p>
            </div>

            <button type="button" className="sheet-amount" onClick={() => setKeypad((open) => !open)}>
              <span>{amountLabel}</span>
              <span className="sheet-swap" aria-hidden>
                <Arrows />
              </span>
            </button>

            <div className="sheet-leverage">
              {market.tradable ? (
                <LeverageSlider value={leverage} min={1} max={market.maxLeverage} onChange={setLeverage} />
              ) : (
                <p className="sheet-soon">Price market. BTC and ETH are the pairs you can trade.</p>
              )}
            </div>

            <div className="sheet-rows">
              {market.tradable ? (
                <div>
                  <span>Leverage</span>
                  <b>Isolated {leverage}x</b>
                </div>
              ) : null}
              <div>
                <span>
                  Est. margin required <i>?</i>
                </span>
                <b>{margin ? `${formatUsdw(margin)} USDW` : "—"}</b>
              </div>
              <div>
                <span>
                  Margin available <i>?</i>
                </span>
                <b className="is-dim">{address ? `${usdwDisplay} USDW` : "—"}</b>
              </div>
            </div>

            <div className="sheet-rule" />

            <div className="sheet-flags">
              <button type="button" onClick={() => setReduceOnly((v) => !v)}>
                <i className={reduceOnly ? "is-on" : ""} />
                Reduce only
              </button>
              <button type="button" onClick={() => setTpsl((v) => !v)}>
                <i className={tpsl ? "is-on" : ""} />
                TP/SL
              </button>
              <span className="sheet-isolated">
                Isolated <ArrowsH />
              </span>
            </div>
            {tpsl || reduceOnly ? <p className="sheet-soon">Coming soon</p> : null}
            </div>

            <button
              type="button"
              className="sheet-review"
              disabled={!market.tradable || orderType !== "market" || margin <= 0}
              onClick={() => {
                setKeypad(false);
                setStep("review");
              }}
            >
              {!market.tradable ? "Price only" : orderType === "market" ? "Review" : "Coming soon"}
            </button>

            {keypad ? (
              <div className="sheet-keypad">
                {KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-label={key === "back" ? "Delete" : undefined}
                    onClick={() => typeKey(key)}
                  >
                    {key === "back" ? <Backspace /> : key}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {step === "review" && (
          <div className="sheet-body sheet-review-body">
            <div className="sheet-review-scroll">
            <div className="sheet-review-title">
              <h2>
                {side} {market.label}
              </h2>
              <p>{leverage}x Isolated</p>
            </div>
            <div className="sheet-rows">
              <div>
                <span>Est. order size</span>
                <b>{notional ? `$${formatUsdw(notional, 0)}` : "—"}</b>
              </div>
              <div>
                <span>
                  Est. liquidation price <i>?</i>
                </span>
                <b className="is-dim">
                  {liq ? `$${liq.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}
                </b>
              </div>
            </div>
            <div className="sheet-rule" />
            <div className="sheet-rows">
              <div>
                <span>Mark price</span>
                <b>{px ? formatUsd(px, 2) : "—"}</b>
              </div>
            </div>
            <div className="sheet-rule" />
            <div className="sheet-rows">
              <div>
                <span>
                  Est. margin required <i>?</i>
                </span>
                <b>{margin ? `${formatUsdw(margin)} USDW` : "—"}</b>
              </div>
            </div>
            <div className="sheet-rule" />
            <div className="sheet-rows">
              <div>
                <span>Est. open fee</span>
                <b>$0.00</b>
              </div>
            </div>
            <div className="sheet-rule" />
            <div className="sheet-rows">
              <div>
                <span>
                  Max slippage <i>?</i>
                </span>
                <b className="is-link">1%</b>
              </div>
            </div>
            <p className="sheet-note">
              You&apos;re opening a {side.toLowerCase()} {market.label} position with {formatUsdw(margin)} USDW
              margin at {leverage}x. It settles against the live mark.
            </p>
            {status.kind === "err" ? <p className="sheet-error">{status.text}</p> : null}
            </div>
            <div
              className={`sheet-swipe ${confirming || busy ? "is-busy" : ""} ${dragging ? "is-dragging" : ""}`}
              ref={trackRef}
            >
              <button
                type="button"
                className="sheet-swipe-handle"
                style={{ width: confirming || busy ? "100%" : `${36 + swipePx}px` }}
                aria-label="Swipe to confirm"
                onPointerDown={onPointerDown}
              >
                <span className="sheet-swipe-knob">{confirming || busy ? <Spinner /> : <DoubleCaret />}</span>
              </button>
              <span className="sheet-swipe-label">{confirming || busy ? "Confirming" : "Swipe to confirm"}</span>
            </div>
          </div>
        )}

        {step === "filled" && (
          <div className="sheet-filled">
            <div className="sheet-filled-copy">
              <CheckMark />
              <h2>
                Order has been
                <br />
                filled
              </h2>
              <p>
                {side} {market.label}
              </p>
            </div>
            <button
              type="button"
              className="sheet-review"
              onClick={() => {
                dismissSuccess();
                onClose();
              }}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function formatAmount(raw: string) {
  if (!raw || raw === "0") return "$0.00";
  const [whole, frac] = raw.split(".");
  const grouped = Number(whole || "0").toLocaleString();
  if (raw.endsWith(".")) return `$${grouped}.`;
  if (frac != null) return `$${grouped}.${frac}`;
  return `$${grouped}.00`;
}

function CaretLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path d="M10.5 3.5L6 8l4.5 4.5" fill="none" stroke="white" strokeWidth="1.4" />
    </svg>
  );
}

function Arrows() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path d="M8 2.5v11M5.5 5L8 2.5 10.5 5M10.5 11L8 13.5 5.5 11" fill="none" stroke="white" strokeWidth="1.2" />
    </svg>
  );
}

function ArrowsH() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path d="M2.5 8h11M5 5.5L2.5 8 5 10.5M11 5.5L13.5 8 11 10.5" fill="none" stroke="white" strokeWidth="1.2" />
    </svg>
  );
}

function Backspace() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M8.2 6.5h10.3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H8.2L3.5 12l4.7-5.5Z"
        fill="none"
        stroke="white"
        strokeWidth="1.4"
      />
      <path d="M11 10l4 4M15 10l-4 4" stroke="white" strokeWidth="1.4" />
    </svg>
  );
}

function DoubleCaret() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path d="M4 4l4 4-4 4M8.5 4l4 4-4 4" fill="none" stroke="black" strokeWidth="1.4" />
    </svg>
  );
}

function Spinner() {
  return <span className="sheet-spinner" aria-hidden />;
}

function CheckMark() {
  return (
    <svg className="sheet-check" viewBox="0 0 120 120" aria-hidden>
      <circle cx="60" cy="60" r="46" fill="none" stroke="white" strokeWidth="3" />
      <path d="M38 62l14 14 30-32" fill="none" stroke="white" strokeWidth="3" />
    </svg>
  );
}
