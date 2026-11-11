/**
 * @module store/transport/native-claims-backend.web-stub
 *
 * Web-build substitute for `native-claims-backend.ts`, which reaches
 * the Node path module and the storage layer through the claims cores.
 * `next.config.mjs`'s `turbopack.resolveAlias` swaps this Node-builtin-free module
 * in for the literal specifier in the claims client's dynamic import. It is
 * never invoked. Only a type is imported.
 */
import type { NativeClaimsTransport } from "./native-claims-backend";

/** Same export shape as the real factory; throws if ever reached. */
export function createNativeClaimsTransport(): NativeClaimsTransport {
  throw new Error(
    "native-claims-backend.web-stub: the native claims transport is " +
      "native-only and was reached in a web/desktop build. This stub replaces " +
      "the real native backend via next.config.mjs's turbopack.resolveAlias " +
      "and should never be invoked.",
  );
}
