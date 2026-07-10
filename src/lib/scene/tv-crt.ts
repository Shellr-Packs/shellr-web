/**
 * @fileoverview The glass the whole page is seen through.
 *
 * A last pass over the finished frame that says *cathode ray tube*: horizontal
 * scanlines, corners falling off into a vignette, a slow bright band rolling down
 * the screen, and a hair of colour fringing that grows toward the edges. The point
 * is that the room full of televisions should feel like it is being watched **on**
 * one — which only works while the effect stays under the threshold of notice.
 * Every strength here is a small number, and meant to be.
 *
 * It runs after `OutputPass` and the grain, in display space: scanlines are a
 * property of the glass, not of the light in the room, so tone-mapping them would
 * be the wrong way round.
 *
 * 📖 Docs: obsidian/frontend/scene-3d.md
 */

import { Vector2 } from "three";

export interface CrtUniforms {
  tDiffuse: { value: unknown };
  uTime: { value: number };
  uResolution: { value: Vector2 };
  uScanline: { value: number };
  uScanCount: { value: number };
  uVignette: { value: number };
  uRoll: { value: number };
  uRollSpeed: { value: number };
  uChroma: { value: number };
}

/**
 * Shader definition in the shape `ShaderPass` expects.
 *
 * Cloned by `ShaderPass` at construction, so this object is a template and the
 * live uniforms are the pass's own — read them off `pass.uniforms`.
 */
export const CRT_SHADER = {
  name: "CrtShader",

  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new Vector2(1, 1) },
    uScanline: { value: 0.16 },
    uScanCount: { value: 300 },
    uVignette: { value: 0.78 },
    uRoll: { value: 0.012 },
    uRollSpeed: { value: 0.06 },
    uChroma: { value: 0.0008 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform float uScanline;
    uniform float uScanCount;
    uniform float uVignette;
    uniform float uRoll;
    uniform float uRollSpeed;
    uniform float uChroma;

    varying vec2 vUv;

    void main() {
      vec2 uv = vUv;
      // Distance from the middle drives the fringing: a lens is sharp where you
      // are looking and splits colour at its edges, never uniformly.
      float edge = length(uv - 0.5);
      vec2 shift = vec2(uChroma * edge, 0.0);

      vec3 color = vec3(
        texture2D(tDiffuse, uv + shift).r,
        texture2D(tDiffuse, uv).g,
        texture2D(tDiffuse, uv - shift).b
      );

      // A **count** down the frame, the way a tube has a line count — not a
      // pitch in pixels. A fixed pitch is a fixed number of pixels however big
      // the window is, so the lines shrink against the picture as the window
      // grows and vanish on a large display while looking right on a small one.
      // Capped so the pitch never falls under about two pixels of the page,
      // which is where they stop being lines and start being moiré.
      float count = min(uScanCount, uResolution.y / 2.2);
      float scan = 0.5 + 0.5 * cos(uv.y * count * 6.28318531);
      color *= 1.0 - uScanline * scan;

      // The slow bright band an unsynced set drifts down its own picture. Wide
      // and soft: a sharp one is a bug, a broad one is a memory.
      float band = fract(uv.y * 0.6 - uTime * uRollSpeed);
      float glow =
        smoothstep(0.0, 0.12, band) * (1.0 - smoothstep(0.12, 0.4, band));
      color += glow * uRoll;

      // The tube's own falling-off corners. Elliptical rather than round, so it
      // follows the frame instead of cropping a circle out of it, and squared so
      // the middle stays untouched and only the outer third darkens.
      vec2 fromCentre = (uv - 0.5) * 2.0;
      float corner = dot(fromCentre, fromCentre);
      color *= 1.0 - uVignette * smoothstep(0.35, 1.9, corner);

      gl_FragColor = vec4(color, 1.0);
    }
  `,
};
