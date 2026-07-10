"use client";

// 📖 Docs: obsidian/frontend/scene-3d.md

import { useState } from "react";

import type {
  SceneSettings,
  Triple,
  TvEpilogueTrack,
  TvScene,
} from "@/lib/scene/tv-scene";

export interface SceneControlsProps {
  scene: TvScene;
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

/** Pre-Clipboard-API copy: select a detached textarea and let the browser take it. */
const copyBySelection = (text: string): boolean => {
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.select();

  const copied = document.execCommand("copy");
  field.remove();
  return copied;
};

interface VectorProps {
  label: string;
  value: Triple;
  step?: number;
  onChange: (value: Triple) => void;
}

/**
 * Three numbers, typed rather than dragged.
 *
 * A slider needs a range, and a coordinate in a room has no natural one; these
 * are read off the shot, nudged, and copied back into `config.ts`.
 */
const Vector = ({ label, value, step = 0.05, onChange }: VectorProps) => (
  <div className="flex flex-col gap-1">
    <span className="opacity-70">{label}</span>
    <span className="grid grid-cols-3 gap-1">
      {(["x", "y", "z"] as const).map((axis, index) => (
        <label key={axis} className="flex items-center gap-1">
          <span className="opacity-50">{axis}</span>
          <input
            type="number"
            step={step}
            value={value[index]}
            onChange={(event) => {
              const next: Triple = [...value];
              next[index] = event.target.valueAsNumber || 0;
              onChange(next);
            }}
            className="w-full rounded border border-foreground/20 bg-transparent px-1 py-0.5 tabular-nums"
          />
        </label>
      ))}
    </span>
  </div>
);

interface TrackProps {
  label: string;
  track: TvEpilogueTrack;
  onChange: (track: TvEpilogueTrack) => void;
}

/** One subject of the last shot: where it stands and how it is turned, at both ends. */
const Track = ({ label, track, onChange }: TrackProps) => (
  <div className="flex flex-col gap-2 border-l border-foreground/15 pl-2">
    <span className="font-medium">{label}</span>
    <Vector
      label="position - start"
      value={track.position.from}
      onChange={(from) =>
        onChange({ ...track, position: { ...track.position, from } })
      }
    />
    <Vector
      label="position - end"
      value={track.position.to}
      onChange={(to) =>
        onChange({ ...track, position: { ...track.position, to } })
      }
    />
    <Vector
      label="rotation - start (rad)"
      value={track.rotation.from}
      step={0.02}
      onChange={(from) =>
        onChange({ ...track, rotation: { ...track.rotation, from } })
      }
    />
    <Vector
      label="rotation - end (rad)"
      value={track.rotation.to}
      step={0.02}
      onChange={(to) =>
        onChange({ ...track, rotation: { ...track.rotation, to } })
      }
    />
  </div>
);

const Slider = ({ label, value, min, max, step, onChange }: SliderProps) => (
  <label className="flex flex-col gap-1">
    <span className="flex justify-between gap-4">
      {label}
      <output className="tabular-nums opacity-70">{value.toFixed(4)}</output>
    </span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(event.target.valueAsNumber)}
    />
  </label>
);

/**
 * Development-only tuning panel for the scene's lens and haze.
 *
 * It writes straight into the live passes, so a slider drag is a uniform write
 * rather than a pass rebuild — no shader recompile, no dropped render target.
 * The numbers here are for finding values; the values that ship still live in
 * `lib/scene/config.ts`, so copy them across once they are right.
 *
 * Mounted behind `process.env.NODE_ENV === "development"`, which the production
 * build folds to `false` and drops along with this module.
 */
