/**
 * @module store/transport/native-entity-graph-positions-backend
 *
 * In-process {@link EntityGraphPositionsTransport} for a native (Capacitor)
 * build: runs the same model-layer functions the HTTP route uses
 * (`entity-graph-positions.ts`) inside the native storage context, mirroring
 * `native-entity-relationships-backend.ts`'s structure — the model layer
 * takes a project root rather than a `projectId`, so this backend resolves
 * `projectId` -> project root itself via the shared `resolveProjectRoot()`
 * (`project-root-resolver.ts`).
 *
 * Follows Task 6/Task 11's reject-on-any-failure contract (not
 * `entity-relationships.ts`'s degrade-to-fallback one): a degraded read here
 * would be indistinguishable from "no positions saved yet," so every method
 * propagates its failure rather than swallowing it, including an invalid
 * `projectId`.
 *
 * Imported only on the native path (`lib/api/entity-graph-positions.ts`'s
 * dynamic import); `next.config.mjs` aliases it to a `node:*`-free web-stub
 * in web/desktop builds.
 */
import { createNativeRunner, type NativeBackendDeps } from "./native-runner";
import { resolveProjectRoot } from "../../lib/models/project-root-resolver";
import {
  loadEntityGraphPositions,
  saveEntityGraphPosition,
} from "../../lib/models/entity-graph-positions";
import type { EntityGraphPositionsTransport } from "../../lib/api/entity-graph-positions";

function requireProjectRoot(projectId: string): string {
  const projectRoot = resolveProjectRoot(projectId);
  if (!projectRoot) {
    throw new Error(`Invalid projectId: ${projectId}`);
  }
  return projectRoot;
}

/**
 * Builds the in-process entity-graph-positions transport for a native build.
 *
 * @param deps - Test/injection seam; omit in production.
 */
export function createNativeEntityGraphPositionsTransport(
  deps: NativeBackendDeps = {},
): EntityGraphPositionsTransport {
  const run = createNativeRunner(deps);
  return {
    getEntityGraphPositions: (projectId) =>
      run(() => loadEntityGraphPositions(requireProjectRoot(projectId))),
    saveEntityGraphPosition: (
      projectId,
      entityId,
      x,
      y,
      connectionTypesSnapshot,
    ) =>
      run(() =>
        saveEntityGraphPosition(
          requireProjectRoot(projectId),
          entityId,
          x,
          y,
          connectionTypesSnapshot,
        ),
      ),
  };
}
