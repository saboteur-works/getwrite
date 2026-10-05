/**
 * @module store/transport/native-entity-graph-settings-backend
 *
 * In-process {@link EntityGraphSettingsTransport} for a native (Capacitor)
 * build: runs the same core the HTTP route uses
 * (`entity-graph-settings-core.ts`) inside the native storage context.
 * Validation (hop-radius non-negative-integer, connection-type filtering)
 * lives in that core, so the same bad input throws the same error here as it
 * maps to 400 on the route.
 *
 * Mirrors `native-writing-log-backend.ts`: every error propagates rather
 * than degrading, since a failed read must never silently surface as the
 * default settings.
 *
 * Imported only on the native path (`lib/api/entity-graph-settings.ts`'s
 * dynamic import); `next.config.mjs` aliases it to a `node:*`-free web-stub
 * in web/desktop builds.
 */
import { createNativeRunner, type NativeBackendDeps } from "./native-runner";
import {
  getEntityGraphSettingsCore,
  setEntityGraphSettingsCore,
} from "../../lib/models/entity-graph-settings-core";
import type { EntityGraphSettingsTransport } from "../../lib/api/entity-graph-settings";

/**
 * Builds the in-process entity-graph-settings transport for a native build.
 *
 * @param deps - Test/injection seam; omit in production.
 */
export function createNativeEntityGraphSettingsTransport(
  deps: NativeBackendDeps = {},
): EntityGraphSettingsTransport {
  const run = createNativeRunner(deps);
  return {
    getEntityGraphSettings: (projectId) =>
      run(() => getEntityGraphSettingsCore(projectId)),
    setEntityGraphSettings: (projectId, connectionTypes, hopRadius) =>
      run(() =>
        setEntityGraphSettingsCore(projectId, connectionTypes, hopRadius),
      ),
  };
}
