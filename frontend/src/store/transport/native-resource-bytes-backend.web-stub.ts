/**
 * @module store/transport/native-resource-bytes-backend.web-stub
 *
 * Web-build substitute for `native-resource-bytes-backend.ts`, which reaches
 * `node:path` and the storage layer through `resource-bytes-core.ts`.
 * `next.config.mjs`'s `turbopack.resolveAlias` swaps this `node:*`-free module
 * in for the literal specifier in `lib/api/resource-bytes.ts`'s dynamic
 * import. It is never invoked: the native branch only runs when
 * `NEXT_PUBLIC_GETWRITE_RUNTIME === "native"`. Only a type is imported.
 */
import type { ResourceBytesTransport } from "../../lib/api/resource-bytes";

/** Same export shape as the real factory; throws if ever reached. */
export function createNativeResourceBytesTransport(): ResourceBytesTransport {
  throw new Error(
    "native-resource-bytes-backend.web-stub: the native resource byte-read " +
      "transport was reached in a web/desktop build. This stub replaces the " +
      "real native backend via next.config.mjs's turbopack.resolveAlias and " +
      "should never be invoked.",
  );
}
