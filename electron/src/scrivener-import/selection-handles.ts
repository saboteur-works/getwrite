/**
 * @module selection-handles
 *
 * Tracks the one active `.scriv` selection a user has picked via a native
 * file dialog, without ever handing the absolute path back to a renderer.
 *
 * Electron's renderer processes are untrusted relative to the main process;
 * a picked filesystem path is exactly the kind of detail that should not
 * round-trip through IPC as plain data the renderer can inspect or forge.
 * Instead the main process keeps the path here and hands the renderer an
 * opaque handle string. Later main-process code (a later task) resolves that
 * handle back to the real path when it actually needs it, and consumes it
 * once an import starts so the same handle cannot be reused for a second
 * import.
 *
 * Runtime-free by design — no `electron` import, no filesystem access, no
 * globals — so it can be unit-tested with plain Vitest the same way
 * `projects-dir.ts` is.
 */
import { randomUUID } from "crypto";

/** A `.scriv` selection's path and the name to show the user for it. */
export interface SelectionHandleTarget {
  /** Absolute path to the selected `.scriv` package. Never exposed except as
   * this field, returned directly from {@link SelectionHandleRegistry.record}
   * or {@link SelectionHandleRegistry.resolve}. */
  path: string;
  /** Name to show the user in place of the raw path. */
  displayName: string;
}

/** Tracks the single active `.scriv` selection handle. */
export interface SelectionHandleRegistry {
  /**
   * Records a fresh selection, superseding any prior one.
   *
   * A second call invalidates the handle returned by the first: every later
   * {@link resolve} or {@link consume} on the old handle fails, since only
   * one `.scriv` selection can be "active" at a time.
   *
   * @param path - Absolute path to the selected `.scriv` package.
   * @param displayName - Name to show the user for this selection.
   * @returns An opaque handle string. It carries no encoding of `path` — it
   * is a random identifier, not a token derived from or containing it.
   */
  record(path: string, displayName: string): string;
  /**
   * Resolves a handle to its target without consuming it.
   *
   * @param handle - A handle previously returned by {@link record}.
   * @returns The target, or `null` if the handle is unknown, was superseded
   * by a later {@link record} call, or was already {@link consume}d.
   */
  resolve(handle: string): SelectionHandleTarget | null;
  /**
   * Consumes a handle, so every later {@link resolve} or {@link consume} on
   * it fails. Called when an import actually starts, so the same selection
   * cannot be imported twice.
   *
   * @param handle - A handle previously returned by {@link record}.
   * @returns `true` if the handle was active and is now consumed; `false` if
   * it was unknown, already superseded, or already consumed — in which case
   * nothing changes.
   */
  consume(handle: string): boolean;
}

/**
 * Creates a registry tracking one active `.scriv` selection at a time.
 *
 * @returns A fresh, empty {@link SelectionHandleRegistry}.
 */
export function createSelectionHandleRegistry(): SelectionHandleRegistry {
  let active: { handle: string; target: SelectionHandleTarget } | null = null;

  return {
    record(path: string, displayName: string): string {
      const handle = randomUUID();
      active = { handle, target: { path, displayName } };
      return handle;
    },

    resolve(handle: string): SelectionHandleTarget | null {
      if (active === null || active.handle !== handle) return null;
      return active.target;
    },

    consume(handle: string): boolean {
      if (active === null || active.handle !== handle) return false;
      active = null;
      return true;
    },
  };
}
