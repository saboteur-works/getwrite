/**
 * @module store/transport/native-export-defaults-backend
 *
 * In-process {@link ExportDefaultsTransport} for a native (Capacitor) build;
 * see `native-compile-defaults-backend.ts`.
 */
import { createNativeRunner, type NativeBackendDeps } from "./native-runner";
import { setExportDefaultsCore } from "../../lib/models/saved-defaults-core";
import type { ExportDefaultsTransport } from "../../lib/api/export-defaults";

/**
 * Builds the in-process export-defaults transport for a native build.
 *
 * @param deps - Test/injection seam; omit in production.
 */
export function createNativeExportDefaultsTransport(
  deps: NativeBackendDeps = {},
): ExportDefaultsTransport {
  const run = createNativeRunner(deps);
  return {
    setDefaults: (projectId, excludedResourceIds) =>
      run(() => setExportDefaultsCore(projectId, excludedResourceIds)),
  };
}
