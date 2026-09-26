/**
 * @module store/transport/native-writing-log-backend.web-stub
 *
 * Web-build substitute for `native-writing-log-backend.ts`, which reaches
 * `node:path` and the storage layer through `writing-log-core.ts`.
 * `next.config.mjs`'s `turbopack.resolveAlias` swaps this `node:*`-free module
 * in for the literal specifier in `lib/api/writing-log.ts`'s dynamic import.
 * It is never invoked: the native branch only runs when
 * `NEXT_PUBLIC_GETWRITE_RUNTIME === "native"`. Only a type is imported.
 */
import type { WritingLogTransport } from "../../lib/api/writing-log";

/** Same export shape as the real factory; throws if ever reached. */
export function createNativeWritingLogTransport(): WritingLogTransport {
  throw new Error(
    "native-writing-log-backend.web-stub: the native writing-log transport " +
      "was reached in a web/desktop build. This stub replaces the real " +
      "native backend via next.config.mjs's turbopack.resolveAlias and " +
      "should never be invoked.",
  );
}
