/**
 * @module store/transport/native-share-in-plugin.web-stub
 *
 * Web-build substitute for `native-share-in-plugin.ts`. `next.config.mjs`'s
 * `turbopack.resolveAlias` swaps it in for the literal specifier in
 * `lib/api/share-in.ts`'s dynamic import. It registers no plugin, throws
 * nothing and never emits, so a web/desktop build has no share listener.
 */
import type {
  ShareListenerOptions,
  ShareListenerSession,
} from "./native-share-in-plugin";

/** Same export shape as the real starter; registers nothing. */
export async function startNativeShareListener(
  options: ShareListenerOptions,
): Promise<ShareListenerSession> {
  void options;
  return { stop: async () => undefined };
}
