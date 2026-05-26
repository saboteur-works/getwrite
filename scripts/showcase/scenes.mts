/**
 * Declarative showcase scene manifest.
 *
 * Each entry describes an application state to capture. Add a scene by adding
 * an entry here — no changes to the runner are required as long as the scene
 * only uses existing step primitives (see `steps.mts`).
 *
 * Scenes are authored against the configured projects directory (default:
 * `scripts/showcase/fixture/`). The `projectName` in `selectProject` steps must
 * match a project served from that directory.
 */

import type { Scene } from "./types.mts";

/**
 * Open "Episode 1 - Scene 1" from the Recent Files panel (visible on the
 * work area before any resource is selected) so no folder expansion is needed.
 */
const openScene = [
  { step: "openResource" as const, title: "Episode 1 - Scene 1" },
];

export const scenes: Scene[] = [
  {
    id: "home",
    route: "/",
    steps: [{ step: "hideCursor" }],
  },
  {
    id: "resource-tree",
    route: "/",
    steps: [
      { step: "selectProject", projectName: "The SF Sideshow" },
      { step: "hideCursor" },
    ],
  },
  {
    id: "editor",
    route: "/",
    steps: [
      { step: "selectProject", projectName: "The SF Sideshow" },
      ...openScene,
      { step: "wait", ms: 600 },
      { step: "hideCursor" },
    ],
  },
  {
    id: "data",
    route: "/",
    steps: [
      { step: "selectProject", projectName: "The SF Sideshow" },
      ...openScene,
      { step: "click", selector: '[role="tab"][data-value="data"]' },
      { step: "wait", ms: 400 },
      { step: "hideCursor" },
    ],
  },
  {
    id: "timeline",
    route: "/",
    steps: [
      { step: "selectProject", projectName: "The SF Sideshow" },
      ...openScene,
      { step: "click", selector: '[role="tab"][data-value="timeline"]' },
      { step: "wait", ms: 400 },
      { step: "hideCursor" },
    ],
  },
];
