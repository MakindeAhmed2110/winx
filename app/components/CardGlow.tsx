/**
 * Figma card glows: radial fills (lavender to purple 30% to clear) at 10%
 * opacity. Figma draws them as rotated ellipses, which a CSS radial gradient
 * can't do, so each is a rotated layer clipped to the card. Positions and
 * sizes are fractions of the card, so the glows scale with it the way Figma's
 * gradient transforms do. The parent needs `position: relative`.
 */
export type GlowLayer = {
  left: string;
  top: string;
  width: string;
  height: string;
  /** Degrees. */
  rotate: number;
  /** The fill's opacity in Figma; most card glows are 10%. */
  opacity?: number;
};

const GLOW =
  "radial-gradient(closest-side, rgba(184,188,249,1) 0%, rgba(177,95,248,0.3) 46.2%, rgba(0,0,0,0) 100%)";

export function CardGlow({
  layers,
  className = "",
}: {
  layers: readonly GlowLayer[];
  /** Placement and stacking, e.g. "-z-10" behind content. Desktop only by default. */
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-px hidden overflow-hidden lg:block ${className}`}
    >
      {layers.map((layer, i) => (
        <span
          key={i}
          className="absolute"
          style={{
            left: layer.left,
            top: layer.top,
            width: layer.width,
            height: layer.height,
            opacity: layer.opacity ?? 0.1,
            transform: `rotate(${layer.rotate}deg)`,
            backgroundImage: GLOW,
          }}
        />
      ))}
    </div>
  );
}
