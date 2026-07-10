/**
 * @fileoverview One television on the carousel.
 *
 * It is a **clone** of one already in the wall, picked by the texture its screen
 * wears. Cloning shares the geometry and the material — including the video
 * texture — so a member costs one more draw call and nothing else: no second
 * decoder, no second upload, and it plays in sync with the one it came from.
 *
 * Its place is not configured. [[tv-carousel]] hands it a **slot** — a signed
 * distance from the front of the ring — every frame, and everything else follows
 * from that: where it stands, which way it faces, whether it is drawn at all.
 * The scroll's entrance blends from a point deep in the fog to wherever that
 * slot currently is, so turning the ring mid-entrance is not a special case.
 *
 * 📖 Docs: obsidian/frontend/scene-3d.md
 */

import {
  Box3,
  ClampToEdgeWrapping,
  Euler,
  Mesh,
  Object3D,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
  type MeshStandardMaterial,
  type Texture,
} from "three";

import type { TvFlyerConfig } from "@/lib/scene/config";

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);

/** The mesh inside `object` whose material wears `texture`, if any. */
const screenWearing = (object: Object3D, texture: string): Mesh | null => {
  let found: Mesh | null = null;

  object.traverse((child) => {
    if (found) return;
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;

    const material = (
      Array.isArray(mesh.material) ? mesh.material[0] : mesh.material
    ) as MeshStandardMaterial | undefined;
    if (material?.map?.name?.trim().toLowerCase() === texture) found = mesh;
  });

  return found;
};

/**
 * Which way a television faces: the average world-space normal of its screen.
 *
 * Derived rather than configured because the clone inherits whatever rotation it
 * had in the wall, where it was aimed at the middle of the room and not at the
 * camera; a correction guessed by eye would need re-guessing every time the model
 * moves. The first attempt used the offset between the screen's centre and the
 * set's — cheaper, and 180° wrong, because a CRT's bulk sits behind the glass and
 * drags the centre with it. Normals say which way the surface actually looks.
 */
export const facingOf = (screen: Mesh): number | null => {
  const normals = screen.geometry.getAttribute("normal");
  if (!normals) return null;

  const average = new Vector3();
  const sample = new Vector3();
  const step = Math.max(1, Math.floor(normals.count / 24));

  for (let i = 0; i < normals.count; i += step) {
    average.add(sample.fromBufferAttribute(normals, i));
  }

  screen.updateWorldMatrix(true, false);
  average.transformDirection(screen.matrixWorld).setY(0);
  return average.lengthSq() > 1e-6 ? Math.atan2(average.x, average.z) : null;
};

export class TvFlyer {
  private readonly config: TvFlyerConfig;
  private readonly scene: Scene;
  private readonly object: Object3D | null;
  /** The screen quad — what the finale's framing is measured against. */
  private readonly screen: Mesh | null = null;
  /**
   * The source's own rotation, **before** any turn toward the camera.
   *
   * A quaternion and not an Euler: three represents this model's node rotations
   * with `x` and `z` at π rather than as a plain turn about Y, so adding a yaw to
   * `rotation.y` and writing the three angles back flipped the set on its back.
   */
  private readonly baseQuaternion = new Quaternion();
  /** Which way the set looks in the wall, as a world yaw — the correction's base. */
  private readonly facing: number;
  private readonly start = new Vector3();
  private readonly slot = new Vector3();
  private readonly scratch = new Vector3();
  private readonly turn = new Quaternion();
  private readonly up = new Vector3(0, 1, 0);
  private readonly offsetRotation = new Euler();
  private readonly offsetQuaternion = new Quaternion();
  private readonly spinQuaternion = new Quaternion();
  /** This set's own screen material, cloned the first time a still is hung on it. */
  private ownMaterial: MeshStandardMaterial | null = null;
  /** What its glass was showing before — what `setScreenStill(null)` gives back. */
  private playing: Texture | null = null;
  /** And how hard it was lit, for the same reason. */
  private playingGlow = 1;
  /** The mirrored-back still, if this set needed one. */
  private flipped: Texture | null = null;
  /**
   * This set's own picture, if the ring gave it one — see `packStill`.
   *
   * It stands **in front of** `playing` rather than replacing it: the closing
   * shot dresses one of these sets and then undresses it again, and giving that
   * set back the wall's clip instead of its pack would drop a memcoin out of the
   * ring on the way back up the page.
   */
  private packStill: Texture | null = null;
  /** A still hung over the pack right now — the closing shot does this. */
  private dressed: Texture | null = null;
  /** Reused: the finale measures the screen every frame it is pushing in. */
  private readonly bounds = new Box3();
  private readonly measure = new Vector3();

