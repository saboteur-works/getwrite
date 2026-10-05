/**
 * @module store/transport/native-entity-graph-settings-backend.web-stub
 *
 * Web-build substitute for `native-entity-graph-settings-backend.ts`, which
 * reaches `node:path` and the storage layer through
 * `entity-graph-settings-core.ts`. `next.config.mjs`'s
 * `turbopack.resolveAlias` swaps this `node:*`-free module in for the literal
 * specifier in `lib/api/entity-graph-settings.ts`'s dynamic import. It is
 * never invoked: the native branch only runs when
 * `NEXT_PUBLIC_GETWRITE_RUNTIME === "native"`. Only a type is imported.
 */
import type { EntityGraphSettingsTransport } from "../../lib/api/entity-graph-settings";

/** Same export shape as the real factory; throws if ever reached. */
export function createNativeEntityGraphSettingsTransport(): EntityGraphSettingsTransport {
  throw new Error(
    "native-entity-graph-settings-backend.web-stub: the native " +
      "entity-graph-settings transport was reached in a web/desktop build. " +
      "This stub replaces the real native backend via next.config.mjs's " +
      "turbopack.resolveAlias and should never be invoked.",
  );
}
