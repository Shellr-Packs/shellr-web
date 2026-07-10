/**
 * @fileoverview Video playing on the television screens.
 *
 * A screen is matched to its clip **by the name of the texture the model already
 * has on it** — `cat.mp4` replaces the texture named `cat`. That keeps the
 * mapping where it belongs, in the model: re-arranging which television shows
 * what is a change in Blender, not in this file, and a screen whose texture has
 * no matching file simply keeps its still image.
 *
 * Screens share materials in the export (eight materials across fourteen
 * screens), so a screen that gets a video also gets its own clone of the
 * material — assigning the texture to the shared one would change every screen
 * using it. Playback itself is shared: one `<video>` and one `VideoTexture` per
 * distinct file, because the decoder and the per-frame upload are the expensive
 * parts.
 *
 * 📖 Docs: obsidian/frontend/scene-3d.md
 */

import {
  Color,
  MeshStandardMaterial,
  Mesh,
  Object3D,
  SRGBColorSpace,
  VideoTexture,
} from "three";

export interface TvScreensOptions {
  /**
   * Emissive strength for the screens. A CRT is a light source: without this the
   * picture is just a bright rectangle and the bloom pass has nothing to catch.
   */
  glow: number;
  /**
   * Clip for one specific screen, keyed by its number — the escape hatch for
   * when the texture-name match cannot express what is wanted, e.g. three
   * screens share a texture and only one of them should play.
   */
  overrides?: Record<string, string>;
  /**
   * Per-screen multiplier on `glow`, keyed by screen number.
   *
   * A screen's light *is* its picture, so how hard a set glows is decided by
   * whatever is playing on it, not by the set. A clip on a white background
   * therefore drives the bloom several times harder than the dark footage the
   * one setting was tuned against, and blows out into a white slab that washes
   * the wall around it. Give those clips a fraction here rather than dimming
   * every screen: the dark ones need the full strength to read as lit at all.
   */
  glowScale?: Record<string, number>;
}

/**
 * The GLB names the screen quads `screen 1` … `screen 15`; GLTFLoader sanitises
 * node names on the way in, so what reaches the scene graph is `screen_13`.
 */
const SCREEN_NAME = /^screen[\s_]*(\d+)$/i;

interface Playback {
  video: HTMLVideoElement;
  texture: VideoTexture;
}

/** `/assets/hero/Videoes/color noise.mp4` → `color noise`. */
const clipKey = (url: string): string => {
  const file = decodeURIComponent(url).split("/").pop() ?? url;
  return file.replace(/\.[^.]+$/, "").trim().toLowerCase();
};

export class TvScreens {
  private readonly playbacks = new Map<string, Playback>();
  /** Each screen's material with its own share of the global glow. */
  private readonly materials: Array<{
    material: MeshStandardMaterial;
    scale: number;
  }> = [];
  /** Current emissive strength — the tuning panel reads it back. */
  glow: number;

  /**
   * @param model - the loaded GLB scene.
   * @param urls - video files; each is matched to the screen whose texture
   *   carries the same name. Unmatched files are ignored, and screens with no
   *   match keep the texture the model shipped with.
   */
  constructor(
    model: Object3D,
    urls: string[],
    { glow, overrides = {}, glowScale = {} }: TvScreensOptions,
  ) {
    this.glow = glow;
    const byKey = new Map(urls.map((url) => [clipKey(url), url]));

    model.traverse((child) => {
      if (!(child instanceof Mesh)) return;

      const source = Array.isArray(child.material)
        ? child.material[0]
        : child.material;
      if (!(source instanceof MeshStandardMaterial)) return;

      const match = SCREEN_NAME.exec(child.name);
      const url =
        (match ? overrides[match[1]] : undefined) ??
        byKey.get((source.map?.name ?? "").trim().toLowerCase());

      // A screen is either named like one, or wearing a texture a clip is named
      // after. The second half matters: the model has one screen that kept its
      // exported name (`defaultMaterial.057`) when the others were renamed, and
      // a name-only rule left it a still picture among playing neighbours.
      if (!match && !url) return;

      const material = source.clone();

      if (url) material.map = this.playbackFor(url).texture;

      // Every screen glows, video or still: the picture drives its own light,
      // which is what the bloom pass then blooms.
      material.emissive = new Color(0xffffff);
      material.emissiveMap = material.map;
      const scale = (match ? glowScale[match[1]] : undefined) ?? 1;
      material.emissiveIntensity = glow * scale;
      material.toneMapped = true;
      // Matte glass. The screens are lit from inside, so a specular response is
      // pure liability: it catches the room's point lights and drops a hard white
      // blob on the picture, which reads as a bug rather than as reflection.
      material.roughness = 1;
      material.metalness = 0;
      material.envMapIntensity = 0;
      material.needsUpdate = true;

      child.material = material;
      this.materials.push({ material, scale });
    });
  }

  /** Emissive strength of every screen — how hard they feed the bloom. */
  setGlow(glow: number): void {
    this.glow = glow;
    for (const { material, scale } of this.materials) {
      material.emissiveIntensity = glow * scale;
    }
  }

  /**
   * The texture playing a given clip, by its file name without the extension.
   *
   * The carousel's finale needs the noise the wall is already showing — a
   * reference, not a second decoder for the same file.
   */
  textureFor(clip: string): VideoTexture | null {
    const key = clip.trim().toLowerCase();
    for (const { texture } of this.playbacks.values()) {
      if (texture.name === key) return texture;
    }
    return null;
  }

  /** One decoder per file, however many screens show it. */
  private playbackFor(url: string): Playback {
    const existing = this.playbacks.get(url);
    if (existing) return existing;

    const video = document.createElement("video");
    // Spaces in filenames are legal on disk and not in a URL.
    video.src = encodeURI(url);
    video.loop = true;
    // Muted is what makes autoplay legal; `playsinline` stops iOS Safari from
    // taking the video fullscreen the moment it starts.
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.preload = "auto";

    const texture = new VideoTexture(video);
    // Carry the clip's name onto the texture that replaces the still. Anything
    // downstream that identifies a screen by what it is showing — the flying
    // television picks its source that way — would otherwise lose the thread the
    // moment the video is swapped in.
    texture.name = clipKey(url);
    texture.colorSpace = SRGBColorSpace;
    // glTF UVs have their origin top-left, which is why GLTFLoader turns its own
    // textures' `flipY` off. A VideoTexture defaults the other way and would
    // play upside down on these quads.
    texture.flipY = false;

    const playback = { video, texture };
    this.playbacks.set(url, playback);
    return playback;
  }

  /**
   * Follow the render loop: a scene nobody is looking at must not keep decoding.
   * Muted playback is always allowed, so a rejection means something else broke
   * and is worth reporting.
   */
  setPlaying(playing: boolean): void {
    for (const { video } of this.playbacks.values()) {
      if (!playing) {
        video.pause();
        continue;
      }
      video.play().catch((error: unknown) => {
        console.error("[tv-screens] playback refused:", error);
      });
    }
  }

  dispose(): void {
    for (const { video, texture } of this.playbacks.values()) {
      video.pause();
      // Drop the source so the decoder is released, not just idled.
      video.removeAttribute("src");
      video.load();
      texture.dispose();
    }
    this.playbacks.clear();

    this.materials.forEach(({ material }) => material.dispose());
    this.materials.length = 0;
  }
}
