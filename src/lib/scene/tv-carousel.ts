/**
 * @fileoverview The carousel of works — a ring of televisions, and the turning of it.
 *
 * **It is a ring, not a row.** Each member holds a fixed index on it, and what
 * moves is the ring's rotation; a member's *slot* is the signed distance from its
 * index to the front, wrapped into `±count/2`. Turning past the end therefore
 * wraps to the other side with no special case, no re-ordering and no list of
 * "which set is where" to keep in sync — and because the wrap happens at the
 * ring's far side, which is buried in the fog, it is never seen.
 *
 * The slot is a *continuous* number, so the rotation can sit on a spring and
 * every member slides to its new place together.
 *
 * 📖 Docs: obsidian/frontend/scene-3d.md
 */

import { SpringValue } from "@react-spring/web";
import {
  Euler,
  Raycaster,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
  type Object3D,
  type PerspectiveCamera,
  type Scene,
  type Texture,
} from "three";

import type { SceneCarouselConfig } from "@/lib/scene/config";
import { TvFlyer } from "@/lib/scene/tv-flyer";

const smoothstep = (t: number): number => t * t * (3 - 2 * t);
const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);

/**
 * Slot distances over which a member peels off the front arc and curves away
 * into the fog. Both ends of that curve meet at one point behind the ring, which
 * is what makes the wrap continuous.
 *
 * **Nothing on this curve is ever drawn** — `hideBeyond` stops at its start. The
 * curve compresses a twenty-unit run into one slot, so a set travelling it moves
 * a quarter of a unit per frame, which is a twitch rather than a motion.
 */
const CURVE_AWAY: [number, number] = [1.5, 2.5];

export class TvCarousel {
  private readonly config: SceneCarouselConfig;
  private readonly members: TvFlyer[];
  private readonly lifts: SpringValue<number>[];
  /** Where the front slot is measured from — the camera at the end of the flight. */
  private readonly origin: Vector3;
  /** Which way round the ring is turned; fractional while it is turning. */
  private readonly rotation: SpringValue<number>;
  private target = 0;
  private hovered = -1;

  private readonly raycaster = new Raycaster();
  private readonly place = new Vector3();
  private readonly cameraPosition = new Vector3();

  constructor(
    model: Object3D,
    scene: Scene,
    origin: Vector3,
    config: SceneCarouselConfig,
  ) {
    this.config = config;
    this.origin = origin.clone();
    this.members = config.members.map(
      (member) => new TvFlyer(model, scene, member, config.scale),
    );
    this.dressPacks();
    this.lifts = config.members.map(
      () => new SpringValue(0, { config: config.hover.spring }),
    );
    this.rotation = new SpringValue(0, { config: config.rotateSpring });
  }

  /**
   * Hang each member's own pack picture on it, where the ring asked for one.
   *
   * Loaded here rather than at start-up alongside the wall's clips: these are
   * five small stills for a section a visitor reaches only by scrolling, and
   * fetching them with the model would delay the first frame for a picture
   * nobody has come to yet. A member with no `packStill` is left alone and goes
   * on showing the clip it was cloned with.
   */
  private dressPacks(): void {
    const loader = new TextureLoader();
    this.config.members.forEach((member, index) => {
      const url = member.packStill;
      if (!url) return;
      const flyer = this.members[index];
      if (!flyer) return;
      loader.load(url, (texture: Texture) => {
        texture.colorSpace = SRGBColorSpace;
        // glTF UVs put their origin top-left; a loaded texture defaults the
        // other way, the same reason the wall's videos turn this off.
        texture.flipY = false;
        flyer.setPackStill(texture);
      });
    });
  }

  /** The set currently at the front of the ring. */
  get front(): TvFlyer | undefined {
    return this.members[this.activeIndex];
  }

  /**
   * The set the **last shot** is built on — always the same one.
   *
   * See `closingIndex`: the members are different televisions, and a shot
   * measured against whichever one the visitor left at the front is a different
   * shot every time.
   */
  get closing(): TvFlyer | undefined {
    return this.members[this.config.closingIndex] ?? this.members[0];
  }

  /** Index of the member at the front — what the page names and links to. */
  get activeIndex(): number {
    const count = this.members.length;
    return ((this.target % count) + count) % count;
  }

  /** @param step - `1` brings the next work to the front, `-1` the previous. */
  turn(step: number): void {
    this.target += step;
    this.rotation.start(this.target);
  }

