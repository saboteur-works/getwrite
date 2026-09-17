/**
 * @module store/transport/native-trash-backend
 *
 * The in-process implementation of {@link TrashTransport} for a native
 * (Capacitor) build: instead of hitting the Trash HTTP routes, it invokes
 * the same transport-agnostic core the routes themselves call
 * (`lib/models/trash-core.ts`). There is no server and no HTTP — the exact
 * same business logic runs directly in the WebView process. Mirrors
 * `native-entity-relationships-backend.ts`'s structure.
 *
 * **Project root resolution.** Like `native-entity-relationships-backend.ts`,
 * this backend resolves `projectId` -> project root itself via the shared
 * `resolveProjectRoot()` (`project-root-resolver.ts`), since `trash-core.ts`'s
 * functions take a project root/path rather than a `projectId`.
 *
 * **Per-id `run()` re-entry.** `restore` and `purge` each invoke `run(...)`
 * once *per id* rather than once for the whole batch. This is deliberate: a
 * later task (per-item failure taxonomy) depends on that per-id boundary to
 * catch and report a single item's failure without one bad id aborting the
 * whole batch's storage-context binding. `purge`'s `{ all: true }` selection
 * is resolved to a concrete id list first (mirroring `trash-core.ts`'s own
 * `purgeBatchCore` resolution), then each id is purged through its own
 * `run()` call — `purgeBatchCore` itself is not used here, since its internal
 * loop calls `purgeOneCore` directly without re-entering `run()` per
 * iteration.
 *
 * This module is imported *only* on the native path (see `lib/api/trash.ts`'s
 * dynamic import), because it pulls in the server-side model layer and
 * storage layer, which must never enter the web client bundle.
 *
 * **Failure taxonomy (FR-8/FR-9/FR-10).** There are exactly three cases:
 *
 * 1. An invalid/unresolvable `projectId` (`resolveProjectRoot` returns
 *    `null`) rejects the *whole* `list`/`restore`/`purge` call, before any
 *    per-item `restoreOneCore`/`purgeOneCore` call is even attempted — there
 *    is no project root to operate against. For `restore`/`purge` this
 *    project-root resolution happens exactly once, up front, outside and
 *    before the per-id loop (and, for `purge`'s `{ all: true }` selection,
 *    before `listTrashCore` is even called to resolve it to an id list).
 * 2. `list` never catches internally: a `listTrashCore` throw (e.g. a
 *    Capacitor filesystem-bridge error) always propagates as a rejected
 *    promise rather than degrading to an empty/partial listing.
 * 3. Inside `restore`/`purge`'s per-id loop (once the project root is
 *    already known valid), any error thrown for a single id — a bridge
 *    error, or a `PurgeSweepError` mid-sweep — is caught at the per-item
 *    boundary and turned into that id's `{ id, ok: false, error }` result,
 *    with the rest of the batch continuing. `restoreOneCore`/`purgeOneCore`
 *    already swallow their own internal errors into such a result, so this
 *    per-item catch exists to cover anything that could escape *around*
 *    those calls (e.g. a bridge error surfacing through `run()` itself).
 */
import { createNativeRunner, type NativeBackendDeps } from "./native-runner";
import { resolveProjectRoot } from "../../lib/models/project-root-resolver";
import {
  listTrashCore,
  purgeOneCore,
  restoreOneCore,
} from "../../lib/models/trash-core";
import type {
  PurgeItemResult,
  PurgeSelection,
  RestoreItemResult,
  TrashListing,
  TrashTransport,
} from "../../lib/api/trash";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Builds the in-process trash transport for a native build.
 *
 * @param deps - Test/injection seam; omit in production.
 */
export function createNativeTrashTransport(
  deps: NativeBackendDeps = {},
): TrashTransport {
  const run = createNativeRunner(deps);

  return {
    async list(projectId): Promise<TrashListing> {
      return run(async () => {
        const projectRoot = resolveProjectRoot(projectId);
        if (!projectRoot) {
          throw new Error(`Invalid projectId: ${projectId}`);
        }
        return listTrashCore(projectRoot);
      });
    },

    async restore(projectId, ids): Promise<RestoreItemResult[]> {
      // Case 1: resolve the project root once, up front. An invalid id
      // rejects the whole call without attempting any per-id restore.
      const projectRoot = resolveProjectRoot(projectId);
      if (!projectRoot) {
        throw new Error(`Invalid projectId: ${projectId}`);
      }

      const results: RestoreItemResult[] = [];
      for (const id of ids) {
        try {
          const result = await run(() => restoreOneCore(projectRoot, id));
          results.push(result);
        } catch (err: unknown) {
          // Case 2/3: a per-item failure is caught here and reported for
          // this id only; the batch continues to the next id.
          results.push({ id, ok: false, error: errorMessage(err) });
        }
      }
      return results;
    },

    async purge(projectId, selection): Promise<PurgeItemResult[]> {
      // Case 1: resolve the project root once, up front — before even
      // resolving `{ all: true }` to a concrete id list. An invalid id
      // rejects the whole call without attempting any per-id purge.
      const projectRoot = resolveProjectRoot(projectId);
      if (!projectRoot) {
        throw new Error(`Invalid projectId: ${projectId}`);
      }

      const ids = await run(async () => {
        if (
          !Array.isArray(selection) &&
          "all" in selection &&
          selection.all === true
        ) {
          const trashed = await listTrashCore(projectRoot);
          return [
            ...trashed.resources.map((r) => r.id),
            ...trashed.folders.map((f) => f.id),
          ];
        }
        return selection as string[];
      });

      const results: PurgeItemResult[] = [];
      for (const id of ids) {
        try {
          const result = await run(() => purgeOneCore(projectRoot, id));
          results.push(result);
        } catch (err: unknown) {
          // Case 2/3: a per-item failure (including a `PurgeSweepError`
          // that somehow escaped `purgeOneCore`'s own internal catch) is
          // caught here and reported for this id only; the batch continues.
          results.push({ id, ok: false, error: errorMessage(err) });
        }
      }
      return results;
    },
  };
}
