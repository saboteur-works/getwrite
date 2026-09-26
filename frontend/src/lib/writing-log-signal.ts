/**
 * @module writing-log-signal
 *
 * Client-side handling of the writing-log signal a canonical save can return
 * (`WritingLogSignal`, `models/revision-core.ts`; spec FR-5).
 *
 * - Every trouble signal raises a generic toast with a fixed id, so
 *   consecutive failing saves collapse into one visible toast. Toast text is
 *   fixed and never carries document content.
 * - A plain skipped save (`skipped`) does NOT set the session flag: the
 *   persistent per-day "incomplete" indicator is derived from the log's marker
 *   entries by the aggregate read.
 * - Only `markerAppendFailed` (the marker itself could not be written, so the
 *   log cannot show the gap) sets an in-memory, session-only fallback flag.
 * - `appendFailed` (a word entry could not be appended; nothing recorded)
 *   raises its own toast with a distinct id and does not set the flag.
 */

import type { WritingLogSignal } from "./models/revision-core";
import { toastService } from "./toast-service";

export const WRITING_LOG_SKIPPED_TOAST_ID = "writing-log-skipped";
export const WRITING_LOG_APPEND_FAILED_TOAST_ID = "writing-log-append-failed";

export const WRITING_LOG_SKIPPED_TOAST_MESSAGE =
  "Today's word count may be incomplete: this save couldn't be counted.";
export const WRITING_LOG_APPEND_FAILED_TOAST_MESSAGE =
  "Today's word count may be incomplete: this save couldn't be recorded.";

let sessionIncomplete = false;
const listeners = new Set<() => void>();

/** True once a marker append failed this session (fallback indicator). */
export function getWritingLogSessionIncomplete(): boolean {
  return sessionIncomplete;
}

/** Subscribe to flag changes; returns an unsubscribe (useSyncExternalStore-shaped). */
export function subscribeWritingLogSessionIncomplete(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Clears the session flag (tests, project switch). */
export function resetWritingLogSessionIncomplete(): void {
  if (!sessionIncomplete) return;
  sessionIncomplete = false;
  listeners.forEach((l) => l());
}

function setSessionIncomplete(): void {
  if (sessionIncomplete) return;
  sessionIncomplete = true;
  listeners.forEach((l) => l());
}

/** Routes a save result's writing-log signal to toasts and the session flag. */
export function reportWritingLogSignal(
  signal: WritingLogSignal | undefined,
): void {
  if (!signal) return;
  if (signal.skipped || signal.markerAppendFailed) {
    toastService.error(WRITING_LOG_SKIPPED_TOAST_MESSAGE, undefined, {
      id: WRITING_LOG_SKIPPED_TOAST_ID,
    });
  }
  if (signal.markerAppendFailed) setSessionIncomplete();
  if (signal.appendFailed) {
    toastService.error(WRITING_LOG_APPEND_FAILED_TOAST_MESSAGE, undefined, {
      id: WRITING_LOG_APPEND_FAILED_TOAST_ID,
    });
  }
}
