/**
 * @fileoverview Pointer hover for the TV wall — a hovered television rises and
 * turns, and everything stacked above it rises further, opening a gap.
 *
 * Picking is two-phase: a ray against one world AABB per television narrows the
 * field to a handful of candidates, then a real mesh raycast against just those
 * decides. Boxes alone were not enough — they overlap heavily on a wall this
 * dense, so a television behind a neighbour's box could never be reached.
 *
 * 📖 Docs: obsidian/frontend/scene-3d.md
 */

import { SpringValue } from "@react-spring/web";
import { Camera, Object3D, Raycaster, Vector2, Vector3 } from "three";

import type { TvHoverConfig } from "@/lib/scene/config";
import {
  buildTvGeometry,
  collectStackAbove,
  type HoverTarget,
  type TvGeometry,
} from "@/lib/scene/tv-stacks";

/** Below this a television is at rest and no longer worth writing transforms for. */
const REST_EPSILON = 0.0005;

const UP = new Vector3(0, 1, 0);

interface AnimatedTarget {
  target: HoverTarget;
  /**
   * Height in lift steps: `0` at rest, `depth + 1` while raised.
   *
   * The step count is inside the spring rather than a multiplier outside it on
   * purpose. Moving the pointer up a stack changes a television's depth — from
   * "two above the hovered one" to "the hovered one" — and with the count
   * outside, that switch teleported it down two steps mid-flight. As a goal, the
   * same switch is just a new target the spring eases toward.
   */
  steps: SpringValue<number>;
  /** Whether the last frame wrote transforms for this television. */
  dirty: boolean;
}

export class TvHover {
  private readonly config: TvHoverConfig;
  private readonly geometry: TvGeometry;
  private readonly animated: Map<HoverTarget, AnimatedTarget>;
  private readonly byObject = new Map<Object3D, HoverTarget>();
  private readonly raycaster = new Raycaster();
  private readonly scratch = new Vector3();
  private readonly forward = new Vector3();
  private readonly centre = new Vector3();
  private readonly cameraPosition = new Vector3();
  private hovered: HoverTarget | null = null;
  /** Seconds, from the render loop — the clock the idle drift runs on. */
  private time = 0;

  constructor(model: Object3D, config: TvHoverConfig) {
    this.config = config;
    this.geometry = buildTvGeometry(model, { ...config.stack, lift: config.lift });

    this.animated = new Map(
      this.geometry.targets.map((target) => [
        target,
        {
          target,
          steps: new SpringValue({ from: 0, config: config.spring }),
          dirty: false,
        },
      ]),
    );

    for (const target of this.geometry.targets) {
      this.byObject.set(target.object, target);
    }
  }

  /** True while a television is under the pointer — drives the cursor. */
  get isHovering(): boolean {
    return this.hovered !== null;
  }

  /** The television under the pointer, for anything that has to follow it. */
  get hoveredObject(): Object3D | null {
    return this.hovered?.object ?? null;
  }

  /**
   * Depth of the hovered television along the camera's view axis, or `null` when
   * nothing is hovered.
   *
   * Depth along the axis, not straight-line distance: that is what the bokeh
   * shader compares its depth buffer against, so a television off to the side
   * would otherwise pull focus to a plane it does not sit on.
   */
  focusDepth(camera: Camera): number | null {
    if (!this.hovered) return null;

    camera.getWorldDirection(this.forward);
    this.scratch
      .copy(this.hovered.box.getCenter(this.centre))
      .sub(camera.getWorldPosition(this.cameraPosition));

    return this.scratch.dot(this.forward);
  }

  /**
   * Re-pick under the pointer.
   *
   * @param pointer - pointer position in normalised device coordinates.
   */
  pick(pointer: Vector2, camera: Camera): void {
    this.raycaster.setFromCamera(pointer, camera);

    // Pick against the wall **at rest**. Picking the animated pose feeds back on
    // itself: a television that rises moves out from under the cursor, the next
    // pick lands on whatever was behind or below it, and the hover hands itself
    // to a neighbour — which reads as "I hovered the top one and the bottom one
    // rose".
    const displaced = [...this.animated.values()].filter((entry) => entry.dirty);
    displaced.forEach((entry) => this.writeTransform(entry, 0));

    this.setHovered(this.findUnderRay());

    displaced.forEach((entry) => this.writeTransform(entry, entry.steps.get()));
  }

