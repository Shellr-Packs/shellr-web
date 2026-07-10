/**
 * @fileoverview The lines the camera flies through.
 *
 * Between the wall and the carousel the flight crosses several seconds of empty
 * fog. These stand in it — one large and near, one small and further back — so
 * the lens reads as travelling *through* a space rather than across a void.
 *
 * **Geometry, not DOM.** They have to sit at real depths: the near one passes
 * the lens while the far one is still ahead of it, and that parallax is the
 * whole effect. A `div` has one depth, the screen's. Being in the scene also
 * gets them the fog, the defocus and the grain for nothing, which is what keeps
 * them part of the shot instead of a caption over it.
 *
 * **Canvas textures, not a text mesh.** A glyph mesh means a font atlas and a
 * loader for it; a 2D canvas already has the page's own webfont and draws it in
 * one call. Two quads, two textures, no dependency — see ADR-0028.
 *
 * 📖 Docs: obsidian/frontend/scene-3d.md
 */

import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  type Scene,
} from "three";

import type { SceneSignConfig, SceneSignsConfig } from "@/lib/scene/config";

/** Size the text is measured at, before it is scaled to fit the canvas. */
const PROBE = 100;
/** Widest canvas we will ask for — a texture, not a page, and 2K is plenty. */
const MAX_TEXTURE = 2048;
/** Padding around the line, in ems: the inline face overhangs its advance width. */
const PAD = 0.3;
/** Tallest line we will rasterise; past this the canvas is detail nobody sees. */
const MAX_FONT = 190;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const smoothstep = (value: number): number =>
  value * value * (3 - 2 * clamp01(value));

/**
 * How much of the reveal one letter's own ramp is squeezed into.
 *
 * The line does not fade as a block: every letter has a start of its own inside
 * the reveal and comes up at its own rate, the same way the page's headings do
 * ([[components/common]]'s `<ScatterText>`). At `0.55` the earliest letters are
 * fully up while the latest have not begun, which is what reads as *scattered*
 * rather than as a wipe.
 */
const LETTER_SPREAD = 0.55;
/** Steps the reveal is quantised to — a redraw per step, not per frame. */
const REVEAL_STEPS = 24;

/** A stable pseudo-random `0`–`1`; never `Math.random`, so a scrub replays. */
const seedOf = (index: number): number => {
  const value = Math.sin((index + 1) * 78.233) * 43758.5453;
  return value - Math.floor(value);
};

/** Progress of `value` across `[from, to]`, either direction, clamped. */
const span = (value: number, from: number, to: number): number =>
  clamp01((value - from) / (to - from || 1));

/**
 * The display face, as the page has it.
 *
 * `next/font` hashes the family name at build time, so it cannot be written
 * here. Nor can it be read off a custom property: `--font-display` is declared
 * in an `@theme inline` block, which Tailwind resolves **into the utilities**
 * and never emits as a variable — `getPropertyValue` on it comes back empty,
 * and the first pass of this silently rasterised the fallback grotesque.
 *
 * So ask the cascade the way the page does: a throwaway element carrying the
 * `font-display` class, and whatever `font-family` it computes to. Canvas takes
 * that string verbatim — the font shorthand is CSS.
 */
const displayFamily = (): string => {
  const probe = document.createElement("span");
  probe.className = "font-display";
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);
  const family = getComputedStyle(probe).fontFamily;
  probe.remove();
  return family || "sans-serif";
};

interface Sign {
  readonly config: SceneSignConfig;
  readonly canvas: HTMLCanvasElement;
  readonly texture: CanvasTexture;
  readonly material: MeshBasicMaterial;
  readonly mesh: Mesh;
  /** Where each letter starts, and its own speed — see `LETTER_SPREAD`. */
  letters: Array<{ char: string; x: number; seed: number }>;
  font: number;
  /** Last reveal the canvas was painted at, quantised. */
  painted: number;
}

export class TvSigns {
  private readonly scene: Scene;
  private readonly config: SceneSignsConfig;
  private readonly geometry = new PlaneGeometry(1, 1);
  private readonly signs: Sign[] = [];

  constructor(scene: Scene, signs: SceneSignConfig[], config: SceneSignsConfig) {
    this.scene = scene;
    this.config = config;

    for (const item of signs) {
      const canvas = document.createElement("canvas");
      const texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;

      const material = new MeshBasicMaterial({
        map: texture,
        color: config.color,
        transparent: true,
        // Off, so two lines that overlap on screen do not punch holes in each
        // other — they are stacked glass, not solids.
        depthWrite: false,
        opacity: 0,
      });

      const mesh = new Mesh(this.geometry, material);
      mesh.position.set(...item.position);
      mesh.visible = false;
      // Behind everything else that is transparent: the sets and the haze read
      // over the words, not under them.
      mesh.renderOrder = -1;
      scene.add(mesh);

      const sign: Sign = {
        config: item,
        canvas,
        texture,
        material,
        mesh,
        letters: [],
        font: 0,
        painted: -1,
      };
      this.signs.push(sign);
      this.draw(sign);
    }

    // The first draw can land before the webfont has arrived, in which case it
    // rasterised the fallback. Redraw once it is really there — the texture is
    // the same object, so nothing downstream has to know.
    void document.fonts?.ready.then(() => {
      for (const sign of this.signs) this.draw(sign);
    });
  }

