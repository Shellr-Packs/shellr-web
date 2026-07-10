/**
 * @fileoverview Hover targets for the TV wall.
 *
 * The GLB names every television with a bare number (`"1"`…`"15"`) and gives the
 * floor and the figure real names, so the numbered roots are the pickable units.
 * Which television rests on which is derived from their world bounding boxes —
 * never hardcoded — so re-exporting the model with a different layout needs no
 * code change.
 *
 * The relation is **directed and upward only**: hovering a television raises
 * everything stacked above it and nothing else. A connected-component grouping
 * was tried first and merged two televisions standing apart on the floor,
 * because a third one bridged them by resting on both.
 *
 * 📖 Docs: obsidian/frontend/scene-3d.md
 */

import { Box3, Object3D, Vector3 } from "three";

/** The GLB's television roots are named with a bare number. */
const TV_NAME = /^\d+$/;

/** The floor is never an occluder — a ray aimed at a television crosses it. */
const FLOOR_NAME = "Plane";

export interface HoverTarget {
  object: Object3D;
  /** World AABB at rest — the broad-phase proxy the pointer ray is tested against. */
  box: Box3;
  /** Transform to animate away from and back to. */
  basePosition: Vector3;
  baseYaw: number;
  basePitch: number;
  baseRoll: number;
  /**
   * Offsets the idle drift, so a raised stack never bobs in unison. Derived from
   * the order the televisions appear in the model — deterministic, not random.
   */
  phase: number;
  /** `1` or `−1`: which way this one swings first. */
  swing: number;
  /** Centre of the footprint: the axis the television turns about. */
  pivot: Vector3;
  /** Televisions resting directly on this one. */
  above: HoverTarget[];
}

export interface StackOptions {
  /** Vertical gap between two boxes still counted as "resting on". */
  gap: number;
  /** Minimum share of the smaller footprint the two must share (0–1). */
  overlap: number;
  /** Lift the boxes are grown by, so a raised television stays pickable. */
  lift: number;
}

export interface TvGeometry {
  targets: HoverTarget[];
  /** Meshes that swallow a hover — the figure standing in front of the wall. */
  occluders: Object3D[];
}

/** Shared XZ footprint, as a share of the smaller of the two. */
const footprintOverlap = (a: Box3, b: Box3): number => {
  const width = Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x);
  const depth = Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z);
  if (width <= 0 || depth <= 0) return 0;

  const areaA = (a.max.x - a.min.x) * (a.max.z - a.min.z);
  const areaB = (b.max.x - b.min.x) * (b.max.z - b.min.z);
  return (width * depth) / Math.min(areaA, areaB);
};

/** Fill in `above`: who rests directly on whom. */
const linkStacks = (
  targets: HoverTarget[],
  boxes: Map<HoverTarget, Box3>,
  { gap, overlap }: StackOptions,
): void => {
  targets.forEach((a) => {
    targets.forEach((b) => {
      if (a === b) return;
      const lower = boxes.get(a)!;
      const upper = boxes.get(b)!;
      // `b` rests on `a` when its base meets `a`'s top. Comparing the signed gap
      // alone would also match two televisions standing side by side.
      const resting =
        upper.min.y > lower.min.y &&
        Math.abs(upper.min.y - lower.max.y) <= gap &&
        footprintOverlap(lower, upper) >= overlap;
      if (resting) a.above.push(b);
    });
  });
};

/**
 * Split a loaded GLB scene into pickable televisions, the stacking relation
 * between them, and the things that stand in front of them.
 */
export const buildTvGeometry = (
  model: Object3D,
  options: StackOptions,
): TvGeometry => {
  model.updateWorldMatrix(true, true);

  const targets: HoverTarget[] = [];
  const occluders: Object3D[] = [];
  /** Rest boxes, before the pick margin is added — the stacking test needs them exact. */
  const restBoxes = new Map<HoverTarget, Box3>();

  for (const child of model.children) {
    const box = new Box3().setFromObject(child);
    if (box.isEmpty()) continue;

    if (!TV_NAME.test(child.name)) {
      if (child.name !== FLOOR_NAME) occluders.push(child);
      continue;
    }

    const pivot = box.getCenter(new Vector3());
    pivot.y = child.position.y;

    const target: HoverTarget = {
      object: child,
      box: box.clone(),
      basePosition: child.position.clone(),
      baseYaw: child.rotation.y,
      basePitch: child.rotation.x,
      baseRoll: child.rotation.z,
      // Irrational multiples keep the phases from lining up again a few
      // televisions later.
      phase: targets.length * 2.399,
      swing: targets.length % 2 === 0 ? 1 : -1,
      pivot,
      above: [],
    };
    // A raised television must stay inside its own proxy box, or the hover would
    // drop the moment the lift starts. The box is only a broad-phase filter, so
    // the margin errs generous: enough for the deepest column in the model.
    target.box.max.y += options.lift * 4;

    restBoxes.set(target, box);
    targets.push(target);
  }

  linkStacks(targets, restBoxes, options);

  return { targets, occluders };
};

/**
 * The hovered television and everything stacked above it, each with the number
 * of hops it sits above the hovered one — that depth is what opens a gap
 * between them when they rise.
 */
export const collectStackAbove = (
  root: HoverTarget,
): Map<HoverTarget, number> => {
  const depths = new Map<HoverTarget, number>([[root, 0]]);
  const queue: HoverTarget[] = [root];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const depth = depths.get(current)!;
    for (const next of current.above) {
      // A television resting on two others is reached twice; keep the shorter
      // path so it never lifts further than the column it belongs to.
      if (depths.has(next)) continue;
      depths.set(next, depth + 1);
      queue.push(next);
    }
  }

  return depths;
};
