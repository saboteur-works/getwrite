/**
 * @module store/transport/native-entity-graph-positions-backend.web-stub
 *
 * Web-build substitute for `native-entity-graph-positions-backend.ts`, which
 * reaches `node:path` and the storage layer through
 * `entity-graph-positions.ts`. `next.config.mjs`'s `turbopack.resolveAlias`
 * swaps this `node:*`-free module in for the literal specifier in
 * `lib/api/entity-graph-positions.ts`'s dynamic import. It is never invoked:
 * the native branch only runs when
 * `NEXT_PUBLIC_GETWRITE_RUNTIME === "native"`. Only a type is imported.
 */
import type { EntityGraphPositionsTransport } from "../../lib/api/entity-graph-positions";

/** Same export shape as the real factory; throws if ever reached. */
export function createNativeEntityGraphPositionsTransport(): EntityGraphPositionsTransport {
  throw new Error(
    "native-entity-graph-positions-backend.web-stub: the native " +
      "entity-graph-positions transport was reached in a web/desktop build. " +
      "This stub replaces the real native backend via next.config.mjs's " +
      "turbopack.resolveAlias and should never be invoked.",
  );
}
