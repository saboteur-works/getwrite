/**
 * @module store/transport/native-inbox-image-capture-backend
 *
 * In-process {@link InboxImageCaptureTransport} for a native build (Feature
 * 107, FR-7, FR-11): checks the encrypted-project guard, then runs
 * `captureImageToInboxCore` inside the native storage context. Typed results
 * are returned unchanged; every error, the locked-access error included,
 * propagates unchanged. There is no HTTP route.
 *
 * Imported only on the native path (`lib/api/inbox-image-capture.ts`'s dynamic
 * import); `next.config.mjs` aliases it to a `node:*`-free web-stub elsewhere.
 */
import { createNativeRunner, type NativeBackendDeps } from "./native-runner";
import { assertProjectNotEncrypted } from "./native-encrypted-project-guard";
import { captureImageToInboxCore } from "../../lib/models/inbox-image-capture-core";
import type { InboxImageCaptureTransport } from "../../lib/api/inbox-image-capture";

/**
 * Builds the in-process image capture transport for a native build.
 *
 * @param deps - Test/injection seam; omit in production.
 */
export function createNativeInboxImageCaptureTransport(
  deps: NativeBackendDeps = {},
): InboxImageCaptureTransport {
  const run = createNativeRunner(deps);
  return {
    capture: (request) =>
      run(async () => {
        await assertProjectNotEncrypted(request.projectId);
        return captureImageToInboxCore(request);
      }),
  };
}
