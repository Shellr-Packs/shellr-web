"use client";

// 📖 Docs: obsidian/frontend/scene-3d.md

import dynamic from "next/dynamic";

import type { TvSceneProps } from "./tv-scene";

export type LazyTvSceneProps = TvSceneProps;

const TvScene = dynamic(
  () => import("./tv-scene").then((module) => module.TvScene),
  { ssr: false, loading: () => null },
);

/**
 * Client-only entry point for the scene.
 *
 * `ssr: false` puts three.js in its own chunk that is fetched after hydration,
 * so the server render — and anything that never hydrates, such as a crawler —
 * pays nothing for it.
 */
export const LazyTvScene = (props: LazyTvSceneProps) => <TvScene {...props} />;
