"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Button from "../common/UI/Button/Button";
import { useAppDispatch } from "../../src/store/hooks";
import { addMetadataField } from "../../src/store/projectsSlice";
import type {
  MetadataFieldType,
  MetadataSchema,
} from "../../src/lib/models/types";
import {
  slugifyName,
  deriveLabel,
  findExisting,
  fuzzyMatch,
} from "../../src/lib/models/field-dedup";

// ─── Constants ────────────────────────────────────────────────────────────────

const SLUG_RE = /^[a-z0-9-]+$/;

const FIELD_TYPE_LABELS: Record<MetadataFieldType, string> = {
  text: "Text",
  number: "Number",
  date: "Date",
  boolean: "Boolean",
  select: "Select",
  multiselect: "Multi",
  "resource-ref": "Ref",
  "multi-resource-ref": "Multi Ref",
};

// ─── Exported helper (also tested in unit tests) ──────────────────────────────

export function defaultGroupId(
  schema: MetadataSchema,
  currentFolderId?: string | null,
): string {
  if (currentFolderId) {
    const folderGroup = schema.groups.find(
      (g) => g.folderId === currentFolderId,
    );
    if (folderGroup) return folderGroup.id;
  }
  const firstNonBuiltin = schema.groups.find(
    (g) => !g.id.startsWith("builtin-"),
  );
  if (firstNonBuiltin) return firstNonBuiltin.id;
  return schema.groups[0]?.id ?? "";
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface AddFieldFormProps {
  schema: MetadataSchema;
  selectedProjectId: string;
  /** folderId of the currently selected resource — used to default the group selection. */
  currentFolderId?: string | null;
  onCancel: () => void;
  /** Called when autocomplete or exact match routes to an already-declared field. */
  onFieldFocused: (fieldKey: string) => void;
  /** Called after the new field is successfully persisted. */
  onCreated: (fieldKey: string) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AddFieldForm({
  schema,
  selectedProjectId,
  currentFolderId,
  onCancel,
  onFieldFocused,
  onCreated,
}: AddFieldFormProps): JSX.Element {
  const dispatch = useAppDispatch();

  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [isLabelEdited, setIsLabelEdited] = useState(false);
  const [type, setType] = useState<MetadataFieldType>("text");
  const [groupId, setGroupId] = useState(() =>
    defaultGroupId(schema, currentFolderId),
  );
  const [isShowingSuggestions, setIsShowingSuggestions] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const nameInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    nameInputRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleOutside(e: MouseEvent): void {
      if (formRef.current && !formRef.current.contains(e.target as Node)) {
        setIsShowingSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const slug = slugifyName(name);
  const exactMatch = slug ? findExisting(name, schema) : null;
  const fuzzyCandidate = !exactMatch && slug ? fuzzyMatch(name, schema) : null;

  const suggestions = useMemo(() => {
    if (!name.trim()) return [];
    const q = name.toLowerCase();
    const seen = new Set<string>();
    const results: Array<{ key: string; label: string }> = [];
    for (const group of schema.groups) {
      for (const field of group.fields) {
        if (seen.has(field.key)) continue;
        if (field.key.includes(q) || field.label.toLowerCase().includes(q)) {
          seen.add(field.key);
          results.push({ key: field.key, label: field.label });
        }
      }
    }
    return results;
  }, [name, schema]);

  const handleNameChange = useCallback(
    (value: string): void => {
      setName(value);
      setError("");
      if (!isLabelEdited) {
        setLabel(deriveLabel(value));
      }
      setIsShowingSuggestions(true);
    },
    [isLabelEdited],
  );

  function handleSuggestionClick(fieldKey: string): void {
    setIsShowingSuggestions(false);
    onFieldFocused(fieldKey);
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();

    if (exactMatch) {
      onFieldFocused(exactMatch.field.key);
      return;
    }

    const key = slug;
    if (!key) {
      setError("Name is required.");
      return;
    }
    if (!SLUG_RE.test(key)) {
      setError(`Key "${key}" is not a valid slug.`);
      return;
    }
    const targetGroupId = groupId || defaultGroupId(schema, currentFolderId);
    if (!targetGroupId) {
      setError("No group available. Add a group first in Schema Manager.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      await dispatch(
        addMetadataField({
          projectId: selectedProjectId,
          groupId: targetGroupId,
          field: { key, label: label.trim() || deriveLabel(key), type },
        }),
      ).unwrap();
      onCreated(key);
    } catch (err) {
      setError(typeof err === "string" ? err : "Failed to create field.");
      setIsSubmitting(false);
    }
  }

  const isExactMatch = Boolean(exactMatch);

  return (
    <div ref={formRef} className="pt-3 border-t border-gw-border">
      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
      >
        {/* Name row with autocomplete */}
        <div className="mb-2">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-10 flex-shrink-0 text-[9px] font-mono uppercase tracking-[0.14em] text-gw-dim">
              Name
            </span>
            <div className="relative flex-1 min-w-0">
              <input
                ref={nameInputRef}
                type="text"
                className="w-full bg-transparent border-b border-gw-border text-[11px] font-mono text-gw-primary placeholder:text-gw-dim outline-none focus:border-gw-border-md py-0.5 transition-colors duration-150"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                onFocus={() => {
                  if (name.trim()) setIsShowingSuggestions(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    if (isShowingSuggestions) {
                      e.stopPropagation();
                      setIsShowingSuggestions(false);
                    } else {
                      onCancel();
                    }
                  }
                }}
                autoComplete="off"
                placeholder="e.g. tension"
                aria-label="field-name"
                aria-autocomplete="list"
                aria-expanded={isShowingSuggestions && suggestions.length > 0}
              />
              {isShowingSuggestions && suggestions.length > 0 && (
                <div
                  className="absolute left-0 top-full mt-0.5 w-full bg-gw-chrome2 border border-gw-border-md rounded-sm z-50 max-h-36 overflow-y-auto shadow-sm"
                  role="listbox"
                  aria-label="Existing fields"
                >
                  {suggestions.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      role="option"
                      aria-selected={false}
                      className="flex items-center justify-between w-full px-2 py-1.5 text-left hover:bg-gw-chrome3 transition-colors duration-100 gap-2"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSuggestionClick(s.key);
                      }}
                    >
                      <span className="text-[10px] font-mono uppercase tracking-[0.10em] text-gw-secondary truncate">
                        {s.key}
                      </span>
                      <span className="text-[9px] font-mono text-gw-dim truncate flex-shrink-0">
                        {s.label}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Exact match notice */}
          {isExactMatch && (
            <p className="text-[9px] font-mono text-gw-secondary pl-12 mb-1">
              Already exists in {exactMatch!.groupLabel} — press Add to go
              there.
            </p>
          )}

          {/* Fuzzy match warning */}
          {fuzzyCandidate && !isExactMatch && (
            <div className="flex items-center gap-1 pl-12 mb-1">
              <span className="text-[9px] font-mono text-gw-dim">
                Did you mean
              </span>
              <button
                type="button"
                className="text-[9px] font-mono text-gw-secondary underline decoration-gw-border hover:text-gw-primary transition-colors duration-150"
                onClick={() => onFieldFocused(fuzzyCandidate.field.key)}
              >
                {fuzzyCandidate.field.key}
              </button>
              <span className="text-[9px] font-mono text-gw-dim">?</span>
            </div>
          )}
        </div>

        {/* Label / Type / Group — only shown when creating a new field */}
        {!isExactMatch && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <span className="w-10 flex-shrink-0 text-[9px] font-mono uppercase tracking-[0.14em] text-gw-dim">
                Label
              </span>
              <input
                type="text"
                className="flex-1 min-w-0 bg-transparent border-b border-gw-border text-[11px] font-mono text-gw-primary placeholder:text-gw-dim outline-none focus:border-gw-border-md py-0.5 transition-colors duration-150"
                value={label}
                onChange={(e) => {
                  setLabel(e.target.value);
                  setIsLabelEdited(true);
                }}
                placeholder="Display label"
                aria-label="field-label"
              />
            </div>

            <div className="flex items-center gap-2 mb-2">
              <span className="w-10 flex-shrink-0 text-[9px] font-mono uppercase tracking-[0.14em] text-gw-dim">
                Type
              </span>
              <select
                className="flex-1 min-w-0 bg-transparent border-b border-gw-border text-[11px] font-mono text-gw-primary outline-none focus:border-gw-border-md py-0.5 transition-colors duration-150 cursor-pointer"
                value={type}
                onChange={(e) => setType(e.target.value as MetadataFieldType)}
                aria-label="field-type"
              >
                {(
                  Object.entries(FIELD_TYPE_LABELS) as [
                    MetadataFieldType,
                    string,
                  ][]
                ).map(([v, lbl]) => (
                  <option key={v} value={v}>
                    {lbl}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 mb-3">
              <span className="w-10 flex-shrink-0 text-[9px] font-mono uppercase tracking-[0.14em] text-gw-dim">
                Group
              </span>
              <select
                className="flex-1 min-w-0 bg-transparent border-b border-gw-border text-[11px] font-mono text-gw-primary outline-none focus:border-gw-border-md py-0.5 transition-colors duration-150 cursor-pointer"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
                aria-label="field-group"
              >
                {schema.groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {error && (
          <p className="text-[9px] font-mono text-gw-red mb-2">{error}</p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="secondary"
            size="sm"
            disabled={isSubmitting || (!isExactMatch && !slug)}
          >
            {isSubmitting ? "Adding…" : isExactMatch ? "Go to field" : "Add"}
          </Button>
        </div>
      </form>
    </div>
  );
}
