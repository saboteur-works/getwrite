"use client";

import { useCallback, useEffect, useState } from "react";
import { isLockedAccessError } from "../../src/lib/models/locked-access";

/**
 * @module useSavedDefaults
 *
 * Read state of a project's saved compile or export exclusions (Feature 101,
 * FR-4, FR-5). Shared by both dialogs.
 *
 * - `loading`, then `ok` with the saved ids (`[]` when the key is absent: no
 *   saved defaults).
 * - A read error is `failed` (never `ok` with `[]`); `retry` reads again.
 * - A locked-access error is not `failed`: it is rethrown during render so it
 *   reaches the existing error path rather than the failure notice.
 * - With `enabled: false` (entity mode) or no project id nothing is read and
 *   the state is `ok` with no ids.
 * - Never calls a setter. A response arriving after a newer read started is
 *   discarded.
 */

type SavedDefaultsReadState =
  | { status: "loading" }
  | { status: "ok"; excludedResourceIds: string[] }
  | { status: "failed" };

/** Reads the saved excluded ids; `undefined` means the key is absent. */
export type SavedDefaultsReader = (
  projectId: string,
) => Promise<readonly string[] | undefined>;

export interface UseSavedDefaultsOptions {
  /** When false nothing is read. Defaults to true. */
  enabled?: boolean;
}

export interface SavedDefaultsRead {
  state: SavedDefaultsReadState;
  /** Re-reads after a failure. */
  retry: () => void;
}

const NONE: SavedDefaultsReadState = { status: "ok", excludedResourceIds: [] };

type Settled =
  | { key: string; state: SavedDefaultsReadState }
  | { key: string; locked: unknown };

export function useSavedDefaults(
  projectId: string | undefined,
  read: SavedDefaultsReader,
  options: UseSavedDefaultsOptions = {},
): SavedDefaultsRead {
  const { enabled: isEnabled = true } = options;
  const [attempt, setAttempt] = useState(0);
  const [settled, setSettled] = useState<Settled | null>(null);
  const isReading = isEnabled && projectId !== undefined;
  const key = `${projectId ?? ""}#${attempt}`;

  useEffect(() => {
    if (!isReading || projectId === undefined) return;
    let isCurrent = true;
    read(projectId).then(
      (ids) => {
        if (isCurrent)
          setSettled({
            key,
            state: { status: "ok", excludedResourceIds: [...(ids ?? [])] },
          });
      },
      (error: unknown) => {
        if (!isCurrent) return;
        if (isLockedAccessError(error)) setSettled({ key, locked: error });
        else setSettled({ key, state: { status: "failed" } });
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [isReading, projectId, read, key]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  if (!isReading) return { state: NONE, retry };
  if (settled && settled.key === key) {
    if ("locked" in settled) throw settled.locked;
    return { state: settled.state, retry };
  }
  return { state: { status: "loading" }, retry };
}
