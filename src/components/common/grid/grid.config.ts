// 📖 Docs: obsidian/frontend/components/common.md

/**
 * Adaptive scaling grid configuration.
 *
 * The grid keeps a rem-based design proportional across viewports by scaling
 * the root (`<html>`) font-size. Each breakpoint maps a viewport `maxWidth` to
 * the design `baseWidth` it was laid out at — at `baseWidth` the root
 * font-size equals `FONT_BASE` and rem values match the design 1:1.
 *
 * - Scaling DOWN (viewport at or below `GRID_BASE_WIDTH`) is driven by the
 *   `vw` media queries in `src/app/globals.css`.
 * - Scaling UP (viewport above `GRID_BASE_WIDTH`) is driven at runtime by the
 *   `AdaptiveGrid` component / `useAdaptiveGrid` hook.
 *
 * Changing these values means updating the `html` media queries in
 * `globals.css` to match — the formula is:
 *   font-size: FONT_BASE * 100 / baseWidth  (vw)
 */

/** Root font-size (px) the design is measured against. */
export const FONT_BASE = 16;

export interface GridBreakpoint {
  /** Media-query `max-width` threshold (px). */
  maxWidth: number;
  /** Design base width (px) the range was laid out at. */
  baseWidth: number;
  /**
   * Root font-size clamp (px) for this range.
   *
   * A range's bottom edge is `FONT_BASE × bottomWidth / baseWidth`, and
   * unclamped the two lower ranges reach sizes their layouts were never drawn
   * for — ten-pixel body copy at the foot of the tablet range, a phone layout
   * at 1.8× at the top of the phone one. Below a floor the layout reflows (the
   * `sm:` / `lg:` variants in `components/common/`) rather than shrinking
   * further; a ceiling stops a range growing past its own design.
   *
   * The phone range takes a ceiling and **no floor** on purpose: under 360px
   * there is no narrower design to switch to, so proportional shrinking is the
   * only right answer. Omit for the ranges that need neither.
   */
  clamp?: { floor?: number; ceiling?: number };
}

/**
 * Breakpoints, largest first. The two lower thresholds are Tailwind's own
 * `lg:` (64rem) and `sm:` (40rem) minus a hair, so a range and the variants
 * that reflow inside it change over at exactly the same width.
 */
export const GRID_BREAKPOINTS: readonly GridBreakpoint[] = [
  { maxWidth: 1920, baseWidth: 1920 },
  { maxWidth: 1440, baseWidth: 1440 },
  { maxWidth: 1023.98, baseWidth: 1024, clamp: { floor: 12 } },
  { maxWidth: 639.98, baseWidth: 360, clamp: { ceiling: 18 } },
];

/** Largest breakpoint width — above it the root font-size scales up. */
export const GRID_BASE_WIDTH = Math.max(
  ...GRID_BREAKPOINTS.map((bp) => bp.maxWidth),
);
