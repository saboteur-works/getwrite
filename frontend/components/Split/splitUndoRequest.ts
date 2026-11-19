/**
 * @module splitUndoRequest
 *
 * The seam between the "Undo split" host (`SplitUndoHost`, mounted once in
 * `AppShell`) and the two places that offer the action: the command palette
 * and the editor context menu (Feature 120, Task 32, FR-18). A plain module
 * slot, as `splitOpenRequest.ts` is, because the callers sit in other
 * branches of the tree than the host.
 *
 * What it holds is the result of the last read of the project's
 * latest-operation record. The read is made when a surface opens
 * ({@link requestSplitUndoRefresh}), so it comes from the stored record and
 * works after a reload. An action is offered only for `split` (an Undo) or
 * `read-failed` (a disabled entry with its own message); `unknown` (not read
 * yet, being read, no host) and `none` offer nothing. A failed read is never
 * stored as `none`.
 */
import { useSyncExternalStore } from "react";

/** What the last read of the latest operation showed. */
export type SplitUndoAvailability =
  /** Not read yet, being read, or no host is mounted. */
  | { kind: "unknown" }
  /** The record is none, or names an operation that is not a split. */
  | { kind: "none" }
  /** The latest operation is a split; its new document is named by id. */
  | { kind: "split"; splitOffDocumentId: string }
  /** The read failed; `message` says so. This is not "no split". */
  | { kind: "read-failed"; message: string };

/** What an Undo request did at once; the report is the host's. */
export type SplitUndoRequestOutcome =
  | "started"
  | "busy"
  | "no-project"
  | "no-host";

/** What the host offers the callers. */
export interface SplitUndoController {
  refresh: () => void;
  undo: () => SplitUndoRequestOutcome;
}

const UNKNOWN: SplitUndoAvailability = { kind: "unknown" };
let availability: SplitUndoAvailability = UNKNOWN;
let controller: SplitUndoController | null = null;
const listeners = new Set<() => void>();

/** The current availability (a stable object between changes). */
export function getSplitUndoAvailability(): SplitUndoAvailability {
  return availability;
}

/** Sets the availability and tells the subscribers. Called only by the host. */
export function setSplitUndoAvailability(next: SplitUndoAvailability): void {
  availability = next;
  for (const listener of [...listeners]) listener();
}

/** Subscribes to availability changes; returns the unsubscribe function. */
export function subscribeSplitUndoAvailability(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The availability, re-rendering the caller when it changes. */
export function useSplitUndoAvailability(): SplitUndoAvailability {
  return useSyncExternalStore(
    subscribeSplitUndoAvailability,
    getSplitUndoAvailability,
    () => UNKNOWN,
  );
}

/** Registers (or clears, with `null`) the host. Called only by `SplitUndoHost`. */
export function setSplitUndoController(next: SplitUndoController | null): void {
  controller = next;
  if (next === null) setSplitUndoAvailability(UNKNOWN);
}

/** Asks the host to read the latest-operation record again. No host: nothing happens. */
export function requestSplitUndoRefresh(): void {
  controller?.refresh();
}

/** Asks the host to undo the latest split. */
export function requestSplitUndo(): SplitUndoRequestOutcome {
  return controller ? controller.undo() : "no-host";
}
