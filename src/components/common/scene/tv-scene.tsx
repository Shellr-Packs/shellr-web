"use client";

// 📖 Docs: obsidian/frontend/scene-3d.md

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

import { CasePanel } from "@/components/common/cases/case-panel";
import { ClosingCopy } from "@/components/common/closing/closing-copy";
import { AboutPanel } from "@/components/common/panels/about-panel";
import { PanelStack } from "@/components/common/panels/panel-stack";
import { TeamPanel } from "@/components/common/panels/team-panel";
import type {
  HomeAboutContent,
  HomeClosingContent,
  HomeCasesContent,
  HomeTeamContent,
  SceneSignContent,
} from "@/data/mocks/home";
import { markSceneReady } from "@/lib/page/intro";
import { TvScene as Scene } from "@/lib/scene/tv-scene";

/**
 * Development-only tuning panel, **off unless it is asked for**.
 *
 * The flag guards the `dynamic()` call itself, not just the render: a production
 * build folds this to `null`, which makes the `import()` unreachable and keeps
 * the panel out of the output entirely rather than shipping a chunk nobody
 * fetches.
 *
 * Even in development it stays hidden now — its button sat in the corner of
 * every screenshot of the page. Add `?tune` to the URL to bring it back.
 */
const SceneControls =
  process.env.NODE_ENV === "development"
    ? dynamic(
        () => import("./scene-controls").then((module) => module.SceneControls),
        { ssr: false },
      )
    : null;

export interface TvSceneProps {
  /** Absolute path to the GLB under `public/assets/<section>/`. */
  modelUrl: string;
  /** Videos for the television screens, matched by texture name. */
  screenVideos?: string[];
  /** Clip for one specific screen, keyed by its number — beats the name match. */
  screenVideoOverrides?: Record<string, string>;
  screenGlowScale?: Record<string, number>;
  /** Picking a set in the ring — the page opens the pack theatre with it. */
  onPickCase?: (name: string) => void;
  /** Classes for the container — the scene sizes its canvas to this element. */
  className?: string;
  /** The lines standing in the room for the flight to pass through. */
  flightSigns?: SceneSignContent[];
  /**
   * What the chip on the cursor says over each television, by screen texture —
   * and the word after its divider.
   */
  captionLabels: {
    byTexture: Record<string, string>;
    fallback: string;
    action: string;
  };
  /** The carousel section's heading, controls and works. */
  cases: HomeCasesContent;
  /** The closing shot's screen and the line the chip carries over it. */
  finalShot: { image: string; label: string };
  /** The words laid over that shot. */
  closing: HomeClosingContent;
  /** The panels that slide up over the room, in the order they arrive. */
  team: HomeTeamContent;
  about: HomeAboutContent;
}

/**
 * Mounts the WebGL scene into a container element.
 *
 * The component owns the container and the scene's lifetime and nothing else —
 * all three.js state lives in `lib/scene/tv-scene.ts`, out of React's reach, and
 * the canvas itself is created and removed by the scene.
 *
 * Mount it through `LazyTvScene`: three.js must not reach the server render.
 */
