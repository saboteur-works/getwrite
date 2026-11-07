/**
 * @module store/transport/native-folder-metadata-backend
 *
 * In-process {@link FolderMetadataTransport} for a native (Capacitor) build:
 * runs the same cores the HTTP route uses (`folder-metadata-core.ts`) inside
 * the native storage context. Validation lives in the core, so the same bad
 * input throws the same message here as it maps to 400 on the route. Every
 * error propagates; a failed read never surfaces as empty.
 *
 * Lock parity with the server is reasoned from the shared core, not run.
 *
 * Imported only on the native path (`lib/api/folder-metadata.ts`'s dynamic
 * import); `next.config.mjs` aliases it to a `node:*`-free web-stub in
 * web/desktop builds.
 */
import { createNativeRunner, type NativeBackendDeps } from "./native-runner";
import {
  getFolderMetadataCore,
  updateFolderMetadataCore,
} from "../../lib/models/folder-metadata-core";
import type { FolderMetadataTransport } from "../../lib/api/folder-metadata";

/**
 * Builds the in-process folder-metadata transport for a native build.
 *
 * @param deps - Test/injection seam; omit in production.
 */
export function createNativeFolderMetadataTransport(
  deps: NativeBackendDeps = {},
): FolderMetadataTransport {
  const run = createNativeRunner(deps);
  return {
    getFolderMetadata: (projectId, folderId) =>
      run(() => getFolderMetadataCore(projectId, folderId)),
    updateFolderMetadata: (projectId, folderId, metadata) =>
      run(() => updateFolderMetadataCore(projectId, folderId, metadata)),
  };
}
