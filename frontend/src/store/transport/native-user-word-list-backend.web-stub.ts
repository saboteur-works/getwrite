/**
 * @module store/transport/native-user-word-list-backend.web-stub
 *
 * Web-build substitute for `native-user-word-list-backend.ts`, which reaches
 * `@capacitor/filesystem` through `lib/models/native-user-word-list.ts`.
 * `next.config.mjs`'s `turbopack.resolveAlias` swaps this module in for the
 * client transport's dynamic import. It is never invoked: the native branch
 * only runs when `NEXT_PUBLIC_GETWRITE_RUNTIME === "native"`. Only a type is
 * imported.
 */
import type { NativeUserWordListTransport } from "./native-user-word-list-backend";

/** Same export shape as the real factory; throws if ever reached. */
export function createNativeUserWordListTransport(): NativeUserWordListTransport {
  throw new Error(
    "native-user-word-list-backend.web-stub: the user word list is native " +
      "only; this transport was reached in a web/desktop build. This stub " +
      "replaces the real native backend via next.config.mjs's " +
      "turbopack.resolveAlias and should never be invoked.",
  );
}
