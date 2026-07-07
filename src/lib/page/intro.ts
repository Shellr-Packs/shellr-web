/**
 * @fileoverview The two facts the page's opening turns on.
 *
 * `sceneReady` — the room is loaded, compiled and has drawn a frame. `introDone`
 * — the curtain has lifted and the hero may start.
 *
 * A module rather than context or a store, because the three parties are on
 * three different branches of the tree: the preloader is a leaf of the view, the
 * scene is a leaf of a `next/dynamic` chunk that does not exist yet when the
 * preloader mounts, and the hero's copy is a third sibling. Threading a prop
 * between those means lifting state into a Server Component, which cannot hold
 * it. Two booleans and a set of callbacks is the whole thing.
 *
 * Both are **one-way**: nothing here ever goes back to `false`, so a late
 * subscriber is told immediately rather than waiting for an event that has
 * already happened.
 *
 * 📖 Docs: obsidian/frontend/animation-system.md
 */

type Listener = () => void;

const flags = { scene: false, intro: false };
const sceneListeners = new Set<Listener>();
const introListeners = new Set<Listener>();

const announce = (listeners: Set<Listener>): void => {
  // Snapshot: a listener that unsubscribes itself is the normal case here.
  for (const listener of [...listeners]) listener();
  listeners.clear();
};

/** The scene has loaded, compiled and drawn — called by `lib/scene/tv-scene.ts`. */
export const markSceneReady = (): void => {
  if (flags.scene) return;
  flags.scene = true;
  announce(sceneListeners);
};

/** The curtain is up. The hero's own animations start here, not on mount. */
export const markIntroDone = (): void => {
  if (flags.intro) return;
  flags.intro = true;
  announce(introListeners);
};

export const isIntroDone = (): boolean => flags.intro;

/** Fires once, immediately if it has already happened. Returns an unsubscribe. */
export const onSceneReady = (listener: Listener): (() => void) => {
  if (flags.scene) {
    listener();
    return () => {};
  }
  sceneListeners.add(listener);
  return () => sceneListeners.delete(listener);
};

export const onIntroDone = (listener: Listener): (() => void) => {
  if (flags.intro) {
    listener();
    return () => {};
  }
  introListeners.add(listener);
  return () => introListeners.delete(listener);
};
