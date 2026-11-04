/**
 * @module store/transport/native-annotations-backend.web-stub
 *
 * Web-build substitute for `native-annotations-backend.ts`, which reaches
 * `node:path` and the storage layer through `annotations-core.ts`.
 * `next.config.mjs`'s `turbopack.resolveAlias` swaps this `node:*`-free module
 * in for the literal specifier in `lib/api/annotations.ts`'s dynamic import.
 * It is never invoked. Only a type is imported.
 */
import type { AnnotationsTransport } from "../../lib/api/annotations";

/** Same export shape as the real factory; throws if ever reached. */
export function createNativeAnnotationsTransport(): AnnotationsTransport {
  throw new Error(
    "native-annotations-backend.web-stub: the native annotations transport " +
      "was reached in a web/desktop build. This stub replaces the real native " +
      "backend via next.config.mjs's turbopack.resolveAlias and should never " +
      "be invoked.",
  );
}
