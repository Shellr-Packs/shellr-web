"use client";

// 📖 Docs: obsidian/frontend/components/common.md

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { ScatterText } from "@/components/common/text/scatter-text";
import { usePackSheet } from "@/lib/packs/sheet";
import { smoothScrollProgress } from "@/lib/animation/scroll-progress";
import { subscribeToTicker } from "@/lib/animation/ticker";
import { isIntroDone, onIntroDone } from "@/lib/page/intro";

export interface HeroCta {
  label: string;
  /** Where it goes — **absent while nothing is there to go to**; see `<Cta>`. */
  href?: string;
  /** A sheet it opens instead of a page it goes to. Wins over `href`. */
  opens?: "pons-pack";
}

export interface HeroCopyProps {
  /** The page's `h1` — one string; the 535px measure is what breaks it in two. */
  headline: string;
  intro: string;
  primary: HeroCta;
  secondary: HeroCta;
}

const BUTTON =
  "paint-over grid h-[2.5rem] place-items-center rounded-md px-4 text-[0.875rem] leading-[1.2] font-semibold whitespace-nowrap transition-colors duration-[var(--duration-fast)] ease-entrance sm:h-[2.6875rem] sm:text-[1rem]";

/**
 * A call to action that is **only a link when it has somewhere to go.**
 *
 * `/contact` and `/work` were in this file before any route existed for them,
 * which is a 404 with a button on it. Without an `href` the same shape renders
 * as a `<span>`: no tab stop, no pointer, and **no hover colour** — the hover is
 * the promise, and keeping it on something that does not answer a click is the
 * part that reads as broken. Fill the `href` in `data/mocks/home.ts` and it is a
 * link again, with its hover back, on its own.
 */
const Cta = ({
  cta,
  shape,
  hover,
  onOpen,
}: {
  cta: HeroCta;
  shape: string;
  hover: string;
  onOpen: () => void;
}) => {
  if (cta.opens) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className={`${shape} ${hover} pointer-events-auto`}
      >
        {cta.label}
      </button>
    );
  }
  return cta.href ? (
    <Link href={cta.href} className={`${shape} ${hover} pointer-events-auto`}>
      {cta.label}
    </Link>
  ) : (
    <span className={shape}>{cta.label}</span>
  );
};

/** Share of the page's scroll the copy fades over — the first of the flight. */
const LEAVE: [number, number] = [0.012, 0.075];
/** How far out of focus it goes on the way out, in pixels. */
const BLUR = 16;

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);

/**
 * The first screen's words: the headline high in the frame, and a bottom-anchored
 * column of cross, intro and buttons.
 *
 * Straight from the Figma frame (node `1097:251`): headline **Big Shoulders
 * Inline 72/1.0** in `#dbfffe` on a **535px** measure — one string, wrapped by
 * that measure rather than hand-broken — held **97px** down: the nav pill ends
 * at 57 (16 + 41) and the brief is a **40px** gap under it. Measured from the
 * top rather than from the centre, so that gap is the same on any window height
 * — the nav is `fixed` to the top, and a centre-anchored headline drifts away
 * from it. Under it, 32×32 crosshair, 16px, the intro at **Chakra Petch Regular
 * 16/1.2** on a **411px** measure, 31.6px, then the buttons 12px apart, the
 * group sitting **50px** off the bottom.
 *
 * **It does not travel.** It used to be absolute inside the tall section, so the
 * scroll carried it up and out of frame — which reads as the words being pulled
 * off the page while the room behind them holds still. It is `fixed` now and
 * **stays where it is**: the bottom column goes out on blur and opacity over the
 * first of the flight, and the headline — which arrived on nothing but its
 * letters — leaves on nothing but its letters too.
 *
 * The fade is written **straight to the element** off the shared ticker, the
 * same bargain the panels and the readouts strike; the only thing React is told
 * is whether the headline should be resolved or scattered, which is a boolean
 * that flips once.
 *
 * **Narrow, the two measures become margins.** The 535px headline and the 411px
 * intro are what break the copy into its lines on the design's window; on a
 * phone they are wider than the window itself, and a centred block wider than
 * its frame runs off *both* edges at once. Under `sm` each one is the window
 * less a gutter, so the same copy breaks into more lines instead of into the
 * bezel. The column also stands further off the foot than the design's 50px:
 * the frame's date and clock are down there, and at a phone's root size the
 * buttons were landing on them.
 */
