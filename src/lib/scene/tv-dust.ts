/**
 * @fileoverview Dust drifting through the room.
 *
 * One `Points` object, one draw call, and **all of the motion in the vertex
 * shader**: each mote carries its home position and a seed, and the shader
 * wanders it around that home from a single `uTime` uniform. Doing it on the CPU
 * would mean rewriting and re-uploading a buffer of thousands of positions every
 * frame, which is exactly the per-frame allocation `optimize-3d-scene` §9 exists
 * to prevent.
 *
 * 📖 Docs: obsidian/frontend/scene-3d.md
 */

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Points,
  Scene,
  ShaderMaterial,
  Vector2,
  type Camera,
  type PerspectiveCamera,
  type Texture,
  type WebGLRenderer,
} from "three";

import type { SceneDustConfig } from "@/lib/scene/config";

const VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  uniform float uDrift;
  uniform float uViewportHeight;

  attribute vec3 aSeed;
  attribute float aScale;

  varying float vFade;
  varying float vDepth;

  void main() {
    // Three slow sines per axis, each at its own rate, so no two motes travel
    // the same path and none of them loop visibly.
    vec3 wander = vec3(
      sin(uTime * 0.7 + aSeed.x * 6.283),
      sin(uTime * 0.5 + aSeed.y * 6.283),
      cos(uTime * 0.6 + aSeed.z * 6.283)
    ) * uDrift;

    vec4 world = modelMatrix * vec4(position + wander, 1.0);
    vec4 view = viewMatrix * world;

    // Fade the ones nearly on top of the lens: a mote a few centimetres away
    // would otherwise cover a quarter of the screen. And fade the far ones out
    // too — the cloud is drawn outside the composer, so the scene's fog never
    // touches it, and undimmed specks at fifteen metres read as a starfield
    // behind the room rather than as dust in it.
    vDepth = -view.z;
    vFade =
      smoothstep(0.4, 2.0, vDepth) * (1.0 - smoothstep(5.0, 13.0, vDepth));

    gl_Position = projectionMatrix * view;
    // Scaled by the drawing buffer's height, or a mote is a fixed number of
    // pixels: plainly visible in a small window and invisible in a large one,
    // which is exactly how the dust came to look absent on a big screen.
    gl_PointSize = uSize * aScale * uViewportHeight / max(-view.z, 0.1);
  }
`;

const FRAGMENT = /* glsl */ `
  #include <packing>

  uniform vec3 uColor;
  uniform float uOpacity;
  uniform sampler2D uSceneDepth;
  uniform float uDepthMix;
  uniform vec2 uResolution;
  uniform vec2 uClip;

  varying float vFade;
  varying float vDepth;

  void main() {
    // A crisp disc, not a soft blob: full opacity out to the rim and only the
    // last fraction of the radius feathered, which is what stops a mote reading
    // as a smudge. The feather is what keeps the edge from aliasing.
    float d = length(gl_PointCoord - 0.5);
    float alpha = (1.0 - smoothstep(0.4, 0.5, d)) * uOpacity * vFade;

    #ifdef USE_SCENE_DEPTH
    // The cloud is drawn after the composer, so it has no depth buffer of its
    // own to test against — and without one it floats over the room, sitting on
    // the figure's silhouette like grain on the lens rather than dust in the
    // air. The bokeh pass already renders the scene's depth for its own blur;
    // this reads that, and sinks a mote out of sight as it passes behind
    // whatever is in front of it. Faded rather than clipped, or the boundary is
    // a hard edge that flickers as either one moves.
    vec2 screen = gl_FragCoord.xy / uResolution;
    float scene = -perspectiveDepthToViewZ(
      unpackRGBAToDepth(texture2D(uSceneDepth, screen)),
      uClip.x,
      uClip.y
    );
    // uDepthMix fades the occlusion out rather than a define switching it
    // off: the bokeh pass is skipped on the stretches where it blurs nothing,
    // and the depth it renders goes stale with it. A uniform costs a multiply;
    // a define costs a recompile in the middle of a scroll.
    alpha *= mix(1.0, 1.0 - smoothstep(0.0, 0.3, vDepth - scene), uDepthMix);
    #endif

    if (alpha < 0.01) discard;

    gl_FragColor = vec4(uColor, alpha);
  }
