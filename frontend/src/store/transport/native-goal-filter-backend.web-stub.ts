/**
 * @module store/transport/native-goal-filter-backend.web-stub
 *
 * Web-build substitute for `native-goal-filter-backend.ts`, which reaches
 * `node:path` and the storage layer through `goal-filter-core.ts`.
 * `next.config.mjs`'s `turbopack.resolveAlias` swaps this `node:*`-free
 * module in for the literal specifier in `lib/api/goal-filter.ts`'s dynamic
 * import. It is never invoked: the native branch only runs when
 * `NEXT_PUBLIC_GETWRITE_RUNTIME === "native"`. Only a type is imported.
 */
import type { GoalFilterTransport } from "../../lib/api/goal-filter";

/** Same export shape as the real factory; throws if ever reached. */
export function createNativeGoalFilterTransport(): GoalFilterTransport {
  throw new Error(
    "native-goal-filter-backend.web-stub: the native goal-filter transport " +
      "was reached in a web/desktop build. This stub replaces the real " +
      "native backend via next.config.mjs's turbopack.resolveAlias and " +
      "should never be invoked.",
  );
}
