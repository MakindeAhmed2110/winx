import type { GlowLayer } from "../CardGlow";

/** The Markets Overview card's two Figma glows (card 1368 x 640.66 in Figma). */
export const MARKETS_GLOW: readonly GlowLayer[] = [
  { left: "-97.07%", top: "-21.09%", width: "203.59%", height: "50.9%", rotate: 27.2 },
  { left: "-74.25%", top: "42.78%", width: "143.69%", height: "36.24%", rotate: 28.4 },
];

/** The Heatmap card: the same two glows, the first at 20% instead of 10%. */
export const MARKETS_HEAT_GLOW: readonly GlowLayer[] = [
  { ...MARKETS_GLOW[0]!, opacity: 0.2 },
  MARKETS_GLOW[1]!,
];
