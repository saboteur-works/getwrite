/**
 * @module start-availability
 *
 * App-start wiring of the spell checker's availability (FR-24, FR-26): records
 * a browser below the minimum version and starts the once-per-reason toasts.
 * Called once, by the owner of the Redux store (`ClientProvider`), so it runs
 * on every platform and not once per editor. The per-client wiring
 * (`connectSpellClientAvailability`) stays with the client, in `useSpellCheck`.
 */
import {
  browserUnsupported,
  detectUnsupportedBrowser,
  startUnavailableToasts,
} from "../../store/spellingAvailabilitySlice";

type ToastStore = Parameters<typeof startUnavailableToasts>[0];

/** Dispatches the browser gate, starts the toasts; returns the unsubscribe. */
export function startSpellAvailability(
  store: ToastStore & {
    dispatch: (action: ReturnType<typeof browserUnsupported>) => unknown;
  },
  userAgent: string,
): () => void {
  const unsupported = detectUnsupportedBrowser(userAgent);
  if (unsupported) store.dispatch(browserUnsupported(unsupported));
  return startUnavailableToasts(store);
}
