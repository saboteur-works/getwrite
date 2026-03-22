import {
    buildProjectViewAdapter,
    type BuildProjectViewOptions,
    type FolderWithResources,
    type UIResource,
} from "./project-view-adapter";

export type { UIResource, FolderWithResources } from "./project-view-adapter";

/**
 * Stable facade for project view building. Delegates to typed adapter helpers
 * extracted in T011 while preserving the existing public API.
 */
export function buildProjectView(options: BuildProjectViewOptions): {
    project: BuildProjectViewOptions["project"];
    folders: FolderWithResources[];
    resources: UIResource[];
} {
    return buildProjectViewAdapter(options);
}

export default { buildProjectView };
