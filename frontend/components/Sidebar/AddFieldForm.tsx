"use client";

import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import Button from "../common/UI/Button/Button";
import LabeledField from "./controls/LabeledField";
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

/**
 * The sidebar's standard input/select look (as in EntityRelationshipsSection):
 * bordered, on the nested surface, at body size.
 */
const FIELD_CONTROL_CLASS =
  "w-full mt-2 border border-gw-border bg-gw-chrome2 px-3 py-2 text-gw-label text-gw-primary placeholder:text-gw-secondary outline-none focus:border-gw-border-md transition-colors duration-150";

/** A hint or notice under a field, in the sidebar's small secondary text. */
const FIELD_NOTE_CLASS = "mt-1 text-gw-label text-gw-secondary";

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
  // Ties the name input to its suggestion listbox for the combobox pattern
  // below. `aria-controls` may only name an element that exists, so it is set
  // only while the listbox is actually rendered.
  const suggestionsListboxId = useId();
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
  // A deprecated field is hidden from the sidebar (Feature 89, FR-13), so the
  // form says it exists and offers only Close; it never routes to it.
  const isDeprecatedMatch = exactMatch?.field.deprecated === true;
  const rawFuzzy = !exactMatch && slug ? fuzzyMatch(name, schema) : null;
  const fuzzyCandidate = rawFuzzy?.field.deprecated === true ? null : rawFuzzy;

  const suggestions = useMemo(() => {
    if (!name.trim()) return [];
    const q = name.toLowerCase();
    const seen = new Set<string>();
    const results: Array<{ key: string; label: string }> = [];
    for (const group of schema.groups) {
      for (const field of group.fields) {
        if (seen.has(field.key)) continue;
        if (field.deprecated === true) continue;
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

    if (isDeprecatedMatch) return;

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

  const isExactMatch = Boolean(exactMatch) && !isDeprecatedMatch;

  return (
    <div ref={formRef} className="border-t border-gw-border px-4 py-3">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
      >
        <LabeledField label="Name">
          <div className="relative">
            <input
              ref={nameInputRef}
              type="text"
              className={FIELD_CONTROL_CLASS}
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
              // `aria-expanded` is not allowed on the implicit `textbox`
              // role of a plain text input, which axe-core flags as
              // `aria-allowed-attr`. The input genuinely is a combobox —
              // it owns the suggestion listbox below — so it takes that
              // role explicitly rather than dropping the attribute.
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={isShowingSuggestions && suggestions.length > 0}
              aria-controls={
                isShowingSuggestions && suggestions.length > 0
                  ? suggestionsListboxId
                  : undefined
              }
            />
            {isShowingSuggestions && suggestions.length > 0 && (
              <div
                id={suggestionsListboxId}
                className="absolute left-0 top-full mt-0.5 w-full bg-gw-chrome2 border border-gw-border-md rounded-sm z-50 max-h-36 overflow-y-auto"
                role="listbox"
                aria-label="Existing fields"
              >
                {suggestions.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    role="option"
                    aria-selected={false}
                    className="flex items-center justify-between w-full px-3 py-2 text-left hover:bg-gw-chrome3 transition-colors duration-100 gap-2"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSuggestionClick(s.key);
                    }}
                  >
                    <span className="text-gw-label font-mono uppercase tracking-label text-gw-primary truncate">
                      {s.key}
                    </span>
                    <span className="text-gw-label text-gw-secondary truncate flex-shrink-0">
                      {s.label}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Deprecated match notice: exists, hidden, nothing to go to */}
          {isDeprecatedMatch && (
            <p role="status" className={FIELD_NOTE_CLASS}>
              {exactMatch!.field.key} already exists and is deprecated, so it is
              hidden from the sidebar. Its values are kept.
            </p>
          )}

          {/* Exact match notice */}
          {isExactMatch && (
            <p className={FIELD_NOTE_CLASS}>
              Already exists in {exactMatch!.groupLabel} — press Go to field to
              go there.
            </p>
          )}

          {/* Fuzzy match warning */}
          {fuzzyCandidate && !isExactMatch && (
            <p className={FIELD_NOTE_CLASS}>
              Did you mean{" "}
              <button
                type="button"
                className="font-mono text-gw-primary underline decoration-gw-border-md hover:decoration-gw-primary transition-colors duration-150"
                onClick={() => onFieldFocused(fuzzyCandidate.field.key)}
              >
                {fuzzyCandidate.field.key}
              </button>
              ?
            </p>
          )}
        </LabeledField>

        {/* Label / Type / Group — only shown when creating a new field */}
        {!isExactMatch && !isDeprecatedMatch && (
          <>
            <LabeledField label="Label">
              <input
                type="text"
                className={FIELD_CONTROL_CLASS}
                value={label}
                onChange={(e) => {
                  setLabel(e.target.value);
                  setIsLabelEdited(true);
                }}
                placeholder="Display label"
                aria-label="field-label"
              />
            </LabeledField>

            <LabeledField label="Type">
              <select
                className={`${FIELD_CONTROL_CLASS} cursor-pointer`}
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
            </LabeledField>

            <LabeledField label="Group">
              <select
                className={`${FIELD_CONTROL_CLASS} cursor-pointer`}
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
            </LabeledField>
          </>
        )}

        {/* Red is reserved for position markers; a refusal is shown in the
            primary text colour at medium weight, as elsewhere. */}
        {error && (
          <p role="alert" className="text-gw-small font-medium text-gw-primary">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            {isDeprecatedMatch ? "Close" : "Cancel"}
          </Button>
          {!isDeprecatedMatch && (
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              disabled={isSubmitting || (!isExactMatch && !slug)}
            >
              {isSubmitting ? "Adding…" : isExactMatch ? "Go to field" : "Add"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
