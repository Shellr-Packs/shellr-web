/**
 * @fileoverview The sky the room stands in.
 *
 * A dome around the camera rather than `scene.background`, for two reasons that
 * both came out of the same bug report — *"the horizon seems to slide"*:
 *
 * 1. **A plain texture background is screen space.** three stretches it across
 *    the frame, so its horizon sits at the same height no matter where the
 *    camera looks or flies. Every other thing in the frame moves; the horizon
 *    does not, and the eye reads the difference as the horizon sliding.
 * 2. **An equirect texture background is cached past changing.** Giving the
 *    texture `EquirectangularReflectionMapping` does fix the direction — and
 *    quietly sends it through `PMREMGenerator`, whose result is cached against
 *    the texture object. Repaint the canvas and the sky never changes again;
 *    hand over a *new* texture per step, as the scroll's colour drift did, and
 *    every step pays for a PMREM conversion. Both were measured.
 *
 * The dome is geometry with the gradient in its fragment shader, so the colours
 * are two uniforms: the scroll can turn the sky over every frame for free, and
 * there is no texture to upload at all.
 *
 * 📖 Docs: obsidian/frontend/scene-3d.md
 */

import {
  BackSide,
  Color,
  Mesh,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  type PerspectiveCamera,
} from "three";

const VERTEX = /* glsl */ `
  varying vec3 vDirection;

  void main() {
    // The dome is a unit sphere, so its own vertex position *is* the direction
    // it is seen in — no need to reconstruct one from the camera.
    vDirection = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uBottom;
  uniform float uTopAngle;
  uniform float uHorizonAngle;

  varying vec3 vDirection;

  void main() {
    // Latitude, not screen height: this is what ties the gradient to the world.
    float latitude = asin(clamp(normalize(vDirection).y, -1.0, 1.0));
    // **Smoothstepped, not linear.** A linear ramp meets its own flat bottom
    // band at an angle, and that kink is a visible line across the sky — the
    // "blue strip" where the floor's far edge is supposed to disappear. Eased,
    // the two ends arrive flat and the join cannot be found.
    float k = smoothstep(
      0.0,
      1.0,
      clamp(
        (latitude - uHorizonAngle) / max(uTopAngle - uHorizonAngle, 0.001),
        0.0,
        1.0
      )
    );

    // Flat below the horizon angle, and flat above the top of the frame. The
    // lower band is load-bearing: fog colours geometry but never the sky, so
    // where the floor fades out the sky behind it has to already be the fog's
    // colour or the floor's far edge draws a line across the frame.
    gl_FragColor = vec4(mix(uBottom, uTop, k), 1.0);
  }
`;

export class TvSky {
  private readonly scene: Scene;
  private readonly mesh: Mesh;
  private readonly material: ShaderMaterial;

  /**
   * @param fov - the camera's vertical field of view, degrees. The gradient is
   *   laid out across the band the frame actually covers, so `horizon` keeps
   *   meaning "this far down the frame" the way it did when the sky was painted
   *   in screen space.
   * @param horizon - where the gradient flattens, `0` (top of frame) to `1`.
   * @param radius - how far out the dome sits; inside the camera's `far`.
   */
  constructor(
    scene: Scene,
    top: string,
    bottom: string,
    fov: number,
    horizon: number,
    radius: number,
  ) {
    this.scene = scene;

    const half = (fov * Math.PI) / 360;
    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uTop: { value: new Color(top) },
        uBottom: { value: new Color(bottom) },
        uTopAngle: { value: half },
        uHorizonAngle: {
          value: half - Math.min(Math.max(horizon, 0), 1) * 2 * half,
        },
      },
      side: BackSide,
      // It is the backdrop: never occludes, never occluded, always first.
      depthWrite: false,
      depthTest: false,
      // Raw colours, straight out the far end — the same treatment three gives a
      // background texture, and the reason the dome is not tone-mapped.
      toneMapped: false,
      fog: false,
    });

    this.mesh = new Mesh(new SphereGeometry(radius, 32, 16), this.material);
    this.mesh.renderOrder = -1;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  /** Two uniforms — the scroll's colour drift costs nothing per frame. */
  setColors(top: string, bottom: string): void {
    (this.material.uniforms.uTop.value as Color).set(top);
    (this.material.uniforms.uBottom.value as Color).set(bottom);
  }

  /**
   * Ride along with the camera, so the sky is effectively at infinity: rotating
   * the lens moves the horizon, flying down the room does not.
   */
  follow(camera: PerspectiveCamera): void {
    this.mesh.position.copy(camera.position);
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