  /**
   * @param model - the loaded GLB scene, searched for the source television.
   * @param scene - where the clone is added; it is not part of the model, so the
   *   wall's hover never picks it and its stacking never counts it.
   * @param scale - the carousel's sets are bigger than the wall's.
   */
  constructor(
    model: Object3D,
    scene: Scene,
    config: TvFlyerConfig,
    scale: number,
  ) {
    this.config = config;
    this.scene = scene;
    this.facing = 0;

    const texture = config.screenTexture.trim().toLowerCase();
    const found = model.children
      .map((child) => ({ child, screen: screenWearing(child, texture) }))
      .find((entry) => entry.screen !== null);

    if (!found?.screen) {
      console.error(
        `[tv-flyer] no television wears the texture "${config.screenTexture}"`,
      );
      this.object = null;
      return;
    }

    const { child: source, screen } = found;
    this.object = source.clone();
    this.object.scale.multiplyScalar(scale);
    this.baseQuaternion.copy(source.quaternion);
    this.facing = facingOf(screen) ?? 0;
    this.screen = screenWearing(this.object, texture);

    // Parked where its entrance begins — twenty units into the fog, which is
    // where `visible` is toggled and why the toggle is never seen.
    this.object.visible = false;
    scene.add(this.object);
  }

  /** The screen's glass in world units, `[width, height]`. */
  screenSize(): [number, number] {
    if (!this.screen) return [0, 0];
    this.screen.updateWorldMatrix(true, false);
    const size = this.bounds.setFromObject(this.screen).getSize(this.measure);
    // Squared up to the lens, the box's `x` is the width; measured off-axis it
    // would be spread across `x` and `z`, and the larger of the two is the one
    // that means anything.
    return [Math.max(size.x, size.z), size.y];
  }

  /** Where the screen's glass sits, in world space — the finale aims at this. */
  screenCentre(target: Vector3): Vector3 | null {
    if (!this.screen) return null;
    this.screen.updateWorldMatrix(true, false);
    return this.bounds.setFromObject(this.screen).getCenter(target);
  }

  /**
   * Hang a still on this set's glass — or `null` to give it its picture back.
   *
   * The clone shares its materials with the television in the wall (that is the
   * whole economy of a clone: one decoder, one upload, two draws), so the first
   * swap **clones the material** rather than writing to the shared one. Skipping
   * that would put the closing screen on the set in the wall as well, which is
   * the sort of thing only visible after you have scrolled back up.
   *
   * Both `map` and `emissiveMap`: these screens are light sources, and leaving
   * the emissive on the old picture makes the glass glow with an image it is no
   * longer showing.
   */
  setScreenStill(
    still: Texture | null,
    glow?: number,
    mirrored = false,
  ): void {
    if (!this.screen) return;
    const wanted = still ? this.facingCopy(still, mirrored) : null;

    if (!this.ownMaterial) {
      const shared = (
        Array.isArray(this.screen.material)
          ? this.screen.material[0]
          : this.screen.material
      ) as MeshStandardMaterial;
      this.ownMaterial = shared.clone();
      this.playing = shared.map ?? null;
      this.playingGlow = shared.emissiveIntensity;
      this.screen.material = this.ownMaterial;
    }

    // These screens are lit hard enough for the bloom to catch a picture that is
    // mostly dark. A **light** still on the same setting is a white rectangle
    // with the bloom eating whatever was printed on it, so a still may ask for
    // its own strength; taking it off restores the wall's.
    this.ownMaterial.emissiveIntensity =
      still && glow !== undefined ? glow : this.playingGlow;

    this.dressed = wanted;
    const map = wanted ?? this.packStill ?? this.playing;
    if (this.ownMaterial.map === map) return;
    this.ownMaterial.map = map;
    this.ownMaterial.emissiveMap = map;
    this.ownMaterial.needsUpdate = true;
  }

