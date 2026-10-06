/**
 * @module store/transport/native-global-noise-words-backend.web-stub
 *
 * Web-build substitute for `native-global-noise-words-backend.ts`, which
 * reaches `@capacitor/filesystem` through `lib/models/
 * native-global-noise-words.ts`. `next.config.mjs`'s
 * `turbopack.resolveAlias` swaps this `node:*`-free module in for the literal
 * specifier in `lib/api/global-noise-words.ts`'s dynamic import. It is never
 * invoked: the native branch only runs when
 * `NEXT_PUBLIC_GETWRITE_RUNTIME === "native"`. Only a type is imported.
 */
import type { GlobalNoiseWordsTransport } from "../../lib/api/global-noise-words";

/** Same export shape as the real factory; throws if ever reached. */
export function createNativeGlobalNoiseWordsTransport(): GlobalNoiseWordsTransport {
  throw new Error(
    "native-global-noise-words-backend.web-stub: the native " +
      "global-noise-words transport was reached in a web/desktop build. " +
      "This stub replaces the real native backend via next.config.mjs's " +
      "turbopack.resolveAlias and should never be invoked.",
  );
}
