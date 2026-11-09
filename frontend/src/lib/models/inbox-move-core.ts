/**
 * Feature 106 Task 14 (FR-23, OQ-3, OQ-9): a tree move that clears the moved
 * item's saved compile exclusion when it leaves the Inbox subtree.
 *
 * `reorderResourcesClearingInboxExclusions` wraps `reorderResourcesCore`, the
 * one move path used by the reorder route and the native backend. It reads the
 * pre-move state, runs the move, then removes the ids of every resource that
 * left the Inbox subtree from `config.compileDefaults.excludedResourceIds`
 * (`removeCompileExclusions`, under `withMetaLock` through `updateProjectJson`).
 * A failure of the planning read or of the removal never undoes the move: it is
 * returned as a notice. A locked-access error always propagates. No React, no
 * `node:*` import (paths come from the shared resolvers).
 */
import path from "node:path";
import { loadProjectConfig } from "./project-config";
import { readFolderTree } from "./folder-utils";
import { readSidecar } from "./sidecar";
import { listResourceIdsStrict } from "./list-resource-ids-strict";
import { removeCompileExclusions } from "./saved-defaults-core";
import { isLockedAccessError } from "./locked-access";
import {
  classifyInboxMove,
  computeInboxSubtree,
  type InboxFolderNode,
  type InboxSubtree,
} from "./inbox-membership";
import {
  reorderResourcesCore,
  resolveResourceProjectRootOrThrow,
  type ReorderResourcesInput,
} from "./resource-crud-core";

/** Shown when the compile default could not be cleared after a move out of the Inbox. */
export const INBOX_EXCLUSION_NOT_CLEARED_NOTICE =
  "The item was moved, but its saved compile default was not cleared. It may still start unticked in the Compile dialog.";

/** Result of a move: `notice` is set when the clearing failed (the move stands). */
export interface ReorderOutcome {
  notice?: string;
}

/** Ids to clear, or the fact that they could not be worked out. */
type ClearPlan = { ok: true; ids: string[] } | { ok: false };

/** The folder ids at and below `rootId`, by the pre-move parent links. */
function descendantFolderIds(
  folders: readonly InboxFolderNode[],
  rootId: string,
): Set<string> {
  const seen = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    for (const f of folders) {
      const parent = f.parentId ?? f.folderId ?? null;
      if (parent === current && !seen.has(f.id)) {
        seen.add(f.id);
        stack.push(f.id);
      }
    }
  }
  return seen;
}

/** Resource ids whose stored folder is in `folderIds` (a failed read throws). */
async function resourcesInFolders(
  projectRoot: string,
  folderIds: ReadonlySet<string>,
): Promise<string[]> {
  const found: string[] = [];
  for (const id of await listResourceIdsStrict(projectRoot)) {
    const sidecar = await readSidecar(projectRoot, id);
    const folderId = sidecar?.["folderId"];
    if (typeof folderId === "string" && folderIds.has(folderId)) {
      found.push(id);
    }
  }
  return found;
}

/** Ids of resources the move takes out of the Inbox subtree. */
async function collectLeavers(
  projectRoot: string,
  folders: readonly InboxFolderNode[],
  subtree: InboxSubtree,
  input: ReorderResourcesInput,
): Promise<string[]> {
  const ids = new Set<string>();
  for (const ro of input.resourceOrder) {
    const dest = ro.folderId ?? null;
    // A null folderId keeps the stored folder, so it cannot leave; a
    // destination inside the subtree cannot leave either.
    if (dest === null || subtree.folderIds.has(dest)) continue;
    const sidecar = await readSidecar(projectRoot, ro.id);
    const old = sidecar?.["folderId"];
    const kind = classifyInboxMove(
      subtree,
      { id: ro.id, folderId: typeof old === "string" ? old : null },
      dest,
    );
    if (kind === "out") ids.add(ro.id);
  }
  for (const fo of input.folderOrder) {
    const kind = classifyInboxMove(
      subtree,
      { id: fo.id, type: "folder" },
      fo.folderId ?? null,
    );
    if (kind !== "out") continue;
    const inside = descendantFolderIds(folders, fo.id);
    for (const id of await resourcesInFolders(projectRoot, inside)) {
      ids.add(id);
    }
  }
  return [...ids];
}

/** Reads the pre-move state. A project with no Inbox plans nothing. */
async function planClearing(
  projectRoot: string,
  input: ReorderResourcesInput,
): Promise<ClearPlan> {
  try {
    const config = await loadProjectConfig(projectRoot);
    if (!config.inboxFolderId) return { ok: true, ids: [] };
    const folders = (await readFolderTree(
      path.join(projectRoot, "folders"),
    )) as InboxFolderNode[];
    const result = computeInboxSubtree(folders, config.inboxFolderId);
    if (!result.ok) return { ok: false };
    const ids = await collectLeavers(
      projectRoot,
      folders,
      result.subtree,
      input,
    );
    return { ok: true, ids };
  } catch (err) {
    if (isLockedAccessError(err)) throw err;
    // eslint-disable-next-line no-console
    console.error("inbox move planning failed", err);
    return { ok: false };
  }
}

/**
 * Persists a reorder like `reorderResourcesCore` (same errors), then clears
 * the compile exclusion of every resource that left the Inbox subtree.
 *
 * @returns `{}` or `{ notice }` when the clearing could not be done.
 * @throws What `reorderResourcesCore` throws; a locked-access error.
 */
export async function reorderResourcesClearingInboxExclusions(
  projectId: string,
  input: ReorderResourcesInput,
): Promise<ReorderOutcome> {
  const projectRoot = resolveResourceProjectRootOrThrow(projectId);
  const plan = await planClearing(projectRoot, input);
  await reorderResourcesCore(projectId, input);
  if (!plan.ok) return { notice: INBOX_EXCLUSION_NOT_CLEARED_NOTICE };
  if (plan.ids.length === 0) return {};
  try {
    await removeCompileExclusions(projectRoot, plan.ids);
  } catch (err) {
    if (isLockedAccessError(err)) throw err;
    // eslint-disable-next-line no-console
    console.error("inbox compile exclusion clearing failed", err);
    return { notice: INBOX_EXCLUSION_NOT_CLEARED_NOTICE };
  }
  return {};
}
