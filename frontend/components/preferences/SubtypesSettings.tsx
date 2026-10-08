"use client";

/**
 * @module SubtypesSettings
 *
 * Metadata-tab section (Feature 72, FR-24) that manages the project's ordered
 * resource-subtype list. Reads the list through
 * {@link selectActiveProjectSubtypes} (never `AppShell` props, FR-3), so a
 * newly added subtype appears without a reload.
 *
 * Every add, remove and reorder dispatches {@link updateProjectSubtypes} with
 * the complete new array (the server replaces the list wholesale). Unlike
 * `RelationshipTypesSettings`, the draft input is cleared only after the write
 * resolves, so a failed write keeps the typed text (FR-4,
 * `docs/standards/failure-visibility.md`). Always on: not gated on the
 * `entities` flag (FR-25). Removal is never blocked or prompted (FR-23).
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useAppDispatch } from "../../src/store/hooks";
import useAppSelector from "../../src/store/hooks";
import {
  selectActiveProjectSubtypes,
  selectSelectedProjectId,
  updateProjectSubtypes,
} from "../../src/store/projectsSlice";
import { normalizeSubtypeLabel } from "../../src/lib/models/field-subtype-scope";
import { toastService } from "../../src/lib/toast-service";
import Button from "../common/UI/Button/Button";

/** UI-only length limit for a subtype label, matching tag names (FR-24). */
const MAX_LABEL_LENGTH = 64;

/**
 * Renders the subtype list editor. Returns `null` when no project is selected.
 *
 * @returns The subtypes settings section, or `null` when no project is active.
 */
export default function SubtypesSettings(): JSX.Element | null {
  const dispatch = useAppDispatch();
  const selectedProjectId = useAppSelector(selectSelectedProjectId);
  const subtypes = useAppSelector(selectActiveProjectSubtypes);
  const [newLabel, setNewLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!selectedProjectId) {
    return null;
  }

  /**
   * Persists the complete, ordered subtype list. Resolves `true` when the
   * write succeeded; on failure shows an error toast and resolves `false`,
   * leaving the store (and so the visible list) unchanged.
   *
   * @param next - The complete new subtype list.
   */
  const persist = async (next: string[]): Promise<boolean> => {
    setIsSaving(true);
    try {
      await dispatch(
        updateProjectSubtypes({ projectId: selectedProjectId, subtypes: next }),
      ).unwrap();
      return true;
    } catch (caught) {
      toastService.error(
        "Couldn't update subtypes",
        caught instanceof Error ? caught.message : undefined,
      );
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Validates the draft (blank, case-insensitive duplicate) and, if valid,
   * appends it. The draft is cleared only once the write has succeeded.
   */
  const handleAdd = async (): Promise<void> => {
    if (isSaving) return;
    const trimmed = newLabel.trim();
    if (trimmed === "") {
      setError("Enter a subtype name.");
      return;
    }
    const key = normalizeSubtypeLabel(trimmed);
    if (subtypes.some((label) => normalizeSubtypeLabel(label) === key)) {
      setError(`"${trimmed}" already exists.`);
      return;
    }
    setError(null);
    if (await persist([...subtypes, trimmed])) {
      setNewLabel("");
    }
  };

  /**
   * Removes the subtype at `index` and persists the result.
   *
   * @param index - Index of the subtype to remove.
   */
  const handleRemove = (index: number): void => {
    if (isSaving) return;
    void persist(subtypes.filter((_, i) => i !== index));
  };

  /**
   * Swaps the subtype at `index` with its neighbour and persists the result.
   *
   * @param index - Index of the subtype to move.
   * @param direction - `-1` to move up, `1` to move down.
   */
  const handleMove = (index: number, direction: -1 | 1): void => {
    const target = index + direction;
    if (isSaving || target < 0 || target >= subtypes.length) return;
    const next = [...subtypes];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    void persist(next);
  };

  const iconButtonClass =
    "rounded p-1 text-gw-secondary transition-colors duration-150 hover:text-gw-primary disabled:opacity-40";

  return (
    <section className="rounded-lg border-[0.5px] border-gw-border bg-gw-chrome p-5">
      <h2 className="text-sm font-semibold text-gw-primary">Subtypes</h2>
      <p className="mt-1 text-sm text-gw-secondary">
        Define the subtypes a resource can be given, such as Scene or Chapter.
        Metadata fields can be limited to some of them below.
      </p>

      {subtypes.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2">
          {subtypes.map((label, index) => (
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
                disabled={isSaving || index === subtypes.length - 1}
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
          No subtypes yet. Add one below.
        </p>
      )}

      <div className="mt-4 flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <label
            htmlFor="subtype-new"
            className="text-sm font-medium text-gw-primary"
          >
            New subtype
          </label>
          <input
            id="subtype-new"
            type="text"
            maxLength={MAX_LABEL_LENGTH}
            value={newLabel}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "subtype-new-error" : undefined}
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
          id="subtype-new-error"
          role="alert"
          className="mt-2 text-sm text-gw-primary"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}
