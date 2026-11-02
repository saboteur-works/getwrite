/**
 * @module store/transport/native-goal-total-backend.web-stub
 *
 * Web-build substitute for `native-goal-total-backend.ts`, which reaches
 * `node:path` and the storage layer through `goal-filtered-total-core.ts`.
 * `next.config.mjs`'s `turbopack.resolveAlias` swaps this `node:*`-free
 * module in for the literal specifier in `lib/api/goal-filtered-total.ts`'s
 * dynamic import. It is never invoked: the native branch only runs when
 * `NEXT_PUBLIC_GETWRITE_RUNTIME === "native"`. Only a type is imported.
 */
import type { GoalFilteredTotalTransport } from "../../lib/api/goal-filtered-total";

/** Same export shape as the real factory; throws if ever reached. */
export function createNativeGoalTotalTransport(): GoalFilteredTotalTransport {
  throw new Error(
    "native-goal-total-backend.web-stub: the native goal-total transport " +
      "was reached in a web/desktop build. This stub replaces the real " +
      "native backend via next.config.mjs's turbopack.resolveAlias and " +
      "should never be invoked.",
  );
}
