"use client";

// 📖 Docs: obsidian/frontend/hooks.md

import { useEffect, type RefObject } from "react";

import { subscribeToTicker } from "@/lib/animation/ticker";

/** Two digits, always — a readout that changes width is a readout that jitters. */
const pad = (value: number, size = 2): string =>
  Math.floor(value).toString().padStart(size, "0");

/**
 * Frames per second, written straight into an element.
 *
 * **Not React state.** These numbers change every frame; routing them through a
 * re-render would cost the whole tree once a frame to repaint six characters.
 * The hook writes `textContent` on a ref instead, which is the same bargain the
 * scene's blackout overlay strikes.
 *
 * Counted over a one-second window rather than from the last frame's delta: a
 * per-frame figure flickers between 58 and 61 and reads as instability that is
 * not there.
 *
 * @param ref - the element whose text is the readout.
 * @param suffix - drawn after the number; ` fps` in the design.
 */
export const useFpsReadout = (
  ref: RefObject<HTMLElement | null>,
  suffix = " fps",
): void => {
  useEffect(() => {
    let frames = 0;
    let since = performance.now();

    return subscribeToTicker((time) => {
      frames += 1;
      const elapsed = time - since;
      if (elapsed < 1000) return;

      const node = ref.current;
      if (node) node.textContent = `${Math.round((frames * 1000) / elapsed)}${suffix}`;
      frames = 0;
      since = time;
    }, () => 0);
  }, [ref, suffix]);
};

/**
 * How long this visit has lasted, as `[ mm : ss : cc ]`.
 *
 * Hundredths, not milliseconds: three digits at 60 Hz is a blur no one can read,
 * and two is the pace a stopwatch runs at. Throttled to 30 Hz for the same
 * reason — the last digit is already moving faster than the eye resolves.
 */
export const useElapsedReadout = (ref: RefObject<HTMLElement | null>): void => {
  useEffect(() => {
    const start = performance.now();

    return subscribeToTicker(
      (time) => {
        const node = ref.current;
        if (!node) return;

        const total = time - start;
        const minutes = total / 60000;
        const seconds = (total % 60000) / 1000;
        const hundredths = (total % 1000) / 10;

        node.textContent = `[ ${pad(minutes)} : ${pad(seconds)} : ${pad(hundredths)} ]`;
      },
      () => 1000 / 30,
    );
  }, [ref]);
};
