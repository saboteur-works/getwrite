/**
 * @module api/share-in
 *
 * Entry point for the Android share listener (Feature 107, FR-3, FR-16). On
 * native it loads `native-share-in-plugin` through a literal dynamic import
 * (so `next.config.mjs` can alias a stub in web/desktop builds); on any other
 * runtime it returns an inert session and registers nothing. No `node:*`, no
 * React.
 */
import type {
  ShareListenerOptions,
  ShareListenerSession,
} from "../../store/transport/native-share-in-plugin";

/**
 * Starts listening for shares delivered to the app.
 *
 * @param options - The share and failure callbacks.
 * @returns A session whose `stop` removes the listener; inert off native.
 */
export async function startShareListener(
  options: ShareListenerOptions,
): Promise<ShareListenerSession> {
  if (process.env.NEXT_PUBLIC_GETWRITE_RUNTIME === "native") {
    const { startNativeShareListener } =
      await import("../../store/transport/native-share-in-plugin");
    return startNativeShareListener(options);
  }
  return { stop: async () => undefined };
}
