"use client";

// 📖 Docs: obsidian/frontend/components/common.md

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  PixelWave,
  type PixelWaveHandle,
} from "@/components/common/panels/pixel-wave";
import { smoothScrollProgress } from "@/lib/animation/scroll-progress";
import { subscribeToTicker } from "@/lib/animation/ticker";
import { sceneConfig } from "@/lib/scene/config";

export interface StackPanel {
  key: string;
  /** Accessible name for the panel's `<section>`. */
  label: string;
  /**
   * How this panel arrives and how it goes.
   *
   * `slide` (the default) comes up from below and pushes the last one out.
   * `pixels` holds the panel still and **dissolves** it instead — a wave of
   * squares filling the window from the bottom on the way in, and clearing the
   * same way on the way out.
   *
   * Only the first panel can sensibly *enter* on pixels (the ones after it
   * arrive over something, and there is nothing to dissolve from) and only the
   * last can sensibly *exit* on them (anything else would dissolve to reveal
   * the panel behind, which is already covering).
   */
  enter?: "slide" | "pixels";
  exit?: "slide" | "pixels";
  /**
   * `active` is true only while this panel is the one over the window;
   * `arriving` opens much earlier — a third of the way in — and is what the
   * headings key off, so they are already resolving while the panel is on its
   * way rather than starting once it has landed.
   */
  render: (active: boolean, arriving: boolean) => ReactNode;
}

export interface PanelStackProps {
  panels: StackPanel[];
  /**
   * Called when the stack starts and stops covering the whole window.
   *
   * The scene behind it is a canvas with seven video decoders attached; drawing
   * it under opaque panels is the most expensive thing the page can do for no
   * picture at all.
   */
  onCovered: (covered: boolean) => void;
}

/**
 * The windows the stack owns, read off the scene's own acts rather than written
 * again here: it **rises** over the tail of the finale, **hands over** from one
 * panel to the next across the stretch the scene is covered for, and **leaves**
 * as the epilogue's pull-back begins.
 *
 * They are laid end to end on purpose. Every version of this that left a gap
 * between two of them put a **pause** in the scroll — a panel sitting perfectly
 * still while the wheel turned — and one act running straight into the next
 * reads as a page rather than a slideshow. The transitions are long enough to
 * read the panel *during*; that is where the dwell went.
 *
 * **Every one of these is travelled linearly**, so they were widened when the
 * easing came off: an eased window hides its own shortness (it is barely moving
 * at either end), and the same window travelled at one rate is abrupt at both.
 * The rise starts near the top of the finale and the exit takes two thirds of
 * the reveal.
 */
const RISE: [number, number] = [
  sceneConfig.scroll.finale.range[0] +
    (sceneConfig.scroll.finale.range[1] - sceneConfig.scroll.finale.range[0]) *
      0.12,
  sceneConfig.scroll.finale.range[1],
];
const HOLD: [number, number] = [
  sceneConfig.scroll.finale.range[1],
  sceneConfig.scroll.epilogue.reveal[0],
];
const LEAVE: [number, number] = [
  sceneConfig.scroll.epilogue.reveal[0],
  sceneConfig.scroll.epilogue.reveal[0] +
    (sceneConfig.scroll.epilogue.reveal[1] -
      sceneConfig.scroll.epilogue.reveal[0]) *
      0.66,
];

/**
 * The `k`th hand-over: the covered stretch cut into one slice per join, with no
 * still air between them.
 */
const handover = (k: number, total: number): [number, number] => {
  const joins = Math.max(total - 1, 1);
  const span = HOLD[1] - HOLD[0];
  return [HOLD[0] + (span * (k - 1)) / joins, HOLD[0] + (span * k) / joins];
};

