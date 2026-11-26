type Props = {
  value: number;
  min?: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
};

/** Knob is 25px; its centre travels between 12.5px and (100% - 12.5px). */
const KNOB = 25;
const at = (p: number) => `calc(${KNOB / 2}px + (100% - ${KNOB}px) * ${p})`;

/**
 * Figma "Slider" (Type=Leverage): thin track with ticks, magenta fill,
 * ring knob, tick labels below. Tap a label to jump to it, drag to step.
 */
export function LeverageSlider({
  value,
  min = 1,
  max,
  step = 1,
  onChange,
}: Props) {
  const span = Math.max(max - min, step);
  const frac = (v: number) => Math.min(1, Math.max(0, (v - min) / span));
  const marks = [
    min,
    ...[0.25, 0.5, 0.75].map((f) => Math.max(min + step, Math.round(max * f))),
    max,
  ];

  return (
    <div className="flex w-full flex-col gap-2.5">
      {/* `leverage-slider-head` is hidden inside the mobile order sheet. */}
      <div className="leverage-slider-head flex items-center justify-between text-[12px] uppercase tracking-[-0.24px]">
        <span className="text-white/50">Leverage</span>
        <span className="font-mono tabular-nums text-white">{value}x</span>
      </div>

      <div className="group relative h-[25px]">
        <div className="absolute inset-x-0 top-[calc(50%-1.5px)] h-1 -translate-y-1/2 overflow-hidden bg-[rgba(217,217,217,0.2)]">
          {/* Figma Fill: #ee63fc with Overlay blend over the track. Element blend
              modes can't reach through the order panel's backdrop blur (it
              isolates its contents), so the overlay is done here with
              background-blend-mode over an opaque copy of the track as it looks
              on the panel (gray 20% over near-black = #2c2c2c). The result is
              Figma's overlay color, about rgb(82, 34, 87). */}
          <div
            className="absolute inset-y-0 left-0 bg-[#2c2c2c] bg-[linear-gradient(#ee63fc,#ee63fc)] bg-blend-overlay"
            style={{ width: at(frac(value)) }}
          />
          {/* Track stroke, drawn above the fill as in Figma. */}
          <div className="pointer-events-none absolute inset-0 border border-white/10" />
        </div>
        {marks.map((m) => (
          <span
            key={m}
            aria-hidden
            className="absolute top-[calc(50%-1.5px)] h-1.5 w-px -translate-y-1/2 bg-[#d9d9d9]"
            style={{ left: at(frac(m)) }}
          />
        ))}
        <img
          src="/icons/slider-knob.svg"
          alt=""
          aria-hidden
          width={KNOB}
          height={KNOB}
          className="pointer-events-none absolute top-[-2px] z-[2] -translate-x-1/2 rounded-full group-has-[input:focus-visible]:shadow-[0_0_0_3px_rgba(255,255,255,0.35)]"
          style={{ left: at(frac(value)) }}
        />
        <input
          type="range"
          className="absolute inset-0 z-[3] m-0 h-full w-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed [&::-moz-range-thumb]:size-[25px] [&::-webkit-slider-thumb]:size-[25px] [&::-webkit-slider-thumb]:appearance-none"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label="Leverage"
          aria-valuetext={`${value}x`}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>

      <div className="relative h-3">
        {marks.map((m, i) => {
          const edge = i === 0 ? "left-0" : i === marks.length - 1 ? "right-0" : "-translate-x-1/2";
          return (
            <button
              key={m}
              type="button"
              onClick={() => onChange(m)}
              className={`absolute top-0 text-[11px] uppercase leading-none tracking-[-0.22px] transition-colors hover:text-white ${edge} ${
                m === value ? "text-white" : "text-white/50"
              }`}
              style={i === 0 || i === marks.length - 1 ? undefined : { left: at(frac(m)) }}
            >
              {m}x
            </button>
          );
        })}
      </div>
    </div>
  );
}
