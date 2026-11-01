/**
 * @module sidecar-save-signal
 *
 * **Feature 98, Task 29 (FR-33).** After a resolved sidecar save, the footer's
 * filtered goal total must re-read, but only while the project has a
 * `config.goalFilter`.
 *
 * Design choice: one shared helper that every `updateSidecar` caller invokes
 * on success, rather than the `updateSidecar` wrapper in `api/resources.ts`.
 * The filter-set state is not reachable from that wrapper: `config.goalFilter`
 * is not in the Redux store (the page holds the loaded project in local
 * state), and the wrapper takes only a project directory id. So the page
 * publishes the flag here with `setGoalFilterActive` whenever its loaded
 * project changes, and callers call `notifyAfterSidecarSave()` in their
 * success path (never in a catch).
 */

import { notifyWritingLogGoalChanged } from "./writing-log-signal";

let isGoalFilterActive = false;

/** Records whether the open project has a goal filter set. */
export function setGoalFilterActive(active: boolean): void {
  isGoalFilterActive = active;
}

/** Signals the footer to re-read after a resolved sidecar save; no-op with no filter. */
export function notifyAfterSidecarSave(): void {
  if (isGoalFilterActive) notifyWritingLogGoalChanged();
}
