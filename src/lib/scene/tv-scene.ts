/**
 * @fileoverview The TV-wall WebGL scene — plain three.js, no React inside.
 *
 * React owns the canvas element and this object's lifetime, nothing more: the
 * scene graph, the loader and the frame loop live here so a re-render can never
 * touch them.
 *
 * The three rules it is built around (see the `optimize-3d-scene` skill):
 * one shared rAF for the whole page, render only while the canvas is visible,
 * and one directional key light on top of an image-based light.
 *
 * 📖 Docs: obsidian/frontend/scene-3d.md
 */

import { SpringValue } from "@react-spring/web";
import {
  ACESFilmicToneMapping,
  AnimationMixer,
  Euler,
  Color,
  DirectionalLight,
  Fog,
  FogExp2,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PMREMGenerator,
  PointLight,
  Quaternion,
  Scene,
  SRGBColorSpace,
  TextureLoader,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Texture,
  type WebGLRenderTarget,
} from "three";
import type { AnimationClip } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { BokehPass } from "three/examples/jsm/postprocessing/BokehPass.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { FilmPass } from "three/examples/jsm/postprocessing/FilmPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

import { smoothScrollProgress } from "@/lib/animation/scroll-progress";
import { markSceneReady } from "@/lib/page/intro";
import { subscribeToTicker } from "@/lib/animation/ticker";
import {
  clampedPixelRatio,
  frameBudget,
  hasFinePointer,
  isMobile,
  prefersReducedMotion,
} from "@/lib/scene/device";
import {
  sceneConfig,
  type Triple,
  type TvEpilogueTrack,
  type SceneBloomConfig,
  type SceneConfig,
  type SceneCrtConfig,
  type SceneDepthOfFieldConfig,
  type SceneFogConfig,
  type SceneSignConfig,
} from "@/lib/scene/config";
import { TvCarousel } from "@/lib/scene/tv-carousel";
import { CRT_SHADER, type CrtUniforms } from "@/lib/scene/tv-crt";
import { TvDust } from "@/lib/scene/tv-dust";
import type { TvFlyer } from "@/lib/scene/tv-flyer";
import { TvHover } from "@/lib/scene/tv-hover";
import { TvScreens } from "@/lib/scene/tv-screens";
import { TvSigns } from "@/lib/scene/tv-signs";
import { TvSky } from "@/lib/scene/tv-sky";
import { disposeObject } from "@/utils/scene/dispose-object";

/** Draco decoder, copied out of `three/examples/jsm/libs/draco/gltf/`. */
const DRACO_DECODER_PATH = "/draco/";

/**
 * Longest step the animation may take in one frame (seconds).
 *
 * Coming back to a backgrounded tab hands the loop a delta of several seconds;
 * without the clamp the figure teleports through most of its clip.
 */
const MAX_FRAME_DELTA = 0.05;

/** How far the hover opens the closing set back toward the lens, radians. */
const CLOSING_TURN = 0.16;
/** Its screen's share of the wall's glow, at rest and fully hovered. */
const CLOSING_GLOW = 0.12;
const CLOSING_GLOW_LIFT = 0.07;

const clamp01 = (value: number): number => Math.min(Math.max(value, 0), 1);

/** Still at both ends — the scene's one easing curve. */

/**
 * A window's own `0`–`1`, cut out of a wider progress.
 *
 * The scroll drives three acts one after another, and each of them wants to
 * think in its own terms rather than in shares of the whole page.
 */
const phase = (value: number, [from, to]: readonly [number, number]): number =>
  clamp01((value - from) / Math.max(to - from, 0.0001));

/** A deep copy — the panel writes into these, the config must stay pristine. */
const copyTrack = (track: TvEpilogueTrack): TvEpilogueTrack => ({
  position: { from: [...track.position.from], to: [...track.position.to] },
  rotation: { from: [...track.rotation.from], to: [...track.rotation.to] },
});

type BokehUniforms = Record<
  "focus" | "aperture" | "maxblur",
  { value: number }
>;

type FilmUniforms = Record<"intensity", { value: number }>;

/**
 * `UnrealBloomPass.highPassUniforms` is typed as a bare object upstream; this
 * names the one uniform the scene reaches into — the softness of the threshold's
 * edge, which is the difference between a glow and an outline.
 */
type HighPassUniforms = Record<"smoothWidth", { value: number }>;

/** What the development tuning panel reads and writes. */
export interface SceneSettings {
  bloom: {
    strength: number;
    radius: number;
    threshold: number;
    knee: number;
    fine: number;
  };
  /** The spring is not a slider — it is how focus travels, not where it lands. */
  depthOfField: Omit<SceneDepthOfFieldConfig, "focusSpring">;
  /**
   * Everything that makes the air in the room: the haze itself, the sky it
   * fades into, the exposure it is read at, and the grain over the result.
   * `FogExp2` has only two knobs of its own, and neither reads right without
   * the others.
   */
  atmosphere: {
    fogColor: string;
    fogMode: SceneFogConfig["mode"];
    fogDensity: number;
    /** `linear` only: how far the haze is pushed off the lens. */
    fogNear: number;
    fogFar: number;
    /** The colour the first scene opens on — the drift starts here. */
    skyTop: string;
    /** The colour the flight carries it to — the drift ends here. */
    skyDrift: string;
    skyBottom: string;
    exposure: number;
    grain: number;
  };
  /** The rest of the room's light, the values the atmosphere is judged against. */
  lighting: {
    /** Emissive strength of the screens — what feeds the bloom. */
    screenGlow: number;
    /** Image-based light from the PMREM'd room. */
    environmentIntensity: number;
    keyLight: number;
  };
  /** The glass the page is watched through — see `lib/scene/tv-crt.ts`. */
  crt: SceneCrtConfig;
  /**
   * Where the last shot stands its two subjects, in **world** coordinates: at the
   * start of the reveal and at the end of it.
   *
   * A blocking is found by dragging numbers and reading them back out, which is
   * why these are absolute rather than offsets from a camera that is itself
   * moving. Equal ends mean the subject holds still while the lens pulls back.
   */
  epilogue: {
    television: TvEpilogueTrack;
    figure: TvEpilogueTrack;
  };
  /** The bokeh pass is not built on the mobile tier. */
  hasDepthOfField: boolean;
}

export type { Triple, TvEpilogueTrack } from "@/lib/scene/config";

export interface TvSceneOptions {
  /** Element the canvas is appended to; it also defines the drawing-buffer size. */
  container: HTMLElement;
  /** Absolute path to the GLB under `public/assets/<section>/`. */
  modelUrl: string;
  /**
   * Videos to play on the television screens, spread across them in
   * screen-number order. Empty leaves every screen on its baked texture.
   */
  screenVideos?: string[];
  /** Clip for one specific screen, keyed by its number — beats the name match. */
  screenVideoOverrides?: Record<string, string>;
  /** Per-screen share of the wall's glow, keyed by screen number. */
  screenGlowScale?: Record<string, number>;
  /** The lines standing in the room between the wall and the carousel. */
  flightSigns?: SceneSignConfig[];
  /**
   * What the label over a hovered television says: the case each screen's own
   * texture belongs to, and what everything else — the noise sets, the stills —
   * falls back to.
   */
  captionLabels?: { byTexture: Record<string, string>; fallback: string };
  /**
   * The closing shot's screen: a still to hang on the set the lens pulls back
   * from, and what the chip says over it.
   *
   * The swap happens **under the black**, while the epilogue is being staged —
   * the same window the figure is walked across the room in — so the set the
   * carousel left at the front simply is the one holding this by the time
   * anything can be seen of it.
   */
  finalShot?: { image: string; label: string };
  config?: SceneConfig;
  /**
   * How far the finale's black has closed over the frame, `0`–`1`.
   *
   * The overlay itself is a DOM layer, not a pass: it is a flat fill over the
   * finished frame, and a fullscreen quad through the composer would cost a
   * render target to do what one `div` does for nothing.
   */
  onBlackout?: (amount: number) => void;
  /** Whether the carousel's buttons are worth showing at this point in the scroll. */
  onControlsVisible?: (visible: boolean) => void;
  /** Which work the ring has turned to the front — an index into its members. */
  onCarouselIndex?: (index: number) => void;
  /**
   * What the chip on the cursor should say, or `null` for nothing hovered.
   *
   * The label is **DOM**, not a plane in the room: see
   * [[components/common|`<HoverChip>`]] for why the in-scene one was dropped.
   */
  onHoverHint?: (hint: TvHoverHint | null) => void;
  /**
   * The closing shot, every frame it is on screen.
   *
   * `reveal` is how far the black has lifted; `edgeAt(y)` is where the
   * television's left side falls at a given height on screen, both in CSS
   * pixels. A function rather than a number because the set is turned, so *where
   * it begins* depends on the height you ask at — and only the page knows the
   * height of the rule it is drawing. Written straight to elements by the page:
   * this changes on most frames of the last act.
   */
  onClosingShot?: (state: {
    reveal: number;
    edgeAt: (y: number) => number;
  }) => void;
}

/**
 * What the pointer has found, and **what kind of thing it is** — which is what
 * decides how the chip is dressed.
 *
 * The scene names the thing; the page decides what that should look like. A set
 * showing work is an offer (`case`), a set showing noise is not (`unknown`), and
 * the one at the end of the page is the page's own invitation (`closing`).
 */
export interface TvHoverHint {
  text: string;
  kind: "case" | "unknown" | "closing";
}

