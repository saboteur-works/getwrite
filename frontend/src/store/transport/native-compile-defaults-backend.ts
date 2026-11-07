/**
 * @module store/transport/native-compile-defaults-backend
 *
 * In-process {@link CompileDefaultsTransport} for a native (Capacitor) build:
 * runs the same core the HTTP route uses (`saved-defaults-core.ts`) inside the
 * native storage context, so the same bad input throws the same error here as
 * it maps to 400 on the route. Imported only by `lib/api/compile-defaults.ts`'s
 * dynamic import; `next.config.mjs` aliases it to a web-stub in web builds.
 */
import { createNativeRunner, type NativeBackendDeps } from "./native-runner";
import { setCompileDefaultsCore } from "../../lib/models/saved-defaults-core";
import type { CompileDefaultsTransport } from "../../lib/api/compile-defaults";

/**
 * Builds the in-process compile-defaults transport for a native build.
 *
 * @param deps - Test/injection seam; omit in production.
 */
export function createNativeCompileDefaultsTransport(
  deps: NativeBackendDeps = {},
): CompileDefaultsTransport {
  const run = createNativeRunner(deps);
  return {
    setDefaults: (projectId, excludedResourceIds) =>
      run(() => setCompileDefaultsCore(projectId, excludedResourceIds)),
  };
}
