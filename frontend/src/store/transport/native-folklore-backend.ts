/**
 * @module store/transport/native-folklore-backend
 *
 * In-process folklore variant-read transport for a native (Capacitor) build
 * (Feature 110, FR-13, FR-21): runs the same core the HTTP route uses
 * (`folklore-variant-read-core.ts`) inside the native storage context, and
 * returns its typed result (`text`, `none`, `unreadable`) unchanged. Every
 * error, a locked-access error included, propagates; nothing is returned as
 * empty on failure.
 *
 * A project carrying the encrypted marker (or whose marker cannot be read) is
 * refused before the core runs, with the typed error of Feature 107's guard
 * (`native-encrypted-project-guard.ts`, reused) in the wording the Claims
 * backend uses. That wording speaks of a change and of nothing being saved,
 * and this read changes nothing; the guard has no wording for a read.
 *
 * Imported only on the native path (the folklore client's dynamic import,
 * Task 11); `next.config.mjs` aliases it to a `node:*`-free web-stub in
 * web/desktop builds.
 */
import { createNativeRunner, type NativeBackendDeps } from "./native-runner";
import { assertProjectNotEncrypted } from "./native-encrypted-project-guard";
import { readVariantTextCore } from "../../lib/models/folklore-variant-read-core";
import type { VariantTextResult } from "../../lib/models/folklore-types";

/** The in-process folklore transport's operations (ids are validated by the core). */
export interface NativeFolkloreTransport {
  readVariantText(
    projectId: string,
    resourceId: string,
  ): Promise<VariantTextResult>;
}

/**
 * Builds the in-process folklore transport for a native build.
 *
 * @param deps - Test/injection seam; omit in production.
 */
export function createNativeFolkloreTransport(
  deps: NativeBackendDeps = {},
): NativeFolkloreTransport {
  const run = createNativeRunner(deps);
  return {
    readVariantText: (projectId, resourceId) =>
      run(async () => {
        await assertProjectNotEncrypted(projectId, "variant-read");
        return readVariantTextCore(projectId, resourceId);
      }),
  };
}
