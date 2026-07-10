/**
 * @fileoverview Configuration for the 3D scene.
 *
 * Single source of the scene's tuning numbers — camera framing, pointer
 * parallax, lighting — mirroring the role `lib/springs/config.ts` plays for the
 * spring components. Scene components take these as prop defaults so a value is
 * never duplicated across files.
 *
 * 📖 Docs: obsidian/frontend/scene-3d.md
 */

export interface SceneCameraConfig {
  /** Rig position in world units — behind and slightly above the figure. */
  position: [number, number, number];
  /** Base tilt of the camera inside the rig (radians, negative looks down). */
  pitch: number;
  /** Vertical field of view (degrees). */
  fov: number;
  near: number;
  far: number;
}

export interface PointerSpringConfig {
  mass: number;
  tension: number;
  friction: number;
}

export interface PointerParallaxConfig {
  /** Yaw added at the horizontal edge of the viewport (radians). */
  maxYaw: number;
  /** Pitch added at the vertical edge of the viewport (radians). */
  maxPitch: number;
  /** Heavy, soft spring — the camera drifts after the cursor, never snaps. */
  spring: PointerSpringConfig;
}

export interface TvHoverConfig {
  /** How far a hovered television rises per step, in world units. */
  lift: number;
  /** How far it turns about its own footprint centre (radians). */
  yaw: number;
  /** Rising. Damped past 1 — an overshoot here reads as a bounce, not as life. */
  spring: PointerSpringConfig;
  /** Settling back. Softer than the rise, so switching away is the quiet half. */
  release: PointerSpringConfig;
  /** Delay per step up the stack (ms) — the column rises as a cascade. */
  stagger: number;
  /** The drift a raised television keeps while it hangs there. */
  float: TvFloatConfig;
  stack: {
    /** Vertical gap between two boxes still counted as "resting on". */
    gap: number;
    /** Share of the smaller footprint two boxes must share to be one stack. */
    overlap: number;
  };
}

export interface TvFloatConfig {
  /** Bob height, world units. */
  amplitude: number;
  /** Bob speed, radians per second. */
  speed: number;
  /** Yaw the television swings through while it hangs (radians). */
  yaw: number;
  /** Roll and pitch it tips through (radians) — the drift is never flat. */
  tilt: number;
}

export interface SceneFogConfig {
  color: string;
  /**
   * `exp2` thickens with distance from the camera and has no start — the haze
   * begins at the lens. `linear` is the one with a shift: nothing is hazy before
   * `near`, everything is gone by `far`.
   */
  mode: "exp2" | "linear";
  /** `exp2` only. */
  density: number;
  /** `linear` only — where the haze starts and where it is total. */
  near: number;
  far: number;
}

export interface SceneEnvironmentConfig {
  /**
   * Vertical background gradient, top → bottom. **The bottom colour must match
   * the fog**: fog never touches the background, so where the floor ends the sky
   * behind it has to already be the colour the floor faded into.
   */
  backgroundGradient: [string, string];
  /** Where the gradient flattens out, `0`–`1` down the frame. */
  backgroundHorizon: number;
  /** Directional key light — the only real light in the scene (IBL does the rest). */
  keyLight: {
    position: [number, number, number];
    intensity: number;
    color: string;
  };
  /** Strength of the PMREM'd RoomEnvironment image-based light. */
  environmentIntensity: number;
  /** ACES tone-mapping exposure. */
  exposure: number;
  /** Haze — what turns a lit room into an atmosphere. */
  fog: SceneFogConfig;
  /** The floor the model ships is white; the reference room's is not. */
  floorColor: string;
  /**
   * The model's floor is barely wider than the wall of televisions, so its far
   * edge sits well inside the haze and draws a line where it meets the sky.
   * Stretched until that edge is past the distance the fog has gone opaque.
   */
  floorScale: number;
  /** Screens as light sources: the video doubles as an emissive map. */
  screenGlow: number;
  /** Coloured spill from the wall of screens onto the figure and the floor. */
  spillLights: Array<{
    position: [number, number, number];
    color: string;
    intensity: number;
    distance: number;
  }>;
}

