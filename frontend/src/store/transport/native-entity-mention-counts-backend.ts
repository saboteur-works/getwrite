/**
 * @module store/transport/native-entity-mention-counts-backend
 *
 * **entity-roster later-task seam, created early (Task 3).** The
 * in-process implementation of {@link EntityMentionCountsTransport} for a
 * native (Capacitor) build: instead of
 * `fetch('/api/project/:projectId/entity-mention-counts')`, it invokes the
 * *same* transport-agnostic core the HTTP route uses
 * (`lib/models/mentions-core.ts`'s `getProjectMentionCounts`). There is no
 * server and no HTTP — the exact same business logic runs directly in the
 * WebView process. Mirrors `native-mentions-backend.ts` and
 * `native-entity-alias-table-backend.ts`'s structure.
 *
 * This module exists now (rather than only in a later task) because
 * Vite/Turbopack resolve a dynamic `import()`'s literal specifier into the
 * module graph regardless of whether the runtime branch that reaches it is
 * taken — so `lib/api/entity-mention-counts.ts`'s dynamic import needs a
 * real module at this path to be transformable at all, including in the
 * web/desktop test suite (measured directly: `vitest` fails to load
 * `entity-mention-counts.ts` with "Failed to resolve import" until this
 * file exists, matching `native-entity-alias-table-backend.ts`'s own doc
 * comment about the same constraint). A later task remains responsible for
 * the `next.config.mjs` `turbopack.resolveAlias` substitution and the
 * formal native/web parity test
 * (`entity-mention-counts-transport.test.ts` only covers the HTTP path).
 *
 * This module is imported *only* on the native path (see
 * `lib/api/entity-mention-counts.ts`'s dynamic import), because it pulls in
 * the server-side mentions core and storage layer, which must never enter
 * the web client bundle.
 *
 * **Storage context binding.** Every operation runs through the shared
 * `createNativeRunner(deps)` helper (`native-runner.ts`): `deps.fs` (tests)
 * binds a one-off {@link runInStorageContext} scope over the injected fake;
 * in production it awaits the memoized native bootstrap
 * (`ensureNativeStorageContext()` — context bound + projects dir created)
 * and resolves against the ambient default {@link StorageContext}, with no
 * per-operation rebinding.
 *
 * **Project root resolution.** Like `native-mentions-backend.ts`, this
 * backend resolves `projectId` -> project root itself via the shared
 * `resolveProjectRoot()` (`project-root-resolver.ts`), since
 * `getProjectMentionCounts` takes a project root rather than a `projectId`.
 *
 * **Degrade-gracefully parity.** The HTTP transport's method never
 * throws — any failure (network, non-2xx, malformed body) yields `{}`.
 * This backend mirrors that: any error, including an invalid `projectId`,
 * is swallowed and resolves to the same empty counts map, matching
 * `lib/api/entity-mention-counts.ts`'s HTTP implementation.
 */
import { createNativeRunner, type NativeBackendDeps } from "./native-runner";
import { resolveProjectRoot } from "../../lib/models/project-root-resolver";
import { getProjectMentionCounts } from "../../lib/models/mentions-core";
import type {
  EntityMentionCounts,
  EntityMentionCountsTransport,
} from "../../lib/api/entity-mention-counts";

/** The empty counts map returned on any read failure. */
const EMPTY_MENTION_COUNTS: Record<string, EntityMentionCounts> = {};

/**
 * Builds the in-process entity-mention-counts transport for a native build.
 *
 * @param deps - Test/injection seam; omit in production.
 */
export function createNativeEntityMentionCountsTransport(
  deps: NativeBackendDeps = {},
): EntityMentionCountsTransport {
  const run = createNativeRunner(deps);

  return {
    async getEntityMentionCounts(projectId) {
      return run(async () => {
        try {
          const projectRoot = resolveProjectRoot(projectId);
          if (!projectRoot) return EMPTY_MENTION_COUNTS;
          return await getProjectMentionCounts(projectRoot);
        } catch {
          // Mirrors the HTTP transport's degrade-gracefully parity.
          return EMPTY_MENTION_COUNTS;
        }
      });
    },
  };
}
