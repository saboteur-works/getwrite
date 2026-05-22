"use client";

import React, { useState } from "react";
import FilterChip, {
  type FilterChipField,
  type FilterChipValue,
} from "./FilterChip";
import type { ResourceOption } from "../Sidebar/controls/ResourceRefInput";
import "./filter-group.css";

// ─── Types ────────────────────────────────────────────────────────────────────

export type GroupCombinator = "and" | "or";

export interface GroupChip {
  id: string;
  field: FilterChipField | null;
  operator: string | null;
  value: FilterChipValue;
  error?: string;
  /** ID of a saved query this chip references, when set this is a ref chip. */
  refId?: string;
  /** Display name for the saved query (resolved from the query store). */
  refName?: string;
}

export interface FilterGroupProps {
  /** Combinator joining the chips within this group. */
  combinator: GroupCombinator;
  /** Ordered list of chip conditions in this group. */
  chips: GroupChip[];
  /** Fields available in each chip's field picker. */
  availableFields?: FilterChipField[];
  /** Saved queries shown in the field picker's "Saved queries" section. */
  savedQueries?: Array<{ id: string; name: string }>;
  /** When provided, resource-ref / multi-resource-ref chips render a typeahead. */
  resolveResourceOptions?: (
    refFolder: string | undefined,
    includeSubfolders?: boolean,
  ) => ResourceOption[];
  /** When provided, folder-ref fields render a folder typeahead. */
  resolveFolderOptions?: () => ResourceOption[];
  /** Optional match count shown in the footer. Omit to hide. */
  matchCount?: number;
  onCombinatorChange?: (combinator: GroupCombinator) => void;
  /** Partial update for a chip — field, operator, and value may be updated independently. */
  onChipUpdate?: (id: string, updates: Partial<Omit<GroupChip, "id">>) => void;
  onChipAdd?: () => void;
  onChipDelete?: (id: string) => void;
  onChipDuplicate?: (id: string) => void;
  /** Move chip at fromIndex to toIndex (insert-before semantics). */
  onChipReorder?: (fromIndex: number, toIndex: number) => void;
}

// ─── FilterGroup ──────────────────────────────────────────────────────────────

export default function FilterGroup({
  combinator,
  chips,
  availableFields,
  savedQueries,
  resolveResourceOptions,
  resolveFolderOptions,
  matchCount,
  onCombinatorChange,
  onChipUpdate,
  onChipAdd,
  onChipDelete,
  onChipDuplicate,
  onChipReorder,
}: FilterGroupProps): JSX.Element {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  return (
    <div className="filter-group">
      {/* ── Header: combinator ── */}
      <div className="filter-group__header">
        <select
          className="filter-group__combinator"
          value={combinator}
          aria-label="Group combinator"
          onChange={(e) =>
            onCombinatorChange?.(e.target.value as GroupCombinator)
          }
        >
          <option value="and">All of</option>
          <option value="or">Any of</option>
        </select>
      </div>

      {/* ── Chip list ── */}
      <div className="filter-group__chips">
        {chips.map((chip, index) => {
          const isDragging = draggingIndex === index;
          const isDragOver = dragOverIndex === index && draggingIndex !== index;

          const rowClass = [
            "filter-group__chip-row",
            isDragging ? "filter-group__chip-row--dragging" : "",
            isDragOver ? "filter-group__chip-row--drag-over" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div
              key={chip.id}
              className={rowClass}
              draggable
              onDragStart={(e) => {
                setDraggingIndex(index);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(index));
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragOverIndex !== index) {
                  setDragOverIndex(index);
                }
              }}
              onDragLeave={(e) => {
                if (
                  e.relatedTarget === null ||
                  !e.currentTarget.contains(e.relatedTarget as Node)
                ) {
                  setDragOverIndex(null);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (draggingIndex !== null && draggingIndex !== index) {
                  onChipReorder?.(draggingIndex, index);
                }
                setDraggingIndex(null);
                setDragOverIndex(null);
              }}
              onDragEnd={() => {
                setDraggingIndex(null);
                setDragOverIndex(null);
              }}
            >
              <FilterChip
                field={chip.field}
                operator={chip.operator}
                value={chip.value}
                availableFields={availableFields}
                savedQueries={savedQueries}
                resolveResourceOptions={resolveResourceOptions}
                resolveFolderOptions={resolveFolderOptions}
                error={chip.error}
                refId={chip.refId}
                refName={chip.refName}
                onFieldChange={(field) =>
                  onChipUpdate?.(chip.id, {
                    field,
                    refId: undefined,
                    refName: undefined,
                  })
                }
                onOperatorChange={(operator) =>
                  onChipUpdate?.(chip.id, { operator })
                }
                onValueChange={(value) => onChipUpdate?.(chip.id, { value })}
                onRefChange={(refId, refName) =>
                  onChipUpdate?.(chip.id, {
                    refId,
                    refName,
                    field: null,
                    operator: null,
                    value: null,
                  })
                }
                onDuplicate={
                  onChipDuplicate ? () => onChipDuplicate(chip.id) : undefined
                }
                onDelete={
                  onChipDelete ? () => onChipDelete(chip.id) : undefined
                }
                onMove={(direction) => {
                  if (!onChipReorder) return;
                  const targetIndex =
                    direction === "up" ? index - 1 : index + 1;
                  if (targetIndex >= 0 && targetIndex < chips.length) {
                    onChipReorder(index, targetIndex);
                  }
                }}
              />
            </div>
          );
        })}
      </div>

      {/* ── Footer: add condition + match count ── */}
      <div className="filter-group__footer">
        <button type="button" className="filter-group__add" onClick={onChipAdd}>
          + Add condition
        </button>
        {matchCount !== undefined && (
          <span className="filter-group__match">
            {matchCount} {matchCount === 1 ? "match" : "matches"}
          </span>
        )}
      </div>
    </div>
  );
}
