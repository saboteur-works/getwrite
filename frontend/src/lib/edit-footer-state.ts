/**
 * @module edit-footer-state
 *
 * Client-side persistence for the EditView footer's writing-log disclosure
 * (expanded or collapsed). Global `localStorage`, not a project preference
 * (Feature 59, OQ-12). All accessors are SSR-safe and never throw; with no
 * stored value (or an unreadable one) the disclosure is collapsed.
 */

export const EDIT_FOOTER_EXPANDED_KEY = "getwrite.editFooter.expanded";

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Whether the footer disclosure was left expanded; `false` by default. */
export function getEditFooterExpanded(): boolean {
  try {
    return safeStorage()?.getItem(EDIT_FOOTER_EXPANDED_KEY) === "true";
  } catch {
    return false;
  }
}

/** Persists the disclosure state. Best-effort: a storage failure is ignored. */
export function setEditFooterExpanded(expanded: boolean): void {
  try {
    safeStorage()?.setItem(EDIT_FOOTER_EXPANDED_KEY, String(expanded));
  } catch {
    // Best-effort: the state simply will not survive a remount.
  }
}
