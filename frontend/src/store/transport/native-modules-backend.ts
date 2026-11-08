/**
 * @module store/transport/native-modules-backend
 *
 * In-process {@link ModulesTransport} for a native (Capacitor) build: runs the
 * same core the HTTP route uses (`module-config-core.ts`) inside the native
 * storage context. Validation lives in that core, so the same bad input throws
 * the same error here as it maps to 400 on the route, and a locked project
 * raises the same locked-access error the route maps to 401/409. That parity
 * is reasoned from the shared core, not run on a device.
 *
 * Imported only on the native path (`lib/api/modules.ts`'s dynamic import);
 * `next.config.mjs` aliases it to a `node:*`-free web-stub in web/desktop
 * builds.
 */
import { createNativeRunner, type NativeBackendDeps } from "./native-runner";
import { setModuleEnabledCore } from "../../lib/models/module-config-core";
import type { ModulesTransport } from "../../lib/api/modules";

/**
 * Builds the in-process module-switch transport for a native build.
 *
 * @param deps - Test/injection seam; omit in production.
 */
export function createNativeModulesTransport(
  deps: NativeBackendDeps = {},
): ModulesTransport {
  const run = createNativeRunner(deps);
  return {
    setModuleEnabled: (request) => run(() => setModuleEnabledCore(request)),
  };
}
