/**
 * @module store/transport/native-entity-graph-kind-styles-backend.web-stub
 *
 * Web-build substitute for `native-entity-graph-kind-styles-backend.ts`,
 * which reaches `node:path` and the storage layer through
 * `entity-graph-kind-styles.ts`. `next.config.mjs`'s `turbopack.resolveAlias`
 * swaps this `node:*`-free module in for the literal specifier in
 * `lib/api/entity-graph-kind-styles.ts`'s dynamic import. It is never
 * invoked: the native branch only runs when
 * `NEXT_PUBLIC_GETWRITE_RUNTIME === "native"`. Only a type is imported.
 */
import type { EntityGraphKindStylesTransport } from "../../lib/api/entity-graph-kind-styles";

/** Same export shape as the real factory; throws if ever reached. */
export function createNativeEntityGraphKindStylesTransport(): EntityGraphKindStylesTransport {
  throw new Error(
    "native-entity-graph-kind-styles-backend.web-stub: the native " +
      "entity-graph-kind-styles transport was reached in a web/desktop " +
      "build. This stub replaces the real native backend via " +
      "next.config.mjs's turbopack.resolveAlias and should never be " +
      "invoked.",
  );
}
