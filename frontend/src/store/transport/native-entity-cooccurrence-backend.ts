/**
 * @module store/transport/native-entity-cooccurrence-backend
 *
 * **entity-cooccurrence later-task seam, created early (Task 3).** The
 * in-process implementation of {@link EntityCooccurrenceTransport} for a
 * native (Capacitor) build: instead of
 * `fetch('/api/project/:projectId/entity-cooccurrence')`, it invokes the
 * *same* transport-agnostic core the HTTP route uses
 * (`lib/models/mentions-core.ts`'s `getEntityCooccurrence`). There is no
 * server and no HTTP — the exact same business logic runs directly in the
 * WebView process. Mirrors `native-entity-mention-counts-backend.ts`'s
 * structure.
 *
 * This module exists now (rather than only in a later task) because
 * Vite/Turbopack resolve a dynamic `import()`'s literal specifier into the
 * module graph regardless of whether the runtime branch that reaches it is
 * taken — so `lib/api/entity-cooccurrence.ts`'s dynamic import needs a real
 * module at this path to be transformable at all, including in the
 * web/desktop test suite (measured directly: `vitest` fails to load
 * `entity-cooccurrence.ts` with "Failed to resolve import" until this file
 * exists, matching `native-entity-mention-counts-backend.ts`'s own doc
 * comment about the same constraint). The `next.config.mjs`
 * `turbopack.resolveAlias` substitution (aliasing this module to its
 * `.web-stub` on the web/desktop build) and the formal native/web parity
 * test now both exist:
 * `entity-cooccurrence-native-web-parity.test.ts` covers native/HTTP
 * behavioral parity, and
 * `native-entity-cooccurrence-backend-web-exclusion.test.ts` covers the
 * web-bundle exclusion (`entity-cooccurrence-transport.test.ts` covers only
 * the HTTP path).
 *
 * This module is imported *only* on the native path (see
 * `lib/api/entity-cooccurrence.ts`'s dynamic import), because it pulls in
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
 * **Project root resolution.** Like `native-entity-mention-counts-backend.ts`,
 * this backend resolves `projectId` -> project root itself via the shared
 * `resolveProjectRoot()` (`project-root-resolver.ts`), since
 * `getEntityCooccurrence` takes a project root rather than a `projectId`.
 *
 * **Degrade-gracefully parity.** The HTTP transport's method never
 * throws — any failure (network, non-2xx, malformed body) yields `{}`.
 * This backend mirrors that: any error, including an invalid `projectId`,
 * is swallowed and resolves to the same empty co-occurrence map, matching
 * `lib/api/entity-cooccurrence.ts`'s HTTP implementation.
 */
import { createNativeRunner, type NativeBackendDeps } from "./native-runner";
import { resolveProjectRoot } from "../../lib/models/project-root-resolver";
import { getEntityCooccurrence } from "../../lib/models/mentions-core";
import type {
  EntityCooccurrenceEntry,
  EntityCooccurrenceTransport,
} from "../../lib/api/entity-cooccurrence";

/** The empty co-occurrence map returned on any read failure. */
const EMPTY_COOCCURRENCE: Record<string, EntityCooccurrenceEntry[]> = {};

/**
 * Builds the in-process entity-cooccurrence transport for a native build.
 *
 * @param deps - Test/injection seam; omit in production.
 */
export function createNativeEntityCooccurrenceTransport(
  deps: NativeBackendDeps = {},
): EntityCooccurrenceTransport {
  const run = createNativeRunner(deps);

  return {
    async getEntityCooccurrence(projectId) {
      return run(async () => {
        try {
          const projectRoot = resolveProjectRoot(projectId);
          if (!projectRoot) return EMPTY_COOCCURRENCE;
          return await getEntityCooccurrence(projectRoot);
        } catch {
          // Mirrors the HTTP transport's degrade-gracefully parity.
          return EMPTY_COOCCURRENCE;
        }
      });
    },
  };
}
