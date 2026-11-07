/**
 * @module store/transport/native-compile-defaults-backend.web-stub
 *
 * Web-build substitute for `native-compile-defaults-backend.ts`, which reaches
 * `node:path` and the storage layer through `saved-defaults-core.ts`.
 * `next.config.mjs`'s `turbopack.resolveAlias` swaps this `node:*`-free module
 * in for the literal specifier in `lib/api/compile-defaults.ts`'s dynamic
 * import. It is never invoked. Only a type is imported.
 */
import type { CompileDefaultsTransport } from "../../lib/api/compile-defaults";

/** Same export shape as the real factory; throws if ever reached. */
export function createNativeCompileDefaultsTransport(): CompileDefaultsTransport {
  throw new Error(
    "native-compile-defaults-backend.web-stub: the native compile-defaults " +
      "transport was reached in a web/desktop build. This stub replaces the " +
      "real native backend via next.config.mjs's turbopack.resolveAlias and " +
      "should never be invoked.",
  );
}