export const HeroCopy = ({
  headline,
  intro,
  primary,
  secondary,
}: HeroCopyProps) => {
  const root = useRef<HTMLDivElement>(null);
  const column = useRef<HTMLDivElement>(null);
  // **Scattered until the curtain is up.** The headline used to resolve while
  // the preloader was still covering it, so by the time the page could be seen
  // its one animation had already been spent.
  const [held, setHeld] = useState(isIntroDone);
  const [started, setStarted] = useState(isIntroDone);
  // Opening a pack is page state, not hero state: the same sheet is opened
  // from the carousel further down. See `lib/packs/sheet.ts`.
  const openSheet = usePackSheet((state) => state.open);

  useEffect(() => onIntroDone(() => setStarted(true)), []);

  useEffect(() => {
    let previous = Number.NaN;

    return subscribeToTicker(
      (time) => {
        const node = root.current;
        if (!node) return;

        const progress = smoothScrollProgress(time);
        // Linear, like everything else the scroll drives: an eased fade holds
        // the words at full strength for the first third of the window and then
        // drops them, which reads as the page changing its mind.
        const gone = clamp01((progress - LEAVE[0]) / (LEAVE[1] - LEAVE[0]));
        if (gone === previous) return;
        previous = gone;

        // **The blur and the fade are the column's, not the headline's.** They
        // used to sit on the root, which put them over the `h1` as well — so the
        // heading arrived on nothing but its letters and left on its letters
        // *plus* a blur the entrance never had. Scrolled back up it looked like
        // two different animations, because it was. The headline's only exit is
        // now the scatter, which is already the entrance inverted (the letter
        // that resolved first is the last to go).
        const box = column.current;
        if (box) {
          box.style.opacity = `${1 - gone}`;
          box.style.filter = gone > 0.001 ? `blur(${gone * BLUR}px)` : "";
        }
        node.style.visibility = gone < 0.999 ? "visible" : "hidden";
        // The letters have their own springs and only need to be told which way
        // to go; the crossing point is early, so they are already scattering
        // while the block is still mostly there.
        const wanted = started && gone < 0.25;
        setHeld((was) => (was === wanted ? was : wanted));
      },
      () => 0,
    );
  }, [started]);

  return (
    <div
      ref={root}
      className="pointer-events-none fixed inset-x-0 top-0 z-10 h-lvh font-sans"
    >
      <ScatterText
        tag="h1"
        active={held}
        className="absolute top-[5.25rem] left-1/2 w-[calc(100%-3.5rem)] -translate-x-1/2 text-center font-display text-[2rem] leading-none text-nav-accent uppercase sm:top-[6.0625rem] sm:w-[33.4375rem] sm:text-[3rem] lg:text-[4.5rem]"
      >
        {headline}
      </ScatterText>

      <div
        ref={column}
        className="absolute inset-x-0 bottom-[4.5rem] flex flex-col items-center sm:bottom-[3.125rem]"
      >
        {/* Two hairlines crossing - the design's mark over the description. */}
        <svg
          viewBox="0 0 32 32"
          aria-hidden="true"
          className="mb-3 size-6 text-hud-text sm:mb-4 sm:size-8"
        >
          <path
            d="M16.5 0V32M32 16.5H0"
            stroke="currentColor"
            strokeWidth="1"
          />
        </svg>

        <p className="mb-6 w-[calc(100%-3rem)] text-center text-[0.875rem] leading-[1.35] text-hud-text sm:mb-[1.975rem] sm:w-[25.6875rem] sm:text-[1rem] sm:leading-[1.2]">
          {intro}
        </p>

        {/* `pointer-events-auto` sits on each link rather than on the row: a
            row that takes the pointer over a `<span>` with nothing behind it
            takes the scene's hover with it for no reason. */}
        <div className="flex gap-2 sm:gap-3">
          <Cta
            cta={primary}
            shape={`${BUTTON} bg-nav-accent text-nav-accent-ink`}
            hover="hover:bg-nav-text"
            onOpen={() => openSheet({ kind: "pons" })}
          />
          <Cta
            cta={secondary}
            shape={`${BUTTON} border border-nav-accent text-nav-accent sm:w-[8.9375rem]`}
            hover="hover:bg-nav-accent hover:text-nav-accent-ink"
            onOpen={() => openSheet({ kind: "pons" })}
          />
        </div>
      </div>
    </div>
  );
};
