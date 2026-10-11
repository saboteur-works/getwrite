/**
 * @module Sharing/pairing-page
 *
 * Client-safe knowledge of where the pairing screen lives. The request gate
 * (`src/lib/sharing/gate.ts`) keeps its own server-side copy of the path; this
 * module exists so the client components that must behave differently on the
 * pairing page share one definition rather than each holding the string.
 */

/** Path of the pairing screen (`app/pair/page.tsx`). */
export const PAIR_PAGE_PATH = "/pair";

/**
 * True when the current page is the pairing screen, whatever its query.
 * False during SSR, where there is no `window`.
 */
export function isPairingPage(): boolean {
  return (
    typeof window !== "undefined" && window.location.pathname === PAIR_PAGE_PATH
  );
}