  /** Broad phase on boxes, narrow phase on the meshes that survive it. */
  private findUnderRay(): HoverTarget | null {
    const candidates: Object3D[] = [];

    for (const target of this.geometry.targets) {
      if (this.raycaster.ray.intersectBox(target.box, this.scratch)) {
        candidates.push(target.object);
      }
    }
    if (candidates.length === 0) return null;

    // The figure joins the narrow phase so it can swallow the hover: a
    // television behind a solid body must not light up through it.
    const hits = this.raycaster.intersectObjects(
      [...candidates, ...this.geometry.occluders],
      true,
    );
    if (hits.length === 0) return null;

    return this.ownerOf(hits[0].object);
  }

  /** Walk up from a hit mesh to the numbered television root, if any. */
  private ownerOf(hit: Object3D): HoverTarget | null {
    let node: Object3D | null = hit;
    while (node) {
      const target = this.byObject.get(node);
      if (target) return target;
      node = node.parent;
    }
    return null;
  }

  private setHovered(next: HoverTarget | null): void {
    if (next === this.hovered) return;
    this.hovered = next;

    const raised = next ? collectStackAbove(next) : null;

    for (const entry of this.animated.values()) {
      const depth = raised?.get(entry.target);

      if (depth === undefined) {
        entry.steps.start(0, { config: this.config.release, delay: 0 });
        continue;
      }
      // Depth is the gap: the one directly above rises twice as far as the one
      // under the pointer, so they visibly separate instead of moving as a slab.
      // The delay turns that into a cascade rather than a simultaneous jump.
      entry.steps.start(depth + 1, {
        config: this.config.spring,
        delay: depth * this.config.stagger,
      });
    }
  }

  /**
   * Write the current spring state onto the scene graph. Call every frame.
   *
   * @param time - seconds since the page loaded; drives the idle drift.
   */
  apply(time: number): void {
    this.time = time;

    for (const entry of this.animated.values()) {
      const steps = entry.steps.get();
      if (steps < REST_EPSILON && !entry.dirty) continue;

      this.writeTransform(entry, steps);
      // A raised television is never still, so it stays dirty while it hangs.
      entry.dirty = steps >= REST_EPSILON;
    }
  }

  /**
   * Place one television `steps` lifts above its resting pose. `0` is the pose
   * the GLB shipped; the world matrix is refreshed so a raycast in the same
   * frame sees the pose that was just written.
   */
  private writeTransform(entry: AnimatedTarget, steps: number): void {
    const { target } = entry;
    const { float } = this.config;
    // The turn is done by the first step and holds — a television three steps up
    // is not three times more turned than the one under the pointer.
    const raised = Math.min(steps, 1);

    // Idle drift, scaled by how far up the television is: it fades in with the
    // rise and is gone by the time it lands, so nothing twitches at rest. Each
    // axis runs at its own rate, which keeps the motion from reading as a loop.
    const clock = this.time * float.speed + target.phase;
    const drift = raised * target.swing;

    const yaw = raised * this.config.yaw + Math.sin(clock) * float.yaw * drift;
    const lift =
      steps * this.config.lift + Math.sin(clock * 0.83) * float.amplitude * raised;

    // Turning about the footprint centre, not the node origin, keeps the
    // television spinning in place instead of swinging around a corner.
    this.scratch
      .copy(target.basePosition)
      .sub(target.pivot)
      .applyAxisAngle(UP, yaw)
      .add(target.pivot);

    target.object.position.set(
      this.scratch.x,
      target.basePosition.y + lift,
      this.scratch.z,
    );
    target.object.rotation.set(
      target.basePitch + Math.sin(clock * 0.61) * float.tilt * drift,
      target.baseYaw + yaw,
      target.baseRoll + Math.cos(clock * 0.47) * float.tilt * drift,
    );
    target.object.updateMatrixWorld(true);
  }

  /** Stop every spring and put the wall back exactly where the GLB had it. */
  dispose(): void {
    this.hovered = null;
    for (const entry of this.animated.values()) {
      entry.steps.stop();
      entry.target.object.position.copy(entry.target.basePosition);
      entry.target.object.rotation.set(
        entry.target.basePitch,
        entry.target.baseYaw,
        entry.target.baseRoll,
      );
    }
  }
}
