"use client";

// 📖 Docs: obsidian/frontend/components/common.md

import Link from "next/link";

import { Spring } from "@/components/animation/springs/spring";
import { ScatterText } from "@/components/common/text/scatter-text";
import type { HomeCase } from "@/data/mocks/home";

export interface CasePanelProps {
  /** Shown only while the ring is assembled and the finale has not started. */
  visible: boolean;
  /** Accessible name for the pair of controls. */
  label: string;
  heading: string;
  previous: string;
  next: string;
  explore: string;
  /**
   * Opening the pack the ring is showing. Given, *Unbox* is a button; without
   * it the control falls back to the link-or-plain-box it was.
   */
  onExplore?: (name: string) => void;
  /** The works, in the ring's order. */
  items: HomeCase[];
  /** Which one the scene has turned to the front. */
  index: number;
  /** `-1` brings the previous work to the front, `1` the next. */
  onTurn: (step: number) => void;
}

/** Shared by every button in the section — the design gives them one shape. */
const BUTTON =
  "grid h-[2.5rem] place-items-center rounded-md px-4 text-[0.875rem] leading-[1.2] font-semibold whitespace-nowrap transition-colors duration-[var(--duration-fast)] ease-entrance sm:h-[2.6875rem] sm:text-[1rem]";

/**
 * Where *Previous* and *Next* stand.
 *
 * The design flanks the front set with them, 240px in from each edge on the
 * vertical centre. That reading only holds while the window is wide enough for
 * the set to leave room at its sides: at 390px, 240px in from each edge is past
 * the middle, so the two **crossed over** — *Next* on the left of *Previous*,
 * both of them over the picture. Under `lg` they come down instead and sit as a
 * pair just above the work's name, which is the only band of the frame the
 * television never fills. One node each either way: a second pair for small
 * windows would be a second pair of tab stops.
 */
const TURN =
  "pointer-events-auto absolute bottom-[13.75rem] border border-nav-accent text-nav-accent hover:bg-nav-accent hover:text-nav-accent-ink lg:top-1/2 lg:bottom-auto lg:-translate-y-1/2";

/**
 * The *Explore* pair — the word and the arrow beside it.
 *
 * Its own component only so the face is written once whether or not it is
 * wrapped in a link; `hover` is what the wrapper's `group` drives, and is left
 * off when there is no wrapper to drive it.
 */
const ExploreFace = ({
  explore,
  hover = false,
  muted = false,
}: {
  explore: string;
  hover?: boolean;
  /** Not for sale: grey, and never a control. */
  muted?: boolean;
}) => (
  <span
    className={
      muted
        ? `${BUTTON} border border-white/12 bg-white/[0.06] text-nav-text/40`
        : `${BUTTON} paint-over bg-nav-accent text-nav-accent-ink ${
            hover ? "group-hover:bg-nav-text" : ""
          }`
    }
  >
    {explore}
  </span>
);

/**
 * The carousel section's words and controls.
 *
 * Straight from the Figma frame (node `1441:247`): the heading **Big Shoulders
 * Inline 72/1.0** at the same 97px the hero's sits at, *Previous* and *Next*
 * held **240px** in from each edge on the vertical centre, and a bottom-anchored
 * column of case name (**Inline 32**), three tags 32px apart, and the *Explore*
 * pair — all of it 50px off the bottom, the same footing the hero's column has.
 *
 * DOM, not geometry: these are controls, and controls belong to the page — real
 * `<button>`s and `<a>`s that take focus and answer to a keyboard, over a canvas
 * that is `aria-hidden` and cannot. They are siblings of the canvas container
 * for the same reason.
 *
 * They are also why the scroll's flight ends well before the scroll does: a
 * button is only worth pressing while the camera is holding still on the ring,
 * and the scene reports that window as `visible`.
 */
