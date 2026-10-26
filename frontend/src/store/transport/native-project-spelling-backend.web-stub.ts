/**
 * @module store/transport/native-project-spelling-backend.web-stub
 *
 * Web-build substitute for `native-project-spelling-backend.ts`, which
 * reaches `node:path` and the storage layer through
 * `project-spelling-core.ts`. `next.config.mjs`'s `turbopack.resolveAlias`
 * swaps this `node:*`-free module in for the literal specifier in
 * `lib/api/project-spelling.ts`'s dynamic import. It is never invoked: the
 * native branch only runs when `NEXT_PUBLIC_GETWRITE_RUNTIME === "native"`.
 * Only a type is imported.
 */
import type { ProjectSpellingTransport } from "../../lib/api/project-spelling";

/** Same export shape as the real factory; throws if ever reached. */
export function createNativeProjectSpellingTransport(): ProjectSpellingTransport {
  throw new Error(
    "native-project-spelling-backend.web-stub: the native project-spelling " +
      "transport was reached in a web/desktop build. This stub replaces the " +
      "real native backend via next.config.mjs's turbopack.resolveAlias and " +
      "should never be invoked.",
  );
}