export const TvScene = ({
  modelUrl,
  screenVideos,
  screenVideoOverrides,
  screenGlowScale,
  onPickCase,
  className,
  flightSigns,
  captionLabels,
  finalShot,
  closing,
  cases,
  team,
  about,
}: TvSceneProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // The closing words hand up their own writer; the scene calls it every frame
  // of the last shot. Nothing about that shot goes through React.
  const writeClosing = useRef<
    ((reveal: number, edgeAt: (y: number) => number) => void) | null
  >(null);
  const blackoutRef = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<Scene | null>(null);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [tuning, setTuning] = useState(false);
  const [caseIndex, setCaseIndex] = useState(0);
  // A new object identity every render must not tear the scene down and rebuild
  // it; the contents are what matter.
  const videosKey = screenVideos?.join("|") ?? "";
  const overridesKey = JSON.stringify(screenVideoOverrides ?? {});
  const glowScaleKey = JSON.stringify(screenGlowScale ?? {});
  const signsKey = JSON.stringify(flightSigns ?? []);
  const captionsKey = JSON.stringify(captionLabels);
  const finalShotKey = JSON.stringify(finalShot);
  // Stable across renders: the team block subscribes to the ticker with this in
  // its dependencies, and a fresh identity each render would re-subscribe.
  const setCovered = useCallback(
    (covered: boolean) => scene?.setCovered(covered),
    [scene],
  );
  const bindClosing = useCallback(
    (write: (reveal: number, edgeAt: (y: number) => number) => void) => {
      writeClosing.current = write;
    },
    [],
  );

  // Read once, on the client: the server has no query string to read, and this
  // must not make the page's markup depend on it.
  useEffect(() => {
    setTuning(new URLSearchParams(window.location.search).has("tune"));
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let created: Scene | null = null;
    try {
      created = new Scene({
        container,
        modelUrl,
        screenVideos: videosKey ? videosKey.split("|") : [],
        screenVideoOverrides: JSON.parse(overridesKey) as Record<
          string,
          string
        >,
        screenGlowScale: JSON.parse(glowScaleKey) as Record<string, number>,
        flightSigns: JSON.parse(signsKey) as SceneSignContent[],
        captionLabels: JSON.parse(captionsKey) as TvSceneProps["captionLabels"],
        finalShot: JSON.parse(finalShotKey) as TvSceneProps["finalShot"],
        // Written straight to the element, not through state: this changes on
        // most frames of the finale, and a re-render per frame to set one
        // opacity is a re-render per frame too many.
        onBlackout: (amount) => {
          const layer = blackoutRef.current;
          if (!layer) return;
          layer.style.opacity = `${amount}`;
          layer.style.visibility = amount > 0.001 ? "visible" : "hidden";
        },
        onControlsVisible: setControlsVisible,
        onCarouselIndex: setCaseIndex,
        // The scene names what the pointer found and how much of an offer it
        // is; **what that looks like is the page's call**, which is why the
        // mapping lives here and not in the room.
        onClosingShot: ({ reveal, edgeAt }) =>
          writeClosing.current?.(reveal, edgeAt),
      });
      setScene(created);
    } catch (error) {
      // No WebGL, or the context was refused — leave the box empty rather than
      // take the page down with it. The curtain is told anyway: there is nothing
      // more to wait for, and a loader that never finishes is the worse failure.
      console.error("[tv-scene] could not start:", error);
      markSceneReady();
    }

    return () => {
      setScene(null);
      created?.dispose();
    };
  }, [
    modelUrl,
    videosKey,
    overridesKey,
    glowScaleKey,
    signsKey,
    captionsKey,
    finalShotKey,
  ]);

  return (
    <>
      <div ref={containerRef} className={className} aria-hidden="true" />
      {/* The finale's black. A DOM layer rather than a pass: it is a flat fill
          over the finished frame, and a fullscreen quad through the composer
          would cost a render target to do what this does for nothing. */}
      <div
        ref={blackoutRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-20 bg-black opacity-0 [visibility:hidden]"
      />
      {/* A chip used to follow the cursor over the wall, naming each screen
          and offering to unbox it. It was noise: the wall is scenery, the
          carousel below is where a pack is actually chosen, and a label that
          appears under the pointer on every television made the room feel like
          a menu. The scene still reports what the pointer found — see
          `onHoverHint` — so bringing it back is a render, not a rebuild. */}
      {/* The last shot's words. Under the panels in the stacking order (`z-15`
          against their `z-25`), so the block that dissolves off the top of them
          passes over these rather than under. */}
      <ClosingCopy content={closing} onWriter={bindClosing} />
      {/* Siblings, not children: the canvas container is `aria-hidden`, and
          focusable controls must not live inside that. */}
      <CasePanel
        visible={controlsVisible}
        onTurn={(step) => scene?.turnCarousel(step)}
        index={caseIndex}
        label={cases.label}
        heading={cases.heading}
        previous={cases.previous}
        next={cases.next}
        explore={cases.explore}
        onExplore={onPickCase}
        items={cases.items}
      />
      {/* Rendered here rather than in the view, for the same reason the case
          panel is: it has to talk to the scene. A stack that covers the window
          completely is the scene's cue to stop drawing entirely. */}
      <PanelStack
        onCovered={setCovered}
        panels={[
          {
            key: "team",
            label: team.heading,
            // The room does not slide away — it dissolves into this one, a wave
            // of pixels up the window. It leaves the ordinary way, pushed out
            // by the panel behind it.
            enter: "pixels" as const,
            render: (active, arriving) => (
              <TeamPanel content={team} active={active} arriving={arriving} />
            ),
          },
          {
            key: "about",
            label: about.heading,
            // Last one out: rather than sliding off, it dissolves the same way
            // the first one arrived, and the closing shot is what is under it.
            exit: "pixels" as const,
            render: (_active, arriving) => (
              <AboutPanel content={about} active={arriving} />
            ),
          },
        ]}
      />
      {SceneControls && scene && tuning ? (
        <SceneControls scene={scene} />
      ) : null}
    </>
  );
};
