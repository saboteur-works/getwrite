/**
 * @module store/transport/native-export-defaults-backend.web-stub
 *
 * Web-build substitute for `native-export-defaults-backend.ts`; see
 * `native-compile-defaults-backend.web-stub.ts`. Never invoked. Only a type is
 * imported.
 */
import type { ExportDefaultsTransport } from "../../lib/api/export-defaults";

/** Same export shape as the real factory; throws if ever reached. */
export function createNativeExportDefaultsTransport(): ExportDefaultsTransport {
  throw new Error(
    "native-export-defaults-backend.web-stub: the native export-defaults " +
      "transport was reached in a web/desktop build. This stub replaces the " +
      "real native backend via next.config.mjs's turbopack.resolveAlias and " +
      "should never be invoked.",
  );
}
