import { useRef, type PointerEvent } from "react";

type Props = {
  value: number;
  min?: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
};

const KNOB = 25;
/** Figma trims text boxes to cap height; this keeps boxes the same size here. */
const TRIM = "[text-box:trim-both_cap_alphabetic]";
/** Overlay of the #ee63fc fill on a #d9d9d9 tick, for ticks under the fill. */
const TICK = "#d9d9d9";
const TICK_UNDER_FILL = "#fad1fe";

/**
 * Figma "Slider" (Type=Leverage, 499:30696), 62px tall: header 9, gap 10,
 * track area 25, gap 10, scale 8. The five ticks are evenly spaced across the
 * track (1x / 10x / 20x / 30x / 40x at 0 / 25 / 50 / 75 / 100%), so values map
 * piecewise between them. Tap the track to jump to the nearest tick; drag the
 * knob to step. A hidden native range input keeps keyboard and screen readers.
 */
export function LeverageSlider({
  value,
  min = 1,
  max,
  step = 1,
  onChange,
}: Props) {
  const marks = [
    min,
    ...[0.25, 0.5, 0.75].map((f) => Math.max(min + step, Math.round(max * f))),
    max,
  ];
  const clamp = (v: number) => Math.min(max, Math.max(min, v));

  /** Value → position along the track (0–1). */
  const posOf = (v: number) => {
    const c = clamp(v);
    for (let i = 0; i < 4; i++) {
      if (c <= marks[i + 1]) {
        const span = marks[i + 1] - marks[i] || 1;
        return (i + (c - marks[i]) / span) / 4;
      }
    }
    return 1;
  };
  /** Position along the track (0–1) → stepped value. */
  const valueAt = (p: number) => {
    const q = Math.min(1, Math.max(0, p)) * 4;
    const seg = Math.min(3, Math.floor(q));
    const raw = marks[seg] + (q - seg) * (marks[seg + 1] - marks[seg]);
    return clamp(Math.round(raw / step) * step);
  };
  /** Centre of a 1px tick at position p, matching Figma's tick layout. */
  const at = (p: number) => `calc((100% - 1px) * ${p} + 0.5px)`;

  const areaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragging = useRef(false);

  const posAt = (clientX: number) => {
    const r = areaRef.current?.getBoundingClientRect();
    if (!r || r.width <= 1) return 0;
    return (clientX - r.left - 0.5) / (r.width - 1);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const r = areaRef.current?.getBoundingClientRect();
    if (!r) return;
    e.preventDefault();
    inputRef.current?.focus({ preventScroll: true });
    const knobX = r.left + (r.width - 1) * posOf(value) + 0.5;
    if (Math.abs(e.clientX - knobX) <= KNOB / 2) {
      dragging.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    } else {
      // Figma tap zones: jump to the nearest tick.
      onChange(marks[Math.round(Math.min(1, Math.max(0, posAt(e.clientX))) * 4)]);
    }
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) onChange(valueAt(posAt(e.clientX)));
  };
  const endDrag = () => {
    dragging.current = false;
  };

  const p = posOf(value);
  const label = `text-[11px] uppercase leading-none tracking-[-0.22px] text-white/50 ${TRIM}`;

  return (
    <div className="flex w-full flex-col gap-2.5">
      {/* `leverage-slider-head` is hidden inside the mobile order sheet. */}
      <div className="leverage-slider-head flex h-[9px] items-center justify-between text-[12px] uppercase tracking-[-0.24px]">
        <span className={`text-white/50 ${TRIM}`}>Leverage</span>
        <span className={`font-mono tabular-nums text-white ${TRIM}`}>{value}x</span>
      </div>

      <div
        ref={areaRef}
        className="group relative h-[25px] cursor-pointer touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="absolute inset-x-0 top-[9px] h-1 overflow-hidden bg-[rgba(217,217,217,0.2)]">
          {/* Figma Fill: #ee63fc with Overlay blend over the track. Element blend
              modes can't reach through the order panel's backdrop blur (it
              isolates its contents), so the overlay is done here with
              background-blend-mode over an opaque copy of the track as it looks
              on the panel (gray 20% over near-black = #2c2c2c). The result is
              Figma's overlay color, about rgb(82, 34, 87). */}
          <div
            className="absolute inset-y-0 left-0 bg-[#2c2c2c] bg-[linear-gradient(#ee63fc,#ee63fc)] bg-blend-overlay"
            style={{ width: at(p) }}
          />
          {/* Ticks are clipped to the 4px track, as in Figma. */}
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              aria-hidden
              className="absolute inset-y-0 w-px"
              style={{
                left: `calc((100% - 1px) * ${i / 4})`,
                backgroundColor: i / 4 <= p ? TICK_UNDER_FILL : TICK,
              }}
            />
          ))}
          {/* Track stroke, drawn above the fill as in Figma. */}
          <div className="pointer-events-none absolute inset-0 border border-white/10" />
        </div>
        <img
          src="/icons/slider-knob.svg"
          alt=""
          aria-hidden
          width={KNOB}
          height={KNOB}
          className="pointer-events-none absolute top-[-2px] z-[2] -translate-x-1/2 rounded-full group-has-[input:focus-visible]:shadow-[0_0_0_3px_rgba(255,255,255,0.35)]"
          style={{ left: at(p) }}
        />
        <input
          ref={inputRef}
          type="range"
          className="sr-only"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label="Leverage"
          aria-valuetext={`${value}x`}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>

      <div aria-hidden className="relative h-2">
        {marks.map((m, i) =>
          i === 0 ? (
            <span key={m} className={`absolute top-0 left-0 ${label}`}>{m}x</span>
          ) : i === marks.length - 1 ? (
            <span key={m} className={`absolute top-0 right-0 ${label}`}>{m}x</span>
          ) : (
            <span
              key={m}
              className={`absolute top-0 -translate-x-1/2 ${label}`}
              style={{ left: at(i / 4) }}
            >
              {m}x
            </span>
          ),
        )}
      </div>
    </div>
  );
}
