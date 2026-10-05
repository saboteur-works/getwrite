/**
 * @module store/transport/native-entity-graph-kind-styles-backend
 *
 * In-process {@link EntityGraphKindStylesTransport} for a native (Capacitor)
 * build: runs the same model-layer functions the HTTP route uses
 * (`entity-graph-kind-styles.ts`) inside the native storage context,
 * mirroring `native-entity-graph-positions-backend.ts`'s structure — the
 * model layer takes a project root rather than a `projectId`, so this
 * backend resolves `projectId` -> project root itself via the shared
 * `resolveProjectRoot()` (`project-root-resolver.ts`).
 *
 * Follows the positions backend's reject-on-any-failure contract: a
 * degraded read here would be indistinguishable from "no styles configured
 * yet," so every method propagates its failure rather than swallowing it,
 * including an invalid `projectId`.
 *
 * Imported only on the native path (`lib/api/entity-graph-kind-styles.ts`'s
 * dynamic import); `next.config.mjs` aliases it to a `node:*`-free web-stub
 * in web/desktop builds.
 */
import { createNativeRunner, type NativeBackendDeps } from "./native-runner";
import { resolveProjectRoot } from "../../lib/models/project-root-resolver";
import {
  loadEntityGraphKindStyles,
  upsertEntityGraphKindStyle,
} from "../../lib/models/entity-graph-kind-styles";
import type { EntityGraphKindStylesTransport } from "../../lib/api/entity-graph-kind-styles";

function requireProjectRoot(projectId: string): string {
  const projectRoot = resolveProjectRoot(projectId);
  if (!projectRoot) {
    throw new Error(`Invalid projectId: ${projectId}`);
  }
  return projectRoot;
}

/**
 * Builds the in-process entity-graph-kind-styles transport for a native
 * build.
 *
 * @param deps - Test/injection seam; omit in production.
 */
export function createNativeEntityGraphKindStylesTransport(
  deps: NativeBackendDeps = {},
): EntityGraphKindStylesTransport {
  const run = createNativeRunner(deps);
  return {
    getEntityGraphKindStyles: (projectId) =>
      run(() => loadEntityGraphKindStyles(requireProjectRoot(projectId))),
    saveEntityGraphKindStyle: (projectId, entityKind, color, shape) =>
      run(() =>
        upsertEntityGraphKindStyle(
          requireProjectRoot(projectId),
          entityKind,
          color,
          shape,
        ),
      ),
  };
}
