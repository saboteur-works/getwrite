/**
 * @module splitOpenRequest
 *
 * The one way to ask for the split dialog (Feature 120, Task 25). `SplitHost`
 * (mounted once in `AppShell`) registers its open function here while it is
 * mounted; the editor menu item and the palette row (Tasks 26 and 27) call
 * {@link openSplitDialog}. A plain module slot, as `activeEditorRegistry.ts`
 * is, because the callers sit in other branches of the tree than the host.
 *
 * Nothing here binds a key or adds a menu item or palette row.
 */

/** What an open request did. */
export type SplitOpenOutcome =
  /** The host took the request and started the flush, preview and dialog. */
  | "started"
  /** No editor shows a loaded document, so nothing was requested. */
  | "no-document"
  /** A split is already in progress, so this request was ignored. */
  | "busy"
  /** No host is mounted (the Android runtime, or before the shell mounts). */
  | "no-host";

type SplitOpener = () => SplitOpenOutcome;

let opener: SplitOpener | null = null;

/** Registers (or clears, with `null`) the host's open function. Called only by `SplitHost`. */
export function setSplitOpener(next: SplitOpener | null): void {
  opener = next;
}

/**
 * Asks the host to split the open document at its cursor. Returns at once:
 * the dialog, messages and toasts belong to the host.
 */
export function openSplitDialog(): SplitOpenOutcome {
  return opener ? opener() : "no-host";
}
