/**
 * @fileoverview Device tiering for the WebGL scene.
 *
 * One module decides what "mobile" means and what each tier is allowed to
 * spend, so DPR, frame budget and pointer interactivity can never drift apart.
 * Read once at construction — a device does not change tier mid-session.
 *
 * 📖 Docs: obsidian/frontend/scene-3d.md
 */

/**
 * Phones and tablets — judged by the **pointer**, not by width alone.
 *
 * `optimize-3d-scene` §2 gives the rule as `innerWidth < 768 || coarse pointer`,
 * and width alone is wrong here: a desktop browser in a narrow window, or the
 * preview pane inside an editor, is not a phone. It was being handed the phone
 * tier — no depth of field, half the bloom, a 30 fps cap — which reads as the
 * scene being broken in one window and fine in another. A narrow viewport only
 * counts as mobile when the pointer is not a mouse.
 */
export const isMobile = (): boolean =>
  window.matchMedia("(hover: none) and (pointer: coarse)").matches ||
  (window.innerWidth < 768 && !hasFinePointer());

/** A real cursor — the precondition for any pointer-driven effect. */
export const hasFinePointer = (): boolean =>
  window.matchMedia("(hover: hover) and (pointer: fine)").matches;

/** An accessibility promise, honoured on every tier. */
export const prefersReducedMotion = (): boolean =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Minimum gap between rendered frames (ms), passed to the shared ticker.
 * `0` means "every tick"; the mobile budget halves the fill cost where it hurts.
 */
export const frameBudget = (): number => (isMobile() ? 1000 / 30 : 0);

/**
 * Most fragments the scene will draw per frame, whatever the window.
 *
 * The frame goes through bloom (five mip levels), a **41-tap** bokeh, grain and
 * the CRT glass, so its cost is close to linear in pixels with a large constant.
 * A 2560×1440 window at 1.5× is 8.3M pixels — three times the design size — and
 * that is what a report of *"the site is smooth but the videos stutter"* looks
 * like from the inside: the render loop lands at 30fps and every video texture
 * with it. Capped here, a wide window renders at a lower ratio instead, which is
 * invisible under grain and defocus and halves the work.
 */
const MAX_FRAGMENTS = 3_200_000;

/**
 * Device pixel ratio, clamped per tier — a 3× screen renders 9× the fragments
 * of a 1× one for no perceptible gain — and again by the fragment budget.
 *
 * @param size - the drawing buffer's CSS size; omit before the canvas is laid
 *   out, and the tier clamp applies on its own.
 */
export const clampedPixelRatio = (
  [min, max]: [number, number],
  size?: { width: number; height: number },
): number => {
  const tier = Math.min(Math.max(window.devicePixelRatio, min), isMobile() ? 1 : max);
  const area = (size?.width ?? 0) * (size?.height ?? 0);
  if (area <= 0) return tier;
  // `min` still wins: below one device pixel per CSS pixel the text in the
  // scene's own textures starts to break up, which is worse than the frame rate.
  return Math.max(min, Math.min(tier, Math.sqrt(MAX_FRAGMENTS / area)));
};
