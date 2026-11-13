/**
 * Feature 110 (folklore variants), Task 6 (FR-4, FR-6): the pure narrative
 * scope. A narrative is a folder whose subtype is Narrative; its variants are
 * the Sources in that folder and its subfolders, flattened in tree order, the
 * walk ending at a nested Narrative folder (which is its own narrative).
 *
 * Written in the style of the Organizer's `organizerSource.ts` (children map
 * by parent, sort by `orderIndex`, depth-first walk with a visited set) but
 * not reusing it: that walk does not stop at a nested Narrative folder.
 *
 * A folder's subtype lives in its own sidecar, so the caller supplies one
 * {@link FolderSubtypeRead} per folder. A failed or missing read is a distinct
 * outcome and is never read as "not a Narrative" (failure-visibility).
 * A Source in Trash is not in the live resource list, so it is not listed and
 * returns when it is back in the list. No React, Redux or drag-and-drop
 * imports, and no `node:*`.
 */

import { normalizeSubtypeLabel } from "./field-subtype-scope";
import { NARRATIVE_SUBTYPE, VARIANT_SUBTYPE } from "./folklore-types";
import type { AnyResource, Folder, SourceResource } from "./types";

/** The outcome of reading one folder's subtype from its folder sidecar. */
export type FolderSubtypeRead =
  | { kind: "ok"; subtype: string | null }
  | { kind: "failed"; reason: string };

/** One Source in a narrative's scope. */
export interface NarrativeVariantEntry {
  resource: SourceResource;
  /** True when the Source carries the Variant subtype (FR-4); false is listed and marked. */
  isVariant: boolean;
}

/** Result of resolving one narrative's scope. */
export type NarrativeScopeResult =
  | { kind: "scope"; narrativeId: string; variants: NarrativeVariantEntry[] }
  | { kind: "missing"; folderId: string }
  | { kind: "failed"; folderId: string; reason: string };

/** Result of listing every Narrative folder of a project. */
export type NarrativeFoldersResult =
  | { kind: "ok"; narratives: Folder[] }
  | { kind: "failed"; failures: { folderId: string; reason: string }[] };

const ROOT = "root";
const NOT_READ_REASON = "folder subtype was not read";

function effectiveParentId(resource: AnyResource): string | null {
  if (resource.type === "folder") {
    return resource.parentId ?? resource.folderId ?? null;
  }
  return resource.folderId ?? null;
}

const byOrderIndex = (a: AnyResource, b: AnyResource): number =>
  (a.orderIndex || 0) - (b.orderIndex || 0);

/** Children by parent id; a parent that is not a folder in the project is the root. */
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

function isNarrativeRead(read: FolderSubtypeRead): boolean {
  return (
    read.kind === "ok" &&
    read.subtype !== null &&
    normalizeSubtypeLabel(read.subtype) ===
      normalizeSubtypeLabel(NARRATIVE_SUBTYPE)
  );
}

function isVariantSubtype(subtype: string | undefined): boolean {
  return (
    subtype !== undefined &&
    normalizeSubtypeLabel(subtype) === normalizeSubtypeLabel(VARIANT_SUBTYPE)
  );
}

function readOf(
  folderId: string,
  reads: ReadonlyMap<string, FolderSubtypeRead>,
): FolderSubtypeRead {
  return reads.get(folderId) ?? { kind: "failed", reason: NOT_READ_REASON };
}

/**
 * The Sources of one narrative in tree order. A nested Narrative folder ends
 * the walk on its branch. A failed or missing subtype read of the narrative
 * folder or of any folder walked is returned as `failed`.
 */
export function resolveNarrativeScope(
  narrativeId: string,
  all: readonly AnyResource[],
  folderSubtypes: ReadonlyMap<string, FolderSubtypeRead>,
): NarrativeScopeResult {
  const root = all.find((r) => r.id === narrativeId && r.type === "folder");
  if (!root) return { kind: "missing", folderId: narrativeId };
  const rootRead = readOf(narrativeId, folderSubtypes);
  if (rootRead.kind === "failed") {
    return { kind: "failed", folderId: narrativeId, reason: rootRead.reason };
  }

  const map = buildChildrenMap(all);
  const visited = new Set<string>([narrativeId]);
  const variants: NarrativeVariantEntry[] = [];
  const found: { failure: { folderId: string; reason: string } | null } = {
    failure: null,
  };

  const visit = (parentId: string): void => {
    for (const child of map.get(parentId) ?? []) {
      if (found.failure || visited.has(child.id)) continue;
      visited.add(child.id);
      if (child.type === "source") {
        variants.push({
          resource: child,
          isVariant: isVariantSubtype(child.resourceSubtype),
        });
      } else if (child.type === "folder") {
        const read = readOf(child.id, folderSubtypes);
        if (read.kind === "failed") {
          found.failure = { folderId: child.id, reason: read.reason };
        } else if (!isNarrativeRead(read)) {
          visit(child.id);
        }
      }
    }
  };
  visit(narrativeId);

  if (found.failure) return { kind: "failed", ...found.failure };
  return { kind: "scope", narrativeId, variants };
}

/**
 * Every Narrative folder in tree order (folders unreachable from the root, as
 * in a corrupt parent cycle, follow in input order). Any failed or missing
 * subtype read makes the whole result `failed`, naming each folder.
 */
export function listNarrativeFolders(
  all: readonly AnyResource[],
  folderSubtypes: ReadonlyMap<string, FolderSubtypeRead>,
): NarrativeFoldersResult {
  const map = buildChildrenMap(all);
  const visited = new Set<string>();
  const folders: Folder[] = [];
  const visit = (parentId: string): void => {
    for (const child of map.get(parentId) ?? []) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      if (child.type === "folder") {
        folders.push(child);
        visit(child.id);
      }
    }
  };
  visit(ROOT);
  for (const r of all) {
    if (r.type === "folder" && !visited.has(r.id)) {
      visited.add(r.id);
      folders.push(r);
    }
  }

  const failures: { folderId: string; reason: string }[] = [];
  const narratives: Folder[] = [];
  for (const f of folders) {
    const read = readOf(f.id, folderSubtypes);
    if (read.kind === "failed") {
      failures.push({ folderId: f.id, reason: read.reason });
    } else if (isNarrativeRead(read)) {
      narratives.push(f);
    }
  }
  if (failures.length > 0) return { kind: "failed", failures };
  return { kind: "ok", narratives };
}
