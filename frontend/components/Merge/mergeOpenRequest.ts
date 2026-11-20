/**
 * @module mergeOpenRequest
 *
 * The one way to ask for the merge dialog (Feature 121, Task 34). `MergeHost`
 * (mounted once in `AppShell`) registers its open function here while it is
 * mounted; the tree's context menu (Task 35) calls {@link openMergeDialog}. A
 * plain module slot, as `splitOpenRequest.ts` is, because the caller sits in
 * another branch of the tree than the host.
 *
 * Nothing here binds a key or adds a menu item or palette row.
 */

/** What an open request did. */
export type MergeOpenOutcome =
  /** The host took the request and started the flush, preview and dialog. */
  | "started"
  /** Fewer than two documents were given, so nothing was requested. */
  | "too-few-documents"
  /** No project is open, so nothing was requested. */
  | "no-project"
  /** A merge is already in progress, so this request was ignored. */
  | "busy"
  /** No host is mounted (the Android runtime, or before the shell mounts). */
  | "no-host";

/** Takes the selected document ids in selection order; the first is the target. */
type MergeOpener = (documentIds: readonly string[]) => MergeOpenOutcome;

let opener: MergeOpener | null = null;

/** Registers (or clears, with `null`) the host's open function. Called only by `MergeHost`. */
export function setMergeOpener(next: MergeOpener | null): void {
  opener = next;
}

/**
 * Asks the host to merge the given documents into the first. Returns at once:
 * the dialog, messages and toasts belong to the host. The order is the order of
 * selection and is never changed here.
 */
export function openMergeDialog(
  documentIds: readonly string[],
): MergeOpenOutcome {
  return opener ? opener(documentIds) : "no-host";
}
