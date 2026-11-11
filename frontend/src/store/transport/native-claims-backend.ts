/**
 * @module store/transport/native-claims-backend
 *
 * In-process claims transport for a native (Capacitor) build (Feature 108,
 * FR-21): runs the same cores the HTTP route uses (`claims-add-core.ts`,
 * `claims-update-core.ts`, `claims-list-core.ts`) inside the native storage
 * context, so the same bad input throws the same error here as it maps to 400
 * on the route. Every error propagates; nothing is returned as empty on
 * failure.
 *
 * Native storage has no encrypting layer, so a write into a project carrying
 * the encrypted marker is refused before the core runs, with the typed error
 * of Feature 107's guard (`native-encrypted-project-guard.ts`, reused). The
 * read-only list is not guarded, as on the web path.
 *
 * Imported only on the native path (`lib/api/claims.ts`'s dynamic import,
 * Task 16); `next.config.mjs` aliases it to a `node:*`-free web-stub in
 * web/desktop builds.
 */
import { createNativeRunner, type NativeBackendDeps } from "./native-runner";
import { assertProjectNotEncrypted } from "./native-encrypted-project-guard";
import { addClaimCore } from "../../lib/models/claims-add-core";
import { updateClaimCore } from "../../lib/models/claims-update-core";
import { listClaimsCore } from "../../lib/models/claims-list-core";
import type { ClaimListResult } from "../../lib/models/claim-types";
import type { Annotation } from "../../lib/models/types";

/** The in-process claims transport's operations (inputs are validated by the cores). */
export interface NativeClaimsTransport {
  list(projectId: string): Promise<ClaimListResult>;
  add(
    projectId: string,
    resourceId: string,
    input: unknown,
  ): Promise<Annotation>;
  update(
    projectId: string,
    resourceId: string,
    annotationId: string,
    input: unknown,
  ): Promise<Annotation>;
}

/**
 * Builds the in-process claims transport for a native build.
 *
 * @param deps - Test/injection seam; omit in production.
 */
export function createNativeClaimsTransport(
  deps: NativeBackendDeps = {},
): NativeClaimsTransport {
  const run = createNativeRunner(deps);
  return {
    list: (projectId) => run(() => listClaimsCore(projectId)),
    add: (projectId, resourceId, input) =>
      run(async () => {
        await assertProjectNotEncrypted(projectId);
        return addClaimCore(projectId, resourceId, input);
      }),
    update: (projectId, resourceId, annotationId, input) =>
      run(async () => {
        await assertProjectNotEncrypted(projectId);
        return updateClaimCore(projectId, resourceId, annotationId, input);
      }),
  };
}