  /**
   * Give this set its own picture, in place of the clip it inherited.
   *
   * Goes through `setScreenStill`, so it takes the same care: the material is
   * cloned before anything is written, leaving the television in the wall
   * playing its video. Once set it is what the glass falls back to, so the
   * closing shot can dress this set and undress it again without the pack
   * disappearing.
   */
  /**
   * Give this set its own picture, in place of the clip it inherited.
   *
   * Goes through `setScreenStill`, so it takes the same care: the material is
   * cloned before anything is written, leaving the television in the wall
   * playing its video. Once set it is what the glass falls back to, so the
   * closing shot can dress this set and undress it again without the pack
   * disappearing.
   *
   * **The picture is hung as it comes, with no mirror correction.** The wall
   * needs one on some sets — half the televisions wind their UVs the other way
   * — but the ring turns each set to face the lens on its way in, and that
   * cancels it. Measured, not assumed: with a flip baked into three of the five
   * packs, exactly those three came up backwards and the two plain ones read
   * correctly.
   */
  setPackStill(still: Texture | null): void {
    this.packStill = still;
    this.setScreenStill(null);
  }


  /**
   * Does this set's glass show its texture **mirrored**, seen from `camera`?
   *
   * Several televisions in the wall are copies of their neighbours turned or
   * flipped to fill it out, and a clone inherits whatever was done to the
   * original. Noise and abstract footage do not care. A picture with **words on
   * it** does — turn the ring by one and the closing screen read
   * `tɔejorꟼ a tratꙄ`.
   *
   * Asked of the **image**, not of the transform. A negative scale was only one
   * of the ways to get here (and, as it turned out, not the one this model uses:
   * the sets that read backwards have a perfectly ordinary positive determinant),
   * and every other way — a quad wound the other way, a mirrored UV island, a
   * turn that presents the back of the glass — is invisible to a matrix test.
   * What is *not* invisible is handedness on screen: take a triangle of the
   * screen's own vertices, project it, and compare which way it winds in NDC
   * with which way the same three points wind in UV space. If the two disagree,
   * the picture is coming out reversed, whatever the reason.
   */
  screenReadsMirrored(camera: PerspectiveCamera): boolean | null {
    const geometry = this.screen?.geometry;
    const uv = geometry?.getAttribute("uv");
    const position = geometry?.getAttribute("position");
    if (!this.screen || !uv || !position || uv.count < 3) return null;

    // Three vertices that make a real triangle in UV space — a strip of the
    // quad's own edge would give a degenerate one and a meaningless sign.
    const u0 = uv.getX(0);
    const v0 = uv.getY(0);
    let a = -1;
    let b = -1;
    for (let i = 1; i < uv.count; i += 1) {
      const du = uv.getX(i) - u0;
      const dv = uv.getY(i) - v0;
      if (a < 0 && Math.abs(du) > 0.3) a = i;
      if (b < 0 && Math.abs(dv) > 0.3) b = i;
      if (a >= 0 && b >= 0) break;
    }
    if (a < 0 || b < 0) return null;

    const uvCross =
      (uv.getX(a) - u0) * (uv.getY(b) - v0) -
      (uv.getY(a) - v0) * (uv.getX(b) - u0);
    if (Math.abs(uvCross) < 1e-6) return null;

    this.screen.updateWorldMatrix(true, false);
    const screenOf = (index: number, into: Vector3): Vector3 =>
      into
        .fromBufferAttribute(position, index)
        .applyMatrix4(this.screen!.matrixWorld)
        .project(camera);

    const p0x = screenOf(0, this.scratch).x;
    const p0y = this.scratch.y;
    const pax = screenOf(a, this.scratch).x;
    const pay = this.scratch.y;
    const pbx = screenOf(b, this.scratch).x;
    const pby = this.scratch.y;

    const screenCross =
      (pax - p0x) * (pby - p0y) - (pay - p0y) * (pbx - p0x);
    if (Math.abs(screenCross) < 1e-9) return null;

    // NDC's y runs up and UV's runs down, so a *matching* pair of windings is
    // already one flip apart. Same sign is the mirrored case.
    return Math.sign(screenCross) === Math.sign(uvCross);
  }

  /** The still as this set will show it — reversed back if the set reverses it. */
  private facingCopy(still: Texture, mirrored: boolean): Texture {
    if (!mirrored) return still;

    if (!this.flipped || this.flipped.source !== still.source) {
      this.flipped?.dispose();
      const copy = still.clone();
      copy.wrapS = ClampToEdgeWrapping;
      copy.repeat.x = -1;
      copy.offset.x = 1;
      copy.needsUpdate = true;
      this.flipped = copy;
    }
    return this.flipped;
  }

