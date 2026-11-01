/**
 * @module store/transport/native-goal-total-backend
 *
 * In-process {@link GoalFilteredTotalTransport} for a native (Capacitor)
 * build: derives the project root from a validated id and runs the same core
 * the HTTP route uses (`goal-filtered-total-core.ts`) inside the native
 * storage context. An unavailable result is returned as a typed value; every
 * other failure (including an unresolvable id) rejects.
 *
 * Imported only on the native path (`lib/api/goal-filtered-total.ts`'s dynamic
 * import); `next.config.mjs` aliases it to a `node:*`-free web-stub in
 * web/desktop builds.
 */
import { createNativeRunner, type NativeBackendDeps } from "./native-runner";
import { evaluateGoalFilteredTotal } from "../../lib/models/goal-filtered-total-core";
import { InvalidProjectIdCoreError } from "../../lib/models/project-crud-core";
import { resolveProjectRoot } from "../../lib/models/project-root-resolver";
import type { GoalFilteredTotalTransport } from "../../lib/api/goal-filtered-total";

/**
 * Builds the in-process filtered-total transport for a native build.
 *
 * @param deps - Test/injection seam; omit in production.
 */
export function createNativeGoalTotalTransport(
  deps: NativeBackendDeps = {},
): GoalFilteredTotalTransport {
  const run = createNativeRunner(deps);
  return {
    getGoalFilteredTotal: (projectId) =>
      run(() => {
        const projectRoot = resolveProjectRoot(projectId);
        if (!projectRoot) throw new InvalidProjectIdCoreError(projectId);
        return evaluateGoalFilteredTotal(projectRoot, new Date());
      }),
  };
}
