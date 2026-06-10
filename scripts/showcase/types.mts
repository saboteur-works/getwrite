/**
 * Shared types for the showcase image runner.
 *
 * A "scene" is a named application state captured as one or more PNG images.
 * Scenes are declared in `scenes.mts` and executed by `run.mts`, which drives
 * the app into each state using the step primitives in `steps.mts`.
 */

export type Theme = "light" | "dark";

export type Viewport = "desktop";

/** Pixel dimensions for each named viewport. */
export const VIEWPORTS: Record<Viewport, { width: number; height: number }> = {
  desktop: { width: 1440, height: 900 },
};

/** Every theme a scene is captured in unless it narrows the set. */
export const ALL_THEMES: readonly Theme[] = ["light", "dark"];

/**
 * A single setup interaction performed before capture. The app is a
 * client-state SPA, so navigation between projects/resources happens through
 * these steps rather than distinct routes. Implemented in `steps.mts`.
 */
export type SceneStep =
  | { step: "selectProject"; projectName: string }
  | { step: "openResource"; title: string }
  | { step: "click"; selector: string }
  | { step: "waitFor"; selector: string }
  | { step: "wait"; ms: number }
  | { step: "hideCursor" };

/** A named application state to capture. */
export interface Scene {
  /** Stable identifier; used in output filenames. */
  id: string;
  /** Route relative to the app base URL (the SPA mostly uses "/"). */
  route: string;
  /** Setup steps run in order after navigation, before capture. */
  steps?: SceneStep[];
  /** Themes to capture; defaults to every theme in {@link ALL_THEMES}. */
  themes?: readonly Theme[];
  /** Viewport to capture at; defaults to "desktop". */
  viewport?: Viewport;
}
