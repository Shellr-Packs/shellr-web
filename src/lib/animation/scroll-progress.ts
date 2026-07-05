/**
 * @fileoverview How far down the page we are, `0`–`1`, read once per frame.
 *
 * Three things need this every frame — the scene, the panel stack and the hero's
 * copy — and each of them used to work it out for itself. That meant three reads
 * of `document.documentElement.scrollHeight` per frame, and **`scrollHeight` is a
 * layout read**: interleaved with the style writes those same subscribers make,
 * it forces the browser to re-run layout mid-frame, several times over
 * (`optimize-3d-scene` §9).
 *
 * So the height is cached and only re-measured when the window resizes or the
 * document actually grows. `window.scrollY` is free to read and stays live.
 *
 * 📖 Docs: obsidian/frontend/animation-system.md
 */

let scrollable = 0;
let measured = false;

const measure = (): void => {
  scrollable = Math.max(
    document.documentElement.scrollHeight - window.innerHeight,
    0,
  );
  measured = true;
};

/** Re-measure on the next read — call after anything that changes the page's height. */
export const invalidateScrollHeight = (): void => {
  measured = false;
};

if (typeof window !== "undefined") {
  window.addEventListener("resize", invalidateScrollHeight, { passive: true });
  // The page's height settles after fonts, images and the scene's own layout;
  // a `ResizeObserver` on the document is the cheap way to hear about it
  // without polling.
  const observer = new ResizeObserver(invalidateScrollHeight);
  observer.observe(document.documentElement);
}

/**
 * Scroll progress, `0`–`1`.
 *
 * Safe to call several times in one frame — the expensive half is cached, and
 * the rest is one property read.
 */
export const scrollProgress = (): number => {
  if (!measured) measure();
  return scrollable > 0 ? window.scrollY / scrollable : 0;
};

/** Low-pass retention per 60Hz frame — `optimize-3d-scene` §10's 0.2–0.3 band. */
const SMOOTHING = 0.2;
/** Past this a jump is an anchor or a reload, not a scroll: assign, don't crawl. */
const SNAP = 0.2;

let smoothed = -1;
let last = 0;

/**
 * The same number, **low-passed once for the whole page**.
 *
 * Scroll arrives in steps — coarse ones on a wheel, coarser on touch — and
 * anything derived from it inherits those steps as jitter. The scene has always
 * eased its own copy; the panels, the hero and the pixel wave read it raw, and
 * that difference is exactly where the scroll felt like it was catching. One
 * filter upstream means everything downstream moves together.
 *
 * Frame-rate independent (`1 - (1 - k)^(dt·60)`), so a capped tier eases at the
 * same rate in *time* rather than per frame, and it snaps rather than crawls
 * across a jump.
 */
export const smoothScrollProgress = (now: number): number => {
  const raw = scrollProgress();
  if (smoothed < 0) {
    smoothed = raw;
    last = now;
    return raw;
  }

  const delta = Math.min(Math.max((now - last) / 1000, 0), 0.05);
  last = now;
  if (Math.abs(raw - smoothed) > SNAP) {
    smoothed = raw;
    return raw;
  }

  smoothed += (raw - smoothed) * (1 - Math.pow(1 - SMOOTHING, delta * 60));
  return smoothed;
};