export class TvScene {
  private readonly container: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly config: SceneConfig;
  private readonly screenVideos: string[];
  private readonly screenVideoOverrides: Record<string, string>;
  private readonly screenGlowScale: Record<string, number>;
  private readonly onBlackout?: (amount: number) => void;
  private readonly onControlsVisible?: (visible: boolean) => void;
  private readonly onCarouselIndex?: (index: number) => void;
  private readonly onHoverHint?: (hint: TvHoverHint | null) => void;
  private readonly onClosingShot?: (state: {
    reveal: number;
    edgeAt: (y: number) => number;
  }) => void;
  /** The frame the closing rule is measured against, in CSS pixels. */
  private closingBoxWidth = 0;
  private closingBoxHeight = 0;
  /** Scratch for the rule's own ray probes — never the live pointer. */
  private readonly pointerProbe = new Vector2();
  /** Last answer, and the state it was measured in. */
  private readonly closingEdgeCache = {
    y: Number.NaN,
    scroll: Number.NaN,
    lift: Number.NaN,
    value: 0,
  };
  /**
   * How far the pointer has turned the closing set toward the lens, `0`–`1`.
   *
   * A spring, not a flag: the set is the last thing on the page and a hover that
   * snaps it round reads as a glitch rather than as an invitation.
   */
  private readonly closingLift: SpringValue<number>;
  /** Last label handed to the page, so a callback only fires on a change. */
  private hoverLabel: string | null = null;
  private readonly flightSigns: SceneSignConfig[];
  private readonly captionLabels: { byTexture: Record<string, string>; fallback: string };
  private readonly finalShot?: { image: string; label: string };
  /** Last reveal handed to the page — one more frame is sent after it hits zero. */
  private closingReported = 0;
  /** The closing screen's still, loaded once the epilogue is first staged. */
  private closingTexture: Texture | null = null;
  /** The set it was hung on, so scrolling back up can take it off again. */
  private closingSet: TvFlyer | null = null;
  /** Whether the pointer is on that set — only ever true in the last shot. */
  private onClosingSet = false;
  /** Whether the glow was raised last frame, so it is only written back once. */
  private closingWasLit = false;
  /** Where the hover spring is aimed, so it is only re-aimed on a change. */
  private closingWanted = false;
  /** Whether the set carrying the closing screen shows its picture reversed. */
  private closingMirrored = false;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly framerate = frameBudget();

  /** Normalised pointer position, −1 → 1 on both axes. */
  private readonly pointerX: SpringValue<number>;
  private readonly pointerY: SpringValue<number>;

  /** Raw (unsprung) pointer in NDC — hover must pick where the cursor *is*. */
  private readonly pointerNdc = new Vector2();
  private pointerMoved = false;
  private hover: TvHover | null = null;
  /** Whether pointer-driven effects are wanted at all on this device. */
  private readonly pointerEnabled: boolean;

  private readonly teardown: Array<() => void> = [];
  private unsubscribe: (() => void) | null = null;
  private background: TvSky | null = null;
  private environment: WebGLRenderTarget | null = null;
  private model: Group | null = null;
  private mixer: AnimationMixer | null = null;
  private screens: TvScreens | null = null;
  private carousel: TvCarousel | null = null;
  /** Where the camera stands once the flight is over — the ring is placed on it. */
  private readonly cameraRest = new Vector3();
  private readonly finaleTarget = new Vector3();
  /** Scratch for the epilogue's staging — allocated once, like everything else. */
  private readonly stage = new Vector3();
  private readonly stageTarget = new Vector3();
  private readonly scratch = new Vector3();
  /** Where the figure stood in the opening shot, and how high the floor is. */
  private readonly figureRest = new Vector3();
  /** How far the finale's push-in ends from the glass. */
  private finaleDistance = 0;
  /** Focus the epilogue holds the lens at; `0` leaves the resting focus alone. */
  private epilogueFocus = 0;
  /** Height of the room's floor, read off the model. */
  private floorY = 0;
  /** How far the epilogue's staging has run, `0`–`1`. All of it under black. */
  private staged = 0;
  /**
   * Where the last shot puts its two subjects, live.
   *
   * A copy of the config's, because the tuning panel writes to it: a blocking is
   * found by dragging numbers and reading them back, not by editing a file and
   * waiting for a reload.
   */
  private readonly stageTracks: SceneSettings["epilogue"];
  private readonly stagedTelevision = new Vector3();
  private readonly stagedFigure = new Vector3();
  private readonly stagedTelevisionSpin = new Euler();
  private readonly stagedFigureSpin = new Euler();
  private readonly spinQuaternion = new Quaternion();
  /** The figure's own orientation, before the last shot turns it. */
  private readonly figureRestQuaternion = new Quaternion();
  private readonly trackFrom = new Vector3();
  private readonly trackTo = new Vector3();
  private floorMaterial: MeshStandardMaterial | null = null;
  /** Last values handed to the page, so a callback only fires on a change. */
  private blackAmount = -1;
  private controlsVisible = false;
  /** Whether the canvas is in the viewport, and whether anything opaque covers it. */
  private onScreen = true;
  private covered = false;
  private dust: TvDust | null = null;
  private signs: TvSigns | null = null;
  /** Screen-texture name → what the label says, resolved once per television. */
  private readonly captions = new WeakMap<Object3D, TvHoverHint>();
  /** The figure and the material it dissolves through. */
  private figure: Object3D | null = null;
  private figureMaterial: MeshStandardMaterial | null = null;
  /** Scroll progress, `0`–`1`, low-passed — see `config.scroll.smoothing`. */
  private scroll = 0;
  /** Focus distance of the lens, pulled toward whatever the pointer is on. */
  private readonly focus: SpringValue<number>;
  /** Where focus returns to with nothing hovered — the panel moves this. */
  private restingFocus: number;
  /** The blur ceiling in page pixels; the uniform wants it in UV. */
  private maxBlurPixels: number;
  /**
   * How much of that ceiling the scroll still allows, `1` → `0`.
   *
   * The rack focus belongs to the **opening shot** — it is the answer to a
   * cursor on a wall of screens. Once the flight leaves that room there is
   * nothing to rack to, and a defocus that stays on only softens the acts that
   * want to be sharp. The pass keeps rendering (the dust reads its depth); the
   * ceiling is what closes.
   */
  private focusFade = 1;
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  private bokehPass: BokehPass | null = null;
  private filmPass: FilmPass | null = null;
  private crtPass: ShaderPass | null = null;
  private keyLight: DirectionalLight | null = null;
  /** Current fog settings — the live object only carries the active mode's. */
  private fogSettings: SceneFogConfig;
  /**
   * The sky's three live colours: what it opens on, what the flight carries it
   * to, and the bottom band under both.
   *
   * Live rather than read from the config every frame, because the drift writes
   * the dome **every** frame — anything the panel set would be gone by the next
   * one. These are what it edits; the drift only ever interpolates between them.
   */
  private sky: [string, string];
  private skyDrift: string;
  /** Timestamp of the previous rendered frame; `0` means "no delta yet". */
  private lastFrameTime = 0;
  private resizePending = false;
  private disposed = false;

