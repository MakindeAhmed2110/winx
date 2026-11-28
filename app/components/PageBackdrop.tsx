/**
 * Figma page decorations: raster glows behind the content of the 1728 x 1117
 * desktop frames (normal blend, full opacity, transparent PNGs from the file).
 *
 * - corner: "image 267", 324.5 x 198.5 at the top-left (all three pages).
 * - streak: "image 266", 1934.7 x 1824.7, mostly above the top edge. Placed
 *   relative to the page centre so it keeps its spot against the centred
 *   content: Markets at x 466.1 / y -873.5, Portfolio at x 361 / y -876.3.
 * - bottom: "image 265", 691 x 346 at the bottom-right (Perps).
 *
 * Desktop only. The parent needs `position: relative` and `isolation:
 * isolate` (the layer sits at z -10 behind everything) and should clip
 * overflow.
 */
const STREAK = {
  markets: { left: 466.1, top: -873.5 },
  portfolio: { left: 361, top: -876.3 },
} as const;

export function PageBackdrop({
  streak,
  bottom = false,
}: {
  streak?: keyof typeof STREAK;
  bottom?: boolean;
}) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 hidden overflow-hidden lg:block"
    >
      <img
        src="/backgrounds/corner-glow.png"
        alt=""
        className="absolute top-0 left-0 max-w-none"
        style={{ width: 324.5, height: 198.5 }}
      />
      {streak ? (
        <img
          src="/backgrounds/streak.png"
          alt=""
          className="absolute max-w-none"
          style={{
            left: `calc(50% + ${STREAK[streak].left - 864}px)`,
            top: STREAK[streak].top,
            width: 1934.7,
            height: 1824.7,
          }}
        />
      ) : null}
      {bottom ? (
        <img
          src="/backgrounds/bottom-glow.png"
          alt=""
          className="absolute max-w-none"
          style={{ right: -240.1, bottom: -0.3, width: 691, height: 346 }}
        />
      ) : null}
    </div>
  );
}