/**
 * Black between one panel and the next, in pixels.
 *
 * The panels used to tile **exactly** — one panel's foot was the next one's head
 * — which put the team block's tags 147px from the studio's opening line as the
 * two crossed the window (50px of the one's footing plus 97px of the other's
 * head). Three times that is what the brief asked for, so the stride is a
 * viewport **plus this**.
 *
 * Pixels rather than a share of the window, because both numbers it is measured
 * against are pixels from the design. What shows through the gap is the finale's
 * black layer, which is at full strength for the whole stretch the stack is
 * covering — the room behind it is not being drawn at all.
 */
const GAP = 294;

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);
/**
 * The scroll maps straight through — no easing anywhere in this file.
 *
 * The panels used to rise, hand over and leave on smoothsteps, which meant the
 * page crept at the start of every transition, hurried through the middle and
 * crept out again. What that reads as is the scroll fighting the wheel. One rate
 * per window, and the windows above carry the softness instead.
 */
const phase = (value: number, [from, to]: [number, number]): number =>
  clamp01((value - from) / Math.max(to - from, 0.0001));

/**
 * The stack of full-window panels the scroll slides up over the scene.
 *
 * **The stack is the transition.** The scroll used to hand over to these by
 * driving the lens into a television until the glass was the whole frame; that
 * zoom is gone. The panels are opaque and simply rise from the bottom of the
 * window, one pushing the last one out of the top, and the last of them carries
 * on up and out as the closing shot is revealed. Nothing behind them has to be
 * dressed for the join, because nothing behind them can be seen.
 *
 * One number does all of it: `offset` runs `0` (all below the window) through
 * `1` (the first panel covering) and `2` (the second) to `panels.length + 1`
 * (all gone), and panel `k` sits at `(k + 1 − offset) × (100% + GAP)`. They are
 * laid **one window plus `GAP` apart** — see that constant — and what shows in
 * the gap is the black layer the finale leaves up, not the room.
 *
 * `fixed` and driven by the scroll rather than placed in the flow: the scene is
 * a canvas that is `sticky` for the whole page, so what covers it has to be
 * pinned to the window too. Transforms are written **straight to the elements**
 * off the shared ticker — this changes on most frames of two acts, and a
 * re-render per frame to set one number is a re-render too many. React state
 * carries only *which panel is up*.
 */
