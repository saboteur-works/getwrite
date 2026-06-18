"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type {
  MetadataFieldType,
  MetadataSchema,
} from "../../src/lib/models/types";
import { DEFAULT_METADATA_SCHEMA } from "../../src/lib/models/default-metadata-schema";
import { INTRINSIC_FIELDS } from "../../src/lib/models/query-intrinsics";
import { fuzzyMatch } from "../../src/lib/models/field-dedup";
import EditContextMenu from "../common/UI/ContextMenu/EditContextMenu";
import "./field-picker.css";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FieldPickerSource = "builtin" | "project" | "system";

export interface FieldPickerField {
  key: string;
  label: string;
  type: MetadataFieldType;
  /** Determines which group section the field appears in. */
  source: FieldPickerSource;
  /** Group label shown as an annotation when the group has a folderId. */
  folderScope?: string;
  /** Options for select / multiselect field types. */
  options?: string[];
  /** When true, the field is deprecated: queryable but rendered muted with a badge. */
  deprecated?: boolean;
  /** For resource-ref / multi-resource-ref fields: the folder ID whose resources are candidates. */
  refFolder?: string;
  /** When true, resources in descendant folders of refFolder are also candidates. */
  includeSubfolders?: boolean;
  /** When true, the ref value for this field resolves to folders rather than resources. */
  isFolderField?: boolean;
}

