/**
 * @module store/transport/native-entity-relationships-backend
 *
 * **entity-relationships later-task seam, created early (Task 4).** The
 * in-process implementation of {@link EntityRelationshipsTransport} for a
 * native (Capacitor) build: instead of
 * `fetch('/api/project/:projectId/entity-relationships')` /
 * `fetch('/api/project/:projectId/entity-relationships/remove')`, it invokes
 * the *same* model-layer functions the HTTP routes use
 * (`lib/models/entity-relationships.ts`). There is no server and no HTTP —
 * the exact same business logic runs directly in the WebView process.
 * Mirrors `native-tags-backend.ts`'s structure.
 *
 * This module exists now (rather than only in a later task) because
 * Vite/Turbopack resolve a dynamic `import()`'s literal specifier into the
 * module graph regardless of whether the runtime branch that reaches it is
 * taken — so `lib/api/entity-relationships.ts`'s dynamic import needs a real
 * module at this path to be transformable at all, including in the
 * web/desktop test suite and `tsc` (measured directly: both `vitest` and
 * `tsc --noEmit` fail to resolve `entity-relationships.ts`'s dynamic import
 * with "Failed to resolve import" / `TS2307` until this file exists — the
 * identical constraint already documented in
 * `native-entity-cooccurrence-backend.ts`'s own doc comment, itself created
 * ahead of its own schedule for the same reason). The `next.config.mjs`
 * `turbopack.resolveAlias` substitution (aliasing this module to its
 * `.web-stub` on the web/desktop build) and the formal native/web parity
 * test now both exist:
 * `entity-relationships-native-web-parity.test.ts` covers native/HTTP
 * behavioral parity, and
 * `native-entity-relationships-backend-web-exclusion.test.ts` covers the
 * web-bundle exclusion (`entity-relationships-transport.test.ts` covers only
 * the HTTP path).
 *
 * This module is imported *only* on the native path (see
 * `lib/api/entity-relationships.ts`'s dynamic import), because it pulls in
 * the server-side model layer and storage layer, which must never enter the
 * web client bundle.
 *
 * **Storage context binding.** Every operation runs through the shared
 * `createNativeRunner(deps)` helper (`native-runner.ts`): `deps.fs` (tests)
 * binds a one-off {@link runInStorageContext} scope over the injected fake;
 * in production it awaits the memoized native bootstrap
 * (`ensureNativeStorageContext()` — context bound + projects dir created)
 * and resolves against the ambient default {@link StorageContext}, with no
 * per-operation rebinding.
 *
 * **Project root resolution.** Like `native-entity-cooccurrence-backend.ts`,
 * this backend resolves `projectId` -> project root itself via the shared
 * `resolveProjectRoot()` (`project-root-resolver.ts`), since the model-layer
 * functions take a project root rather than a `projectId`.
 *
 * **Degrade-gracefully parity.** `list` mirrors the HTTP transport's
 * degrade-to-`[]` behavior on any failure (including an invalid
 * `projectId`); `create` mirrors degrade-to-`null` (including the model
 * layer's FR-4/FR-15 validation throws); `remove` mirrors degrade-to-`false`;
 * `removeByEntity` mirrors degrade-to-`0` (FR-9/FR-10). `listOrThrow`
 * (FR-26) is the one exception: it lets a failure (an invalid `projectId`,
 * or `loadEntityRelationships` throwing) propagate rather than degrading,
 * mirroring the HTTP transport's `listOrThrow`.
 */
import { createNativeRunner, type NativeBackendDeps } from "./native-runner";
import { resolveProjectRoot } from "../../lib/models/project-root-resolver";
import {
  createEntityRelationship,
  loadEntityRelationships,
  removeEntityRelationship,
  removeEntityRelationshipsForEntity,
} from "../../lib/models/entity-relationships";
import type { EntityRelationshipsTransport } from "../../lib/api/entity-relationships";

/**
 * Builds the in-process entity-relationships transport for a native build.
 *
 * @param deps - Test/injection seam; omit in production.
 */
export function createNativeEntityRelationshipsTransport(
  deps: NativeBackendDeps = {},
): EntityRelationshipsTransport {
  const run = createNativeRunner(deps);

  return {
    async list(projectId) {
      return run(async () => {
        try {
          const projectRoot = resolveProjectRoot(projectId);
          if (!projectRoot) return [];
          return await loadEntityRelationships(projectRoot);
        } catch {
          // Mirrors the HTTP transport's degrade-to-`[]` parity.
          return [];
        }
      });
    },

    async listOrThrow(projectId) {
      return run(async () => {
        const projectRoot = resolveProjectRoot(projectId);
        if (!projectRoot) {
          throw new Error(`Invalid projectId: ${projectId}`);
        }
        return loadEntityRelationships(projectRoot);
      });
    },

    async create(projectId, sourceEntityId, targetEntityId, relationshipType) {
      return run(async () => {
        try {
          const projectRoot = resolveProjectRoot(projectId);
          if (!projectRoot) return null;
          return await createEntityRelationship(
            projectRoot,
            sourceEntityId,
            targetEntityId,
            relationshipType,
          );
        } catch {
          // Mirrors the HTTP transport's degrade-to-`null` parity, including
          // the model layer's FR-4/FR-15 validation throws.
          return null;
        }
      });
    },

    async remove(projectId, edgeId) {
      return run(async () => {
        try {
          const projectRoot = resolveProjectRoot(projectId);
          if (!projectRoot) return false;
          return await removeEntityRelationship(projectRoot, edgeId);
        } catch {
          // Mirrors the HTTP transport's degrade-to-`false` parity.
          return false;
        }
      });
    },

    async removeByEntity(projectId, entityId) {
      return run(async () => {
        try {
          const projectRoot = resolveProjectRoot(projectId);
          if (!projectRoot) return 0;
          return await removeEntityRelationshipsForEntity(
            projectRoot,
            entityId,
          );
        } catch {
          // Mirrors the HTTP transport's degrade-to-`0` parity.
          return 0;
        }
      });
    },
  };
}