  constructor({
    container,
    modelUrl,
    screenVideos = [],
    screenVideoOverrides = {},
    screenGlowScale = {},
    flightSigns = [],
    captionLabels = { byTexture: {}, fallback: "" },
    config = sceneConfig,
    onBlackout,
    onControlsVisible,
    onCarouselIndex,
    onHoverHint,
    onClosingShot,
    finalShot,
  }: TvSceneOptions) {
    this.container = container;
    this.config = config;
    this.onBlackout = onBlackout;
    this.onControlsVisible = onControlsVisible;
    this.onCarouselIndex = onCarouselIndex;
    this.onHoverHint = onHoverHint;
    this.onClosingShot = onClosingShot;
    this.closingLift = new SpringValue({
      from: 0,
      config: { tension: 120, friction: 26 },
    });
    this.finalShot = finalShot;
    this.flightSigns = flightSigns;
    this.captionLabels = captionLabels;
    this.screenVideos = screenVideos;
    this.screenVideoOverrides = screenVideoOverrides;
    this.screenGlowScale = screenGlowScale;
    this.stageTracks = {
      television: copyTrack(config.scroll.epilogue.television),
      figure: copyTrack(config.scroll.epilogue.figure),
    };
    this.sky = [...config.environment.backgroundGradient];
    this.skyDrift = config.scroll.skyTop;
    this.fogSettings = { ...config.environment.fog };

    // The scene owns its canvas. A WebGL context cannot be re-created on an
    // element that already has one, so sharing a canvas across instances breaks
    // the second mount — which React's StrictMode guarantees in development.
    this.canvas = document.createElement("canvas");
    this.canvas.style.display = "block";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    container.appendChild(this.canvas);

    // Both pointer effects share one gate: a touch device has no cursor to
    // follow, and under reduced motion react-spring's global `skipAnimation`
    // would teleport instead of easing.
    this.pointerEnabled = hasFinePointer() && !prefersReducedMotion();

    // Spring physics — not a per-frame lerp — so the drift matches the motion
    // system the rest of the app runs on (hard rule #1).
    this.pointerX = new SpringValue({
      from: 0,
      config: config.parallax.spring,
    });
    this.pointerY = new SpringValue({
      from: 0,
      config: config.parallax.spring,
    });
    this.restingFocus = config.depthOfField.focus;
    this.maxBlurPixels = config.depthOfField.maxBlur;
    this.focus = new SpringValue({
      from: config.depthOfField.focus,
      config: config.depthOfField.focusSpring,
    });

    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: !isMobile(),
      // The gradient sky fills every pixel — the canvas never composites
      // against the page.
      alpha: false,
      powerPreference: isMobile() ? "default" : "high-performance",
    });
    this.renderer.setPixelRatio(clampedPixelRatio(config.dpr));
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = config.environment.exposure;

    const { position, pitch, fov, near, far } = config.camera;
    this.camera = new PerspectiveCamera(fov, 1, near, far);
    this.camera.position.set(...position);
    // YXZ applies yaw before pitch; the default XYZ order leaks visible roll
    // into the frame once both axes are non-zero.
    this.camera.rotation.order = "YXZ";
    this.camera.rotation.set(pitch, 0, 0);

    this.buildEnvironment();
    // The composer first: the dust reads the depth its bokeh pass renders, so
    // the pass has to exist before the cloud is compiled against it.
    this.buildComposer();
    this.buildDust();
    if (this.flightSigns.length > 0) {
      this.signs = new TvSigns(this.scene, this.flightSigns, config.signs);
    }
    this.applySize();
    this.watchPointer();
    this.watchResize();
    this.watchVisibility();

    this.load(modelUrl).catch((error: unknown) => {
      console.error("[tv-scene] model failed to load:", error);
    });
  }

  /**
   * A dark room lit by its own screens: haze, a nearly-black sky, a weak key to
   * keep silhouettes readable, and three coloured lamps standing in for the
   * spill the CRTs would throw.
   */
  private buildEnvironment(): void {
    const {
      backgroundGradient,
      backgroundHorizon,
      keyLight,
      environmentIntensity,
      spillLights,
    } = this.config.environment;

    this.background = new TvSky(
      this.scene,
      ...backgroundGradient,
      this.config.camera.fov,
      backgroundHorizon,
      // Well inside the far plane, so the dome is never itself clipped.
      this.config.camera.far * 0.8,
    );
    this.applyFog();

    const pmremGenerator = new PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.environment = pmremGenerator.fromScene(room, 0.04);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = environmentIntensity;
    room.dispose();
    pmremGenerator.dispose();

    this.keyLight = new DirectionalLight(keyLight.color, keyLight.intensity);
    this.keyLight.position.set(...keyLight.position);
    this.scene.add(this.keyLight);

    // Fixed count, set at construction: adding or removing a light at runtime
    // recompiles every material in the scene.
    for (const lamp of spillLights) {
      const light = new PointLight(
        lamp.color,
        lamp.intensity,
        lamp.distance,
        2,
      );
      light.position.set(...lamp.position);
      this.scene.add(light);
    }
  }

  /** Dust in the air — one draw call, and a mote count the tier can afford. */
  private buildDust(): void {
    const { dust } = this.config;
    const count = Math.round(dust.count * (isMobile() ? dust.mobileShare : 1));
    const depth = this.bokehUniforms
      ? ((this.bokehPass?.uniforms as Record<string, { value: Texture }>).tDepth
          ?.value ?? null)
      : null;

    this.dust = new TvDust(dust, count, this.camera, depth);
  }

  /**
   * The lens: scene → defocus → bloom → tone map → grain.
   *
   * Order is the point. Depth of field runs **before** the bloom so the glow
   * spreads from already-soft screens rather than being smeared afterwards, and
   * the grain sits **after** the output pass so it lands in display space, the
   * way film grain actually does, instead of being tone-mapped along with the
   * image.
   */
  private buildComposer(): void {
    const { strength, radius, threshold, knee, fine, mobileScale } =
      this.config.bloom;
    const { focus, aperture, maxBlur } = this.config.depthOfField;
    const mobile = isMobile();
    const scale = mobile ? mobileScale : 1;

    const composer = new EffectComposer(this.renderer);
    // The composer owns its own render targets — clamping the renderer alone
    // would throw the whole DPR saving away on the post passes.
    composer.setPixelRatio(clampedPixelRatio(this.config.dpr));
    composer.addPass(new RenderPass(this.scene, this.camera));

    this.bloomPass = new UnrealBloomPass(
      new Vector2(1, 1),
      strength * scale,
      radius * scale,
      threshold,
    );
    // Not clipped at the threshold: see `bloom.knee`. Written once — the pass
    // rewrites `luminosityThreshold` every frame but never touches this.
    this.bloomHighPass.smoothWidth.value = knee;
    this.setBloomFine(fine);
    composer.addPass(this.bloomPass);

    // Skipped on mobile: this one costs a second scene render for depth.
    if (!mobile) {
      this.bokehPass = new BokehPass(this.scene, this.camera, {
        focus,
        aperture,
        // Converted from pixels on every resize; see `writeMaxBlur`.
        maxblur: 0,
      });
      composer.addPass(this.bokehPass);
    }
    composer.addPass(new OutputPass());
    this.filmPass = new FilmPass(this.config.grain.intensity);
    composer.addPass(this.filmPass);

    // Last, and after the tone map on purpose: scanlines are a property of the
    // glass the page is watched through, not of the light in the room.
    this.crtPass = new ShaderPass(CRT_SHADER);
    const crt = this.crtUniforms;
    if (crt) {
      crt.uScanline.value = this.config.crt.scanline;
      crt.uScanCount.value = this.config.crt.scanCount;
      crt.uVignette.value = this.config.crt.vignette;
      crt.uRoll.value = this.config.crt.roll;
      crt.uRollSpeed.value = this.config.crt.rollSpeed;
      crt.uChroma.value = this.config.crt.chroma;
    }
    composer.addPass(this.crtPass);

    this.composer = composer;
  }

  /**
   * Find the figure and make its material fadeable.
   *
   * Its meshes share one material, so the flag and the opacity are set once. It
   * is the only thing standing in the camera's path down the room; the rest of
   * the model is off to the sides.
   */
  private prepareFigure(model: Group): void {
    const figure = model.children.find((child) =>
      child.name.toLowerCase().includes("sketchfab"),
    );
    if (!figure) return;

    this.figure = figure;
    this.figureRest.copy(figure.position);
    this.figureRestQuaternion.copy(figure.quaternion);
    figure.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      // Skinned: three culls on the geometry's *bind pose* sphere, which is not
      // where the animated body is. Harmless in the opening, where the figure is
      // in the middle of the frame; in the last shot it stands at the very edge
      // of a frustum a metre deep and gets culled outright.
      child.frustumCulled = false;
      if (this.figureMaterial) return;

      const material = Array.isArray(child.material)
        ? child.material[0]
        : child.material;
      if (!(material instanceof MeshStandardMaterial)) return;

      // Set here and never again: `transparent` is a shader define, and toggling
      // it mid-flight recompiles the material at the worst possible moment.
      material.transparent = true;
      material.depthWrite = true;
      this.figureMaterial = material;
    });
  }

  /**
   * Live settings, for the development tuning panel.
   *
   * The panel writes straight into the passes rather than rebuilding them:
   * re-creating a pass mid-session drops its render targets and recompiles its
   * shader, which is a visible hitch on every slider drag.
   */
  readonly settings = {
    read: (): SceneSettings => ({
      bloom: {
        strength: this.bloomPass?.strength ?? 0,
        radius: this.bloomPass?.radius ?? 0,
        threshold: this.bloomPass?.threshold ?? 0,
        knee: this.bloomHighPass?.smoothWidth.value ?? 0,
        fine: this.bloomPass?.bloomTintColors[0].x ?? 0,
      },
      depthOfField: {
        // The resting value, not the live one — the live one is wherever the
        // rack focus currently is, which would fight the slider.
        focus: this.restingFocus,
        aperture: this.bokehUniform("aperture"),
        // Pixels, not the uniform's UV — that is what the panel edits.
        maxBlur: this.maxBlurPixels,
      },
      atmosphere: {
        fogColor: this.fogSettings.color,
        fogMode: this.fogSettings.mode,
        fogDensity: this.fogSettings.density,
        fogNear: this.fogSettings.near,
        fogFar: this.fogSettings.far,
        skyTop: this.sky[0],
        skyDrift: this.skyDrift,
        skyBottom: this.sky[1],
        exposure: this.renderer.toneMappingExposure,
        grain: this.filmUniforms?.intensity.value ?? 0,
      },
      lighting: {
        screenGlow: this.screens?.glow ?? this.config.environment.screenGlow,
        environmentIntensity: this.scene.environmentIntensity,
        keyLight: this.keyLight?.intensity ?? 0,
      },
      crt: {
        scanline: this.crtUniforms?.uScanline.value ?? 0,
        scanCount: this.crtUniforms?.uScanCount.value ?? 1,
        vignette: this.crtUniforms?.uVignette.value ?? 0,
        roll: this.crtUniforms?.uRoll.value ?? 0,
        rollSpeed: this.crtUniforms?.uRollSpeed.value ?? 0,
        chroma: this.crtUniforms?.uChroma.value ?? 0,
      },
      epilogue: {
        television: copyTrack(this.stageTracks.television),
        figure: copyTrack(this.stageTracks.figure),
      },
      hasDepthOfField: this.bokehPass !== null,
    }),

    setBloom: (patch: Partial<SceneBloomConfig>): void => {
      if (!this.bloomPass) return;
      if (patch.strength !== undefined)
        this.bloomPass.strength = patch.strength;
      if (patch.radius !== undefined) this.bloomPass.radius = patch.radius;
      if (patch.threshold !== undefined)
        this.bloomPass.threshold = patch.threshold;
      if (patch.knee !== undefined) {
        this.bloomHighPass.smoothWidth.value = patch.knee;
      }
      if (patch.fine !== undefined) this.setBloomFine(patch.fine);
    },

    setDepthOfField: (patch: Partial<SceneDepthOfFieldConfig>): void => {
      const uniforms = this.bokehUniforms;
      if (!uniforms) return;
      if (patch.focus !== undefined) {
        this.restingFocus = patch.focus;
        // Jump rather than ease: a slider drag is the user driving the lens
        // directly, and easing behind them reads as lag.
        this.focus.set(patch.focus);
        uniforms.focus.value = patch.focus;
      }
      if (patch.aperture !== undefined)
        uniforms.aperture.value = patch.aperture;
      if (patch.maxBlur !== undefined) {
        this.maxBlurPixels = patch.maxBlur;
        this.writeMaxBlur();
      }
    },

    setAtmosphere: (patch: Partial<SceneSettings["atmosphere"]>): void => {
      const fog = this.fogSettings;
      const modeChanged =
        patch.fogMode !== undefined && patch.fogMode !== fog.mode;

      if (patch.fogColor !== undefined) fog.color = patch.fogColor;
      if (patch.fogMode !== undefined) fog.mode = patch.fogMode;
      if (patch.fogDensity !== undefined) fog.density = patch.fogDensity;
      if (patch.fogNear !== undefined) fog.near = patch.fogNear;
      if (patch.fogFar !== undefined) fog.far = patch.fogFar;

      // Swapping the object recompiles every material, so only do it when the
      // mode actually changed; otherwise write the live values in place.
      if (modeChanged) this.applyFog();
      else this.writeFog();

      if (patch.exposure !== undefined) {
        this.renderer.toneMappingExposure = patch.exposure;
      }

      const film = this.filmUniforms;
      if (film && patch.grain !== undefined) film.intensity.value = patch.grain;

      // Retinting the fog without retinting the sky under it puts the floor's
      // far edge back on screen as a hard line, so the two move together unless
      // the same change sets the sky itself.
      const skyBottom =
        patch.skyBottom ??
        (patch.fogColor !== undefined ? patch.fogColor : undefined);

      if (patch.skyDrift !== undefined) this.skyDrift = patch.skyDrift;
      if (patch.skyTop !== undefined || skyBottom !== undefined) {
        this.setSky(patch.skyTop ?? this.sky[0], skyBottom ?? this.sky[1]);
      }
    },

    /**
     * The current values as a block to paste into `lib/scene/config.ts`.
     *
     * Built here rather than in the panel because it needs both halves: the live
     * values the panel moved and the config fields it never touches — the key
     * light's position and colour, the mobile bloom scale, the focus spring.
     * Emitting a partial literal would produce something that has to be
     * hand-repaired before it compiles.
     */
    snippet: (): string => {
      const live = this.settings.read();
      const { keyLight } = this.config.environment;
      const { mobileScale } = this.config.bloom;
      const { focusSpring } = this.config.depthOfField;
      const json = (value: unknown): string => JSON.stringify(value);

      return `// paste into src/lib/scene/config.ts
bloom: { strength: ${live.bloom.strength}, radius: ${live.bloom.radius}, threshold: ${live.bloom.threshold}, knee: ${live.bloom.knee}, fine: ${live.bloom.fine}, mobileScale: ${mobileScale} },
depthOfField: {
  focus: ${live.depthOfField.focus},
  aperture: ${live.depthOfField.aperture},
  maxBlur: ${live.depthOfField.maxBlur},
  focusSpring: ${json(focusSpring)},
},
grain: { intensity: ${live.atmosphere.grain} },
crt: {
  scanline: ${live.crt.scanline},
  scanCount: ${live.crt.scanCount},
  vignette: ${live.crt.vignette},
  roll: ${live.crt.roll},
  rollSpeed: ${live.crt.rollSpeed},
  chroma: ${live.crt.chroma},
},
environment: {
  backgroundGradient: [${json(live.atmosphere.skyTop)}, ${json(live.atmosphere.skyBottom)}],
  // …and scroll.skyTop: ${json(live.atmosphere.skyDrift)}
  backgroundHorizon: ${this.config.environment.backgroundHorizon},
  keyLight: { position: ${json(keyLight.position)}, intensity: ${live.lighting.keyLight}, color: ${json(keyLight.color)} },
  environmentIntensity: ${live.lighting.environmentIntensity},
  exposure: ${live.atmosphere.exposure},
  fog: {
    color: ${json(live.atmosphere.fogColor)},
    mode: ${json(live.atmosphere.fogMode)},
    density: ${live.atmosphere.fogDensity},
    near: ${live.atmosphere.fogNear},
    far: ${live.atmosphere.fogFar},
  },
  floorColor: ${json(this.config.environment.floorColor)},
  floorScale: ${this.config.environment.floorScale},
  screenGlow: ${live.lighting.screenGlow},
},
// …inside scroll.epilogue:
television: {
  position: { from: ${json(live.epilogue.television.position.from)}, to: ${json(live.epilogue.television.position.to)} },
  rotation: { from: ${json(live.epilogue.television.rotation.from)}, to: ${json(live.epilogue.television.rotation.to)} },
},
figure: {
  position: { from: ${json(live.epilogue.figure.position.from)}, to: ${json(live.epilogue.figure.position.to)} },
  rotation: { from: ${json(live.epilogue.figure.rotation.from)}, to: ${json(live.epilogue.figure.rotation.to)} },
},`;
    },

    /**
     * Move the last shot's subjects, live.
     *
     * Written into the same arrays the frame loop reads, so a dragged number is
     * on screen the next frame — and only visible at all while the scroll is in
     * the epilogue, which is where the panel is worth using for this.
     */
    /** Uniform writes, all four of them — the pass is never rebuilt. */
    setCrt: (patch: Partial<SceneCrtConfig>): void => {
      const crt = this.crtUniforms;
      if (!crt) return;
      if (patch.scanline !== undefined) crt.uScanline.value = patch.scanline;
      if (patch.scanCount !== undefined) crt.uScanCount.value = patch.scanCount;
      if (patch.vignette !== undefined) crt.uVignette.value = patch.vignette;
      if (patch.roll !== undefined) crt.uRoll.value = patch.roll;
      if (patch.rollSpeed !== undefined) crt.uRollSpeed.value = patch.rollSpeed;
      if (patch.chroma !== undefined) crt.uChroma.value = patch.chroma;
    },

    setEpilogue: (patch: SceneSettings["epilogue"]): void => {
      this.stageTracks.television = copyTrack(patch.television);
      this.stageTracks.figure = copyTrack(patch.figure);
    },

    setLighting: (patch: Partial<SceneSettings["lighting"]>): void => {
      if (patch.screenGlow !== undefined) {
        this.screens?.setGlow(patch.screenGlow);
      }
      if (patch.environmentIntensity !== undefined) {
        this.scene.environmentIntensity = patch.environmentIntensity;
      }
      if (patch.keyLight !== undefined && this.keyLight) {
        this.keyLight.intensity = patch.keyLight;
      }
    },
  };

  /** Push the current fog numbers into whichever fog object is live. */
  private writeFog(): void {
    const { color, density, near, far } = this.fogSettings;
    const fog = this.scene.fog;
    if (!fog) return;

    fog.color.set(color);
    if (fog instanceof FogExp2) fog.density = density;
    else if (fog instanceof Fog) {
      fog.near = near;
      fog.far = far;
    }
  }

  /**
   * Build the fog object for the current mode.
   *
   * `exp2` thickens from the lens outward and has no start; `linear` is the one
   * that can be pushed away from the camera, which is the only way to keep the
   * foreground clear.
   *
   * > Switching *mode* swaps `Fog` for `FogExp2`, and the fog type is a shader
   * > define — every material in the scene recompiles. Fine for a tuning panel,
   * > never something to do per frame.
   */
  private applyFog(): void {
    const { color, mode, density, near, far } = this.fogSettings;

    this.scene.fog =
      mode === "linear"
        ? new Fog(color, near, far)
        : new FogExp2(color, density);
  }

  /** Recolour the sky dome — two uniforms, no texture, nothing to dispose. */
  private setSky(top: string, bottom: string): void {
    this.sky = [top, bottom];
    this.background?.setColors(top, bottom);
  }

  /**
   * Turn the carousel — what the page's buttons are wired to.
   *
   * @param step - `1` brings the next work to the front, `-1` the previous.
   */
  turnCarousel(step: number): void {
    if (!this.carousel) return;
    this.carousel.turn(step);
    // The page names the work at the front, so it has to be told which one that
    // now is. Reported from here rather than mirrored in React: the ring wraps,
    // and one owner of that arithmetic is enough.
    this.onCarouselIndex?.(this.carousel.activeIndex);
  }

  /**
   * Turn the two sharpest blur levels up or down — see `bloom.fine`.
   *
   * The pass keeps a per-level tint array and pushes it into the composite every
   * render, so muting a level is a write into that array and nothing else.
   */
  private setBloomFine(amount: number): void {
    const tints = this.bloomPass?.bloomTintColors;
    if (!tints) return;
    // The half-resolution level is the outline; it goes entirely at `0`. The
    // quarter-resolution one is only half the problem, so it keeps a floor.
    tints[0].setScalar(amount);
    tints[1].setScalar(0.4 + 0.6 * amount);
  }

  /**
   * Push the blur ceiling into the bokeh pass, converted from pixels of the page.
   *
   * The shader's `maxblur` is in UV, so a fixed value is a *wider* blur the
   * bigger the window — and past about ten pixels of radius the 41 taps stop
   * overlapping and a defocused edge breaks into ghost copies of itself. Holding
   * the ceiling in pixels keeps the taps the same distance apart on every
   * display, which is the whole difference between "looks right in the preview"
   * and "ghosts in the browser".
   */
  private writeMaxBlur(): void {
    const uniforms = this.bokehUniforms;
    if (!uniforms) return;
    const width = this.container.clientWidth || window.innerWidth;
    uniforms.maxblur.value =
      (this.maxBlurPixels * this.focusFade) / Math.max(width, 1);
  }

  /** The bloom's high-pass uniforms, named. */
  private get bloomHighPass(): HighPassUniforms {
    return this.bloomPass?.highPassUniforms as unknown as HighPassUniforms;
  }

  /** The CRT pass's live uniforms, named. */
  private get crtUniforms(): CrtUniforms | null {
    return (this.crtPass?.uniforms as CrtUniforms | undefined) ?? null;
  }

  /**
   * `BokehPass.uniforms` is typed as a bare object upstream; this names the
   * three uniforms the pass actually carries.
   */
  private get bokehUniforms(): BokehUniforms | null {
    if (!this.bokehPass) return null;
    return this.bokehPass.uniforms as unknown as BokehUniforms;
  }

  private bokehUniform(name: keyof BokehUniforms): number {
    return this.bokehUniforms?.[name].value ?? 0;
  }

  /** Same story as `bokehUniforms`: typed as a bare object upstream. */
  private get filmUniforms(): FilmUniforms | null {
    if (!this.filmPass) return null;
    return this.filmPass.uniforms as unknown as FilmUniforms;
  }

  /**
   * The model ships a white studio floor barely wider than the wall of
   * televisions. It is darkened to the room's colour and **stretched**: at its
   * shipped size the far edge lands where the fog is only part-way opaque, and
   * an edge you can still see is a hard line between floor and sky.
   */
  private prepareFloor(model: Group): void {
    const floor = model.getObjectByName("Plane");
    if (!(floor instanceof Mesh)) return;

    const { floorColor, floorScale } = this.config.environment;
    floor.scale.x *= floorScale;
    floor.scale.z *= floorScale;
    floor.updateWorldMatrix(true, false);
    this.floorY = floor.getWorldPosition(this.scratch).y;

    const material = Array.isArray(floor.material)
      ? floor.material[0]
      : floor.material;
    if (!(material instanceof MeshStandardMaterial)) return;

    const dark = material.clone();
    dark.color = new Color(floorColor);
    // A touch of gloss so the screens leave a smear on it.
    dark.roughness = Math.min(material.roughness, 0.55);
    dark.metalness = 0.15;
    floor.material = dark;
    this.floorMaterial = dark;
  }

  private async load(modelUrl: string): Promise<void> {
    // The GLB ships Draco-compressed geometry. The decoder is served from
    // `public/draco/` rather than a CDN — a third-party round trip on the
    // critical path is exactly what the asset budget cannot afford.
    const dracoLoader = new DRACOLoader().setDecoderPath(DRACO_DECODER_PATH);
    const loader = new GLTFLoader().setDRACOLoader(dracoLoader);

    try {
      const gltf = await loader.loadAsync(modelUrl);
      if (this.disposed) {
        disposeObject(gltf.scene);
        return;
      }
      await this.onModelLoaded(gltf.scene, gltf.animations);
    } finally {
      dracoLoader.dispose();
    }
  }

  private async onModelLoaded(
    model: Group,
    clips: AnimationClip[],
  ): Promise<void> {
    this.model = model;
    this.scene.add(model);

    this.playClips(model, clips);
    this.prepareFloor(model);
    this.prepareFigure(model);
    this.screens = new TvScreens(model, this.screenVideos, {
      glow: this.config.environment.screenGlow,
      overrides: this.screenVideoOverrides,
      glowScale: this.screenGlowScale,
    });

    // After the screens: each flyer is a clone, and it should carry the material
    // that already has the video on it rather than the still it shipped with.
    const [, baseY, baseZ] = this.config.camera.position;
    const { dolly, rise, carousel } = this.config.scroll;
    const cameraRest = this.camera.position
      .clone()
      .setY(baseY + rise)
      .setZ(baseZ + dolly);

    this.cameraRest.copy(cameraRest);
    this.carousel = new TvCarousel(model, this.scene, cameraRest, carousel);

    // The visibility gate ran before the model existed, so adopt its verdict now.
    this.screens.setPlaying(this.unsubscribe !== null);
    if (this.pointerEnabled) this.hover = new TvHover(model, this.config.hover);

    // Compile before the first visible frame — a program linked mid-drift is a
    // stall the user sees.
    //
    // **Everything, including what is hidden.** `compile` walks the *visible*
    // graph, and half of this scene starts invisible: the carousel's clones
    // before their entrance, the lines standing in the fog, the dust. Measured
    // before this: 36 programs after the loader and 37 by a quarter of the way
    // down the page — that one extra link is a stall in the middle of a scroll.
    // Shown for the compile, put back straight after.
    const hidden: Object3D[] = [];
    this.scene.traverse((child) => {
      if (child.visible) return;
      hidden.push(child);
      child.visible = true;
    });
    await this.renderer.compileAsync(this.scene, this.camera);
    // And one throwaway frame through the **complete chain**, still with
    // everything visible: `compile` links the scene's own materials, but the
    // composer's passes allocate their targets and the bokeh renders its depth
    // material on their first use. That first use is otherwise somewhere in the
    // middle of a scroll (`optimize-3d-scene` §3.4).
    this.composer?.render();
    for (const child of hidden) child.visible = false;
    // The dust is a scene of its own, so the line above never reaches it.
    await this.dust?.prewarm(this.renderer, this.camera);
    if (this.disposed) return;
    // First frame carries no delta — `lastFrameTime` is still 0.
    this.renderFrame(performance.now());
    // Loaded, compiled, and one real frame on the canvas: the earliest moment at
    // which lifting the curtain shows a finished room rather than a black box.
    markSceneReady();
  }

  /**
   * Start the GLB's own animation — the figure's skeletal clip.
   *
   * Under `prefers-reduced-motion` the clip is applied once and left there: the
   * figure keeps its authored pose instead of the skeleton's bind pose, without
   * looping motion nobody asked for.
   */
  private playClips(model: Group, clips: AnimationClip[]): void {
    if (clips.length === 0) return;

    this.mixer = new AnimationMixer(model);
    clips.forEach((clip) => this.mixer?.clipAction(clip).play());

    if (!prefersReducedMotion()) return;
    this.mixer.update(0);
    this.mixer = null;
  }

  /**
   * Drives both the camera drift and the hover pick. The listener is not
   * attached at all when `pointerEnabled` is false — "attach and ignore" still
   * costs an event per mouse move.
   */
  private watchPointer(): void {
    if (!this.pointerEnabled) return;

    const handlePointerMove = (event: PointerEvent): void => {
      const x = (event.clientX / window.innerWidth) * 2 - 1;
      const y = -((event.clientY / window.innerHeight) * 2 - 1);

      this.pointerX.start(x);
      this.pointerY.start(y);

      // Picking uses the raw position: the camera may still be easing toward
      // the cursor, but the cursor is already over the television.
      this.pointerNdc.set(x, y);
      this.pointerMoved = true;
    };

    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    this.teardown.push(() =>
      window.removeEventListener("pointermove", handlePointerMove),
    );
  }

  /**
   * Desktop only: iOS Safari fires `resize` every time the URL bar collapses,
   * and rebuilding the framebuffer mid-scroll reads as a whole-scene flash.
   */
  private watchResize(): void {
    if (isMobile()) return;

    // Coalesced into the frame loop — never resize inside the event.
    const handleResize = (): void => {
      this.resizePending = true;
    };
    window.addEventListener("resize", handleResize, { passive: true });
    this.teardown.push(() =>
      window.removeEventListener("resize", handleResize),
    );
  }

  /**
   * Stop drawing while something opaque is over the whole window.
   *
   * The team block is a panel that slides up and covers the frame completely,
   * and a canvas rendering behind it costs exactly as much as one nobody has
   * covered — bloom, defocus and all — while holding seven video decoders open.
   * Everything the scene shows is derived from the scroll rather than
   * integrated, so the frame it draws on the way back is correct without having
   * drawn any of the ones in between.
   */
  setCovered(covered: boolean): void {
    if (this.covered === covered) return;
    this.covered = covered;
    // Whatever the pointer was on is behind an opaque panel now, and the loop
    // that would have noticed it leaving is about to stop. Said plainly here,
    // or the chip from the last television the cursor crossed hangs over the
    // team block and the studio's own words.
    if (covered && this.hoverLabel !== null) {
      this.hoverLabel = null;
      this.onHoverHint?.(null);
    }
    this.syncRendering();
  }

  /** Render only while the canvas is on screen, uncovered, and the tab is in front. */
  private watchVisibility(): void {
    const sync = (): void => this.syncRendering();

    const observer = new IntersectionObserver(
      ([entry]) => {
        this.onScreen = entry.isIntersecting;
        this.syncRendering();
      },
      // One viewport of slack, so the scene is already warm when it arrives.
      { rootMargin: "100%" },
    );
    observer.observe(this.container);

    document.addEventListener("visibilitychange", sync);
    this.teardown.push(() => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
    });

    sync();
  }

  /** The three things that decide whether a frame is worth drawing. */
  private syncRendering(): void {
    this.setRendering(this.onScreen && !this.covered && !document.hidden);
  }

  private setRendering(active: boolean): void {
    if (this.disposed || active === (this.unsubscribe !== null)) return;

    // A scene nobody is looking at must not keep video decoders running either.
    this.screens?.setPlaying(active);

    if (!active) {
      this.unsubscribe?.();
      this.unsubscribe = null;
      return;
    }
    // Drop the stale timestamp: the gap since the scene last drew is not time
    // the animation should skip through.
    this.lastFrameTime = 0;
    this.unsubscribe = subscribeToTicker(
      this.renderFrame,
      () => this.framerate,
    );
  }

  /**
   * Rack focus: the lens pulls onto the television under the pointer and lets it
   * go when the pointer leaves.
   *
   * The goal is re-read every frame rather than set on hover — a hovered
   * television is rising and drifting, so its depth keeps changing while it is
   * held. The spring makes the pull an ease; writing the depth straight into the
   * uniform would snap between planes.
   */
  private pullFocus(): void {
    const uniforms = this.bokehUniforms;
    if (!uniforms) return;

    // The epilogue holds the lens on the set it is pulling back from; otherwise
    // whatever the pointer is on wins, and failing that the resting plane.
    const goal =
      this.epilogueFocus ||
      this.hover?.focusDepth(this.camera) ||
      this.restingFocus;
    if (this.focus.goal !== goal) this.focus.start(goal);

    uniforms.focus.value = this.focus.get();
  }

  /**
   * Dissolve the figure before the lens flies through it.
   *
   * Its four meshes share one material, so one `opacity` covers all of them.
   * `transparent` is switched on once, at load: flipping it at runtime changes a
   * shader define and recompiles the material mid-flight.
   */
  private fadeFigure(epilogue: number): void {
    if (!this.figureMaterial) return;

    const t = phase(this.scroll, this.config.scroll.figureFade);
    // Gone for the flight and the carousel, and back for the epilogue: the same
    // figure, dissolved out of one shot and into another.
    const opacity = Math.max(1 - t, epilogue);

    this.figureMaterial.opacity = opacity;
    if (this.figure) this.figure.visible = opacity > 0.01;
  }

  /**
   * Carry the sky from its opening colour to the scroll's.
   *
   * Every frame, and cheaply: the sky is a dome with the gradient in its shader,
   * so this is two uniforms. It used to be a canvas texture, which had to be
   * repainted in coarse steps because each one cost an upload — and, once the
   * texture was mapped as an environment to fix the horizon, cost a PMREM
   * conversion on top. See [[tv-sky]].
   */
  private driftSky(travel: number): void {
    const blended = new Color(this.sky[0]).lerp(new Color(this.skyDrift), travel);
    this.background?.setColors(`#${blended.getHexString()}`, this.sky[1]);
  }

  /**
   * Read the page's scroll once per frame and low-pass it.
   *
   * Once per frame inside the loop, never in a scroll handler: a handler that
   * also writes anything forces a layout on every scroll event. The smoothing is
   * frame-rate independent, and a jump past `snapAbove` — a page load restoring
   * a position, an anchor — is taken whole rather than crawled to.
   */
  /**
   * Read the page's **shared** low-passed progress.
   *
   * The scene used to keep a filter of its own, which meant the room eased while
   * the panels and the copy over it stepped — and a scroll where two things move
   * at different rates is a scroll that feels like it catches. One filter for the
   * page now; see `lib/animation/scroll-progress.ts`.
   */
  private advanceScroll(time: number): void {
    this.scroll = smoothScrollProgress(time);
  }

  /**
   * What the label over this television says.
   *
   * Looked up by the **name of the texture on its screen**, which is the same
   * key the videos are matched on — so which set is which case is decided in
   * the model, not by a list of node names that a re-export would invalidate.
   * Anything unrecognised (the noise sets, the stills) gets the fallback, which
   * is the line inviting a project onto it.
   *
   * Cached per television: the answer cannot change, and the alternative is a
   * `traverse` every frame the pointer moves.
   */
  private captionFor(target: Object3D): TvHoverHint {
    const known = this.captions.get(target);
    if (known !== undefined) return known;

    // **The screen's texture, not the first one found.** A television is mostly
    // casing, and the casing is textured too — reading whatever came first in
    // the traversal handed out case names by the shape of the model rather than
    // by what was playing, which is how sets showing noise ended up named after
    // work.
    let texture = "";
    target.traverse((child) => {
      if (texture || !(child instanceof Mesh)) return;
      if (!/^screen[\s_]*\d+$/i.test(child.name)) return;
      const material = Array.isArray(child.material)
        ? child.material[0]
        : child.material;
      const name =
        material instanceof MeshStandardMaterial ? material.map?.name : null;
      if (name) texture = name.trim().toLowerCase();
    });

    // Whether the texture is one of the named ones is the whole difference
    // between the two chips: a case is worth an arrow, noise is not.
    const named = this.captionLabels.byTexture[texture];
    const hint: TvHoverHint = named
      ? { text: named, kind: "case" }
      : { text: this.captionLabels.fallback, kind: "unknown" };
    this.captions.set(target, hint);
    return hint;
  }

  /** Aim the hover spring, and only when the answer has changed. */
  private setClosingLift(wanted: boolean): void {
    if (this.closingWanted === wanted) return;
    this.closingWanted = wanted;
    this.closingLift.start(wanted ? 1 : 0);
  }

  /**
   * Tell the page where the last shot is: how far it is revealed, and where the
   * television's left edge falls on screen.
   *
   * The edge is what the line under the closing words is cut to. It is only
   * measured while the shot is actually on — the projection is eight corners
   * through the view matrix, and there is no reason to pay for it over the rest
   * of the page.
   */
  private reportClosingShot(reveal: number): void {
    if (!this.onClosingShot) return;
    if (reveal <= 0 && this.closingReported <= 0) return;

    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.closingBoxWidth = width;
    this.closingBoxHeight = height;
    this.closingReported = reveal;
    this.onClosingShot({ reveal, edgeAt: this.closingEdgeAt });
  }

  /**
   * Where the closing set's silhouette starts, at height `y` on screen.
   *
   * The projected box is a hexagon on screen; this walks its **twelve edges**,
   * takes every one that straddles `y`, and returns the leftmost crossing. That
   * is the left boundary of the shape at exactly the height the caller cares
   * about — which is the whole reason this is not one cached minimum.
   */
  private readonly closingEdgeAt = (y: number): number => {
    const width = this.closingBoxWidth;
    const height = this.closingBoxHeight;
    if (!this.closingSet || width <= 0 || height <= 0) return width;

    // **Answered from the last one unless the shot has moved.** The page asks
    // every frame and at the same height every time; the rays below are only
    // worth casting when the scroll has pulled the lens back a little further or
    // the hover has turned the set. Every path writes `cache.value` — one that
    // did not left the cache holding its initial zero while the keys said it was
    // fresh, and the rule stayed a pixel wide for the rest of the act.
    const cache = this.closingEdgeCache;
    const lift = this.closingLift.get();
    if (
      cache.y === y &&
      Math.abs(cache.scroll - this.scroll) < 0.0004 &&
      Math.abs(cache.lift - lift) < 0.01
    ) {
      return cache.value;
    }
    cache.y = y;
    cache.scroll = this.scroll;
    cache.lift = lift;

    // The set's **real** outline at this height, found by asking. Projecting its
    // bounding box looked cheaper and is not usable: this set stands close
    // enough to the lens for a corner to fall behind the near plane, and a
    // projected box with one corner behind the camera is not a shape — it is
    // turned inside out, and the "leftmost point" it reports is nonsense.
    //
    // A sweep across the frame for the first hit, then two bisections to sharpen
    // it. Twenty rays against one object at the very outside, on the handful of
    // frames where the shot has moved.
    const hit = (x: number): boolean =>
      this.carousel?.frontHits(
        this.pointerProbe.set((x / width) * 2 - 1, 1 - (y / height) * 2),
        this.camera,
      ) ?? false;

    const step = width / 16;
    let found = -1;
    for (let x = 0; x <= width; x += step) {
      if (!hit(x)) continue;
      found = x;
      break;
    }
    if (found < 0) {
      // Nothing of the set at this height: the rule runs the full width.
      cache.value = width;
      return width;
    }

    let low = Math.max(found - step, 0);
    let high = found;
    for (let pass = 0; pass < 3; pass += 1) {
      const middle = (low + high) / 2;
      if (hit(middle)) high = middle;
      else low = middle;
    }
    cache.value = high;
    return high;
  };

  /**
   * Put the closing screen on the set the last shot is built around, and take it
   * off again on the way back up.
   *
   * There is no crossfade and none is wanted: this runs while the black is
   * total, so the swap is as invisible as the figure being walked across the
   * room under the same cover. The still is fetched the first time it is needed
   * rather than at start-up — it is one image nobody scrolling half the page
   * will ever reach.
   */
  private dressClosingSet(): void {
    const wanted = this.staged > 0 && this.finalShot !== undefined;
    // **Always the same set** — see `carousel.closingIndex`. Hung on the live
    // front, the closing picture landed on a different television for every case
    // a visitor stopped on, and cropped on the widescreen one.
    const front = this.carousel?.closing ?? null;

    if (!wanted) {
      this.closingSet?.setScreenStill(null);
      this.closingSet = null;
      return;
    }
    if (!front) return;

    if (this.closingSet === front) {
      // **Re-asked every frame it is up.** The answer is read off the set as the
      // lens sees it, and when it is first dressed the lens is still crossing
      // the black and the ring has not yet been placed for the last shot — the
      // reading is a frame stale and taken mid-move. Cheap enough to keep
      // asking (three vertices through a matrix) and only written when it
      // changes, which in practice is once, on the frame after the set lands.
      const reads = front.screenReadsMirrored(this.camera);
      if (reads !== null && reads !== this.closingMirrored) {
        this.closingMirrored = reads;
        front.setScreenStill(
          this.closingTexture,
          (this.screens?.glow ?? 1) * CLOSING_GLOW,
          reads,
        );
      }
      return;
    }

    if (!this.closingTexture && this.finalShot) {
      const texture = new TextureLoader().load(this.finalShot.image);
      texture.colorSpace = SRGBColorSpace;
      // The same reason the videos flip: glTF UVs have their origin top-left,
      // and a loaded texture defaults the other way.
      texture.flipY = false;
      this.closingTexture = texture;
    }

    // The ring can only have been turned before the black, so this changes at
    // most once — but a set that has been dressed and left behind has to be
    // undressed, or two screens end up carrying the call to action.
    this.closingSet?.setScreenStill(null);
    this.closingSet = front;
    // Whether this set shows its picture reversed, as the lens sees it — see
    // `TvFlyer.screenReadsMirrored`. Re-asked on the frames after this one,
    // because the set is still being carried into place on this one.
    this.closingMirrored = front.screenReadsMirrored(this.camera) ?? false;
    // A fraction of the wall's glow: this still is nearly white where the videos
    // are mostly dark, and anywhere near the wall's setting the bloom swallowed
    // the words printed on it whole — measured on the last shot, not guessed.
    front.setScreenStill(
      this.closingTexture,
      (this.screens?.glow ?? 1) * CLOSING_GLOW,
      this.closingMirrored,
    );
  }

  /**
   * How far down the dolly the flight has got, from its share of the scroll.
   *
   * **Two straight legs**, not two eased ones. Easing each half meant the lens
   * came to a stop in the middle of the flight and set off again, and a camera
   * that slows down where nothing happens reads as the page hesitating. Both
   * legs are linear now — the wheel turns, the lens moves, at one rate per leg
   * — and the gear change at `at` is kept only because the room and the corridor
   * past it genuinely want different rates. It is a mild one (see
   * `flightSplit`), not the 3× it used to be.
   */
  private flightTravel(progress: number): number {
    const { at, travel } = this.config.scroll.flightSplit;
    if (progress < at) return travel * (progress / Math.max(at, 0.0001));
    return travel + (1 - travel) * ((progress - at) / Math.max(1 - at, 0.0001));
  }

  private applySize(): void {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;

    // Re-derived on every resize, not just at construction: the ratio is capped
    // by a **fragment budget**, so it depends on how big the window has become.
    //
    // **The composer owns its own render targets**, and it keeps whatever ratio
    // it was built with unless it is told otherwise — so clamping the renderer
    // and leaving the composer alone throws the entire saving away on the post
    // chain, which is where nearly all of the fill is. `optimize-3d-scene` §6.
    const ratio = clampedPixelRatio(this.config.dpr, { width, height });
    this.renderer.setPixelRatio(ratio);
    this.composer?.setPixelRatio(ratio);
    // `false`: CSS owns the canvas box, three only owns the drawing buffer.
    this.renderer.setSize(width, height, false);
    this.composer?.setSize(width, height);
    // A mote's size is in device pixels, so it has to know how many there are.
    this.dust?.setSize(width * ratio, height * ratio);
    // The scanlines are spaced in **CSS** pixels, not device ones: two device
    // pixels apart is under a pixel of the page on a dense display, and what
    // should read as lines flattens into a uniform dimming.
    this.crtUniforms?.uResolution.value.set(width, height);
    this.writeMaxBlur();
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private readonly renderFrame = (time: number): void => {
    if (this.disposed) return;

    if (this.resizePending) {
      this.resizePending = false;
      this.applySize();
    }

    if (this.mixer) {
      const elapsed = this.lastFrameTime
        ? (time - this.lastFrameTime) / 1000
        : 0;
      // **The clip stops once the last shot is staged.** He is a silhouette a
      // metre and a half from the lens there, and a walking silhouette that
      // close changes shape and place on every frame — which is the *scene*
      // moving, not the shot. It is the same body the opening uses, where the
      // motion belongs; here the frame is a closing card and holds still. It
      // starts again the moment the scroll leaves the act, so coming back up
      // finds the room alive.
      this.mixer.update(this.staged >= 1 ? 0 : Math.min(elapsed, MAX_FRAME_DELTA));
    }
    this.lastFrameTime = time;

    this.advanceScroll(time);

    // How far into the last act the scroll is. Everything the finale touches is
    // read from this one number, including how much of the rest of the scene is
    // still allowed to move.
    const finale = phase(this.scroll, this.config.scroll.finale.range);
    const epilogue = phase(this.scroll, this.config.scroll.epilogue.reveal);

    const { pitch, position } = this.config.camera;
    const { maxPitch, maxYaw } = this.config.parallax;
    // The parallax lets go as the finale takes hold: the shot ends square to a
    // screen, and a lens still drifting after the cursor cannot be square to
    // anything.
    const steer = 1 - finale;
    this.camera.rotation.set(
      (pitch + this.pointerY.get() * maxPitch) * steer,
      -this.pointerX.get() * maxYaw * steer,
      0,
    );
    // The scroll flies the camera level down the room, out the far side of the
    // wall, to where the carousel assembles. Eased in, so the opening of the
    // scroll is a drift rather than a launch — and so the figure has room to
    // dissolve before the lens reaches it.
    const { dolly, rise, flight } = this.config.scroll;
    // Smoothstep, not `t²`: squaring leaves the lens travelling at full speed
    // when the scroll runs out, so the end of the section reads as the camera
    // hitting a wall. This one is still at both ends — and it changes gear
    // half way, so the empty corridor past the wall is not crossed in a blink.
    const travel = this.flightTravel(phase(this.scroll, flight));
    this.camera.position.y = position[1] + travel * rise;
    this.camera.position.z = position[2] + travel * dolly;
    // Fade the lines by where the lens has got to, not by the scroll: what they
    // answer to is being flown past.
    this.signs?.update(this.camera.position.z);

    // The rack focus leaves with the room it belongs to — and **comes back for
    // the last shot**, which is framed like the first one and wants the same
    // soft foreground. Written every frame rather than on a threshold, so
    // scrolling either way brings it back.
    const fade = Math.max(
      1 - phase(this.scroll, this.config.scroll.focusFade),
      phase(this.scroll, this.config.scroll.epilogue.reveal),
    );
    if (fade !== this.focusFade) {
      this.focusFade = fade;
      this.writeMaxBlur();
      // **A pass that blurs nothing is still a full-screen pass**, and this one
      // is 41 taps of it — the most expensive thing in the chain by a distance.
      // Skipped outright on the stretches where the ceiling is zero
      // (`optimize-3d-scene` §7), which is most of the page. The dust reads the
      // depth this pass renders, so it is told to stop trusting it at the same
      // moment.
      const blurring = fade > 0.001;
      if (this.bokehPass) this.bokehPass.enabled = blurring;
      this.dust?.setDepthMix(blurring ? 1 : 0);
    }

    this.fadeFigure(epilogue);
    // The sky comes back to the colour it opened on, and does it under the
    // black: by the time the last shot is visible the turn-over has already been
    // taken back.
    this.driftSky(travel * (1 - this.staged));
    // The dome rides with the lens, so the sky reads as being at infinity: the
    // horizon turns when the camera turns and holds still when it flies.
    this.background?.follow(this.camera);

    const seconds = time / 1000;
    const crt = this.crtUniforms;
    if (crt) crt.uTime.value = seconds;
    this.advanceFinale(finale, epilogue);
    this.advanceEpilogue(epilogue);
    this.carousel?.update(
      this.camera,
      this.scroll,
      finale,
      seconds,
      finale <= 0,
      // Past the finale the ring stops turning to face a moving lens, so the
      // pull-back can come at the set from its side; and its neighbours are not
      // part of the last shot.
      // The frozen viewpoint the set keeps facing: where the lens was when the
      // black began to lift, not where it has pulled back to.
      epilogue > 0 ? this.stage : null,
      epilogue > 0,
      this.staged > 0 ? this.stagedTelevision : null,
      this.staged > 0 ? this.stagedTelevisionSpin : null,
    );
    this.dust?.update(seconds, this.config.dust.speed);
    // **After the ring has been placed, not before.** This measures the closing
    // set by firing rays at it, and a frame earlier in the loop it is still
    // wherever the last frame left it — which, on the frames that matter (the
    // ones where the shot is being staged), is somewhere else entirely.
    this.reportClosingShot(epilogue);

    if (this.hover) {
      // Pick on pointer movement only — never while the camera is still easing.
      // The drift slides the wall out from under a stationary cursor, so a
      // re-pick mid-drift hands the hover to a neighbour: you point at the top
      // television and the one below it lights up. What was under the cursor
      // when the user aimed is what stays hovered until they move again.
      if (this.pointerMoved) {
        this.pointerMoved = false;
        // The wall first: past the flight it is behind the lens and there is
        // nothing of it to pick, so the ring answers for the cursor instead.
        this.hover.pick(this.pointerNdc, this.camera);
        const onRing =
          this.carousel?.pick(
            this.pointerNdc,
            this.camera,
            finale <= 0 && !this.hover.isHovering,
          ) ?? false;
        // The closing shot is picked on its own: the ring's pick lifts whatever
        // it finds, and this set has been *placed* — a hover that nudged it
        // would undo the blocking the last shot is built on.
        this.onClosingSet =
          this.staged >= 1 &&
          (this.carousel?.pickFront(this.pointerNdc, this.camera) ?? false);
        this.setClosingLift(this.onClosingSet);
        this.container.style.cursor =
          this.hover.isHovering || onRing || this.onClosingSet ? "pointer" : "";
      }
      this.hover.apply(time / 1000);
      this.pullFocus();

      // What the chip on the cursor says. Reported only on a change — the page
      // retypes the name whenever this fires, and the pointer moving inside one
      // television must not restart it.
      // **Both of these are gated on the act they belong to, not only on the
      // pick.** The pick runs on pointer movement, so a chip put up over the
      // wall and then scrolled away from stayed on the cursor for the rest of
      // the page — the pointer never moved, so nothing ever took it down. The
      // wall's chip lives exactly as long as the room does (the same window the
      // rack focus closes over), and the closing one only while the last shot
      // is staged.
      const inRoom =
        phase(this.scroll, this.config.scroll.focusFade) < 1 && finale <= 0;
      const held = inRoom ? this.hover.hoveredObject : null;
      const hint: TvHoverHint | null = held
        ? this.captionFor(held)
        : this.onClosingSet && this.staged >= 1 && this.finalShot
          ? { text: this.finalShot.label, kind: "closing" }
          : null;
      if (hint?.text !== this.hoverLabel) {
        this.hoverLabel = hint?.text ?? null;
        this.onHoverHint?.(hint);
      }
    }

    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);

    this.renderDust();
  };

  /**
   * The last act: the front screen turns to noise and swallows the frame.
   *
   * The camera is aimed at the screen's own centre and pushed in until the glass
   * is as tall as the frame — a distance derived from the screen's measured
   * height and the lens's field of view, not a number picked by eye, so it holds
   * if the carousel's `scale` or the camera's `fov` ever move. Everything else
   * the finale does — the noise fading up, the black closing over it, the
   * controls going away — hangs off the same progress.
   *
   * @param progress - `0`–`1`, linear across the act's window.
   */
  private advanceFinale(progress: number, epilogue: number): void {
    const { blackFade, fill } = this.config.scroll.finale;
    // Fades are measured against the *raw* share of the finale, not the eased
    // one: they are their own curves and should not inherit the camera's.
    const raw = phase(this.scroll, this.config.scroll.finale.range);

    // Under the team block, not instead of it: the block is opaque and covers
    // the frame, and this only guarantees that nothing of the staging behind it
    // can leak at an aspect the block does not quite fill. It lets go again on
    // the way out — the epilogue opens onto the picture.
    this.blackout(phase(raw, blackFade) * (1 - epilogue));
    // From a little before the ring finishes assembling until the finale takes
    // the scroll over — the whole stretch where the camera is holding still on
    // the carousel and a button is worth pressing.
    const [, assembled] = this.config.scroll.carousel.entrance;
    this.setControlsVisible(this.scroll > assembled - 0.05 && raw <= 0);

    if (progress <= 0 || !this.carousel) return;

    // **The closing set, not the live front.** Nothing this measures is used
    // before the black — the lens no longer pushes in, see below — and
    // everything it *is* used for belongs to the last shot: how far off the
    // glass the lens stands there, and therefore how big the television reads
    // and where that leaves the figure. Measured against whichever set the ring
    // was left turned to, the last shot came out differently for every case a
    // visitor stopped on, because the sets are different televisions.
    const front = this.carousel.closing;
    const screen = front?.screenCentre(this.finaleTarget);
    if (!front || !screen) return;

    // Half the glass over the tangent of half the field of view is exactly the
    // distance at which it is the frame — vertically from the fov itself,
    // horizontally from the fov times the aspect. **The nearer of the two wins**:
    // fitting only the height leaves the room showing down both sides of a wide
    // window, and `fill` divides rather than multiplies, because filling more of
    // the frame means standing closer to it, not further away.
    const [width, height] = front.screenSize();
    const tangent = Math.tan((this.camera.fov * Math.PI) / 360);
    const distance =
      Math.min(height / 2 / tangent, width / 2 / (tangent * this.camera.aspect)) /
      fill;

    this.finaleDistance = distance;
    this.finaleTarget.z += distance;
    // **The lens does not move.** It used to push in until the glass was the
    // whole frame, and the picture crossfaded to noise under it; the transition
    // into the team block is that block sliding up over the room instead, so
    // the zoom is gone. What is left of this act is the arithmetic: where the
    // glass is and how far off it the lens would have to stand to fill the
    // frame — which is the anchor [[#The epilogue]] pulls back from, and is
    // measured rather than travelled.
  }

  /**
   * The shot on the other side of the black.
   *
   * A **pull-back, not a cut**: it starts from exactly where the finale left the
   * lens — hard up against the front screen — and draws back and to the left
   * until the set is at the right of the frame, turned a quarter away, with the
   * figure close at the other edge. The set never moves; the lens does, which is
   * what keeps the two acts reading as one shot even though the black is total
   * across the join.
   *
   * The figure is *carried* here — the same one from the opening, walked across
   * the room while nothing can be seen of it, so the epilogue costs no second
   * skinned mesh and no second animation. That is the whole reason the staging
   * waits for the black to be total.
   *
   * @param progress - `0`–`1`, linear across the act's window.
   */
  private advanceEpilogue(progress: number): void {
    this.epilogueFocus = 0;
    // Staging runs over the **hold**, not the reveal: everything it moves has to
    // already be in place by the time the black starts lifting.
    this.staged = phase(this.scroll, this.config.scroll.epilogue.hold);
    this.dressClosingSet();

    if (this.staged <= 0 || !this.carousel) {
      // The figure goes back to where it stands in the opening shot. Scrolling
      // *up* out of the last act is how that gets found — without it the room
      // comes back with nobody in it.
      this.figure?.position.copy(this.figureRest);
      this.figure?.quaternion.copy(this.figureRestQuaternion);
      return;
    }

    const {
      cameraOffset,
      roll,
      referenceAspect,
      figureFollowsFrame,
      figurePortraitBias,
    } = this.config.scroll.epilogue;
    // Both subjects run from their `from` to their `to` across the reveal. Equal
    // ends — which is what ships — simply means they hold still while the lens
    // pulls back.
    this.place(
      this.stageTracks.television,
      progress,
      this.stagedTelevision,
      this.stagedTelevisionSpin,
    );
    // **The hover opens the set toward the lens.** Its `to` rotation has it a
    // quarter turned away; the pointer takes a little of that back — enough for
    // the glass to catch the frame more squarely, not enough to break the
    // blocking — and lifts the picture with it.
    // The pick only runs when the pointer moves, so scrolling out of the shot
    // has to put the set back itself.
    if (this.staged < 1) this.setClosingLift(false);
    const lift = this.closingLift.get();
    if (lift > 0.001) {
      this.stagedTelevisionSpin.y += lift * CLOSING_TURN;
      this.closingSet?.setScreenStill(
        this.closingTexture,
        (this.screens?.glow ?? 1) * (CLOSING_GLOW + lift * CLOSING_GLOW_LIFT),
        this.closingMirrored,
      );
    } else if (this.closingSet && this.closingWasLit) {
      this.closingSet.setScreenStill(
        this.closingTexture,
        (this.screens?.glow ?? 1) * CLOSING_GLOW,
        this.closingMirrored,
      );
    }
    this.closingWasLit = lift > 0.001;
    this.place(
      this.stageTracks.figure,
      progress,
      this.stagedFigure,
      this.stagedFigureSpin,
    );
    // Sideways offsets follow the window's shape; see `referenceAspect`. Clamped,
    // because a phone held upright would otherwise flatten the shot into a
    // straight-on one.
    const spread = Math.min(
      Math.max(this.camera.aspect / referenceAspect, 0.5),
      1.35,
    );
    // The lens is anchored to where the television **starts**, not to where the
    // track has carried it. Anchoring to the live glass looked simpler and made
    // the two impossible to tune apart: the camera followed the set everywhere
    // it was dragged, so moving it changed nothing on screen.
    //
    // Derived rather than remembered — the live glass, with the set's own
    // displacement taken back out. A remembered offset needs a first frame to
    // measure on, and the frame it picked was one where the finale had not
    // written a glass position yet; the shot opened somewhere back in the room.
    if (this.finaleDistance <= 0) return;
    this.scratch
      .copy(this.finaleTarget)
      .setZ(this.finaleTarget.z - this.finaleDistance)
      .sub(this.stagedTelevision)
      .add(this.trackFrom.fromArray(this.stageTracks.television.position.from));

    // Where the push-in left the lens: dead in front of that glass.
    this.stage.copy(this.scratch).setZ(this.scratch.z + this.finaleDistance);
    this.stageTarget
      .copy(this.scratch)
      .add(this.trackTo.fromArray(cameraOffset).setX(cameraOffset[0] * spread));

    if (progress > 0) {
      this.camera.position.lerpVectors(this.stage, this.stageTarget, progress);
      const { maxPitch, maxYaw } = this.config.parallax;
      // A **seventh** of the parallax, and it used to be a quarter: this shot is
      // a blocking, and the full drift swings the frame by a quarter of its
      // width. Even a quarter of it was enough to walk the figure at the left
      // edge in and out of frame as the cursor moved, which is what "he keeps
      // sliding further left" was.
      const drift = progress * 0.14;
      this.camera.rotation.set(
        // The scene's own resting pitch, not one of this act's — the last shot
        // is framed the way the first one is.
        this.config.camera.pitch + this.pointerY.get() * maxPitch * drift,
        -this.pointerX.get() * maxYaw * drift,
        // Rotation order is `YXZ`, so this one is applied first — a roll about
        // the lens's own axis, which is what throws the horizon off level. The
        // one thing this act still does to the framing.
        roll * progress,
      );
    }

    // Focus rides forward onto the **glass** — wherever the track has carried it
    // — so the figure a metre from the lens goes soft the way it does in the
    // opening shot.
    this.scratch.copy(this.finaleTarget).setZ(
      this.finaleTarget.z - this.finaleDistance,
    );
    this.epilogueFocus = this.camera.position.distanceTo(this.scratch);

    // **Nothing is relit for this shot.** It used to borrow two of the room's
    // spill lamps and lift the figure's and the floor's colours, which made a
    // handsome studio portrait and looked nothing like the rest of the page.
    // The brief is that the last shot reads as the first one: the same haze, the
    // same sky, the same figure — pure black, a silhouette against whatever is
    // brighter, which here is the glass it is standing next to. All that is left
    // of the staging is *where* things are, and the horizon being off level.

    if (this.figure) {
      // **His offset from the lens follows the frame's width.** He stands about
      // a metre and a half from it, which makes him the most shape-sensitive
      // thing in the shot: the frame widens and narrows with the window and a
      // world offset does not, so the numbers that put him at the left edge on
      // the design's window put him off a laptop's and clean off a phone's.
      //
      // The offset is measured from where the lens would stand on the **design's**
      // window, not from where it stands on this one. The lens's own sideways
      // offset already scales with the shape; anchoring to the live one scaled
      // that scaling a second time, and on a 21:9 screen it walked him past the
      // centre and into the television.
      // **Measured against where the lens ends up, not where it is.** The lens
      // is mid-pull-back for the whole reveal, so anchoring the correction to
      // its live position made his world place a function of the scroll: he
      // landed somewhere slightly different every time the act was entered, and
      // moved under you while you were in it. `stageTarget` is the one x that
      // does not change — the shot's own lens position — so what comes out of
      // this is a function of the **window shape alone**.
      const designLens = this.stageTarget.x - cameraOffset[0] * (spread - 1);
      const authored = this.stagedFigure.x - designLens;
      const follow = 1 + (spread - 1) * figureFollowsFrame;
      // Below the design shape, holding his place in frame would stand him in
      // front of the television — the frame is a third as wide and both subjects
      // are still in it — so he is walked toward the edge instead.
      const portrait = (1 - Math.min(spread, 1)) * figurePortraitBias;
      this.stagedFigure.x = this.stageTarget.x + authored * follow + portrait;
      this.figure.position.copy(this.stagedFigure);
      // World axes, on top of the figure's own: its Eulers carry an FBX Z-up
      // conversion, so adding to `rotation.y` there would not be a turn about
      // the room's vertical at all.
      this.figure.quaternion
        .copy(this.figureRestQuaternion)
        .premultiply(this.spinQuaternion.setFromEuler(this.stagedFigureSpin));
    }
  }

  /** Read one subject's tracks into a world position and a world-axis turn. */
  private place(
    track: TvEpilogueTrack,
    progress: number,
    position: Vector3,
    rotation: Euler,
  ): void {
    position.lerpVectors(
      this.trackFrom.fromArray(track.position.from),
      this.trackTo.fromArray(track.position.to),
      progress,
    );
    // Euler components lerp componentwise here on purpose: these are small
    // hand-set offsets, not orientations far enough apart for the shortest arc
    // to matter, and three numbers a panel can show beat a quaternion it cannot.
    this.trackFrom.fromArray(track.rotation.from);
    this.trackTo.fromArray(track.rotation.to);
    rotation.set(
      this.trackFrom.x + (this.trackTo.x - this.trackFrom.x) * progress,
      this.trackFrom.y + (this.trackTo.y - this.trackFrom.y) * progress,
      this.trackFrom.z + (this.trackTo.z - this.trackFrom.z) * progress,
    );
  }

  /** Tell the page how far the black has closed over the frame, `0`–`1`. */
  private blackout(amount: number): void {
    if (Math.abs(amount - this.blackAmount) < 0.001) return;
    this.blackAmount = amount;
    this.onBlackout?.(amount);
  }

  /** Tell the page whether the carousel's buttons are worth showing. */
  private setControlsVisible(visible: boolean): void {
    if (visible === this.controlsVisible) return;
    this.controlsVisible = visible;
    this.onControlsVisible?.(visible);
  }

  /**
   * The dust, drawn straight to the canvas once the composer is finished.
   *
   * It lives in a scene of its own, so nothing in the chain above has touched
   * it: `BokehPass` blurs on three concentric rings, and a mote — a bright dot a
   * couple of pixels wide — is the one input that makes that sampling pattern
   * legible, as a rosette of dots around every speck. Drawn here it keeps the
   * hard rim its own shader gives it.
   *
   * The cost is depth: the canvas depth buffer holds the composer's fullscreen
   * quad, not the room, so a mote behind a television draws over it. At this size
   * and this brightness that is invisible, and the alternative — a second full
   * scene render for depth — is not worth a two-pixel dot. It is also why the
   * cloud fades itself out with distance: without the room's fog, far motes would
   * read as a starfield hanging behind the wall.
   */
  private renderDust(): void {
    this.dust?.render(this.renderer, this.camera);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.unsubscribe?.();
    this.unsubscribe = null;
    this.teardown.forEach((off) => off());
    this.pointerX.stop();
    this.pointerY.stop();
    this.hover?.dispose();
    this.screens?.dispose();
    this.carousel?.dispose();
    this.carousel = null;
    this.closingTexture?.dispose();
    this.closingTexture = null;
    this.closingSet = null;
    this.dust?.dispose();
    this.signs?.dispose();
    this.signs = null;
    this.container.style.cursor = "";

    if (this.model) {
      this.mixer?.stopAllAction();
      this.mixer?.uncacheRoot(this.model);
      this.mixer = null;
      this.scene.remove(this.model);
      disposeObject(this.model);
    }
    this.composer?.dispose();
    this.composer = null;
    this.scene.fog = null;
    this.background?.dispose();
    this.environment?.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
