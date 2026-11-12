import type { AnyResource } from "../../../../src/lib/models/types";
import type { OrganizerSource } from "../../../../src/lib/models/organizer-grid-types";

/**
 * @module organizerSource
 * **Feature 109, Task 5 (FR-3, FR-5, OQ-5).** Pure source model for the
 * Organizer grid: which cards a source lists and in what order.
 *
 * - Children: a folder's direct children, folders first, then documents, each
 *   by `orderIndex` (the Organizer's order today).
 * - Descendants: documents under a folder, depth-first, each parent's children
 *   sorted by `orderIndex` with folders and documents interleaved, as the
 *   resource tree shows them (pinned against `buildResourceTree.ts` in a test).
 * - Smart folder: the documents named by an id list, in whole-project tree
 *   order whatever the order of the ids.
 *
 * Failures are reported, never dropped: an id that is not in the project is
 * in `missingIds`; a folder id in a smart-folder list is in
 * `skippedFolderIds`. Input order breaks `orderIndex` ties, as in the tree.
 * No React, Redux or drag-and-drop imports.
 */

/** The cards of a source plus what could not be resolved. */
export interface OrganizerSourceCards {
  cards: AnyResource[];
  /** Requested ids that name nothing in the project (or, for a folder source, no folder). */
  missingIds: string[];
  /** Smart-folder ids that name a folder; the source lists documents only. */
  skippedFolderIds: string[];
}

/** Result of resolving an {@link OrganizerSource}. */
export interface OrganizerResolvedSource extends OrganizerSourceCards {
  /** True for a smart-folder source whose id list has not been supplied. */
  unresolved: boolean;
}

const ROOT = "root";

function effectiveParentId(resource: AnyResource): string | null {
  if (resource.type === "folder") {
    return resource.parentId ?? resource.folderId ?? null;
  }
  return resource.folderId ?? null;
}

const byOrderIndex = (a: AnyResource, b: AnyResource): number =>
  (a.orderIndex || 0) - (b.orderIndex || 0);

/** Children by parent id; a parent that is not a folder in the project is the root, as in the tree. */
function buildChildrenMap(
  all: readonly AnyResource[],
): Map<string, AnyResource[]> {
  const folderIds = new Set(
    all.filter((r) => r.type === "folder").map((r) => r.id),
  );
  const map = new Map<string, AnyResource[]>();
  for (const r of all) {
    const raw = effectiveParentId(r);
    const parent = raw && raw !== r.id && folderIds.has(raw) ? raw : ROOT;
    const list = map.get(parent);
    if (list) list.push(r);
    else map.set(parent, [r]);
  }
  for (const list of map.values()) list.sort(byOrderIndex);
  return map;
}

/** Depth-first walk from `startId`; every node visited once. */
function walkTree(
  map: Map<string, AnyResource[]>,
  startId: string,
  visited: Set<string>,
): AnyResource[] {
  const out: AnyResource[] = [];
  const visit = (parentId: string): void => {
    for (const child of map.get(parentId) ?? []) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      out.push(child);
      if (child.type === "folder") visit(child.id);
    }
  };
  visit(startId);
  return out;
}

const documentsOf = (list: AnyResource[]): AnyResource[] =>
  list.filter((r) => r.type !== "folder");

function folderExists(folderId: string, all: readonly AnyResource[]): boolean {
  return all.some((r) => r.id === folderId && r.type === "folder");
}

function missingFolder(folderId: string): OrganizerSourceCards {
  return { cards: [], missingIds: [folderId], skippedFolderIds: [] };
}

/** A folder's direct children: folders first, then documents, each by `orderIndex`. */
export function listChildrenSource(
  folderId: string,
  all: readonly AnyResource[],
): OrganizerSourceCards {
  if (!folderExists(folderId, all)) return missingFolder(folderId);
  const folders = all
    .filter((r) => r.type === "folder" && effectiveParentId(r) === folderId)
    .sort(byOrderIndex);
  const documents = all
    .filter((r) => r.type !== "folder" && r.folderId === folderId)
    .sort(byOrderIndex);
  return {
    cards: [...folders, ...documents],
    missingIds: [],
    skippedFolderIds: [],
  };
}

/** Documents under a folder at any depth, in the tree's order. */
export function listDescendantsSource(
  folderId: string,
  all: readonly AnyResource[],
): OrganizerSourceCards {
  if (!folderExists(folderId, all)) return missingFolder(folderId);
  const map = buildChildrenMap(all);
  const visited = new Set<string>([folderId]);
  const walked = walkTree(map, folderId, visited);
  return { cards: documentsOf(walked), missingIds: [], skippedFolderIds: [] };
}

/** The documents a smart folder's id list names, in whole-project tree order. */
export function resolveSmartFolderSource(
  ids: readonly string[],
  all: readonly AnyResource[],
): OrganizerSourceCards {
  const byId = new Map(all.map((r) => [r.id, r]));
  const wanted = new Set<string>();
  const missingIds: string[] = [];
  const skippedFolderIds: string[] = [];
  for (const id of new Set(ids)) {
    const found = byId.get(id);
    if (!found) missingIds.push(id);
    else if (found.type === "folder") skippedFolderIds.push(id);
    else wanted.add(id);
  }
  const map = buildChildrenMap(all);
  const visited = new Set<string>();
  const ordered = walkTree(map, ROOT, visited);
  // Anything a folder cycle kept out of the walk still follows, in input order.
  const unreached = all.filter((r) => !visited.has(r.id));
  const cards = [...ordered, ...unreached].filter((r) => wanted.has(r.id));
  return { cards, missingIds, skippedFolderIds };
}

/**
 * Resolves any source. A smart-folder source needs its id list from the
 * query hook; without it the result is `unresolved`, never an empty source.
 */
export function resolveOrganizerSource(
  source: OrganizerSource,
  all: readonly AnyResource[],
  smartFolderIds?: readonly string[],
): OrganizerResolvedSource {
  if (source.kind === "smart-folder") {
    if (smartFolderIds === undefined) {
      return {
        cards: [],
        missingIds: [],
        skippedFolderIds: [],
        unresolved: true,
      };
    }
    return {
      ...resolveSmartFolderSource(smartFolderIds, all),
      unresolved: false,
    };
  }
  const result =
    source.scope === "children"
      ? listChildrenSource(source.folderId, all)
      : listDescendantsSource(source.folderId, all);
  return { ...result, unresolved: false };
}