export interface SceneBloomConfig {
  strength: number;
  radius: number;
  /** Only pixels brighter than this bloom. Above the room, below the screens. */
  threshold: number;
  /**
   * How soft the threshold's edge is.
   *
   * `UnrealBloomPass` clips at the threshold by default (`smoothWidth` `0.01`),
   * which hands the blur a **hard-edged** cut-out of the bright parts: what comes
   * back is a rim tracing the screen rather than a glow spilling off it. Widening
   * the knee fades pixels in as they approach the threshold, which is the
   * difference between an outline and a bloom.
   */
  knee: number;
  /**
   * How much of the two **sharpest** blur levels is kept, `0`–`1`.
   *
   * `UnrealBloomPass` adds five blurred copies of the bright parts, from
   * half-resolution to a thirty-second of it. The sharp ones are barely blurred
   * at all, so what they contribute is a bright fringe hugging the screen's
   * edge — an outline drawn around the glass, which is what this reads as no
   * matter how the threshold and the radius are set. `0` drops them and leaves
   * only the wide, low levels, which is the part that actually looks like light
   * in a room.
   */
  fine: number;
  /** Mobile keeps the look but halves the cost of it. */
  mobileScale: number;
}

export interface SceneDepthOfFieldConfig {
  /** Resting distance from the camera that stays sharp, world units. */
  focus: number;
  /** Wider aperture, shallower focus — this is what softens the figure. */
  aperture: number;
  /**
   * Ceiling on the blur radius, in **pixels of the page**.
   *
   * three's `BokehShader` is a fixed 41-tap ring pattern and its `maxblur` is in
   * UV, which makes the taps spread wider the bigger the window is. Past roughly
   * ten pixels of radius they stop overlapping and a defocused edge comes apart
   * into ghost copies of itself — the same defect the dust had, from the same
   * shader. In UV that threshold is a different number on every display, which
   * is why the artefact showed on a large browser window and not in a small
   * preview pane; in pixels it is one number that holds everywhere.
   */
  maxBlur: number;
  /**
   * Hovering a television pulls focus onto it and lets it go on the way out —
   * a rack focus, on a spring so it eases rather than snaps.
   */
  focusSpring: PointerSpringConfig;
}

export interface SceneScrollConfig {
  /**
   * How far the camera travels along its own axis over the whole scroll.
   * Negative flies **forward**, into the room.
   *
   * Long enough to come out the **far side** of the wall: stopping among the
   * sets left the opening scene's televisions still in frame behind the
   * carousel, which read as two rooms overlaid rather than one flight.
   */
  dolly: number;
  /**
   * How far it climbs while doing so. `0` keeps the flight dead level — which is
   * what the shot wants, and what makes `figureFade` necessary: level and
   * forward is a course straight through the figure standing a metre ahead.
   */
  rise: number;
  /**
   * Share of the scroll the flight itself runs over, `[from, to]`.
   *
   * It ends well before the scroll does: the carousel needs a stretch where the
   * camera is still and its buttons are worth pressing, and the finale needs
   * what is left.
   */
  flight: [number, number];
  /**
   * Where the flight changes gear: `travel` (share of the dolly) is covered in
   * `at` (share of the flight's scroll), and the rest of the scroll crawls what
   * is left.
   *
   * One easing across the whole flight spends nearly all of the scroll among the
   * televisions and crosses the empty corridor past them in a blink — which is
   * why the two lines standing in that corridor **appeared** rather than lifting
   * out of the fog. The corridor is only five units long and cannot be made
   * longer (the ring is placed off the end of the dolly, and the last shot is
   * blocked in world coordinates against it), so the answer is to spend the
   * scroll differently: through the room quickly, along the corridor slowly.
   *
   * **Both halves are linear.** They were smoothstepped, which meant the lens
   * came to a complete stop at `at` and set off again — an ease that reaches zero
   * velocity at both ends of both legs is a stop in the middle of the flight.
   * Straight legs leave a change of *speed* there instead, which is what the
   * split was always for: the lens slows as it leaves the room for the corridor.
   * The numbers are unchanged, because the two lines standing in that corridor
   * are timed against them.
   */
  flightSplit: { at: number; travel: number };
  /**
   * Progress range over which the figure dissolves, `[from, to]`.
   *
   * The lens passes through it on the way down the room. Fading it beats
   * steering around it: any detour that clears a body at arm's length is a
   * detour the eye reads as the camera flinching.
   *
   * It has to be **finished before the lens gets there**, which is a function of
   * `dolly` — a longer flight covers the metre to the figure in a smaller share
   * of the scroll, so lengthening the one means pulling this window earlier.
   */
  figureFade: [number, number];
  /**
   * Progress range over which the lens stops defocusing at all, `[from, to]`.
   *
   * The rack focus is the **opening shot's** effect — the answer to a cursor
   * moving over a wall of screens. Once the flight has left that room there is
   * nothing to rack to, and a defocus still running only softens acts that want
   * to be sharp. The bokeh pass keeps rendering (the dust reads its depth); this
   * closes its blur ceiling.
   */
  focusFade: [number, number];
  /** Sky's top colour at the end of the scroll; the bottom stays the fog's. */
  skyTop: string;
  /**
   * @deprecated The low-pass moved to `lib/animation/scroll-progress.ts`, so the
   * scene, the panels and the copy over them all ease on **one** filter — two
   * filters at different rates is what the scroll catching was. Kept only
   * because the tuning panel's config snippet still prints them.
   */
  smoothing: number;
  snapAbove: number;
  /**
   * The televisions that fly in and arrange themselves in front of the camera —
   * the portfolio carousel.
   */
  carousel: SceneCarouselConfig;
  /**
   * The stretch where the team block slides up over the room.
   *
   * It used to be a push-in: the centre screen squared up to the lens, its
   * picture turned to noise and the camera drove into it until the glass was the
   * whole frame. The zoom is gone — the block covering the room is the
   * transition now — but the act stays, because the framing it works out (where
   * the glass is, how far off it a lens would have to stand) is the anchor the
   * epilogue pulls back from.
   */
  finale: SceneFinaleConfig;
  /** What is on the other side of the black the finale ends on. */
  epilogue: SceneEpilogueConfig;
}

