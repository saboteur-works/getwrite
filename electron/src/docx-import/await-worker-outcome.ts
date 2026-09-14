// Last Updated: 2026-09-13

/**
 * Races a forked DOCX import worker's terminal outcome against it exiting or
 * erroring before ever posting one.
 *
 * A forked `utilityProcess` can crash, throw outside its own try/catch, or be
 * killed before it ever posts a terminal `ImportOutcome` message. Left
 * unhandled, whatever awaits that message would hang forever — and in
 * `main.ts`, that would also permanently wedge the single-import guard, since
 * its `finish()` call is chained off the same await. This module gives
 * `main.ts` a single place to resolve to a `fatal` outcome instead of hanging,
 * and to guarantee that only the *first* of `message`/`exit`/`error` ever
 * settles the promise — so `main.ts` can call the guard's `finish()` exactly
 * once, in a `finally`, without racing itself.
 *
 * Mirrors `electron/src/scrivener-import/await-worker-outcome.ts`'s
 * `WorkerLike`-based design exactly, but imports `ImportOutcome` from this
 * feature's own `./handle-import-request` rather than the Scrivener one — a
 * new, DOCX-specific module, not a shared or generalized one.
 *
 * Deliberately Electron-runtime-free: it depends only on the minimal
 * structural `WorkerLike` interface below, never on `UtilityProcess` itself,
 * so it can be unit-tested with a plain fake emitter.
 */
import type { ImportOutcome } from "./handle-import-request";

/**
 * The minimal shape of a forked worker this module needs.
 *
 * Deliberately narrower than Electron's `UtilityProcess` so tests can drive
 * it with a bare fake emitter instead of a real forked process.
 */
export interface WorkerLike {
  on(
    event: "message" | "exit" | "error",
    listener: (...args: unknown[]) => void,
  ): void;
}

/**
 * Describes an exit code for inclusion in a fatal outcome's message.
 *
 * @param code - The exit code `utilityProcess`/`ChildProcess` report, or
 *   `null` when the process was killed by a signal.
 * @returns A human-readable description including the code.
 */
function describeExit(code: unknown): string {
  return `The import process exited unexpectedly (code ${String(code)}).`;
}

/**
 * Fixed, path-free description used when the worker's `error` event fires.
 *
 * The worker's own error (e.g. a filesystem error) can embed the absolute
 * source path, so its `message` must never be forwarded into an
 * `ImportOutcome` sent to the renderer. Callers that want the real detail
 * for server-side diagnosis should pass an `onWorkerError` callback to
 * {@link awaitWorkerOutcome}.
 */
const WORKER_ERROR_MESSAGE = "The import process failed to run.";

/**
 * Awaits a forked import worker's single terminal outcome.
 *
 * Resolves — never rejects — with:
 * - The `ImportOutcome` carried by the worker's first `message` event, if
 *   one arrives.
 * - A `{ kind: "fatal", ... }` outcome describing the exit code, if the
 *   worker's `exit` event fires first.
 * - A `{ kind: "fatal", ... }` outcome describing the error, if the worker's
 *   `error` event fires first.
 *
 * Once any of the three has settled the promise, later events on the same
 * worker are ignored — they neither resolve nor reject a second time.
 *
 * @param worker - The forked worker to listen to.
 * @param onWorkerError - Optional callback invoked with the worker's raw
 *   `error` event value, for server-side logging only — its detail (which
 *   can embed the absolute source path) is never included in the resolved
 *   outcome.
 * @returns A promise resolving to the worker's terminal outcome.
 */
export function awaitWorkerOutcome(
  worker: WorkerLike,
  onWorkerError?: (err: unknown) => void,
): Promise<ImportOutcome> {
  return new Promise<ImportOutcome>((resolve) => {
    let settled = false;

    worker.on("message", (data: unknown) => {
      if (settled) return;
      settled = true;
      resolve(data as ImportOutcome);
    });

    worker.on("exit", (code: unknown) => {
      if (settled) return;
      settled = true;
      resolve({ kind: "fatal", message: describeExit(code) });
    });

    worker.on("error", (err: unknown) => {
      if (settled) return;
      settled = true;
      onWorkerError?.(err);
      resolve({ kind: "fatal", message: WORKER_ERROR_MESSAGE });
    });
  });
}
