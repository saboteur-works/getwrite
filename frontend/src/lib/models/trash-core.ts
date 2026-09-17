/**
 * @module trash-core
 *
 * Transport-agnostic core for the Trash tab's four operations —
 * `projectPath`-in / data-out, with no `NextResponse`/`withStorageContext`
 * binding of its own (that stays with each caller: an HTTP route today,
 * a native backend in a later task).
 *
 * `listTrashCore`, `restoreOneCore`, and `purgeOneCore` are lifted verbatim
 * (no logic change beyond the added `projectPath` guard) from their
 * previous inline/local-function homes in
 * `app/api/project/[project-id]/trash/route.ts`,
 * `.../trash/restore/route.ts`, and `.../trash/purge/route.ts` respectively.
 * `purgeBatchCore` is new: it replaces the `{ all: true }` →
 * id-list-resolution-and-loop that used to live inline in the purge route's
 * `handlePost`, so that resolution logic is no longer duplicated between
 * the HTTP route and any future native caller.
 *
 * Every exported function guards `projectPath` itself rather than relying
 * on a downstream throw: `path.join("", ".trash")` silently returns the
 * relative string `".trash"` with no error, so an empty-string
 * `projectPath` would otherwise resolve to a bogus path within the current
 * working directory instead of failing closed.
 */
import {
  listTrashedItems,
  purgeFolder,
  purgeResource,
  restoreFolder,
  restoreResource,
  resolveTrashedItemKind,
  type RestoredReferenceInfo,
} from "./trash";

/** The combined resources/folders shape {@link listTrashedItems} returns. */
type ListTrashedItemsResult = Awaited<ReturnType<typeof listTrashedItems>>;

/**
 * Selects which trashed items {@link purgeBatchCore} should purge: either an
 * explicit id list, or every currently trashed top-level item via
 * `{ all: true }`.
 */
export type PurgeSelection = { ids: string[] } | { all: true };

export interface RestoreItemResult {
  id: string;
  ok: boolean;
  relocated?: boolean;
  renamed?: boolean;
  restoredName?: string;
  referencesNotRestored?: RestoredReferenceInfo[] | "no-record";
  error?: string;
}

export interface PurgeItemResult {
  id: string;
  ok: boolean;
  error?: string;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Guards `projectPath` against the empty-string case (and other falsy
 * values), which downstream `path.join`/model-layer calls do not reject on
 * their own.
 *
 * @throws {Error} When `projectPath` is falsy (including `""`).
 */
function assertProjectPath(projectPath: string): void {
  if (!projectPath) {
    throw new Error("trash-core: projectPath is required");
  }
}

/**
 * Lists every currently trashed resource and top-level trashed folder,
 * lifted with no logic change from the previous inline call in
 * `trash/route.ts`'s `handleGet`.
 */
export async function listTrashCore(
  projectPath: string,
): Promise<ListTrashedItemsResult> {
  assertProjectPath(projectPath);

  const trashed = await listTrashedItems(projectPath);
  return trashed;
}

/**
 * Restores a single trashed item by id, dispatching to
 * `restoreResource`/`restoreFolder` via `resolveTrashedItemKind`. Lifted
 * verbatim (aside from the added `projectPath` guard) from
 * `trash/restore/route.ts`'s previous local `restoreOne` function.
 */
export async function restoreOneCore(
  projectPath: string,
  id: string,
): Promise<RestoreItemResult> {
  assertProjectPath(projectPath);

  try {
    const kind = await resolveTrashedItemKind(projectPath, id);

    if (kind === "resource") {
      const result = await restoreResource(projectPath, id);
      return {
        id,
        ok: true,
        relocated: result.relocated,
        renamed: result.renamed,
        restoredName: result.restoredName,
        referencesNotRestored: result.referencesNotRestored,
      };
    }

    if (kind === "folder") {
      const result = await restoreFolder(projectPath, id);
      return {
        id,
        ok: true,
        relocated: result.relocated,
        renamed: result.renamed,
        restoredName: result.restoredName,
      };
    }

    return { id, ok: false, error: "Not found in trash" };
  } catch (err: unknown) {
    return { id, ok: false, error: errorMessage(err) };
  }
}

/**
 * Permanently purges a single trashed item by id, dispatching to
 * `purgeResource`/`purgeFolder` via `resolveTrashedItemKind`. Lifted
 * verbatim (aside from the added `projectPath` guard) from
 * `trash/purge/route.ts`'s previous local `purgeOne` function.
 */
export async function purgeOneCore(
  projectPath: string,
  id: string,
): Promise<PurgeItemResult> {
  assertProjectPath(projectPath);

  try {
    const kind = await resolveTrashedItemKind(projectPath, id);

    if (kind === "resource") {
      await purgeResource(projectPath, id);
      return { id, ok: true };
    }

    if (kind === "folder") {
      await purgeFolder(projectPath, id);
      return { id, ok: true };
    }

    return { id, ok: false, error: "Not found in trash" };
  } catch (err: unknown) {
    return { id, ok: false, error: errorMessage(err) };
  }
}

/**
 * Purges a batch of trashed items, resolving `{ all: true }` to every
 * currently trashed top-level id (via {@link listTrashCore}) before looping
 * {@link purgeOneCore} over the resolved ids. Replaces the inline
 * `{ all: true }` resolution-and-loop that used to live in
 * `trash/purge/route.ts`'s `handlePost`.
 */
export async function purgeBatchCore(
  projectPath: string,
  selection: PurgeSelection,
): Promise<PurgeItemResult[]> {
  assertProjectPath(projectPath);

  let ids: string[];
  if ("all" in selection && selection.all === true) {
    const trashed = await listTrashCore(projectPath);
    ids = [
      ...trashed.resources.map((r) => r.id),
      ...trashed.folders.map((f) => f.id),
    ];
  } else {
    ids = (selection as { ids: string[] }).ids;
  }

  const results: PurgeItemResult[] = [];
  for (const id of ids) {
    results.push(await purgeOneCore(projectPath, id));
  }

  return results;
}