/**
 * The shot the black opens onto — the figure again, close and from behind, with
 * one television at its shoulder.
 *
 * Every offset is measured from the **front screen's own centre**, because that
 * is what the camera is already looking at when the black lifts: the shot is a
 * pull-back from the picture the finale pushed into, not a cut to somewhere
 * else. Nothing is staged and nothing moves until the black is total, so the
 * figure being carried across the room to stand in it is never seen.
 */
export interface SceneEpilogueConfig {
  /**
   * Share of the scroll the scene is **covered** for, and stages itself in. The
   * panels over it are what the stretch is for; nothing here may be visible,
   * which is why the staging has to be finished by the end of it.
   */
  hold: [number, number];
  /** Share of the scroll the camera pulls back over, as the last panel clears. */
  reveal: [number, number];
  /** Where the camera ends, relative to the front screen's centre. */
  cameraOffset: [number, number, number];
  /**
   * The window shape the blocking was framed for.
   *
   * Everything sideways in this shot — how far off the set's axis the lens
   * stands, where the figure is at the edge — is scaled by how the real window
   * compares to this. A frame's height is fixed by the field of view but its
   * width is not, so offsets that read as "at the left edge" on one shape read
   * as "off frame" on a narrower one.
   */
  referenceAspect: number;
  /**
   * How much of the window's shape the figure's own offset follows, `0`–`1`.
   *
   * He stands a metre from the lens at the left edge, which makes him the most
   * shape-sensitive thing in the shot: the frame's width changes with the aspect
   * while his distance from it does not, so the numbers that put him at the edge
   * on the design's window put him **off** a narrower one. At `1` his distance
   * from the lens scales with the frame exactly and the blocking holds its shape
   * on any window; at `0` it is the raw world offset, which is what shipped and
   * lost him on laptops.
   */
  figureFollowsFrame: number;
  /**
   * How far left the figure is pushed on windows narrower than the design's, in
   * world units per unit of missing width.
   *
   * Holding his screen position is the right rule between about 1:1 and 21:9. It
   * can stop being one on a phone, where the frame is a third as wide and "the
   * same place in frame" can mean standing in front of the television; below the
   * design shape this walks him toward the edge instead.
   *
   * **Zero at the current blocking** — measured, not assumed: with him standing
   * where he does now, a phone already keeps both his silhouette and the screen
   * that carries the words. The knob stays because the next blocking may not be
   * so lucky, and finding it again from scratch is an afternoon.
   */
  figurePortraitBias: number;
  /**
   * How far the horizon is thrown off level (radians).
   *
   * A deliberate dutch tilt — the shot is unsettled by design, and a level
   * horizon reads as a product photo rather than as the end of the story. It is
   * also **the only thing this act does to the framing**: the pitch, the borrowed
   * lamps and the lifted figure and floor colours all went, because the brief is
   * that the last shot reads as the first one.
   */
  roll: number;
  /**
   * Where the television stands, in **world** coordinates: at the start of the
   * reveal and at the end of it. Equal means it holds still while the lens pulls
   * back, which is what the shot does today.
   *
   * World, not relative to anything, because this is a blocking: the numbers are
   * meant to be dragged in the tuning panel and read back out, and an offset from
   * a frame that is itself moving is not a coordinate anyone can reason about.
   * `y` is *measured*, not chosen — it is where the set's own lowest point rests
   * on the room's floor.
   */
  television: TvEpilogueTrack;
  /** Same for the figure, at its feet. */
  figure: TvEpilogueTrack;
}

