/**
 * @module store/transport/native-resource-bytes-backend
 *
 * In-process {@link ResourceBytesTransport} for a native (Capacitor) build:
 * runs `readResourceBytesCore` inside the native storage context
 * (`createNativeRunner`). Every error from the core, typed refusals and
 * failures and the locked-access error included, propagates unchanged.
 *
 * Imported only on the native path (`lib/api/resource-bytes.ts`'s dynamic
 * import); `next.config.mjs` aliases it to a `node:*`-free web-stub in
 * web/desktop builds.
 */
import { createNativeRunner, type NativeBackendDeps } from "./native-runner";
import { readResourceBytesCore } from "../../lib/models/resource-bytes-core";
import type { ResourceBytesTransport } from "../../lib/api/resource-bytes";

/**
 * Builds the in-process resource byte-read transport for a native build.
 *
 * @param deps - Test/injection seam; omit in production.
 */
export function createNativeResourceBytesTransport(
  deps: NativeBackendDeps = {},
): ResourceBytesTransport {
  const run = createNativeRunner(deps);
  return {
    readResourceBytes: (projectId, resourceId) =>
      run(() => readResourceBytesCore(projectId, resourceId)),
  };
}