  /**
   * @param progress - scroll progress, `0`–`1`.
   * @param square - `0`–`1`; the finale squaring the front set up to the lens.
   * @param interactive - whether hovering should lift anything at all.
   * @param aim - where the sets should face instead of the camera. The epilogue
   *   pulls the lens away sideways and wants the set to *keep* facing where it
   *   was, so the shot comes at it from a quarter on rather than head-on.
   * @param frontOnly - the last shot is one television; the rest of the ring is
   *   not part of it.
   * @param frontPlacement - world position for the staged set, overriding its
   *   slot on the ring. The last shot places it outright rather than nudging it,
   *   and **passing this switches which member counts as the hero**: the closing
   *   one rather than whichever the ring was left turned to.
   * @param frontSpin - extra world-axis turn for that set, radians.
   */
  update(
    camera: PerspectiveCamera,
    progress: number,
    square: number,
    time: number,
    interactive: boolean,
    aim: Vector3 | null = null,
    frontOnly = false,
    frontPlacement: Vector3 | null = null,
    frontSpin: Euler | null = null,
  ): void {
    const [from, to] = this.config.entrance;
    const span = Math.max(to - from, 0.001);
    camera.getWorldPosition(this.cameraPosition);
    const facing = aim ?? this.cameraPosition;


    // Whose shot this is. The ring's own acts belong to the set the visitor
    // turned to; the last one is always built on the same television.
    const hero =
      frontPlacement !== null ? this.config.closingIndex : this.activeIndex;

    this.members.forEach((member, index) => {
      const { delay } = this.config.members[index];
      // Every member finishes its entrance at the same moment; a later `delay`
      // only means a later start, so the assembly closes as one.
      const start = from + delay * span * 0.5;
      const entrance = (progress - start) / Math.max(to - start, 0.001);

      const slot = this.slotOf(index);
      const front = index === hero;
      const lift = interactive ? this.lifts[index].get() : 0;
      // Past `hideBeyond` it is on its way round the back of the ring, where the
      // wrap happens. The fog is already all but total there; not drawing it at
      // all is what makes "all but" moot — and the boundary sits at the start of
      // `CURVE_AWAY`, so the frame it appears and disappears on is a frame where
      // it is off the side of the window.
      // **The staged set is never hidden by its slot.** `slot` is measured from
      // whichever case the ring was turned to, and the last shot's television is
      // a fixed member — turn the ring a few times and that member is round the
      // back, past `hideBeyond`, so the shot lost its television (and with it
      // the only thing the figure reads as a silhouette against). Its slot means
      // nothing here: it is not standing on the ring, it has been placed.
      const staged = front && frontPlacement !== null;
      const hidden =
        !staged &&
        (Math.abs(slot) > this.config.hideBeyond || (frontOnly && !front));

      member.update(
        front && frontPlacement ? frontPlacement : this.positionOf(slot),
        facing,
        hidden ? 0 : clamp01(entrance),
        lift,
        front ? square : 0,
        time,
        front ? frontSpin : null,
      );
    });
  }

  /**
   * Raycast the ring and lift whatever is under the cursor.
   *
   * Its own pick rather than the wall's ([[tv-hover]]): these are clones living
   * outside the model, deliberately invisible to that one, and the ring has no
   * stacks to resolve — one set is one set.
   */
  pick(pointer: Vector2, camera: PerspectiveCamera, enabled: boolean): boolean {
    if (!enabled) {
      this.setHovered(-1);
      return false;
    }

    this.raycaster.setFromCamera(pointer, camera);
    const objects = this.members
      .map((member) => member.pickable)
      .filter((object): object is Object3D => object !== null && object.visible);

    const hit = this.raycaster.intersectObjects(objects, true)[0];
    if (!hit) {
      this.setHovered(-1);
      return false;
    }

    const index = objects.indexOf(this.rootOf(hit.object, objects));
    this.setHovered(index);
    return index >= 0;
  }

  /**
   * Does a ray through this point in NDC hit the set at the front?
   *
   * The closing shot's rule is cut to the set's real outline, and the projected
   * box it starts from is a box: it reaches past the casing by a few dozen
   * pixels at the height the rule crosses. A handful of these walks that gap in
   * and lands the rule on the actual silhouette.
   */
  frontHits(pointer: Vector2, camera: PerspectiveCamera): boolean {
    const object = this.closing?.pickable;
    if (!object?.visible) return false;
    this.raycaster.setFromCamera(pointer, camera);
    return this.raycaster.intersectObject(object, true).length > 0;
  }

  /**
   * Is the pointer on the set at the front — **without touching it**?
   *
   * `pick` lifts what it finds, which is right for a ring you are browsing and
   * wrong for the closing shot: that set has been placed by hand, and a hover
   * that raised it would undo the blocking. This answers the question and
   * changes nothing.
   */
  pickFront(pointer: Vector2, camera: PerspectiveCamera): boolean {
    const object = this.closing?.pickable;
    if (!object?.visible) return false;
    this.raycaster.setFromCamera(pointer, camera);
    return this.raycaster.intersectObject(object, true).length > 0;
  }

  dispose(): void {
    this.members.forEach((member) => member.dispose());
    this.lifts.forEach((lift) => lift.stop());
    this.rotation.stop();
  }

  /** Signed distance from this member's index to the front, wrapped. */
  private slotOf(index: number): number {
    const count = this.members.length;
    const raw = index - this.rotation.get();
    const wrapped = ((raw % count) + count) % count;
    return wrapped > count / 2 ? wrapped - count : wrapped;
  }

  /**
   * Where a slot stands, relative to the camera's resting place.
   *
   * A shallow arc across the front — `spread` apart, leaning `bulge` toward the
   * lens at the edges — that peels away past `CURVE_AWAY` and runs back to a
   * single point `fogDepth` behind the ring. Both ends of the ring meet at that
   * point, which is the whole trick: the wrap is continuous *and* invisible,
   * because the point is deep enough for the fog to have closed over it.
   */
  private positionOf(slot: number): Vector3 {
    const { center, spread, bulge, fogDepth } = this.config;
    const distance = Math.abs(slot);
    const away = smoothstep(
      clamp01((distance - CURVE_AWAY[0]) / (CURVE_AWAY[1] - CURVE_AWAY[0])),
    );

    const front = center[2] + bulge * slot * slot;
    const back = center[2] - fogDepth;

    return this.place
      .set(
        center[0] + spread * slot * (1 - away),
        center[1],
        front * (1 - away) + back * away,
      )
      .add(this.origin);
  }

  private setHovered(index: number): void {
    if (index === this.hovered) return;

    if (this.hovered >= 0) this.lifts[this.hovered].start(0);
    this.hovered = index;
    if (index >= 0) this.lifts[index].start(this.config.hover.lift);
  }

  /** Walk up from the hit mesh to whichever member owns it. */
  private rootOf(hit: Object3D, roots: Object3D[]): Object3D {
    let node: Object3D | null = hit;
    while (node && !roots.includes(node)) node = node.parent;
    return node ?? hit;
  }
}
