"use client";

// 📖 Docs: obsidian/frontend/components/common.md

import { useRef } from "react";

import { useElapsedReadout, useFpsReadout } from "@/hooks/use-readout";

export interface SceneHudProps {
  /** `[ dd / mm / yy ]`, rendered on the server so the first paint has it. */
  date: string;
  /** Shown top-right; the design's tally light. */
  recordingLabel: string;
}

/**
 * One corner bracket — 32×32, drawn exactly as the design's vector.
 *
 * `M32 0 V22 C… 22 32 H0`: down the right edge, a 10px arc, then out along the
 * bottom. The four corners are that one path flipped, which is how Figma builds
 * them too. **2px and solid white** against the rules' 1px at half strength —
 * the contrast is the point, and drawing the frame as one rounded rectangle
 * (which is what the first pass did) throws it away.
 */
const Corner = ({ className }: { className: string }) => (
  <svg
    viewBox="0 0 33 33"
    fill="none"
    aria-hidden="true"
    className={`absolute size-6 text-hud-corner sm:size-8 ${className}`}
  >
    <path
      d="M32 0V22C32 27.5228 27.5228 32 22 32H0"
      stroke="currentColor"
      strokeWidth="2"
    />
  </svg>
);

/**
 * The window's chrome: a hairline frame with bracketed corners, and four
 * readouts.
 *
 * Every number is the Figma frame's (node `1097:251`): rules inset **16px** that
 * stop **48px** short of each corner, **32×32** brackets filling those gaps, and
 * the readouts **32px** in — Chakra Petch Regular **16px**, white. In `rem`, so
 * the whole thing rides the adaptive grid: at the 1440 base `1rem` is the
 * design's 16px. See [[design-system]].
 *
 * `fixed`, not part of the scroll: it is the window's frame, not the hero's, and
 * it stays over every act of the scene. `pointer-events-none` throughout —
 * nothing here is clickable, and a full-screen overlay that swallowed the
 * pointer would take the scene's hover with it.
 *
 * **On a phone the frame tightens and the top row loses its two readouts.** The
 * 16/48/32 rhythm is a share of a 1440px window; kept at a phone's root size it
 * is a two-centimetre border on a five-centimetre screen. And the top row has
 * the nav pill down its middle: at 390px the pill is 240 of them, which leaves
 * the corners about 70px each — not enough for `60 fps` and `REC`, which is
 * exactly why they were rendering over the pill's blur. The date and the clock
 * keep the bottom row to themselves and stay.
 */
export const SceneHud = ({ date, recordingLabel }: SceneHudProps) => {
  const fps = useRef<HTMLSpanElement>(null);
  const elapsed = useRef<HTMLSpanElement>(null);

  useFpsReadout(fps);
  useElapsedReadout(elapsed);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-30 font-sans text-[0.8125rem] leading-[1.2] text-hud-text sm:text-[1rem]"
    >
      {/* Four rules rather than a box: each stops short of the corners, and the
          brackets take over from there. The three numbers move together - the
          inset, the gap the brackets fill, and the brackets' own size. */}
      <span className="absolute top-9 bottom-9 left-3 w-px bg-hud-rule sm:top-12 sm:bottom-12 sm:left-4" />
      <span className="absolute top-9 right-3 bottom-9 w-px bg-hud-rule sm:top-12 sm:right-4 sm:bottom-12" />
      <span className="absolute top-3 right-9 left-9 h-px bg-hud-rule sm:top-4 sm:right-12 sm:left-12" />
      <span className="absolute right-9 bottom-3 left-9 h-px bg-hud-rule sm:right-12 sm:bottom-4 sm:left-12" />

      <Corner className="top-3 left-3 rotate-180 sm:top-4 sm:left-4" />
      <Corner className="top-3 right-3 -scale-y-100 sm:top-4 sm:right-4" />
      <Corner className="bottom-3 left-3 -scale-x-100 sm:bottom-4 sm:left-4" />
      <Corner className="right-3 bottom-3 sm:right-4 sm:bottom-4" />

      <span
        ref={fps}
        className="absolute top-8 left-8 hidden tabular-nums sm:block"
      >
        60 fps
      </span>
      <span className="absolute top-8 right-8 hidden sm:block">
        {recordingLabel}
      </span>
      <span className="absolute bottom-6 left-6 tabular-nums sm:bottom-8 sm:left-8">
        {date}
      </span>
      <span
        ref={elapsed}
        className="absolute right-6 bottom-6 tabular-nums sm:right-8 sm:bottom-8"
      >
        [ 00 : 00 : 00 ]
      </span>
    </div>
  );
};