/**
 * The carousel is a **ring**, not a row.
 *
 * Every set has a fixed place on it and the ring turns; a set's slot is its
 * signed distance from the front, wrapped into `±count/2`, so turning past the
 * end wraps to the other side with no special case and no re-ordering. The far
 * side of the ring is buried in the fog, which is where that wrap happens and
 * why it is never seen.
 */
export interface SceneCarouselConfig {
  /** Where the front slot sits, relative to the camera at the end of the flight. */
  center: [number, number, number];
  /** Distance between neighbouring slots across the front of the ring. */
  spread: number;
  /** How far a slot leans toward the lens per slot², world units — the arc. */
  bulge: number;
  /**
   * How far behind the front the ring's far side runs. Deep enough that the fog
   * has swallowed it: this is where a set crosses from one end to the other.
   */
  fogDepth: number;
  /** Uniform scale on every clone — the wall's sets are small for a hero. */
  scale: number;
  /**
   * Slot distance past which a set is not drawn at all.
   *
   * **Must not exceed the start of the curve-away** (1.5, in `tv-carousel.ts`).
   * Drawing a set that has begun curving is what made the edges twitch on every
   * turn: the curve packs a twenty-unit run into one slot, so a set on it covers
   * a quarter of a unit per frame — and because it hides and shows on a boolean,
   * it did that appearing and disappearing mid-frame. Held at the start of the
   * curve, a set is at x ≈ 4.5 on a straight line when it goes, which is off the
   * side of the window on anything narrower than about 21:9.
   */
  hideBeyond: number;
  /** Share of the scroll the entrance from the fog runs over, `[from, to]`. */
  entrance: [number, number];
  /** How the ring turns when a button is pressed. */
  rotateSpring: PointerSpringConfig;
  /** Hovering a set in the carousel lifts it, the way the wall's do. */
  hover: { lift: number; spring: PointerSpringConfig };
  /** Order is the order they sit on the ring, front slot first. */
  members: TvFlyerConfig[];
  /**
   * Which member the **last shot** is built on, as an index into `members`.
   *
   * Fixed, and not "whichever the ring was left turned to". The sets are not
   * interchangeable: they are different televisions, with glass of different
   * sizes and shapes, and the epilogue's whole blocking — how far the lens
   * stands off, where that leaves the figure, whether the closing picture fits
   * the screen it is hung on — is measured against one of them. Left on the live
   * front, the closing shot came out differently for every case a visitor
   * happened to stop on: the picture cropped on the widescreen set, the figure
   * somewhere else in the frame each time.
   */
  closingIndex: number;
}

export interface SceneFinaleConfig {
  /** Share of the scroll it runs over, `[from, to]`. */
  range: [number, number];
  /**
   * How much of the frame the screen fills at the end. `1` is exactly the
   * frame's height; past that the edges are outside it, which is what stops a
   * sliver of room showing along the sides.
   */
  fill: number;
  /**
   * Share of the finale the black fades in over, `[from, to]`.
   *
   * Under the team block rather than instead of it: the block is opaque and
   * covers the frame, and this only guarantees that nothing of the staging
   * behind it leaks at an aspect the block does not quite fill.
   */
  blackFade: [number, number];
}

export interface TvEpilogueTrack {
  /** World position, start of the reveal → end of it. */
  position: { from: Triple; to: Triple };
  /**
   * Rotation offsets in **radians**, on the same two ends.
   *
   * Offsets, not absolutes, and applied in **world** axes on top of whatever the
   * subject is already doing — the television is aimed at the lens by its own
   * screen normals, and the figure carries an FBX conversion in its Eulers. `y`
   * therefore always means "turn about the room's vertical", which is the only
   * reading anyone tuning a blocking wants.
   */
  rotation: { from: Triple; to: Triple };
}

/** A world position or an Euler triple, as the config writes one. */
export type Triple = [number, number, number];

