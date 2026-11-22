type Props = {
  value: number;
  min?: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
};

export function LeverageSlider({
  value,
  min = 1,
  max,
  step = 1,
  onChange,
}: Props) {
  const span = Math.max(max - min, step);
  const pct = Math.min(100, Math.max(0, ((value - min) / span) * 100));
  const marks = [0, 25, 50, 75, 100];

  const setFromPct = (p: number) => {
    const raw = min + (p / 100) * span;
    const stepped = Math.round(raw / step) * step;
    onChange(Math.min(max, Math.max(min, stepped)));
  };

  return (
    <div className="leverage-slider">
      <div className="leverage-slider-head">
        <div className="leverage-slider-labels">
          <span className="leverage-slider-title">Leverage</span>
          <span className="leverage-slider-max">Max {max}x</span>
        </div>
        <span className="leverage-slider-value tabular-nums">{value}x</span>
      </div>

      <div className="leverage-slider-body">
        <div className="leverage-slider-rail">
          <div className="leverage-slider-dot-grid" aria-hidden />
          <input
            type="range"
            className="leverage-slider-input"
            min={min}
            max={max}
            step={step}
            value={value}
            aria-label="Leverage"
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={value}
            aria-valuetext={`${value}x`}
            onChange={(e) => onChange(Number(e.target.value))}
          />
          <div
            className="leverage-slider-thumb"
            aria-hidden
            style={{ left: `calc(${pct}% - 10px)` }}
          >
            <span />
            <span />
            <span />
          </div>
        </div>

        <div className="leverage-slider-marks">
          {marks.map((m) => {
            const markValue = Math.round(min + (m / 100) * span);
            const active = Math.abs(pct - m) < 1;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setFromPct(m)}
                className={active ? "is-active" : undefined}
              >
                {markValue}x
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