export const PanelStack = ({ panels, onCovered }: PanelStackProps) => {
  const nodes = useRef<Array<HTMLElement | null>>([]);
  const contents = useRef<Array<HTMLDivElement | null>>([]);
  const [up, setUp] = useState(-1);
  const [coming, setComing] = useState(-1);
  const total = panels.length;

  /**
   * One stable box per panel for its dissolve to hang its handle on. Plain
   * objects rather than refs, so they can be handed out during the render the
   * canvases are created in.
   */
  const waves = useMemo(
    () =>
      Array.from({ length: total }, () => ({
        current: null as PixelWaveHandle | null,
      })),
    [total],
  );

  // The panel list is rebuilt on every render of the parent; the loop only ever
  // wants the latest one, and depending on its identity would re-subscribe each
  // time.
  const latest = useRef(panels);
  useEffect(() => {
    latest.current = panels;
  }, [panels]);

  useEffect(() => {
    let previous = Number.NaN;
    let covered = false;

    return subscribeToTicker(
      (time) => {
        const progress = smoothScrollProgress(time);

        let offset = phase(progress, RISE);
        for (let k = 1; k < total; k += 1) {
          offset += phase(progress, handover(k, total));
        }
        offset += phase(progress, LEAVE);

        if (offset === previous) return;
        previous = offset;

        nodes.current.forEach((node, k) => {
          if (!node) return;
          const panel = latest.current[k];
          const dissolveIn = panel?.enter === "pixels";
          const dissolveOut = panel?.exit === "pixels";
          // Where this panel is square with the window.
          const home = k + 1;

          // A dissolving panel does not travel through that side of its life —
          // it is already squared with the window and the wave is what brings
          // it up or takes it away. The other side still slides.
          let travel = offset;
          if (dissolveIn) travel = Math.max(travel, home);
          if (dissolveOut) travel = Math.min(travel, home);
          const y = (home - travel) * 100;
          node.style.transform = `translate3d(0, calc(${y}% + ${(
            (home - travel) *
            GAP
          ).toFixed(1)}px), 0)`;

          if (!dissolveIn && !dissolveOut) {
            node.style.visibility =
              y > -99.9 && y < 99.9 ? "visible" : "hidden";
            return;
          }

          // Filling on the way in, emptying on the way out; whichever of the two
          // is further from solid is the one on screen.
          const filling = dissolveIn ? clamp01(offset - k) : 1;
          const emptying = dissolveOut ? 1 - clamp01(offset - home) : 1;
          const wave = Math.min(filling, emptying);

          node.style.visibility =
            wave > 0.001 && y > -99.9 && y < 99.9 ? "visible" : "hidden";
          // On the way out the wave is handed what is **left** and told it is
          // clearing, so the squares keep travelling upward instead of the
          // arrival running backwards.
          waves[k]?.current?.set(
            dissolveOut && emptying < 1 ? emptying : filling,
            dissolveOut && emptying < 1,
          );
          // The words arrive on the back half of the dissolve, once there is
          // enough solid ground under them to read against — and leave the same
          // way, before the ground goes out from under them.
          const content = contents.current[k];
          if (content) {
            content.style.opacity = `${clamp01((wave - 0.42) / 0.58)}`;
          }
        });

        // Which panel is close enough to square with the window to be worth
        // interacting with — a number that changes a handful of times in a
        // scroll, unlike the offset it comes from.
        const front = latest.current.findIndex(
          (_, k) => Math.abs(offset - (k + 1)) < 0.1,
        );
        setUp((was) => (was === front ? was : front));
        // Wide enough to catch a panel that is still moving. The headings start
        // resolving here, so by the time the panel is square its words are up.
        const near = latest.current.findIndex(
          (_, k) => Math.abs(offset - (k + 1)) < 0.62,
        );
        setComing((was) => (was === near ? was : near));

        // Covered from the first panel arriving until the last starts to leave.
        // In between, two panels tiling edge to edge cover it just as well as
        // one, which is why this is a range and not a per-panel test.
        const hides = offset >= 1 && offset <= total;
        if (hides !== covered) {
          covered = hides;
          onCovered(hides);
        }
      },
      () => 0,
    );
  }, [onCovered, total, waves]);

  return (
    <>
      {panels.map((panel, k) => (
        <section
          key={panel.key}
          ref={(node) => {
            nodes.current[k] = node;
          }}
          aria-label={panel.label}
          data-enter={panel.enter ?? "slide"}
          data-exit={panel.exit ?? "slide"}
          // No `translate-y-full` to park it below the window, tempting as it
          // is: Tailwind v4 compiles `translate-*` to the standalone
          // **`translate`** property, which is applied *before* `transform` and
          // cannot be overridden by it — the panel stayed a viewport down while
          // its own transform read as identity. `invisible` covers the first
          // frame instead, and the ticker owns both from there.
          // A dissolving panel has **no background of its own** — the wave's
          // squares are the black, and painting it behind them would put the
          // whole panel up the moment the wave started.
          className={`invisible fixed inset-0 z-[25] font-sans ${
            panel.enter === "pixels" || panel.exit === "pixels"
              ? ""
              : "bg-black"
          }`}
          // `inert` rather than `aria-hidden`: these hold focusable controls,
          // and they have to leave the tab order with the panel rather than
          // only the accessibility tree.
          inert={up !== k}
        >
          {(panel.enter === "pixels" || panel.exit === "pixels") && waves[k] ? (
            <PixelWave handle={waves[k]} />
          ) : null}
          <div
            ref={(node) => {
              contents.current[k] = node;
            }}
            className="absolute inset-0"
          >
            {panel.render(up === k, coming === k)}
          </div>
        </section>
      ))}
    </>
  );
};