export interface TvFlyerConfig {
  /**
   * Which television is cloned: the one whose screen wears this texture. Named
   * rather than numbered so a re-export can move it without touching code.
   */
  screenTexture: string;
  /**
   * A picture to hang on **this set's glass only**, replacing whatever the
   * television it was cloned from is playing.
   *
   * Optional; without it the clone keeps showing the wall's clip, which is what
   * every set did before the ring started carrying a pack of its own. The swap
   * clones the material first, so the set in the wall is untouched — see
   * `TvFlyer.setPackStill`.
   *
   * Two things depend on **which set this member clones**, and both are baked
   * into the file rather than handled at runtime.
   *
   * The **shape**: the glass on these sets is near-square (1.00 to 1.11), not
   * 4:3. A 4:3 picture stretched onto it is squeezed sideways and its edges run
   * under the bezel, which is what made some packs sit differently from others.
   * Each file is drawn on a canvas of its own set's aspect, art fitted inside.
   *
   * The **mirror**: it inherits the closing shot's requirement of being
   * **pre-mirrored for the mesh it lands on**, exactly like the
   * wall clips in `data/mocks/home.ts`. Screens 10 and 14 wind their UVs the
   * other way and need it; 6, 11 and 13 do not. Check which screen a member really clones — the clip name maps to a screen through screenVideoOverrides, and assuming it was screen 4 shipped the dearest pack backwards. The ring does *not* cancel this —
   * an earlier build assumed it did, and shipped two of the five backwards.
   */
  packStill?: string;
  /**
   * Where it starts, relative to its slot — **deep behind it**, far enough back
   * that the fog has gone opaque over the distance to the opening camera. That
   * is what keeps the carousel out of the first scene, and it means every set
   * arrives by coming *at* the lens out of the haze rather than dropping in from
   * off-frame.
   */
  fromOffset: [number, number, number];
  /** Rotation offsets from the set's own at the start of the entrance, radians. */
  startRotation: [number, number, number];
  /** Sideways swing at the middle of the flight — the arc, in world units. */
  arc: number;
  /**
   * Share of the entrance window it waits out before moving, `0`–`1`. The
   * carousel assembles piece by piece rather than snapping into place.
   */
  delay: number;
  /** The drift it keeps once it has arrived. */
  float: TvFloatConfig;
}

export interface SceneDustConfig {
  /** Motes on the desktop tier; the mobile tier gets `mobileShare` of them. */
  count: number;
  mobileShare: number;
  /**
   * Half-extent of the box they fill, world units, centred on the room. Deep
   * enough along `z` to cover the whole of the scroll's flight — a box that only
   * spans the opening shot empties out as the camera leaves it.
   */
  area: [number, number, number];
  /**
   * Point size in pixels at one world unit from the lens — small, because the
   * cloud reads as dust by being *many* discs rather than a few large ones.
   */
  size: number;
  color: string;
  opacity: number;
  /** How far a mote wanders from its home, and how fast. */
  drift: number;
  speed: number;
}

/**
 * One line standing in the room, for the camera to fly through.
 *
 * The strings and their placement are content, so they arrive as props from
 * `data/mocks/home.ts`; only the look of them lives here.
 */
export interface SceneSignConfig {
  text: string;
  /** World position of the line's centre. */
  position: [number, number, number];
  /** Em height in world units. */
  size: number;
  /**
   * This line's own `[appear, full]`, in world units ahead of the lens.
   *
   * Per line rather than shared, because **the two must not arrive together**:
   * the near one lifts out of the fog first and the far one follows as it goes
   * past. Falls back to `signs.fadeIn`.
   */
  fadeIn?: [number, number];
}

export interface SceneSignsConfig {
  color: string;
  /**
   * How far ahead of the lens a line appears and reaches full strength, world
   * units. Measured as distance rather than scroll so a line is faded out of
   * the opening shot by simply being further off than `[0]`.
   */
  fadeIn: [number, number];
  /** Where it starts letting go as the lens arrives, and where it is gone. */
  fadeOut: [number, number];
  /**
   * Camera **Z** over which the lines are allowed to show at all, `[shut, open]`.
   *
   * Distance alone is not enough: a line lifts out of the fog six units ahead,
   * and six units ahead of the wall is still inside it — the first build had the
   * near line reading across a frame full of televisions. The wall's last row is
   * at z ≈ −4.6, so nothing appears until the lens is past it, and the gate is a
   * ramp rather than a threshold so it opens without a pop.
   */
  clearOf: [number, number];
  /** Ceiling on the fade — these are printed on the air, not lit signs. */
  opacity: number;
}

