/**
 * @module store/transport/native-folklore-backend.web-stub
 *
 * Web-build substitute for `native-folklore-backend.ts`, which reaches the
 * Node path module and the storage layer through the variant-read core.
 * `next.config.mjs`'s `turbopack.resolveAlias` swaps this Node-builtin-free
 * module in for the literal specifier in the folklore client's dynamic
 * import. It is never invoked. Only a type is imported.
 */
import type { NativeFolkloreTransport } from "./native-folklore-backend";

/** Same export shape as the real factory; throws if ever reached. */
export function createNativeFolkloreTransport(): NativeFolkloreTransport {
  throw new Error(
    "native-folklore-backend.web-stub: the native folklore transport is " +
      "native-only and was reached in a web/desktop build. This stub replaces " +
      "the real native backend via next.config.mjs's turbopack.resolveAlias " +
      "and should never be invoked.",
  );
}
