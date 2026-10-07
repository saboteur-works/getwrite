/**
 * @module store/transport/native-mention-highlight-duration-backend.web-stub
 *
 * Web-build substitute for `native-mention-highlight-duration-backend.ts`,
 * which reaches `node:path` and the storage layer through
 * `mention-highlight-duration-core.ts`. `next.config.mjs`'s
 * `turbopack.resolveAlias` swaps this `node:*`-free module in for the
 * literal specifier in `lib/api/mention-highlight-duration.ts`'s dynamic
 * import. It is never invoked: the native branch only runs when
 * `NEXT_PUBLIC_GETWRITE_RUNTIME === "native"`. Only a type is imported.
 */
import type { MentionHighlightDurationTransport } from "../../lib/api/mention-highlight-duration";

/** Same export shape as the real factory; throws if ever reached. */
export function createNativeMentionHighlightDurationTransport(): MentionHighlightDurationTransport {
  throw new Error(
    "native-mention-highlight-duration-backend.web-stub: the native " +
      "mention-highlight-duration transport was reached in a web/desktop " +
      "build. This stub replaces the real native backend via " +
      "next.config.mjs's turbopack.resolveAlias and should never be invoked.",
  );
}