`;

export class TvDust {
  /**
   * The cloud gets a scene of its own, and is **not** part of the room's.
   *
   * It has to stay out of the `EffectComposer`: `BokehPass` blurs on three
   * concentric rings, and a mote — a bright dot a couple of pixels wide — is the
   * one input that makes that sampling pattern legible, drawing a rosette of
   * dots around every speck instead of a defocus disc. A layer the camera masks
   * off would keep it out of the composer too, but the extra render would still
   * walk the whole room's graph to draw one object. A second scene holds exactly
   * one.
   */
  private readonly scene = new Scene();
  private readonly points: Points;
  private readonly material: ShaderMaterial;

  /**
   * @param sceneDepth - the room's depth, as the bokeh pass already renders it.
   *   Without it the cloud has nothing to occlude against and simply floats over
   *   everything; the mobile tier, which builds no bokeh pass, is that case.
   */
  constructor(
    config: SceneDustConfig,
    count: number,
    camera: PerspectiveCamera,
    sceneDepth: Texture | null,
  ) {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 3);
    const scales = new Float32Array(count);
    const [x, y, z] = config.area;

    for (let i = 0; i < count; i += 1) {
      // Deterministic, not random: the same scene every load, and no `Math.random`
      // to make a screenshot comparison meaningless.
      const a = Math.sin(i * 12.9898) * 43758.5453;
      const b = Math.sin(i * 78.233) * 12345.6789;
      const c = Math.sin(i * 39.425) * 24634.6345;

      positions[i * 3] = (a - Math.floor(a) - 0.5) * 2 * x;
      positions[i * 3 + 1] = (b - Math.floor(b)) * y;
      positions[i * 3 + 2] = (c - Math.floor(c) - 0.5) * 2 * z;

      seeds[i * 3] = a - Math.floor(a);
      seeds[i * 3 + 1] = b - Math.floor(b);
      seeds[i * 3 + 2] = c - Math.floor(c);
      scales[i] = 0.4 + (c - Math.floor(c)) * 1.2;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    geometry.setAttribute("aSeed", new BufferAttribute(seeds, 3));
    geometry.setAttribute("aScale", new BufferAttribute(scales, 1));

    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uSize: { value: config.size },
        uDrift: { value: config.drift },
        uViewportHeight: { value: 1 },
        uColor: { value: new Color(config.color) },
        uOpacity: { value: config.opacity },
        uSceneDepth: { value: sceneDepth },
        uDepthMix: { value: 1 },
        uResolution: { value: new Vector2(1, 1) },
        uClip: { value: new Vector2(camera.near, camera.far) },
      },
      // Compiled in only when there is a depth texture to read: a sampler left
      // unbound is undefined behaviour, not a no-op.
      defines: sceneDepth ? { USE_SCENE_DEPTH: "" } : {},
      transparent: true,
      depthWrite: false,
      // The cloud is drawn to the canvas after the composer has finished, and
      // the canvas depth buffer holds nothing the room ever wrote — testing
      // against it is at best meaningless and at worst (an uninitialised buffer)
      // silently discards the whole cloud.
      depthTest: false,
      blending: AdditiveBlending,
    });

    this.points = new Points(geometry, this.material);
    // The shader moves the motes, so the bounding sphere three computed from the
    // buffer is a lie; without this they vanish whenever it decides they are off
    // screen.
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  /**
   * Told the drawing buffer's size — in *its* pixels, not CSS ones.
   *
   * The height keeps a mote's apparent size; both are what the depth lookup
   * turns `gl_FragCoord` into a texture coordinate with.
   */
  setSize(width: number, height: number): void {
    this.material.uniforms.uViewportHeight.value = height / 1000;
    (this.material.uniforms.uResolution.value as Vector2).set(width, height);
  }

  /** @param time - seconds; the only thing the whole cloud costs per frame. */
  /**
   * Link the cloud's program while the loader still owns the screen.
   *
   * The dust lives in a **scene of its own** ([[decisions-log]] ADR-0025), so
   * the main scene's `compileAsync` never sees it and its program would link on
   * whatever frame it first drew. `optimize-3d-scene` §3.
   */
  async prewarm(renderer: WebGLRenderer, camera: PerspectiveCamera): Promise<void> {
    await renderer.compileAsync(this.scene, camera);
  }

  /**
   * Whether the scene's depth is worth reading, `0`–`1`.
   *
   * The bokeh pass renders that depth as a side effect of its own blur, so on
   * the stretches where the blur is off the pass is skipped and the texture
   * stops being refreshed. Occluding against a stale depth buffer is worse than
   * not occluding at all — the motes would sink behind a room that has moved.
   */
  setDepthMix(amount: number): void {
    const uniform = this.material.uniforms.uDepthMix;
    if (uniform) uniform.value = amount;
  }

  update(time: number, speed: number): void {
    this.material.uniforms.uTime.value = time * speed;
  }

  /**
   * Drawn over the finished frame, once the composer has had its say.
   *
   * `autoClear` off, or the room is wiped and the dust is all that is left.
   */
  render(renderer: WebGLRenderer, camera: Camera): void {
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.scene, camera);
    renderer.autoClear = autoClear;
  }

  dispose(): void {
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    this.material.dispose();
  }
}
