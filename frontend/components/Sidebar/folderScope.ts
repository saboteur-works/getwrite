import type { Folder } from "../../src/lib/models/types";
import type { ResourceOption } from "./controls/ResourceRefInput";

/**
 * Returns the set of folder IDs that are in scope for a given refFolder.
 * When includeSubfolders is false, only the refFolder itself is in scope.
 * When includeSubfolders is true, all descendant folders are included via BFS.
 */
export function resolveFolderScope(
  folders: Folder[],
  refFolder: string,
  includeSubfolders: boolean,
): Set<string> {
  const scope = new Set<string>([refFolder]);
  if (!includeSubfolders) return scope;

  const queue = [refFolder];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const folder of folders) {
      const effectiveParentId = folder.parentId ?? folder.folderId ?? null;
      if (effectiveParentId === current && !scope.has(folder.id)) {
        scope.add(folder.id);
        queue.push(folder.id);
      }
    }
  }
  return scope;
}

/**
 * Filters raw resources to those within the given folder scope and returns
 * them as ResourceOption objects. When refFolder is undefined, all named
 * resources are returned.
 */
export function filterResourceOptionsByScope(
  resources: ReadonlyArray<{
    id: string;
    name: string;
    folderId?: string | null;
  }>,
  folders: Folder[],
  refFolder: string | undefined,
  includeSubfolders: boolean | undefined,
): ResourceOption[] {
  if (!refFolder) {
    return resources
      .filter((r) => r.name)
      .map((r) => ({ id: r.id, name: r.name }));
  }
  const scope = resolveFolderScope(
    folders,
    refFolder,
    includeSubfolders ?? false,
  );
  return resources
    .filter((r) => r.name && scope.has(r.folderId ?? ""))
    .map((r) => ({ id: r.id, name: r.name }));
}
