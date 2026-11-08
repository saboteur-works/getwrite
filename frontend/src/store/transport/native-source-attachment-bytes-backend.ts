/**
 * @module store/transport/native-source-attachment-bytes-backend
 *
 * In-process {@link AttachmentBytesTransport} for a native (Capacitor) build:
 * runs the same core the HTTP route uses (`source-attachment-bytes-core.ts`)
 * inside the native storage context. Validation lives in that core, so the
 * same bad id throws the same message here as it maps to 400 on the route,
 * and a locked project raises the same locked-access error the route maps to
 * 401/409. That parity is reasoned from the shared core, not run on a device.
 * Every error propagates; nothing is returned as empty on failure.
 *
 * Imported only on the native path (`lib/api/source-attachment-bytes.ts`'s
 * dynamic import); `next.config.mjs` aliases it to a `node:*`-free web-stub in
 * web/desktop builds.
 */
import { createNativeRunner, type NativeBackendDeps } from "./native-runner";
import { readAttachmentBytesCore } from "../../lib/models/source-attachment-bytes-core";
import type { AttachmentBytesTransport } from "../../lib/api/source-attachment-bytes";

/**
 * Builds the in-process attachment byte-read transport for a native build.
 *
 * @param deps - Test/injection seam; omit in production.
 */
export function createNativeAttachmentBytesTransport(
  deps: NativeBackendDeps = {},
): AttachmentBytesTransport {
  const run = createNativeRunner(deps);
  return {
    readAttachmentBytes: (projectId, resourceId, attachmentId) =>
      run(() => readAttachmentBytesCore(projectId, resourceId, attachmentId)),
  };
}
