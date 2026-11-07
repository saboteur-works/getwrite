"use client";

import { useCallback, useState } from "react";

/**
 * @module useSaveDefaultsAction
 *
 * Save and clear of a project's saved exclusions from inside a dialog
 * (Feature 101, FR-5). Shared by the compile and export dialogs.
 *
 * - The shown default (`override`) changes only when the setter resolves; a
 *   rejected setter leaves it as it was and the result is `failed` with the
 *   rejection's message, never `saved`.
 * - The only code path that calls the setter is `save` or `clear`; a per-run
 *   change to the selection or options never reaches it (FR-4).
 * - Nothing is logged.
 */

/** Sets (a list of ids) or clears (`null`) the saved exclusions. */
export type SavedDefaultsSetter = (
  projectId: string,
  excludedResourceIds: string[] | null,
) => Promise<{ excludedResourceIds: string[] | undefined }>;

export type SaveDefaultsResult =
  | { kind: "saved" }
  | { kind: "cleared" }
  | { kind: "failed"; message: string };

export interface SaveDefaultsAction {
  /** The default as last confirmed by a setter; `null` before any save. */
  override: { excludedResourceIds: string[] | undefined } | null;
  result: SaveDefaultsResult | null;
  isBusy: boolean;
  save: (excludedResourceIds: string[]) => void;
  clear: () => void;
}

const FALLBACK_MESSAGE = "The saved defaults could not be updated.";

function messageOf(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : FALLBACK_MESSAGE;
}

export function useSaveDefaultsAction(
  projectId: string | undefined,
  setter: SavedDefaultsSetter,
): SaveDefaultsAction {
  const [override, setOverride] =
    useState<SaveDefaultsAction["override"]>(null);
  const [result, setResult] = useState<SaveDefaultsResult | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const run = useCallback(
    (ids: string[] | null) => {
      if (projectId === undefined) return;
      setIsBusy(true);
      setResult(null);
      setter(projectId, ids).then(
        (saved) => {
          setOverride({ excludedResourceIds: saved.excludedResourceIds });
          setResult({ kind: ids === null ? "cleared" : "saved" });
          setIsBusy(false);
        },
        (error: unknown) => {
          setResult({ kind: "failed", message: messageOf(error) });
          setIsBusy(false);
        },
      );
    },
    [projectId, setter],
  );

  const save = useCallback((ids: string[]) => run(ids), [run]);
  const clear = useCallback(() => run(null), [run]);
  return { override, result, isBusy, save, clear };
}
