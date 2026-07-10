// Only the lazy entry point is re-exported: a value export of `TvScene` here
// would pull three.js back into the importer's chunk and undo the code split.
export { LazyTvScene, type LazyTvSceneProps } from "./lazy-tv-scene";
export type { TvSceneProps } from "./tv-scene";