export const CasePanel = ({
  visible,
  label,
  heading,
  previous,
  next,
  explore,
  onExplore,
  items,
  index,
  onTurn,
}: CasePanelProps) => {
  const current = items[index] ?? items[0];
  const tab = visible ? 0 : -1;

  return (
    <Spring
      tag="section"
      aria-label={label}
      // Faded out it is still laid over the first screen, and an invisible link
      // that still takes a click would eat the hero's buttons — they sit in the
      // same place. Hidden from the a11y tree for the same reason.
      aria-hidden={!visible}
      enabled={visible}
      from={{ opacity: 0, transform: "translate3d(0, 1rem, 0)" }}
      to={{ opacity: 1, transform: "translate3d(0, 0rem, 0)" }}
      mode="always"
      className="pointer-events-none absolute inset-0 z-10 font-sans"
    >
      <ScatterText
        tag="h2"
        active={visible}
        className="absolute top-[5.25rem] left-1/2 -translate-x-1/2 text-center font-display text-[2.25rem] leading-none whitespace-nowrap text-nav-accent sm:top-[6.0625rem] sm:text-[3rem] lg:text-[4.5rem]"
      >
        {heading}
      </ScatterText>

      {/* Flanking the front set rather than under it, as the design has them -
          the work is the middle of the frame and the two ways out of it are at
          its sides. Narrower than `lg` they pair up under the set instead; see
          `TURN`. */}
      <button
        type="button"
        tabIndex={tab}
        disabled={!visible}
        onClick={() => onTurn(-1)}
        className={`${BUTTON} ${TURN} left-1/2 -translate-x-[calc(100%+0.25rem)] lg:left-[15rem] lg:translate-x-0`}
      >
        {previous}
      </button>
      <button
        type="button"
        tabIndex={tab}
        disabled={!visible}
        onClick={() => onTurn(1)}
        className={`${BUTTON} ${TURN} left-1/2 translate-x-[0.25rem] lg:right-[15rem] lg:left-auto lg:w-[6.0625rem] lg:translate-x-0`}
      >
        {next}
      </button>

      <div className="absolute inset-x-0 bottom-[4.5rem] flex flex-col items-center sm:bottom-[3.125rem]">
        {/* Keyed on the work, so turning the ring re-runs the spring: the name
            and its tags change together with the picture behind them rather
            than swapping under it. */}
        <Spring
          key={current.name}
          from={{ opacity: 0, transform: "translate3d(0, 0.5rem, 0)" }}
          to={{ opacity: 1, transform: "translate3d(0, 0rem, 0)" }}
          mode="once"
          className="flex flex-col items-center"
        >
          <p className="mb-4 text-center font-display text-[1.5rem] leading-none text-nav-accent sm:mb-6 sm:text-[2rem]">
            {current.name}
          </p>

          {/* Two tags: the price and the count. A third slot held a mood -
              "Low entry", "Better odds" - which is a claim the pack cannot
              keep, since the odds per draw are identical across every tier.

              Still wrapping and still centred when it wraps: two tags at 32px
              apart fit a phone, but the count grows with the tier. */}
          <ul className="mb-6 flex flex-wrap justify-center gap-x-5 gap-y-1 px-6 text-center text-[0.875rem] leading-[1.2] text-hud-text sm:mb-[1.9875rem] sm:gap-x-8 sm:text-[1rem]">
            {current.tags.map((tag) => (
              <li key={tag}>( {tag} )</li>
            ))}
          </ul>
        </Spring>

        {/* One button, centred. It carried an arrow tile beside it, which read
            as a second destination and pointed nowhere the word did not - the
            pack opens either way.

            **Only a link while the pack has a route.** Without an `href` and
            without `onExplore` the same face renders as a plain box - no tab
            stop, no pointer, no hover - and becomes a link again the moment a
            pack in `data/mocks/home.ts` is given a destination. */}
        {current.soon ? (
          // Grey and inert. There is no tier behind this set, so the button
          // would open a theatre for a pack that does not exist.
          <div className="flex gap-1">
            <ExploreFace explore={explore} muted />
          </div>
        ) : onExplore ? (
          <button
            type="button"
            onClick={() => onExplore(current.name)}
            tabIndex={tab}
            aria-label={`${explore} ${current.name}`}
            className={`group flex gap-1 ${
              visible ? "pointer-events-auto" : "pointer-events-none"
            }`}
          >
            <ExploreFace explore={explore} hover />
          </button>
        ) : current.href ? (
          <Link
            href={current.href}
            tabIndex={tab}
            aria-label={`${explore} ${current.name}`}
            className={`group flex gap-1 ${
              visible ? "pointer-events-auto" : "pointer-events-none"
            }`}
          >
            <ExploreFace explore={explore} hover />
          </Link>
        ) : (
          <div className="flex gap-1">
            <ExploreFace explore={explore} />
          </div>
        )}
      </div>
    </Spring>
  );
};
