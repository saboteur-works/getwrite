import {
  getProjectDirectoryId,
  type StoredProject,
} from "../../src/store/projectsSlice";

/**
 * The store keys projects by `StoredProject.id` (the manifest id), while the
 * Capture box and the share sheet name a project by its directory basename, so
 * the entry is found through `rootPath`. An entry with no `rootPath` is matched
 * by its key, the same fallback the project choice uses.
 */
export function findStoredByDirectoryId(
  projects: Record<string, StoredProject>,
  directoryId: string,
): StoredProject | undefined {
  return Object.values(projects).find((p) =>
    p.rootPath
      ? getProjectDirectoryId(p.rootPath) === directoryId
      : p.id === directoryId,
  );
}