  /**
   * Fade the lines by how far ahead of the lens they still are, once the lens is
   * clear of the wall.
   *
   * Distance, not scroll: it is the passing that the fade belongs to, and
   * distance is what "passing" means. But distance alone put the near line on
   * screen while the first scene's televisions were still all round it — six
   * units ahead of the lens is still inside the wall — so a second factor keeps
   * everything shut until the lens is past the last row of sets.
   *
   * @param cameraZ - the lens's world Z; the flight runs it down the room.
   */
  update(cameraZ: number): void {
    const [hold, gone] = this.config.fadeOut;
    const [shut, open] = this.config.clearOf;
    const clear = smoothstep(span(cameraZ, shut, open));

    for (const sign of this.signs) {
      // Each line lifts out of the fog on its own distances, so the far one
      // arrives as the near one is going past rather than beside it.
      const [appear, full] = sign.config.fadeIn ?? this.config.fadeIn;
      const ahead = cameraZ - sign.config.position[2];
      // The line's own arrival, which is what the letters are scattered across;
      // the departure stays a plain fade of the whole plane.
      const arriving = smoothstep(span(ahead, appear, full));
      const leaving = smoothstep(span(ahead, gone, hold));
      const opacity = clear * leaving * this.config.opacity;

      sign.material.opacity = opacity;
      sign.mesh.visible = opacity > 0.002 && arriving > 0.001;
      if (sign.mesh.visible) this.reveal(sign, arriving);
    }
  }

  dispose(): void {
    for (const sign of this.signs) {
      this.scene.remove(sign.mesh);
      sign.texture.dispose();
      sign.material.dispose();
    }
    this.signs.length = 0;
    this.geometry.dispose();
  }

  /**
   * Rasterise one line and size its quad to what came out.
   *
   * The font size is chosen from the measured width so the canvas lands under
   * `MAX_TEXTURE` however long the string is; the quad is then scaled by the
   * canvas's own proportions, which is what makes `size` mean *em height in
   * world units* rather than "whatever this string happened to need".
   */
  private draw(sign: Sign): void {
    const { canvas, texture, mesh, config } = sign;
    const context = canvas.getContext("2d");
    if (!context) return;

    const family = displayFamily();
    context.font = `400 ${PROBE}px ${family}`;
    const probe = context.measureText(config.text).width || PROBE;

    const fit = (MAX_TEXTURE / (probe + PROBE * PAD * 2)) * PROBE;
    const font = Math.max(24, Math.min(MAX_FONT, fit));
    const scale = font / PROBE;

    canvas.width = Math.ceil(probe * scale + font * PAD * 2);
    canvas.height = Math.ceil(font * 1.5);

    // Resizing the canvas resets every bit of context state, the font included.
    context.font = `400 ${font}px ${family}`;

    // Measure each letter once, so the reveal can paint them one at a time
    // without re-measuring a string every frame.
    sign.font = font;
    sign.letters = [];
    let x = font * PAD;
    [...config.text].forEach((char, index) => {
      sign.letters.push({ char, x, seed: seedOf(index) });
      x += context.measureText(char).width;
    });
    sign.painted = -1;

    mesh.scale.set(
      (canvas.width / font) * config.size,
      (canvas.height / font) * config.size,
      1,
    );
    this.reveal(sign, 1);
  }

  /**
   * Paint the line at a given point in its arrival, letter by letter.
   *
   * Each letter's ramp starts at `seed × LETTER_SPREAD` and runs over what is
   * left, so they all finish together and none of them starts in order. Redrawn
   * on a **quantised** reveal — two dozen steps across the whole arrival —
   * because a canvas repaint per frame for a line that takes half a second is
   * two dozen repaints' worth of work spread over thirty.
   */
  private reveal(sign: Sign, progress: number): void {
    const step = Math.round(clamp01(progress) * REVEAL_STEPS);
    if (step === sign.painted) return;
    sign.painted = step;

    const context = sign.canvas.getContext("2d");
    if (!context) return;
    const at = step / REVEAL_STEPS;

    context.clearRect(0, 0, sign.canvas.width, sign.canvas.height);
    context.font = `400 ${sign.font}px ${displayFamily()}`;
    context.textBaseline = "middle";
    context.textAlign = "left";

    const middle = sign.canvas.height / 2;
    for (const letter of sign.letters) {
      const start = letter.seed * LETTER_SPREAD;
      const alpha = clamp01((at - start) / (1 - LETTER_SPREAD));
      if (alpha <= 0) continue;
      context.globalAlpha = smoothstep(alpha);
      context.fillStyle = "#ffffff";
      context.fillText(letter.char, letter.x, middle);
    }
    context.globalAlpha = 1;

    sign.texture.needsUpdate = true;
  }
}
