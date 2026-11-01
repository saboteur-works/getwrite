/**
 * @module store/transport/native-goal-filter-backend
 *
 * In-process {@link GoalFilterTransport} for a native (Capacitor) build:
 * runs the same core the HTTP route uses (`goal-filter-core.ts`) inside the
 * native storage context. Validation lives in that core, so the same bad
 * input throws the same error here as it maps to 400 on the route.
 *
 * Imported only on the native path (`lib/api/goal-filter.ts`'s dynamic
 * import); `next.config.mjs` aliases it to a `node:*`-free web-stub in
 * web/desktop builds.
 */
import { createNativeRunner, type NativeBackendDeps } from "./native-runner";
import { setGoalFilterCore } from "../../lib/models/goal-filter-core";
import type { GoalFilterTransport } from "../../lib/api/goal-filter";

/**
 * Builds the in-process goal-filter transport for a native build.
 *
 * @param deps - Test/injection seam; omit in production.
 */
export function createNativeGoalFilterTransport(
  deps: NativeBackendDeps = {},
): GoalFilterTransport {
  const run = createNativeRunner(deps);
  return {
    setGoalFilter: (projectId, filter) =>
      run(() => setGoalFilterCore(projectId, filter)),
  };
}