export interface FieldPickerProps {
  /** Queryable fields to enumerate. Use buildFieldPickerFields() to produce this. */
  fields: FieldPickerField[];
  /** Currently selected field key, or null when unset. */
  value: string | null;
  /** Called when the user picks a field from the list. */
  onSelect: (field: FieldPickerField) => void;
  /**
   * When provided, shows a "+ Create a new field '{query}'" row at the bottom
   * when the search query matches nothing. The search string is passed as the
   * argument so the caller can pre-populate the SchemaManager form.
   */
  onAddField?: (name: string) => void;
  /**
   * When provided, a hover "Edit" affordance appears on builtin and project
   * field rows. The field key is passed to the callback.
   */
  onEditField?: (fieldKey: string) => void;
  disabled?: boolean;
  /**
   * When provided, fuzzy-match dedup is active. If the search query produces
   * no results but closely matches an existing field key, a "Did you mean?"
   * row appears so the user can jump to the existing field instead of
   * creating a duplicate.
   */
  schema?: MetadataSchema;
  /** Saved queries to show in a dedicated section at the bottom of the dropdown. */
  savedQueries?: Array<{ id: string; name: string }>;
  /** Called when the user picks a saved query from the saved-queries section. */
  onSelectRef?: (id: string, name: string) => void;
  /**
   * When set, the trigger button shows `@{refDisplay}` to indicate the current
   * selection is a saved-query reference rather than a field.
   */
  refDisplay?: string;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Merges the project's metadataSchema with system intrinsics into a flat
 * FieldPickerField list, tagged by source layer. Groups with id starting with
 * "builtin-" are "builtin"; all others are "project". Intrinsics are "system".
 *
 * Pass the merged project schema (project.config.metadataSchema) or omit to
 * get built-in + system fields only.
 */
export function buildFieldPickerFields(
  schema?: MetadataSchema,
  projectStatuses?: string[],
): FieldPickerField[] {
  const fields: FieldPickerField[] = [];
  const effectiveSchema = schema ?? DEFAULT_METADATA_SCHEMA;

  for (const group of effectiveSchema.groups) {
    const isBuiltin = group.id.startsWith("builtin-");
    const folderScope =
      !isBuiltin && group.folderId ? `${group.label} only` : undefined;

    for (const field of group.fields) {
      fields.push({
        key: field.key,
        label: field.label,
        type: field.type,
        source: isBuiltin ? "builtin" : "project",
        folderScope,
        options: field.options,
        deprecated: field.deprecated,
        refFolder: field.refFolder,
        includeSubfolders: field.includeSubfolders,
      });
    }
  }

  for (const f of INTRINSIC_FIELDS) {
    // Statuses are project-defined, so their options are injected at build time
    // rather than declared on the intrinsic. Only override when statuses exist.
    const options =
      f.key === "statuses" && projectStatuses && projectStatuses.length > 0
        ? projectStatuses
        : f.options;
    fields.push({
      key: f.key,
      label: f.label,
      type: f.type,
      options,
      source: "system",
      isFolderField: f.key === "folderId",
    });
  }

  return fields;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<FieldPickerSource, string> = {
  builtin: "Built-in",
  project: "Project",
  system: "System",
};

const SOURCE_ORDER: FieldPickerSource[] = ["builtin", "project", "system"];

// ─── Search ───────────────────────────────────────────────────────────────────

function matchesSearch(field: FieldPickerField, query: string): boolean {
  const q = query.toLowerCase();
  return (
    field.key.toLowerCase().includes(q) || field.label.toLowerCase().includes(q)
  );
}

// ─── FieldPicker ──────────────────────────────────────────────────────────────

export default function FieldPicker({
  fields,
  value,
  onSelect,
  onAddField,
  onEditField,
  disabled = false,
  schema,
  savedQueries,
  onSelectRef,
  refDisplay,
}: FieldPickerProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    setSearch("");
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    function handleOutsideClick(e: MouseEvent): void {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        closeMenu();
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isOpen, closeMenu]);

  useEffect(() => {
    if (isOpen) {
      searchRef.current?.focus();
    }
  }, [isOpen]);

  const currentField = fields.find((f) => f.key === value) ?? null;

  const filteredFields = search.trim()
    ? fields.filter((f) => matchesSearch(f, search))
    : fields;

  const filteredSavedQueries = !savedQueries
    ? []
    : search.trim()
      ? savedQueries.filter((q) =>
          q.name.toLowerCase().includes(search.toLowerCase()),
        )
      : savedQueries;

  const groupedBySource = filteredFields.reduce<
    Record<FieldPickerSource, FieldPickerField[]>
  >(
    (acc, f) => {
      acc[f.source].push(f);
      return acc;
    },
    { builtin: [], project: [], system: [] },
  );

  const shouldShowAddRow =
    Boolean(onAddField) &&
    search.trim().length > 0 &&
    filteredFields.length === 0;

  const fuzzyResult =
    schema && search.trim().length > 0 && filteredFields.length === 0
      ? fuzzyMatch(search.trim(), schema)
      : null;
  const fuzzyField = fuzzyResult
    ? (fields.find((f) => f.key === fuzzyResult.field.key) ?? null)
    : null;

  function handleSelect(field: FieldPickerField): void {
    onSelect(field);
    closeMenu();
  }

  return (
    <div className="field-picker" ref={wrapperRef}>
      <button
        type="button"
        className="field-picker__trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={
          refDisplay !== undefined
            ? `Saved query: @${refDisplay}`
            : currentField
              ? `Field: ${currentField.label}`
              : "Select a field"
        }
        onClick={() => {
          if (!disabled) setIsOpen((v) => !v);
        }}
      >
        <span className="field-picker__trigger-label">
          {refDisplay !== undefined
            ? `@${refDisplay}`
            : (currentField?.label ?? "field…")}
        </span>
        <span
          className={
            isOpen ? "field-picker__chevron--open" : "field-picker__chevron"
          }
        >
          <ChevronDown size={10} aria-hidden="true" />
        </span>
      </button>

      {isOpen && (
        <div
          className="field-picker__dropdown"
          role="listbox"
          aria-label="Select a field"
        >
          <div className="field-picker__search-wrapper">
            <EditContextMenu>
              <input
                ref={searchRef}
                type="text"
                className="field-picker__search"
                placeholder="Search fields…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search fields"
                onKeyDown={(e) => {
                  if (e.key === "Escape") closeMenu();
                }}
              />
            </EditContextMenu>
          </div>

          {SOURCE_ORDER.map((source) => {
            const section = groupedBySource[source];
            if (section.length === 0) return null;
            return (
              <div key={source} className="field-picker__section">
                <div className="field-picker__section-header">
                  {SOURCE_LABELS[source]}
                </div>
                {section.map((field) => (
                  <div
                    key={field.key}
                    role="option"
                    aria-selected={field.key === value}
                    tabIndex={0}
                    className={[
                      "field-picker__item",
                      field.key === value && "field-picker__item--selected",
                      field.deprecated && "field-picker__item--deprecated",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    onClick={() => handleSelect(field)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleSelect(field);
                      }
                    }}
                  >
                    <span className="field-picker__item-label">
                      {field.label}
                    </span>
                    <span className="field-picker__item-meta">
                      {field.folderScope && (
                        <span className="field-picker__scope">
                          {field.folderScope}
                        </span>
                      )}
                      {field.deprecated && (
                        <span className="field-picker__badge field-picker__badge--deprecated">
                          deprecated
                        </span>
                      )}
                      <span
                        className={`field-picker__badge field-picker__badge--${field.source}`}
                      >
                        {field.source}
                      </span>
                      {onEditField && field.source !== "system" && (
                        <button
                          type="button"
                          className="field-picker__item-edit"
                          aria-label={`Edit ${field.label} in Schema Manager`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditField(field.key);
                            closeMenu();
                          }}
                        >
                          Edit
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}

          {filteredSavedQueries.length > 0 && (
            <div className="field-picker__section field-picker__section--saved">
              <div className="field-picker__section-header">Saved queries</div>
              {filteredSavedQueries.map((q) => (
                <div
                  key={q.id}
                  role="option"
                  aria-selected={false}
                  tabIndex={0}
                  className="field-picker__item field-picker__item--saved"
                  onClick={() => {
                    onSelectRef?.(q.id, q.name);
                    closeMenu();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectRef?.(q.id, q.name);
                      closeMenu();
                    }
                  }}
                >
                  <span className="field-picker__item-label">@{q.name}</span>
                  <span className="field-picker__item-meta">
                    <span className="field-picker__badge field-picker__badge--saved">
                      saved
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}

          {filteredFields.length === 0 &&
            filteredSavedQueries.length === 0 &&
            !shouldShowAddRow &&
            !fuzzyField && (
              <div className="field-picker__empty">No fields match</div>
            )}

          {fuzzyField && (
            <div className="field-picker__fuzzy">
              <span className="field-picker__fuzzy-label">Did you mean</span>
              <button
                type="button"
                className="field-picker__fuzzy-match"
                onClick={() => handleSelect(fuzzyField)}
              >
                {fuzzyField.label}
              </button>
              <span className="field-picker__fuzzy-key">
                ({fuzzyField.key})
              </span>
            </div>
          )}

          {shouldShowAddRow && (
            <button
              type="button"
              className="field-picker__add"
              onClick={() => {
                onAddField?.(search.trim());
                closeMenu();
              }}
            >
              + Create a new field &quot;{search.trim()}&quot;
            </button>
          )}
        </div>
      )}
    </div>
  );
}
