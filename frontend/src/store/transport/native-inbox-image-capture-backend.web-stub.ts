/**
 * @module store/transport/native-inbox-image-capture-backend.web-stub
 *
 * Web-build substitute for `native-inbox-image-capture-backend.ts`.
 * `next.config.mjs`'s `turbopack.resolveAlias` swaps this `node:*`-free module
 * in for the literal specifier in `lib/api/inbox-image-capture.ts`'s dynamic
 * import. It is never invoked. Only a type is imported.
 */
import type { InboxImageCaptureTransport } from "../../lib/api/inbox-image-capture";

/** Same export shape as the real factory; throws if ever reached. */
export function createNativeInboxImageCaptureTransport(): InboxImageCaptureTransport {
  throw new Error(
    "native-inbox-image-capture-backend.web-stub: the native image capture " +
      "transport was reached in a web/desktop build. This stub replaces the " +
      "real native backend via next.config.mjs's turbopack.resolveAlias and " +
      "should never be invoked.",
  );
}
