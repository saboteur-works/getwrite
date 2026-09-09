"use client";

/**
 * @module RelationshipTypesSettings
 *
 * Project-settings section (FR-19) that manages the vocabulary of entity
 * relationship types offered by the FR-2 create control
 * (`EntityRelationshipsSection.tsx`). Reads the project's current *effective*
 * list via {@link selectActiveProjectRelationshipTypes} (Task 11) — the same
 * selector the create control reads — so both surfaces always agree on the
 * same list, including the default vocabulary when nothing is persisted yet.
 *
 * Every add, remove, and reorder immediately dispatches
 * {@link updateProjectRelationshipTypes} (Task 12) with the full, updated
 * array; the route replaces `config.relationshipTypes` wholesale, so each
 * dispatch must always carry the complete list, not a delta.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useAppDispatch } from "../../src/store/hooks";
import useAppSelector from "../../src/store/hooks";
import {
  selectActiveProjectFeatures,
  selectActiveProjectRelationshipTypes,
  selectSelectedProjectId,
  updateProjectRelationshipTypes,
} from "../../src/store/projectsSlice";
import { toastService } from "../../src/lib/toast-service";
import Button from "../common/UI/Button/Button";

/**
 * Normalizes a relationship type for duplicate comparison: trimmed and
 * lowercased, mirroring `entity-alias-table.ts`'s `normalizeTerm` convention
 * for case-insensitive matching of user-authored short strings.
 *
 * @param value - Raw relationship type text.
 * @returns The normalized comparison key.
 */
function normalizeType(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Renders the relationship-type list editor. Returns `null` when no project
 * is selected so the section is omitted rather than rendered empty.
 *
 * @returns The relationship-types settings section, or `null` when no
 *   project is active.
 */
export default function RelationshipTypesSettings(): JSX.Element | null {
  const dispatch = useAppDispatch();
  const selectedProjectId = useAppSelector(selectSelectedProjectId);
  const features = useAppSelector(selectActiveProjectFeatures);
  const relationshipTypes = useAppSelector(
    selectActiveProjectRelationshipTypes,
  );
  const [newType, setNewType] = useState("");

  // No new flag is introduced (FR-19) — this editor rides the existing
  // `entities` flag, matching where the FR-2 create control it configures is
  // itself gated.
  if (!selectedProjectId || features.entities !== true) {
    return null;
  }

  /**
   * Persists a full relationship-types array (the route replaces the block
   * wholesale) and reports failure via toast.
   *
   * @param next - The complete, ordered relationship-types array to persist.
   */
  const persist = async (next: string[]): Promise<void> => {
    try {
      await dispatch(
        updateProjectRelationshipTypes({
          projectId: selectedProjectId,
          relationshipTypes: next,
        }),
      ).unwrap();
    } catch (error) {
      toastService.error(
        "Couldn't update relationship types",
        error instanceof Error ? error.message : undefined,
      );
    }
  };

  /**
   * Appends the drafted type, rejecting blank/whitespace-only input and
   * case-insensitive duplicates of an existing type without dispatching.
   */
  const handleAdd = (): void => {
    const trimmed = newType.trim();
    if (trimmed === "") {
      return;
    }
    const normalized = normalizeType(trimmed);
    const isDuplicate = relationshipTypes.some(
      (type) => normalizeType(type) === normalized,
    );
    if (isDuplicate) {
      toastService.error(
        "Couldn't add relationship type",
        `"${trimmed}" already exists.`,
      );
      return;
    }
    setNewType("");
    void persist([...relationshipTypes, trimmed]);
  };

  /**
   * Removes the type at `index` and persists the resulting array.
   *
   * @param index - Index of the type to remove.
   */
  const handleRemove = (index: number): void => {
    const next = relationshipTypes.filter((_, i) => i !== index);
    void persist(next);
  };

  /**
   * Swaps the type at `index` with its neighbor in `direction` and persists
   * the reordered array. No-ops at either end of the list.
   *
   * @param index - Index of the type to move.
   * @param direction - `-1` to move up, `1` to move down.
   */
  const handleMove = (index: number, direction: -1 | 1): void => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= relationshipTypes.length) {
      return;
    }
    const next = [...relationshipTypes];
    const [moved] = next.splice(index, 1);
    next.splice(targetIndex, 0, moved);
    void persist(next);
  };

  return (
    <section className="rounded-lg border-[0.5px] border-gw-border bg-gw-chrome p-5">
      <h2 className="text-sm font-semibold text-gw-primary">
        Relationship Types
      </h2>
      <p className="mt-1 text-sm text-gw-secondary">
        Configure the relationship types available when linking one entity to
        another.
      </p>

      {relationshipTypes.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {relationshipTypes.map((type, index) => (
            <li
              key={type}
              className="flex items-center gap-2 rounded-md border border-gw-border bg-gw-chrome2 px-3 py-2"
            >
              <span className="flex-1 truncate text-sm text-gw-primary">
                {type}
              </span>
              <button
                type="button"
                aria-label={`Move ${type} up`}
                onClick={() => handleMove(index, -1)}
                disabled={index === 0}
                className="rounded p-1 text-gw-secondary transition-colors duration-150 hover:text-gw-primary disabled:opacity-40"
              >
                <ChevronUp size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={`Move ${type} down`}
                onClick={() => handleMove(index, 1)}
                disabled={index === relationshipTypes.length - 1}
                className="rounded p-1 text-gw-secondary transition-colors duration-150 hover:text-gw-primary disabled:opacity-40"
              >
                <ChevronDown size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label={`Remove ${type}`}
                onClick={() => handleRemove(index)}
                className="rounded p-1 text-gw-secondary transition-colors duration-150 hover:text-gw-primary"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {relationshipTypes.length === 0 && (
        <p className="mt-4 text-sm text-gw-secondary">
          No relationship types configured. Add one below.
        </p>
      )}

      <div className="mt-4 flex items-end gap-2">
        <div className="flex flex-1 flex-col gap-1">
          <label
            htmlFor="relationship-type-new"
            className="text-sm font-medium text-gw-primary"
          >
            New relationship type
          </label>
          <input
            id="relationship-type-new"
            type="text"
            value={newType}
            onChange={(event) => setNewType(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleAdd();
              }
            }}
            className="rounded-md border border-gw-border bg-gw-chrome2 px-3 py-2 text-sm text-gw-primary outline-none transition-colors duration-150 focus:border-gw-border-md"
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleAdd}
          disabled={newType.trim() === ""}
        >
          Add
        </Button>
      </div>
    </section>
  );
}