export interface SceneCrtConfig {
  /**
   * How dark the scanlines are, `0`–`1`. One line every two device pixels — this
   * is the amount taken out of the dark half, and it belongs near the floor of
   * what the eye can see.
   */
  scanline: number;
  /**
   * How many of them there are down the frame — a **count**, the way a tube has
   * a line count, not a pitch in pixels.
   *
   * A pitch is a fixed number of pixels however big the window is, so the lines
   * shrink against the picture as the window grows: right on a small preview
   * pane and invisible on a full display, which is exactly how this was first
   * reported. A count keeps them the same share of the frame everywhere. It is
   * capped in the shader so the pitch never falls under ~2 px of the page, which
   * is where lines turn into moiré.
   */
  scanCount: number;
  /** How far the tube's corners fall off, `0`–`1`. */
  vignette: number;
  /** Brightness of the band drifting down the picture. */
  roll: number;
  /** How fast that band drifts, screens per second. */
  rollSpeed: number;
  /** Colour fringing at the corners, in UV — a fraction of the frame's width. */
  chroma: number;
}

export interface SceneGrainConfig {
  /** `0`–`1`; film grain over the finished frame. */
  intensity: number;
}

export interface SceneConfig {
  camera: SceneCameraConfig;
  parallax: PointerParallaxConfig;
  hover: TvHoverConfig;
  environment: SceneEnvironmentConfig;
  bloom: SceneBloomConfig;
  depthOfField: SceneDepthOfFieldConfig;
  grain: SceneGrainConfig;
  /** The glass the whole page is seen through — see `lib/scene/tv-crt.ts`. */
  crt: SceneCrtConfig;
  dust: SceneDustConfig;
  /** Look of the lines the flight passes through — see `lib/scene/tv-signs.ts`. */
  signs: SceneSignsConfig;
  scroll: SceneScrollConfig;
  /** Device-pixel-ratio clamp `[min, max]` — a 3× screen renders 9× the fragments. */
  dpr: [number, number];
}

