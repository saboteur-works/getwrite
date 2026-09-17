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
      const results: RestoreItemResult[] = [];
      for (const id of ids) {
        const result = await run(async () => {
          const projectRoot = resolveProjectRoot(projectId);
          if (!projectRoot) {
            throw new Error(`Invalid projectId: ${projectId}`);
          }
          return restoreOneCore(projectRoot, id);
        });
        results.push(result);
      }
      return results;
    },

    async purge(projectId, selection): Promise<PurgeItemResult[]> {
      const ids = await run(async () => {
        const projectRoot = resolveProjectRoot(projectId);
        if (!projectRoot) {
          throw new Error(`Invalid projectId: ${projectId}`);
        }
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
        const result = await run(async () => {
          const projectRoot = resolveProjectRoot(projectId);
          if (!projectRoot) {
            throw new Error(`Invalid projectId: ${projectId}`);
          }
          return purgeOneCore(projectRoot, id);
        });
        results.push(result);
      }
      return results;
    },
  };
}
