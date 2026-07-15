"use client";

// 📖 Docs: obsidian/frontend/components/common.md

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { ScatterText } from "@/components/common/text/scatter-text";
import type { HomeClosingContent } from "@/data/mocks/home";

export interface ClosingCopyProps {
  content: HomeClosingContent;
  /**
   * Handed the writer the scene should call every frame of the last shot.
   *
   * The parent owns the scene; this owns the elements. Passing the writer up is
   * what keeps the per-frame numbers out of React entirely. Must be stable —
   * this runs in an effect.
   */
  onWriter: (
    write: (reveal: number, edgeAt: (y: number) => number) => void,
  ) => void;
}

/** Where in the reveal the words are fully up — they arrive with the picture. */
const IN: [number, number] = [0.12, 0.62];

/**
 * And where the mark comes up: **after** the words have finished, over the last
 * third of the pull-back.
 *
 * Deliberately not sharing `IN`. The words arrive *with* the shot and belong to
 * it; the mark is what the page ends on, and it should not be competing with
 * the set while the set is still crossing the frame. By 0.66 the television is
 * on its way out to the side, and the mark has the bottom of the frame to
 * itself.
 */
const MARK_IN: [number, number] = [0.66, 0.98];

/**
 * How far past the measured edge the rule is drawn, in px.
 *
 * The rays are cast through the **scene**, and what you see is that scene put
 * through a CRT barrel — the pass bends the picture, so the set's edge on glass
 * is a few dozen pixels from where the geometry says it is, and by a different
 * few dozen at every window size. Rather than model a shader's curvature in a
 * layout, the rule is run slightly *into* the set and its last stretch is faded
 * out: there is no seam to line up if the line has already gone.
 */
const OVERLAP = 26;

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);

/**
 * The last shot's words: *Have an Idea?* over *Lets collaborate!*, with a hairline
 * ruled under both.
 *
 * Figma node `1463:1054`: the heading in the hollow display face at **72/1.0** in
 * `#dbfffe` on the design's **60px** left margin, the line under it at
 * **Chakra Petch 32/1.2** in the same colour, and a 1px rule at 20% white
 * running from that margin across the frame.
 *
 * > [!important] The rule is **under the television**, and the television is in
 * > a canvas
 * > There is no z-order that puts DOM behind an opaque canvas, so the rule is
 * > **cut** where the set begins instead: the scene projects the leftmost point
 * > of the closing television every frame and the line is drawn exactly that
 * > wide. It follows the set as the hover turns it, which is the one thing a
 * > fixed width could never do.
 *
 * Reveal and edge are written **straight to the elements**; the only thing React
 * is told is whether the heading should be resolved, which flips once.
 */
export const ClosingCopy = ({ content, onWriter }: ClosingCopyProps) => {
  const root = useRef<HTMLDivElement>(null);
  const rule = useRef<HTMLSpanElement>(null);
  /**
   * Where the rule sits on screen, in CSS pixels — its top edge and its left.
   *
   * Cached rather than read in the loop: `getBoundingClientRect` is a **layout
   * read**, and one interleaved with the style writes below forces the browser
   * to re-run layout every frame of the last act (`optimize-3d-scene` §9). It
   * only moves when the window does — the block is centred and the text above it
   * is one line.
   *
   * The left edge is **measured, not a constant**. It used to be the design's
   * 60px written into this file, which made the rule a design margin long
   * whatever margin the block was actually sitting on: at a phone's 24px the
   * line started 36px inside its own heading and stopped 36px short of the set.
   */
  const ruleBox = useRef({ top: 0, left: 0 });
  /** The mark at the foot of the last shot. */
  const mark = useRef<HTMLDivElement>(null);
  const [up, setUp] = useState(false);

  useEffect(() => {
    const measure = (): void => {
      const line = rule.current;
      if (!line) return;
      const box = line.getBoundingClientRect();
      ruleBox.current = { top: box.top, left: box.left };
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const write = useCallback((reveal: number, edgeAt: (y: number) => number) => {
    const node = root.current;
    if (!node) return;

    const level = clamp01((reveal - IN[0]) / (IN[1] - IN[0]));
    node.style.opacity = `${level}`;
    node.style.visibility = level > 0.001 ? "visible" : "hidden";
    const resolved = level > 0.2;
    setUp((was) => (was === resolved ? was : resolved));

    // **Asked at the rule's own height.** The set is turned, so its near
    // bottom corner reaches much further left than its middle; a single
    // leftmost point stopped the rule well short of the casing.
    // Written straight to the element, like everything else in this loop —
    // a state update per frame of the last act is the one thing this
    // component exists to avoid.
    const badge = mark.current;
    if (badge) {
      const rise = clamp01((reveal - MARK_IN[0]) / (MARK_IN[1] - MARK_IN[0]));
      badge.style.opacity = `${rise}`;
      badge.style.transform = `translateY(${(1 - rise) * 18}px)`;
    }

    const line = rule.current;
    if (!line) return;
    const { top, left } = ruleBox.current;
    line.style.width = `${Math.max(edgeAt(top) - left + OVERLAP, 0)}px`;
  }, []);

  // Handed up after mount, not during render — the writer reads refs, and refs
  // are not readable while rendering.
  useEffect(() => onWriter(write), [onWriter, write]);

  return (
    <div
      ref={root}
      className="pointer-events-none invisible fixed inset-0 z-[15] font-sans opacity-0"
    >
      <div className="absolute top-1/2 left-6 -translate-y-1/2 sm:left-10 lg:left-[3.75rem]">
        <ScatterText
          tag="h2"
          active={up}
          className="font-display text-[2.25rem] leading-none whitespace-nowrap text-nav-accent sm:text-[3rem] lg:text-[4.5rem]"
        >
          {content.heading}
        </ScatterText>

        <p className="mt-4 text-[1.25rem] leading-[1.2] whitespace-nowrap text-nav-accent sm:mt-[1.6875rem] sm:text-[1.5rem] lg:text-[2rem]">
          {content.lead}
        </p>

        {/* Ruled the full width the scene allows and no further - see above. */}
        <span
          ref={rule}
          aria-hidden="true"
          className="mt-6 block h-px bg-[linear-gradient(to_right,rgb(255_255_255/0.2)_0%,rgb(255_255_255/0.2)_82%,transparent_100%)] sm:mt-[2.1875rem]"
        />
      </div>

      {/* The sign-off. Centred on the foot of the frame rather than following
          the block above it: the copy is ranged left against the television,
          and a mark hung off the same margin reads as a fourth line of it. */}
      <div
        ref={mark}
        className="absolute inset-x-0 bottom-8 flex flex-col items-center gap-2 opacity-0 sm:bottom-12"
      >
        <Image
          src="/assets/brand/shellr-mark-v93.png"
          alt=""
          width={704}
          height={768}
          className="h-auto w-9 [image-rendering:pixelated] sm:w-11"
        />
        <span className="text-[0.6875rem] font-semibold tracking-[0.34em] text-nav-accent/70 uppercase">
          Shellr
        </span>
      </div>
    </div>
  );
};
