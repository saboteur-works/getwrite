/**
 * @module store/transport/native-writing-log-backend
 *
 * In-process {@link WritingLogTransport} for a native (Capacitor) build: runs
 * the same cores the HTTP route uses (`writing-log-core.ts`) inside the
 * native storage context. Window and goal validation live in those cores, so
 * the same bad input throws the same error here as it maps to 400 on the
 * route.
 *
 * Unlike the degrade-gracefully mention backends, this one lets every error
 * propagate: a failed read must never look like zero words written.
 *
 * Imported only on the native path (`lib/api/writing-log.ts`'s dynamic
 * import); `next.config.mjs` aliases it to a `node:*`-free web-stub in
 * web/desktop builds.
 */
import { createNativeRunner, type NativeBackendDeps } from "./native-runner";
import {
  getWritingLogAggregateCore,
  setDailyWordGoalCore,
} from "../../lib/models/writing-log-core";
import type { WritingLogTransport } from "../../lib/api/writing-log";

/**
 * Builds the in-process writing-log transport for a native build.
 *
 * @param deps - Test/injection seam; omit in production.
 */
export function createNativeWritingLogTransport(
  deps: NativeBackendDeps = {},
): WritingLogTransport {
  const run = createNativeRunner(deps);
  return {
    getWritingLog: (projectId, from, to) =>
      run(() => getWritingLogAggregateCore(projectId, from, to)),
    setDailyWordGoal: (projectId, goal) =>
      run(() => setDailyWordGoalCore(projectId, goal)),
  };
}