export const sceneConfig: SceneConfig = {
  camera: {
    // The GLB puts the figure at z ≈ 4.6 facing −Z with its head at y ≈ 1.47;
    // the rig sits just behind its shoulders, framing the TV wall beyond.
    position: [0, 1.42, 5.6],
    pitch: -0.105,
    fov: 40,
    near: 0.1,
    far: 60,
  },
  parallax: {
    maxYaw: 0.2, // ≈ 11°
    maxPitch: 0.115, // ≈ 6.6°
    spring: { mass: 1.4, tension: 90, friction: 34 },
  },
  hover: {
    lift: 0.26,
    yaw: 0.14, // ≈ 8°
    // Damping ratios 1.06 and 1.24 — neither overshoots, so a fast sweep across
    // the wall never stacks bounce on top of bounce.
    spring: { mass: 1, tension: 150, friction: 26 },
    release: { mass: 1, tension: 110, friction: 26 },
    stagger: 45,
    float: { amplitude: 0.075, speed: 1.05, yaw: 0.07, tilt: 0.05 },
    stack: { gap: 0.22, overlap: 0.3 },
  },
  environment: {
    // A dark room, faintly cool at the top — everything visible in the frame is
    // lit by the screens themselves.
    // Bottom stop is the fog colour, on purpose — see the type above.
    backgroundGradient: ["#aad4d5", "#17242c"],
    backgroundHorizon: 0.45,
    keyLight: { position: [3.5, 6, 5], intensity: 1.09, color: "#9fc4d6" },
    environmentIntensity: 0.2,
    exposure: 0.8,
    // Lifted off black on purpose: a pure-black figure needs something behind it
    // to be a silhouette against.
    fog: {
      color: "#17242c",
      mode: "exp2",
      density: 0.075,
      // Only read in `linear` mode; kept here so switching in the panel starts
      // somewhere sensible — clear to just past the figure, gone by the far wall.
      near: 2,
      far: 16,
    },
    floorColor: "#0b0f13",
    floorScale: 3,
    screenGlow: 1.44,
    // Three lamps, not fifteen: every real-time light multiplies the fragment
    // cost of every material. Two cool ones from the flanking stacks, one warm
    // accent low on the left, matching the reference's single warm screen.
    // In the clear band between the figure and the front row (z ≈ 3.2), never
    // among the sets. Standing inside the wall — where these used to be — meant
    // any television that lifted or drifted near one caught a blown-out patch,
    // which the bloom then spread into a coloured blob.
    spillLights: [
      { position: [-2.8, 1.6, 3.2], color: "#5fd8ff", intensity: 4.5, distance: 9 },
      { position: [2.8, 1.7, 3.0], color: "#7fe0ff", intensity: 4, distance: 9 },
      { position: [-2.9, 0.6, 3.6], color: "#ff7a3c", intensity: 3.2, distance: 7 },
    ],
  },
  // The threshold is what makes this a *bloom* and not a veil: it has to sit
  // above the room and below the screens, so only the screens are picked up.
  // Letting everything through — which is what a threshold near zero does — and
  // compensating with a low strength was tried at length, and lifts the blacks
  // across the whole frame instead.
  bloom: {
    strength: 0.18,
    radius: 1,
    threshold: 0.6,
    knee: 0.45,
    fine: 0,
    mobileScale: 0.5,
  },
  // The figure stands ~1 unit from the camera and the wall 3–10 behind it, so
  // focusing past it is what leaves it soft.
  depthOfField: {
    focus: 5.25,
    aperture: 0.0032,
    maxBlur: 22,
    focusSpring: { mass: 1.2, tension: 110, friction: 30 },
  },
  grain: { intensity: 0.3 },
  // Deliberately under the threshold of notice: the room should feel like it is
  // being watched on a television, not like it is behind a filter.
  crt: {
    scanline: 0.16,
    scanCount: 300,
    vignette: 0.78,
    roll: 0.012,
    rollSpeed: 0.06,
    chroma: 0.0008,
  },
  dust: {
    count: 9000,
    mobileShare: 0.35,
    area: [7, 4, 16],
    size: 4.6,
    color: "#dcefff",
    opacity: 0.65,
    drift: 0.45,
    speed: 0.12,
  },
  signs: {
    // Matches `--nav-accent` in `app/globals.css`. Three-dimensional text is
    // lit by the renderer, so it cannot read a CSS variable - change both.
    color: "#d6d8db",
    // Six units off is where a line lifts out of the fog, four is where it is
    // fully there. Both are well inside the eight the near line starts at, so
    // the opening shot has no words in it.
    fadeIn: [6, 4],
    // It lets go over the last unit and a half — the quad has to be gone before
    // the lens reaches its plane, or it sweeps across the frame as it clips.
    fadeOut: [1.5, 0.25],
    // Shut until the lens is level with the wall's last row (z ≈ −4.6), fully
    // open a unit and a bit later. Opened a little earlier than that row for the
    // near line's sake — by the time the lens is beside the last sets they are
    // at the very edge of the frame, and waiting until they are behind it made
    // the line arrive late.
    clearOf: [-3.2, -4.8],
    opacity: 0.92,
  },
  scroll: {
    // Dead level and far enough forward to come out the far side of the wall:
    // the carousel needs empty room to assemble in, and the only empty room on a
    // level course is past the sets, not among them. The travel is eased so the
    // first of the scroll barely moves — that is the room the figure's fade needs.
    dolly: -15,
    rise: 0,
    flight: [0, 0.3],
    // Two-thirds of the dolly — as far as the wall's last row — in the first
    // 40% of the flight's scroll; the remaining five units of empty corridor
    // over the other 60%, which is what gives the lines standing in it room to
    // lift out of the fog one after the other.
    flightSplit: { at: 0.4, travel: 0.68 },
    // Earlier than it was, because the first gear reaches the figure sooner:
    // the lens is level with it about a fortieth of the way into the scroll.
    figureFade: [0.004, 0.021],
    // Gone by the time the wall is behind the lens: the first scene keeps its
    // rack focus, everything after it is sharp.
    focusFade: [0.033, 0.133],
    skyTop: "#ff7c5c",
    smoothing: 0.18,
    snapAbove: 0.2,
    carousel: {
      center: [0, -0.68, -4.2],
      // Twice the old gap, on sets more than half again as big: three across the
      // frame instead of five, which is what a portfolio carousel wants.
      spread: 3,
      bulge: 0,
      fogDepth: 20,
      scale: 1.6,
      hideBeyond: 1.5,
      entrance: [0.133, 0.3],
      closingIndex: 0,
      rotateSpring: { mass: 1, tension: 85, friction: 26 },
      hover: { lift: 0.24, spring: { mass: 1, tension: 150, friction: 26 } },
      // Order is the order round the ring from the front slot: front, then
      // right, then further right — which wraps to the far left.
      members: [
        {
          screenTexture: "nugget-v13",
          packStill: "/assets/hero/packs/pack0-v44.png",
          fromOffset: [0.1, 0.55, -20],
          startRotation: [-0.32, -0.4, 0.18],
          arc: 0.35,
          delay: 0,
          float: { amplitude: 0.06, speed: 0.85, yaw: 0.05, tilt: 0.035 },
        },
        {
          screenTexture: "checker-v13",
          packStill: "/assets/hero/packs/pack1-v44.png",
          fromOffset: [0.6, 0.45, -20],
          startRotation: [-0.2, -0.42, 0.2],
          arc: 0.3,
          delay: 0.24,
          float: { amplitude: 0.05, speed: 0.79, yaw: 0.045, tilt: 0.03 },
        },
        {
          screenTexture: "logon-v13",
          packStill: "/assets/hero/packs/pack2-v44.png",
          fromOffset: [1, 0.35, -20],
          startRotation: [-0.24, -0.5, 0.26],
          arc: 0.42,
          delay: 0.44,
          float: { amplitude: 0.055, speed: 0.68, yaw: 0.04, tilt: 0.03 },
        },
        {
          screenTexture: "smiley-v13",
          packStill: "/assets/hero/packs/pack3-v44.png",
          fromOffset: [-1, 0.35, -20],
          startRotation: [-0.24, 0.5, -0.26],
          arc: -0.42,
          delay: 0.4,
          float: { amplitude: 0.055, speed: 0.63, yaw: 0.04, tilt: 0.03 },
        },
        {
          screenTexture: "cashcat-v13",
          packStill: "/assets/hero/packs/pack4-v44.png",
          fromOffset: [-0.6, 0.45, -20],
          startRotation: [-0.2, 0.42, -0.2],
          arc: -0.3,
          delay: 0.2,
          float: { amplitude: 0.05, speed: 0.72, yaw: 0.045, tilt: 0.03 },
        },
        {
          // The unannounced set: colour bars and a question mark, the way a
          // channel with nothing to broadcast looks.
          //
          // It clones **screen 2**, whose UVs are unmirrored — check the
          // mirroring table in the handoff before moving any member to another
          // screen, or the card ships backwards. The card is also run at about
          // 70% brightness: a screen's light here *is* its picture, and full
          // colour bars feed the bloom far harder than the dark footage the
          // wall was tuned on.
          screenTexture: "robot-v14",
          packStill: "/assets/hero/packs/pack5-unknown-v69.png",
          fromOffset: [1.4, 0.6, -20],
          startRotation: [-0.28, -0.55, 0.3],
          arc: 0.5,
          delay: 0.6,
          float: { amplitude: 0.045, speed: 0.58, yaw: 0.035, tilt: 0.025 },
        },
      ],
    },
    finale: {
      range: [0.358, 0.5],
      fill: 1.06,
      blackFade: [0.74, 1],
    },
    epilogue: {
      // Covered from the moment the pixel wave closes over the room to the
      // moment the last panel starts dissolving off it. The staging has to be
      // finished by then: what the dissolve uncovers is this shot, already set.
      hold: [0.5, 0.75],
      // The pull-back **starts with that dissolve** rather than after it, so
      // the last panel clearing and the lens drawing back are one move and the
      // scroll never sits on a still frame.
      reveal: [0.75, 0.958],
      // Left of the screen and back from it: at 2.2 the glass is about three
      // quarters of the frame's height, and 1 unit off its axis turns it ~25°
      // away from the lens, which is the angle the blocking asks for.
      cameraOffset: [-1.25, -0.045, 3],
      referenceAspect: 1.78,
      figureFollowsFrame: 1,
      figurePortraitBias: 0,
      roll: 0.16,
      television: {
        position: { from: [0, 0.86, -14.15], to: [-0.35, 0.76, -14.2] },
        rotation: { from: [0, 0, 0], to: [0, -1.42, 0] },
      },
      figure: {
        // **Both ends the same.** He holds still and the lens pulls back past
        // him, which is what the act is; ends that differ walked him across the
        // room while the camera was already moving, and two things travelling at
        // once in a shot this close reads as drift rather than as a move.
        position: { from: [-1.75, -0.18, -11.95], to: [-1.75, -0.18, -11.95] },
        rotation: { from: [0, 5, 0], to: [0, 5, 0] },
      },
    },
  },
  dpr: [1, 1.5],
} as const;
