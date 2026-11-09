/**
 * @module store/transport/native-inbox-capture-backend
 *
 * In-process {@link InboxCaptureTransport} for a native (Capacitor) build:
 * runs `captureToInboxCore` (the same core the HTTP route calls) inside the
 * native storage context (`createNativeRunner`). Typed results are returned
 * unchanged; every error, the locked-access error included, propagates
 * unchanged. Before the core runs, the native encrypted-project guard refuses
 * a project carrying the encrypted marker (Feature 107, FR-11).
 *
 * Imported only on the native path (`lib/api/inbox-capture.ts`'s dynamic
 * import); `next.config.mjs` aliases it to a `node:*`-free web-stub in
 * web/desktop builds.
 */
import { createNativeRunner, type NativeBackendDeps } from "./native-runner";
import { assertProjectNotEncrypted } from "./native-encrypted-project-guard";
import { captureToInboxCore } from "../../lib/models/inbox-capture-core";
import type { InboxCaptureTransport } from "../../lib/api/inbox-capture";

/**
 * Builds the in-process capture transport for a native build.
 *
 * @param deps - Test/injection seam; omit in production.
 */
export function createNativeInboxCaptureTransport(
  deps: NativeBackendDeps = {},
): InboxCaptureTransport {
  const run = createNativeRunner(deps);
  return {
    capture: (request) =>
      run(async () => {
        await assertProjectNotEncrypted(request.projectId);
        return captureToInboxCore(request);
      }),
  };
}
