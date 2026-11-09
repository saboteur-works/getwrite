/**
 * @module store/transport/native-inbox-capture-backend.web-stub
 *
 * Web-build substitute for `native-inbox-capture-backend.ts`, which reaches
 * `node:path` and the storage layer through `inbox-capture-core.ts`.
 * `next.config.mjs`'s `turbopack.resolveAlias` swaps this `node:*`-free module
 * in for the literal specifier in `lib/api/inbox-capture.ts`'s dynamic import.
 * It is never invoked. Only a type is imported.
 */
import type { InboxCaptureTransport } from "../../lib/api/inbox-capture";

/** Same export shape as the real factory; throws if ever reached. */
export function createNativeInboxCaptureTransport(): InboxCaptureTransport {
  throw new Error(
    "native-inbox-capture-backend.web-stub: the native inbox capture " +
      "transport was reached in a web/desktop build. This stub replaces the " +
      "real native backend via next.config.mjs's turbopack.resolveAlias and " +
      "should never be invoked.",
  );
}
