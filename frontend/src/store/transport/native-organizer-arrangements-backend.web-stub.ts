/**
 * @module store/transport/native-organizer-arrangements-backend.web-stub
 *
 * Web-build substitute for `native-organizer-arrangements-backend.ts`, which
 * reaches the Node path module and the storage layer through the arrangements
 * core. `next.config.mjs`'s `turbopack.resolveAlias` swaps this module, which
 * has no Node built-in import, in for the literal specifier in the client
 * transport's dynamic import. It is never invoked: the native branch only runs
 * when `NEXT_PUBLIC_GETWRITE_RUNTIME === "native"`. Only a type is imported.
 */
import type { NativeOrganizerArrangementsTransport } from "./native-organizer-arrangements-backend";

/** Same export shape as the real factory; throws if ever reached. */
export function createNativeOrganizerArrangementsTransport(): NativeOrganizerArrangementsTransport {
  throw new Error(
    "native-organizer-arrangements-backend.web-stub: the native organizer " +
      "arrangements transport was reached in a web/desktop build. This stub " +
      "replaces the real native backend via next.config.mjs's " +
      "turbopack.resolveAlias and should never be invoked (native-only).",
  );
}