export const SceneControls = ({ scene }: SceneControlsProps) => {
  const [settings, setSettings] = useState<SceneSettings>(() =>
    scene.settings.read(),
  );
  // Shut by default: the panel is for finding values, and the shot is what the
  // page is for. Its toggle stays on screen, so it is one click away.
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  /** Shown when the clipboard is refused — the values must never be lost. */
  const [snippet, setSnippet] = useState<string | null>(null);

  /**
   * Selection copy first, Clipboard API second.
   *
   * The modern API is the better one and the wrong one to lead with here: in an
   * embedded browser its permission prompt can leave the promise **pending
   * forever**, so an `await` on it swallows the click and the button does
   * nothing at all. The selection path is synchronous, needs no permission, and
   * either works on the spot or returns `false`.
   */
  const copyConfig = (): void => {
    const text = scene.settings.snippet();

    const done = (): void => {
      setSnippet(null);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 4000);
    };

    if (copyBySelection(text)) {
      done();
      return;
    }

    navigator.clipboard
      .writeText(text)
      // Both paths can be refused outright — an embedded browser may grant
      // neither. Showing the snippet is the one thing that cannot fail, and
      // losing a tuning session to a permission dialog would be worse than ugly.
      .then(done, () => setSnippet(text));
  };

  const update = (patch: Partial<SceneSettings>): void => {
    if (patch.bloom) scene.settings.setBloom(patch.bloom);
    if (patch.depthOfField) scene.settings.setDepthOfField(patch.depthOfField);
    if (patch.atmosphere) scene.settings.setAtmosphere(patch.atmosphere);
    if (patch.lighting) scene.settings.setLighting(patch.lighting);
    if (patch.crt) scene.settings.setCrt(patch.crt);
    if (patch.epilogue) scene.settings.setEpilogue(patch.epilogue);
    setSettings((current) => ({ ...current, ...patch }));
  };

  const { bloom, depthOfField, atmosphere, lighting, crt, epilogue } = settings;
  const patchCrt = (patch: Partial<SceneSettings["crt"]>): void =>
    update({ crt: { ...crt, ...patch } });
  const patchEpilogue = (patch: Partial<SceneSettings["epilogue"]>): void =>
    update({ epilogue: { ...epilogue, ...patch } });
  const patchAtmosphere = (patch: Partial<SceneSettings["atmosphere"]>): void =>
    update({ atmosphere: { ...atmosphere, ...patch } });
  const patchLighting = (patch: Partial<SceneSettings["lighting"]>): void =>
    update({ lighting: { ...lighting, ...patch } });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute top-4 right-4 z-10 rounded-lg border border-foreground/10 bg-background/85 px-3 py-2 font-sans text-[0.8rem] text-foreground shadow-2xl backdrop-blur-xl"
      >
        Scene tuning
      </button>
    );
  }

  return (
    <aside
      aria-label="Scene tuning (development only)"
      className="absolute top-4 right-4 z-10 flex max-h-[calc(100%-2rem)] w-[22rem] flex-col gap-4 overflow-y-auto rounded-xl border border-foreground/10 bg-background/85 p-4 font-sans text-[0.8rem] text-foreground shadow-2xl backdrop-blur-xl"
    >
      <header className="flex items-center justify-between gap-2">
        <span className="font-medium">Scene tuning</span>
        <span className="flex gap-2">
          <button
            type="button"
            onClick={copyConfig}
            className="rounded border border-foreground/20 px-2 py-1"
          >
            {copied ? "copied" : "copy config"}
          </button>
          <button
            type="button"
            aria-label="Hide the tuning panel"
            onClick={() => setOpen(false)}
            className="rounded border border-foreground/20 px-2 py-1"
          >
            hide
          </button>
        </span>
      </header>

      {snippet ? (
        <label className="flex flex-col gap-1">
          <span className="opacity-70">
            Clipboard refused - select this and copy:
          </span>
          <textarea
            readOnly
            rows={8}
            value={snippet}
            onFocus={(event) => event.target.select()}
            className="w-full rounded border border-foreground/20 bg-background p-2 font-mono text-[0.7rem]"
          />
        </label>
      ) : null}

      <fieldset className="flex flex-col gap-2">
        <legend className="font-medium">Bloom</legend>
        <Slider
          label="strength"
          value={bloom.strength}
          min={0}
          max={2}
          step={0.01}
          onChange={(strength) => update({ bloom: { ...bloom, strength } })}
        />
        <Slider
          label="radius"
          value={bloom.radius}
          min={0}
          max={2}
          step={0.01}
          onChange={(radius) => update({ bloom: { ...bloom, radius } })}
        />
        <Slider
          label="threshold"
          value={bloom.threshold}
          min={0}
          max={1}
          step={0.01}
          onChange={(threshold) => update({ bloom: { ...bloom, threshold } })}
        />
        <Slider
          label="fine levels"
          value={bloom.fine}
          min={0}
          max={1}
          step={0.01}
          onChange={(fine) => update({ bloom: { ...bloom, fine } })}
        />
        <Slider
          label="knee"
          value={bloom.knee}
          min={0}
          max={1}
          step={0.01}
          onChange={(knee) => update({ bloom: { ...bloom, knee } })}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="font-medium">Depth of field</legend>
        {settings.hasDepthOfField ? (
          <>
            <Slider
              label="focus"
              value={depthOfField.focus}
              min={0.5}
              max={14}
              step={0.05}
              onChange={(focus) =>
                update({ depthOfField: { ...depthOfField, focus } })
              }
            />
            <Slider
              label="aperture"
              value={depthOfField.aperture}
              min={0}
              max={0.006}
              step={0.00005}
              onChange={(aperture) =>
                update({ depthOfField: { ...depthOfField, aperture } })
              }
            />
            <Slider
              label="max blur (px)"
              value={depthOfField.maxBlur}
              min={0}
              max={80}
              step={1}
              onChange={(maxBlur) =>
                update({ depthOfField: { ...depthOfField, maxBlur } })
              }
            />
          </>
        ) : (
          <p className="opacity-70">Not built on this device tier.</p>
        )}
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="font-medium">Atmosphere</legend>
        <label className="flex items-center justify-between gap-4">
          fog mode
          <select
            value={atmosphere.fogMode}
            className="rounded border border-foreground/20 bg-background px-2 py-1"
            onChange={(event) =>
              patchAtmosphere({
                fogMode: event.target
                  .value as SceneSettings["atmosphere"]["fogMode"],
              })
            }
          >
            <option value="exp2">exp2 (no shift)</option>
            <option value="linear">linear (near/far)</option>
          </select>
        </label>
        {atmosphere.fogMode === "exp2" ? (
          <Slider
            label="fog density"
            value={atmosphere.fogDensity}
            min={0}
            max={0.25}
            step={0.001}
            onChange={(fogDensity) => patchAtmosphere({ fogDensity })}
          />
        ) : (
          <>
            <Slider
              label="fog near (shift)"
              value={atmosphere.fogNear}
              min={0}
              max={20}
              step={0.1}
              onChange={(fogNear) => patchAtmosphere({ fogNear })}
            />
            <Slider
              label="fog far"
              value={atmosphere.fogFar}
              min={1}
              max={60}
              step={0.5}
              onChange={(fogFar) => patchAtmosphere({ fogFar })}
            />
          </>
        )}
        <Slider
          label="exposure"
          value={atmosphere.exposure}
          min={0.1}
          max={2}
          step={0.01}
          onChange={(exposure) => patchAtmosphere({ exposure })}
        />
        <Slider
          label="grain"
          value={atmosphere.grain}
          min={0}
          max={1}
          step={0.01}
          onChange={(grain) => patchAtmosphere({ grain })}
        />
        <label className="flex items-center justify-between gap-4">
          fog colour
          <input
            type="color"
            value={atmosphere.fogColor}
            onChange={(event) =>
              patchAtmosphere({ fogColor: event.target.value })
            }
          />
        </label>
        <label className="flex items-center justify-between gap-4">
          sky top
          <input
            type="color"
            value={atmosphere.skyTop}
            onChange={(event) =>
              patchAtmosphere({ skyTop: event.target.value })
            }
          />
        </label>
        <label className="flex items-center justify-between gap-4">
          sky top (scrolled)
          <input
            type="color"
            value={atmosphere.skyDrift}
            onChange={(event) =>
              patchAtmosphere({ skyDrift: event.target.value })
            }
          />
        </label>
        <label className="flex items-center justify-between gap-4">
          sky bottom
          <input
            type="color"
            value={atmosphere.skyBottom}
            onChange={(event) =>
              patchAtmosphere({ skyBottom: event.target.value })
            }
          />
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="font-medium">Lighting</legend>
        <Slider
          label="screen glow"
          value={lighting.screenGlow}
          min={0}
          max={3}
          step={0.01}
          onChange={(screenGlow) => patchLighting({ screenGlow })}
        />
        <Slider
          label="environment"
          value={lighting.environmentIntensity}
          min={0}
          max={1.5}
          step={0.01}
          onChange={(environmentIntensity) =>
            patchLighting({ environmentIntensity })
          }
        />
        <Slider
          label="key light"
          value={lighting.keyLight}
          min={0}
          max={3}
          step={0.01}
          onChange={(keyLight) => patchLighting({ keyLight })}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="font-medium">CRT glass</legend>
        <Slider
          label="scanlines"
          value={crt.scanline}
          min={0}
          max={0.5}
          step={0.005}
          onChange={(scanline) => patchCrt({ scanline })}
        />
        <Slider
          label="line count"
          value={crt.scanCount}
          min={80}
          max={700}
          step={10}
          onChange={(scanCount) => patchCrt({ scanCount })}
        />
        <Slider
          label="vignette"
          value={crt.vignette}
          min={0}
          max={1}
          step={0.01}
          onChange={(vignette) => patchCrt({ vignette })}
        />
        <Slider
          label="roll"
          value={crt.roll}
          min={0}
          max={0.12}
          step={0.002}
          onChange={(roll) => patchCrt({ roll })}
        />
        <Slider
          label="roll speed"
          value={crt.rollSpeed}
          min={0}
          max={0.5}
          step={0.01}
          onChange={(rollSpeed) => patchCrt({ rollSpeed })}
        />
        <Slider
          label="chroma"
          value={crt.chroma}
          min={0}
          max={0.006}
          step={0.0001}
          onChange={(chroma) => patchCrt({ chroma })}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="font-medium">Final shot</legend>
        <p className="opacity-60">
          World coordinates and world-axis rotation offsets (radians).{" "}
          <strong>start</strong> is where each stands as the black begins to
          lift, <strong>end</strong> where the pull-back leaves it; equal means
          it holds still. Scroll to the last act to see them.
        </p>
        <Track
          label="television"
          track={epilogue.television}
          onChange={(television) => patchEpilogue({ television })}
        />
        <Track
          label="figure"
          track={epilogue.figure}
          onChange={(figure) => patchEpilogue({ figure })}
        />
      </fieldset>
    </aside>
  );
};
