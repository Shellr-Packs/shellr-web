"use client";

// 📖 Docs: obsidian/frontend/components/common.md

import { useEffect, useImperativeHandle, useRef, type RefObject } from "react";

export interface PixelWaveHandle {
  /**
   * Where the wave has got to, `0` (nothing) → `1` (the window is filled).
   *
   * @param clearing - run it as an **exit**: the squares leave from the bottom
   *   up, the same way they arrived, rather than retreating back down the way
   *   they came. A panel dissolving off has to look like the wave carrying on
   *   through it, not like the arrival played backwards.
   */
  set(progress: number, clearing?: boolean): void;
}

export interface PixelWaveProps {
  handle: RefObject<PixelWaveHandle | null>;
}

/** Side of one pixel, in CSS px. Big enough to read *as* a pixel. */
const CELL = 18;
/**
 * How deep the ragged edge is, as a share of the window's height.
 *
 * This is the whole look: with no spread the wave is a straight line sweeping
 * up, and with too much it is a slow grey fog. A third of the window gives the
 * front a band of scattered squares ahead of the solid fill, thinning out
 * toward the top of it.
 */
const SPREAD = 0.34;

/**
 * The dissolve that hands the room over to the team block.
 *
 * A grid of squares fills from the bottom up: each cell has a fixed random
 * offset, and it turns solid once the wave has passed `its row + its offset`.
 * The randomness is what makes the front a scatter of pixels rather than a
 * ruled line, and because the offsets are drawn once and kept, scrubbing the
 * scroll back and forth replays exactly the same dissolve rather than boiling.
 *
 * **Canvas, not elements.** The same thing in DOM is four thousand `div`s to
 * lay out and style; here it is one node and a few hundred `fillRect`s, and only
 * the rows inside the ragged band are drawn cell by cell at all — everything
 * below the band is one rectangle.
 *
 * Driven imperatively by [[components/common|`<PanelStack>`]]: the wave moves on
 * most frames of an act, and a re-render per frame to set one number is a
 * re-render too many.
 */
export const PixelWave = ({ handle }: PixelWaveProps) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  /** One fixed offset per cell, in row-major order — redrawn only on resize. */
  const offsets = useRef<Float32Array>(new Float32Array(0));
  const grid = useRef({ columns: 0, rows: 0, width: 0, height: 0 });
  const drawn = useRef(Number.NaN);

  useImperativeHandle(handle, () => ({
    set(progress: number, clearing = false) {
      const node = canvas.current;
      const context = node?.getContext("2d");
      if (!node || !context) return;
      const state = clearing ? -progress : progress;
      if (state === drawn.current) return;
      drawn.current = state;

      const { columns, rows, width, height } = grid.current;
      context.clearRect(0, 0, width, height);
      if (progress <= 0) return;
      if (progress >= 1 && !clearing) {
        context.fillStyle = "#000000";
        context.fillRect(0, 0, width, height);
        return;
      }

      // How far up the wave has got, once the spread is taken into account. On
      // the way out it is driven by what is **left** rather than by what is
      // covered, so the front keeps climbing: the squares clear from the bottom
      // up and the solid part is pushed off the top.
      const reach = (clearing ? 1 - progress : progress) * (1 + SPREAD);
      context.fillStyle = "#000000";

      for (let row = 0; row < rows; row += 1) {
        // Height of this row's top edge, 0 at the foot of the window.
        const at = 1 - (row + 1) / rows;
        const y = row * CELL;
        const room = (reach - at) / SPREAD;

        if (room <= 0) {
          // The wave has not reached this row: empty on the way in, still solid
          // on the way out.
          if (clearing) context.fillRect(0, y, width, CELL);
          continue;
        }
        if (room >= 1) {
          // Past the band — solid on the way in, gone on the way out.
          if (!clearing) context.fillRect(0, y, width, CELL);
          continue;
        }

        const base = row * columns;
        for (let column = 0; column < columns; column += 1) {
          const under = offsets.current[base + column] <= room;
          if (under !== clearing)
            context.fillRect(column * CELL, y, CELL, CELL);
        }
      }
    },
  }));

  useEffect(() => {
    const node = canvas.current;
    if (!node) return;

    const measure = (): void => {
      const width = node.clientWidth || window.innerWidth;
      const height = node.clientHeight || window.innerHeight;
      const columns = Math.ceil(width / CELL);
      const rows = Math.ceil(height / CELL);

      // One device pixel per CSS pixel: the cells are eighteen across and have
      // hard edges, so there is nothing for a denser buffer to resolve.
      node.width = width;
      node.height = height;
      grid.current = { columns, rows, width, height };

      const cells = new Float32Array(columns * rows);
      for (let i = 0; i < cells.length; i += 1) cells[i] = Math.random();
      offsets.current = cells;
      drawn.current = Number.NaN;
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  return (
    <canvas
      ref={canvas}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 size-full"
    />
  );
};
