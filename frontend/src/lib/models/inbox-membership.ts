/**
 * Feature 106 Task 5: Inbox membership (FR-7, FR-14, FR-23, OQ-9).
 *
 * "In the Inbox" means the Inbox folder and all its descendant folders. The
 * helpers are pure and take plain lists, so the client (store) and the server
 * (`readFolderTree`) share them. No React, no `node:*`, no I/O.
 */

/** A folder as the membership walk needs it; parent is `parentId ?? folderId`. */
export interface InboxFolderNode {
  id: string;
  parentId?: string | null;
  folderId?: string | null;
}

/** A resource or folder as the membership checks need it. */
export interface InboxItemNode {
  id: string;
  type?: string;
  folderId?: string | null;
  parentId?: string | null;
}

/** The Inbox folder id (null when unset or unknown) and its subtree folder ids. */
export interface InboxSubtree {
  inboxFolderId: string | null;
  folderIds: ReadonlySet<string>;
}

/** Malformed folder data that stopped the subtree walk. */
interface InboxMembershipFailure {
  ok: false;
  reason: "parent-cycle";
  folderId: string;
}

export type InboxSubtreeResult =
  | { ok: true; subtree: InboxSubtree }
  | InboxMembershipFailure;

/** Where a move starts and ends relative to the Inbox. */
export type InboxMoveKind = "out" | "within" | "unrelated";

function parentOf(f: InboxFolderNode): string | null {
  return f.parentId ?? f.folderId ?? null;
}

/**
 * Computes the Inbox subtree. An unset id, or one naming no folder, gives an
 * empty subtree. A folder reached twice below the Inbox (a parent cycle through
 * the Inbox, or a duplicated id) is returned as a failure, never looped on and
 * never read as "not in".
 */
export function computeInboxSubtree(
  folders: readonly InboxFolderNode[],
  inboxFolderId: string | null | undefined,
): InboxSubtreeResult {
  const empty: InboxSubtree = { inboxFolderId: null, folderIds: new Set() };
  if (!inboxFolderId || !folders.some((f) => f.id === inboxFolderId)) {
    return { ok: true, subtree: empty };
  }
  const children = new Map<string, InboxFolderNode[]>();
  for (const f of folders) {
    const p = parentOf(f);
    if (p === null) continue;
    const list = children.get(p);
    if (list) list.push(f);
    else children.set(p, [f]);
  }
  const seen = new Set<string>([inboxFolderId]);
  const stack: string[] = [inboxFolderId];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    for (const child of children.get(current) ?? []) {
      if (seen.has(child.id)) {
        return { ok: false, reason: "parent-cycle", folderId: child.id };
      }
      seen.add(child.id);
      stack.push(child.id);
    }
  }
  return { ok: true, subtree: { inboxFolderId, folderIds: seen } };
}

/** The folder an item is filed in; a folder's own id counts as its location. */
function locationOf(item: InboxItemNode): string | null {
  if (item.type === "folder") return item.id;
  return item.folderId ?? null;
}

/** True when the resource's folder, or the folder itself, is in the subtree. */
export function isInInbox(subtree: InboxSubtree, item: InboxItemNode): boolean {
  const loc = locationOf(item);
  return loc !== null && subtree.folderIds.has(loc);
}

/** Ids of every non-folder resource in the subtree. */
export function inboxResourceIds(
  subtree: InboxSubtree,
  items: readonly InboxItemNode[],
): string[] {
  return items
    .filter((i) => i.type !== "folder" && isInInbox(subtree, i))
    .map((i) => i.id);
}

/** Count of resources (not folders) in the subtree. */
export function countInboxItems(
  subtree: InboxSubtree,
  items: readonly InboxItemNode[],
): number {
  return inboxResourceIds(subtree, items).length;
}

/**
 * Classifies a move of `item` under `newParentId` (null = root). "out": the
 * item is in the subtree and lands outside it. "within": it stays inside.
 * "unrelated": it starts outside, no Inbox is set, or it is the Inbox folder
 * itself (its subtree moves with it, so nothing leaves).
 */
export function classifyInboxMove(
  subtree: InboxSubtree,
  item: InboxItemNode,
  newParentId: string | null,
): InboxMoveKind {
  if (subtree.inboxFolderId === null) return "unrelated";
  if (item.type === "folder" && item.id === subtree.inboxFolderId) {
    return "unrelated";
  }
  if (!isInInbox(subtree, item)) return "unrelated";
  return newParentId !== null && subtree.folderIds.has(newParentId)
    ? "within"
    : "out";
}
