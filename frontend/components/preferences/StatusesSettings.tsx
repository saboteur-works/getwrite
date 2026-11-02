"use client";

/**
 * @module StatusesSettings
 *
 * Metadata-tab section (Feature 99, FR-10 to FR-12) that manages the project's
 * ordered document-status list (`config.statuses`). Reads the list through
 * {@link selectActiveProjectStatuses}, so the sidebar Status control, the
 * Organizer filter and the query builder `status` field show a saved change
 * without a reload.
 *
 * Every add, remove and reorder dispatches {@link updateProjectStatuses} with
 * the complete new array. An added entry is checked with the same
 * {@link StatusListSchema} the server applies (FR-11), so the rules live in
 * one place. The typed text is cleared only after the write resolves, and a
 * rejected write shows an inline error and leaves the list unchanged
 * (`docs/standards/failure-visibility.md`). There is no rename: removing a
 * status never touches a document that carries it (FR-12).
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useAppDispatch } from "../../src/store/hooks";
import useAppSelector from "../../src/store/hooks";
import {
  selectActiveProjectStatuses,
  selectSelectedProjectId,
  updateProjectStatuses,
} from "../../src/store/projectsSlice";
import { normalizeSubtypeLabel } from "../../src/lib/models/field-subtype-scope";
import { StatusListSchema } from "../../src/lib/models/schemas";
import { toastService } from "../../src/lib/toast-service";
import Button from "../common/UI/Button/Button";

/** UI-only length limit for a status label. */
const MAX_LABEL_LENGTH = 64;

/**
 * Checks `candidate` appended to `current` with {@link StatusListSchema} and
 * returns the message of the issue reported at the new entry, or `null`.
 *
 * @param current - The stored list.
 * @param candidate - The trimmed draft entry.
 */
function entryError(current: string[], candidate: string): string | null {
  const result = StatusListSchema.safeParse([...current, candidate]);
  if (result.success) return null;
  const issue = result.error.issues.find((i) => i.path[0] === current.length);
  return issue?.message ?? result.error.issues[0]?.message ?? null;
}

/**
 * Renders the status list editor. Returns `null` when no project is selected.
 *
 * @returns The statuses settings section, or `null` when no project is active.
 */
export default function StatusesSettings(): JSX.Element | null {
  const dispatch = useAppDispatch();
  const selectedProjectId = useAppSelector(selectSelectedProjectId);
  const statuses = useAppSelector(selectActiveProjectStatuses);
  const [newLabel, setNewLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!selectedProjectId) {
    return null;
  }

  /**
   * Persists the complete, ordered status list. Resolves `true` on success;
   * on failure shows an inline error and a toast, resolves `false`, and
   * leaves the store (and so the visible list) unchanged.
   *
   * @param next - The complete new status list.
   */
  const persist = async (next: string[]): Promise<boolean> => {
    setIsSaving(true);
    try {
      await dispatch(
        updateProjectStatuses({ projectId: selectedProjectId, statuses: next }),
      ).unwrap();
      setError(null);
      return true;
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : undefined;
      setError(
        detail
          ? `Couldn't save statuses. ${detail}`
          : "Couldn't save statuses.",
      );
      toastService.error("Couldn't save statuses", detail);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  /** Validates the draft and, if valid, appends it; clears it after success. */
  const handleAdd = async (): Promise<void> => {
    if (isSaving) return;
    const trimmed = newLabel.trim();
    const problem = entryError(statuses, trimmed);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    if (await persist([...statuses, trimmed])) {
      setNewLabel("");
    }
  };

  /**
   * Removes the status at `index` and persists the result.
   *
   * @param index - Index of the status to remove.
   */
  const handleRemove = (index: number): void => {
    if (isSaving) return;
    void persist(statuses.filter((_, i) => i !== index));
  };

  /**
   * Swaps the status at `index` with its neighbour and persists the result.
   *
   * @param index - Index of the status to move.
   * @param direction - `-1` to move up, `1` to move down.
   */
  const handleMove = (index: number, direction: -1 | 1): void => {
    const target = index + direction;
    if (isSaving || target < 0 || target >= statuses.length) return;
    const next = [...statuses];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    void persist(next);
  };

  const iconButtonClass =
    "rounded p-1 text-gw-secondary transition-colors duration-150 hover:text-gw-primary disabled:opacity-40";

  return (
    <section className="rounded-lg border-[0.5px] border-gw-border bg-gw-chrome p-5">
      <h2 className="text-sm font-semibold text-gw-primary">Statuses</h2>
      <p className="mt-1 text-sm text-gw-secondary">
        Define the statuses a document can be given, such as Outline or Draft.
        Removing a status does not change any document that already has it.
      </p>

      {statuses.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2">
          {statuses.map((label, index) => (
            <li
              key={normalizeSubtypeLabel(label)}
              className="flex items-center gap-2 rounded-md border border-gw-border bg-gw-chrome2 px-3 py-2"
            >
              <span className="flex-1 truncate text-sm text-gw-primary">
                {label}
              </span>
              <button
                type="button"
                aria-label={`Move ${label} up`}
                onClick={() => handleMove(index, -1)}
                disabled={isSaving || index === 0}
                className={iconButtonClass}
              >
                <ChevronUp size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={`Move ${label} down`}
                onClick={() => handleMove(index, 1)}
                disabled={isSaving || index === statuses.length - 1}
                className={iconButtonClass}
              >
                <ChevronDown size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={`Remove ${label}`}
                onClick={() => handleRemove(index)}
                disabled={isSaving}
                className={iconButtonClass}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-gw-secondary">
          No statuses yet. Add one below.
        </p>
      )}

      <div className="mt-4 flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <label
            htmlFor="status-new"
            className="text-sm font-medium text-gw-primary"
          >
            New status
          </label>
          <input
            spellCheck={false}
            id="status-new"
            type="text"
            maxLength={MAX_LABEL_LENGTH}
            value={newLabel}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "status-new-error" : undefined}
            onChange={(event) => {
              setNewLabel(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleAdd();
              }
            }}
            className="rounded-md border border-gw-border bg-gw-chrome2 px-3 py-2 text-sm text-gw-primary outline-none transition-colors duration-150 focus:border-gw-border-md"
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => void handleAdd()}
          disabled={isSaving}
        >
          Add
        </Button>
      </div>
      {error ? (
        <p
          id="status-new-error"
          role="alert"
          className="mt-2 text-sm text-gw-primary"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
