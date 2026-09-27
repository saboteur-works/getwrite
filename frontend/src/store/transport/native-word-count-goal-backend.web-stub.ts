/**
 * @module store/transport/native-word-count-goal-backend.web-stub
 *
 * Web-build substitute for `native-word-count-goal-backend.ts`, which
 * reaches `node:path` and the storage layer through `word-count-goal-core.ts`.
 * `next.config.mjs`'s `turbopack.resolveAlias` swaps this `node:*`-free
 * module in for the literal specifier in `lib/api/word-count-goal.ts`'s
 * dynamic import. It is never invoked: the native branch only runs when
 * `NEXT_PUBLIC_GETWRITE_RUNTIME === "native"`. Only a type is imported.
 */
import type { WordCountGoalTransport } from "../../lib/api/word-count-goal";

/** Same export shape as the real factory; throws if ever reached. */
export function createNativeWordCountGoalTransport(): WordCountGoalTransport {
  throw new Error(
    "native-word-count-goal-backend.web-stub: the native word-count-goal " +
      "transport was reached in a web/desktop build. This stub replaces the " +
      "real native backend via next.config.mjs's turbopack.resolveAlias and " +
      "should never be invoked.",
  );
}
