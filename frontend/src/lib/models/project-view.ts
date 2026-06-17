import {
  buildProjectViewAdapter,
  type BuildProjectViewOptions,
} from "./project-view-adapter";

export type { UIResource, FolderWithResources } from "./project-view-adapter";

/**
 * Stable facade for project view building. Delegates to typed adapter helpers
 * extracted in T011 while preserving the existing public API.
 */
export function buildProjectView(
  options: BuildProjectViewOptions,
): ReturnType<typeof buildProjectViewAdapter> {
  return buildProjectViewAdapter(options);
}

export default { buildProjectView };