  /** The object, for the carousel's own hover raycast. */
  get pickable(): Object3D | null {
    return this.object;
  }

  /**
   * @param slot - where the ring currently holds it, as a world position.
   * @param entrance - `0`–`1`, its own share of the scroll's entrance.
   * @param lift - how far the hover has raised it, world units.
   * @param square - `0`–`1`; `1` turns it dead square to the camera and stills
   *   its drift, which is what the finale needs of the front set.
   * @param time - seconds, for the drift once it has arrived.
   * @param spin - extra turn in **world** axes, radians, on top of everything
   *   else. The last shot uses it to angle the set by hand.
   */
  update(
    slot: Vector3,
    camera: Vector3,
    entrance: number,
    lift: number,
    square: number,
    time: number,
    spin: Euler | null = null,
  ): void {
    if (!this.object) return;

    // Not drawn at all until its share of the scroll opens. Belt and braces over
    // the fog — the haze is what *should* be hiding it, but a dark set against a
    // lit sky still ghosts through 3% of transmittance, and the first scene is
    // where that showed. Safe to toggle because it happens while the set is
    // twenty-odd units deep in the murk, and safe for the shader cache because
    // the material is the wall original's, still being drawn.
    this.object.visible = entrance > 0;
    if (!this.object.visible) return;

    const { startRotation, arc, float } = this.config;
    // **Linear.** These used to ease in and out of their entrance, which put a
    // slow-down in the middle of the scroll for every set that had already
    // arrived; the sets are staggered by `delay`, so the row still reads as one
    // continuous move without a curve doing it.
    const t = clamp01(entrance);

    this.slot.copy(slot);
    this.start.copy(this.slot).add(this.scratch.fromArray(this.config.fromOffset));
    this.object.position.copy(this.start).lerp(this.slot, t);
    // An arc rather than a straight line: it swings out on the way and comes
    // back, which is what makes the flight read as a flight.
    this.object.position.x += Math.sin(t * Math.PI) * arc;

    // The drift only exists once it has arrived, so the two motions never fight,
    // and the finale stills it so the last shot is not a wobbling screen.
    const clock = time * float.speed;
    const settled = t * t * (1 - square);

    this.object.position.y += Math.sin(clock) * float.amplitude * settled + lift;

    // Turned to face the camera from wherever the ring is holding it. Derived
    // every frame rather than baked at construction: the slot moves.
    const toCamera = this.scratch
      .subVectors(camera, this.object.position)
      .setY(0);
    const aim =
      toCamera.lengthSq() > 1e-6
        ? Math.atan2(toCamera.x, toCamera.z) - this.facing
        : -this.facing;

    this.offsetRotation.set(
      this.lerpAngle(startRotation[0], 0, t) +
        Math.sin(clock * 0.61) * float.tilt * settled,
      this.lerpAngle(startRotation[1], 0, t) +
        Math.sin(clock * 0.83) * float.yaw * settled,
      this.lerpAngle(startRotation[2], 0, t) +
        Math.cos(clock * 0.47) * float.tilt * settled,
    );
    this.object.quaternion
      .copy(this.baseQuaternion)
      .premultiply(this.turn.setFromAxisAngle(this.up, aim))
      .premultiply(this.offsetQuaternion.setFromEuler(this.offsetRotation));

    if (spin) {
      this.object.quaternion.premultiply(
        this.spinQuaternion.setFromEuler(spin),
      );
    }
  }

  /** Overshoot the turn slightly mid-flight, so the angle keeps changing. */
  private lerpAngle(from: number, to: number, t: number): number {
    const swing = Math.sin(t * Math.PI) * 0.12 * (1 - t);
    return from + (to - from) * t + swing;
  }

  dispose(): void {
    if (!this.object) return;
    this.scene.remove(this.object);
    // Geometry and materials are shared with the wall's original — disposing
    // them here would strip the television this was cloned from.
    this.object.clear();
    // Only ever *this* set's — the shared original is the wall's and stays.
    this.ownMaterial?.dispose();
    this.ownMaterial = null;
    this.flipped?.dispose();
    this.flipped = null;
  }
}
