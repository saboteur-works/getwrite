/**
 * @module store/transport/native-word-count-goal-backend
 *
 * In-process {@link WordCountGoalTransport} for a native (Capacitor) build:
 * runs the same core the HTTP route uses (`word-count-goal-core.ts`) inside
 * the native storage context. Goal validation lives in that core, so the
 * same bad input throws the same error here as it maps to 400 on the route.
 *
 * Imported only on the native path (`lib/api/word-count-goal.ts`'s dynamic
 * import); `next.config.mjs` aliases it to a `node:*`-free web-stub in
 * web/desktop builds.
 */
import { createNativeRunner, type NativeBackendDeps } from "./native-runner";
import { setWordCountGoalCore } from "../../lib/models/word-count-goal-core";
import type { WordCountGoalTransport } from "../../lib/api/word-count-goal";

/**
 * Builds the in-process word-count-goal transport for a native build.
 *
 * @param deps - Test/injection seam; omit in production.
 */
export function createNativeWordCountGoalTransport(
  deps: NativeBackendDeps = {},
): WordCountGoalTransport {
  const run = createNativeRunner(deps);
  return {
    setWordCountGoal: (projectId, goal) =>
      run(() => setWordCountGoalCore(projectId, goal)),
  };
}
