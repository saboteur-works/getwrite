// Last Updated: 2026-10-18

/**
 * @module Start/list-entry-view
 *
 * Maps one `GET /api/projects` list entry to the Start page's entry shape.
 * Pure. An unusable entry (Feature 89) bypasses `buildProjectView`: it carries
 * only a folder id and reason, nothing to build a view from, and its flags must
 * reach the page or it would render as an ordinary nameless project card.
 */
import { buildProjectView } from "../../src/lib/models/project-view";
import type { Project, TextResource } from "../../src/lib/models/types";
import type { ProjectListApiEntry } from "../../src/lib/api/projects";
import type { StartPageProjectEntry } from "./StartPage";

/**
 * Converts a list entry into a {@link StartPageProjectEntry}.
 *
 * @param entry - One element of the `listProjects()` response.
 * @returns The Start page entry, carrying `isEncrypted`, `isLocked`,
 *   `isUnusable` and `unusableReason` through.
 */
export function toStartPageEntry(
  entry: ProjectListApiEntry,
): StartPageProjectEntry {
  if ("isUnusable" in entry) {
    return {
      project: entry.project as unknown as Project,
      folders: [],
      resources: [],
      isUnusable: true,
      unusableReason: entry.unusableReason,
    };
  }
  // `buildProjectView` expects TextResource[] and returns UIResource[]. A locked
  // entry's project is only `{ id, createdAt }`, which it tolerates at runtime
  // (it reads only `project.id`) but does not statically satisfy `Project`.
  return {
    ...buildProjectView({
      project: entry.project as Project,
      folders: entry.folders,
      resources: entry.resources as unknown as TextResource[],
    }),
    // Without these the Start screen cannot tell an encrypted project from an
    // ordinary one and renders a locked entry as "Untitled Project".
    isEncrypted: entry.isEncrypted,
    isLocked: entry.isLocked,
  } as unknown as StartPageProjectEntry;
}
